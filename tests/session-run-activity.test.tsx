import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { LumenRunActivityItem } from '@lumen/app-ui'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { HbarSessionRunActivity, currentSessionRun } from '../packages/app-react/src/session-run-activity'

const run = (id: string, status: LumenRunActivityItem['status'] = 'completed'): LumenRunActivityItem => ({
  id,
  status,
  label: `Time ${id}`,
  detail: `Model ${id}`,
  duration: '1 s',
})

test('current status and Stop target prefer execution to newer queued work', () => {
  const running = run('executing', 'running')
  const queued = run('newer-queued', 'queued')
  expect(currentSessionRun([queued, running])).toBe(running)
  expect(currentSessionRun([run('done'), queued])).toBe(queued)
  expect(currentSessionRun([])).toBeUndefined()
  expect(currentSessionRun([run('done')])?.id).toBe('done')
})

for (const count of [0, 1, 20, 21, 22, 80, 81]) {
  test(`run history has a bounded first page for ${count} supplied runs`, () => {
    const labels = getShellCopy('zh-CN').session.runs
    const html = renderToStaticMarkup(
      <HbarSessionRunActivity runs={Array.from({ length: count }, (_, index) => run(String(index)))} labels={labels} />,
    )
    if (!count) expect(html).toBe('')
    else {
      expect(html).toContain(labels.details(Math.min(count, 80)))
      expect(html).toContain('aria-expanded="false"')
      expect((html.match(/role="listitem"/g) ?? []).length).toBe(Math.min(count - 1, 20))
      expect(html.includes(labels.more(Math.min(20, count - 21)))).toBe(count > 21)
    }
  })
}

test('duplicates do not duplicate history or actions, and failure stays outside the disclosure', () => {
  const labels = getShellCopy('en-US').session.runs
  const failed = { ...run('failed', 'failed'), detail: 'The original request failed' }
  const html = renderToStaticMarkup(
    <HbarSessionRunActivity runs={[failed, failed, run('older')]} labels={labels} onRetryRun={() => {}} />,
  )
  expect(html).toContain(labels.details(2))
  expect((html.match(/Retry run/g) ?? []).length).toBe(1)
  expect(html.indexOf('The original request failed')).toBeLessThan(html.indexOf('hbar-session-run-history'))
  expect(html).toContain('role="alert"')
})

test('pending cancellation remains disabled and independent plan progress is not a proposed-plan action', () => {
  const labels = {
    ...getShellCopy('zh-CN').session.runs,
    cancellingLabel: '正在核对这个原始运行的取消结果，不能再次提交',
  }
  const html = renderToStaticMarkup(
    <HbarSessionRunActivity
      runs={[run('active', 'running')]}
      labels={labels}
      cancellingRunIds={['active']}
      onCancelRun={() => {}}
      plan={{ runId: 'active', steps: [{ id: 'step', title: '实际更新的工作步骤', status: 'in_progress' }] }}
    />,
  )
  expect(html).toContain(labels.cancellingLabel)
  expect(html).toContain('disabled=""')
  expect(html).toContain('实际更新的工作步骤')
  expect(html).toContain(labels.planProgress(0, 1))
  expect(html).not.toContain('proposedPlan')
})

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`retained read-only run history exposes only the exact unknown retry recovery: ${locale}`, () => {
    const labels = getShellCopy(locale).session.runs
    const html = renderToStaticMarkup(
      <HbarSessionRunActivity
        runs={[run('unknown-original', 'failed'), run('another-failure', 'failed')]}
        labels={labels}
        canRetryNewRun={false}
        unknownRetryRunIds={['unknown-original']}
        onRetryRun={() => {}}
      />,
    )
    expect(html).toContain(labels.recheckLabel)
    expect(html).not.toContain(labels.retryLabel)
    expect((html.match(/<button/g) ?? []).length).toBe(2) // One exact recovery and the history disclosure.
    expect(html).not.toContain('disabled=""')
    const busy = renderToStaticMarkup(
      <HbarSessionRunActivity
        runs={[run('unknown-original', 'failed'), run('another-failure', 'failed')]}
        labels={labels}
        canRetryNewRun={false}
        unknownRetryRunIds={['unknown-original']}
        retryingRunIds={['unknown-original']}
        onRetryRun={() => {}}
      />,
    )
    expect(busy).toContain(labels.recheckingLabel)
    expect(busy).toContain('disabled=""')
    expect(busy).not.toContain(labels.retryingLabel)
  })
}

test('normal sessions retain new Retry behavior and cannot gain read-only recovery from another Run id', () => {
  const labels = getShellCopy('en-US').session.runs
  const normal = renderToStaticMarkup(
    <HbarSessionRunActivity runs={[run('original', 'failed')]} labels={labels} onRetryRun={() => {}} />,
  )
  expect(normal).toContain(labels.retryLabel)
  const foreign = renderToStaticMarkup(
    <HbarSessionRunActivity
      runs={[run('original', 'failed')]}
      labels={labels}
      canRetryNewRun={false}
      unknownRetryRunIds={['other-run']}
      onRetryRun={() => {}}
    />,
  )
  expect(foreign).not.toContain(labels.recheckLabel)
  expect(foreign).not.toContain(labels.retryLabel)
})
