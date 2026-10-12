const MAX_REMEMBERED_ROWS = 128
const MAX_SIGNATURE_NODES = 20_000
const MAX_SIGNATURE_CODE_UNITS = 1_000_000

interface ScrollPosition {
  readonly signature: string
  readonly occurrence: number
  readonly left: number
}

interface RowScrollSnapshot {
  readonly positions: readonly ScrollPosition[]
}

function contentSignature(element: Element): string | undefined {
  const nodes: Node[] = [element]
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    nodes.push(node)
    if (nodes.length > MAX_SIGNATURE_NODES) return undefined
    node = walker.nextNode()
  }

  let hash = 2166136261
  let signatureLength = 0
  let exceedsLimit = false
  const add = (value: string) => {
    signatureLength += value.length
    if (signatureLength > MAX_SIGNATURE_CODE_UNITS) {
      exceedsLimit = true
      return
    }
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }
    hash ^= 0xff
    hash = Math.imul(hash, 16777619)
  }

  for (const current of nodes) {
    if (current.nodeType === Node.TEXT_NODE) {
      add(`#${current.textContent ?? ''}`)
    } else if (current instanceof Element) {
      add(current.tagName)
      add(current.getAttribute('data-lumen-part') ?? '')
      add(current.getAttribute('data-message-id') ?? '')
      add(current.getAttribute('aria-label') ?? '')
    }
    if (exceedsLimit) return undefined
  }
  return `${nodes.length}:${(hash >>> 0).toString(16)}`
}

function horizontalScrollables(row: HTMLElement): HTMLElement[] {
  return Array.from(row.querySelectorAll<HTMLElement>('*')).filter(
    (element) => element.scrollWidth > element.clientWidth,
  )
}

function snapshotKey(scrollKey: string, messageId: string): string {
  return JSON.stringify([scrollKey, messageId])
}

function positionKey(signature: string, occurrence: number): string {
  return JSON.stringify([signature, occurrence])
}

/** Bounded, component-scoped memory for nested horizontal scroll in virtual rows. */
export class ConversationHorizontalScrollMemory {
  private readonly snapshots = new Map<string, RowScrollSnapshot>()
  private readonly mountedRows = new Map<string, HTMLElement>()

  mount(scrollKey: string, messageId: string, row: HTMLElement): void {
    const key = snapshotKey(scrollKey, messageId)
    this.mountedRows.delete(key)
    this.mountedRows.set(key, row)
    if (this.mountedRows.size > MAX_REMEMBERED_ROWS) {
      const oldest = this.mountedRows.keys().next().value
      if (oldest !== undefined) this.mountedRows.delete(oldest)
    }
    this.restore(scrollKey, messageId, row)
  }

  unmount(scrollKey: string, messageId: string, row: HTMLElement): void {
    const key = snapshotKey(scrollKey, messageId)
    if (this.mountedRows.get(key) !== row) return
    // A browser may dispatch the nested scroller's queued scroll event after
    // the virtualizer detaches its row. Read the actual DOM position at cleanup.
    this.save(key, row)
    this.mountedRows.delete(key)
  }

  capture(scrollKey: string, messageId: string, row: HTMLElement, target: EventTarget | null): void {
    if (!(target instanceof HTMLElement) || target.scrollWidth <= target.clientWidth) return
    if (!row.contains(target)) return

    const key = snapshotKey(scrollKey, messageId)
    if (this.mountedRows.get(key) !== row) return
    if (!horizontalScrollables(row).includes(target)) return
    this.save(key, row)
  }

  private save(key: string, row: HTMLElement): void {
    const positions: ScrollPosition[] = []
    const occurrences = new Map<string, number>()
    for (const element of horizontalScrollables(row)) {
      const signature = contentSignature(element)
      if (signature === undefined) {
        this.snapshots.delete(key)
        return
      }
      const occurrence = occurrences.get(signature) ?? 0
      occurrences.set(signature, occurrence + 1)
      positions.push({ signature, occurrence, left: element.scrollLeft })
    }

    if (positions.length === 0) {
      this.snapshots.delete(key)
      return
    }
    this.snapshots.delete(key)
    this.snapshots.set(key, { positions })
    if (this.snapshots.size > MAX_REMEMBERED_ROWS) {
      const oldest = this.snapshots.keys().next().value
      if (oldest !== undefined) this.snapshots.delete(oldest)
    }
  }

  restore(scrollKey: string, messageId: string, row: HTMLElement): void {
    const key = snapshotKey(scrollKey, messageId)
    const snapshot = this.snapshots.get(key)
    if (!snapshot) return

    const positions = new Map(
      snapshot.positions.map((position) => [positionKey(position.signature, position.occurrence), position]),
    )
    const occurrences = new Map<string, number>()
    const retained: ScrollPosition[] = []
    for (const element of horizontalScrollables(row)) {
      const signature = contentSignature(element)
      if (signature === undefined) continue
      const occurrence = occurrences.get(signature) ?? 0
      occurrences.set(signature, occurrence + 1)
      const position = positions.get(positionKey(signature, occurrence))
      if (!position) continue
      retained.push(position)
      element.scrollLeft = position.left
    }

    this.snapshots.delete(key)
    if (retained.length === 0) return
    this.snapshots.set(key, { positions: retained })
  }

  dispose(): void {
    this.snapshots.clear()
    this.mountedRows.clear()
  }
}
