// @vitest-environment jsdom
import { act, cleanup, render, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { Reader } from '../components/Reader'
import { Prose } from '../components/Prose'
import { toStory } from '../data/story'
import { setLang } from '../state/lang'
import { rawStory } from './fixtures'

afterEach(() => {
  cleanup()
  act(() => setLang('zh'))
})
function showReader(rationaleZh?: string | null) {
  const story = toStory(
    rawStory({
      story_id: 'fixture-reading',
      summary_zh: '研究背景。主要方法。\n- 增益 73.33%\n- 限制',
      summary: 'Original abstract.',
      llm_evaluation: {
        rationale: 'Original assessment.\n- Evidence\n- Limits',
        rationale_zh: rationaleZh,
      },
    }),
    'top5',
    1,
    '2026-10-03',
  )
  return render(
    <MemoryRouter>
      <Reader
        story={story}
        topicHref={(topic) => `/?t=${encodeURIComponent(topic)}`}
        narrow={false}
        markOnOpen={false}
        nav={{ index: 0, total: 1, prevHref: null, nextHref: null, closeHref: '/' }}
      />
    </MemoryRouter>,
  )
}

describe('reader prose', () => {
  it('renders real paragraphs and lists as safe text', () => {
    const { container } = render(
      <Prose
        lang="zh"
        text={'第一句。第二句。\n- `a.b`\n- <script>alert(1)</script>\n\n3. 第三項'}
      />,
    )
    expect(container.querySelectorAll('p')).toHaveLength(2)
    expect(container.querySelectorAll('ul > li')).toHaveLength(2)
    expect(container.querySelector('ol > li')?.getAttribute('value')).toBe('3')
    expect(container.querySelector('code')?.textContent).toBe('a.b')
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('<script>alert(1)</script>')
  })
  it('shows Chinese assessment and retains English comparison in either language', () => {
    const { container } = showReader('評審第一句。評審第二句。\n- 中文證據\n- 中文限制')
    const section = container.querySelector<HTMLElement>(
      'section[aria-labelledby="rationale-title"]',
    )!
    expect(section.querySelectorAll('[lang="zh-Hant"] p')).toHaveLength(2)
    expect(section.querySelectorAll('[lang="zh-Hant"] li')).toHaveLength(2)
    expect(within(section).getByText('評審原文')).toBeTruthy()
    expect(section.querySelector('[lang="en"]')?.textContent).toContain('Original assessment.')
    act(() => setLang('en'))
    expect(section.querySelector('.reading-prose')?.getAttribute('lang')).toBe('en')
    expect(within(section).getByText('Chinese assessment (中文評審理由)')).toBeTruthy()
  })
  it.each([undefined, null, '   '])('labels absent Chinese honestly (%s)', (value) => {
    const { container } = showReader(value)
    const section = container.querySelector('section[aria-labelledby="rationale-title"]')!
    expect(section.textContent).toContain('中文評審欄位尚未提供，顯示原文')
    expect(section.querySelector('[lang="zh-Hant"]')).toBeNull()
    expect(section.querySelector('[lang="en"]')?.textContent).toContain('Original assessment.')
  })
})
