import { RoutePoint } from './route-drawer';
import { copySvg } from '../icons/copy';
import { checkSvg } from '../icons/check';
import { searchSvg } from '../icons/search';
import { fetchAddress } from './geocoder';

export function buildPopupContent(
  point: RoutePoint,
  language: string,
  localize: (key: string, lang: string) => string
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'rt-popup-container';

  const timeEl = document.createElement('div');
  timeEl.className = 'rt-popup-time';
  timeEl.textContent = point.timestamp;
  container.appendChild(timeEl);

  const coordsContainer = document.createElement('div');
  coordsContainer.className = 'rt-popup-coords';

  const coordsTextDisplay = `${point.loc.lat.toFixed(5)}, ${point.loc.lng.toFixed(5)}`;
  const coordsTextCopy = `${point.loc.lat.toFixed(5)},${point.loc.lng.toFixed(5)}`;
  
  const coordsSpan = document.createElement('span');
  coordsSpan.textContent = coordsTextDisplay;

  const copyBtn = document.createElement('button');
  copyBtn.className = 'rt-popup-copy-btn';
  copyBtn.innerHTML = copySvg;
  copyBtn.title = localize('card.copy_coords', language) || 'Copy coordinates';
  
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(coordsTextCopy).then(() => {
      copyBtn.innerHTML = checkSvg;
      copyBtn.classList.add('copied');
      setTimeout(() => {
        copyBtn.innerHTML = copySvg;
        copyBtn.classList.remove('copied');
      }, 2000);
    });
  };

  coordsContainer.appendChild(coordsSpan);
  coordsContainer.appendChild(copyBtn);
  container.appendChild(coordsContainer);

  const divider = document.createElement('div');
  divider.className = 'rt-popup-divider';
  container.appendChild(divider);

  const geocodeBtn = document.createElement('button');
  geocodeBtn.className = 'rt-popup-geocode-btn';
  const labelText = localize('card.get_address', language) || 'Get Address';
  geocodeBtn.innerHTML = `${searchSvg}<span>${labelText}</span>`;

  geocodeBtn.onclick = async () => {
    geocodeBtn.disabled = true;
    geocodeBtn.style.opacity = '0.5';
    
    const address = await fetchAddress(point.loc.lat, point.loc.lng, language);
    
    if (address) {
      const addressEl = document.createElement('div');
      addressEl.className = 'rt-popup-address';
      addressEl.textContent = address;
      container.replaceChild(addressEl, geocodeBtn);
    } else {
      geocodeBtn.disabled = false;
      geocodeBtn.style.opacity = '1';
    }
  };

  container.appendChild(geocodeBtn);

  return container;
}
