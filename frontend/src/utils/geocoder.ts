const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';

interface NominatimAddress {
  amenity?: string;
  borough?: string;
  building?: string;
  city?: string;
  city_district?: string;
  county?: string;
  district?: string;
  hamlet?: string;
  historic?: string;
  house_name?: string;
  house_number?: string;
  leisure?: string;
  locality?: string;
  man_made?: string;
  municipality?: string;
  neighbourhood?: string;
  office?: string;
  path?: string;
  pedestrian?: string;
  quarter?: string;
  residential?: string;
  road?: string;
  shop?: string;
  square?: string;
  state?: string;
  suburb?: string;
  tourism?: string;
  town?: string;
  village?: string;
}

interface NominatimResponse {
  address?: NominatimAddress;
  display_name?: string;
}

function pickFirst(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value) {
      return value;
    }
  }
  return undefined;
}

function pushUnique(
  parts: string[],
  value: string | undefined,
  ...exclude: Array<string | undefined>
): void {
  if (!value) {
    return;
  }
  for (const skip of exclude) {
    if (skip && value === skip) {
      return;
    }
  }
  parts.push(value);
}

/**
 * Builds a human-readable address from a structured Nominatim `address` object.
 *
 * Why: Nominatim responses contain many optional fields that overlap semantically.
 * We collapse them into a stable, ordered list (POI → street → borough → city → district)
 * while avoiding duplicate consecutive entries.
 */
function buildStructuredAddress(address: NominatimAddress): string[] {
  const poiPart = pickFirst(
    address.historic,
    address.tourism,
    address.amenity,
    address.shop,
    address.office,
    address.leisure,
    address.man_made,
    address.building,
  );
  const streetPart = pickFirst(
    address.road,
    address.pedestrian,
    address.square,
    address.path,
    address.locality,
    address.neighbourhood,
    address.suburb,
    address.quarter,
    address.residential,
  );
  const house = pickFirst(address.house_number, address.house_name);
  const boroughPart = pickFirst(address.borough, address.city_district);
  const cityPart = pickFirst(
    address.city,
    address.town,
    address.village,
    address.hamlet,
    address.municipality,
  );
  const districtPart = pickFirst(address.district, address.county, address.state);

  const parts: string[] = [];

  if (poiPart) {
    parts.push(poiPart);
  }

  const streetLine =
    streetPart && streetPart !== poiPart
      ? house
        ? `${streetPart}, ${house}`
        : streetPart
      : undefined;
  const houseFallback = !streetLine && house && house !== poiPart ? house : undefined;
  pushUnique(parts, streetLine ?? houseFallback, poiPart);

  pushUnique(parts, boroughPart, streetPart, cityPart);
  pushUnique(parts, cityPart, streetPart, boroughPart);
  if (!parts.includes(cityPart ?? '')) {
    pushUnique(parts, districtPart, streetPart, cityPart, boroughPart);
  }

  return parts;
}

/**
 * Fetches the human-readable address for the given coordinates.
 * Currently uses OpenStreetMap Nominatim.
 */
export async function fetchAddress(
  lat: number,
  lon: number,
  language: string,
): Promise<string | null> {
  try {
    const response = await fetch(
      `${NOMINATIM_URL}?lat=${lat}&lon=${lon}&format=json&accept-language=${language}`,
    );
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as NominatimResponse;

    const parts = data.address ? buildStructuredAddress(data.address) : [];
    if (parts.length > 0) {
      return parts.join(', ');
    }
    return data.display_name ?? null;
  } catch (_e) {
    return null;
  }
}
