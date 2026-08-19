import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAddress } from './geocoder.ts';

describe('fetchAddress()', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  it('returns null on non-ok HTTP responses', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
    } as Response);

    const result = await fetchAddress(0, 0, 'en');
    expect(result).toBeNull();
  });

  it('returns null when network exceptions occur', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Network error'));
    const result = await fetchAddress(0, 0, 'en');
    expect(result).toBeNull();
  });

  it('extracts display_name when structured address data is unavailable', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      json: async () => ({ display_name: 'Fallback Address' }),
      ok: true,
    } as Response);

    const result = await fetchAddress(0, 0, 'en');
    expect(result).toBe('Fallback Address');
  });

  it('constructs standardized address string from comprehensive data', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      json: async () => ({
        address: {
          city: 'Testville',
          city_district: 'Downtown',
          house_number: '123',
          road: 'Test Street',
        },
      }),
      ok: true,
    } as Response);

    const result = await fetchAddress(0, 0, 'en');
    expect(result).toBe('Test Street, 123, Downtown, Testville');
  });

  it('prepends points of interest (POI) to the formatted address', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      json: async () => ({
        address: {
          city: 'History Town',
          historic: 'Ancient Monument',
          road: 'Old Road',
        },
      }),
      ok: true,
    } as Response);

    const result = await fetchAddress(0, 0, 'en');
    expect(result).toBe('Ancient Monument, Old Road, History Town');
  });

  it('formats rural addresses lacking street information', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      json: async () => ({
        address: {
          county: 'Big County',
          village: 'Small Village',
        },
      }),
      ok: true,
    } as Response);

    const result = await fetchAddress(0, 0, 'en');
    expect(result).toBe('Small Village');
  });

  it('incorporates house names when numeric identifiers are missing', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      json: async () => ({
        address: {
          house_name: 'The Cottage',
          road: 'Country Lane',
          village: 'Hamlet',
        },
      }),
      ok: true,
    } as Response);

    const result = await fetchAddress(0, 0, 'en');
    expect(result).toBe('Country Lane, The Cottage, Hamlet');
  });

  it('retains house numbers even when street context is absent', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      json: async () => ({
        address: {
          city: 'OnlyHouseCity',
          house_number: '42',
        },
      }),
      ok: true,
    } as Response);

    const result = await fetchAddress(0, 0, 'en');
    expect(result).toBe('42, OnlyHouseCity');
  });

  it('utilizes district information as fallback for missing city data', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      json: async () => ({
        address: {
          district: 'Some District',
          road: 'Main St',
        },
      }),
      ok: true,
    } as Response);

    const result = await fetchAddress(0, 0, 'en');
    expect(result).toBe('Main St, Some District');
  });

  it('reverts to display_name when address components are unrecognized', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      json: async () => ({
        address: { unknown_tag: '123' },
        display_name: 'Fallback Name',
      }),
      ok: true,
    } as Response);

    const result = await fetchAddress(0, 0, 'en');
    expect(result).toBe('Fallback Name');
  });

  it('returns null for unrecognized address components without display_name', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      json: async () => ({
        address: { unknown_tag: '123' },
      }),
      ok: true,
    } as Response);

    const result = await fetchAddress(0, 0, 'en');
    expect(result).toBeNull();
  });

  it('returns null for completely malformed API responses', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      json: async () => ({
        error: 'No address found',
      }),
      ok: true,
    } as Response);

    const result = await fetchAddress(10, 20, 'en');
    expect(result).toBeNull();
  });

  it.each([
    {
      address: { amenity: 'Central Cafe', city: 'Cafeville', road: 'Central Cafe' },
      description: 'street matches POI',
      expected: 'Central Cafe, Cafeville',
    },
    {
      address: { borough: 'Springfield', city: 'Springfield', road: 'Main St' },
      description: 'borough matches city',
      expected: 'Main St',
    },
    {
      address: { city: 'Townsville', road: 'Townsville' },
      description: 'city matches street',
      expected: 'Townsville',
    },
  ])('omits duplicate parts when $description', async ({ address, expected }) => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      json: async () => ({ address }),
      ok: true,
    } as Response);

    const result = await fetchAddress(0, 0, 'en');
    expect(result).toBe(expected);
  });
});
