import { describe, expect, it } from 'vitest'
import { legacyRoute } from '../app/routes'
import { applyFilter, parseFilter, topicCounts } from '../data/filter'
import { searchStories } from '../data/search'
import { bibtex, digestGroups, readingLinks, toStory } from '../data/story'
import { normalizeTopics, topicInfo } from '../data/topics'
import type { SearchIndex } from '../data/types'
import { formatDuration, weekday } from '../lib/format'
import { digest, rawStory } from './fixtures'

const evaluated = rawStory({
  story_id: 'arxiv:2609.38149',
  arxiv_id: '2609.38149',
  title: 'Pretraining Latent Information Feedback Transformers',
  title_zh: '預訓練潛在資訊回饋 Transformer',
  summary_zh: '第一段。\n第二段。',
  authors: ['Dor Tirosh', 'Ido Amos', 'Mor Geva'],
  categories: ['cs.CL'],
  published_at: '2026-09-29T17:57:40+00:00',
  llm_evaluation: {
    score: 0.8575,
    components: { novelty: 0.78, rigor: 0.87 },
    fulltext_status: 'complete',
    topics: ['Large Language Models', 'LLM', 'Latent feedback / recurrent depth'],
    evidence: ['§4 Results: 100% accuracy'],
  },
})
const plain = rawStory({
  story_id: 'arxiv:2609.00001',
  arxiv_id: '2609.00001',
  title: 'Agents in the wild',
})

describe('topics', () => {
  it('collapses canonical names and aliases into one key with a Chinese label', () => {
    expect(topicInfo('LLMs').key).toBe(topicInfo('Large Language Models').key)
    expect(topicInfo('LLMs').label).toBe('大型語言模型')
    expect(
      normalizeTopics(['LLM', 'Large Language Models', 'agents']).map((topic) => topic.label),
    ).toEqual(['大型語言模型', '代理與工具使用'])
  })

  it('keeps free-form topics verbatim', () => {
    expect(topicInfo(' Latent feedback / recurrent depth ')).toMatchObject({
      canonical: false,
      label: 'Latent feedback / recurrent depth',
    })
  })
})

describe('story view model', () => {
  it('normalizes titles, evaluation and links', () => {
    const story = toStory(evaluated, 'top5', 1, '2026-09-30')
    expect(story.kind).toBe('paper')
    expect(story.titleZh).toBe('預訓練潛在資訊回饋 Transformer')
    expect(story.evaluation?.score).toBeCloseTo(0.8575)
    expect(story.evaluation?.components.find((component) => component.key === 'rigor')?.value).toBe(
      0.87,
    )
    expect(
      story.evaluation?.components.find((component) => component.key === 'reproducibility')?.value,
    ).toBeNull()
    expect(story.topics).toHaveLength(2)
    expect(readingLinks(story).map((link) => link.href)).toEqual([
      'https://arxiv.org/abs/2609.38149',
      'https://arxiv.org/pdf/2609.38149',
      'https://arxiv.org/html/2609.38149',
    ])
  })

  it('builds BibTeX only for arXiv papers', () => {
    const story = toStory(evaluated, 'top5', 1, '2026-09-30')
    const entry = bibtex(story)
    expect(entry).toContain('@misc{tirosh2026_260938149,')
    expect(entry).toContain('author = {Dor Tirosh and Ido Amos and Mor Geva},')
    expect(entry).toContain('eprint = {2609.38149},')
    const blog = toStory(
      rawStory({
        story_id: 'blog:1',
        primary_link: {
          url: 'https://example.com',
          link_type: 'blog',
          source_id: 'b',
          tier: 0,
          title: 'b',
        },
      }),
      'radar',
      1,
      '2026-09-30',
    )
    expect(bibtex(blog)).toBeNull()
  })

  it('orders digest sections and groups releases by entity name', () => {
    const groups = digestGroups(
      digest({
        top5: [evaluated],
        papers: [plain],
        model_releases_by_entity: {
          qwen: [rawStory({ story_id: 'hf:qwen/x', hf_model_id: 'qwen/x' })],
        },
        entity_catalog: { qwen: { name: 'Qwen', type: 'organization' } },
      }),
    )
    expect(groups.map((group) => group.section)).toEqual(['top5', 'papers', 'radar', 'releases'])
    expect(groups[3]?.stories[0]).toMatchObject({ kind: 'model', group: 'Qwen' })
  })
})

describe('filters', () => {
  const groups = digestGroups(digest({ top5: [evaluated], papers: [plain] }))

  it('parses URL state with safe defaults', () => {
    expect(parseFilter(new URLSearchParams('s=bogus&sort=nope'), ['top5'])).toMatchObject({
      section: 'all',
      sort: 'rank',
    })
    expect(parseFilter(new URLSearchParams('s=top5&u=1&sort=score'), ['top5'])).toMatchObject({
      section: 'top5',
      unreadOnly: true,
      sort: 'score',
    })
  })

  it('filters by topic, text and unread state while keeping the selection', () => {
    const base = parseFilter(new URLSearchParams(), ['top5', 'papers'])
    const llm = topicInfo('LLM').key
    expect(
      applyFilter(groups, { ...base, topic: llm }, {})
        .flatMap((group) => group.stories)
        .map((s) => s.id),
    ).toEqual(['arxiv:2609.38149'])
    expect(
      applyFilter(groups, { ...base, query: '預訓練' }, {}).flatMap((group) => group.stories),
    ).toHaveLength(1)
    const read = { 'arxiv:2609.38149': 1 }
    expect(
      applyFilter(groups, { ...base, unreadOnly: true }, read)
        .flatMap((group) => group.stories)
        .map((s) => s.id),
    ).toEqual(['arxiv:2609.00001'])
    expect(
      applyFilter(groups, { ...base, unreadOnly: true }, read, 'arxiv:2609.38149').flatMap(
        (group) => group.stories,
      ),
    ).toHaveLength(2)
  })

  it('counts topics across groups', () => {
    expect(topicCounts(groups).find((topic) => topic.label === '大型語言模型')).toMatchObject({
      count: 1,
    })
    expect(topicCounts(groups)).toHaveLength(2)
  })
})

describe('search', () => {
  const index: SearchIndex = {
    schema: 1,
    generated_at: '2026-09-30T00:00:00Z',
    rows: [
      [
        'arxiv:2609.38149',
        '2026-09-30',
        'top5',
        0.86,
        'Pretraining Latent Feedback',
        '預訓練潛在回饋',
        ['LLM'],
        ['Mor Geva'],
        'arxiv',
      ],
      [
        'arxiv:2609.00002',
        '2026-09-29',
        'papers',
        0.5,
        'Agent memory benchmark',
        null,
        ['agents'],
        ['A. Author'],
        'arxiv',
      ],
      [
        'blog:1',
        '2026-09-28',
        'radar',
        null,
        'Memory for agents in production',
        null,
        [],
        [],
        'blog',
      ],
    ],
  }

  it('requires every term and ranks title matches first', () => {
    expect(searchStories(index, 'agent memory').map((hit) => hit.id)).toEqual([
      'arxiv:2609.00002',
      'blog:1',
    ])
    expect(searchStories(index, '潛在').map((hit) => hit.id)).toEqual(['arxiv:2609.38149'])
    expect(searchStories(index, 'geva').map((hit) => hit.id)).toEqual(['arxiv:2609.38149'])
    expect(searchStories(index, '大型語言模型').map((hit) => hit.id)).toEqual(['arxiv:2609.38149'])
  })

  it('pins an exact arXiv identifier to the top', () => {
    expect(searchStories(index, '2609.38149v2')[0]?.id).toBe('arxiv:2609.38149')
  })

  it('returns nothing for a blank query', () => {
    expect(searchStories(index, '   ')).toEqual([])
  })
})

describe('legacy routes', () => {
  it.each([
    ['/day/2026-09-30.html', '/day/2026-09-30'],
    ['/day/2026-09-30/', '/day/2026-09-30'],
    ['/reports/weekly/2026-W39.html', '/weekly/2026-W39'],
    ['/reports/monthly/2026-09.html', '/monthly/2026-09'],
    ['/reports/', '/reports'],
    ['/archive/index.html', '/archive'],
    ['/status/', '/sources'],
    ['/sources', '/sources'],
    ['/index.html', '/'],
  ])('%s → %s', (from, to) => {
    expect(legacyRoute(from)).toBe(to)
  })

  it('returns null for unknown paths', () => {
    expect(legacyRoute('/wp-admin')).toBeNull()
    expect(legacyRoute('/day/not-a-date.html')).toBeNull()
  })
})

describe('format', () => {
  it('computes UTC weekdays and durations', () => {
    expect(weekday('2026-09-30')).toBe('三')
    expect(formatDuration('2026-09-30T02:00:05Z', '2026-09-30T12:51:41Z')).toBe('10 小時 52 分')
    expect(formatDuration(null, '2026-09-30T12:51:41Z')).toBe('未知')
  })
})
