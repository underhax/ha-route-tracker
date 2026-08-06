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
  @state() private _manualTheme?: 'light' | 'dark';
  private _lastPoints: RoutePoint[] = [];
  private _lastIsDark: boolean | null = null;

  private map?: L.Map;
  private editModeObserver?: MutationObserver;
  private mapContainer?: HTMLElement;
  private mapResizeFrame?: number;
  private resizeObserver?: ResizeObserver;
  private routeLayer?: L.LayerGroup;
  private zoneLayer?: L.LayerGroup;
  private routeBounds: any = null;

  static styles = [
    unsafeCSS(leafletCss),
    css`
    :host {
      --route-tracker-header-height: 56px;
      --route-tracker-edit-header-height: 114px;
      --route-tracker-edit-panel-height: 65px;
      --route-tracker-standard-available-height: calc(
        100dvh - var(--route-tracker-header-height)
      );
      --route-tracker-edit-available-height: calc(
        100dvh
        - var(--route-tracker-edit-header-height)
        - var(--route-tracker-edit-panel-height)
      );

      display: block;
      position: relative;
      width: 100%;
      min-width: 0;
      height: 100%;
      min-height: 400px;
      max-height: var(--route-tracker-standard-available-height);
      aspect-ratio: 16 / 9;
      border-radius: var(--ha-card-border-radius, 12px);
      overflow: hidden;
      box-shadow: var(--ha-card-box-shadow, 0px 2px 4px 0px rgba(0,0,0,0.16));
    }
    :host(.is-editing-panel) {
      min-height: 0;
      max-height: var(--route-tracker-edit-available-height);
    }
    .card-content {
      position: absolute;
      inset: 0;
      container-type: inline-size;
    }
    #map {
      position: absolute;
      inset: 0;
      z-index: 1;
    }
    #map.dark-mode {
      filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%);
    }
    #map.dark-mode .leaflet-control-attribution,
    #map.dark-mode .zone-label,
    #map.dark-mode .leaflet-control-layers,
    #map.dark-mode .leaflet-bar {
      filter: invert(100%) hue-rotate(180deg) brightness(105%) contrast(111%);
    }
    .control-panel {
      position: absolute;
      top: 16px;
      right: 16px;
      z-index: 3;
      box-sizing: border-box;
      width: 284px;
      background: rgba(32, 33, 36, 0.9);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 16px;
      color: #fff;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
      font-family: var(--paper-font-body1_-_font-family, 'Roboto', sans-serif);
    }
    .control-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .control-panel h3 {
      margin: 0;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #64b5f6;
    }
    .control-panel-close,
    .controls-toggle {
      display: none;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: 8px;
      color: #fff;
      cursor: pointer;
      font: inherit;
    }
    .control-panel-close {
      width: 32px;
      height: 32px;
      margin: -4px -4px -4px 8px;
      background: transparent;
      font-size: 28px;
      line-height: 1;
    }
    .controls-toggle {
      position: absolute;
      top: 16px;
      right: 16px;
      z-index: 3;
      width: 44px;
      height: 44px;
      background: rgba(32, 33, 36, 0.9);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
      font-size: 24px;
    }
    .control-panel-close:focus-visible,
    .controls-toggle:focus-visible {
      outline: 2px solid #64b5f6;
      outline-offset: 2px;
    }
    @container (max-width: 640px) {
      .controls-toggle {
        display: flex;
      }
      .control-panel {
        display: none;
        width: min(284px, calc(100% - 32px));
      }
      .control-panel.is-open {
        display: block;
      }
      .control-panel-close {
        display: flex;
      }
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

    .leaflet-control-layers {
      background: rgba(32, 33, 36, 0.9) !important;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1) !important;
      border-radius: 12px !important;
      color: #fff !important;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2) !important;
      padding: 6px !important;
    }
    .leaflet-control-layers-toggle {
      width: 44px !important;
      height: 44px !important;
    }
    .leaflet-control-layers-expanded {
      padding: 8px !important;
    }
    .leaflet-control-layers-list {
      margin: 0 !important;
      padding: 0 !important;
    }
    .leaflet-control-layers label {
      display: flex !important;
      align-items: center !important;
      padding: 10px 12px !important;
      margin: 2px 0 !important;
      cursor: pointer !important;
      border-radius: 8px !important;
      transition: background 0.2s !important;
    }
    .leaflet-control-layers label:hover {
      background: rgba(255, 255, 255, 0.1) !important;
    }
    .leaflet-control-layers input[type="radio"] {
      margin: 0 12px 0 0 !important;
      accent-color: #64b5f6 !important;
      width: 18px !important;
      height: 18px !important;
      cursor: pointer !important;
    }
    .leaflet-control-layers span {
      font-family: var(--paper-font-body1_-_font-family, 'Roboto', sans-serif) !important;
      font-size: 14px !important;
      line-height: 1 !important;
    }
    .leaflet-control-layers-separator {
      display: none !important;
    }

    .leaflet-bar a {
      background-color: #f7f7f7 !important;
      color: #222324 !important;
    }
    .leaflet-bar a:hover {
      background-color: #e6e6e6 !important;
      color: #000 !important;
    }
    .leaflet-bar a.leaflet-disabled,
    .leaflet-bar a.leaflet-disabled:hover {
      background-color: #f7f7f7 !important;
      color: #bbb !important;
      cursor: default !important;
    }
  `];

  public setConfig(config: any): void {
    if (!config) {
      throw new Error('Invalid configuration');
    }
    this.config = config;
  }

  public connectedCallback(): void {
    super.connectedCallback();

    requestAnimationFrame(() => {
      this.updatePanelEditModeClass();
      this.startObservingPanelEditMode();
    });

    this.startObservingMapSize();
  }

  public disconnectedCallback(): void {
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

  protected firstUpdated(): void {
    this.initMap();
    this.loadDevices();
    this.drawZones();
  }

  protected updated(changedProps: PropertyValues): void {
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

    const lat = this.hass.config.latitude || 50.0;
    const lon = this.hass.config.longitude || 30.0;

    this.map = L.map(mapContainer).setView([lat, lon], 13);

    const baseMaps: Record<string, L.TileLayer> = {
      'OpenStreetMap DE': L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }),
      'CartoDB Voyager': L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19
      }),
      'Esri Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri',
        maxZoom: 19
      })
    };

    const providerKey = this.config?.map_provider || 'osm_default';
    let defaultLayer = baseMaps['OpenStreetMap DE'];

    if (providerKey === 'carto_voyager') defaultLayer = baseMaps['CartoDB Voyager'];
    if (providerKey === 'esri_satellite') {
      defaultLayer = baseMaps['Esri Satellite'];
      this._isSatellite = true;
    }

    defaultLayer.addTo(this.map);
    L.control.layers(baseMaps, undefined, { position: 'bottomleft' }).addTo(this.map);

    this.map.on('baselayerchange', (e: any) => {
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
        link.innerHTML = '<svg style="width:20px;height:20px;" viewBox="0 0 24 24"><path fill="currentColor" d="M12 9A3 3 0 0 0 9 12A3 3 0 0 0 12 15A3 3 0 0 0 15 12A3 3 0 0 0 12 9M19 19H15V21H19A2 2 0 0 0 21 19V15H19M19 3H15V5H19V9H21V5A2 2 0 0 0 19 3M5 5H9V3H5A2 2 0 0 0 3 5V9H5M5 15H3V19A2 2 0 0 0 5 21H9V19H5V15Z"/></svg>';

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

    const ThemeControl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: () => {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        const link = L.DomUtil.create('a', '', container);
        link.href = '#';
        link.title = 'Toggle Theme';
        link.style.display = 'flex';
        link.style.justifyContent = 'center';
        link.style.alignItems = 'center';
        link.style.cursor = 'pointer';

        const updateIcon = () => {
          if (this._isSatellite) {
            container.style.display = 'none';
          } else {
            container.style.display = 'block';
            link.innerHTML = this.isDarkMode 
            ? '<svg style="width:20px;height:20px;" viewBox="0 0 24 24"><path fill="currentColor" transform="translate(2.5, 0)" d="M9.37,5.51C9.19,6.15 9.1,6.82 9.1,7.5C9.1,10.81 11.79,13.5 15.1,13.5C15.78,13.5 16.45,13.41 17.09,13.23C16.8,17.08 13.58,20 9.6,20C5.4,20 2,16.6 2,12.4C2,8.42 4.92,5.2 8.77,4.91C8.95,5.1 9.15,5.3 9.37,5.51Z"/></svg>' 
            : '<svg style="width:20px;height:20px;" viewBox="0 0 24 24"><path fill="currentColor" d="M12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,2L14.39,5.42C13.65,5.15 12.84,5 12,5C11.16,5 10.35,5.15 9.61,5.42L12,2M3.34,7L7.5,6.65C6.9,7.16 6.36,7.78 5.94,8.5C5.5,9.24 5.25,10 5.11,10.79L3.34,7M3.36,17L5.12,13.23C5.26,14 5.53,14.78 5.95,15.5C6.37,16.24 6.91,16.86 7.5,17.37L3.36,17M20.65,7L18.88,10.79C18.74,10 18.47,9.23 18.05,8.5C17.63,7.78 17.1,7.15 16.5,6.64L20.65,7M20.64,17L16.5,17.36C17.09,16.85 17.62,16.22 18.04,15.5C18.46,14.77 18.73,14 18.87,13.21L20.64,17M12,22L9.59,18.56C10.33,18.83 11.14,19 12,19C12.82,19 13.63,18.83 14.37,18.56L12,22Z"/></svg>';
          }
        };
        updateIcon();
        (container as any).updateThemeIcon = updateIcon;

        link.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this._isSatellite) return;
          this.toggleManualTheme();
        };

        L.DomEvent.disableClickPropagation(container);
        return container;
      }
    });
    this.map.addControl(new ThemeControl());
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
    } catch {
    }
  }

  private drawRoute(points: RoutePoint[]) {
    this._lastPoints = points;
    if (!this.map || !this.routeLayer) return;
    this.routeLayer.clearLayers();

    if (points.length === 0) {
      const lat = this.hass.config.latitude || 50.0;
      const lon = this.hass.config.longitude || 30.0;
      this.map.setView([lat, lon], 20);
      return;
    }

    const isDark = this.isDarkMode && !this._isSatellite;

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
    if (this.mapContainer) {
      if (this.isDarkMode && !this._isSatellite) {
        this.mapContainer.classList.add('dark-mode');
      } else {
        this.mapContainer.classList.remove('dark-mode');
      }
      const controls = this.mapContainer.querySelectorAll('.leaflet-control');
      controls.forEach((c: any) => {
        if (typeof c.updateThemeIcon === 'function') {
          c.updateThemeIcon();
        }
      });
    }
  }

  private toggleManualTheme(): void {
    this._manualTheme = this.isDarkMode ? 'light' : 'dark';
    this.updateMapThemeClass();
    if (this._lastPoints && this._lastPoints.length > 0) {
      this.drawRoute(this._lastPoints);
    }
  }

  render() {
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
                ☰
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
