import { describe, expect, it, vi } from 'vitest';
import { getBaseMaps } from './map-providers';

vi.mock('leaflet', () => {
  return {
    tileLayer: vi.fn(() => ({})),
  };
});

describe('MapProviders', () => {
  it('returns defined base map configurations', () => {
    const maps = getBaseMaps();
    expect(Object.keys(maps).length).toBeGreaterThan(0);
    expect(maps['OpenStreetMap DE']).toBeDefined();
  });
});
