import { readingBlocks } from '../lib/text'

/** Code remains text; feed content never enters an HTML parser. */
function InlineText({ text }: { text: string }) {
  return text
    .split(/(`[^`]+`)/g)
    .map((part, index) =>
      part.startsWith('`') && part.endsWith('`') ? (
        <code key={index}>{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    )
}

export function Prose({ text, lang }: { text: string; lang: 'zh' | 'en' }) {
  return (
    <div className={`reading-prose prose-${lang}`} lang={lang === 'zh' ? 'zh-Hant' : 'en'}>
      {readingBlocks(text).map((block, index) => {
        if (block.kind === 'paragraph')
          return (
            <p key={index}>
              <InlineText text={block.text} />
            </p>
          )
        const List = block.ordered ? 'ol' : 'ul'
        return (
          <List key={index}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex} value={item.value}>
                <InlineText text={item.text} />
              </li>
            ))}
          </List>
        )
      })}
    </div>
  )
}
