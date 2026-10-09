import type { Element, ElementContent, Root } from 'hast'
import { parseResourceReference, type ResourceReference } from '@hbar/contracts/resources'
import { splitResourceReferences } from './message-resource-model'
const properties = (reference: ResourceReference, kind: string): Element['properties'] => ({
  ...(reference.kind === 'file'
    ? {
        dataHbarFilePath: reference.path,
        dataHbarFileLine: reference.line,
        dataHbarFileColumn: reference.column,
        dataHbarFileKind: kind,
      }
    : {}),
  dataHbarResource: JSON.stringify(reference),
  dataHbarResourceKind: kind,
})
function link(reference: ResourceReference, kind: string, children: ElementContent[]): Element {
  return { type: 'element', tagName: 'a', properties: properties(reference, kind), children }
}
export function messageResourceLinks() {
  return (tree: Root): void => {
    let count = 0
    const visit = (parent: Root | Element) => {
      const children: typeof parent.children = []
      for (const child of parent.children) {
        if (child.type === 'text') {
          for (const part of splitResourceReferences(child.value))
            children.push(
              part.kind === 'resource' && count++ < 200
                ? link(part.reference, 'prose', [{ type: 'text', value: part.value }])
                : { type: 'text', value: part.value },
            )
        } else if (child.type === 'element') {
          if (child.tagName === 'a') {
            const reference =
              typeof child.properties.href === 'string' ? parseResourceReference(child.properties.href, true) : null
            if (reference && count++ < 200)
              child.properties = { ...child.properties, ...properties(reference, 'authored') }
          } else if (child.tagName === 'code') {
            const text =
              child.children.length === 1 && child.children[0]?.type === 'text' ? child.children[0].value : ''
            const reference = parseResourceReference(text, true)
            if (reference && count++ < 200) {
              children.push(link(reference, 'inline', [child]))
              continue
            }
          } else if (child.tagName !== 'pre') visit(child)
          children.push(child)
        } else if (child.type !== 'doctype') children.push(child)
      }
      parent.children = children
    }
    visit(tree)
  }
}
