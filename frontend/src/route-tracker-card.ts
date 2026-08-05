import { LitElement, html, css, PropertyValues, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant } from 'custom-card-helpers';
import * as L from 'leaflet';
import 'leaflet-polylinedecorator';
import leafletCss from 'leaflet/dist/leaflet.css?inline';
import './route-tracker-card-editor';
import { localize } from './localize';
import {
  getEligibleRouteEntities,
  getSelectedTrackersForPerson,
  isEligibleRouteEntity,
  toVirtualSensorId,
} from './tracker-eligibility';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface RoutePoint {
  loc: L.LatLng;
  timestamp: string;
}

interface ConfiguredRouteEntity {
  entity: string;
  name?: string;
}

function isConfiguredRouteEntity(value: unknown): value is ConfiguredRouteEntity {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const entity = value as Record<string, unknown>;
  return typeof entity.entity === 'string' &&
    (entity.name === undefined || typeof entity.name === 'string');
}

function getLocalDateString(date: Date, hass?: HomeAssistant): string {
  if (hass?.config?.time_zone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: hass.config.time_zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(date);
      
      const year = parts.find(p => p.type === 'year')?.value;
      const month = parts.find(p => p.type === 'month')?.value;
      const day = parts.find(p => p.type === 'day')?.value;
      
      if (year && month && day) {
        return `${year}-${month}-${day}`;
      }
    } catch (e) {
      // Fallback if timezone is invalid or unsupported
    }
  }

  // Fallback to browser local time
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

@customElement('route-tracker-card')
export class RouteTrackerCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ type: Object }) public config: any;

  public static async getConfigElement(): Promise<HTMLElement> {
    return document.createElement('route-tracker-card-editor');
  }

  public static getStubConfig(): Record<string, any> {
    return { type: 'custom:route-tracker-card' };
  }

  @state() private selectedDevice: string = '';
  @state() private selectedDate: string = getLocalDateString(new Date());
  @state() private devices: { entity_id: string; name: string }[] = [];

  private map?: L.Map;
  private routeLayer?: L.LayerGroup;
  private zoneLayer?: L.LayerGroup;
  private routeBounds: any = null;

  static styles = [
    unsafeCSS(leafletCss),
    css`
    :host {
      display: block;
      position: relative;
      width: 100%;
      height: 100%;
      min-height: 400px;
      border-radius: var(--ha-card-border-radius, 12px);
      overflow: hidden;
      box-shadow: var(--ha-card-box-shadow, 0px 2px 4px 0px rgba(0,0,0,0.16));
    }
    #map {
      width: 100%;
      height: 100%;
      z-index: 1;
    }
    #map.dark-mode {
      filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%);
    }
    #map.dark-mode .leaflet-control-attribution,
    #map.dark-mode .zone-label {
      filter: invert(100%) hue-rotate(180deg) brightness(105%) contrast(111%);
    }
    .control-panel {
      position: absolute;
      top: 16px;
      right: 16px;
      z-index: 1000;
      background: rgba(32, 33, 36, 0.9);
      backdrop-filter: blur(10px);
      border-radius: 12px;
      padding: 16px;
      color: #fff;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.1);
      width: 250px;
      font-family: var(--paper-font-body1_-_font-family, 'Roboto', sans-serif);
    }
    .control-panel h3 {
      margin: 0 0 16px 0;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #64b5f6;
    }
    .input-group {
      display: flex;
      flex-direction: column;
      margin-bottom: 12px;
    }
    .input-group label {
      font-size: 12px;
      margin-bottom: 4px;
      color: #aaa;
    }
    select, input[type="date"] {
      background: rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: white;
      padding: 8px;
      border-radius: 6px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.3s;
    }
    select:focus, input[type="date"]:focus {
      border-color: #64b5f6;
    }
  `];

  public setConfig(config: any): void {
    if (!config) {
      throw new Error('Invalid configuration');
    }
    this.config = config;
  }

  protected firstUpdated(): void {
    this.initMap();
    this.loadDevices();
    this.drawZones();
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);
    if (changedProps.has('selectedDevice') || changedProps.has('selectedDate')) {
      if (this.selectedDevice && this.selectedDate) {
        setTimeout(() => {
          this.map?.invalidateSize();
          this.fetchAndDrawRoute();
        }, 100);
      }
    }
  }

  private displayName(entityId: string, configuredName?: string): string {
    if (configuredName) {
      return configuredName;
    }

    const friendlyName = this.hass.states[entityId]?.attributes.friendly_name;
    return typeof friendlyName === 'string' ? friendlyName : entityId;
  }

  private loadDevices(): void {
    const configuredEntities: unknown = this.config.entities;
    const routeEntities = Array.isArray(configuredEntities) && configuredEntities.length > 0
      ? configuredEntities
        .filter(isConfiguredRouteEntity)
        .filter(entity => isEligibleRouteEntity(entity.entity, this.hass.states))
        .map(entity => ({
          entity_id: entity.entity,
          name: this.displayName(entity.entity, entity.name)
        }))
      : getEligibleRouteEntities(this.hass.states).map(({ entityId }) => ({
        entity_id: entityId,
        name: this.displayName(entityId)
      }));

    this.devices = routeEntities;
    if (!this.devices.some(device => device.entity_id === this.selectedDevice)) {
      this.selectedDevice = this.devices[0]?.entity_id || '';
    }
  }

  private initMap(): void {
    const mapContainer = this.shadowRoot?.getElementById('map') as HTMLElement;
    if (!mapContainer) return;

    const lat = this.hass.config.latitude || 50.0;
    const lon = this.hass.config.longitude || 30.0;

    this.map = L.map(mapContainer).setView([lat, lon], 13);
    L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(this.map);

    this.routeLayer = L.layerGroup().addTo(this.map);
    this.zoneLayer = L.layerGroup().addTo(this.map);

    const themeMode = this.config?.theme_mode || 'auto';
    const isDark = themeMode === 'dark' ||
      (themeMode === 'auto' && (this.hass.themes as any).darkMode);

    if (isDark) {
      mapContainer.classList.add('dark-mode');
    } else {
      mapContainer.classList.remove('dark-mode');
    }

    const ResetControl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: () => {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        const link = L.DomUtil.create('a', '', container);
        link.href = '#';
        link.title = 'Reset View';
        link.style.display = 'flex';
        link.style.justifyContent = 'center';
        link.style.alignItems = 'center';
        link.style.cursor = 'pointer';
        link.innerHTML = '<svg style="width:18px;height:18px;" viewBox="0 0 24 24"><path fill="currentColor" d="M12 9A3 3 0 0 0 9 12A3 3 0 0 0 12 15A3 3 0 0 0 15 12A3 3 0 0 0 12 9M19 19H15V21H19A2 2 0 0 0 21 19V15H19M19 3H15V5H19V9H21V5A2 2 0 0 0 19 3M5 5H9V3H5A2 2 0 0 0 3 5V9H5M5 15H3V19A2 2 0 0 0 5 21H9V19H5V15Z"/></svg>';
        
        link.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this.routeBounds) {
            this.map?.fitBounds(this.routeBounds);
          }
        };
        
        L.DomEvent.disableClickPropagation(container);
        
        return container;
      }
    });
    this.map.addControl(new ResetControl());
  }

  private drawZones(): void {
    if (!this.map || !this.zoneLayer) return;
    this.zoneLayer.clearLayers();

    const zoneEntities = (this.config.zones || [])
      .map((e: any) => ({
        entity_id: e.entity,
        name: e.name || this.hass.states[e.entity]?.attributes?.friendly_name || e.entity
      }));

    zoneEntities.forEach((z: any) => {
      const state = this.hass.states[z.entity_id];
      if (!state) return;

      const lat = state.attributes?.latitude;
      const lon = state.attributes?.longitude;
      const radius = state.attributes?.radius || 100;
      if (!lat || !lon) return;

      L.circle([lat, lon], {
        radius,
        color: '#42a5f5',
        fillColor: '#42a5f5',
        fillOpacity: 0.15,
        weight: 2,
        dashArray: '5, 8',
      }).addTo(this.zoneLayer!)
        .bindPopup(`<b>${z.name}</b>`);

      L.marker([lat, lon], {
        icon: L.divIcon({
          className: 'zone-label',
          html: `<span style="background:rgba(66,165,245,0.85);color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;white-space:nowrap;">${z.name}</span>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        })
      }).addTo(this.zoneLayer!);
    });
  }

  private resolveLocation(stateObj: any): [number, number] | null {
    if (!stateObj) return null;
    
    if (stateObj.attributes && 'latitude' in stateObj.attributes && 'longitude' in stateObj.attributes) {
      const lat = parseFloat(stateObj.attributes.latitude);
      const lon = parseFloat(stateObj.attributes.longitude);
      if (!isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0)) {
        return [lat, lon];
      }
    }
    
    if (stateObj.state && stateObj.state !== 'not_home' && stateObj.state !== 'unknown') {
      const zoneId = `zone.${stateObj.state.toLowerCase()}`;
      const zoneObj = this.hass.states[zoneId];
      if (zoneObj && zoneObj.attributes && 'latitude' in zoneObj.attributes && 'longitude' in zoneObj.attributes) {
        const lat = parseFloat(zoneObj.attributes.latitude);
        const lon = parseFloat(zoneObj.attributes.longitude);
        if (!isNaN(lat) && !isNaN(lon)) {
          return [lat, lon];
        }
      }
    }
    return null;
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }



  private async fetchAndDrawRoute() {
    if (!this.selectedDevice || !this.selectedDate) return;

    const start = new Date(this.selectedDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(this.selectedDate);
    end.setHours(23, 59, 59, 999);

    try {
      let sourceIds = [this.selectedDevice];
      const selectedState = this.hass.states[this.selectedDevice];

      if (this.selectedDevice.startsWith('person.')) {
        sourceIds = getSelectedTrackersForPerson(selectedState, this.hass.states);
      }

      const virtualIds = sourceIds.map(toVirtualSensorId);
      const allIds = [...sourceIds, ...virtualIds];

      const startStr = start.toISOString();
      const endStr = end.toISOString();
      const entityIdsStr = allIds.join(',');

      const result = await this.hass.callApi<any[][]>(
        'GET',
        `history/period/${startStr}?end_time=${endStr}&filter_entity_id=${entityIdsStr}&significant_changes_only=0`
      );

      let allHistory: any[] = [];
      if (Array.isArray(result)) {
        result.forEach(entityHistory => {
          if (Array.isArray(entityHistory)) {
            allHistory = allHistory.concat(entityHistory);
          }
        });
      }

      allHistory.sort((a, b) => new Date(a.last_updated).getTime() - new Date(b.last_updated).getTime());

      const points: RoutePoint[] = [];
      let lastLoc: [number, number] | null = null;
      const minDistance = this.config.minimal_distance !== undefined ? this.config.minimal_distance : 0.05;

      allHistory.forEach((state: any) => {
        const loc = this.resolveLocation(state);
        if (loc) {
          const timeStr = new Date(state.last_updated).toLocaleString();
          if (!lastLoc) {
            points.push({ loc: L.latLng(loc[0], loc[1]), timestamp: timeStr });
            lastLoc = loc;
          } else {
            const dist = this.calculateDistance(lastLoc[0], lastLoc[1], loc[0], loc[1]);
            
            if (dist > minDistance) {
              points.push({ loc: L.latLng(loc[0], loc[1]), timestamp: timeStr });
              lastLoc = loc;
            }
          }
        }
      });

      const currentState = this.hass.states[this.selectedDevice];
      const currentLoc = this.resolveLocation(currentState);
      if (currentLoc) {
        const timeStr = new Date(currentState.last_updated).toLocaleString();
        if (!lastLoc) {
          points.push({ loc: L.latLng(currentLoc[0], currentLoc[1]), timestamp: timeStr });
        } else {
          const dist = this.calculateDistance(lastLoc[0], lastLoc[1], currentLoc[0], currentLoc[1]);
          if (dist > minDistance) {
            points.push({ loc: L.latLng(currentLoc[0], currentLoc[1]), timestamp: timeStr });
          }
        }
      }

      this.drawRoute(points);
    } catch (err) {
      console.error('Failed to fetch route history', err);
    }
  }

  private drawRoute(points: RoutePoint[]) {
    if (!this.map || !this.routeLayer) return;
    this.routeLayer.clearLayers();

    if (points.length === 0) {
      const lat = this.hass.config.latitude || 50.0;
      const lon = this.hass.config.longitude || 30.0;
      this.map.setView([lat, lon], 20);
      return;
    }

    const themeMode = this.config?.theme_mode || 'auto';
    const isDark = themeMode === 'dark' ||
      (themeMode === 'auto' && (this.hass.themes as any).darkMode);

    const routeColor = isDark ? '#167A87' : '#00CCE6';
    const routeOpacity = isDark ? 0.9 : 0.6;
    const arrowColor = isDark ? '#0D4F58' : '#009fb9';
    const beadBorderColor = isDark ? '#01252a' : '#d1ebf7';
    const beadFillColor = isDark ? '#45929c' : '#5db4cb';

    if (points.length > 1) {
      const polyline = L.polyline(points.map(p => p.loc), { 
        color: routeColor, 
        weight: 6,
        opacity: routeOpacity 
      }).addTo(this.routeLayer);

      if ((window as any).L.polylineDecorator) {
        (window as any).L.polylineDecorator(polyline, {
          patterns: [
            {
              offset: 50,
              repeat: 150,
              symbol: (window as any).L.Symbol.arrowHead({
                pixelSize: 8,
                polygon: false,
                pathOptions: { stroke: true, color: arrowColor, weight: 2, opacity: 0.9 }
              })
            }
          ]
        }).addTo(this.routeLayer!);
      }
    }

    points.forEach((point, index) => {
      if (index === points.length - 1) {
        const currentIcon = L.divIcon({
          className: '',
          html: '<svg width="24" height="36" viewBox="0 0 24 36"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#ff5252"/><circle cx="12" cy="12" r="5" fill="#fff"/></svg>',
          iconSize: [24, 36],
          iconAnchor: [12, 36],
          popupAnchor: [0, -36]
        });
        L.marker(point.loc, { icon: currentIcon }).addTo(this.routeLayer!).bindPopup(`<b>${localize('card.current_location', this.hass.language)}</b><br>${point.timestamp}`);
      } else if (index === 0) {
        L.circleMarker(point.loc, {
          radius: 6,
          color: '#4caf50',
          fillColor: '#4caf50',
          fillOpacity: 1
        }).addTo(this.routeLayer!).bindPopup(`<b>${localize('card.start', this.hass.language)}</b><br>${point.timestamp}`);
      } else {
        const hitArea = L.circleMarker(point.loc, {
          radius: 12,
          color: 'transparent',
          fillColor: 'transparent',
          fillOpacity: 0,
          weight: 0,
          interactive: true
        }).addTo(this.routeLayer!).bindPopup(point.timestamp);

        L.circleMarker(point.loc, {
          radius: 3,
          color: beadBorderColor,
          fillColor: beadFillColor,
          fillOpacity: 1,
          weight: 1.5,
          interactive: false
        }).addTo(this.routeLayer!);

        hitArea.on('click', () => { hitArea.openPopup(); });
      }
    });

    if (points.length > 0) {
      this.routeBounds = L.latLngBounds(points.map(p => p.loc));
      this.map.fitBounds(this.routeBounds);
    }
  }

  private handleDeviceChange(e: Event) {
    this.selectedDevice = (e.target as HTMLSelectElement).value;
  }

  private handleDateChange(e: Event) {
    this.selectedDate = (e.target as HTMLInputElement).value;
  }

  render() {
    const lang = this.hass?.language || 'en';


    return html`
      <div id="map"></div>
      <div class="control-panel">
        <h3>${localize('card.map_control', lang)}</h3>
        
        <div class="input-group">
          <label>${localize('card.device', lang)}</label>
          <select @change=${this.handleDeviceChange} .value=${this.selectedDevice}>
            ${this.devices.map(d => html`<option value=${d.entity_id}>${d.name}</option>`)}
          </select>
        </div>

        <div class="input-group">
          <label>${localize('card.date', lang)}</label>
          <input 
            type="date" 
            .value=${this.selectedDate} 
            @change=${this.handleDateChange} 

            max=${getLocalDateString(new Date(), this.hass)}
          />
        </div>
      </div>
    `;
  }
}

(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: 'route-tracker-card',
  name: 'Route Tracker',
  description: 'Track device routes on a map',
});
