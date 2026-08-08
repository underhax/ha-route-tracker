import { describe, expect, it } from 'vitest';
import * as de from './de';
import * as en from './en';
import * as es from './es';
import * as fr from './fr';
import * as ru from './ru';
import * as uk from './uk';

describe('Locales', () => {
  it('exports defined dictionary objects for all supported languages', () => {
    expect(Object.keys(de).length).toBeGreaterThan(0);
    expect(Object.keys(en).length).toBeGreaterThan(0);
    expect(Object.keys(es).length).toBeGreaterThan(0);
    expect(Object.keys(fr).length).toBeGreaterThan(0);
    expect(Object.keys(ru).length).toBeGreaterThan(0);
    expect(Object.keys(uk).length).toBeGreaterThan(0);
  });
});
