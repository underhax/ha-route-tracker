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
  const lang = language.split('-')[0];
  const dictionary = translations[lang] || translations['en'];
  return dictionary[key] || translations['en'][key] || key;
}
