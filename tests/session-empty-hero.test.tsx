import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarSessionEmptyHero, showSessionEmptyHero, type SessionEmptyHeroFacts } from '@hbar/app-react'
import { getShellCopy } from '../apps/web/src/shell-copy'

const ready: SessionEmptyHeroFacts = {
  connected: true,
  sessionId: 'session-a',
  loadedSessionId: 'session-a',
  timelineStatus: 'ready',
  timelineError: null,
  olderStatus: 'idle',
  hasOlder: false,
  messageCount: 0,
  runCount: 0,
  streamCount: 0,
  approvalCount: 0,
  userInputCount: 0,
  draftStatus: 'idle',
  lastOperationId: null,
  submissionPending: false,
}

test('welcome appears only for the loaded and genuinely unused session', () => {
  expect(showSessionEmptyHero(ready)).toBe(true)
  const exclusions: ReadonlyArray<readonly [string, Partial<SessionEmptyHeroFacts>]> = [
    ['disconnected', { connected: false }],
    ['no selected session', { sessionId: null }],
    ['stale loaded session', { loadedSessionId: 'session-b' }],
    ['loading old history', { timelineStatus: 'loading' }],
    ['failed history', { timelineStatus: 'error', timelineError: 'DISCONNECTED' }],
    ['older history loading', { olderStatus: 'loading' }],
    ['older history available', { hasOlder: true }],
    ['first message', { messageCount: 1 }],
    ['accepted run before a message', { runCount: 1 }],
    ['live stream before a message', { streamCount: 1 }],
    ['pending approval', { approvalCount: 1 }],
    ['pending user question', { userInputCount: 1 }],
    ['submitting draft', { draftStatus: 'submitting' }],
    ['unknown draft', { draftStatus: 'unknown' }],
    ['failed submission', { draftStatus: 'failed' }],
    ['accepted submission before timeline catches up', { lastOperationId: 'run-1' }],
    ['locked composer', { submissionPending: true }],
  ]
  for (const [, change] of exclusions) {
    expect(showSessionEmptyHero({ ...ready, ...change })).toBe(false)
  }
  expect(showSessionEmptyHero({ ...ready, draftStatus: null })).toBe(true)
})

test('welcome renders a host-owned accessible title and long translated copy without treating content as markup', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const base = getShellCopy(locale).session.emptyHero
    const labels = {
      ...base,
      title: `${base.title} — 项目名称很长时仍应保持在同一个标题中`,
      description: `${base.description} ${'长期协作与上下文 '.repeat(18)} <script>unsafe()</script>`,
    }
    const html = renderToStaticMarkup(<HbarSessionEmptyHero labels={labels} />)
    expect(html).toContain('<h2')
    expect(html).toContain(labels.title)
    expect(html).toContain(base.markUrl)
    expect(html).toContain('background-image:')
    expect(html).toContain('&lt;script&gt;unsafe()&lt;/script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('aria-hidden="true"')
  }
})
