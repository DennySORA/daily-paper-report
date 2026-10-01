// @vitest-environment jsdom
import { act, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { storyTitles, toStory } from '../data/story'
import { formatDay, formatDuration, formatMonth } from '../lib/format'
import { setLang } from '../state/lang'
import { rawStory } from './fixtures'

afterEach(() => {
  cleanup()
  act(() => setLang('zh'))
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
