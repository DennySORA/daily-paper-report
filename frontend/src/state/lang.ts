import { useCallback } from 'react'
import { setPref, useLibrary, type Lang } from './library'

export type { Lang }

/** A string in both interface languages. */
export interface Bilingual {
  zh: string
  en: string
}

/** BCP 47 tags for the document language. */
export const LANG_TAG: Record<Lang, string> = { zh: 'zh-Hant-TW', en: 'en' }

export function setLang(lang: Lang): void {
  setPref('lang', lang)
}

/**
 * Current interface language and `t(zh, en)`. Strings stay next to the
 * component that shows them; there is no key catalogue.
 */
export function useLang(): { lang: Lang; t: (zh: string, en: string) => string } {
  const lang = useLibrary().prefs.lang
  const t = useCallback((zh: string, en: string) => (lang === 'en' ? en : zh), [lang])
  return { lang, t }
}
