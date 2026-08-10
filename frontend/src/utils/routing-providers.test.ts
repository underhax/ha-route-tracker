import { describe, expect, it } from 'vitest';
import { ROUTING_PROVIDERS, DEFAULT_ROUTING_PROVIDER } from './routing-providers';

describe('RoutingProviders', () => {
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
    const url = ROUTING_PROVIDERS['osm']!.buildUrl(0.0, 0.0);
    expect(url).toBe('https://www.openstreetmap.org/directions?to=0,0');

    const urlWithOrigin = ROUTING_PROVIDERS['osm']!.buildUrl(0.0, 0.0, 1.1, 2.2);
    expect(urlWithOrigin).toBe('https://www.openstreetmap.org/directions?route=1.1,2.2;0,0');
  });

  it('builds the Google Maps URL correctly', () => {
    const url = ROUTING_PROVIDERS['google']!.buildUrl(0.0, 0.0);
    expect(url).toBe('https://www.google.com/maps/dir/?api=1&destination=0,0');

    const urlWithOrigin = ROUTING_PROVIDERS['google']!.buildUrl(0.0, 0.0, 1.1, 2.2);
    expect(urlWithOrigin).toBe('https://www.google.com/maps/dir/?api=1&origin=1.1,2.2&destination=0,0');
  });

  it('builds the Apple Maps URL correctly', () => {
    const url = ROUTING_PROVIDERS['apple']!.buildUrl(0.0, 0.0);
    expect(url).toBe('https://maps.apple.com/?daddr=0,0');

    const urlWithOrigin = ROUTING_PROVIDERS['apple']!.buildUrl(0.0, 0.0, 1.1, 2.2);
    expect(urlWithOrigin).toBe('https://maps.apple.com/?saddr=1.1,2.2&daddr=0,0');
  });

  it('builds the Yandex Maps URL correctly', () => {
    const url = ROUTING_PROVIDERS['yandex']!.buildUrl(0.0, 0.0);
    expect(url).toBe('https://yandex.ru/maps/?rtext=~0,0');

    const urlWithOrigin = ROUTING_PROVIDERS['yandex']!.buildUrl(0.0, 0.0, 1.1, 2.2);
    expect(urlWithOrigin).toBe('https://yandex.ru/maps/?rtext=1.1,2.2~0,0');
  });
});
