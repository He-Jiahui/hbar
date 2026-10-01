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
  edit: (position) => `编辑第 ${position} 条`,
  editInput: (position) => `第 ${position} 条内容`,
  editHint: 'Enter 保存 · Shift+Enter 换行 · Esc 取消',
  editLoading: '正在读取全文',
  editSaving: '正在保存',
  saveEdit: '保存',
  cancelEdit: '取消',
  editUnknown: '编辑结果未知',
  editFailed: (code) => `编辑失败：${code}`,
  retryEdit: '重试编辑',
  guide: (position) => `引导第 ${position} 条`,
  guideLabel: '引导',
  guideSubmitting: '正在引导',
  guideUnknown: '请核对原请求',
  guideFailed: (code) => `引导失败：${code}`,
  retryGuide: '核对结果',
  dismissGuide: '关闭提示',
  remove: (position) => `删除第 ${position} 条`,
  removing: '正在移除',
  removeUnknown: '结果未知',
  removeFailed: (code) => `移除失败：${code}`,
  retryRemoval: '重试移除',
  dismissRemoval: '关闭',
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
  removal: null,
  editing: null,
}
function render(state: QueuedUserRunsState, sessionId = 'one', connected = true) {
  return renderToStaticMarkup(
    <HbarQueuedUserRuns
      state={state}
      sessionId={sessionId}
      connected={connected}
      activeRunId={null}
      labels={labels}
      onRefresh={() => undefined}
      onPrevious={() => undefined}
      onNext={() => undefined}
      onStartEdit={() => undefined}
      onEditText={() => undefined}
      onSaveEdit={() => undefined}
      onRetryEdit={() => undefined}
      onGuide={() => undefined}
      onRetryGuide={() => undefined}
      onDismissGuide={() => undefined}
      onCancelEdit={() => undefined}
      onRemove={() => undefined}
      onRetryRemoval={() => undefined}
      onDismissRemoval={() => undefined}
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
  expect(html).toContain('删除第 1 条')
  expect(html).toContain('编辑第 1 条')
  expect(html).toContain('data-lumen-indicator="none"')
  expect(html).not.toContain('引导')
  expect(render(state, 'other')).toBe('')
  expect(render(base)).toBe('')
})

test('editing stays in the queued card and disables blank save while preserving feedback', () => {
  const state: QueuedUserRunsState = {
    ...base,
    totalQueued: 1,
    items: [
      { operationId: 'first', revision: 1, createdAt: 1, textPreview: '预览', truncated: false, attachmentCount: 0 },
    ],
    editing: { operationId: 'first', status: 'ready', text: '全文\n第二段', revision: 1, error: null },
  }
  const html = render(state)
  expect(html).toContain('<textarea')
  expect(html).toContain('全文\n第二段</textarea>')
  expect(html).toContain('rows="2"')
  expect(html).toContain(labels.editHint)
  expect(html).toContain('保存')
  expect(html).toContain('取消')
  expect(html).not.toContain('编辑第 1 条')
  expect(html).not.toContain('删除第 1 条')
  expect(render({ ...state, editing: { ...state.editing!, text: '  ' } })).toContain('disabled')
  const unknown = render({ ...state, editing: { ...state.editing!, status: 'unknown', error: 'RESULT_UNKNOWN' } })
  expect(unknown).toContain('编辑结果未知')
  expect(unknown).toContain('重试编辑')
  const missing = render({ ...base, editing: { ...state.editing!, status: 'failed', error: 'COMMAND_CONFLICT' } })
  expect(missing).toContain('编辑失败：COMMAND_CONFLICT')
  expect(missing).toContain('取消')
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

test('unknown and failed removals show local recovery even after the queue becomes empty', () => {
  const unknown = render({
    ...base,
    removal: { operationId: 'first', status: 'unknown', error: 'RESULT_UNKNOWN' },
  })
  expect(unknown).toContain('结果未知')
  expect(unknown).toContain('重试移除')
  expect(unknown).toContain('关闭')
  const failed = render({
    ...base,
    totalQueued: 1,
    items: [
      { operationId: 'first', revision: 1, createdAt: 1, textPreview: '内容', truncated: false, attachmentCount: 0 },
    ],
    removal: { operationId: 'first', status: 'failed', error: 'COMMAND_CONFLICT' },
  })
  expect(failed).toContain('移除失败：COMMAND_CONFLICT')
  expect(failed).toContain('disabled')
  expect(failed).not.toContain('重试移除')
})
