import * as L from 'leaflet';
import { resetViewSvg } from '../icons/reset-view.ts';
import { themeToggleSvg } from '../icons/theme-toggle.ts';

interface ThemeControlContainer extends HTMLElement {
  updateThemeIcon: () => void;
}

export function createResetControl(
  localize: (key: string, lang: string) => string,
  currentLang: string,
  onReset: () => void,
): L.Control {
  const ResetControl = L.Control.extend({
    onAdd: () => {
      const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
      const link = L.DomUtil.create('a', '', container);
      link.href = '#';
      link.title = localize('card.reset_view', currentLang);
      link.style.display = 'flex';
      link.style.justifyContent = 'center';
      link.style.alignItems = 'center';
      link.style.cursor = 'pointer';
      link.innerHTML = resetViewSvg;

      link.onclick = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        onReset();
      };

      L.DomEvent.disableClickPropagation(container);
      return container;
    },
    options: { position: 'topleft' },
  });
  return new ResetControl();
}

export function createThemeControl(
  localize: (key: string, lang: string) => string,
  currentLang: string,
  getIsSatellite: () => boolean,
  getIsDarkMode: () => boolean,
  onToggleTheme: () => void,
): L.Control {
  const ThemeControl = L.Control.extend({
    onAdd: () => {
      const container = L.DomUtil.create(
        'div',
        'leaflet-bar leaflet-control',
      ) as unknown as ThemeControlContainer;
      const link = L.DomUtil.create('a', '', container);
      link.href = '#';
      link.title = localize('card.toggle_theme', currentLang);
      link.style.display = 'flex';
      link.style.justifyContent = 'center';
      link.style.alignItems = 'center';
      link.style.cursor = 'pointer';

      function applyThemeIconVisibility(visible: boolean): void {
        container.style.display = visible ? 'block' : 'none';
      }

      function applyThemeIconTransform(isDark: boolean): void {
        const moon = link.querySelector('.theme-moon') as HTMLElement;
        const sun = link.querySelector('.theme-sun') as HTMLElement;
        if (!moon || !sun) {
          return;
        }
        if (isDark) {
          moon.style.opacity = '1';
          moon.style.transform = 'rotate(0deg) scale(1)';
          sun.style.opacity = '0';
          sun.style.transform = 'rotate(90deg) scale(0.5)';
        } else {
          moon.style.opacity = '0';
          moon.style.transform = 'rotate(-90deg) scale(0.5)';
          sun.style.opacity = '1';
          sun.style.transform = 'rotate(0deg) scale(1)';
        }
      }

      function ensureThemeSvgRendered(): void {
        if (link.children.length === 0) {
          link.innerHTML = themeToggleSvg;
        }
      }

      const updateIcon = () => {
        if (getIsSatellite()) {
          applyThemeIconVisibility(false);
          return;
        }
        applyThemeIconVisibility(true);
        ensureThemeSvgRendered();
        applyThemeIconTransform(getIsDarkMode());
      };
      updateIcon();
      container.updateThemeIcon = updateIcon;

      link.onclick = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        if (getIsSatellite()) return;
        onToggleTheme();
      };

      L.DomEvent.disableClickPropagation(container);
      return container;
    },
    options: { position: 'topleft' },
  });
  return new ThemeControl();
}
