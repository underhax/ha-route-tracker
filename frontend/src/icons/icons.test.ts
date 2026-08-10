import { describe, expect, it } from 'vitest';
import * as hamburger from './hamburger';
import * as marker from './marker';
import * as resetView from './reset-view';
import * as themeToggle from './theme-toggle';
import * as source from './source';
import * as accuracy from './accuracy';
import * as altitude from './altitude';
import * as speed from './speed';

describe('Icons', () => {
  it('exports defined SVG strings for all icons', () => {
    expect(Object.keys(hamburger).length).toBeGreaterThan(0);
    expect(Object.keys(marker).length).toBeGreaterThan(0);
    expect(Object.keys(resetView).length).toBeGreaterThan(0);
    expect(Object.keys(themeToggle).length).toBeGreaterThan(0);
    expect(Object.keys(source).length).toBeGreaterThan(0);
    expect(Object.keys(accuracy).length).toBeGreaterThan(0);
    expect(Object.keys(altitude).length).toBeGreaterThan(0);
    expect(Object.keys(speed).length).toBeGreaterThan(0);
  });
});
