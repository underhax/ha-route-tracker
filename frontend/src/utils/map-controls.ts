import * as L from 'leaflet';
import { resetViewSvg } from '../icons/reset-view';
import { themeToggleSvg } from '../icons/theme-toggle';

export function createResetControl(
  localize: (key: string, lang: string) => string,
  currentLang: string,
  onReset: () => void
): L.Control {
  const ResetControl = L.Control.extend({
    options: { position: 'topleft' },
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

      link.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        onReset();
      };

      L.DomEvent.disableClickPropagation(container);
      return container;
    }
  });
  return new ResetControl();
}

export function createThemeControl(
  localize: (key: string, lang: string) => string,
  currentLang: string,
  getIsSatellite: () => boolean,
  getIsDarkMode: () => boolean,
  onToggleTheme: () => void
): L.Control {
  const ThemeControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd: () => {
      const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
      const link = L.DomUtil.create('a', '', container);
      link.href = '#';
      link.title = localize('card.toggle_theme', currentLang);
      link.style.display = 'flex';
      link.style.justifyContent = 'center';
      link.style.alignItems = 'center';
      link.style.cursor = 'pointer';

      const updateIcon = () => {
        if (getIsSatellite()) {
          container.style.display = 'none';
        } else {
          container.style.display = 'block';

          const isDark = getIsDarkMode();
          if (link.children.length === 0) {
            link.innerHTML = themeToggleSvg;
          }

          const moon = link.querySelector('.theme-moon') as HTMLElement;
          const sun = link.querySelector('.theme-sun') as HTMLElement;
          if (moon && sun) {
            moon.style.opacity = isDark ? '1' : '0';
            moon.style.transform = isDark ? 'rotate(0deg) scale(1)' : 'rotate(-90deg) scale(0.5)';

            sun.style.opacity = isDark ? '0' : '1';
            sun.style.transform = isDark ? 'rotate(90deg) scale(0.5)' : 'rotate(0deg) scale(1)';
          }
        }
      };
      updateIcon();
      (container as any).updateThemeIcon = updateIcon;

      link.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (getIsSatellite()) return;
        onToggleTheme();
      };

      L.DomEvent.disableClickPropagation(container);
      return container;
    }
  });
  return new ThemeControl();
}
