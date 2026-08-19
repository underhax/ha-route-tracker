import { describe, expect, it } from 'vitest';
import * as cardLayout from './card-layout.ts';
import * as leafletOverrides from './leaflet-overrides.ts';
import * as mapFilters from './map-filters.ts';
import * as uiControls from './ui-controls.ts';

describe('CSSModules', () => {
  it('exports defined CSSResult objects for all styles', () => {
    expect(Object.keys(cardLayout).length).toBeGreaterThan(0);
    expect(Object.keys(leafletOverrides).length).toBeGreaterThan(0);
    expect(Object.keys(mapFilters).length).toBeGreaterThan(0);
    expect(Object.keys(uiControls).length).toBeGreaterThan(0);
  });
});
