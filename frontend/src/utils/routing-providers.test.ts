import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROUTING_PROVIDER,
  ROUTING_PROVIDERS,
  type RoutingProvider,
  resolveRoutingProvider,
} from './routing-providers.ts';

type ProviderId = 'osm' | 'google' | 'apple' | 'yandex';
const providers = ROUTING_PROVIDERS as Record<ProviderId, RoutingProvider>;

describe('resolveRoutingProvider()', () => {
  it('defines the expected set of routing providers', () => {
    expect(ROUTING_PROVIDERS).toHaveProperty('osm');
    expect(ROUTING_PROVIDERS).toHaveProperty('google');
    expect(ROUTING_PROVIDERS).toHaveProperty('apple');
    expect(ROUTING_PROVIDERS).toHaveProperty('yandex');
    expect(ROUTING_PROVIDERS).not.toHaveProperty('waze');
  });

  it('has OSM configured as the default provider', () => {
    expect(DEFAULT_ROUTING_PROVIDER).toBe('osm');
  });

  it('builds the OpenStreetMap URL correctly', () => {
    const url = providers.osm.buildUrl(0.0, 0.0);
    expect(url).toBe('https://www.openstreetmap.org/directions?to=0,0');

    const urlWithOrigin = providers.osm.buildUrl(0.0, 0.0, 1.1, 2.2);
    expect(urlWithOrigin).toBe('https://www.openstreetmap.org/directions?route=1.1,2.2;0,0');
  });

  it('builds the Google Maps URL correctly', () => {
    const url = providers.google.buildUrl(0.0, 0.0);
    expect(url).toBe('https://www.google.com/maps/dir/?api=1&destination=0,0');

    const urlWithOrigin = providers.google.buildUrl(0.0, 0.0, 1.1, 2.2);
    expect(urlWithOrigin).toBe(
      'https://www.google.com/maps/dir/?api=1&origin=1.1,2.2&destination=0,0',
    );
  });

  it('builds the Apple Maps URL correctly', () => {
    const url = providers.apple.buildUrl(0.0, 0.0);
    expect(url).toBe('https://maps.apple.com/?daddr=0,0');

    const urlWithOrigin = providers.apple.buildUrl(0.0, 0.0, 1.1, 2.2);
    expect(urlWithOrigin).toBe('https://maps.apple.com/?saddr=1.1,2.2&daddr=0,0');
  });

  it('builds the Yandex Maps URL correctly', () => {
    const url = providers.yandex.buildUrl(0.0, 0.0);
    expect(url).toBe('https://yandex.ru/maps/?rtext=~0,0');

    const urlWithOrigin = providers.yandex.buildUrl(0.0, 0.0, 1.1, 2.2);
    expect(urlWithOrigin).toBe('https://yandex.ru/maps/?rtext=1.1,2.2~0,0');
  });

  it('resolves a registered routing provider by id', () => {
    expect(resolveRoutingProvider('google').id).toBe('google');
    expect(resolveRoutingProvider('osm').id).toBe('osm');
  });

  it('falls back to the default routing provider for unknown ids', () => {
    expect(resolveRoutingProvider('waze').id).toBe(DEFAULT_ROUTING_PROVIDER);
  });

  it('throws when neither the requested nor the default provider is registered', () => {
    const original = ROUTING_PROVIDERS[DEFAULT_ROUTING_PROVIDER];
    Object.defineProperty(ROUTING_PROVIDERS, DEFAULT_ROUTING_PROVIDER, {
      configurable: true,
      value: undefined,
    });
    try {
      expect(() => resolveRoutingProvider('waze')).toThrow(
        `Routing provider 'waze' is not registered`,
      );
    } finally {
      Object.defineProperty(ROUTING_PROVIDERS, DEFAULT_ROUTING_PROVIDER, {
        configurable: true,
        value: original,
      });
    }
  });
});
