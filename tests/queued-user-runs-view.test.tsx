import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { QueuedUserRunsState } from '@hbar/app-runtime'
import { HbarQueuedUserRuns, type HbarQueuedUserRunsLabels } from '../packages/app-react/src/queued-user-runs'

const labels: HbarQueuedUserRunsLabels = {
  queued: '已排队',
  loading: '正在读取',
  disconnected: '离线',
  error: (code) => `错误：${code}`,
  retry: '重试',
  previous: '上一页',
  next: '下一页',
  page: (current, total) => `${current}/${total}`,
  attachments: (count) => `${count} 个附件`,
  ellipsis: '…',
}
const base: QueuedUserRunsState = {
  sessionId: 'one',
  status: 'ready',
  items: [],
  totalQueued: 0,
  pageIndex: 0,
  cursor: null,
  nextCursor: null,
  previousCursors: [],
  error: null,
}
function render(state: QueuedUserRunsState, sessionId = 'one', connected = true) {
  return renderToStaticMarkup(
    <HbarQueuedUserRuns
      state={state}
      sessionId={sessionId}
      connected={connected}
      labels={labels}
      onRefresh={() => undefined}
      onPrevious={() => undefined}
      onNext={() => undefined}
    />,
  )
}

test('only Host-confirmed items for the selected session appear in the composer', () => {
  const state: QueuedUserRunsState = {
    ...base,
    totalQueued: 1,
    items: [
      {
        operationId: 'first',
        revision: 1,
        createdAt: 1,
        textPreview: '这是很长的待发内容',
        truncated: true,
        attachmentCount: 2,
      },
    ],
  }
  const html = render(state)
  expect(html).toContain('已排队')
  expect(html).toContain('这是很长的待发内容…')
  expect(html).toContain('2 个附件')
  expect(html).not.toContain('删除')
  expect(html).not.toContain('引导')
  expect(render(state, 'other')).toBe('')
  expect(render(base)).toBe('')
})

test('page controls, error recovery and offline states remain explicit', () => {
  const state: QueuedUserRunsState = {
    ...base,
    totalQueued: 21,
    items: [{ operationId: 'first', revision: 1, createdAt: 1, textPreview: '', truncated: false, attachmentCount: 1 }],
    nextCursor: { afterOperationId: 'first', sessionSeq: 2, totalQueued: 21 },
  }
  const html = render(state)
  expect(html).toContain('1/3')
  expect(html).toContain('下一页')
  expect(html).toContain('1 个附件')
  expect(render({ ...state, status: 'error', error: 'DISCONNECTED' })).toContain('错误：DISCONNECTED')
  expect(render({ ...state, status: 'loading' })).toContain('正在读取')
  expect(render(state, 'one', false)).toContain('离线')
  expect(render(state, 'one', false)).not.toContain('下一页')
})
