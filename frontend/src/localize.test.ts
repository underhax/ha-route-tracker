import { describe, expect, it } from 'vitest';
import { localize } from './localize';

describe('localize()', () => {
  it('returns translation for a known key and language', () => {
    expect(localize('card.name', 'en')).toBe('Route Tracker');
    expect(typeof localize('card.name', 'de')).toBe('string');
  });

  it('strips regional tags from language code', () => {
    expect(typeof localize('card.name', 'de-DE')).toBe('string');
  });

  it('falls back to english for unknown languages or empty string', () => {
    expect(localize('card.name', 'xyz')).toBe('Route Tracker');
    expect(localize('card.name', '')).toBe('Route Tracker');
  });

  it('returns the key itself if not found anywhere', () => {
    expect(localize('unknown.key.does.not.exist', 'en')).toBe('unknown.key.does.not.exist');
  });
});
