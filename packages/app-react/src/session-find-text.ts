import type { Element, Root, RootContent } from 'hast'
import type { PluggableList } from 'unified'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'

/** Shared by the real Markdown renderer and the non-DOM, loaded-history index. */
export const sessionMarkdownRemarkPlugins: PluggableList = [remarkGfm]
export const sessionMarkdownRehypePlugins: PluggableList = [rehypeSanitize]
export const sessionMarkdownRehypeOptions = { allowDangerousHtml: true }

export interface SessionFindTextSpan {
  readonly start: number
  readonly end: number
  readonly domStart: number
  readonly domEnd: number
  /** A separator has no text node; collapsed whitespace maps to its original DOM whitespace. */
  readonly kind: 'text' | 'collapsed' | 'separator'
}

export interface SessionFindTextProjection {
  /** Readable UTF-16 text: inline whitespace collapses; preformatted code does not. */
  readonly text: string
  /** Exact concatenation of the renderer's text nodes. Validate before mapping mounted DOM. */
  readonly domText: string
  /** Disjoint, increasing readable-text intervals; this ordering supports binary range lookup. */
  readonly spans: readonly SessionFindTextSpan[]
}

export interface SessionFindDomRange {
  readonly start: number
  readonly end: number
}

const processor = unified()
  .use(remarkParse)
  .use(sessionMarkdownRemarkPlugins)
  .use(remarkRehype, sessionMarkdownRehypeOptions)
  .use(sessionMarkdownRehypePlugins)

// react-markdown's hast-util-to-jsx-runtime removes whitespace-only children of
// these table elements before rendering. Keeping them would shift every cell.
const tableParents = new Set(['table', 'tbody', 'thead', 'tfoot', 'tr'])
const blocks = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'blockquote',
  'pre',
  'td',
  'th',
  'dt',
  'dd',
  'div',
  'section',
  'article',
  'hr',
])
const structuralParents = new Set(['root', 'ul', 'ol', 'blockquote', 'section', ...tableParents])
const htmlWhitespace = /^[\t\n\f\r ]*$/

/** Literal prompts preserve authored whitespace and syntax in both DOM and search. */
export function projectSessionFindLiteralText(text: string): SessionFindTextProjection {
  return {
    text,
    domText: text,
    spans: text.length ? [{ start: 0, end: text.length, domStart: 0, domEnd: text.length, kind: 'text' }] : [],
  }
}

function generatedFootnoteNavigation(node: Element): boolean {
  return (
    node.properties.dataFootnoteBackref !== undefined ||
    node.properties.dataFootnoteRef !== undefined ||
    (node.tagName === 'h2' && node.properties.id === 'user-content-footnote-label')
  )
}

/**
 * Parse content, never a mounted/hidden rendering. Source Markdown offsets are
 * deliberately not reused: entities, links, GFM and code all transform them.
 */
export function projectSessionFindText(markdown: string): SessionFindTextProjection {
  const tree: Root = processor.runSync(processor.parse(markdown))
  const text: string[] = []
  const domText: string[] = []
  const spans: SessionFindTextSpan[] = []
  let length = 0
  let domLength = 0
  let pending: { kind: 'collapsed' | 'separator'; start: number; end: number } | null = null

  const append = (value: string, domStart: number, domEnd: number, kind: SessionFindTextSpan['kind']) => {
    if (!value) return
    text.push(value)
    const previous = spans.at(-1)
    if (kind === 'text' && previous?.kind === 'text' && previous.domEnd === domStart) {
      spans[spans.length - 1] = { ...previous, end: length + value.length, domEnd }
    } else spans.push({ start: length, end: length + value.length, domStart, domEnd, kind })
    length += value.length
  }
  const flush = () => {
    if (pending && length > 0)
      append(pending.kind === 'separator' ? '\n' : ' ', pending.start, pending.end, pending.kind)
    pending = null
  }
  const boundary = () => {
    pending = { kind: 'separator', start: domLength, end: domLength }
  }
  const visit = (node: RootContent, parent: string, pre: boolean, excluded: boolean): void => {
    if (node.type === 'text') {
      if (tableParents.has(parent) && htmlWhitespace.test(node.value)) return
      const start = domLength
      domText.push(node.value)
      domLength += node.value.length
      if (excluded || (structuralParents.has(parent) && htmlWhitespace.test(node.value))) return
      if (pre) {
        flush()
        append(node.value, start, domLength, 'text')
        return
      }
      for (const match of node.value.matchAll(/[\t\n\f\r ]+|[^\t\n\f\r ]+/g)) {
        const from = start + match.index
        const end = from + match[0].length
        if (htmlWhitespace.test(match[0])) {
          if (pending?.kind === 'separator') continue
          // Do not accidentally include an excluded footnote reference between
          // two visible whitespace nodes in one highlighted DOM range.
          pending = {
            kind: 'collapsed',
            start: pending?.start ?? from,
            end: pending && pending.end !== from ? pending.end : end,
          }
        } else {
          flush()
          append(match[0], from, end, 'text')
        }
      }
      return
    }
    if (node.type !== 'element') return
    const ignored = excluded || generatedFootnoteNavigation(node)
    const block = !ignored && blocks.has(node.tagName)
    if (block || (!ignored && (node.tagName === 'br' || node.tagName === 'img'))) boundary()
    for (const child of node.children) visit(child, node.tagName, pre || node.tagName === 'pre', ignored)
    if (block) boundary()
  }
  for (const node of tree.children) visit(node, 'root', false, false)
  return { text: text.join(''), domText: domText.join(''), spans }
}

/** Pure UTF-16 mapping. The caller must validate the complete mounted domText first. */
export function sessionFindDomRanges(
  projection: SessionFindTextProjection,
  start: number,
  end: number,
): readonly SessionFindDomRange[] {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > projection.text.length)
    return []
  const result: SessionFindDomRange[] = []
  // Spans are emitted in disjoint readable-text order. A late result must not
  // rescan an entire long body's prefix for every one of the bounded matches.
  let low = 0
  let high = projection.spans.length
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2)
    const span = projection.spans[middle]
    if (span && span.end <= start) low = middle + 1
    else high = middle
  }
  for (let index = low; index < projection.spans.length; index++) {
    const span = projection.spans[index]
    if (!span) break
    if (span.start >= end) break
    if (span.end <= start || span.kind === 'separator') continue
    const from = span.kind === 'text' ? span.domStart + Math.max(start - span.start, 0) : span.domStart
    const to = span.kind === 'text' ? span.domEnd - Math.max(span.end - end, 0) : span.domEnd
    if (to <= from) continue
    const previous = result.at(-1)
    if (previous?.end === from) result[result.length - 1] = { start: previous.start, end: to }
    else result.push({ start: from, end: to })
  }
  return result
}
