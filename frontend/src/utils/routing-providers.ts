export interface RoutingProvider {
  id: string;
  nameKey: string;
  url: string;
  buildUrl: (lat: number, lng: number, originLat?: number, originLng?: number) => string;
}

export const ROUTING_PROVIDERS: Record<string, RoutingProvider> = {
  apple: {
    buildUrl: (lat: number, lng: number, originLat?: number, originLng?: number) =>
      originLat !== undefined && originLng !== undefined
        ? `https://maps.apple.com/?saddr=${originLat},${originLng}&daddr=${lat},${lng}`
        : `https://maps.apple.com/?daddr=${lat},${lng}`,
    id: 'apple',
    nameKey: 'editor.routing_apple',
    url: 'https://maps.apple.com',
  },
  google: {
    buildUrl: (lat: number, lng: number, originLat?: number, originLng?: number) =>
      originLat !== undefined && originLng !== undefined
        ? `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${lat},${lng}`
        : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    id: 'google',
    nameKey: 'editor.routing_google',
    url: 'https://www.google.com/maps',
  },
  osm: {
    buildUrl: (lat: number, lng: number, originLat?: number, originLng?: number) =>
      originLat !== undefined && originLng !== undefined
        ? `https://www.openstreetmap.org/directions?route=${originLat},${originLng};${lat},${lng}`
        : `https://www.openstreetmap.org/directions?to=${lat},${lng}`,
    id: 'osm',
    nameKey: 'editor.routing_osm',
    url: 'https://www.openstreetmap.org',
  },
  yandex: {
    buildUrl: (lat: number, lng: number, originLat?: number, originLng?: number) =>
      originLat !== undefined && originLng !== undefined
        ? `https://yandex.ru/maps/?rtext=${originLat},${originLng}~${lat},${lng}`
        : `https://yandex.ru/maps/?rtext=~${lat},${lng}`,
    id: 'yandex',
    nameKey: 'editor.routing_yandex',
    url: 'https://yandex.ru/maps',
  },
};

export const DEFAULT_ROUTING_PROVIDER = 'osm';

export function resolveRoutingProvider(id: string): RoutingProvider {
  const fallback = ROUTING_PROVIDERS[DEFAULT_ROUTING_PROVIDER];
  const provider = ROUTING_PROVIDERS[id] ?? fallback;
  if (!provider) {
    throw new Error(`Routing provider '${id}' is not registered`);
  }
  return provider;
}
