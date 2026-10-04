import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  HbarMessageActionBar,
  invokeMessageForkAction,
  type HbarMessageForkAction,
  type HbarMessageForkTarget,
} from '../packages/app-react/src/session-message'

const labels = {
  copy: '复制回复',
  copying: '正在复制',
  copied: '已复制',
  copyFailed: '复制失败',
  copyUnavailable: '无法使用剪贴板',
  retryCopy: '重试复制',
}
const target = { sessionId: 'source-session', messageId: 'source-message' }
const noop = () => {}
const fork = (overrides: Partial<HbarMessageForkAction> = {}): HbarMessageForkAction => ({
  label: '从当前已完成消息创建一条新的独立会话分支，并保留来源会话',
  status: 'ready',
  onFork: noop,
  ...overrides,
})
const render = (action?: HbarMessageForkAction, content = 'Visible reply') =>
  renderToStaticMarkup(
    <HbarMessageActionBar
      {...target}
      content={content ? [{ type: 'text', text: content }] : []}
      labels={labels}
      metadata="09:41"
      {...(action ? { fork: action } : {})}
    />,
  )

test('optional Fork shares the flowing copy-and-metadata row; default and blank content remain honest', () => {
  const defaultHtml = render()
  expect(defaultHtml).toContain(labels.copy)
  expect(defaultHtml).not.toContain('data-message-action="fork"')
  const html = render(fork())
  expect(html).toContain('data-message-action="fork"')
  expect(html).toContain('lucide-git-fork')
  expect(html).toContain('aria-label="从当前已完成消息创建一条新的独立会话分支，并保留来源会话"')
  expect(html.indexOf(labels.copy)).toBeLessThan(html.indexOf('data-message-action="fork"'))
  expect(html.indexOf('data-message-action="fork"')).toBeLessThan(html.indexOf('09:41'))
  expect(render(fork(), '')).toContain('data-message-action="fork"')
  expect(render(undefined, '')).toContain('09:41')
  expect(
    renderToStaticMarkup(
      <HbarMessageActionBar
        {...target}
        content={[{ type: 'text', text: 'Question' }]}
        labels={labels}
        copyLabel="复制消息"
      />,
    ),
  ).toContain('aria-label="复制消息"')
  expect(renderToStaticMarkup(<HbarMessageActionBar {...target} content={[]} labels={labels} />)).toBe('')
})

test('busy and unknown states cannot submit a duplicate write, and preserve local accessible status', () => {
  const busy = render(fork({ label: '正在创建分支', status: 'submitting' }))
  expect(busy).toContain('disabled=""')
  expect(busy).toContain('aria-busy="true"')
  expect(busy).toContain('role="status"')
  expect(busy).toContain('正在创建分支')
  const unknown = render(fork({ label: '核对原分支请求', status: 'unknown', error: '连接中断；核对后再操作' }))
  expect(unknown).toContain('disabled=""')
  expect(unknown).toContain('role="alert"')
  expect(unknown).toContain('连接中断；核对后再操作')
  const recheck = render(fork({ label: '核对原分支请求', status: 'unknown', onReconcile: noop }))
  expect(recheck).not.toContain('disabled=""')
  expect(recheck).toContain('lucide-rotate-ccw')
  const failed = render(fork({ label: '重试创建分支', status: 'failed', error: '无法确认原消息仍可用' }))
  expect(failed).toContain('重试创建分支')
  expect(failed).not.toContain('disabled=""')
  expect(failed).toContain('role="alert"')
})

test('original session/message IDs bind every intent; unknown can only reconcile while failed may retry', () => {
  const writes: HbarMessageForkTarget[] = []
  const checks: HbarMessageForkTarget[] = []
  const callbacks = {
    onFork: (value: HbarMessageForkTarget) => {
      writes.push(value)
    },
    onReconcile: (value: HbarMessageForkTarget) => {
      checks.push(value)
    },
  }
  const second = { sessionId: 'other-session', messageId: 'same-visible-message-id' }
  expect(invokeMessageForkAction(fork({ ...callbacks }), target)).toBe(true)
  expect(invokeMessageForkAction(fork({ ...callbacks, status: 'submitting' }), second)).toBe(false)
  expect(invokeMessageForkAction(fork({ ...callbacks, status: 'unknown' }), target)).toBe(true)
  expect(invokeMessageForkAction(fork({ onFork: callbacks.onFork, status: 'unknown' }), second)).toBe(false)
  expect(invokeMessageForkAction(fork({ ...callbacks, status: 'failed' }), second)).toBe(true)
  expect(writes).toEqual([target, second])
  expect(checks).toEqual([target])
})
