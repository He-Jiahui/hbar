import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { RunStatus } from '@hbar/contracts'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { HbarSessionLiveStatus, type HbarSessionLiveStatusProps } from '../packages/app-react/src/session-live-status'

const props: HbarSessionLiveStatusProps = {
  sessionId: 'current-session',
  timelineSessionId: 'current-session',
  owned: true,
  connected: true,
  run: { id: 'original-run', status: 'running' },
  labels: getShellCopy('zh-CN').session.liveStatus,
}
const render = (update: Partial<HbarSessionLiveStatusProps> = {}) =>
  renderToStaticMarkup(<HbarSessionLiveStatus {...props} {...update} />)

for (const locale of ['zh-CN', 'en-US'] as const) {
  for (const status of ['queued', 'running', 'waiting_approval'] as const) {
    test(`bottom status uses Host copy and original identity for ${locale} ${status}`, () => {
      const labels = getShellCopy(locale).session.liveStatus
      const html = render({ labels, run: { id: 'original-run', status } })
      expect(html).toContain(labels.label)
      expect(html).toContain(labels.statusLabel(status))
      expect(html).toContain('data-session-live-status="original-run"')
      expect(html).toContain('data-session-id="current-session"')
      expect(html).toContain('role="status"')
      expect(html).toContain('aria-live="polite"')
      expect(html).toContain(
        'data-tone="' + (status === 'running' ? 'info' : status === 'queued' ? 'neutral' : 'warning'),
      )
    })
  }
}

for (const status of ['completed', 'cancelled', 'failed', 'interrupted', 'guided'] satisfies RunStatus[]) {
  test(`settled ${status} hides the active status instead of claiming execution`, () => {
    expect(render({ run: { id: 'settled-run', status } })).toBe('')
  })
}

test('empty, stale and non-owning projections never show a run from another session', () => {
  expect(render({ run: undefined })).toBe('')
  expect(render({ timelineSessionId: 'previous-session' })).toBe('')
  expect(render({ timelineSessionId: null })).toBe('')
  expect(render({ owned: false })).toBe('')
})

test('offline status stays honest and uses long localized Host copy without a clipped title-only fallback', () => {
  const labels = {
    ...props.labels,
    label: '当前会话的真实执行状态与连接状态',
    offline: '连接中断，仍在保留原运行；恢复连接并读取服务端状态之后才能确认是否已经结束',
  }
  const html = render({ connected: false, labels })
  expect(html).toContain(labels.label)
  expect(html).toContain(labels.offline)
  expect(html).not.toContain(labels.statusLabel('running'))
  expect(html).toContain('data-run-status="unconfirmed"')
})
