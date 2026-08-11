import { RoutePoint } from './route-drawer';
import { copySvg } from '../icons/copy';
import { checkSvg } from '../icons/check';
import { searchSvg } from '../icons/search';
import { routeSvg } from '../icons/route';
import { sourceSvg } from '../icons/source';
import { accuracySvg } from '../icons/accuracy';
import { altitudeSvg } from '../icons/altitude';
import { speedSvg } from '../icons/speed';
import { batterySvg } from '../icons/battery';
import { fetchAddress } from './geocoder';
import { ROUTING_PROVIDERS, DEFAULT_ROUTING_PROVIDER } from './routing-providers';

export function buildPopupContent(
  point: RoutePoint,
  language: string,
  localize: (key: string, lang: string) => string,
  routingProvider: string = DEFAULT_ROUTING_PROVIDER,
  enableGeocoding: boolean = false,
  enableRouting: boolean = false,
  routeOrigin: string = 'device',
  hass?: any
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

  const extraParts: HTMLElement[] = [];

  let speedUnit = localize('card.unit_kmh', language) || 'km/h';
  let altUnit = localize('card.unit_m', language) || 'm';
  if (hass?.config?.unit_system?.length === 'mi' || hass?.config?.unit_system?.length === 'miles') {
    speedUnit = localize('card.unit_mph', language) || 'mph';
    altUnit = localize('card.unit_ft', language) || 'ft';
  }

  const createAttrNode = (iconSvg: string, valueText: string, titleLabel: string): HTMLElement => {
    const attrDiv = document.createElement('div');
    attrDiv.className = 'rt-popup-attr';
    attrDiv.title = titleLabel;
    attrDiv.innerHTML = `${iconSvg}<span class="rt-popup-attr-value">${valueText}</span>`;
    return attrDiv;
  };

  if (point.source_type) {
    extraParts.push(createAttrNode(sourceSvg, point.source_type, `${localize('card.source_type', language) || 'Source'}: ${point.source_type}`));
  }
  if (point.gps_accuracy !== undefined && point.gps_accuracy !== 0) {
    const unitM = localize('card.unit_m', language) || 'm';
    extraParts.push(createAttrNode(accuracySvg, `${point.gps_accuracy} ${unitM}`, `${localize('card.gps_accuracy', language) || 'Accuracy'}: ${point.gps_accuracy} ${unitM}`));
  }
  if (point.altitude !== undefined) {
    extraParts.push(createAttrNode(altitudeSvg, `${point.altitude} ${altUnit}`, `${localize('card.altitude', language) || 'Altitude'}: ${point.altitude} ${altUnit}`));
  }
  if (point.speed !== undefined && point.speed !== 0) {
    extraParts.push(createAttrNode(speedSvg, `${point.speed} ${speedUnit}`, `${localize('card.speed', language) || 'Speed'}: ${point.speed} ${speedUnit}`));
  }
  if (point.battery_level !== undefined) {
    extraParts.push(createAttrNode(batterySvg, `${point.battery_level}%`, `${localize('card.battery_level', language) || 'Battery'}: ${point.battery_level}%`));
  }

  if (extraParts.length > 0) {
    const extraContainer = document.createElement('div');
    extraContainer.className = 'rt-popup-extra-attrs';
    extraParts.forEach(part => extraContainer.appendChild(part));
    container.appendChild(extraContainer);
  }

  if (enableGeocoding) {
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
  }

  if (enableRouting) {
    const routeDivider = document.createElement('div');
    routeDivider.className = 'rt-popup-divider';
    container.appendChild(routeDivider);

    const routeBtn = document.createElement('a');
    routeBtn.className = 'rt-popup-route-btn';
    routeBtn.target = '_blank';
    routeBtn.rel = 'noopener noreferrer';

    let originLat: number | undefined;
    let originLng: number | undefined;

    if (routeOrigin && routeOrigin.startsWith('zone.') && hass && hass.states[routeOrigin]) {
      const stateObj = hass.states[routeOrigin];
      if (stateObj.attributes && 'latitude' in stateObj.attributes && 'longitude' in stateObj.attributes) {
        originLat = parseFloat(stateObj.attributes.latitude);
        originLng = parseFloat(stateObj.attributes.longitude);
        if (isNaN(originLat) || isNaN(originLng)) {
          originLat = undefined;
          originLng = undefined;
        }
      }
    }

    const provider = ROUTING_PROVIDERS[routingProvider] || ROUTING_PROVIDERS[DEFAULT_ROUTING_PROVIDER];
    routeBtn.href = provider!.buildUrl(point.loc.lat, point.loc.lng, originLat, originLng);

    const routeLabelText = localize('card.build_route', language) || 'Build Route';
    routeBtn.innerHTML = `${routeSvg}<span>${routeLabelText}</span>`;

    container.appendChild(routeBtn);
  }

  return container;
}
