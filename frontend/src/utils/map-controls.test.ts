import { describe, expect, it, vi } from 'vitest';
import { createResetControl, createThemeControl } from './map-controls';

describe('map-controls', () => {
  const localize = vi.fn((key: string) => `translated_${key}`);

  describe('createResetControl', () => {
    it('creates control and triggers onReset on click', () => {
      const onReset = vi.fn();
      const control = createResetControl(localize, 'en', onReset);
      
      const container = (control as any).options ? (control as any).onAdd() : undefined;
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

  describe('createThemeControl', () => {
    it('creates control and toggles theme', () => {
      let isSatellite = false;
      let isDark = false;
      
      const getIsSatellite = vi.fn(() => isSatellite);
      const getIsDarkMode = vi.fn(() => isDark);
      const onToggleTheme = vi.fn();

      const control = createThemeControl(localize, 'en', getIsSatellite, getIsDarkMode, onToggleTheme);
      const container = (control as any).onAdd();
      expect(container).toBeDefined();
      
      const link = container.querySelector('a');
      expect(link?.title).toBe('translated_card.toggle_theme');

      const event = new MouseEvent('click');
      event.preventDefault = vi.fn();
      event.stopPropagation = vi.fn();
      link?.onclick?.(event as any);
      expect(onToggleTheme).toHaveBeenCalled();

      isSatellite = true;
      (container as any).updateThemeIcon();
      expect(container.style.display).toBe('none');

      isSatellite = false;
      isDark = true;
      (container as any).updateThemeIcon();
      expect(container.style.display).toBe('block');
      
      const moon = link?.querySelector('.theme-moon') as HTMLElement;
      expect(moon).toBeDefined();
      expect(moon?.style.opacity).toBe('1');
    });

    it('does not toggle theme if satellite is active', () => {
      const getIsSatellite = vi.fn(() => true);
      const getIsDarkMode = vi.fn(() => false);
      const onToggleTheme = vi.fn();

      const control = createThemeControl(localize, 'en', getIsSatellite, getIsDarkMode, onToggleTheme);
      const container = (control as any).onAdd();
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

      const control = createThemeControl(localize, 'en', getIsSatellite, getIsDarkMode, onToggleTheme);
      const container = (control as any).onAdd();
      const link = container.querySelector('a');

      if (link) {
        link.innerHTML = '<div></div>';
      }

      expect(() => {
        (container as any).updateThemeIcon();
      }).not.toThrow();
    });
  });
});
