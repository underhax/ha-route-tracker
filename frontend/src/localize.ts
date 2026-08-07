import { en } from './locales/en';
import { ru } from './locales/ru';
import { es } from './locales/es';
import { fr } from './locales/fr';
import { de } from './locales/de';
import { uk } from './locales/uk';

const translations: Record<string, Record<string, string>> = {
  en,
  ru,
  es,
  fr,
  de,
  uk
};

export function localize(key: string, language: string = 'en'): string {
  const lang = language.split('-')[0] || 'en';
  const enDictionary = translations['en'] as Record<string, string>;
  const dictionary = translations[lang] || enDictionary;
  return dictionary[key] || enDictionary[key] || key;
}
