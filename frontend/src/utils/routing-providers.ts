export interface RoutingProvider {
  id: string;
  nameKey: string;
  url: string;
  buildUrl: (lat: number, lng: number, originLat?: number, originLng?: number) => string;
}

export const ROUTING_PROVIDERS: Record<string, RoutingProvider> = {
  osm: {
    id: 'osm',
    nameKey: 'editor.routing_osm',
    url: 'https://www.openstreetmap.org',
    buildUrl: (lat, lng, originLat, originLng) => 
      originLat !== undefined && originLng !== undefined
        ? `https://www.openstreetmap.org/directions?route=${originLat},${originLng};${lat},${lng}`
        : `https://www.openstreetmap.org/directions?to=${lat},${lng}`,
  },
  google: {
    id: 'google',
    nameKey: 'editor.routing_google',
    url: 'https://www.google.com/maps',
    buildUrl: (lat, lng, originLat, originLng) => 
      originLat !== undefined && originLng !== undefined
        ? `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${lat},${lng}`
        : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
  },
  apple: {
    id: 'apple',
    nameKey: 'editor.routing_apple',
    url: 'https://maps.apple.com',
    buildUrl: (lat, lng, originLat, originLng) => 
      originLat !== undefined && originLng !== undefined
        ? `https://maps.apple.com/?saddr=${originLat},${originLng}&daddr=${lat},${lng}`
        : `https://maps.apple.com/?daddr=${lat},${lng}`,
  },
  yandex: {
    id: 'yandex',
    nameKey: 'editor.routing_yandex',
    url: 'https://yandex.ru/maps',
    buildUrl: (lat, lng, originLat, originLng) => 
      originLat !== undefined && originLng !== undefined
        ? `https://yandex.ru/maps/?rtext=${originLat},${originLng}~${lat},${lng}`
        : `https://yandex.ru/maps/?rtext=~${lat},${lng}`,
  },
};

export const DEFAULT_ROUTING_PROVIDER = 'osm';
