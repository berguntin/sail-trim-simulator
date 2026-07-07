/**
 * i18n — vue-i18n (composition API) with EN/ES and browser-language detection.
 *
 * Default locale resolution, in order:
 *  1. the user's explicit choice from the header selector (localStorage),
 *  2. the first browser-preferred language we support (navigator.languages),
 *  3. English.
 *
 * English is also the fallback for any key missing from another locale.
 */
import { createI18n } from 'vue-i18n'
import en from './locales/en'
import es from './locales/es'

export const SUPPORTED_LOCALES = ['en', 'es'] as const
export type AppLocale = (typeof SUPPORTED_LOCALES)[number]

const STORAGE_KEY = 'trim-simulator-locale'

function isSupported(value: string | null): value is AppLocale {
  return value !== null && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

/** First supported language in the browser's preference list ('es-AR' → 'es'). */
export function detectBrowserLocale(): AppLocale {
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const tag of preferred) {
    const base = tag?.toLowerCase().split('-')[0]
    if (isSupported(base)) return base
  }
  return 'en'
}

export function initialLocale(): AppLocale {
  const stored = localStorage.getItem(STORAGE_KEY)
  return isSupported(stored) ? stored : detectBrowserLocale()
}

/** Persist an explicit user choice so it survives reloads. */
export function rememberLocale(locale: AppLocale) {
  localStorage.setItem(STORAGE_KEY, locale)
  document.documentElement.lang = locale
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'en',
  messages: { en, es },
})

document.documentElement.lang = initialLocale()
