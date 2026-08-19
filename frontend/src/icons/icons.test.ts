import { describe, expect, it } from 'vitest';
import * as accuracy from './accuracy.ts';
import * as altitude from './altitude.ts';
import * as hamburger from './hamburger.ts';
import * as marker from './marker.ts';
import * as resetView from './reset-view.ts';
import * as source from './source.ts';
import * as speed from './speed.ts';
import * as themeToggle from './theme-toggle.ts';

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
