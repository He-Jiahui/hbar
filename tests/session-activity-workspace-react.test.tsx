import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarSessionActivityView } from '@hbar/app-react'
import type { ActivityWorkspaceEntryState } from '@hbar/app-runtime'
import { getShellCopy } from '../apps/web/src/shell-copy'

const createdAt = Date.UTC(2026, 8, 28, 12, 30)
const labels = getShellCopy('zh-CN').activity
const ready = (
  items: ActivityWorkspaceEntryState['items'],
  totalActive = items.length,
): ActivityWorkspaceEntryState => ({
  instanceId: 'activity-panel',
  sessionId: 'source-session',
  status: 'ready',
  items,
  totalActive,
  nextCursor: items.length < totalActive ? { afterOperationId: items.at(-1)!.operationId, sessionSeq: 4 } : null,
  sessionSeq: 4,
  limitReached: false,
  error: null,
})
const item = (index: number, status: ActivityWorkspaceEntryState['items'][number]['status'] = 'running') => ({
  operationId: `operation-${index}`,
  status,
  createdAt: createdAt + index * 1000,
  startedAt: status === 'queued' ? null : createdAt + index * 1000 + 100,
})
const render = (entry: ActivityWorkspaceEntryState | undefined, connected = true) =>
  renderToStaticMarkup(
    <HbarSessionActivityView
      entry={entry}
      connected={connected}
      labels={labels}
      onRefresh={() => undefined}
      onLoadMore={() => undefined}
    />,
  )

test('Activity distinguishes loading, confirmed empty, error/retry and stale offline data', () => {
  expect(render(undefined)).toContain(labels.loading)
  const empty = render(ready([]))
  expect(empty).toContain(labels.empty)
  expect(empty).not.toContain(labels.loading)
  const failed = render({ ...ready([]), status: 'error', error: 'TIMEOUT' })
  expect(failed).toContain(labels.error('TIMEOUT'))
  expect(failed).toContain(labels.retry)
  expect(render(ready([item(1)]), false)).toContain(labels.offline)
})

test('Activity renders Host statuses and time for one operation in non-default locale', () => {
  const rows = [item(1, 'queued'), item(2, 'waiting_approval'), item(3, 'cancelRequested')]
  const html = render(ready(rows))
  for (const row of rows) {
    expect(html).toContain(`data-operation-id="${row.operationId}"`)
    expect(html).toContain(labels.status(row.status))
  }
  expect(html).toContain(labels.queuedAt(rows[0]!.createdAt))
  expect(html).toContain(labels.startedAt(rows[1]!.startedAt!))
  expect(html).toContain(labels.count(3, 3))
  expect(html).not.toContain(labels.loadMore)
})

test('Activity keeps a paged 100-row boundary and exposes load-more/limit states', () => {
  const hundred = Array.from({ length: 100 }, (_, index) => item(index))
  const first = render(ready(hundred, 101))
  expect(first.match(/data-operation-id=/g)).toHaveLength(100)
  expect(first).toContain(labels.count(100, 101))
  expect(first).toContain(labels.loadMore)
  const next = render(ready([...hundred, item(100)]))
  expect(next.match(/data-operation-id=/g)).toHaveLength(101)
  expect(next).not.toContain(labels.loadMore)
  const limited = render({ ...ready(hundred, 120), limitReached: true })
  expect(limited).toContain(labels.limitReached)
  expect(limited).not.toContain(labels.loadMore)
})

test('Activity accepts a deliberately long localized title without splitting the row semantics', () => {
  const longTitle = '运行状态与来源说明'.repeat(24)
  const html = renderToStaticMarkup(
    <HbarSessionActivityView
      entry={ready([item(1)])}
      connected
      labels={{ ...labels, runAt: () => longTitle }}
      onRefresh={() => undefined}
      onLoadMore={() => undefined}
    />,
  )
  expect(html).toContain(longTitle)
  expect(html.match(/<strong/g)).toHaveLength(1)
  expect(html.match(/<li /g)).toHaveLength(1)
})
