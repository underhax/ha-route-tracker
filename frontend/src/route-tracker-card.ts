import { LitElement, html, PropertyValues, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant } from 'custom-card-helpers';
import * as L from 'leaflet';
import 'leaflet-polylinedecorator';
import leafletCss from 'leaflet/dist/leaflet.css?inline';
import './route-tracker-card-editor';
import { localize } from './localize';
import { cardLayoutStyles } from './css/card-layout';
import { mapFiltersStyles } from './css/map-filters';
import { uiControlsStyles } from './css/ui-controls';
import { leafletOverridesStyles } from './css/leaflet-overrides';
import { popupStyles } from './css/popup';
import { popupRoutingStyles } from './css/popup-routing';

import {
  getEligibleRouteEntities,
  getSelectedTrackersForPerson,
  isEligibleRouteEntity,
  toVirtualSensorId,
} from './tracker-eligibility';

import { hamburgerSvg } from './icons/hamburger';

import { getBaseMaps } from './utils/map-providers';
import { createResetControl, createThemeControl } from './utils/map-controls';
import { RoutePoint, calculateDistance, drawRouteOnMap } from './utils/route-drawer';

interface ConfiguredRouteEntity {
  entity: string;
  name?: string;
}

function isConfiguredRouteEntity(value: unknown): value is ConfiguredRouteEntity {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const entity = value as Record<string, unknown>;
  return typeof entity['entity'] === 'string' &&
    (entity['name'] === undefined || typeof entity['name'] === 'string');
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
    } catch (e) {}
  }

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

  public getCardSize(): number {
    return 8;
  }

  @state() private selectedDevice: string = '';
  @state() private selectedDate: string = getLocalDateString(new Date());
  @state() private devices: { entity_id: string; name: string }[] = [];
  @state() private controlsOpen: boolean = false;
  @state() private _isSatellite: boolean = false;
  @state() private _currentProvider: string = 'OpenStreetMap DE';
  @state() private _manualTheme?: 'light' | 'dark';
  private _lastPoints: RoutePoint[] = [];
  private _lastIsDark: boolean | null = null;

  private map?: L.Map;
  private editModeObserver?: MutationObserver | undefined;
  private mapContainer?: HTMLElement;
  private mapResizeFrame?: number | undefined;
  private resizeObserver?: ResizeObserver | undefined;
  private routeLayer?: L.LayerGroup;
  private zoneLayer?: L.LayerGroup;
  private routeBounds: any = null;

  static override styles = [
    unsafeCSS(leafletCss),
    cardLayoutStyles,
    mapFiltersStyles,
    uiControlsStyles,
    leafletOverridesStyles,
    popupStyles,
    popupRoutingStyles
  ];

  public setConfig(config: any): void {
    if (!config) {
      throw new Error('Invalid configuration');
    }
    this.config = config;
  }

  public override connectedCallback(): void {
    super.connectedCallback();

    requestAnimationFrame(() => {
      this.updatePanelEditModeClass();
      this.startObservingPanelEditMode();
    });

    this.startObservingMapSize();
  }

  public override disconnectedCallback(): void {
    this.editModeObserver?.disconnect();
    this.editModeObserver = undefined;
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    if (this.mapResizeFrame !== undefined) {
      cancelAnimationFrame(this.mapResizeFrame);
      this.mapResizeFrame = undefined;
    }
    super.disconnectedCallback();
  }

  protected override firstUpdated(): void {
    this.initMap();
    this.loadDevices();
    this.drawZones();
  }

  protected override updated(changedProps: PropertyValues): void {
    super.updated(changedProps);

    if (changedProps.has('hass') || changedProps.has('config')) {
      const newIsDark = this.isDarkMode;
      if (this._lastIsDark !== newIsDark) {
        this._lastIsDark = newIsDark;
        this.updateMapThemeClass();
        if (this._lastPoints && this._lastPoints.length > 0) {
          this.drawRoute(this._lastPoints);
        }
      }
    }

    if (changedProps.has('selectedDevice') || changedProps.has('selectedDate')) {
      if (this.selectedDevice && this.selectedDate) {
        setTimeout(() => {
          this.map?.invalidateSize();
          this.fetchAndDrawRoute();
        }, 100);
      }
    }
  }

  private getComposedAncestors(): Element[] {
    const ancestors: Element[] = [];
    let currentElement: Element | null = this;

    while (currentElement) {
      ancestors.push(currentElement);
      const root = currentElement.getRootNode();
      currentElement = currentElement.parentElement ?? (
        root instanceof ShadowRoot ? root.host : null
      );
    }

    return ancestors;
  }

  private updatePanelEditModeClass(): void {
    const ancestors = this.getComposedAncestors();
    const isEditMode = ancestors.some(element =>
      element.classList.contains('edit-mode')
    );
    const isPanel = ancestors.some(element =>
      (element.matches && element.matches('hui-card-options.panel')) ||
      element.tagName === 'HUI-PANEL-VIEW'
    );

    this.classList.toggle('is-editing-panel', isEditMode && isPanel);
  }

  private startObservingPanelEditMode(): void {
    this.editModeObserver?.disconnect();
    this.editModeObserver = new MutationObserver(() => {
      this.updatePanelEditModeClass();
    });

    for (const ancestor of this.getComposedAncestors()) {
      this.editModeObserver.observe(ancestor, {
        attributes: true,
        attributeFilter: ['class'],
      });
    }
  }

  private startObservingMapSize(): void {
    if (!this.mapContainer || this.resizeObserver) {
      return;
    }

    this.resizeObserver = new ResizeObserver(() => {
      this.updatePanelEditModeClass();
      if (this.mapResizeFrame !== undefined) {
        return;
      }

      this.mapResizeFrame = requestAnimationFrame(() => {
        this.mapResizeFrame = undefined;
        this.map?.invalidateSize();
      });
    });
    this.resizeObserver.observe(this.mapContainer);
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
    const mapContainer = this.shadowRoot?.getElementById('map');
    if (!(mapContainer instanceof HTMLElement)) {
      return;
    }

    this.mapContainer = mapContainer;
    this.startObservingMapSize();

    const lat = this.hass.config.latitude || 0.0;
    const lon = this.hass.config.longitude || 0.0;
    const currentLang = this.hass?.language || 'en';

    this.map = L.map(mapContainer, {
      zoomControl: false
    }).setView([lat, lon], 19);

    L.control.zoom({
      zoomInTitle: localize('card.zoom_in', currentLang),
      zoomOutTitle: localize('card.zoom_out', currentLang)
    }).addTo(this.map);

    const attributionControl = this.map.attributionControl;
    if (attributionControl) {
      const attrContainer = attributionControl.getContainer();
      if (attrContainer && mapContainer.parentElement) {
        attrContainer.classList.add('attribution-outside');
        mapContainer.parentElement.appendChild(attrContainer);
      }
    }

    const baseMaps = getBaseMaps();

    const providerKey = this.config?.map_provider || 'osm_default';
    let defaultLayer = baseMaps['OpenStreetMap DE'];
    this._currentProvider = 'OpenStreetMap DE';

    if (providerKey === 'carto_voyager') {
      defaultLayer = baseMaps['CartoDB Voyager'];
      this._currentProvider = 'CartoDB Voyager';
    }
    if (providerKey === 'esri_satellite') {
      defaultLayer = baseMaps['Esri Satellite'];
      this._currentProvider = 'Esri Satellite';
      this._isSatellite = true;
    }

    if (defaultLayer) {
      defaultLayer.addTo(this.map);
    }
    const providerControl = L.control.layers(baseMaps, undefined, { position: 'bottomleft' }).addTo(this.map);
    const providerContainer = providerControl.getContainer();
    if (providerContainer && this.mapContainer && this.mapContainer.parentElement) {
      providerContainer.classList.add('provider-selector');
      this.mapContainer.parentElement.appendChild(providerContainer);
    }

    this.map.on('baselayerchange', (e: any) => {
      this._currentProvider = e.name;
      this._isSatellite = (e.name === 'Esri Satellite');
      this.updateMapThemeClass();
      if (this._lastPoints && this._lastPoints.length > 0) {
        this.drawRoute(this._lastPoints);
      }
    });

    this.routeLayer = L.layerGroup().addTo(this.map);
    this.zoneLayer = L.layerGroup().addTo(this.map);

    this._lastIsDark = this.isDarkMode;
    this.updateMapThemeClass();

    const resetControl = createResetControl(
      localize,
      currentLang,
      () => {
        if (this.routeBounds) {
          this.map?.fitBounds(this.routeBounds);
        }
      }
    );

    this.map.addControl(resetControl);

    const themeControl = createThemeControl(
      localize,
      currentLang,
      () => this._isSatellite,
      () => this.isDarkMode,
      () => this.toggleManualTheme()
    );

    this.map.addControl(themeControl);
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

      const lat = state.attributes?.['latitude'];
      const lon = state.attributes?.['longitude'];
      const radius = state.attributes?.['radius'] || 100;
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
        const lat = parseFloat(zoneObj.attributes['latitude']);
        const lon = parseFloat(zoneObj.attributes['longitude']);
        if (!isNaN(lat) && !isNaN(lon)) {
          return [lat, lon];
        }
      }
    }
    return null;
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

      const virtualIds = sourceIds.map(toVirtualSensorId).filter(id => id && this.hass.states[id] !== undefined);
      const queryIds = virtualIds.length > 0 ? virtualIds : sourceIds;

      const startStr = start.toISOString();
      const endStr = end.toISOString();
      const entityIdsStr = queryIds.join(',');

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
          const point: RoutePoint = {
            loc: L.latLng(loc[0], loc[1]),
            timestamp: timeStr,
            source_type: state.attributes?.['source_type'],
            gps_accuracy: state.attributes?.['gps_accuracy'],
            altitude: state.attributes?.['altitude'],
            speed: state.attributes?.['speed']
          };
          if (!lastLoc) {
            points.push(point);
            lastLoc = loc;
          } else {
            const dist = calculateDistance(lastLoc[0], lastLoc[1], loc[0], loc[1]);

            if (dist > minDistance) {
              points.push(point);
              lastLoc = loc;
            }
          }
        }
      });

      const virtualSensorId = toVirtualSensorId(this.selectedDevice);
      let currentState = this.hass.states[this.selectedDevice];

      if (virtualSensorId && this.hass.states[virtualSensorId]) {
        currentState = this.hass.states[virtualSensorId];
      } else if (this.selectedDevice.startsWith('person.')) {
        const firstQueryId = queryIds[0];
        if (firstQueryId && firstQueryId.startsWith('sensor.virtual_device_tracker_')) {
          currentState = this.hass.states[firstQueryId];
        }
      }

      const currentLoc = this.resolveLocation(currentState);
      if (currentState && currentLoc) {
        const timeStr = new Date(currentState.last_updated).toLocaleString();
        const point: RoutePoint = {
          loc: L.latLng(currentLoc[0], currentLoc[1]),
          timestamp: timeStr,
          source_type: currentState.attributes?.['source_type'],
          gps_accuracy: currentState.attributes?.['gps_accuracy'],
          altitude: currentState.attributes?.['altitude'],
          speed: currentState.attributes?.['speed']
        };
        if (!lastLoc) {
          points.push(point);
        } else {
          const dist = calculateDistance(lastLoc[0], lastLoc[1], currentLoc[0], currentLoc[1]);
          if (dist > minDistance) {
            points.push(point);
          }
        }
      }

      this.drawRoute(points);
    } catch {
    }
  }

  private drawRoute(points: RoutePoint[]) {
    this._lastPoints = points;
    if (!this.map || !this.routeLayer) return;

    const bounds = drawRouteOnMap({
      points,
      map: this.map,
      routeLayer: this.routeLayer,
      isSatellite: this._isSatellite,
      isDarkMode: this.isDarkMode,
      currentProvider: this._currentProvider,
      localize,
      language: this.hass.language,
      fallbackLat: this.hass.config.latitude || 0.0,
      fallbackLon: this.hass.config.longitude || 0.0,
      routingProvider: this.config?.routing_provider || 'osm',
      enableGeocoding: this.config?.enable_geocoding || false,
      enableRouting: this.config?.enable_routing || false,
      routeOrigin: this.config?.route_origin || 'device',
      hass: this.hass
    });

    if (bounds) {
      this.routeBounds = bounds;
    }
  }

  private handleDeviceChange(e: Event) {
    this.selectedDevice = (e.target as HTMLSelectElement).value;
  }

  private handleDateChange(e: Event) {
    this.selectedDate = (e.target as HTMLInputElement).value;
  }

  private openControls(): void {
    this.controlsOpen = true;
  }

  private closeControls(): void {
    this.controlsOpen = false;
  }

  private get isDarkMode(): boolean {
    if (this._manualTheme !== undefined) return this._manualTheme === 'dark';
    const themeMode = this.config?.theme_mode || 'auto';
    if (themeMode === 'dark') return true;
    if (themeMode === 'light') return false;
    return (this.hass.themes as any).darkMode;
  }

  private updateMapThemeClass(): void {
    if (!this.mapContainer) return;

    this.mapContainer.classList.toggle('carto-provider', this._currentProvider === 'CartoDB Voyager');

    if (this._currentProvider === 'Esri Satellite') {
      this.mapContainer.classList.remove('dark-mode');
    } else {
      if (this.isDarkMode) {
        this.mapContainer.classList.add('dark-mode');
      } else {
        this.mapContainer.classList.remove('dark-mode');
      }
    }
    const controls = this.mapContainer.querySelectorAll('.leaflet-control');
    controls.forEach((c: any) => {
      if (typeof c.updateThemeIcon === 'function') {
        c.updateThemeIcon();
      }
    });
  }

  private toggleManualTheme(): void {
    this._manualTheme = this.isDarkMode ? 'light' : 'dark';
    this.updateMapThemeClass();
    if (this._lastPoints && this._lastPoints.length > 0) {
      this.drawRoute(this._lastPoints);
    }
  }

  protected override render() {
    const lang = this.hass?.language || 'en';
    const controlPanelClass = this.controlsOpen
      ? 'control-panel is-open'
      : 'control-panel';

    return html`
      <div class="card-content">
        <div id="map"></div>
        ${this.controlsOpen
          ? ''
          : html`
              <button
                class="controls-toggle"
                type="button"
                aria-label=${localize('card.open_controls', lang)}
                aria-expanded="false"
                @click=${this.openControls}
              >
                ${hamburgerSvg}
              </button>
            `}
        <div class=${controlPanelClass}>
          <div class="control-panel-header">
            <h3>${localize('card.map_control', lang)}</h3>
            <button
              class="control-panel-close"
              type="button"
              aria-label=${localize('card.close_controls', lang)}
              @click=${this.closeControls}
            >
              ×
            </button>
          </div>

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
