import type { ConversationFindState } from '@hbar/app-runtime'
import { sessionFindDomRanges, type SessionFindTextProjection } from './session-find-text'
import type { SessionFindSourceProjection } from './session-find-source'
import { isSessionCodeChrome, revealSessionCodeBlocks } from './session-code-block-dom'

interface FindPaintSnapshot {
  readonly state: ConversationFindState
  readonly projection: SessionFindSourceProjection
  readonly scopeId: string
  readonly requestId: string | null
}

/** Index offsets are mapped into verified rendered text; DOM never becomes the search index. */
function sessionFindRangeMapper(
  root: HTMLElement,
  projection: SessionFindTextProjection,
): ((start: number, end: number) => readonly Range[] | null) | null {
  const nodes: { node: Text; start: number; end: number; group: number }[] = []
  const included: string[] = []
  let group = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node instanceof Element && isSessionCodeChrome(node)) {
        // A DOM Range crossing excluded UI would still select that UI text.
        // Retain the barrier even when the chrome currently has no text.
        group++
        return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })
  let offset = 0
  for (let next = walker.nextNode(); next; next = walker.nextNode()) {
    if (!(next instanceof Text) || next.length === 0) continue
    included.push(next.data)
    nodes.push({ node: next, start: offset, end: offset + next.length, group })
    offset += next.length
  }
  if (included.join('') !== projection.domText) return null
  const nodeAt = (offset: number, ending: boolean) => {
    let low = 0
    let high = nodes.length
    while (low < high) {
      const middle = (low + high) >>> 1
      const node = nodes[middle]!
      if (ending ? node.end < offset : node.end <= offset) low = middle + 1
      else high = middle
    }
    return low
  }
  return (start, end) => {
    const ranges: Range[] = []
    for (const span of sessionFindDomRanges(projection, start, end)) {
      const first = nodeAt(span.start, false)
      const last = nodeAt(span.end, true)
      if (!nodes[first] || !nodes[last]) return null
      for (let index = first; index <= last;) {
        const from = nodes[index]!
        let endIndex = index
        while (endIndex < last && nodes[endIndex + 1]!.group === from.group) endIndex++
        const to = nodes[endIndex]!
        const range = document.createRange()
        range.setStart(from.node, Math.max(span.start, from.start) - from.start)
        range.setEnd(to.node, Math.min(span.end, to.end) - to.start)
        ranges.push(range)
        index = endIndex + 1
      }
    }
    return ranges
  }
}

export function sessionFindRanges(
  root: HTMLElement,
  projection: SessionFindTextProjection,
  start: number,
  end: number,
): readonly Range[] | null {
  return sessionFindRangeMapper(root, projection)?.(start, end) ?? null
}

function revealRange(range: Range, viewport: HTMLElement) {
  let ancestor = range.startContainer.parentElement
  // A proposed-plan/code body may have its own scroll. Reveal only ancestors
  // inside this conversation, never a sibling tool, document or browser page.
  while (ancestor && ancestor !== viewport && viewport.contains(ancestor)) {
    const style = getComputedStyle(ancestor)
    revealHorizontalRange(range, ancestor, style.overflowX)
    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && ancestor.scrollHeight > ancestor.clientHeight) {
      const bounds = ancestor.getBoundingClientRect()
      const target = range.getBoundingClientRect()
      const top = bounds.top + ancestor.clientTop
      if (target.top < top || target.bottom > top + ancestor.clientHeight)
        ancestor.scrollTop += target.top - top - ancestor.clientHeight / 4
    }
    ancestor = ancestor.parentElement
  }
  revealHorizontalRange(range, viewport, getComputedStyle(viewport).overflowX)
  const bounds = viewport.getBoundingClientRect()
  const target = range.getBoundingClientRect()
  viewport.scrollTop += target.top - bounds.top - viewport.clientHeight / 4
}

function revealHorizontalRange(range: Range, element: HTMLElement, overflow: string) {
  if ((overflow !== 'auto' && overflow !== 'scroll') || element.scrollWidth <= element.clientWidth) return
  const left = element.getBoundingClientRect().left + element.clientLeft
  const target = range.getBoundingClientRect()
  if (target.left < left || target.right > left + element.clientWidth)
    element.scrollLeft += target.left - left - Math.max(0, (element.clientWidth - target.width) / 2)
}

/** One mounted conversation owns these paint objects, observers and animation frame. */
export function createSessionFindHighlights(options: {
  readonly root: HTMLElement
  readonly read: () => FindPaintSnapshot | null
  readonly onFeedback: (value: 'highlight' | null) => void
}) {
  let disposed = false
  let frame: number | null = null
  let reveal: { requestId: string; viewport: HTMLDivElement; row: HTMLElement } | null = null
  const supported = typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined'
  const all = supported ? new Highlight() : null
  const active = supported ? new Highlight() : null
  const clear = () => {
    all?.clear()
    active?.clear()
    if (supported) {
      if (CSS.highlights.get('hbar-session-find-results') === all) CSS.highlights.delete('hbar-session-find-results')
      if (CSS.highlights.get('hbar-session-find-active') === active) CSS.highlights.delete('hbar-session-find-active')
    }
  }
  const paint = () => {
    frame = null
    if (disposed) return
    const current = options.read()
    if (!current || current.state.status !== 'ready' || current.state.scopeId !== current.scopeId) {
      clear()
      return
    }
    clear()
    if (!supported || !all || !active) {
      options.onFeedback(current.state.matches.length ? 'highlight' : null)
      return
    }
    const collect = () => {
      const rows = new Map(
        [...options.root.querySelectorAll<HTMLElement>('[data-message-id]')].map((row) => [row.dataset.messageId, row]),
      )
      let mismatch = false
      let chosen: {
        readonly ranges: readonly Range[]
        readonly row: HTMLElement
        readonly segment: HTMLElement
        readonly projection: SessionFindTextProjection
      } | null = null
      // At capacity a single segment can own 1,000 matches. Validate its text
      // and walk its DOM once per paint, not once per occurrence.
      const mappers = new Map<HTMLElement, ReturnType<typeof sessionFindRangeMapper>>()
      const segmentsByRow = new Map<HTMLElement, ReadonlyMap<string | undefined, HTMLElement>>()
      for (const [index, match] of current.state.matches.entries()) {
        const row = rows.get(match.rowId)
        if (!row) continue // Virtual rows remain indexed without paint objects.
        if (!segmentsByRow.has(row))
          segmentsByRow.set(
            row,
            new Map(
              [...row.querySelectorAll<HTMLElement>('[data-session-find-segment]')].map((element) => [
                element.dataset.sessionFindSegment,
                element,
              ]),
            ),
          )
        const segment = segmentsByRow.get(row)?.get(match.segmentId)
        const projection = current.projection.rows.get(match.rowId)?.get(match.segmentId)
        if (segment && projection && !mappers.has(segment))
          mappers.set(segment, sessionFindRangeMapper(segment, projection))
        const ranges = segment ? mappers.get(segment)?.(match.start, match.end) : null
        if (!ranges?.length) {
          if (index === current.state.activeIndex) mismatch = true
          continue
        }
        for (const range of ranges) {
          all.add(range)
          if (index === current.state.activeIndex) active.add(range)
        }
        if (index === current.state.activeIndex && segment && projection) chosen = { ranges, row, segment, projection }
      }
      return { mismatch, chosen }
    }
    let mapped = collect()
    const target = reveal
    const stillCurrent = () => {
      const latest = options.read()
      return (
        !disposed &&
        latest?.scopeId === current.scopeId &&
        latest.requestId === current.requestId &&
        latest.state === current.state &&
        latest.projection === current.projection
      )
    }
    const ownsReveal = () =>
      !!target &&
      reveal === target &&
      target.requestId === current.requestId &&
      !!mapped.chosen &&
      mapped.chosen.row === target.row &&
      target.row.isConnected &&
      options.root.contains(target.viewport) &&
      target.viewport.contains(target.row) &&
      target.row.contains(mapped.chosen.segment) &&
      mapped.chosen.ranges.every(
        (range) =>
          mapped.chosen?.segment.contains(range.startContainer) && mapped.chosen.segment.contains(range.endContainer),
      )
    if (ownsReveal() && mapped.chosen && stillCurrent()) {
      const original = mapped.chosen
      const changed = revealSessionCodeBlocks(original.ranges)
      // A synchronous React expansion may trigger lifecycle cleanup or a new
      // source A→B→A. A matching string request ID alone is not a lifetime fence.
      if (!stillCurrent() || !ownsReveal()) {
        if (reveal === target) reveal = null
        clear()
        return
      }
      if (changed) {
        all.clear()
        active.clear()
        mapped = collect()
        if (
          mapped.chosen?.row !== original.row ||
          mapped.chosen.segment !== original.segment ||
          mapped.chosen.projection !== original.projection ||
          !stillCurrent() ||
          !ownsReveal()
        ) {
          if (reveal === target) reveal = null
          clear()
          return
        }
      }
    }
    CSS.highlights.set('hbar-session-find-results', all)
    CSS.highlights.set('hbar-session-find-active', active)
    options.onFeedback(mapped.mismatch ? 'highlight' : null)
    if (target && ownsReveal() && stillCurrent() && mapped.chosen?.ranges[0]) {
      reveal = null
      revealRange(mapped.chosen.ranges[0], target.viewport)
    }
  }
  const schedule = () => {
    if (!disposed && frame === null) frame = requestAnimationFrame(paint)
  }
  const observer = new MutationObserver(schedule)
  observer.observe(options.root, { subtree: true, childList: true, characterData: true })
  return {
    update: schedule,
    reveal(requestId: string, viewport: HTMLDivElement, row: HTMLElement) {
      if (disposed || options.read()?.requestId !== requestId) return
      reveal = { requestId, viewport, row }
      schedule()
    },
    cancelReveal() {
      reveal = null
    },
    dispose() {
      disposed = true
      reveal = null
      observer.disconnect()
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      clear()
    },
  }
}
