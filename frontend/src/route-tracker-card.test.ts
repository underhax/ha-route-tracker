import type { HomeAssistant } from 'custom-card-helpers';
import * as L from 'leaflet';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteTrackerCard } from './route-tracker-card.ts';
import * as mapProviders from './utils/map-providers.ts';
import type { RoutePoint } from './utils/route-drawer.ts';

interface CardInternals {
  _currentProvider: string;
  _lastIsDark: boolean | null;
  _lastPoints: RoutePoint[] | null | undefined;
  _manualTheme: 'light' | 'dark' | undefined;
  config: Record<string, unknown>;
  controlsOpen: boolean;
  devices: Array<{ entity_id: string; name: string }>;
  drawRoute: (points: RoutePoint[]) => void;
  drawZones: () => void;
  fetchAndDrawRoute: () => Promise<void>;
  getComposedAncestors: () => Element[];
  hass: HomeAssistant;
  initMap: () => void;
  isDarkMode: boolean;
  loadDevices: () => void;
  map: L.Map | null | undefined;
  mapContainer: HTMLElement | null | undefined;
  mapResizeFrame: number | null | undefined;
  openControls: () => void;
  resolveLocation: (
    stateObj:
      | { state?: string; attributes?: Record<string, unknown>; last_updated?: string }
      | undefined
      | null,
  ) => [number, number] | null;
  resizeObserver: ResizeObserver | null | undefined;
  routeBounds: L.LatLngBounds | null;
  routeLayer: L.LayerGroup | null | undefined;
  selectedDate: string;
  selectedDevice: string;
  startObservingMapSize: () => void;
  startObservingPanelEditMode: () => void;
  toggleManualTheme: () => void;
  updateMapThemeClass: () => void;
  zoneLayer: L.LayerGroup;
}

interface CardStaticInternals {
  buildRoutePoint: (state: unknown, loc: [number, number]) => RoutePoint;
}

function asCard(target: RouteTrackerCard): CardInternals {
  return target as unknown as CardInternals;
}

function assertDefined<T>(value: T | null | undefined, label?: string): T {
  if (value == null) throw new Error(`${label ?? 'value'} is null or undefined`);
  return value;
}

describe('RouteTrackerCard', () => {
  let card: RouteTrackerCard;
  let mockHass: HomeAssistant;

  beforeEach(() => {
    mockHass = {
      callApi: vi.fn(),
      config: {
        latitude: 0,
        longitude: 0,
        time_zone: 'UTC',
      },
      language: 'en',
      states: {},
      themes: { darkMode: false },
    } as unknown as HomeAssistant;

    card = new RouteTrackerCard();
    card.hass = mockHass;
    card.setConfig({ type: 'custom:route-tracker-card' });
    document.body.appendChild(card);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('getConfigElement()', () => {
    it('returns an editor element via getConfigElement()', async () => {
      const editor = await RouteTrackerCard.getConfigElement();
      expect(editor.tagName.toLowerCase()).toBe('route-tracker-card-editor');
    });

    it('returns a default configuration via getStubConfig()', () => {
      const stub = RouteTrackerCard.getStubConfig() as { type: string };
      expect(stub.type).toBe('custom:route-tracker-card');
    });

    it('getCardSize returns a number', () => {
      expect(card.getCardSize()).toBe(8);
    });

    it('setConfig throws on empty config', () => {
      expect(() => card.setConfig(null as any)).toThrow('Invalid configuration');
    });

    it('setConfig stores valid config', () => {
      const cfg = { type: 'test' };
      card.setConfig(cfg as any);
      expect(asCard(card).config).toBe(cfg);
    });
  });

  describe('openControls()', () => {
    beforeEach(async () => {
      card.setConfig({ entities: [] } as any);
      await card.updateComplete;
    });

    it('toggles controls via hamburger menu', async () => {
      expect(asCard(card).controlsOpen).toBe(false);

      const toggleBtn = card.shadowRoot?.querySelector('.controls-toggle') as HTMLButtonElement;
      expect(toggleBtn).not.toBeNull();

      toggleBtn.click();
      await card.updateComplete;
      expect(asCard(card).controlsOpen).toBe(true);

      const closeBtn = card.shadowRoot?.querySelector('.control-panel-close') as HTMLButtonElement;
      expect(closeBtn).not.toBeNull();

      closeBtn.click();
      await card.updateComplete;
      expect(asCard(card).controlsOpen).toBe(false);
    });
  });

  describe('handleDeviceChange()', () => {
    beforeEach(async () => {
      card.setConfig({ entities: [] } as any);
      await card.updateComplete;
      asCard(card).openControls();
      await card.updateComplete;
    });

    it('handles device change', () => {
      const select = card.shadowRoot?.querySelector('select') as HTMLSelectElement | null;
      expect(select).not.toBeNull();
      if (!select) return;

      const option = document.createElement('option');
      option.value = 'device.new';
      select.appendChild(option);

      select.value = 'device.new';
      select.dispatchEvent(new Event('change'));
      expect(asCard(card).selectedDevice).toBe('device.new');
    });

    it('handles date change', () => {
      const input = card.shadowRoot?.querySelector('input[type="date"]') as HTMLInputElement | null;
      expect(input).not.toBeNull();
      if (!input) return;

      input.value = '1970-01-01';
      input.dispatchEvent(new Event('change'));
      expect(asCard(card).selectedDate).toBe('1970-01-01');
    });
  });

  describe('loadDevices()', () => {
    it('filters out invalid entities from config', async () => {
      mockHass.states = {
        'device_tracker.valid': {
          attributes: {},
          entity_id: 'device_tracker.valid',
          state: 'home',
        } as any,
        'sensor.virtual_device_tracker_valid': {
          entity_id: 'sensor.virtual_device_tracker_valid',
          state: '1',
        } as any,
      };

      card.setConfig({
        entities: [
          { entity: 'device_tracker.valid', name: 'Valid' },
          { entity: 'device_tracker.missing' },
          { invalid: 'object' },
          'string_instead_of_object',
          null,
          undefined,
        ],
      } as any);
      asCard(card).loadDevices();
      await card.updateComplete;

      const devices = asCard(card).devices;
      expect(devices.length).toBe(1);
      expect(assertDefined(devices[0]).entity_id).toBe('device_tracker.valid');
      expect(assertDefined(devices[0]).name).toBe('Valid');
    });

    it('keeps selectedDevice if it is still valid after loadDevices', async () => {
      card.setConfig({
        entities: [{ entity: 'device_tracker.test' }, { entity: 'device_tracker.other' }],
      });
      await card.updateComplete;

      mockHass.states['device_tracker.other'] = {
        attributes: { latitude: 10, longitude: 10 },
        entity_id: 'device_tracker.other',
        state: 'home',
      } as any;
      mockHass.states['sensor.virtual_device_tracker_other'] = {
        entity_id: 'sensor.virtual_device_tracker_other',
        state: '100',
      } as any;
      asCard(card).selectedDevice = 'device_tracker.other';
      asCard(card).loadDevices();

      expect(asCard(card).selectedDevice).toBe('device_tracker.other');
    });

    it('falls back to auto-discovered eligible entities if config.entities is empty', async () => {
      mockHass.states = {
        'device_tracker.auto1': {
          attributes: { friendly_name: 'Auto 1' },
          entity_id: 'device_tracker.auto1',
          state: 'home',
        } as any,
        'person.auto2': {
          attributes: { device_trackers: ['device_tracker.auto1'] },
          entity_id: 'person.auto2',
          state: 'home',
        } as any,
        'sensor.virtual_device_tracker_auto1': {
          entity_id: 'sensor.virtual_device_tracker_auto1',
          state: '1',
        } as any,
      };

      card.setConfig({ entities: [] } as any);
      asCard(card).loadDevices();
      await card.updateComplete;

      const devices = asCard(card).devices;
      expect(devices.length).toBe(2);
      expect(assertDefined(devices[0]).entity_id).toBe('device_tracker.auto1');
      expect(assertDefined(devices[0]).name).toBe('Auto 1');
      expect(assertDefined(devices[1]).entity_id).toBe('person.auto2');
      expect(assertDefined(devices[1]).name).toBe('person.auto2');
    });

    it('falls back to first device if selectedDevice is no longer valid', async () => {
      mockHass.states['device_tracker.valid'] = {
        attributes: { latitude: 10, longitude: 10 },
        entity_id: 'device_tracker.valid',
        state: 'home',
      } as any;
      mockHass.states['sensor.virtual_device_tracker_valid'] = {
        entity_id: 'sensor.virtual_device_tracker_valid',
        state: '1',
      } as any;
      card.setConfig({ entities: [{ entity: 'device_tracker.valid' }] } as any);
      asCard(card).selectedDevice = 'device_tracker.nonexistent';

      asCard(card).loadDevices();
      await card.updateComplete;

      expect(asCard(card).selectedDevice).toBe('device_tracker.valid');
    });
  });

  describe('getLocalDateString()', () => {
    it('formats max date using hass timezone if available', async () => {
      mockHass.config.time_zone = 'Asia/Tokyo';
      card.setConfig({ entities: [] } as any);
      await card.updateComplete;

      const input = card.shadowRoot?.querySelector('input[type="date"]') as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.max).toBeDefined();
    });

    it('formats max date gracefully if Intl format throws', async () => {
      mockHass.config.time_zone = 'Invalid/Timezone';
      card.setConfig({ entities: [] } as any);
      await card.updateComplete;

      const input = card.shadowRoot?.querySelector('input[type="date"]') as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.max).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    });

    it('observes map container resize', async () => {
      card.setConfig({ entities: [] } as any);
      asCard(card).map = { invalidateSize: vi.fn() } as unknown as L.Map;

      const originalRaf = window.requestAnimationFrame;
      window.requestAnimationFrame = (cb: FrameRequestCallback): number =>
        setTimeout(cb, 0) as unknown as number;

      const originalRO = window.ResizeObserver;
      let roCallback: (() => void) | null = null;
      const MockRO = function (
        this: { observe: () => void; disconnect: () => void },
        cb: () => void,
      ): void {
        roCallback = cb;
        this.observe = (): void => {};
        this.disconnect = (): void => {};
      } as unknown as typeof ResizeObserver;
      window.ResizeObserver = MockRO;

      await card.updateComplete;

      const mapContainer = card.shadowRoot?.getElementById('map');
      expect(mapContainer).not.toBeNull();

      const existingObserver = asCard(card).resizeObserver;
      if (existingObserver) {
        existingObserver.disconnect();
        asCard(card).resizeObserver = undefined;
      }

      asCard(card).startObservingMapSize();
      if (roCallback) {
        (roCallback as () => void)();
      }

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(assertDefined(asCard(card).map).invalidateSize).toHaveBeenCalled();

      window.requestAnimationFrame = originalRaf;
      window.ResizeObserver = originalRO;
    });
  });

  describe('initMap()', () => {
    it('initializes map with proper providers and themes', async () => {
      card.setConfig({ entities: [], map_provider: 'carto_voyager' } as any);
      const existingMap = asCard(card).map;
      if (existingMap) {
        existingMap.remove();
      }
      asCard(card).initMap();
      await card.updateComplete;

      const mapContainer = card.shadowRoot?.getElementById('map');
      expect(mapContainer).not.toBeNull();
      expect(asCard(card)._currentProvider).toBe('CartoDB Voyager');
    });

    it('toggles manual theme correctly', async () => {
      card.setConfig({ entities: [] });
      await card.updateComplete;

      const initialDark = asCard(card).isDarkMode;
      asCard(card)._lastPoints = [{ loc: L.latLng(10, 10), timestamp: '1970-01-01' }];
      asCard(card).toggleManualTheme();
      await card.updateComplete;

      expect(asCard(card)._manualTheme).not.toBeNull();
      expect(asCard(card).isDarkMode).not.toBe(initialDark);

      const mapContainer = card.shadowRoot?.getElementById('map');
      expect(mapContainer?.classList.contains('dark-mode')).toBe(asCard(card).isDarkMode);
    });

    it('updates theme class on native hass theme change', async () => {
      card.setConfig({ entities: [] });
      await card.updateComplete;

      asCard(card)._lastPoints = [{ loc: L.latLng(10, 10), timestamp: '1970-01-01' }];

      const newHass = { ...mockHass, themes: { darkMode: true } };
      card.hass = newHass as any;
      await card.updateComplete;

      const mapContainer = card.shadowRoot?.getElementById('map');
      expect(mapContainer?.classList.contains('dark-mode')).toBe(true);
    });

    it('observes edit mode via MutationObserver', async () => {
      card.setConfig({ entities: [] });
      await card.updateComplete;

      card.disconnectedCallback();

      const originalMO = window.MutationObserver;
      let moCallback: (() => void) | null = null;
      const MockMO = function (
        this: { observe: () => void; disconnect: () => void },
        cb: () => void,
      ): void {
        moCallback = cb;
        this.observe = (): void => {};
        this.disconnect = (): void => {};
      } as unknown as typeof MutationObserver;
      window.MutationObserver = MockMO;

      asCard(card).startObservingPanelEditMode();

      if (moCallback) {
        (moCallback as () => void)();
      }

      window.MutationObserver = originalMO;
      expect(card.classList.contains('is-editing-panel')).toBe(false);
    });

    it('observes edit mode via MutationObserver when inside a panel', async () => {
      const wrapper = document.createElement('hui-panel-view');
      wrapper.classList.add('edit-mode');

      card.setConfig({ entities: [] });
      wrapper.appendChild(card);
      document.body.appendChild(wrapper);

      await card.updateComplete;
      card.disconnectedCallback();

      const originalMO = window.MutationObserver;
      let moCallback: (() => void) | null = null;
      const MockMO = function (
        this: { observe: () => void; disconnect: () => void },
        cb: () => void,
      ): void {
        moCallback = cb;
        this.observe = (): void => {};
        this.disconnect = (): void => {};
      } as unknown as typeof MutationObserver;
      window.MutationObserver = MockMO;

      asCard(card).startObservingPanelEditMode();

      if (moCallback) {
        (moCallback as () => void)();
      }

      window.MutationObserver = originalMO;
      expect(card.classList.contains('is-editing-panel')).toBe(true);

      document.body.removeChild(wrapper);
    });

    it('traverses composed ancestors across shadow boundaries', () => {
      const parent = document.createElement('div');
      parent.attachShadow({ mode: 'open' });
      parent.shadowRoot?.appendChild(card);

      const ancestors = asCard(card).getComposedAncestors();
      expect(ancestors).toContain(parent);
      expect(ancestors).toContain(card);
    });

    it('returns early in initMap if mapContainer is missing', async () => {
      card.setConfig({ entities: [] });
      await card.updateComplete;

      const shadowRoot = card.shadowRoot;
      if (!shadowRoot) return;
      const originalGet = shadowRoot.getElementById;
      shadowRoot.getElementById = (): HTMLElement | null => null;

      expect(() => asCard(card).initMap()).not.toThrow();

      shadowRoot.getElementById = originalGet;
    });

    it('returns early in ResizeObserver if frame is already pending', async () => {
      card.setConfig({ entities: [] });
      await card.updateComplete;

      card.disconnectedCallback();

      const originalRO = window.ResizeObserver;
      let roCallback: (() => void) | null = null;
      const MockRO = function (
        this: { observe: () => void; disconnect: () => void },
        cb: () => void,
      ): void {
        roCallback = cb;
        this.observe = (): void => {};
        this.disconnect = (): void => {};
      } as unknown as typeof ResizeObserver;
      window.ResizeObserver = MockRO;

      asCard(card).mapContainer = document.createElement('div');
      asCard(card).startObservingMapSize();

      if (roCallback) {
        asCard(card).mapResizeFrame = 123;
        (roCallback as () => void)();
      }

      expect(asCard(card).mapResizeFrame).toBe(123);
      window.ResizeObserver = originalRO;
    });

    it('handles baselayerchange events', async () => {
      card.setConfig({ entities: [] });
      const map1 = asCard(card).map;
      if (map1) {
        map1.remove();
      }
      asCard(card).initMap();
      await card.updateComplete;

      const map = asCard(card).map as L.Map;
      map.fire('baselayerchange', { name: 'Esri Satellite' });

      expect(asCard(card)._currentProvider).toBe('Esri Satellite');
      const mapContainer = card.shadowRoot?.getElementById('map');
      expect(mapContainer?.classList.contains('dark-mode')).toBe(false);
    });

    it('handles baselayerchange events with points', async () => {
      card.setConfig({ entities: [] });
      const map2 = asCard(card).map;
      if (map2) {
        map2.remove();
      }
      asCard(card).initMap();
      await card.updateComplete;

      asCard(card)._lastPoints = [{ loc: L.latLng(10, 10), timestamp: '1970-01-01' }];
      const map = asCard(card).map as L.Map;
      map.fire('baselayerchange', { name: 'Esri Satellite' });

      expect(asCard(card)._currentProvider).toBe('Esri Satellite');
    });

    it('handles theme toggles and manual theme', async () => {
      card.setConfig({ entities: [{ entity: 'device_tracker.test' }] } as any);
      await card.updateComplete;

      asCard(card)._manualTheme = undefined;
      asCard(card).hass.themes = { darkMode: true } as any;
      expect(asCard(card).isDarkMode).toBe(true);

      asCard(card).hass.themes = { darkMode: false } as any;
      expect(asCard(card).isDarkMode).toBe(false);

      card.setConfig({ entities: [], theme_mode: 'dark' });
      expect(asCard(card).isDarkMode).toBe(true);

      card.setConfig({ entities: [], theme_mode: 'light' });
      expect(asCard(card).isDarkMode).toBe(false);

      asCard(card).toggleManualTheme();
      expect(asCard(card)._manualTheme).toBe('dark');
      expect(asCard(card).isDarkMode).toBe(true);

      asCard(card).toggleManualTheme();
      expect(asCard(card)._manualTheme).toBe('light');
      expect(asCard(card).isDarkMode).toBe(false);
    });

    it('falls back to en language in render when hass.language is not provided', async () => {
      const originalHass = card.hass;
      card.hass = { ...originalHass, language: undefined } as any;
      await card.updateComplete;

      const mapContainer = card.shadowRoot?.querySelector('.card-content');
      expect(mapContainer).not.toBeNull();
      card.hass = originalHass;
    });

    it('falls back to en language in initMap when hass.language is not provided', async () => {
      const originalHass = card.hass;
      card.hass = { ...originalHass, language: undefined } as any;

      const existingMap = asCard(card).map;
      if (existingMap) {
        existingMap.remove();
        asCard(card).map = undefined;
      }

      asCard(card).initMap();

      const mapContainer = card.shadowRoot?.querySelector('.card-content');
      expect(mapContainer).not.toBeNull();
      card.hass = originalHass;
    });

    it('handles initMap with missing defaultLayer', async () => {
      card.setConfig({ entities: [] });
      const map3 = asCard(card).map;
      if (map3) {
        map3.remove();
        asCard(card).map = undefined;
      }

      const spy = vi.spyOn(mapProviders, 'getBaseMaps').mockReturnValue({} as any);
      expect(() => asCard(card).initMap()).not.toThrow();
      spy.mockRestore();
    });

    it('initializes map with esri_satellite provider', async () => {
      card.setConfig({ entities: [], map_provider: 'esri_satellite' });
      const existingMap = asCard(card).map;
      if (existingMap) {
        existingMap.remove();
      }
      asCard(card).initMap();
      await card.updateComplete;

      expect(asCard(card)._currentProvider).toBe('Esri Satellite');
    });

    it('fits bounds on reset control click', async () => {
      card.setConfig({ entities: [{ entity: 'device_tracker.test' }] } as any);
      const existingMap = asCard(card).map;
      if (existingMap) {
        existingMap.remove();
      }
      asCard(card).initMap();
      await card.updateComplete;

      const mapContainer = card.shadowRoot?.getElementById('map');
      const controls = mapContainer?.querySelectorAll('.leaflet-control a');

      asCard(card).routeBounds = L.latLngBounds(L.latLng(10, 10), L.latLng(20, 20));
      assertDefined(asCard(card).map).fitBounds = vi.fn();

      if (controls) {
        controls.forEach((c) => {
          if ((c as any).onclick) {
            (c as any).onclick({ preventDefault: () => {}, stopPropagation: () => {} });
          } else {
            (c as HTMLElement).click();
          }
        });
      }
      expect(assertDefined(asCard(card).map).fitBounds).toHaveBeenCalled();
    });

    it('re-draws route on hass theme change if points exist', async () => {
      card.setConfig({ entities: [] });
      await card.updateComplete;

      asCard(card)._lastPoints = [{ loc: L.latLng(10, 10), timestamp: '1970-01-01' }];

      const newHass = { ...card.hass, themes: { darkMode: true } };
      card.hass = newHass as any;
      await card.updateComplete;

      expect(asCard(card)._lastIsDark).toBe(true);
    });

    it('handles theme change when lastPoints is undefined (fallback check)', async () => {
      card.setConfig({ entities: [] });
      await card.updateComplete;

      asCard(card)._lastPoints = undefined;
      const newHass = { ...card.hass, themes: { darkMode: true } };
      card.hass = newHass as any;
      await card.updateComplete;

      expect(asCard(card)._lastIsDark).toBe(true);
    });

    it('draws zones on map', async () => {
      mockHass.states = {
        'zone.home': {
          attributes: { friendly_name: 'Home Zone', latitude: 50.1, longitude: 30.1, radius: 100 },
          entity_id: 'zone.home',
          state: 'zoning',
        } as any,
        'zone.nofriendly': {
          attributes: { latitude: 50.3, longitude: 30.3 },
          entity_id: 'zone.nofriendly',
          state: 'zoning',
        } as any,
        'zone.nolatlon': {
          attributes: { friendly_name: 'No Lat Lon Zone' },
          entity_id: 'zone.nolatlon',
          state: 'zoning',
        } as any,
        'zone.noradius': {
          attributes: { friendly_name: 'No Radius Zone', latitude: 50.2, longitude: 30.2 },
          entity_id: 'zone.noradius',
          state: 'zoning',
        } as any,
      };

      card.setConfig({
        entities: [],
        zones: [
          { entity: 'zone.home', name: 'Custom Home' },
          { entity: 'zone.noradius' },
          { entity: 'zone.nofriendly' },
          { entity: 'zone.missing' },
          { entity: 'zone.nolatlon' },
        ],
      });
      await card.updateComplete;
      asCard(card).drawZones();

      const zoneLayer = asCard(card).zoneLayer as L.FeatureGroup;
      expect(zoneLayer.getLayers().length).toBe(6);
    });

    it('handles initMap with missing mapContainer parentElement', async () => {
      card.setConfig({ entities: [] });
      await card.updateComplete;

      const mapContainer = card.shadowRoot?.getElementById('map');
      expect(mapContainer).not.toBeNull();
      if (!mapContainer) return;

      Object.defineProperty(mapContainer, 'parentElement', { configurable: true, value: null });
      const existingMap = asCard(card).map;
      if (existingMap) {
        existingMap.remove();
      }
      expect(() => asCard(card).initMap()).not.toThrow();
      Object.defineProperty(mapContainer, 'parentElement', {
        configurable: true,
        value: card.shadowRoot?.querySelector('.card-content'),
      });
    });

    it('returns early in drawZones if map or layer is missing', async () => {
      card.setConfig({ entities: [] });
      await card.updateComplete;
      asCard(card).map = null;
      expect(() => asCard(card).drawZones()).not.toThrow();
    });

    it('returns early in updateMapThemeClass if mapContainer is missing', async () => {
      card.setConfig({ entities: [] });
      await card.updateComplete;
      const originalContainer = asCard(card).mapContainer;
      asCard(card).mapContainer = null;
      expect(() => asCard(card).updateMapThemeClass()).not.toThrow();
      asCard(card).mapContainer = originalContainer;
    });

    it('skips zones without valid coordinates', async () => {
      mockHass.states['zone.invalid'] = {
        attributes: { friendly_name: 'Invalid Zone' },
        entity_id: 'zone.invalid',
      } as any;
      card.setConfig({ entities: [], zones: [{ entity: 'zone.invalid' }] });
      await card.updateComplete;

      const zoneLayer = asCard(card).zoneLayer as L.FeatureGroup;
      expect(zoneLayer.getLayers().length).toBe(0);
    });

    it('resolves location correctly from state', async () => {
      card.setConfig({ entities: [] });
      await card.updateComplete;

      let loc = asCard(card).resolveLocation({
        attributes: { latitude: 12.34, longitude: 56.78 },
      });
      expect(loc).toEqual([12.34, 56.78]);

      loc = asCard(card).resolveLocation({ attributes: { latitude: 0, longitude: 0 } });
      expect(loc).toBeNull();

      mockHass.states['zone.work'] = {
        attributes: { latitude: 44.44, longitude: 55.55 },
      } as any;
      loc = asCard(card).resolveLocation({
        attributes: {},
        state: 'work',
      });
      expect(loc).toEqual([44.44, 55.55]);

      mockHass.states['zone.invalid_loc'] = {
        attributes: { latitude: 'invalid', longitude: 'invalid' },
      } as any;
      loc = asCard(card).resolveLocation({
        attributes: {},
        state: 'invalid_loc',
      });
      expect(loc).toBeNull();

      expect(asCard(card).resolveLocation(null)).toBeNull();

      mockHass.states['zone.partial'] = {
        attributes: { latitude: 50.0 },
      } as any;
      loc = asCard(card).resolveLocation({
        attributes: {},
        state: 'partial',
      });
      expect(loc).toBeNull();
    });
  });

  describe('fetchAndDrawRoute()', () => {
    beforeEach(() => {
      mockHass.states['device_tracker.test'] = {
        attributes: { latitude: 10, longitude: 10 },
        entity_id: 'device_tracker.test',
        state: 'home',
      } as any;
    });

    it('returns early in fetchAndDrawRoute if missing device or date', async () => {
      card.setConfig({ entities: [{ entity: 'device_tracker.test' }] } as any);
      asCard(card).selectedDevice = '';
      asCard(card).selectedDate = '';
      const promise = asCard(card).fetchAndDrawRoute();
      await expect(promise).resolves.toBeUndefined();
    });

    it('returns early in drawRoute if map or layer is missing', async () => {
      card.setConfig({ entities: [] });
      asCard(card).map = null;
      asCard(card).routeLayer = null;
      expect(() => asCard(card).drawRoute([])).not.toThrow();
    });

    it('fetches history and handles nested arrays correctly', async () => {
      card.setConfig({ entities: [{ entity: 'device_tracker.test' }] } as any);
      asCard(card).selectedDevice = 'device_tracker.test';
      asCard(card).selectedDate = '1970-01-01';

      await card.updateComplete;

      mockHass.callApi = vi.fn().mockResolvedValue([
        [
          { attributes: { latitude: 10, longitude: 10 }, last_updated: '1970-01-01T10:00:00Z' },
          {
            attributes: { latitude: 'invalid', longitude: 'invalid' },
            last_updated: '1970-01-01T10:05:00Z',
          },
        ],
        null,
        { not: 'array' },
      ]);

      await asCard(card).fetchAndDrawRoute();
      expect(mockHass.callApi).toHaveBeenCalled();
    });

    it('fetches history and draws route on update', async () => {
      mockHass.callApi = vi.fn().mockResolvedValue([
        [
          {
            attributes: { latitude: 10, longitude: 10 },
            entity_id: 'device_tracker.test',
            last_updated: '1970-01-01T12:00:00Z',
            state: 'not_home',
          },
          {
            attributes: { latitude: 10.001, longitude: 10.001 },
            entity_id: 'device_tracker.test',
            last_updated: '1970-01-01T12:05:00Z',
            state: 'not_home',
          },
        ],
      ]);

      mockHass.states['device_tracker.test'] = {
        attributes: { latitude: 10.002, longitude: 10.002 },
        entity_id: 'device_tracker.test',
        last_updated: '1970-01-01T12:10:00Z',
        state: 'home',
      } as any;

      card.setConfig({ entities: [{ entity: 'device_tracker.test' }], minimal_distance: 0 });
      asCard(card).selectedDevice = 'device_tracker.test';
      asCard(card).selectedDate = '1970-01-01';
      await card.updateComplete;

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(mockHass.callApi).toHaveBeenCalled();
      const callArgs = (mockHass.callApi as any).mock.calls[0];
      expect(callArgs[0]).toBe('GET');
      expect(callArgs[1]).toContain('history/period/');
      expect(callArgs[1]).toContain('filter_entity_id=device_tracker.test');

      const points = assertDefined(asCard(card)._lastPoints);
      expect(points.length).toBe(3);
    });

    it('expands person entities and fetches history for sub-trackers', async () => {
      mockHass.states['person.john'] = {
        attributes: { device_trackers: ['device_tracker.phone'] },
        entity_id: 'person.john',
        last_updated: '1970-01-01T12:10:00Z',
        state: 'home',
      } as any;
      mockHass.states['device_tracker.phone'] = {
        attributes: { latitude: 20, longitude: 20 },
        entity_id: 'device_tracker.phone',
        last_updated: '1970-01-01T12:10:00Z',
        state: 'home',
      } as any;
      mockHass.states['sensor.virtual_device_tracker_phone'] = {
        attributes: { latitude: 21, longitude: 21 },
        entity_id: 'sensor.virtual_device_tracker_phone',
        last_updated: '1970-01-01T12:15:00Z',
        state: 'home',
      } as any;

      card.setConfig({ entities: [{ entity: 'person.john' }] });
      await card.updateComplete;

      asCard(card).selectedDevice = 'person.john';
      asCard(card).selectedDate = '1970-01-01';
      await card.updateComplete;

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(mockHass.callApi).toHaveBeenCalled();
      const callArgs = (mockHass.callApi as any).mock.calls[0];
      expect(callArgs[1]).not.toContain('person.john');
      expect(callArgs[1]).not.toContain('device_tracker.phone');
      expect(callArgs[1]).toContain('sensor.virtual_device_tracker_phone');
      expect(mockHass.callApi).toHaveBeenCalledWith(
        'GET',
        expect.stringContaining('filter_entity_id=sensor.virtual_device_tracker_phone'),
      );

      const points = assertDefined(asCard(card)._lastPoints);
      expect(points.length).toBeGreaterThan(0);
      const lastPoint1 = assertDefined(points[points.length - 1]);
      expect(lastPoint1.loc.lat).toBe(21);
      expect(lastPoint1.loc.lng).toBe(21);
    });

    it('filters out points based on minimal_distance', async () => {
      mockHass.callApi = vi.fn().mockResolvedValue([
        [
          {
            attributes: { latitude: 10.0, longitude: 10.0 },
            entity_id: 'device_tracker.test',
            last_updated: '1970-01-01T12:00:00Z',
          },
          {
            attributes: { latitude: 10.0000001, longitude: 10.0000001 },
            entity_id: 'device_tracker.test',
            last_updated: '1970-01-01T12:05:00Z',
          },
        ],
      ]);
      mockHass.states['device_tracker.test'] = {
        attributes: { latitude: 10.0, longitude: 10.0 },
        entity_id: 'device_tracker.test',
        last_updated: '1970-01-01T12:10:00Z',
        state: 'home',
      } as any;

      card.setConfig({ entities: [{ entity: 'device_tracker.test' }], minimal_distance: 5000 });
      await card.updateComplete;

      asCard(card).selectedDevice = 'device_tracker.test';
      asCard(card).selectedDate = '1970-01-01';
      await card.updateComplete;

      await new Promise((resolve) => setTimeout(resolve, 150));

      const points = assertDefined(asCard(card)._lastPoints);
      expect(points.length).toBe(1);
    });

    it('catches and ignores API errors', async () => {
      mockHass.callApi = vi.fn().mockRejectedValue(new Error('API failed'));
      card.setConfig({ entities: [] });
      await card.updateComplete;

      asCard(card).selectedDevice = 'device_tracker.test';
      asCard(card).selectedDate = '1970-01-01';
      await card.updateComplete;

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(mockHass.callApi).toHaveBeenCalled();
    });

    it('handles empty history but valid current state', async () => {
      mockHass.callApi = vi.fn().mockResolvedValue([]);
      mockHass.states['device_tracker.test'] = {
        attributes: { latitude: 10.0, longitude: 10.0 },
        entity_id: 'device_tracker.test',
        last_updated: '1970-01-01T12:10:00Z',
        state: 'home',
      } as any;

      card.setConfig({ entities: [{ entity: 'device_tracker.test' }], minimal_distance: 0 });
      await card.updateComplete;

      asCard(card).selectedDevice = 'device_tracker.test';
      asCard(card).selectedDate = '1970-01-01';
      await card.updateComplete;

      await new Promise((resolve) => setTimeout(resolve, 150));

      const points = assertDefined(asCard(card)._lastPoints);
      expect(points.length).toBe(1);

      asCard(card).toggleManualTheme();
    });

    it('handles person with no virtual sensors gracefully', async () => {
      mockHass.callApi = vi.fn().mockResolvedValue([]);
      mockHass.states['person.jane'] = {
        attributes: { device_trackers: ['device_tracker.laptop'], latitude: 30, longitude: 30 },
        entity_id: 'person.jane',
        last_updated: '1970-01-01T12:00:00Z',
        state: 'home',
      } as any;
      mockHass.states['device_tracker.laptop'] = {
        attributes: { latitude: 30, longitude: 30 },
        entity_id: 'device_tracker.laptop',
        last_updated: '1970-01-01T12:10:00Z',
        state: 'home',
      } as any;

      card.setConfig({ entities: [{ entity: 'person.jane' }] });
      await card.updateComplete;

      asCard(card).selectedDevice = 'person.jane';
      asCard(card).selectedDate = '1970-01-01';
      await card.updateComplete;

      await new Promise((resolve) => setTimeout(resolve, 150));

      const points = assertDefined(asCard(card)._lastPoints);
      expect(points.length).toBeGreaterThan(0);
      const lastPoint2 = assertDefined(points[points.length - 1]);
      expect(lastPoint2.loc.lat).toBe(30);
    });

    it('handles map control clicks (reset and theme toggle)', async () => {
      card.setConfig({ entities: [{ entity: 'device_tracker.test' }] });
      await card.updateComplete;

      const mapContainer = card.shadowRoot?.getElementById('map');
      const controls = mapContainer?.querySelectorAll('.leaflet-control a');
      if (controls) {
        controls.forEach((c) => {
          (c as HTMLElement).click();
        });
      }

      const mapControls = mapContainer?.querySelectorAll('.leaflet-control');
      mapControls?.forEach((c: any) => {
        if (typeof c.updateThemeIcon === 'function') {
          c.updateThemeIcon();
        }
      });

      expect(asCard(card).map).toBeDefined();
    });

    it('builds route point with all optional attributes', () => {
      const state = {
        attributes: {
          altitude: 150,
          battery_level: 85,
          gps_accuracy: 5,
          latitude: 10,
          longitude: 20,
          source_type: 'gps',
          speed: 42,
        },
        last_updated: '1970-01-01T00:00:00Z',
      };
      const point = (RouteTrackerCard as unknown as CardStaticInternals).buildRoutePoint(
        state,
        [10, 20],
      );
      expect(point.altitude).toBe(150);
      expect(point.battery_level).toBe(85);
      expect(point.gps_accuracy).toBe(5);
      expect(point.source_type).toBe('gps');
      expect(point.speed).toBe(42);
    });

    it('uses default minimal_distance when config omits it', async () => {
      mockHass.callApi = vi.fn().mockResolvedValue([
        [
          {
            attributes: { latitude: 10.0, longitude: 10.0 },
            entity_id: 'device_tracker.test',
            last_updated: '1970-01-01T12:00:00Z',
          },
        ],
      ]);
      mockHass.states['device_tracker.test'] = {
        attributes: { latitude: 10.001, longitude: 10.001 },
        entity_id: 'device_tracker.test',
        last_updated: '1970-01-01T12:10:00Z',
        state: 'home',
      } as any;

      card.setConfig({ entities: [{ entity: 'device_tracker.test' }] });
      await card.updateComplete;

      asCard(card).selectedDevice = 'device_tracker.test';
      asCard(card).selectedDate = '1970-01-01';
      await card.updateComplete;

      await new Promise((resolve) => setTimeout(resolve, 150));

      const points = assertDefined(asCard(card)._lastPoints);
      expect(points.length).toBe(2);
    });
  });
});
