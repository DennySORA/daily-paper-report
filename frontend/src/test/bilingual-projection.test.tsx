// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { act, cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { Reader } from '../components/Reader'
import { FulltextBadge } from '../components/Scorecard'
import { StoryList } from '../components/StoryList'
import { storyTitles, toStory } from '../data/story'
import type { RawStory } from '../data/types'
import { setLang } from '../state/lang'
import { rawStory } from './fixtures'

afterEach(() => {
  cleanup()
  act(() => setLang('zh'))
})

const bilingual = rawStory({
  story_id: 'blog:bilingual',
  title: '日本語の原題',
  title_zh: '繁體中文標題',
  title_en: 'Reviewed English title',
  summary: 'Legacy source summary.',
  summary_zh: '繁中導讀。\n- 中文限制',
  summary_en: 'Reviewed English guide.\n- Evidence\n- Limits',
  llm_evaluation: {
    score: 0.7,
    confidence: 0.92,
    fulltext_status: 'partial',
    rationale: '中文評選理由。',
    rationale_zh: '中文評選理由。',
    rationale_en: 'English assessment.',
  },
})

function reader(raw: RawStory) {
  return render(
    <MemoryRouter>
      <Reader
        story={toStory(raw, 'top5', 1, '2026-10-03')}
        topicHref={(topic) => `/?t=${encodeURIComponent(topic)}`}
        narrow={false}
        markOnOpen={false}
        nav={{ index: 0, total: 1, prevHref: null, nextHref: null, closeHref: '/' }}
      />
    </MemoryRouter>,
  )
}

describe('published bilingual projection', () => {
  it('uses explicit English fields without changing original content or scores', () => {
    const before = JSON.stringify(bilingual)
    const story = toStory(bilingual, 'top5', 1, '2026-10-03')
    expect(story.titleEn).toBe(bilingual.title_en)
    expect(story.summaryEn).toBe(bilingual.summary_en)
    expect(story.abstract).toBe(bilingual.summary)
    expect(storyTitles(story, 'en').title).toBe(bilingual.title_en)
    expect(story.evaluation).toMatchObject({ score: 0.7, confidence: 0.92, fulltext: 'partial' })
    expect(JSON.stringify(bilingual)).toBe(before)
  })

  it.each([undefined, null, '', '   '])('keeps old-record fallbacks for %s', (missing) => {
    const story = toStory(
      { ...bilingual, title_en: missing, summary_en: missing },
      'radar',
      1,
      '2026-10-03',
    )
    expect(story.titleEn).toBe(bilingual.title)
    expect(story.summaryEn).toBeNull()
    expect(story.abstract).toBe(bilingual.summary)
  })

  it('cleans explicit fields and retains the ID fallback for missing titles', () => {
    const story = toStory(
      { ...bilingual, title_en: ' <b>English</b> ', summary_en: '<p>English guide.</p>' },
      'radar',
      1,
      '2026-10-03',
    )
    expect(story.titleEn).toBe('English')
    expect(story.summaryEn).toBe('English guide.')
    expect(toStory({ ...bilingual, title_en: '', title: '' }, 'radar', 1, '').titleEn).toBe(
      bilingual.story_id,
    )
  })

  it('switches title, guide and assessment together and back repeatedly', () => {
    const { container } = reader({ ...bilingual, summary: null })
    const title = () => container.querySelector('#reader-title')?.textContent
    const summary = () =>
      container.querySelector('section[aria-labelledby="summary-title"] .reading-prose')
    const rationale = () =>
      container.querySelector('section[aria-labelledby="rationale-title"] .reading-prose')
    for (let index = 0; index < 2; index += 1) {
      expect(title()).toBe(bilingual.title_zh)
      expect(summary()?.getAttribute('lang')).toBe('zh-Hant')
      expect(summary()?.textContent).toContain('繁中導讀。')
      expect(rationale()?.textContent).toBe(bilingual.llm_evaluation?.rationale_zh)
      expect(container.textContent).toContain('部分內容評估')
      act(() => setLang('en'))
      expect(title()).toBe(bilingual.title_en)
      expect(summary()?.getAttribute('lang')).toBe('en')
      expect(summary()?.textContent).toContain('Reviewed English guide.')
      expect(summary()?.querySelectorAll('li')).toHaveLength(2)
      expect(rationale()?.textContent).toBe(bilingual.llm_evaluation?.rationale_en)
      expect(container.textContent).toContain('Partial text')
      expect(container.textContent).not.toContain('No English summary')
      expect(container.textContent).not.toContain('Basis unknown')
      act(() => setLang('zh'))
    }
  })

  it('shows the explicit English guide ahead of an available original summary', () => {
    act(() => setLang('en'))
    const { container } = reader(bilingual)
    const section = container.querySelector('section[aria-labelledby="summary-title"]')!
    expect(section.querySelector('.reading-prose')?.textContent).toContain(
      'Reviewed English guide.',
    )
    expect(section.textContent).not.toContain('Legacy source summary.')
    expect(section.querySelector('[lang="zh-Hant"]')?.textContent).toContain('繁中導讀。')
  })

  it('renders explicit English titles in the story list', () => {
    const story = toStory(bilingual, 'top5', 1, '2026-10-03')
    const { container } = render(
      <MemoryRouter>
        <StoryList
          groups={[{ section: 'top5', stories: [story] }]}
          selectedId={null}
          hrefFor={() => '/'}
          readIds={{}}
          savedIds={{}}
          showHeaders={false}
          replaceHistory={false}
          lang="en"
        />
      </MemoryRouter>,
    )
    expect(container.textContent).toContain('Reviewed English title')
    expect(container.textContent).not.toContain('日本語の原題')
  })

  it('keeps the original summary fallback for legacy English records', () => {
    act(() => setLang('en'))
    const { container } = reader({ ...bilingual, title_en: null, summary_en: null })
    const section = container.querySelector('section[aria-labelledby="summary-title"]')!
    expect(container.querySelector('#reader-title')?.textContent).toBe(bilingual.title)
    expect(section.querySelector('.reading-prose')?.textContent).toBe(bilingual.summary)
    expect(section.textContent).not.toContain('No English summary')
  })

  it('labels Chinese fallback honestly when both English sources are absent', () => {
    act(() => setLang('en'))
    const { container } = reader({ ...bilingual, summary: null, summary_en: null })
    const section = container.querySelector('section[aria-labelledby="summary-title"]')!
    expect(section.textContent).toContain('No English summary')
    expect(section.querySelector('.reading-prose')?.getAttribute('lang')).toBe('zh-Hant')
    expect(section.querySelector('.reading-prose')?.textContent).toContain('繁中導讀。')
  })

  it.each([
    ['complete', 'Full text'],
    ['partial', 'Partial text'],
    ['abstract_only', 'Abstract only'],
    ['unexpected', 'Basis unknown'],
    [undefined, 'Basis unknown'],
  ])('keeps the %s evaluation basis distinct', (status, label) => {
    act(() => setLang('en'))
    const story = toStory(
      { ...bilingual, llm_evaluation: { fulltext_status: status } },
      'top5',
      1,
      '2026-10-03',
    )
    const { container } = render(<FulltextBadge status={story.evaluation!.fulltext} />)
    expect(container.textContent).toBe(label)
  })
})

const noticeSource = readFileSync('public/partial-notice.js', 'utf8')

async function partialNotice(info: Record<string, unknown>, day = '2026-10-08') {
  const noticeDocument = document.implementation.createHTMLDocument()
  noticeDocument.body.innerHTML = '<header><h1 id="view-title"></h1></header>'
  runInNewContext(noticeSource, {
    document: noticeDocument,
    location: { hash: `#/day/${day}`, pathname: '/' },
    MutationObserver: class {
      observe() {}
    },
    addEventListener() {},
    fetch: async () => ({
      ok: true,
      json: async () => ({
        run_date: day,
        run_info: { coverage_status: 'partial', source_collection_cutoff_utc: null, ...info },
      }),
    }),
  })
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  return noticeDocument.getElementById('oct3-partial-release-notice')?.textContent ?? ''
}

describe('data-bound partial ranking disclosure', () => {
  it('preserves additive ranking limits across historical, current and future counts', async () => {
    for (const [count, baseline, added, kind, reviewed] of [
      [24, 19, 5, undefined, 5],
      [22, 18, 4, 'unpublished_proposed_candidate', undefined],
      [33, 29, 4, 'published_approved', 5],
      [37, 33, 4, 'published_approved', 4],
      [35, 30, 5, 'unpublished_proposed_candidate', undefined],
      [41, 37, 4, 'published_approved', 6],
    ] as const) {
      const text = await partialNotice({
        reviewed_selected_count: count,
        combined_native_reranked: false,
        preserved_baseline_count: baseline,
        added_native_count: added,
        preserved_baseline_kind: kind,
        added_reviewed_candidate_count: reviewed,
      })
      expect(text).toContain(`已核對 ${count} 筆`)
      expect(text).toContain(`${count}篇未合併重新排名`)
      expect(text).toContain(`without reranking all ${count}`)
      expect(text).toContain('及既有順序')
      expect(text).toContain(`${added} additions are appended to Papers in their subset order`)
      expect(text).toContain('全日總數與涵蓋率未知')
      expect(text).toContain('Source collection cutoff is unknown')
      if (reviewed !== undefined) expect(text).toContain(`selected ${added} of ${reviewed}`)
      else expect(text).not.toContain('The unchanged filter selected')
    }
  })

  it('keeps the no-rerank limit without inventing invalid or missing baseline details', async () => {
    for (const details of [
      {},
      { preserved_baseline_count: 33, added_native_count: 5 },
      { preserved_baseline_count: -1, added_native_count: 38 },
      { preserved_baseline_count: '33', added_native_count: 4 },
      { preserved_baseline_count: 33, added_native_count: 4, preserved_baseline_kind: 'unknown' },
    ]) {
      const text = await partialNotice({
        reviewed_selected_count: 37,
        combined_native_reranked: false,
        ...details,
      })
      expect(text).toContain('本版本未合併重新排名')
      expect(text).toContain('baseline and addition details are unknown')
      expect(text).not.toContain('additions are appended')
      expect(text).not.toContain('published baseline')
    }
    const text = await partialNotice({
      reviewed_selected_count: 37,
      combined_native_reranked: false,
      preserved_baseline_count: 33,
      added_native_count: 4,
      added_reviewed_candidate_count: 3,
    })
    expect(text).toContain('without reranking all 37')
    expect(text).not.toContain('The unchanged filter selected')
  })

  it('does not fabricate a no-rerank claim when the metadata does not state it', async () => {
    for (const flag of [undefined, true, 'false']) {
      const text = await partialNotice({
        reviewed_selected_count: 8,
        combined_native_reranked: flag,
      })
      expect(text).toContain('Ranking covers this subset only')
      expect(text).not.toContain('未合併重新排名')
    }
  })
})
