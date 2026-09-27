interface SessionCodeBlockRegistration {
  readonly root: HTMLElement
  readonly chrome: readonly HTMLElement[]
  /** Synchronous, local expansion only. The caller owns request validation and scrolling. */
  readonly revealHiddenTail: (ranges: readonly Range[]) => boolean
}

const blocks = new WeakMap<HTMLElement, SessionCodeBlockRegistration>()
const chromeOwners = new WeakMap<Element, SessionCodeBlockRegistration>()

/** Renderer-owned DOM identity, not an attribute untrusted Markdown can reproduce. */
export function registerSessionCodeBlock(registration: SessionCodeBlockRegistration): () => void {
  const entry: SessionCodeBlockRegistration = { ...registration, chrome: [...registration.chrome] }
  blocks.set(entry.root, entry)
  for (const element of entry.chrome) {
    if (element !== entry.root && entry.root.contains(element)) chromeOwners.set(element, entry)
  }
  return () => {
    if (blocks.get(entry.root) === entry) blocks.delete(entry.root)
    for (const element of entry.chrome) {
      if (chromeOwners.get(element) === entry) chromeOwners.delete(element)
    }
  }
}

export function isSessionCodeChrome(element: Element): boolean {
  const owner = chromeOwners.get(element)
  return !!owner && blocks.get(owner.root) === owner && owner.root.contains(element)
}

/** Only explicit Find navigation calls this; ordinary highlight painting never expands code. */
export function revealSessionCodeBlocks(ranges: readonly Range[]): boolean {
  const entries = new Set<SessionCodeBlockRegistration>()
  const collect = (element: Element | null) => {
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      if (!(ancestor instanceof HTMLElement)) continue
      const entry = blocks.get(ancestor)
      if (entry) entries.add(entry)
    }
  }
  for (const range of ranges) {
    collect(range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)
    collect(range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement)
    // A multi-block match can contain an entire code block between its endpoints.
    // Walk only that intersected subtree, never a global list of registered views.
    const common = range.commonAncestorContainer
    if (!(common instanceof Element)) continue
    const walker = common.ownerDocument.createTreeWalker(common, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        if (!(node instanceof Element) || isSessionCodeChrome(node) || !range.intersectsNode(node))
          return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      },
    })
    for (let next = walker.nextNode(); next; next = walker.nextNode()) {
      if (!(next instanceof HTMLElement)) continue
      const entry = blocks.get(next)
      if (entry) entries.add(entry)
    }
  }
  let changed = false
  for (const entry of entries) {
    if (entry.root.isConnected && blocks.get(entry.root) === entry) changed = entry.revealHiddenTail(ranges) || changed
  }
  return changed
}
