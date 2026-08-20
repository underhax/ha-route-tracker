import { accuracySvg } from '../icons/accuracy.ts';
import { altitudeSvg } from '../icons/altitude.ts';
import { batterySvg } from '../icons/battery.ts';
import { checkSvg } from '../icons/check.ts';
import { copySvg } from '../icons/copy.ts';
import { routeSvg } from '../icons/route.ts';
import { searchSvg } from '../icons/search.ts';
import { sourceSvg } from '../icons/source.ts';
import { speedSvg } from '../icons/speed.ts';
import { fetchAddress } from './geocoder.ts';
import type { RoutePoint } from './route-drawer.ts';
import { DEFAULT_ROUTING_PROVIDER, resolveRoutingProvider } from './routing-providers.ts';

interface HassUnitSystem {
  length?: string;
}

interface HassConfig {
  unit_system?: HassUnitSystem;
}

interface ZoneAttributes {
  latitude?: string;
  longitude?: string;
}

interface ZoneState {
  attributes?: ZoneAttributes;
}

interface HassForPopup {
  config?: HassConfig;
  states?: Record<string, ZoneState>;
}

type CreateAttrNode = (iconSvg: string, valueText: string, titleLabel: string) => HTMLElement;

function buildExtraAttributeNodes(
  point: RoutePoint,
  language: string,
  localize: (key: string, lang: string) => string,
  speedUnit: string,
  altUnit: string,
  createAttrNode: CreateAttrNode,
): HTMLElement[] {
  const nodes: HTMLElement[] = [];
  if (point.source_type) {
    nodes.push(
      createAttrNode(
        sourceSvg,
        point.source_type,
        `${localize('card.source_type', language) || 'Source'}: ${point.source_type}`,
      ),
    );
  }
  if (point.gps_accuracy !== undefined && point.gps_accuracy !== 0) {
    const unitM = localize('card.unit_m', language) || 'm';
    nodes.push(
      createAttrNode(
        accuracySvg,
        `${point.gps_accuracy} ${unitM}`,
        `${localize('card.gps_accuracy', language) || 'Accuracy'}: ${point.gps_accuracy} ${unitM}`,
      ),
    );
  }
  if (point.altitude !== undefined) {
    nodes.push(
      createAttrNode(
        altitudeSvg,
        `${point.altitude} ${altUnit}`,
        `${localize('card.altitude', language) || 'Altitude'}: ${point.altitude} ${altUnit}`,
      ),
    );
  }
  if (point.speed !== undefined && point.speed !== 0) {
    nodes.push(
      createAttrNode(
        speedSvg,
        `${point.speed} ${speedUnit}`,
        `${localize('card.speed', language) || 'Speed'}: ${point.speed} ${speedUnit}`,
      ),
    );
  }
  if (point.battery_level !== undefined) {
    nodes.push(
      createAttrNode(
        batterySvg,
        `${point.battery_level}%`,
        `${localize('card.battery_level', language) || 'Battery'}: ${point.battery_level}%`,
      ),
    );
  }
  return nodes;
}

function resolveRouteOrigin(
  routeOrigin: string,
  hass?: HassForPopup,
): { lat: number; lng: number } | null {
  if (!routeOrigin.startsWith('zone.') || !hass?.states?.[routeOrigin]) return null;

  const stateObj = hass.states[routeOrigin];
  if (
    !stateObj.attributes ||
    !('latitude' in stateObj.attributes) ||
    !('longitude' in stateObj.attributes)
  ) {
    return null;
  }

  const lat = parseFloat(stateObj.attributes.latitude);
  const lng = parseFloat(stateObj.attributes.longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

  return { lat, lng };
}

function appendGeocodingSection(
  container: HTMLElement,
  point: RoutePoint,
  language: string,
  localize: (key: string, lang: string) => string,
): void {
  const divider = document.createElement('div');
  divider.className = 'rt-popup-divider';
  container.appendChild(divider);

  const geocodeBtn = document.createElement('button');
  geocodeBtn.className = 'rt-popup-geocode-btn';
  const labelText = localize('card.get_address', language) || 'Get Address';
  geocodeBtn.innerHTML = `${searchSvg}<span>${labelText}</span>`;

  geocodeBtn.onclick = async (): Promise<void> => {
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

function appendRoutingSection(
  container: HTMLElement,
  point: RoutePoint,
  language: string,
  localize: (key: string, lang: string) => string,
  routingProvider: string,
  routeOrigin: string,
  hass?: HassForPopup,
): void {
  const routeDivider = document.createElement('div');
  routeDivider.className = 'rt-popup-divider';
  container.appendChild(routeDivider);

  const routeBtn = document.createElement('a');
  routeBtn.className = 'rt-popup-route-btn';
  routeBtn.target = '_blank';
  routeBtn.rel = 'noopener noreferrer';

  const origin = resolveRouteOrigin(routeOrigin, hass);

  const provider = resolveRoutingProvider(routingProvider);
  routeBtn.href = provider.buildUrl(point.loc.lat, point.loc.lng, origin?.lat, origin?.lng);

  const routeLabelText = localize('card.build_route', language) || 'Build Route';
  routeBtn.innerHTML = `${routeSvg}<span>${routeLabelText}</span>`;

  container.appendChild(routeBtn);
}

export function buildPopupContent(
  point: RoutePoint,
  language: string,
  localize: (key: string, lang: string) => string,
  routingProvider: string = DEFAULT_ROUTING_PROVIDER,
  enableGeocoding: boolean = false,
  enableRouting: boolean = false,
  routeOrigin: string = 'device',
  hass?: HassForPopup,
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

  copyBtn.onclick = (): void => {
    navigator.clipboard.writeText(coordsTextCopy).then((): void => {
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

  const extraParts = buildExtraAttributeNodes(
    point,
    language,
    localize,
    speedUnit,
    altUnit,
    createAttrNode,
  );

  if (extraParts.length > 0) {
    const extraContainer = document.createElement('div');
    extraContainer.className = 'rt-popup-extra-attrs';

    if (extraParts.length === 4) {
      extraContainer.style.gridTemplateColumns = 'repeat(4, max-content)';
    }

    for (const part of extraParts) {
      extraContainer.appendChild(part);
    }
    container.appendChild(extraContainer);
  }

  if (enableGeocoding) {
    appendGeocodingSection(container, point, language, localize);
  }

  if (enableRouting) {
    appendRoutingSection(container, point, language, localize, routingProvider, routeOrigin, hass);
  }

  return container;
}
