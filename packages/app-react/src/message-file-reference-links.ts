import type { Element, ElementContent, Root, RootContent } from 'hast'
import {
  parseMessageFileReference,
  splitMessageFileReferences,
  type MessageFileReference,
} from './message-file-reference-model'

type MessageFileReferenceKind = 'prose' | 'inline' | 'authored'

function fileProperties(reference: MessageFileReference, kind: MessageFileReferenceKind): Element['properties'] {
  return {
    dataHbarFilePath: reference.path,
    ...(reference.line === undefined ? {} : { dataHbarFileLine: reference.line }),
    ...(reference.column === undefined ? {} : { dataHbarFileColumn: reference.column }),
    dataHbarFileKind: kind,
    role: 'link',
    tabIndex: 0,
  }
}

function fileLink(
  reference: MessageFileReference,
  kind: MessageFileReferenceKind,
  children: ElementContent[],
): Element {
  return {
    type: 'element',
    tagName: 'a',
    properties: fileProperties(reference, kind),
    children,
  }
}

function textParts(value: string): ElementContent[] {
  return splitMessageFileReferences(value).map((segment): ElementContent =>
    segment.kind === 'text'
      ? { type: 'text', value: segment.value }
      : fileLink(segment.reference, 'prose', [{ type: 'text', value: segment.value }]),
  )
}

function inlineCodeLink(node: Element): Element | null {
  if (node.tagName !== 'code' || node.children.length !== 1) return null
  const child = node.children[0]
  if (!child || child.type !== 'text') return null
  const reference = parseMessageFileReference(child.value)
  return reference ? fileLink(reference, 'inline', [node]) : null
}

function hrefString(node: Element): string | null {
  const href = node.properties.href
  return typeof href === 'string' ? href : null
}

function transformElementChildren(parent: Element): void {
  const next: ElementContent[] = []
  for (const child of parent.children) {
    if (child.type === 'text') {
      next.push(...textParts(child.value))
      continue
    }
    if (child.type !== 'element') {
      next.push(child)
      continue
    }

    // Authored links are an explicit target. Replace only the href-bearing
    // anchor itself; never recurse into anchors and create nested links.
    if (child.tagName === 'a') {
      const reference = parseMessageFileReference(hrefString(child) ?? '')
      if (reference) child.properties = fileProperties(reference, 'authored')
      next.push(child)
      continue
    }
    // Code blocks are owned by the code renderer. Inline code is linkable only
    // when the entire span is one file reference, never when it is a command.
    if (child.tagName === 'pre') {
      next.push(child)
      continue
    }
    const codeLink = inlineCodeLink(child)
    if (codeLink) {
      next.push(codeLink)
      continue
    }
    if (child.tagName === 'code') {
      next.push(child)
      continue
    }
    transformElementChildren(child)
    next.push(child)
  }
  parent.children = next
}

function transformRootChildren(parent: Root): void {
  const next: RootContent[] = []
  for (const child of parent.children) {
    if (child.type === 'text') {
      next.push(...textParts(child.value))
      continue
    }
    if (child.type === 'element') {
      if (child.tagName === 'a') {
        const reference = parseMessageFileReference(hrefString(child) ?? '')
        if (reference) child.properties = fileProperties(reference, 'authored')
      } else if (child.tagName !== 'pre') {
        const codeLink = inlineCodeLink(child)
        if (codeLink) {
          next.push(codeLink)
          continue
        }
        if (child.tagName !== 'code') transformElementChildren(child)
      }
    }
    next.push(child)
  }
  parent.children = next
}

/**
 * Link complete workspace-relative file references in sanitized Markdown HAST.
 * Run this before `rehype-sanitize`; the host can then allow-list only the
 * `dataHbarFile*`, `role`, and `tabIndex` properties it owns.
 */
export function messageFileReferenceLinks() {
  return (tree: Root): void => transformRootChildren(tree)
}
