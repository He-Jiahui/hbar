import type { ConversationFindState } from '@hbar/app-runtime'
import { createSessionFindHighlights, sessionFindRanges } from '../../packages/app-react/src/session-find-highlights'
import { projectSessionFindText } from '../../packages/app-react/src/session-find-text'
import {
  isSessionCodeChrome,
  registerSessionCodeBlock,
  revealSessionCodeBlocks,
} from '../../packages/app-react/src/session-code-block-dom'
import type { SessionFindSourceProjection } from '../../packages/app-react/src/session-find-source'

// A controlled DOM adapter fixture, not a Host, message renderer or reference UI.
function baseline() {
  const root = document.createElement('section')
  const chrome = document.createElement('button')
  chrome.textContent = 'Copy code'
  const body = document.createElement('pre')
  body.textContent = 'alpha beta\n'
  root.append(chrome, body)
  document.body.replaceChildren(root)
  const cleanup = registerSessionCodeBlock({ root, chrome: [chrome], revealHiddenTail: () => false })
  const projection = projectSessionFindText('```text\nalpha beta\n```')
  if (!projection) throw new Error('Fixture projection missing')
  const ranges = sessionFindRanges(root, projection, 0, 5)?.map((range) => range.toString()) ?? null
  cleanup()
  return { ranges }
}

function mapping() {
  const root = document.createElement('div')
  const code = document.createElement('code')
  const chrome = document.createElement('button')
  chrome.textContent = 'Copy / 复制'
  chrome.dataset.sessionCodeChrome = 'true'
  chrome.setAttribute('aria-hidden', 'true')
  code.append('alpha', chrome, ' beta\n')
  root.append(code)
  document.body.replaceChildren(root)
  const projection = projectSessionFindText('```text\nalpha beta\n```')
  if (!projection) throw new Error('Fixture projection missing')
  const read = () =>
    sessionFindRanges(root, projection, 0, projection.text.length)?.map((range) => range.toString()) ?? null
  const fakeMarker = read()
  const firstCleanup = registerSessionCodeBlock({ root, chrome: [chrome], revealHiddenTail: () => false })
  const registered = read()
  chrome.textContent = 'Copied / 已复制 — deliberately long operation text'
  const copyChanged = read()
  const secondCleanup = registerSessionCodeBlock({ root, chrome: [chrome], revealHiddenTail: () => false })
  firstCleanup()
  const replacedOwner = { mapped: read(), registered: isSessionCodeChrome(chrome) }
  code.append('unindexed text')
  const mismatch = read()
  code.lastChild?.remove()
  secondCleanup()
  const afterCleanup = { mapped: read(), registered: isSessionCodeChrome(chrome) }
  chrome.textContent = ''
  chrome.remove()
  const hidden = document.createElement('span')
  hidden.setAttribute('aria-hidden', 'true')
  hidden.textContent = 'alpha'
  code.firstChild?.replaceWith(hidden)
  const ariaHiddenBody = read()
  return { fakeMarker, registered, copyChanged, replacedOwner, mismatch, afterCleanup, ariaHiddenBody }
}

function registry() {
  const root = document.createElement('div')
  const before = document.createTextNode('before')
  const block = document.createElement('section')
  const code = document.createElement('code')
  code.textContent = 'body'
  block.append(code)
  const after = document.createTextNode('after')
  root.append(before, block, after)
  document.body.replaceChildren(root)
  let oldCalls = 0
  let calls = 0
  const oldCleanup = registerSessionCodeBlock({
    root: block,
    chrome: [],
    revealHiddenTail: () => {
      oldCalls++
      return true
    },
  })
  const cleanup = registerSessionCodeBlock({
    root: block,
    chrome: [],
    revealHiddenTail: () => {
      calls++
      return true
    },
  })
  oldCleanup()
  const range = document.createRange()
  range.setStart(before, 0)
  range.setEnd(after, after.length)
  const changed = revealSessionCodeBlocks([range, range.cloneRange()])
  cleanup()
  const afterCleanup = revealSessionCodeBlocks([range])
  return { oldCalls, calls, changed, afterCleanup }
}

export type CodeFindScenario =
  | 'normal'
  | 'cross-tail'
  | 'proposal'
  | 'stream'
  | 'cancel'
  | 'aba'
  | 'projection'
  | 'request'
  | 'row'
  | 'segment'
  | 'mismatch'
  | 'dispose'
  | 'null'
let previousCleanup: (() => void) | undefined
const frames = async () => {
  for (let index = 0; index < 3; index++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

async function painter(scenario: CodeFindScenario, locale: 'en' | 'zh', keepRevealed = false) {
  previousCleanup?.()
  const rowId = scenario === 'stream' ? 'stream-a' : 'message-a'
  const segmentId = scenario === 'stream' ? 'text:1' : scenario === 'proposal' ? 'proposal' : 'text:0'
  const root = document.createElement('main')
  const heading = document.createElement('h1')
  heading.textContent =
    locale === 'zh' ? '受控 DOM 查找适配器（非产品界面）' : 'Controlled DOM Find adapter (not product UI)'
  const viewport = document.createElement('div')
  viewport.dataset.fixtureViewport = ''
  viewport.style.cssText = 'block-size:24rem;overflow:auto;max-inline-size:100%;border:.0625rem solid;'
  const spacer = document.createElement('div')
  spacer.style.blockSize = '30rem'
  const row = document.createElement('article')
  row.dataset.messageId = rowId
  const segment = document.createElement('div')
  segment.dataset.sessionFindSegment = segmentId
  const block = document.createElement('section')
  const chrome = document.createElement('button')
  chrome.textContent = locale === 'zh' ? '复制代码 / 已复制 / 展开' : 'Copy code / Copied / Expand'
  const pre = document.createElement('pre')
  pre.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;margin:0;font:1rem/1.5 monospace'
  const code = document.createElement('code')
  const lines = Array.from({ length: 60 }, (_, index) => `line-${String(index + 1).padStart(3, '0')}`)
  const prefix = document.createTextNode(`${lines.slice(0, 20).join('\n')}\n`)
  const tail = document.createElement('span')
  tail.hidden = true
  tail.textContent = `${lines.slice(20).join('\n')}\n`
  code.append(prefix, tail)
  pre.append(code)
  block.append(chrome, pre)
  segment.append(block)
  row.append(segment)
  viewport.append(spacer, row)
  root.append(heading, viewport)
  document.body.replaceChildren(root)
  const text = projectSessionFindText(`\`\`\`text\n${lines.join('\n')}\n\`\`\``)
  if (!text) throw new Error('Fixture projection missing')
  const query = scenario === 'cross-tail' ? 'line-020\nline-021' : 'line-045'
  const start = text.text.indexOf(query)
  if (start < 0) throw new Error('Fixture query missing')
  const state: ConversationFindState = {
    status: 'ready',
    scopeId: 'A',
    query,
    matches: [{ rowId, segmentId, start, end: start + query.length }],
    activeIndex: 0,
    navigationRevision: 1,
    truncated: false,
    history: 'complete',
    error: null,
  }
  const projection: SessionFindSourceProjection = {
    source: {
      scopeId: 'A',
      rows: [{ id: rowId, segments: [{ id: segmentId, text: text.text }] }],
      history: 'complete',
    },
    rows: new Map([[rowId, new Map([[segmentId, text]])]]),
  }
  let current: Parameters<typeof createSessionFindHighlights>[0]['read'] extends () => infer Snapshot
    ? Snapshot
    : never = {
    state,
    projection,
    scopeId: 'A',
    requestId: 'A:1',
  }
  const feedback: Array<'highlight' | null> = []
  const highlights = createSessionFindHighlights({
    root,
    read: () => current,
    onFeedback: (value) => feedback.push(value),
  })
  let calls = 0
  const cleanup = registerSessionCodeBlock({
    root: block,
    chrome: [chrome],
    revealHiddenTail: (ranges) => {
      calls++
      if (!tail.hidden || !ranges.some((range) => range.intersectsNode(tail))) return false
      tail.hidden = false
      if (scenario === 'cancel') highlights.cancelReveal()
      if (scenario === 'aba') current = { state: { ...state }, projection, scopeId: 'A', requestId: 'A:1' }
      if (scenario === 'projection') current = { state, projection: { ...projection }, scopeId: 'A', requestId: 'A:1' }
      if (scenario === 'request') current = { state, projection, scopeId: 'A', requestId: 'A:2' }
      if (scenario === 'row') row.replaceWith(row.cloneNode(true))
      if (scenario === 'segment') segment.replaceWith(segment.cloneNode(true))
      if (scenario === 'mismatch') tail.append('unindexed mutation')
      if (scenario === 'dispose') highlights.dispose()
      if (scenario === 'null') current = null
      return true
    },
  })
  previousCleanup = () => {
    highlights.dispose()
    cleanup()
  }
  highlights.update()
  await frames()
  const initial = { hidden: tail.hidden, calls, scroll: viewport.scrollTop }
  highlights.reveal('A:1', viewport, row)
  await frames()
  const revealed = { hidden: tail.hidden, calls, scroll: viewport.scrollTop }
  const active = CSS.highlights.get('hbar-session-find-active')
  const activeText = active ? [...active].map((range) => (range instanceof Range ? range.toString() : '')) : []
  const targetRange = active ? [...active].find((range) => range instanceof Range) : undefined
  const targetBounds = targetRange instanceof Range ? targetRange.getBoundingClientRect() : null
  const viewportBounds = viewport.getBoundingClientRect()
  const targetInViewport =
    !!targetBounds &&
    targetBounds.height > 0 &&
    targetBounds.width > 0 &&
    targetBounds.top >= viewportBounds.top &&
    targetBounds.bottom <= viewportBounds.bottom &&
    targetBounds.left >= viewportBounds.left &&
    targetBounds.right <= viewportBounds.right
  // Ordinary stream/chrome repaint never owns a new explicit scroll or expansion.
  if (!keepRevealed) {
    viewport.scrollTop = 0
    tail.hidden = true
    chrome.textContent = locale === 'zh' ? '已复制' : 'Copied'
    highlights.update()
    await frames()
  }
  const repainted = { hidden: tail.hidden, calls, scroll: viewport.scrollTop }
  return { initial, revealed, repainted, activeText, targetInViewport, feedback }
}

declare global {
  interface Window {
    codeBlockFind: {
      baseline: typeof baseline
      mapping: typeof mapping
      registry: typeof registry
      painter: typeof painter
    }
  }
}
window.codeBlockFind = { baseline, mapping, registry, painter }
