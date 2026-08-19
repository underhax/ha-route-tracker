import * as L from 'leaflet';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as geocoder from './geocoder.ts';
import { buildPopupContent } from './popup-builder.ts';
import type { RoutePoint } from './route-drawer.ts';

interface ZoneStateMock {
  attributes: { latitude?: string; longitude?: string };
}

interface HassMock {
  config?: { unit_system?: { length?: string } };
  states?: Record<string, ZoneStateMock>;
}

function clickEvent(): PointerEvent {
  return new MouseEvent('click') as unknown as PointerEvent;
}

describe('buildPopupContent()', () => {
  const mockLocalize = vi.fn((key: string) => `translated_${key}`);
  const point: RoutePoint = {
    loc: L.latLng(0, 0),
    timestamp: '1970-01-01 00:00:00',
  };

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('constructs popup DOM and handles clipboard copy operations', async () => {
    const popup = buildPopupContent(point, 'en', mockLocalize);
    expect(popup.querySelector('.rt-popup-time')?.textContent).toBe('1970-01-01 00:00:00');

    const coordsSpan = popup.querySelector('.rt-popup-coords span');
    expect(coordsSpan?.textContent).toBe('0.00000, 0.00000');

    const copyBtn = popup.querySelector('.rt-popup-copy-btn') as HTMLButtonElement;
    expect(copyBtn).toBeDefined();

    await copyBtn.onclick?.(clickEvent());

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('0.00000,0.00000');
    expect(copyBtn.innerHTML).toContain('M21,7L9,19');
    expect(copyBtn.classList.contains('copied')).toBe(true);

    vi.runAllTimers();
    expect(copyBtn.innerHTML).toContain('M19,21H8V7');
    expect(copyBtn.classList.contains('copied')).toBe(false);
  });

  it('renders extra attributes when provided', () => {
    const pointWithExtra: RoutePoint = {
      altitude: 100.5,
      battery_level: 65,
      gps_accuracy: 10,
      loc: L.latLng(0, 0),
      source_type: 'gps',
      speed: 60,
      timestamp: '1970-01-01 00:00:00',
    };
    const popup = buildPopupContent(pointWithExtra, 'en', mockLocalize);
    const extraAttrs = popup.querySelector('.rt-popup-extra-attrs');

    expect(extraAttrs).toBeDefined();
    expect(extraAttrs?.innerHTML).toContain('title="translated_card.source_type: gps"');
    expect(extraAttrs?.innerHTML).toContain(
      'title="translated_card.gps_accuracy: 10 translated_card.unit_m"',
    );
    expect(extraAttrs?.innerHTML).toContain(
      'title="translated_card.altitude: 100.5 translated_card.unit_m"',
    );
    expect(extraAttrs?.innerHTML).toContain(
      'title="translated_card.speed: 60 translated_card.unit_kmh"',
    );
    expect(extraAttrs?.innerHTML).toContain('title="translated_card.battery_level: 65%"');
  });

  it('uses default fallback labels for extra attributes if translation is missing', () => {
    const emptyLocalize = vi.fn(() => '');
    const pointWithExtra: RoutePoint = {
      altitude: 100.5,
      battery_level: 65,
      gps_accuracy: 10,
      loc: L.latLng(0, 0),
      source_type: 'gps',
      speed: 60,
      timestamp: '1970-01-01 00:00:00',
    };
    const popup = buildPopupContent(pointWithExtra, 'en', emptyLocalize);
    const extraAttrs = popup.querySelector('.rt-popup-extra-attrs');

    expect(extraAttrs).toBeDefined();
    expect(extraAttrs?.innerHTML).toContain('title="Source: gps"');
    expect(extraAttrs?.innerHTML).toContain('title="Accuracy: 10 m"');
    expect(extraAttrs?.innerHTML).toContain('title="Altitude: 100.5 m"');
    expect(extraAttrs?.innerHTML).toContain('title="Speed: 60 km/h"');
    expect(extraAttrs?.innerHTML).toContain('title="Battery: 65%"');
  });

  it('renders extra attributes using US customary units when hass config is imperial', () => {
    const mockHassImperial: HassMock = {
      config: {
        unit_system: {
          length: 'mi',
        },
      },
    };
    const pointWithExtra: RoutePoint = {
      altitude: 100.5,
      gps_accuracy: 10,
      loc: L.latLng(0, 0),
      source_type: 'gps',
      speed: 60,
      timestamp: '1970-01-01 00:00:00',
    };
    const popup = buildPopupContent(
      pointWithExtra,
      'en',
      mockLocalize,
      'osm',
      false,
      false,
      'device',
      mockHassImperial,
    );
    const extraAttrs = popup.querySelector('.rt-popup-extra-attrs');

    expect(extraAttrs).toBeDefined();
    expect(extraAttrs?.innerHTML).toContain(
      'title="translated_card.altitude: 100.5 translated_card.unit_ft"',
    );
    expect(extraAttrs?.innerHTML).toContain(
      'title="translated_card.speed: 60 translated_card.unit_mph"',
    );
  });

  it('uses default fallback labels for US customary units if translation is missing', () => {
    const emptyLocalize = vi.fn(() => '');
    const mockHassImperial: HassMock = {
      config: {
        unit_system: {
          length: 'mi',
        },
      },
    };
    const pointWithExtra: RoutePoint = {
      altitude: 100.5,
      gps_accuracy: 10,
      loc: L.latLng(0, 0),
      source_type: 'gps',
      speed: 60,
      timestamp: '1970-01-01 00:00:00',
    };
    const popup = buildPopupContent(
      pointWithExtra,
      'en',
      emptyLocalize,
      'osm',
      false,
      false,
      'device',
      mockHassImperial,
    );
    const extraAttrs = popup.querySelector('.rt-popup-extra-attrs');

    expect(extraAttrs).toBeDefined();
    expect(extraAttrs?.innerHTML).toContain('title="Altitude: 100.5 ft"');
    expect(extraAttrs?.innerHTML).toContain('title="Speed: 60 mph"');
  });

  it('processes successful geocoding responses and updates DOM', async () => {
    const fetchSpy = vi.spyOn(geocoder, 'fetchAddress').mockResolvedValue('Mocked Address, City');
    const popup = buildPopupContent(point, 'en', mockLocalize, 'osm', true, true, 'device');

    const geocodeBtn = popup.querySelector('.rt-popup-geocode-btn') as HTMLButtonElement;
    expect(geocodeBtn).toBeDefined();

    await geocodeBtn.onclick?.(clickEvent());

    expect(fetchSpy).toHaveBeenCalledWith(0, 0, 'en');

    const addressEl = popup.querySelector('.rt-popup-address');
    expect(addressEl).toBeDefined();
    expect(addressEl?.textContent).toBe('Mocked Address, City');
    expect(popup.querySelector('.rt-popup-geocode-btn')).toBeNull();
  });

  it('renders routing button with default OSM provider', () => {
    const popup = buildPopupContent(point, 'en', mockLocalize, 'osm', true, true, 'device');
    const routeBtn = popup.querySelector('.rt-popup-route-btn') as HTMLAnchorElement;

    expect(routeBtn).toBeDefined();
    expect(routeBtn.href).toBe('https://www.openstreetmap.org/directions?to=0,0');
    expect(routeBtn.target).toBe('_blank');
    expect(routeBtn.textContent).toBe('translated_card.build_route');
  });

  it('renders routing button with specified provider', () => {
    const popup = buildPopupContent(point, 'en', mockLocalize, 'google', true, true, 'device');
    const routeBtn = popup.querySelector('.rt-popup-route-btn') as HTMLAnchorElement;

    expect(routeBtn).toBeDefined();
    expect(routeBtn.href).toBe('https://www.google.com/maps/dir/?api=1&destination=0,0');
  });

  it('handles geocoding failures and restores button state', async () => {
    const fetchSpy = vi.spyOn(geocoder, 'fetchAddress').mockResolvedValue(null);
    const popup = buildPopupContent(point, 'en', mockLocalize, 'osm', true, true, 'device');

    const geocodeBtn = popup.querySelector('.rt-popup-geocode-btn') as HTMLButtonElement;

    await geocodeBtn.onclick?.(clickEvent());

    expect(fetchSpy).toHaveBeenCalled();

    expect(geocodeBtn.disabled).toBe(false);
    expect(geocodeBtn.style.opacity).toBe('1');

    expect(popup.querySelector('.rt-popup-address')).toBeNull();
  });

  it('applies default English labels when localization keys are missing', () => {
    const emptyLocalize = vi.fn(() => '');
    const popup = buildPopupContent(point, 'en', emptyLocalize, 'osm', true, true, 'device');

    const copyBtn = popup.querySelector('.rt-popup-copy-btn') as HTMLButtonElement;
    expect(copyBtn.title).toBe('Copy coordinates');

    const geocodeBtn = popup.querySelector('.rt-popup-geocode-btn') as HTMLButtonElement;
    expect(geocodeBtn.textContent).toBe('Get Address');

    const routeBtn = popup.querySelector('.rt-popup-route-btn') as HTMLAnchorElement;
    expect(routeBtn.textContent).toBe('Build Route');
  });

  it('extracts origin from zone and builds route URL', () => {
    const mockHass: HassMock = {
      states: {
        'zone.home': {
          attributes: {
            latitude: '10',
            longitude: '20',
          },
        },
      },
    };
    const popup = buildPopupContent(
      point,
      'en',
      mockLocalize,
      'osm',
      false,
      true,
      'zone.home',
      mockHass,
    );
    const routeBtn = popup.querySelector('.rt-popup-route-btn') as HTMLAnchorElement;
    expect(routeBtn.href).toContain('route=10,20;0,0');
  });

  it('handles invalid zone coordinates gracefully', () => {
    const mockHass: HassMock = {
      states: {
        'zone.bad': {
          attributes: {
            latitude: 'invalid',
            longitude: 'invalid',
          },
        },
      },
    };
    const popup = buildPopupContent(
      point,
      'en',
      mockLocalize,
      'osm',
      false,
      true,
      'zone.bad',
      mockHass,
    );
    const routeBtn = popup.querySelector('.rt-popup-route-btn') as HTMLAnchorElement;
    expect(routeBtn.href).toBe('https://www.openstreetmap.org/directions?to=0,0');
  });

  it('handles zone without coordinates attributes', () => {
    const mockHass: HassMock = {
      states: {
        'zone.no_coords': {
          attributes: {},
        },
      },
    };
    const popup = buildPopupContent(
      point,
      'en',
      mockLocalize,
      'osm',
      false,
      true,
      'zone.no_coords',
      mockHass,
    );
    const routeBtn = popup.querySelector('.rt-popup-route-btn') as HTMLAnchorElement;
    expect(routeBtn.href).toBe('https://www.openstreetmap.org/directions?to=0,0');
  });

  it('falls back to default routing provider if invalid provider is passed', () => {
    const popup = buildPopupContent(
      point,
      'en',
      mockLocalize,
      'invalid_provider',
      false,
      true,
      'device',
    );
    const routeBtn = popup.querySelector('.rt-popup-route-btn') as HTMLAnchorElement;
    expect(routeBtn.href).toBe('https://www.openstreetmap.org/directions?to=0,0');
  });
});
