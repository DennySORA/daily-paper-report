import { Languages, RotateCw } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { translateText, translatorAvailability } from '../lib/translator'
import { useLang } from '../state/lang'
import { ICON_SM } from './ui'

type Phase =
  | { kind: 'idle' }
  | { kind: 'working'; progress: number | null }
  | { kind: 'done'; texts: string[] }
  | { kind: 'error'; reason: 'unsupported' | 'unavailable' | 'failed' }

interface Entry {
  signature: string
  phase: Phase
  showOriginal: boolean
}

const IDLE: Phase = { kind: 'idle' }
const tag = (lang: 'zh' | 'en') => (lang === 'en' ? 'en' : 'zh-Hant')

/**
 * Optional on-device translation of text that only exists in another language
 * (LLM rationale, evidence, untranslated abstracts). Returns a header control
 * and the texts to show; the original stays one click away. State belongs to
 * one text/language signature, so switching story or language starts over and
 * late results for an old signature are dropped.
 */
export function useMachineTranslation(
  texts: string[],
  sourceLang: 'zh' | 'en',
): { control: ReactNode; texts: string[]; translated: boolean } {
  const { lang, t } = useLang()
  const signature = `${sourceLang}>${lang}\n${texts.join('\n')}`
  const [stored, setStored] = useState<Entry>({ signature, phase: IDLE, showOriginal: false })
  const run = useRef(0)
  const entry =
    stored.signature === signature ? stored : { signature, phase: IDLE, showOriginal: false }

  if (sourceLang === lang || texts.length === 0) {
    return { control: null, texts, translated: false }
  }

  const update = (owner: string, change: Partial<Entry>) =>
    setStored((previous) => {
      const base =
        previous.signature === owner
          ? previous
          : { signature: owner, phase: IDLE, showOriginal: false }
      return { ...base, ...change }
    })

  const translate = async () => {
    const owner = signature
    const id = ++run.current
    update(owner, { phase: { kind: 'working', progress: null } })
    const availability = await translatorAvailability(tag(sourceLang), tag(lang))
    if (id !== run.current) return
    if (availability === 'unsupported' || availability === 'unavailable') {
      update(owner, { phase: { kind: 'error', reason: availability } })
      return
    }
    try {
      const output: string[] = []
      for (const text of texts) {
        output.push(
          await translateText(text, tag(sourceLang), tag(lang), (fraction) => {
            if (id === run.current)
              update(owner, { phase: { kind: 'working', progress: fraction } })
          }),
        )
        if (id !== run.current) return
      }
      update(owner, { phase: { kind: 'done', texts: output }, showOriginal: false })
    } catch {
      if (id === run.current) update(owner, { phase: { kind: 'error', reason: 'failed' } })
    }
  }

  const { phase, showOriginal } = entry
  let control: ReactNode
  if (phase.kind === 'done') {
    control = (
      <span className="flex items-center gap-2">
        {!showOriginal ? (
          <span className="text-caption text-fg-3">
            {t('瀏覽器本機翻譯', 'On-device translation')}
          </span>
        ) : null}
        <button
          type="button"
          className="btn btn-quiet h-7 min-h-7 text-meta"
          onClick={() => update(signature, { showOriginal: !showOriginal })}
        >
          <Languages {...ICON_SM} />
          {showOriginal ? t('顯示譯文', 'Show translation') : t('顯示原文', 'Show original')}
        </button>
      </span>
    )
  } else if (phase.kind === 'working') {
    const percent =
      phase.progress !== null && phase.progress < 1 ? Math.round(phase.progress * 100) : null
    control = (
      <span className="text-caption text-fg-3" role="status">
        {percent !== null
          ? t(`下載翻譯模型 ${percent}%`, `Downloading model ${percent}%`)
          : t('翻譯中…', 'Translating…')}
      </span>
    )
  } else if (phase.kind === 'error') {
    const message =
      phase.reason === 'unsupported'
        ? t(
            '此瀏覽器不支援本機翻譯（需 Chrome 138 以上）',
            'No on-device translator in this browser (Chrome 138+)',
          )
        : phase.reason === 'unavailable'
          ? t('這組語言無法在本機翻譯', 'This language pair is not available on this device')
          : t('翻譯失敗', 'Translation failed')
    control = (
      <span className="flex items-center gap-2 text-caption text-warning" role="status">
        {message}
        {phase.reason === 'failed' ? (
          <button type="button" className="btn btn-quiet h-7 min-h-7 text-meta" onClick={translate}>
            <RotateCw {...ICON_SM} />
            {t('重試', 'Retry')}
          </button>
        ) : null}
      </span>
    )
  } else {
    control = (
      <button type="button" className="btn btn-quiet h-7 min-h-7 text-meta" onClick={translate}>
        <Languages {...ICON_SM} />
        {lang === 'en' ? 'Translate to English' : '翻成中文'}
      </button>
    )
  }

  const translated = phase.kind === 'done' && !showOriginal
  return { control, texts: translated ? phase.texts : texts, translated }
}
