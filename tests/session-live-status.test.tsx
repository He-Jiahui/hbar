import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { RunStatus } from '@hbar/contracts'
import type { ComposerIntentState } from '@hbar/app-runtime'
import { goalPlanSnapshotSchema } from '@hbar/contracts/commands/goals'
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
      expect(html.includes('hbar-session-execution-spinner')).toBe(status === 'running')
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
  expect(html).not.toContain('hbar-session-execution-spinner')
  expect(html).toContain('data-run-status="unconfirmed"')
})

function sessionFacts(count: number, objective: string | null = null): ComposerIntentState['facts'] {
  return {
    sessionId: props.sessionId,
    status: 'ready',
    error: null,
    snapshot: goalPlanSnapshotSchema.parse({
      sessionId: props.sessionId,
      goalSeq: 1,
      planSeq: 1,
      remainingTokens: null,
      goal: objective
        ? {
            threadId: props.sessionId,
            goalId: 'original-goal',
            objective,
            status: 'paused',
            tokenBudget: null,
            tokensUsed: 0,
            timeUsedSeconds: 0,
            createdAt: 1,
            updatedAt: 2,
          }
        : null,
      plan: {
        sessionId: props.sessionId,
        revision: 1,
        turnId: null,
        updatedAt: 2,
        explanation: count ? '这些步骤来自 Host 的真实计划。' : null,
        plan: Array.from({ length: count }, (_, index) => ({
          step: `原始步骤 ${index}`,
          status: index === 0 ? 'completed' : index === 1 ? 'in_progress' : 'pending',
        })),
      },
    }),
  }
}

for (const locale of ['zh-CN', 'en-US'] as const) {
  for (const count of [1, 3, 100]) {
    test(`owned idle Plan appears collapsed with Activity completion states: ${locale} ${count}`, () => {
      const labels = getShellCopy(locale).session.liveStatus
      const html = render({
        run: undefined,
        labels,
        context: { facts: sessionFacts(count), summary: null, onRefresh: () => {} },
      })
      expect(html).toContain(labels.expand)
      expect(html).toContain('aria-expanded="false"')
      expect(html).toContain('hidden=""')
      expect(html).toContain(labels.tasks.title)
      expect(html).toContain(labels.tasks.progress(1, count))
      expect(html.match(/data-activity-task-status=/g)).toHaveLength(count)
      expect(html).toContain(labels.tasks.step('原始步骤 0', 'completed'))
      if (count > 1) expect(html).toContain(labels.tasks.step('原始步骤 1', 'in_progress'))
      if (count > 2) expect(html).toContain(labels.tasks.step('原始步骤 2', 'pending'))
      expect(html).not.toContain(labels.statusLabel('running'))
    })
  }
  test(`Goal and full text remain reachable without a live Run or a replacement field: ${locale}`, () => {
    const labels = getShellCopy(locale).session.liveStatus
    const objective = '新目标包含完整的中文文本与 emoji 🧭\n'.repeat(90)
    const html = render({
      run: undefined,
      labels,
      context: { facts: sessionFacts(0, objective), summary: <span>{objective}</span>, onRefresh: () => {} },
    })
    expect(html).toContain(labels.goal)
    expect(html).toContain(objective)
    expect(html).toContain('aria-controls=')
    expect(html).not.toContain(labels.tasks.title)
  })
}

test('foreign snapshot, plan and goal identities never populate the current Session disclosure', () => {
  const facts = sessionFacts(3, '属于原会话的目标')
  const snapshot = facts.snapshot
  if (!snapshot?.plan || !snapshot.goal) throw new Error('Missing test fixture')
  const variants: ComposerIntentState['facts'][] = [
    { ...facts, sessionId: 'previous-session' },
    { ...facts, snapshot: { ...snapshot, sessionId: 'previous-session' } },
    {
      ...facts,
      snapshot: {
        ...snapshot,
        goal: { ...snapshot.goal, threadId: 'previous-session' },
        plan: { ...snapshot.plan, sessionId: 'previous-session' },
      },
    },
  ]
  for (const variant of variants) {
    const html = render({ run: undefined, context: { facts: variant, summary: null, onRefresh: () => {} } })
    expect(html).not.toContain('属于原会话的目标')
    expect(html).not.toContain('原始步骤')
    expect(html).not.toContain('aria-expanded=')
    expect(html).not.toContain('data-session-live-status=')
  }
  expect(render({ owned: false, context: { facts, summary: null, onRefresh: () => {} } })).toBe('')
})

test('Goal command feedback remains mounted and visible after its last context is cleared', () => {
  const html = render({
    run: undefined,
    context: {
      facts: { sessionId: props.sessionId, status: 'ready', error: null, snapshot: null },
      summary: <span role="alert">原目标的提交结果尚待核对</span>,
      onRefresh: () => {},
    },
  })
  expect(html).toContain('原目标的提交结果尚待核对')
  expect(html).not.toContain('data-session-live-status=')
  expect(html).not.toContain('aria-expanded=')
})

test('unconfirmed Plan progress offers local read recovery and retains its original statuses', () => {
  const labels = props.labels
  const html = render({
    connected: false,
    run: undefined,
    context: { facts: { ...sessionFacts(3), status: 'error', error: 'TIMEOUT' }, summary: null, onRefresh: () => {} },
  })
  expect(html).toContain(labels.offline)
  const recoveryStart = html.indexOf('hbar-session-activity-recovery')
  expect(recoveryStart).toBeGreaterThanOrEqual(0)
  const recovery = html.slice(recoveryStart, html.indexOf('</div>', recoveryStart) + '</div>'.length)
  expect(recovery).toContain(labels.tasks.error('TIMEOUT'))
  expect(recovery).toContain(labels.tasks.retry)
  expect(recovery).toContain('disabled=""')
  expect(html).toContain('data-activity-task-status="in_progress"')
})

test('Host rejects 101 Plan steps instead of silently truncating the visible progress', () => {
  expect(() => sessionFacts(101)).toThrow()
})
