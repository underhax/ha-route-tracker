import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { buildPopupContent } from './popup-builder';
import * as geocoder from './geocoder';

describe('Popup Builder', () => {
  const mockLocalize = vi.fn((key: string) => `translated_${key}`);
  const point = {
    loc: { lat: 0, lng: 0 },
    timestamp: '1970-01-01 00:00:00'
  };

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('constructs popup DOM and handles clipboard copy operations', async () => {
    const popup = buildPopupContent(point as any, 'en', mockLocalize);
    expect(popup.querySelector('.rt-popup-time')?.textContent).toBe('1970-01-01 00:00:00');
    
    const coordsSpan = popup.querySelector('.rt-popup-coords span');
    expect(coordsSpan?.textContent).toBe('0.00000, 0.00000');

    const copyBtn = popup.querySelector('.rt-popup-copy-btn') as HTMLButtonElement;
    expect(copyBtn).toBeDefined();

    await copyBtn.onclick!(new MouseEvent('click') as any);
    
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('0.00000,0.00000');
    expect(copyBtn.innerHTML).toContain('M21,7L9,19');
    expect(copyBtn.classList.contains('copied')).toBe(true);

    vi.runAllTimers();
    expect(copyBtn.innerHTML).toContain('M19,21H8V7');
    expect(copyBtn.classList.contains('copied')).toBe(false);
  });

  it('processes successful geocoding responses and updates DOM', async () => {
    const fetchSpy = vi.spyOn(geocoder, 'fetchAddress').mockResolvedValue('Mocked Address, City');
    const popup = buildPopupContent(point as any, 'en', mockLocalize);

    const geocodeBtn = popup.querySelector('.rt-popup-geocode-btn') as HTMLButtonElement;
    expect(geocodeBtn).toBeDefined();

    await geocodeBtn.onclick!(new MouseEvent('click') as any);
    
    expect(fetchSpy).toHaveBeenCalledWith(0, 0, 'en');
    
    const addressEl = popup.querySelector('.rt-popup-address');
    expect(addressEl).toBeDefined();
    expect(addressEl?.textContent).toBe('Mocked Address, City');
    expect(popup.querySelector('.rt-popup-geocode-btn')).toBeNull();
  });

  it('handles geocoding failures and restores button state', async () => {
    const fetchSpy = vi.spyOn(geocoder, 'fetchAddress').mockResolvedValue(null);
    const popup = buildPopupContent(point as any, 'en', mockLocalize);

    const geocodeBtn = popup.querySelector('.rt-popup-geocode-btn') as HTMLButtonElement;
    
    await geocodeBtn.onclick!(new MouseEvent('click') as any);
    
    expect(fetchSpy).toHaveBeenCalled();
    
    expect(geocodeBtn.disabled).toBe(false);
    expect(geocodeBtn.style.opacity).toBe('1');
    
    expect(popup.querySelector('.rt-popup-address')).toBeNull();
  });

  it('applies default English labels when localization keys are missing', () => {
    const emptyLocalize = vi.fn(() => '');
    const popup = buildPopupContent(point as any, 'en', emptyLocalize);
    
    const copyBtn = popup.querySelector('.rt-popup-copy-btn') as HTMLButtonElement;
    expect(copyBtn.title).toBe('Copy coordinates');

    const geocodeBtn = popup.querySelector('.rt-popup-geocode-btn') as HTMLButtonElement;
    expect(geocodeBtn.textContent).toBe('Get Address');
  });
});
