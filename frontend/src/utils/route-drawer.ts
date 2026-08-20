import * as L from 'leaflet';
import { markerSvg } from '../icons/marker.ts';
import { buildPopupContent } from './popup-builder.ts';

interface LeafletSymbol {
  arrowHead: (opts: Record<string, unknown>) => unknown;
}

interface LeafletGlobal {
  polylineDecorator?: (polyline: L.Polyline, options: Record<string, unknown>) => L.Layer;
  Symbol: LeafletSymbol;
}

interface WindowWithLeaflet {
  L?: LeafletGlobal;
}

export interface RoutePoint {
  loc: L.LatLng;
  timestamp: string;
  source_type?: string;
  gps_accuracy?: number;
  altitude?: number;
  speed?: number;
  battery_level?: number;
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface HassForPopup {
  config?: { unit_system?: { length?: string } };
  states?: Record<
    string,
    { attributes?: { latitude?: string; longitude?: string; friendly_name?: string } }
  >;
}

export interface DrawRouteOptions {
  points: RoutePoint[];
  map: L.Map;
  routeLayer: L.LayerGroup;
  isSatellite: boolean;
  isDarkMode: boolean;
  currentProvider: string;
  localize: (key: string, lang: string) => string;
  language: string;
  fallbackLat: number;
  fallbackLon: number;
  routingProvider: string;
  enableGeocoding: boolean;
  enableRouting: boolean;
  routeOrigin: string;
  hass: HassForPopup;
}

interface RouteColorPalette {
  routeColor: string;
  routeOpacity: number;
  arrowColor: string;
  beadBorderColor: string;
  beadFillColor: string;
}

function resolveRouteColors(
  isSatellite: boolean,
  isDarkMode: boolean,
  currentProvider: string,
): RouteColorPalette {
  const isDark = isDarkMode && !isSatellite;
  const isCartoDark = isDark && currentProvider === 'CartoDB Voyager';

  if (isSatellite) {
    return {
      arrowColor: '#b8c9cc',
      beadBorderColor: '#d1ebf7',
      beadFillColor: '#5db4cb',
      routeColor: '#00CCE6',
      routeOpacity: 0.4,
    };
  }

  if (isCartoDark) {
    return {
      arrowColor: '#79abb3',
      beadBorderColor: '#b2d2d5',
      beadFillColor: '#41838c',
      routeColor: '#45949c',
      routeOpacity: 0.9,
    };
  }

  if (isDark) {
    return {
      arrowColor: '#0D4F58',
      beadBorderColor: '#01252a',
      beadFillColor: '#45929c',
      routeColor: '#167A87',
      routeOpacity: 0.9,
    };
  }

  return {
    arrowColor: '#009fb9',
    beadBorderColor: '#d1ebf7',
    beadFillColor: '#5db4cb',
    routeColor: '#00CCE6',
    routeOpacity: 0.5,
  };
}

export function drawRouteOnMap(options: DrawRouteOptions): L.LatLngBounds | undefined {
  const {
    points,
    map,
    routeLayer,
    isSatellite,
    isDarkMode,
    currentProvider,
    localize,
    language,
    fallbackLat,
    fallbackLon,
    routingProvider,
    enableGeocoding,
    enableRouting,
    routeOrigin,
    hass,
  } = options;

  routeLayer.clearLayers();

  if (points.length === 0) {
    map.setView([fallbackLat, fallbackLon], 19);
    return undefined;
  }

  const colors = resolveRouteColors(isSatellite, isDarkMode, currentProvider);

  if (points.length > 1) {
    drawPolyline(points, routeLayer, colors);
  }

  drawRouteMarkers(
    points,
    routeLayer,
    colors,
    language,
    localize,
    routingProvider,
    enableGeocoding,
    enableRouting,
    routeOrigin,
    hass,
  );

  const routeBounds = L.latLngBounds(points.map((p) => p.loc));
  map.fitBounds(routeBounds);
  return routeBounds;
}

function drawPolyline(
  points: RoutePoint[],
  routeLayer: L.LayerGroup,
  colors: RouteColorPalette,
): void {
  const polyline = L.polyline(
    points.map((p) => p.loc),
    {
      color: colors.routeColor,
      opacity: colors.routeOpacity,
      weight: 6,
    },
  ).addTo(routeLayer);

  const leafletGlobal = (window as unknown as WindowWithLeaflet).L;
  if (leafletGlobal?.polylineDecorator) {
    leafletGlobal
      .polylineDecorator(polyline, {
        patterns: [
          {
            offset: 50,
            repeat: 150,
            symbol: leafletGlobal.Symbol.arrowHead({
              pathOptions: { color: colors.arrowColor, stroke: true, weight: 2 },
              pixelSize: 8,
              polygon: false,
            }),
          },
        ],
      })
      .addTo(routeLayer);
  }
}

function drawRouteMarkers(
  points: RoutePoint[],
  routeLayer: L.LayerGroup,
  colors: RouteColorPalette,
  language: string,
  localize: (key: string, lang: string) => string,
  routingProvider: string,
  enableGeocoding: boolean,
  enableRouting: boolean,
  routeOrigin: string,
  hass: HassForPopup,
): void {
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    if (!point) return;
    const popup = buildPopupContent(
      point,
      language,
      localize,
      routingProvider,
      enableGeocoding,
      enableRouting,
      routeOrigin,
      hass,
    );

    if (index === points.length - 1) {
      const currentIcon = L.divIcon({
        className: '',
        html: markerSvg,
        iconAnchor: [12, 36],
        iconSize: [24, 36],
        popupAnchor: [0, -36],
      });
      L.marker(point.loc, { icon: currentIcon }).addTo(routeLayer).bindPopup(popup);
    } else if (index === 0) {
      L.circleMarker(point.loc, {
        color: '#4caf50',
        fillColor: '#4caf50',
        fillOpacity: 1,
        radius: 6,
      })
        .addTo(routeLayer)
        .bindPopup(popup);
    } else {
      const hitArea = L.circleMarker(point.loc, {
        color: 'transparent',
        fillColor: 'transparent',
        fillOpacity: 0,
        interactive: true,
        radius: 12,
        weight: 0,
      })
        .addTo(routeLayer)
        .bindPopup(popup);

      L.circleMarker(point.loc, {
        color: colors.beadBorderColor,
        fillColor: colors.beadFillColor,
        fillOpacity: 1,
        interactive: false,
        radius: 3,
        weight: 1.5,
      }).addTo(routeLayer);

      hitArea.on('click', (): void => {
        hitArea.openPopup();
      });
    }
  }
}
