import { describe, expect, it } from 'vitest';
import * as hamburger from './hamburger';
import * as marker from './marker';
import * as resetView from './reset-view';
import * as themeToggle from './theme-toggle';

describe('Icons', () => {
  it('exports defined SVG strings for all icons', () => {
    expect(Object.keys(hamburger).length).toBeGreaterThan(0);
    expect(Object.keys(marker).length).toBeGreaterThan(0);
    expect(Object.keys(resetView).length).toBeGreaterThan(0);
    expect(Object.keys(themeToggle).length).toBeGreaterThan(0);
  });
});
