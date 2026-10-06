import type { Element, Root } from 'hast'
import { imageLinkSource, remoteImageSource } from './message-image-preview-model'

/** Assign stable source-order occurrences before sanitizing; code samples never become media requests. */
export function messageImageLinks() {
  return (tree: Root) => {
    let ordinal = 0
    const hasImage = (node: Element): boolean =>
      node.children.some((child) => child.type === 'element' && (child.tagName === 'img' || hasImage(child)))
    const walk = (node: Element) => {
      if (node.tagName === 'pre' || node.tagName === 'code') return
      const source =
        node.tagName === 'img'
          ? remoteImageSource(typeof node.properties.src === 'string' ? node.properties.src : undefined)
          : node.tagName === 'a' && !hasImage(node)
            ? imageLinkSource(typeof node.properties.href === 'string' ? node.properties.href : undefined)
            : null
      if (source) node.properties.dataHbarImageOrdinal = ordinal++
      for (const child of node.children) if (child.type === 'element') walk(child)
    }
    for (const child of tree.children) if (child.type === 'element') walk(child)
  }
}
