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
export function cleanText(input: string | null | undefined): string {
  if (!input) return ''
  return decodeEntities(
    input
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|pre|h[1-6])\s*>/gi, '\n')
      .replace(TAG, ''),
  )
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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
