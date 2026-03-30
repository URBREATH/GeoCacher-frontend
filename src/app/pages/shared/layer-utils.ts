import { TranslateService } from '@ngx-translate/core';

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

/**
 * Reads the value of a cookie by name.
 * Returns an empty string when the cookie is not found.
 */
export function getCookie(cname: string): string {
  const name = cname + '=';
  const decodedCookie = decodeURIComponent(document.cookie);
  for (let c of decodedCookie.split(';')) {
    while (c.charAt(0) === ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) === 0) {
      return c.substring(name.length, c.length);
    }
  }
  return '';
}

/**
 * Writes the chosen language to a cookie and activates it in ngx-translate.
 * Falls back to 'en' when `language` is empty / undefined.
 */
export function switchLanguage(language: string, translate: TranslateService): void {
  const selectedLanguage = language || 'en';
  document.cookie = `language=${selectedLanguage}`;
  translate.use(selectedLanguage);
}

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

/**
 * Returns the translated label for a value that may be either a plain string
 * or a multilingual object keyed by language code.
 */
export function getLabel(value: any, translate: TranslateService): string {
  if (!value) return '';

  const lang = translate.currentLang || 'en';

  if (typeof value === 'string') {
    return value;
  }

  return value[lang] || value['en'] || (Object.values(value)[0] as string);
}

/**
 * Normalizes a field label coming from the analysis configuration:
 * - Strings like `tree_count` become `Tree Count`.
 * - Multilingual objects are returned unchanged.
 */
export function normalizeLabel(label: any): any {
  if (typeof label === 'object') {
    return label;
  }

  return label
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c: string) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Form helpers
// ---------------------------------------------------------------------------

/**
 * Recursively cleans a form-data object:
 * - Strips the `id` key.
 * - Converts numeric strings to numbers.
 * - Recurses into nested objects (but not arrays).
 */
export function cleanFormData(data: any): any {
  const result: any = {};
  Object.keys(data).forEach(key => {
    const value = data[key];
    if (key === 'id') return;

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = cleanFormData(value);
    } else if (!isNaN(value) && value !== '') {
      result[key] = Number(value);
    } else {
      result[key] = value;
    }
  });
  return result;
}

// ---------------------------------------------------------------------------
// City coordinate helpers
// ---------------------------------------------------------------------------

/**
 * Known city centres as [latitude, longitude] pairs.
 */
export const CITY_COORDINATES: { [city: string]: [number, number] } = {
  Aarhus:      [56.1629, 10.2039],
  Athens:      [37.9755, 23.7348],
  'Cluj-Napoca': [46.7712, 23.6236],
  Kajaani:     [64.2279, 27.7284],
  Leuven:      [50.8823,  4.7138],
  Madrid:      [40.4165, -3.7026],
  Parma:       [44.8015, 10.3279],
  Pilsen:      [49.7384, 13.3736],
  Tallinn:     [59.437,  24.7536],
};

/**
 * Returns the [lat, lng] centre for a given city name.
 * Falls back to Leuven when the city is not found.
 */
export function getCityCoordinates(city: string): [number, number] {
  return CITY_COORDINATES[city] ?? [50.8823, 4.7138];
}
