import { expect, it } from 'vitest';
import * as de from './de.ts';
import * as en from './en.ts';
import * as es from './es.ts';
import * as fr from './fr.ts';
import * as ru from './ru.ts';
import * as uk from './uk.ts';

it('exports defined dictionary objects for all supported languages', () => {
  expect(Object.keys(de).length).toBeGreaterThan(0);
  expect(Object.keys(en).length).toBeGreaterThan(0);
  expect(Object.keys(es).length).toBeGreaterThan(0);
  expect(Object.keys(fr).length).toBeGreaterThan(0);
  expect(Object.keys(ru).length).toBeGreaterThan(0);
  expect(Object.keys(uk).length).toBeGreaterThan(0);
});
