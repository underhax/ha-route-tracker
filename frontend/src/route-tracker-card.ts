import type { HomeAssistant } from 'custom-card-helpers';
import * as L from 'leaflet';
import { html, LitElement, type PropertyValues, type TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import 'leaflet-polylinedecorator';
import leafletCss from 'leaflet/dist/leaflet.css?inline';
import './route-tracker-card-editor.ts';
import { cardLayoutStyles } from './css/card-layout.ts';
import { leafletOverridesStyles } from './css/leaflet-overrides.ts';
import { mapFiltersStyles } from './css/map-filters.ts';
import { popupStyles } from './css/popup.ts';
import { popupRoutingStyles } from './css/popup-routing.ts';
import { uiControlsStyles } from './css/ui-controls.ts';
import { hamburgerSvg } from './icons/hamburger.ts';
import { localize } from './localize.ts';
import {
  getEligibleRouteEntities,
  getSelectedTrackersForPerson,
  isEligibleRouteEntity,
  type RouteTrackerEntityAttributes,
  toVirtualSensorId,
} from './tracker-eligibility.ts';
import { createResetControl, createThemeControl } from './utils/map-controls.ts';
import { getBaseMaps } from './utils/map-providers.ts';
import { calculateDistance, drawRouteOnMap, type RoutePoint } from './utils/route-drawer.ts';

interface ConfiguredRouteEntity {
  entity: string;
  name?: string;
}

interface CardConfig {
  entities?: ConfiguredRouteEntity[];
  zones?: Array<{ entity: string; name?: string }>;
  map_provider?: string;
  theme_mode?: string;
  minimal_distance?: number;
  enable_geocoding?: boolean;
  enable_routing?: boolean;
  route_origin?: string;
  routing_provider?: string;
  [key: string]: unknown;
}

interface HistoryState {
  state: string;
  last_updated: string;
  attributes: RouteTrackerEntityAttributes;
}

function isConfiguredRouteEntity(value: unknown): value is ConfiguredRouteEntity {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const entity = value as { entity?: unknown; name?: unknown };
  return (
    typeof entity.entity === 'string' &&
    (entity.name === undefined || typeof entity.name === 'string')
  );
}

function getLocalDateString(date: Date, hass?: HomeAssistant): string {
  if (hass?.config?.time_zone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        day: '2-digit',
        month: '2-digit',
        timeZone: hass.config.time_zone,
        year: 'numeric',
      }).formatToParts(date);

      const year = parts.find((p) => p.type === 'year')?.value;
      const month = parts.find((p) => p.type === 'month')?.value;
      const day = parts.find((p) => p.type === 'day')?.value;

      if (year && month && day) {
        return `${year}-${month}-${day}`;
      }
    } catch {}
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

@customElement('route-tracker-card')
export class RouteTrackerCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ type: Object }) public config: CardConfig = {} as CardConfig;

  public static async getConfigElement(): Promise<HTMLElement> {
    return document.createElement('route-tracker-card-editor');
  }

  public static getStubConfig(): Record<string, unknown> {
    return { type: 'custom:route-tracker-card' };
  }

  private readonly _cardSize = 8;

  public getCardSize(): number {
    return this._cardSize;
  }

  @state() private selectedDevice: string = '';
  @state() private selectedDate: string = getLocalDateString(new Date());
  @state() private devices: { entity_id: string; name: string }[] = [];
  @state() private controlsOpen: boolean = false;
  @state() private _isSatellite: boolean = false;
  @state() private _currentProvider: string = 'OpenStreetMap DE';
  @state() private _manualTheme?: 'light' | 'dark';
  private _lastPoints?: RoutePoint[];
  private _lastIsDark: boolean | null = null;

  private map?: L.Map;
  private editModeObserver?: MutationObserver | undefined;
  private mapContainer?: HTMLElement;
  private mapResizeFrame?: number | undefined;
  private resizeObserver?: ResizeObserver | undefined;
  private routeLayer?: L.LayerGroup;
  private zoneLayer?: L.LayerGroup;
  private routeBounds: L.LatLngBounds | null = null;

  static override styles = [
    unsafeCSS(leafletCss),
    cardLayoutStyles,
    mapFiltersStyles,
    uiControlsStyles,
    leafletOverridesStyles,
    popupStyles,
    popupRoutingStyles,
  ];

  public setConfig(config: CardConfig): void {
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
        if (this._lastPoints?.length) {
          this.drawRoute(this._lastPoints);
        }
      }
    }

    if (changedProps.has('selectedDevice') || changedProps.has('selectedDate')) {
      if (this.selectedDevice && this.selectedDate) {
        setTimeout(() => {
          this.map?.invalidateSize();
          void this.fetchAndDrawRoute();
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
      currentElement =
        currentElement.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
    }

    return ancestors;
  }

  private updatePanelEditModeClass(): void {
    const ancestors = this.getComposedAncestors();
    const isEditMode = ancestors.some((element) => element.classList.contains('edit-mode'));
    const isPanel = ancestors.some(
      (element) =>
        element.matches?.('hui-card-options.panel') || element.tagName === 'HUI-PANEL-VIEW',
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
        attributeFilter: ['class'],
        attributes: true,
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
    const routeEntities =
      Array.isArray(configuredEntities) && configuredEntities.length > 0
        ? configuredEntities
            .filter(isConfiguredRouteEntity)
            .filter((entity) => isEligibleRouteEntity(entity.entity, this.hass.states))
            .map((entity) => ({
              entity_id: entity.entity,
              name: this.displayName(entity.entity, entity.name),
            }))
        : getEligibleRouteEntities(this.hass.states).map(({ entityId }) => ({
            entity_id: entityId,
            name: this.displayName(entityId),
          }));

    this.devices = routeEntities;
    if (!this.devices.some((device) => device.entity_id === this.selectedDevice)) {
      this.selectedDevice = this.devices[0]?.entity_id ?? '';
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
    const currentLang = this.hass.language || 'en';

    this.map = L.map(mapContainer, {
      zoomControl: false,
    }).setView([lat, lon], 19);

    L.control
      .zoom({
        zoomInTitle: localize('card.zoom_in', currentLang),
        zoomOutTitle: localize('card.zoom_out', currentLang),
      })
      .addTo(this.map);

    const attributionControl = this.map.attributionControl;
    if (attributionControl) {
      const attrContainer = attributionControl.getContainer();
      if (attrContainer && mapContainer.parentElement) {
        attrContainer.classList.add('attribution-outside');
        mapContainer.parentElement.appendChild(attrContainer);
      }
    }

    const baseMaps = getBaseMaps();

    const providerKey = this.config.map_provider ?? 'osm_default';
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
    const providerControl = L.control
      .layers(baseMaps, undefined, { position: 'bottomleft' })
      .addTo(this.map);
    const providerContainer = providerControl.getContainer();
    if (providerContainer && this.mapContainer?.parentElement) {
      providerContainer.classList.add('provider-selector');
      this.mapContainer.parentElement.appendChild(providerContainer);
    }

    this.map.on('baselayerchange', (e) => {
      this._currentProvider = e.name;
      this._isSatellite = e.name === 'Esri Satellite';
      this.updateMapThemeClass();
      if (this._lastPoints?.length) {
        this.drawRoute(this._lastPoints);
      }
    });

    this.routeLayer = L.layerGroup().addTo(this.map);
    this.zoneLayer = L.layerGroup().addTo(this.map);

    this._lastIsDark = this.isDarkMode;
    this.updateMapThemeClass();

    const resetControl = createResetControl(localize, currentLang, () => {
      if (this.routeBounds) {
        this.map?.fitBounds(this.routeBounds);
      }
    });

    this.map.addControl(resetControl);

    const themeControl = createThemeControl(
      localize,
      currentLang,
      () => this._isSatellite,
      () => this.isDarkMode,
      () => this.toggleManualTheme(),
    );

    this.map.addControl(themeControl);
  }

  private drawZones(): void {
    if (!this.map || !this.zoneLayer) return;
    const zoneLayer = this.zoneLayer;
    zoneLayer.clearLayers();

    const zoneEntities = (this.config.zones ?? []).map((e) => ({
      entity_id: e.entity,
      name: e.name || this.hass.states[e.entity]?.attributes?.friendly_name || e.entity,
    }));

    zoneEntities.forEach((z) => {
      const state = this.hass.states[z.entity_id];
      if (!state) return;

      const attrs = state.attributes as RouteTrackerEntityAttributes;
      const lat = attrs.latitude;
      const lon = attrs.longitude;
      const radius = attrs.radius ?? 100;
      if (!lat || !lon) return;

      L.circle([lat, lon], {
        color: '#42a5f5',
        dashArray: '5, 8',
        fillColor: '#42a5f5',
        fillOpacity: 0.15,
        radius,
        weight: 2,
      })
        .addTo(zoneLayer)
        .bindPopup(`<b>${z.name}</b>`);

      L.marker([lat, lon], {
        icon: L.divIcon({
          className: 'zone-label',
          html: `<span style="background:rgba(66,165,245,0.85);color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;white-space:nowrap;">${z.name}</span>`,
          iconAnchor: [0, 0],
          iconSize: [0, 0],
        }),
      }).addTo(zoneLayer);
    });
  }

  private resolveLocation(
    stateObj:
      | { state?: string; attributes?: Record<string, unknown>; last_updated?: string }
      | undefined,
  ): [number, number] | null {
    if (!stateObj) return null;

    const direct = RouteTrackerCard.tryParseCoordinates(stateObj.attributes);
    if (direct) return direct;

    if (stateObj.state && stateObj.state !== 'not_home' && stateObj.state !== 'unknown') {
      const zoneId = `zone.${stateObj.state.toLowerCase()}`;
      const zoneObj = this.hass.states[zoneId];
      if (zoneObj) {
        const zoneAttrs = zoneObj.attributes as RouteTrackerEntityAttributes;
        if (zoneAttrs.latitude != null && zoneAttrs.longitude != null) {
          const lat = parseFloat(String(zoneAttrs.latitude));
          const lon = parseFloat(String(zoneAttrs.longitude));
          if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
            return [lat, lon];
          }
        }
      }
    }
    return null;
  }

  private static tryParseCoordinates(
    attributes: RouteTrackerEntityAttributes | undefined,
  ): [number, number] | null {
    if (!attributes || !('latitude' in attributes) || !('longitude' in attributes)) return null;
    const lat = parseFloat(String(attributes.latitude));
    const lon = parseFloat(String(attributes.longitude));
    if (Number.isNaN(lat) || Number.isNaN(lon) || (lat === 0 && lon === 0)) return null;
    return [lat, lon];
  }

  private async fetchAndDrawRoute(): Promise<void> {
    if (!this.selectedDevice || !this.selectedDate) return;

    const start = new Date(this.selectedDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(this.selectedDate);
    end.setHours(23, 59, 59, 999);

    try {
      const queryIds = this.resolveQueryIds();
      const allHistory = await this.fetchHistory(start, end, queryIds);
      const points = this.buildRoutePoints(allHistory);
      const currentState = this.resolveCurrentState(queryIds);
      this.appendCurrentPoint(points, currentState);

      this.drawRoute(points);
    } catch {}
  }

  private resolveQueryIds(): string[] {
    let sourceIds = [this.selectedDevice];

    if (this.selectedDevice.startsWith('person.')) {
      const selectedState = this.hass.states[this.selectedDevice];
      sourceIds = getSelectedTrackersForPerson(selectedState, this.hass.states);
    }

    const virtualIds = sourceIds
      .map(toVirtualSensorId)
      .filter((id) => id && this.hass.states[id] !== undefined);
    return virtualIds.length > 0 ? virtualIds : sourceIds;
  }

  private async fetchHistory(start: Date, end: Date, queryIds: string[]): Promise<HistoryState[]> {
    const startStr = start.toISOString();
    const endStr = end.toISOString();
    const entityIdsStr = queryIds.join(',');

    const result = await this.hass.callApi<HistoryState[][]>(
      'GET',
      `history/period/${startStr}?end_time=${endStr}&filter_entity_id=${entityIdsStr}&significant_changes_only=0`,
    );

    const allHistory: HistoryState[] = [];
    if (Array.isArray(result)) {
      for (const entityHistory of result) {
        if (Array.isArray(entityHistory)) {
          allHistory.push(...entityHistory);
        }
      }
    }

    allHistory.sort(
      (a, b) => new Date(a.last_updated).getTime() - new Date(b.last_updated).getTime(),
    );
    return allHistory;
  }

  private buildRoutePoints(allHistory: HistoryState[]): RoutePoint[] {
    const points: RoutePoint[] = [];
    let lastLoc: [number, number] | null = null;
    const minDistance = this.config.minimal_distance ?? 0.05;

    for (const state of allHistory) {
      const loc = this.resolveLocation(state);
      if (!loc) continue;

      const point = RouteTrackerCard.buildRoutePoint(state, loc);
      if (!lastLoc) {
        points.push(point);
        lastLoc = loc;
        continue;
      }

      const dist = calculateDistance(lastLoc[0], lastLoc[1], loc[0], loc[1]);
      if (dist > minDistance) {
        points.push(point);
        lastLoc = loc;
      }
    }

    return points;
  }

  private static formatTimestamp(isoString: string): string {
    const date = new Date(isoString);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  }

  private static buildRoutePoint(state: HistoryState, loc: [number, number]): RoutePoint {
    const attrs = state.attributes;
    const point: RoutePoint = {
      loc: L.latLng(loc[0], loc[1]),
      timestamp: RouteTrackerCard.formatTimestamp(state.last_updated),
    };
    if (attrs.altitude !== undefined) point.altitude = attrs.altitude;
    if (attrs.battery_level !== undefined) point.battery_level = attrs.battery_level;
    if (attrs.gps_accuracy !== undefined) point.gps_accuracy = attrs.gps_accuracy;
    if (attrs.source_type !== undefined) point.source_type = attrs.source_type;
    if (attrs.speed !== undefined) point.speed = attrs.speed;
    return point;
  }

  private resolveCurrentState(queryIds: string[]): HistoryState | undefined {
    const virtualSensorId = toVirtualSensorId(this.selectedDevice);
    const currentState = this.hass.states[this.selectedDevice];

    if (virtualSensorId && this.hass.states[virtualSensorId]) {
      return this.hass.states[virtualSensorId] as unknown as HistoryState;
    }

    if (this.selectedDevice.startsWith('person.')) {
      const firstQueryId = queryIds[0];
      if (firstQueryId?.startsWith('sensor.virtual_device_tracker_')) {
        return this.hass.states[firstQueryId] as unknown as HistoryState;
      }
    }

    return currentState as unknown as HistoryState;
  }

  private appendCurrentPoint(points: RoutePoint[], currentState: HistoryState | undefined): void {
    if (!currentState) return;
    const currentLoc = this.resolveLocation(currentState);
    if (!currentLoc) return;

    const point = RouteTrackerCard.buildRoutePoint(currentState, currentLoc);
    const lastPoint = points[points.length - 1];
    const lastLoc = lastPoint?.loc ?? null;
    if (!lastLoc) {
      points.push(point);
      return;
    }

    const minDistance = this.config.minimal_distance ?? 0.05;
    const dist = calculateDistance(lastLoc.lat, lastLoc.lng, currentLoc[0], currentLoc[1]);
    if (dist > minDistance) {
      points.push(point);
    }
  }

  private drawRoute(points: RoutePoint[]): void {
    this._lastPoints = points;
    if (!this.map || !this.routeLayer) return;

    const bounds = drawRouteOnMap({
      currentProvider: this._currentProvider,
      enableGeocoding: this.config.enable_geocoding ?? false,
      enableRouting: this.config.enable_routing ?? false,
      fallbackLat: this.hass.config.latitude || 0.0,
      fallbackLon: this.hass.config.longitude || 0.0,
      hass: this.hass,
      isDarkMode: this.isDarkMode,
      isSatellite: this._isSatellite,
      language: this.hass.language,
      localize,
      map: this.map,
      points,
      routeLayer: this.routeLayer,
      routeOrigin: this.config.route_origin ?? 'device',
      routingProvider: this.config.routing_provider ?? 'osm',
    });

    if (bounds) {
      this.routeBounds = bounds;
    }
  }

  private handleDeviceChange(e: Event): void {
    this.selectedDevice = (e.target as HTMLSelectElement).value;
  }

  private handleDateChange(e: Event): void {
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
    const themeMode = this.config.theme_mode ?? 'auto';
    if (themeMode === 'dark') return true;
    if (themeMode === 'light') return false;
    return Boolean((this.hass.themes as { darkMode?: boolean }).darkMode);
  }

  private updateMapThemeClass(): void {
    if (!this.mapContainer) return;

    this.mapContainer.classList.toggle(
      'carto-provider',
      this._currentProvider === 'CartoDB Voyager',
    );

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
    controls.forEach((c) => {
      if ('updateThemeIcon' in c && typeof c.updateThemeIcon === 'function') {
        c.updateThemeIcon();
      }
    });
  }

  private toggleManualTheme(): void {
    this._manualTheme = this.isDarkMode ? 'light' : 'dark';
    this.updateMapThemeClass();
    if (this._lastPoints?.length) {
      this.drawRoute(this._lastPoints);
    }
  }

  protected override render(): TemplateResult {
    const lang = this.hass.language || 'en';
    const controlPanelClass = this.controlsOpen ? 'control-panel is-open' : 'control-panel';

    return html`
      <div class="card-content">
        <div id="map"></div>
        ${
          this.controlsOpen
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
            `
        }
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
              ${this.devices.map((d) => html`<option value=${d.entity_id}>${d.name}</option>`)}
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

interface WindowWithCustomCards extends Window {
  customCards?: Array<{ description: string; name: string; type: string }>;
}

(window as WindowWithCustomCards).customCards = (window as WindowWithCustomCards).customCards ?? [];
(window as WindowWithCustomCards).customCards?.push({
  description: 'Track device routes on a map',
  name: 'Route Tracker',
  type: 'route-tracker-card',
});
