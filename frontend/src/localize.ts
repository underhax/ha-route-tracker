import { de } from './locales/de.ts';
import { en } from './locales/en.ts';
import { es } from './locales/es.ts';
import { fr } from './locales/fr.ts';
import { ru } from './locales/ru.ts';
import { uk } from './locales/uk.ts';

export type LocaleCode = 'de' | 'en' | 'es' | 'fr' | 'ru' | 'uk';

const translations: Record<LocaleCode, Record<string, string>> = {
  de,
  en,
  es,
  fr,
  ru,
  uk,
};

export function localize(key: string, language: string = 'en'): string {
  const lang = language.split('-')[0] || 'en';
  const enDictionary = translations.en as Record<string, string>;
  const dictionary = translations[lang as LocaleCode] || enDictionary;
  return dictionary[key] || enDictionary[key] || key;
}
