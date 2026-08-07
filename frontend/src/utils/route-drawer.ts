import * as L from 'leaflet';
import { markerSvg } from '../icons/marker';

export interface RoutePoint {
  loc: L.LatLng;
  timestamp: string;
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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
}

export function drawRouteOnMap(options: DrawRouteOptions): L.LatLngBounds | undefined {
  const { points, map, routeLayer, isSatellite, isDarkMode, currentProvider, localize, language, fallbackLat, fallbackLon } = options;

  routeLayer.clearLayers();

  if (!points || !Array.isArray(points) || points.length === 0) {
    map.setView([fallbackLat, fallbackLon], 19);
    return undefined;
  }

  const isDark = isDarkMode && !isSatellite;
  const isCartoDark = isDark && currentProvider === 'CartoDB Voyager';

  const routeColor = isSatellite ? '#00CCE6' : (isCartoDark ? '#45949c' : (isDark ? '#167A87' : '#00CCE6'));
  const routeOpacity = isSatellite ? 0.4 : (isCartoDark ? 0.9 : (isDark ? 0.9 : 0.5));
  const arrowColor = isSatellite ? '#b8c9cc' : (isCartoDark ? '#79abb3' : (isDark ? '#0D4F58' : '#009fb9'));
  const beadBorderColor = isSatellite ? '#d1ebf7' : (isCartoDark ? '#b2d2d5' : (isDark ? '#01252a' : '#d1ebf7'));
  const beadFillColor = isSatellite ? '#5db4cb' : (isCartoDark ? '#41838c' : (isDark ? '#45929c' : '#5db4cb'));

  if (points.length > 1) {
    const polyline = L.polyline(points.map(p => p.loc), {
      color: routeColor,
      weight: 6,
      opacity: routeOpacity
    }).addTo(routeLayer);

    if ((window as any).L.polylineDecorator) {
      (window as any).L.polylineDecorator(polyline, {
        patterns: [
          {
            offset: 50,
            repeat: 150,
            symbol: (window as any).L.Symbol.arrowHead({
              pixelSize: 8,
              polygon: false,
              pathOptions: { stroke: true, color: arrowColor, weight: 2 }
            })
          }
        ]
      }).addTo(routeLayer);
    }
  }

  points.forEach((point, index) => {
    if (index === points.length - 1) {
      const currentIcon = L.divIcon({
        className: '',
        html: markerSvg,
        iconSize: [24, 36],
        iconAnchor: [12, 36],
        popupAnchor: [0, -36]
      });
      L.marker(point.loc, { icon: currentIcon }).addTo(routeLayer).bindPopup(`<b>${localize('card.current_location', language)}</b><br>${point.timestamp}`);
    } else if (index === 0) {
      L.circleMarker(point.loc, {
        radius: 6,
        color: '#4caf50',
        fillColor: '#4caf50',
        fillOpacity: 1
      }).addTo(routeLayer).bindPopup(`<b>${localize('card.start', language)}</b><br>${point.timestamp}`);
    } else {
      const hitArea = L.circleMarker(point.loc, {
        radius: 12,
        color: 'transparent',
        fillColor: 'transparent',
        fillOpacity: 0,
        weight: 0,
        interactive: true
      }).addTo(routeLayer).bindPopup(point.timestamp);

      L.circleMarker(point.loc, {
        radius: 3,
        color: beadBorderColor,
        fillColor: beadFillColor,
        fillOpacity: 1,
        weight: 1.5,
        interactive: false
      }).addTo(routeLayer);

      hitArea.on('click', () => { hitArea.openPopup(); });
    }
  });

  const routeBounds = L.latLngBounds(points.map(p => p.loc));
  map.fitBounds(routeBounds);
  return routeBounds;
}
