import { foldForSearch } from '../lib/text'
import type { SectionKey, Story, StoryGroup } from './story'

export type SortKey = 'rank' | 'score' | 'time'

export interface StoryFilter {
  section: SectionKey | 'all'
  topic: string | null
  query: string
  unreadOnly: boolean
  sort: SortKey
}

export const SORT_LABEL: Record<SortKey, string> = {
  rank: '原始排序',
  score: 'LLM 分數',
  time: '發表時間',
}

export function parseFilter(params: URLSearchParams, sections: readonly SectionKey[]): StoryFilter {
  const section = params.get('s')
  const sort = params.get('sort')
  return {
    section:
      section && (sections as readonly string[]).includes(section)
        ? (section as SectionKey)
        : 'all',
    topic: params.get('t') || null,
    query: params.get('q') ?? '',
    unreadOnly: params.get('u') === '1',
    sort: sort === 'score' || sort === 'time' ? sort : 'rank',
  }
}

export function isFiltered(filter: StoryFilter): boolean {
  return filter.topic !== null || filter.query.trim() !== '' || filter.unreadOnly
}

function matchesQuery(story: Story, terms: string[]): boolean {
  if (terms.length === 0) return true
  const haystack = foldForSearch(
    [
      story.titleZh ?? '',
      story.titleEn,
      story.arxivId ?? '',
      story.authors.join(' '),
      story.topics.map((topic) => `${topic.label} ${topic.key}`).join(' '),
      story.categories.join(' '),
      story.group ?? '',
    ].join('\n'),
  )
  return terms.every((term) => haystack.includes(term))
}

const scoreOf = (story: Story) => story.evaluation?.score ?? -1
const timeOf = (story: Story) => (story.publishedAt ? Date.parse(story.publishedAt) || 0 : 0)

/**
 * Applies filters and sort while keeping section grouping for the reading order.
 * `keepId` stays listed under the unread filter so opening a story (which marks
 * it read) never removes the current selection from the list.
 */
export function applyFilter(
  groups: StoryGroup[],
  filter: StoryFilter,
  readIds: Record<string, number>,
  keepId: string | null = null,
): StoryGroup[] {
  const terms = foldForSearch(filter.query).split(/\s+/).filter(Boolean)
  return groups
    .filter((group) => filter.section === 'all' || group.section === filter.section)
    .map((group) => {
      const stories = group.stories.filter(
        (story) =>
          (!filter.topic || story.topics.some((topic) => topic.key === filter.topic)) &&
          (!filter.unreadOnly || !(story.id in readIds) || story.id === keepId) &&
          matchesQuery(story, terms),
      )
      if (filter.sort === 'score')
        stories.sort((a, b) => scoreOf(b) - scoreOf(a) || a.rank - b.rank)
      if (filter.sort === 'time') stories.sort((a, b) => timeOf(b) - timeOf(a) || a.rank - b.rank)
      return { section: group.section, stories }
    })
}

export interface TopicCount {
  key: string
  label: string
  count: number
}

/** Topics present in the given groups, most frequent first. */
export function topicCounts(groups: StoryGroup[]): TopicCount[] {
  const counts = new Map<string, TopicCount>()
  for (const group of groups) {
    for (const story of group.stories) {
      for (const topic of story.topics) {
        const entry = counts.get(topic.key)
        if (entry) entry.count += 1
        else counts.set(topic.key, { key: topic.key, label: topic.label, count: 1 })
      }
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

export const flatten = (groups: StoryGroup[]): Story[] => groups.flatMap((group) => group.stories)
