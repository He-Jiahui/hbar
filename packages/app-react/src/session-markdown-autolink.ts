import type { Element, ElementContent, Root } from 'hast'
import { messageLiteralSegments } from './message-literal-text-model'

function autoLinkParts(node: Element, source: string): ElementContent[] | null {
  if (node.tagName !== 'a' || node.children.some((child) => child.type !== 'text')) return null
  const start = node.position?.start.offset
  const end = node.position?.end.offset
  if (start === undefined || end === undefined || !/^https?:\/\//i.test(source.slice(start, end))) return null
  const visible = node.children.map((child) => (child.type === 'text' ? child.value : '')).join('')
  // A Markdown link's position includes its destination, while its visible
  // label can be arbitrary text. Only rewrite links whose visible text is
  // itself an autolink literal; otherwise an explicit destination such as
  // `[docs](https://example.test)` would be mistaken for prose and lose its
  // href. Typed labels beginning with a URL are still excluded by the source
  // position check above because their node starts at `[`.
  if (!/^https?:\/\//i.test(visible)) return null
  const parts = messageLiteralSegments(visible)
  return parts.map((part): ElementContent =>
    part.kind === 'url'
      ? {
          type: 'element',
          tagName: 'a',
          properties: { href: part.value },
          children: [{ type: 'text', value: part.value }],
        }
      : { type: 'text', value: part.value },
  )
}

function walk(parent: Element, source: string): void {
  const next: ElementContent[] = []
  for (const child of parent.children) {
    const parts = child.type === 'element' ? autoLinkParts(child, source) : null
    if (parts) {
      for (const part of parts) next.push(part)
    } else {
      if (child.type === 'element' && child.tagName !== 'a' && child.tagName !== 'pre' && child.tagName !== 'code')
        walk(child, source)
      next.push(child)
    }
  }
  parent.children = next
}

/** Correct remark-gfm's broad autolink literal boundary for Chinese prose. */
export function sessionCjkAutolink() {
  return (tree: Root, file: { toString(): string }) => {
    const source = String(file)
    for (const child of tree.children) if (child.type === 'element') walk(child, source)
  }
}
