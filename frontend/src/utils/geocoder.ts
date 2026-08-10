const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';

/**
 * Fetches the human-readable address for the given coordinates.
 * Currently uses OpenStreetMap Nominatim.
 */
export async function fetchAddress(lat: number, lon: number, language: string): Promise<string | null> {
  try {
    const response = await fetch(`${NOMINATIM_URL}?lat=${lat}&lon=${lon}&format=json&accept-language=${language}`);
    if (!response.ok) {
      return null;
    }
    const data = await response.json();

    if (data && data.address) {
      const addr = data.address;

      const poiPart = addr.historic || addr.tourism || addr.amenity || addr.shop || addr.office || addr.leisure || addr.man_made || addr.building;
      const streetPart = addr.road || addr.pedestrian || addr.square || addr.path || addr.locality || addr.neighbourhood || addr.suburb || addr.quarter || addr.residential;
      const house = addr.house_number || addr.house_name;
      const boroughPart = addr.borough || addr.city_district;
      const cityPart = addr.city || addr.town || addr.village || addr.hamlet || addr.municipality;
      const districtPart = addr.district || addr.county || addr.state;

      const parts: string[] = [];

      if (poiPart) {
        parts.push(poiPart);
      }

      if (streetPart && streetPart !== poiPart) {
        parts.push(house ? `${streetPart}, ${house}` : streetPart);
      } else if (house && house !== poiPart) {
        parts.push(house);
      }

      if (boroughPart && boroughPart !== streetPart && boroughPart !== cityPart) {
        parts.push(boroughPart);
      }

      if (cityPart && cityPart !== streetPart && cityPart !== boroughPart) {
        parts.push(cityPart);
      } else if (districtPart && districtPart !== streetPart && districtPart !== cityPart && districtPart !== boroughPart) {
        parts.push(districtPart);
      }

      if (parts.length > 0) {
        return parts.join(', ');
      }
    }

    return data?.display_name || null;
  } catch (e) {
    return null;
  }
}
