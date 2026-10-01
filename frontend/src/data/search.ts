import { foldForSearch } from '../lib/text'
import { topicInfo } from './topics'
import type { SearchIndex, SearchRow } from './types'

export interface SearchHit {
  id: string
  date: string
  section: string
  score: number | null
  title: string
  titleZh: string | null
  topics: string[]
  authors: string[]
  linkType: string
  rank: number
}

interface Prepared {
  row: SearchRow
  title: string
  titleZh: string
  rest: string
}

const preparedCache = new WeakMap<SearchIndex, Prepared[]>()

function prepare(index: SearchIndex): Prepared[] {
  const cached = preparedCache.get(index)
  if (cached) return cached
  const prepared = index.rows.map((row) => ({
    row,
    title: foldForSearch(row[4]),
    titleZh: foldForSearch(row[5] ?? ''),
    rest: foldForSearch(
      [
        row[0],
        row[6].map((topic) => `${topic} ${topicInfo(topic).label}`).join(' '),
        row[7].join(' '),
      ].join('\n'),
    ),
  }))
  preparedCache.set(index, prepared)
  return prepared
}

const ARXIV_ID = /^\d{4}\.\d{4,5}(v\d+)?$/

/**
 * Ranks every published story against all query terms (AND). Title matches
 * outrank topic/author/id matches; ties break toward higher LLM score and the
 * newer day.
 */
export function searchStories(index: SearchIndex, query: string, limit = 200): SearchHit[] {
  // A versioned arXiv id ("2609.38149v2") matches the unversioned story id.
  const terms = foldForSearch(query)
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => (ARXIV_ID.test(term) ? term.replace(/v\d+$/, '') : term))
  if (terms.length === 0) return []
  const exactId = terms.length === 1 && ARXIV_ID.test(terms[0] ?? '') ? terms[0] : null
  const hits: SearchHit[] = []
  for (const entry of prepare(index)) {
    let rank = 0
    let matched = true
    for (const term of terms) {
      if (entry.titleZh.includes(term)) rank += 6
      else if (entry.title.includes(term)) rank += 5
      else if (entry.rest.includes(term)) rank += 2
      else {
        matched = false
        break
      }
    }
    if (!matched) continue
    const [id, date, section, score, title, titleZh, topics, authors, linkType] = entry.row
    if (exactId && id.endsWith(exactId)) rank += 100
    hits.push({ id, date, section, score, title, titleZh, topics, authors, linkType, rank })
  }
  hits.sort(
    (a, b) => b.rank - a.rank || (b.score ?? -1) - (a.score ?? -1) || b.date.localeCompare(a.date),
  )
  return hits.slice(0, limit)
}
