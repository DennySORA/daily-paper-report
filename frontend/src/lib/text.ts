const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  middot: '·',
  times: '×',
}

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const hex = entity[1] === 'x' || entity[1] === 'X'
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match
  })
}

// Only real markup is removed; "<1%", "p<0.05" or ">3x" in prose must survive.
const TAG =
  /<\/?(?:a|abbr|b|blockquote|br|code|del|details|div|em|figcaption|figure|font|h[1-6]|hr|i|img|ins|kbd|li|mark|ol|p|picture|pre|q|s|section|small|source|span|strong|sub|summary|sup|table|tbody|td|th|thead|tr|tt|u|ul)\b[^<>]*>|<!--[\s\S]*?-->/gi

/**
 * Turns feed summaries (which may carry HTML fragments, entities and Markdown
 * emphasis from READMEs or blog feeds) into plain display text. The result is
 * always rendered as text, never as HTML.
 */
export function cleanText(input: string | null | undefined, preserveCode = false): string {
  if (!input) return ''
  const code: string[] = []
  let marker = '\uE000'
  while (input.includes(marker)) marker += '\uE000'
  const source = preserveCode
    ? input.replace(/`[^`\n]+`/g, (value) => {
        code.push(value)
        return `${marker}${code.length - 1}${marker}`
      })
    : input
  const cleaned = decodeEntities(
    source
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|pre|h[1-6])\s*>/gi, '\n')
      .replace(TAG, ''),
  )
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, preserveCode ? '$&' : '$1')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return code.reduce(
    (text, value, index) => text.replace(`${marker}${index}${marker}`, () => value),
    cleaned,
  )
}

/** Splits cleaned text into paragraphs on blank lines or single line breaks. */
export function paragraphs(input: string): string[] {
  return input
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

export interface TextSegment {
  kind: 'text' | 'link' | 'ref'
  value: string
}

// A reference target: "5.2", "10", "B.2", "D" (a lone capital must end a word).
const REF_TOKEN = String.raw`(?:[A-Z]\b(?:\.\d+)*|\d+(?:\.\d+)*)`
const LINK_OR_REF = new RegExp(
  String.raw`(https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?])|((?:§\s?${REF_TOKEN}|(?:Tables?|Fig\.?|Figure|Appendix|Eq\.?|Section|Sec\.)\s${REF_TOKEN})(?:\s?[–/-]\s?(?:§\s?)?${REF_TOKEN})?)`,
  'g',
)

/** Marks URLs and paper section references (§5.2, Table 1, Appendix B.2) in evidence text. */
export function segmentEvidence(input: string): TextSegment[] {
  const segments: TextSegment[] = []
  let last = 0
  for (const match of input.matchAll(LINK_OR_REF)) {
    const index = match.index ?? 0
    if (index > last) segments.push({ kind: 'text', value: input.slice(last, index) })
    segments.push({ kind: match[1] ? 'link' : 'ref', value: match[0] })
    last = index + match[0].length
  }
  if (last < input.length) segments.push({ kind: 'text', value: input.slice(last) })
  return segments
}

/** Normalizes text for case-insensitive, width-insensitive matching. */
export function foldForSearch(input: string): string {
  return input.normalize('NFKC').toLowerCase()
}

/** Keeps code boundaries and explicit list items for the reading view only. */
export function cleanReadingText(input: string | null | undefined): string {
  if (!input) return ''
  const lists: Array<number | null> = []
  const marked = input
    .replace(/<\/?code\b[^<>]*>/gi, '`')
    .replace(/`[^`\n]*`|<\/?(?:ol|ul|li)\b[^<>]*>/gi, (tag) => {
      if (tag.startsWith('`')) return tag
      const closing = tag.startsWith('</')
      if (/^<\/?(?:ol|ul)\b/i.test(tag)) {
        if (closing) lists.pop()
        else {
          const start = /\bstart=["']?(\d+)/i.exec(tag)
          lists.push(/^<ol\b/i.test(tag) ? Number(start?.[1] ?? 1) : null)
        }
        return '\n'
      }
      if (closing) return ''
      const counter = lists.at(-1)
      if (typeof counter === 'number') {
        const value = /\bvalue=["']?(\d+)/i.exec(tag)
        const number = Number(value?.[1] ?? counter)
        lists[lists.length - 1] = number + 1
        return `\n${number}. `
      }
      return '\n- '
    })
  return cleanText(marked, true)
}

export type ReadingBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: Array<{ text: string; value?: number }> }

/**
 * Conservative sentence breaks: CJK stops and unambiguous English !/? only.
 * English periods are deliberately left intact (abbreviations and decimals).
 * URLs, Markdown links, inline code and paired brackets are indivisible.
 */
export function readingSentences(input: string): string[] {
  const result: string[] = []
  const protectedSpan =
    /`[^`]*`|https?:\/\/[^\s<>]+|\[[^\]]*\]\([^)]*\)|\([^)]*\)|（[^）]*）|\[[^\]]*\]/g
  const spans = [...input.matchAll(protectedSpan)].map((match) => [
    match.index,
    match.index + match[0].length,
  ])
  let start = 0
  for (let index = 0; index < input.length; index += 1) {
    if (!/[。！？!?]/.test(input[index]!)) continue
    if (spans.some(([from, to]) => index >= from! && index < to!)) continue
    let end = index + 1
    while (end < input.length && /[。！？!?」』”’"']/.test(input[end]!)) end += 1
    // ASCII punctuation can be part of a token, path, or operator.
    if (/[!?]/.test(input[index]!) && end < input.length && !/\s/.test(input[end]!)) continue
    result.push(input.slice(start, end).trim())
    start = end
    index = end - 1
  }
  if (input.slice(start).trim()) result.push(input.slice(start).trim())
  return result.filter(Boolean)
}

/** Recognizes only explicit line-start bullets/numbers; never invents a list. */
export function readingBlocks(input: string): ReadingBlock[] {
  const blocks: ReadingBlock[] = []
  let list: Extract<ReadingBlock, { kind: 'list' }> | null = null
  for (const line of input.split(/\r?\n/)) {
    const text = line.trim()
    if (!text) {
      list = null
      continue
    }
    const marker = /^(?:([-*+•])\s+|(\d+)[.)、]\s+)(.+)$/.exec(text)
    if (marker) {
      const ordered = marker[2] !== undefined
      if (!list || list.ordered !== ordered) {
        list = { kind: 'list', ordered, items: [] }
        blocks.push(list)
      }
      list.items.push({ text: marker[3]!, ...(ordered ? { value: Number(marker[2]) } : {}) })
    } else {
      list = null
      for (const sentence of readingSentences(text))
        blocks.push({ kind: 'paragraph', text: sentence })
    }
  }
  return blocks
}
