import type { Element } from 'hast'

export const CODE_BLOCK_PREVIEW_LINES = 20

/** Read the parsed code node, not a DOM preview, regex fence, or adjacent prose. */
export function messageCodeBlock(node: Element | undefined) {
  const code = node?.children[0]
  const offset = node?.position?.start.offset
  if (
    node?.tagName !== 'pre' ||
    node.children.length !== 1 ||
    code?.type !== 'element' ||
    code.tagName !== 'code' ||
    typeof offset !== 'number' ||
    !code.children.every((child) => child.type === 'text')
  )
    return null
  const domText = code.children.map((child) => (child.type === 'text' ? child.value : '')).join('')
  // mdast-util-to-hast appends one rendering newline to nonempty code. Remove
  // only that generated character; intentional blank lines and CRLF stay intact.
  const text = domText.endsWith('\n') ? domText.slice(0, -1) : domText
  const classes = code.properties.className
  const language = Array.isArray(classes)
    ? classes.find((value): value is string => typeof value === 'string' && value.startsWith('language-'))?.slice(9)
    : undefined
  let lines = text ? 1 : 0
  let previewEnd = domText.length
  for (const ending of text.matchAll(/\r\n|\r|\n/g)) {
    if (lines === CODE_BLOCK_PREVIEW_LINES) previewEnd = ending.index + ending[0].length
    lines += 1
  }
  return { occurrenceId: String(offset), text, domText, language: language ?? null, lines, previewEnd }
}
