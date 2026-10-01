// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useMachineTranslation } from '../components/MachineTranslation'
import { storyTitles, toStory } from '../data/story'
import { formatDay, formatDuration, formatMonth } from '../lib/format'
import { setLang } from '../state/lang'
import { rawStory } from './fixtures'

type TranslatorGlobal = { Translator?: unknown }

afterEach(() => {
  cleanup()
  act(() => setLang('zh'))
  delete (globalThis as TranslatorGlobal).Translator
})

describe('language-dependent text', () => {
  const story = toStory(
    rawStory({ story_id: 'arxiv:1', title: 'English title', title_zh: '中文標題' }),
    'top5',
    1,
    '2026-09-30',
  )

  it('picks titles for the reading language', () => {
    expect(storyTitles(story, 'zh')).toEqual({ title: '中文標題', subtitle: 'English title' })
    expect(storyTitles(story, 'en')).toEqual({ title: 'English title', subtitle: null })
    const untranslated = { ...story, titleZh: null }
    expect(storyTitles(untranslated, 'zh')).toEqual({ title: 'English title', subtitle: null })
  })

  it('formats dates and durations in English', () => {
    expect(formatDay('2026-09-30', 'en')).toBe('2026-09-30 (Wed)')
    expect(formatMonth('2026-09', 'en')).toBe('September 2026')
    expect(formatDuration('2026-09-30T02:00:00Z', '2026-09-30T12:52:00Z', 'en')).toBe('10 h 52 min')
  })
})

function Probe({ texts }: { texts: string[] }) {
  const translation = useMachineTranslation(texts, 'en')
  return (
    <div>
      {translation.control}
      <p data-testid="text">{translation.texts.join('|')}</p>
    </div>
  )
}

describe('on-device translation', () => {
  it('translates English text for Chinese readers and keeps the original one click away', async () => {
    ;(globalThis as TranslatorGlobal).Translator = {
      availability: async () => 'available',
      create: async () => ({ translate: async (input: string) => `譯：${input}` }),
    }
    render(<Probe texts={['first', 'second']} />)
    await act(async () => screen.getByRole('button', { name: '翻成中文' }).click())
    expect(screen.getByTestId('text').textContent).toBe('譯：first|譯：second')
    await act(async () => screen.getByRole('button', { name: '顯示原文' }).click())
    expect(screen.getByTestId('text').textContent).toBe('first|second')
  })

  it('explains when the browser has no translator', async () => {
    render(<Probe texts={['only']} />)
    await act(async () => screen.getByRole('button', { name: '翻成中文' }).click())
    expect(screen.getByRole('status').textContent).toContain('不支援本機翻譯')
    expect(screen.getByTestId('text').textContent).toBe('only')
  })

  it('offers nothing when the text is already in the reading language', () => {
    act(() => setLang('en'))
    render(<Probe texts={['english']} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
