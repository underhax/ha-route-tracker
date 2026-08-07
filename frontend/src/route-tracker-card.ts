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
  @state() private _currentProvider: string = 'OpenStreetMap DE';
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
    #map.dark-mode.carto-provider {
      filter: invert(100%) hue-rotate(180deg) brightness(150%) contrast(90%);
    }
    #map.dark-mode.carto-provider .leaflet-overlay-pane,
    #map.dark-mode.carto-provider .leaflet-marker-pane {
      filter: contrast(111%) brightness(66.6%) hue-rotate(180deg) invert(100%);
    }
    #map.dark-mode .leaflet-bar {
      filter: invert(100%) hue-rotate(180deg) brightness(105%) contrast(111%);
    }

    #map.dark-mode:not(.carto-provider) .zone-label {
      filter: invert(100%) hue-rotate(180deg) brightness(105%) contrast(111%);
    }

    .attribution-outside {
      position: absolute !important;
      bottom: 0px !important;
      right: 0px !important;
      z-index: 3 !important;
      background-color: rgb(247, 247, 247);
      border-radius: 3px 0px;
      font-size: 12px;
    }
    .attribution-outside a {
      color: #3289ce;
      font-size: 12px;
    }

    .control-panel, .provider-selector, .controls-toggle {
      background-color: #333334 !important;
      backdrop-filter: blur(10px) !important;
    }
    .control-panel {
      position: absolute;
      top: 16px;
      right: 16px;
      z-index: 3;
      box-sizing: border-box;
      width: 284px;
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
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
      font-size: 24px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 0;
      padding: 0;
    }
    .control-panel-close:focus-visible,
    .controls-toggle:focus-visible {
      outline: 2px solid #64b5f6;
      outline-offset: 2px;
    }
    @container (max-width: 640px) {
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

    .provider-selector {
      position: absolute !important;
      bottom: 16px !important;
      left: 16px !important;
      z-index: 3 !important;
      border: 1px solid rgba(255, 255, 255, 0.1) !important;
      border-radius: 12px !important;
      color: #fff !important;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2) !important;
      padding: 6px !important;
    }
    .provider-selector .leaflet-control-layers-toggle {
      width: 44px !important;
      height: 44px !important;
      background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Cpath fill='%23999999' d='M199.39 225.91 14.93 321.64c-20.055 10.407-19.864 39.165.324 49.301l185.59 93.211a122.9 122.9 0 0 0 110.312 0l185.586-93.21c20.192-10.141 20.383-38.895.328-49.301l-184.465-95.73a122.9 122.9 0 0 0-113.214 0'/%3E%3Cpath fill='%23cccccc' d='M199.39 119.86 14.93 215.593c-20.055 10.406-19.864 39.16.324 49.3l185.59 93.211a122.9 122.9 0 0 0 110.312 0l185.586-93.21c20.192-10.141 20.383-38.895.328-49.301l-184.465-95.73a122.9 122.9 0 0 0-113.214-.005'/%3E%3Cpath fill='%23b3b3b3' d='m311.156 358.105 130.188-65.386-128.739-66.809a122.89 122.89 0 0 0-113.21 0L70.656 292.72l130.188 65.386a122.9 122.9 0 0 0 110.312 0'/%3E%3Cpath fill='%23ffffff' d='m199.39 13.813-184.46 95.73c-20.055 10.41-19.864 39.164.324 49.305l185.59 93.21a122.9 122.9 0 0 0 110.312 0l185.586-93.21c20.192-10.141 20.383-38.895.328-49.305l-184.465-95.73a122.9 122.9 0 0 0-113.214 0'/%3E%3Cpath fill='%23e6e6e6' d='m311.156 252.059 130.188-65.387-128.739-66.813a122.89 122.89 0 0 0-113.21 0L70.656 186.672l130.188 65.387a122.9 122.9 0 0 0 110.312 0'/%3E%3Cpath fill='%23cccccc' d='m311.156 252.059 26.344-13.23-24.895-12.919a122.9 122.9 0 0 0-113.214 0L174.5 238.828l26.344 13.23a122.9 122.9 0 0 0 110.312 0'/%3E%3C/svg%3E") !important;
      background-size: 26px 26px !important;
      background-position: center !important;
      background-repeat: no-repeat !important;
    }
    .provider-selector.leaflet-control-layers-expanded {
      padding: 8px !important;
    }
    .provider-selector .leaflet-control-layers-list,
    .provider-selector .leaflet-control-layers-scrollbar {
      margin: 0 !important;
      padding: 0 !important;
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
    }
    .provider-selector label {
      display: flex !important;
      align-items: center !important;
      padding: 10px 12px !important;
      margin: 2px 0 !important;
      cursor: pointer !important;
      border-radius: 8px !important;
      transition: background 0.2s !important;
    }
    .provider-selector label:hover {
      background: rgba(255, 255, 255, 0.1) !important;
    }
    .provider-selector input[type="radio"] {
      margin: 0 12px 0 0 !important;
      accent-color: #64b5f6 !important;
      width: 18px !important;
      height: 18px !important;
      cursor: pointer !important;
    }
    .provider-selector span {
      font-family: var(--paper-font-body1_-_font-family, 'Roboto', sans-serif) !important;
      font-size: 14px !important;
      line-height: 1 !important;
    }
    .provider-selector .leaflet-control-layers-separator {
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
    const currentLang = this.hass?.language || 'en';

    this.map = L.map(mapContainer, {
      zoomControl: false
    }).setView([lat, lon], 13);

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

    const baseMaps: Record<string, L.TileLayer> = {
      'OpenStreetMap DE': L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener noreferrer" target="_blank">OpenStreetMap</a> contributors',
        maxZoom: 19
      }),
      'CartoDB Voyager': L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener noreferrer" target="_blank">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions" rel="noopener noreferrer" target="_blank">CARTO</a>',
        maxZoom: 19
      }),
      'Esri Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; <a href="https://www.esri.com/" rel="noopener noreferrer" target="_blank">Esri</a>',
        maxZoom: 19
      })
    };

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

    defaultLayer.addTo(this.map);
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

    const ResetControl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: () => {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        const link = L.DomUtil.create('a', '', container);
        link.href = '#';
        link.title = localize('card.reset_view', currentLang);
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
        link.title = localize('card.toggle_theme', currentLang);
        link.style.display = 'flex';
        link.style.justifyContent = 'center';
        link.style.alignItems = 'center';
        link.style.cursor = 'pointer';

        const updateIcon = () => {
          if (this._isSatellite) {
            container.style.display = 'none';
          } else {
            container.style.display = 'block';

            const isDark = this.isDarkMode;
            if (link.children.length === 0) {
              link.innerHTML = `
                <div style="position:relative; width:20px; height:20px; display:flex; justify-content:center; align-items:center;">
                  <svg class="theme-moon" style="position:absolute; transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1); width:20px; height:20px;" viewBox="-40 -40 393 393">
                    <path fill="currentColor" d="M305.6 178.053c-3.2-.8-6.4 0-9.2 2-10.4 8.8-22.4 16-35.6 20.8-12.4 4.8-26 7.2-40.4 7.2-32.4 0-62-13.2-83.2-34.4s-34.4-50.8-34.4-83.2c0-13.6 2.4-26.8 6.4-38.8 4.4-12.8 10.8-24.4 19.2-34.4 3.6-4.4 2.8-10.8-1.6-14.4-2.8-2-6-2.8-9.2-2-34 9.2-63.6 29.6-84.8 56.8-20.4 26.8-32.8 60-32.8 96.4 0 43.6 17.6 83.2 46.4 112s68.4 46.4 112 46.4c36.8 0 70.8-12.8 98-34 27.6-21.6 47.6-52.4 56-87.6 2-6-1.2-11.6-6.8-12.8m-61.2 83.6c-23.2 18.4-52.8 29.6-85.2 29.6-38 0-72.4-15.6-97.2-40.4s-40.4-59.2-40.4-97.2c0-31.6 10.4-60.4 28.4-83.6 12.4-16 28-29.2 46-38.4-2 4.4-4 8.8-5.6 13.6-5.2 14.4-7.6 29.6-7.6 45.6 0 38 15.6 72.8 40.4 97.6s59.6 40.4 97.6 40.4c16.8 0 32.8-2.8 47.6-8.4 5.2-2 10.4-4 15.2-6.4-9.6 18.4-22.8 34.8-39.2 47.6"></path>
                  </svg>
                  <svg class="theme-sun" style="position:absolute; transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1); width:20px; height:20px;" viewBox="0 0 302.4 302.4">
                    <path fill="currentColor" d="M204.8 97.6C191.2 84 172 75.2 151.2 75.2s-40 8.4-53.6 22.4c-13.6 13.6-22.4 32.8-22.4 53.6s8.8 40 22.4 53.6 32.8 22.4 53.6 22.4 40-8.4 53.6-22.4c13.6-13.6 22.4-32.8 22.4-53.6s-8.4-40-22.4-53.6m-14.4 92.8c-10 10-24 16-39.2 16s-29.2-6-39.2-16-16-24-16-39.2 6-29.2 16-39.2 24-16 39.2-16 29.2 6 39.2 16 16 24 16 39.2-6 29.2-16 39.2M292 140.8h-30.8c-5.6 0-10.4 4.8-10.4 10.4s4.8 10.4 10.4 10.4H292c5.6 0 10.4-4.8 10.4-10.4s-4.8-10.4-10.4-10.4M151.2 250.8c-5.6 0-10.4 4.8-10.4 10.4V292c0 5.6 4.8 10.4 10.4 10.4s10.4-4.8 10.4-10.4v-30.8c0-5.6-4.8-10.4-10.4-10.4M258 243.6l-22-22c-3.6-4-10.4-4-14.4 0s-4 10.4 0 14.4l22 22c4 4 10.4 4 14.4 0s4-10.4 0-14.4M151.2 0c-5.6 0-10.4 4.8-10.4 10.4v30.8c0 5.6 4.8 10.4 10.4 10.4s10.4-4.8 10.4-10.4V10.4c0-5.6-4.8-10.4-10.4-10.4M258.4 44.4c-4-4-10.4-4-14.4 0l-22 22c-4 4-4 10.4 0 14.4 3.6 4 10.4 4 14.4 0l22-22c4-4 4-10.4 0-14.4M41.2 140.8H10.4c-5.6 0-10.4 4.8-10.4 10.4s4.4 10.4 10.4 10.4h30.8c5.6 0 10.4-4.8 10.4-10.4s-4.8-10.4-10.4-10.4M80.4 221.6c-3.6-4-10.4-4-14.4 0l-22 22c-4 4-4 10.4 0 14.4s10.4 4 14.4 0l22-22c4-4 4-10.4 0-14.4M80.4 66.4l-22-22c-4-4-10.4-4-14.4 0s-4 10.4 0 14.4l22 22c4 4 10.4 4 14.4 0s4-10.4 0-14.4"></path>
                  </svg>
                </div>
              `;
            }

            const moon = link.querySelector('.theme-moon') as HTMLElement;
            const sun = link.querySelector('.theme-sun') as HTMLElement;
            if (moon && sun) {
              moon.style.opacity = isDark ? '1' : '0';
              moon.style.transform = isDark ? 'rotate(0deg) scale(1)' : 'rotate(-90deg) scale(0.5)';

              sun.style.opacity = isDark ? '0' : '1';
              sun.style.transform = isDark ? 'rotate(90deg) scale(0.5)' : 'rotate(0deg) scale(1)';
            }
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

    const isSatellite = this._isSatellite;
    const isDark = this.isDarkMode && !isSatellite;
    const isCartoDark = isDark && this._currentProvider === 'CartoDB Voyager';

    const routeColor = isSatellite ? '#00CCE6' : (isCartoDark ? '#45949c' : (isDark ? '#167A87' : '#00CCE6'));
    const routeOpacity = isSatellite ? 0.4 : (isCartoDark ? 0.9 : (isDark ? 0.9 : 0.5));
    const arrowColor = isSatellite ? '#b8c9cc' : (isCartoDark ? '#79abb3' : (isDark ? '#0D4F58' : '#009fb9'));
    const beadBorderColor = isSatellite ? '#d1ebf7' : (isCartoDark ? '#b2d2d5' : (isDark ? '#01252a' : '#d1ebf7'));
    const beadFillColor = isSatellite ? '#5db4cb' : (isCartoDark ? '#41838c' : (isDark ? '#45929c' : '#5db4cb'));

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
                pathOptions: { stroke: true, color: arrowColor, weight: 2 }
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
                <svg style="width:24px;height:24px" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z" />
                </svg>
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
