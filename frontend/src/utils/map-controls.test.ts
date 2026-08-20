import type * as L from 'leaflet';
import { describe, expect, it, vi } from 'vitest';
import { createResetControl, createThemeControl } from './map-controls.ts';

interface ThemeControlContainer extends HTMLElement {
  updateThemeIcon: () => void;
}

const localize = vi.fn((key: string) => `translated_${key}`);
const mockMap = {} as L.Map;

function callOnAdd(control: L.Control): HTMLElement {
  const { onAdd } = control;
  if (!onAdd) {
    throw new Error('onAdd is not defined on this control');
  }
  return onAdd.call(control, mockMap);
}

describe('createResetControl()', () => {
  it('creates control and triggers onReset on click', () => {
    const onReset = vi.fn();
    const control = createResetControl(localize, 'en', onReset);

    const container = callOnAdd(control as L.Control);
    expect(container).toBeDefined();

    const link = container.querySelector('a');
    expect(link).toBeDefined();
    expect(link?.title).toBe('translated_card.reset_view');

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    event.preventDefault = vi.fn();
    event.stopPropagation = vi.fn();
    link?.dispatchEvent(event);
    link?.onclick?.(event as any);

    expect(onReset).toHaveBeenCalled();
  });
});

describe('createThemeControl()', () => {
  it('creates control and toggles theme', () => {
    let isSatellite = false;
    let isDark = false;

    const getIsSatellite = vi.fn(() => isSatellite);
    const getIsDarkMode = vi.fn(() => isDark);
    const onToggleTheme = vi.fn();

    const control = createThemeControl(
      localize,
      'en',
      getIsSatellite,
      getIsDarkMode,
      onToggleTheme,
    );
    const container = callOnAdd(control as L.Control) as unknown as ThemeControlContainer;
    expect(container).toBeDefined();

    const link = container.querySelector('a');
    expect(link?.title).toBe('translated_card.toggle_theme');

    const event = new MouseEvent('click');
    event.preventDefault = vi.fn();
    event.stopPropagation = vi.fn();
    link?.onclick?.(event as any);
    expect(onToggleTheme).toHaveBeenCalled();

    isSatellite = true;
    container.updateThemeIcon();
    expect(container.style.display).toBe('none');

    isSatellite = false;
    isDark = true;
    container.updateThemeIcon();
    expect(container.style.display).toBe('block');

    const moon = link?.querySelector('.theme-moon') as HTMLElement;
    expect(moon).toBeDefined();
    expect(moon?.style.opacity).toBe('1');
  });

  it('does not toggle theme if satellite is active', () => {
    const getIsSatellite = vi.fn(() => true);
    const getIsDarkMode = vi.fn(() => false);
    const onToggleTheme = vi.fn();

    const control = createThemeControl(
      localize,
      'en',
      getIsSatellite,
      getIsDarkMode,
      onToggleTheme,
    );
    const container = callOnAdd(control as L.Control);
    const link = container.querySelector('a');

    const event = new MouseEvent('click');
    event.preventDefault = vi.fn();
    event.stopPropagation = vi.fn();
    link?.onclick?.(event as any);

    expect(onToggleTheme).not.toHaveBeenCalled();
  });

  it('handles missing SVG elements gracefully', () => {
    const getIsSatellite = vi.fn(() => false);
    const getIsDarkMode = vi.fn(() => false);
    const onToggleTheme = vi.fn();

    const control = createThemeControl(
      localize,
      'en',
      getIsSatellite,
      getIsDarkMode,
      onToggleTheme,
    );
    const container = callOnAdd(control as L.Control) as unknown as ThemeControlContainer;
    const link = container.querySelector('a');

    if (link) {
      link.innerHTML = '<div></div>';
    }

    expect(() => {
      container.updateThemeIcon();
    }).not.toThrow();
  });
});
