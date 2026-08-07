import { describe, expect, it } from 'vitest';
import * as cardLayout from './card-layout';
import * as leafletOverrides from './leaflet-overrides';
import * as mapFilters from './map-filters';
import * as uiControls from './ui-controls';

describe('CSS Module Exports', () => {
  it('should have exports', () => {
    expect(Object.keys(cardLayout).length).toBeGreaterThan(0);
    expect(Object.keys(leafletOverrides).length).toBeGreaterThan(0);
    expect(Object.keys(mapFilters).length).toBeGreaterThan(0);
    expect(Object.keys(uiControls).length).toBeGreaterThan(0);
  });
});
