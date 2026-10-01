/**
 * On-device translation through the browser's built-in Translator API
 * (https://developer.mozilla.org/docs/Web/API/Translator). Nothing leaves the
 * device. Browsers without the API report "unsupported" and the UI says so.
 */

export type TranslatorAvailability =
  'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported'

interface TranslatorOptions {
  sourceLanguage: string
  targetLanguage: string
  monitor?: (monitor: EventTarget) => void
}

interface BrowserTranslator {
  translate(input: string): Promise<string>
}

interface TranslatorFactory {
  availability(options: TranslatorOptions): Promise<TranslatorAvailability | null>
  create(options: TranslatorOptions): Promise<BrowserTranslator>
}

function factory(): TranslatorFactory | null {
  const candidate = (globalThis as { Translator?: TranslatorFactory }).Translator
  return candidate && typeof candidate.create === 'function' ? candidate : null
}

const pairKey = (source: string, target: string) => `${source}>${target}`
const instances = new Map<string, Promise<BrowserTranslator>>()
const results = new Map<string, string>()

export async function translatorAvailability(
  source: string,
  target: string,
): Promise<TranslatorAvailability> {
  const api = factory()
  if (!api) return 'unsupported'
  try {
    return (
      (await api.availability({ sourceLanguage: source, targetLanguage: target })) ?? 'unavailable'
    )
  } catch {
    return 'unavailable'
  }
}

/**
 * Translates `text`, creating (and possibly downloading) the language model on
 * first use. Call from a user gesture: the first download needs one.
 */
export async function translateText(
  text: string,
  source: string,
  target: string,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const cacheKey = `${pairKey(source, target)}\n${text}`
  const cached = results.get(cacheKey)
  if (cached !== undefined) return cached
  const api = factory()
  if (!api) throw new Error('unsupported')
  const key = pairKey(source, target)
  let instance = instances.get(key)
  if (!instance) {
    instance = api.create({
      sourceLanguage: source,
      targetLanguage: target,
      monitor(monitor) {
        monitor.addEventListener('downloadprogress', (event) => {
          const loaded = (event as Event & { loaded?: number }).loaded
          if (typeof loaded === 'number') onProgress?.(loaded)
        })
      },
    })
    instances.set(key, instance)
    instance.catch(() => instances.delete(key))
  }
  const translated = await (await instance).translate(text)
  results.set(cacheKey, translated)
  return translated
}
