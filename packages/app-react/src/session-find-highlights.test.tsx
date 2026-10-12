import { afterEach, expect, test, vi } from 'vitest'
import type { ConversationFindState } from '@hbar/app-runtime'
import { createSessionFindHighlights, currentSessionFindPaint, type FindPaintSnapshot } from './session-find-highlights'
import type { SessionFindSourceProjection } from './session-find-source'

class TestHighlight extends Set<Range> {}

const originalHighlight = globalThis.Highlight
const originalHighlights = Object.getOwnPropertyDescriptor(CSS, 'highlights')

afterEach(() => {
  if (originalHighlight)
    Object.defineProperty(globalThis, 'Highlight', { configurable: true, value: originalHighlight })
  else Reflect.deleteProperty(globalThis, 'Highlight')
  if (originalHighlights) Object.defineProperty(CSS, 'highlights', originalHighlights)
  else Reflect.deleteProperty(CSS, 'highlights')
})

function snapshot(
  status: ConversationFindState['status'],
  projection: SessionFindSourceProjection,
  query = 'History message 121',
): FindPaintSnapshot {
  return {
    state: {
      status,
      scopeId: 'session-a',
      query,
      matches: status === 'ready' ? [{ rowId: 'history-121', segmentId: 'text:0', start: 0, end: query.length }] : [],
      activeIndex: status === 'ready' ? 0 : -1,
      navigationRevision: 1,
      truncated: false,
      history: 'complete',
      error: null,
    },
    projection,
    scopeId: 'session-a',
    requestId: 'find-request-1',
  }
}

async function flushPaint() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
}

test('keeps a refreshed stream selection mapped to live text and removes it when that text changes', async () => {
  Object.defineProperty(globalThis, 'Highlight', { configurable: true, value: TestHighlight })
  const registry = new Map<string, TestHighlight>()
  Object.defineProperty(CSS, 'highlights', { configurable: true, value: registry })
  const text = 'History message 121'
  const segmentProjection = {
    text,
    domText: text,
    spans: [{ start: 0, end: text.length, domStart: 0, domEnd: text.length, kind: 'text' as const }],
  }
  const projection: SessionFindSourceProjection = {
    source: {
      scopeId: 'session-a',
      rows: [{ id: 'history-121', segments: [{ id: 'text:0', text }] }],
      history: 'complete',
    },
    rows: new Map([['history-121', new Map([['text:0', segmentProjection]])]]),
  }
  const root = document.createElement('div')
  root.innerHTML =
    '<div data-message-id="history-121"><div data-session-find-segment="text:0">History message 121</div></div>'
  document.body.append(root)
  let current = snapshot('ready', projection)
  let lastReady: FindPaintSnapshot | null = current
  const feedback = vi.fn()
  const painter = createSessionFindHighlights({
    root,
    read: () => currentSessionFindPaint(current, lastReady),
    onFeedback: feedback,
  })
  try {
    painter.update()
    await flushPaint()
    const highlight = registry.get('hbar-session-find-active')
    if (!highlight) throw new Error('Active Find highlight was not registered')
    expect([...highlight].map((range) => range.toString())).toEqual([text])

    current = snapshot('searching', projection)
    painter.update()
    await flushPaint()
    expect([...highlight].map((range) => range.toString())).toEqual([text])

    current = snapshot('searching', projection, 'different query')
    lastReady = null
    painter.update()
    await flushPaint()
    expect([...highlight]).toHaveLength(0)

    current = snapshot('ready', projection)
    lastReady = current
    painter.update()
    await flushPaint()
    expect([...highlight].map((range) => range.toString())).toEqual([text])

    current = snapshot('searching', projection)
    painter.update()
    await flushPaint()
    expect([...highlight].map((range) => range.toString())).toEqual([text])

    const segment = root.querySelector('[data-session-find-segment]')
    if (!segment?.firstChild) throw new Error('Find fixture text node is missing')
    segment.firstChild.textContent = 'History message changed'
    await flushPaint()
    expect([...highlight]).toHaveLength(0)
    expect(feedback).toHaveBeenLastCalledWith('highlight')
  } finally {
    painter.dispose()
    root.remove()
  }
})
