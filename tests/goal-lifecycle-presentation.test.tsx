import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { GoalHistoryFact, GoalHistorySnapshot } from '@hbar/contracts/commands/goal-history'
import { HbarGoalLifecycleCard, projectGoalLifecycleRows } from '@hbar/app-react'
import { projectSessionTimelineSequence } from '../packages/app-react/src/session-message-model'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { sessionMessage } from './session-message.fixtures'
import { excerptGoalObjective, goalObjectiveDiff } from '../packages/app-react/src/goal-objective-diff'

function goal(overrides: Partial<GoalHistorySnapshot> = {}): GoalHistorySnapshot {
  return {
    goalId: 'goal-a',
    objective: 'Original objective',
    status: 'active',
    tokenBudget: 2000,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}
function fact(
  seq: number,
  value: GoalHistorySnapshot | null,
  overrides: Partial<GoalHistoryFact> = {},
): GoalHistoryFact {
  return value === null
    ? {
        eventId: `e-${seq}`,
        sessionId: 'session',
        runId: null,
        time: seq,
        seq,
        ...overrides,
        type: 'goal.cleared',
        goal: null,
      }
    : {
        eventId: `e-${seq}`,
        sessionId: 'session',
        runId: null,
        time: seq,
        seq,
        ...overrides,
        type: 'goal.updated',
        goal: value,
      }
}
function project(
  facts: readonly GoalHistoryFact[],
  preceding: { seq: number; goal: GoalHistorySnapshot | null } = { seq: 0, goal: null },
) {
  return projectGoalLifecycleRows({ sessionId: 'session', facts, preceding })
}

test('historical Goal lifecycle derives only from canonical event-time snapshots', () => {
  const facts = [
    fact(1, goal()),
    fact(2, goal({ tokensUsed: 120, timeUsedSeconds: 3, continuationCount: 1 })),
    fact(3, goal({ status: 'paused', tokensUsed: 120 })),
    fact(4, goal({ status: 'active', tokensUsed: 140 })),
    fact(5, goal({ objective: 'Edited objective', tokensUsed: 150 })),
    fact(6, goal({ goalId: 'goal-b', objective: 'Replacement' })),
    fact(7, goal({ goalId: 'goal-b', objective: 'Replacement', status: 'complete', tokensUsed: 600 })),
    fact(8, goal({ goalId: 'goal-b', objective: 'Replacement', status: 'complete', tokensUsed: 900 })),
    fact(9, null),
  ]
  const rows = project(facts)
  expect(rows.map((row) => row.action)).toEqual([
    'created',
    'paused',
    'resumed',
    'updated',
    'replaced',
    'completed',
    'cleared',
  ])
  expect(rows[0]?.goal?.tokensUsed).toBe(0)
  expect(rows[1]?.goal?.tokensUsed).toBe(120)
  expect(rows[5]?.goal?.tokensUsed).toBe(600)
  expect(rows[6]?.previousGoal?.tokensUsed).toBe(900)
  expect(rows[6]?.previousGoal?.objective).toBe('Replacement')
  expect(rows.every((row) => row.id === `goal-lifecycle:${JSON.stringify(['session', row.eventId])}`)).toBe(true)
  // Accounting follows a completion but never rewrites its historical budget.
  expect(rows.filter((row) => row.action === 'completed')).toHaveLength(1)
  expect(project([])).toEqual([])
})

test('page preceding facts distinguish resume/replace/new goal and clear without guessing', () => {
  expect(project([fact(20, goal())], { seq: 10, goal: goal({ status: 'paused' }) })[0]?.action).toBe('resumed')
  expect(project([fact(20, goal({ goalId: 'goal-b' }))], { seq: 10, goal: goal() })[0]?.action).toBe('replaced')
  expect(
    project([fact(20, goal({ goalId: 'goal-b' }))], { seq: 10, goal: goal({ status: 'complete' }) })[0]?.action,
  ).toBe('created')
  expect(project([fact(20, null)], { seq: 10, goal: goal() })[0]?.previousGoal?.objective).toBe('Original objective')
  expect(project([fact(20, null)])[0]?.previousGoal).toBeNull()
  for (const status of ['blocked', 'usage_limited', 'budget_limited'] as const)
    expect(project([fact(20, goal({ status }))], { seq: 10, goal: goal() })[0]?.action).toBe('status')
  expect(project([fact(20, goal({ tokenBudget: null }))], { seq: 10, goal: goal() })[0]?.action).toBe('updated')
})

test('foreign, old and duplicate identities cannot multiply or overwrite lifecycle cards', () => {
  const first = fact(12, goal())
  const rows = project(
    [
      fact(30, goal({ objective: 'Foreign' }), { sessionId: 'other' }),
      first,
      first,
      fact(5, null),
      fact(12, goal({ objective: 'Duplicate' })),
      fact(14, goal({ tokensUsed: 40 }), { eventId: first.eventId }),
    ],
    { seq: 10, goal: null },
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]?.goal?.objective).toBe('Original objective')
  expect(project([fact(2, goal()), fact(1, goal())]).map((row) => row.seq)).toEqual([1])
})

test('Goal rows merge by seq around messages, hidden Goal envelopes and stream boundaries', () => {
  const rows = project([fact(2, goal()), fact(4, goal({ status: 'paused' })), fact(7, null)])
  const sequence = projectSessionTimelineSequence(
    {
      sessionId: 'session',
      messages: [
        sessionMessage([{ type: 'text', text: 'Before' }], { id: 'before', seq: 1 }),
        sessionMessage([], { id: 'empty', role: 'user', runId: 'auto', seq: 3 }),
        sessionMessage([{ type: 'text', text: 'After' }], { id: 'after', runId: 'auto', seq: 6 }),
      ],
      runs: [
        {
          id: 'auto',
          sessionId: 'session',
          requestId: 'request',
          input: { text: '', images: [], source: 'goal', continuation: { goalId: 'goal', intentId: 'intent' } },
          status: 'completed',
          modelId: 'fixture',
          createdAt: 3,
          startedAt: 3,
          endedAt: 6,
          error: null,
        },
      ],
      streams: {
        s: { id: 's', sessionId: 'session', runId: 'live', text: 'Live', thinking: '', version: 1, offset: 4 },
      },
    },
    rows,
  )
  expect(
    sequence.map((item) =>
      item.kind === 'message'
        ? item.projection.message.id
        : item.kind === 'goalLifecycle'
          ? item.row.seq
          : item.kind === 'goalContinuation'
            ? 'auto'
            : 'stream',
    ),
  ).toEqual(['before', 2, 'auto', 4, 'after', 7, 'stream'])
  expect(
    projectSessionTimelineSequence({ sessionId: 'session', messages: [], runs: [], streams: {} }, rows).map(
      (item) => item.kind,
    ),
  ).toEqual(['goalLifecycle', 'goalLifecycle', 'goalLifecycle'])
  expect(projectSessionTimelineSequence({ sessionId: 'other', messages: [], runs: [], streams: {} }, rows)).toEqual([])
})

test('localized history card is a semantic disclosure, never current Goal controls or a message action', () => {
  for (const locale of ['zh-CN', 'en-US'] as const) {
    const labels = getShellCopy(locale).session.goalLifecycle
    for (const row of project([
      fact(1, goal({ objective: '<script>long & safe</script>\nsecond line' })),
      fact(2, goal({ status: 'complete', tokenBudget: null, continuationCount: 3 })),
      fact(3, null),
    ])) {
      const html = renderToStaticMarkup(<HbarGoalLifecycleCard row={row} labels={labels} />)
      expect(html).toContain('aria-expanded="true"')
      expect(html).toContain('aria-controls=')
      expect(html).toContain(labels.titles[row.action])
      expect(html.match(/<button/g)).toHaveLength(1)
      expect(html).not.toContain('title="Pause')
      expect(html).not.toContain('Copy message')
      expect(html).not.toContain('Fork')
      expect(html).not.toContain('<script>')
      expect(html).toContain('data-goal-session-id="session"')
      if (row.goal) expect(html).toContain(labels.statuses[row.goal.status])
    }
    expect(labels.budget(1200, null)).toContain(locale === 'zh-CN' ? '不限' : 'unlimited')
    expect(labels.cleared(null)).not.toContain('undefined')
  }
})

test('replacement comparisons preserve immutable snapshots across later edits and page boundaries', () => {
  const previous = goal({ objective: '验证桌面，删除旧流程 🧭' })
  const next = goal({ goalId: 'goal-b', objective: '验证窄屏，新增键盘流程 🚀' })
  const rows = project([fact(101, next), fact(102, goal({ goalId: 'goal-c', objective: 'Later objective' }))], {
    seq: 100,
    goal: previous,
  })
  for (const locale of ['zh-CN', 'en-US'] as const) {
    const copy = getShellCopy(locale).session.goalLifecycle
    const html = renderToStaticMarkup(
      <HbarGoalLifecycleCard
        row={rows[0]!}
        labels={{ ...copy, previousObjective: `${copy.previousObjective} ${'特别长的翻译标签'.repeat(12)}` }}
      />,
    )
    expect(html).toContain(copy.nextObjective)
    expect(html).toContain(copy.removed)
    expect(html).toContain(copy.added)
    expect(html).toContain('<del')
    expect(html).toContain('<ins')
    expect(html).toContain('🧭')
    expect(html).toContain('🚀')
    expect(html).not.toContain('Later objective')
    expect(html).not.toContain('undefined')
  }
  expect(rows[0]?.previousGoal?.objective).toBe(previous.objective)
  expect(rows[0]?.goal?.objective).toBe(next.objective)
  expect(rows[1]?.previousGoal?.objective).toBe(next.objective)
})

test('bounded presentable diff reconstructs Chinese, emoji, multiple edits and worst-case 4,000-character objectives', () => {
  const cases: readonly (readonly [string, string])[] = [
    ['保持部署日志并关闭旧审批', '保持测试日志并新增键盘验收'],
    ['Ship 🧭 old scope, keep files, remove tests', 'Ship 🚀 new scope, keep files, add tests'],
    ['Same goal', 'Same goal'],
    ['Keep records', 'Keep records and tests'],
    ['Keep records and tests', 'Keep records'],
    ['旧'.repeat(4000), '新'.repeat(4000)],
  ]
  for (const [previous, current] of cases) {
    const diff = goalObjectiveDiff(previous, current)
    expect(diff.previous.map((fragment) => fragment.text).join('')).toBe(previous)
    expect(diff.current.map((fragment) => fragment.text).join('')).toBe(current)
    const changed =
      diff.previous
        .filter((fragment) => fragment.kind === 'changed')
        .map((fragment) => fragment.text)
        .join('') +
      diff.current
        .filter((fragment) => fragment.kind === 'changed')
        .map((fragment) => fragment.text)
        .join('')
    expect(Boolean(changed)).toBe(previous !== current)
    expect(changed).not.toContain('\uFFFD')
  }
})

test('long replacement previews expose distant changes and expand independently from the card disclosure', () => {
  const prefix = '复用已验证结果🙂'.repeat(250)
  const previous = `${prefix}取消旧动作`.slice(-4000)
  const current = `${prefix}新增新目标`.slice(-4000)
  const row = project([fact(2, goal({ goalId: 'goal-b', objective: current }))], {
    seq: 1,
    goal: goal({ objective: previous }),
  })[0]!
  const labels = getShellCopy('zh-CN').session.goalLifecycle
  const html = renderToStaticMarkup(<HbarGoalLifecycleCard row={row} labels={labels} />)
  expect(html).toContain('旧动作')
  expect(html).toContain('新目标')
  expect(html).toContain(labels.showComparison)
  expect(html).toContain('aria-expanded="false"')
  expect(html).toContain(labels.omitted)
  expect(html.length).toBeLessThan(6000)
  for (const fragments of Object.values(goalObjectiveDiff(previous, current))) {
    const preview = excerptGoalObjective(fragments)
    expect(preview.some((fragment) => fragment.kind === 'omitted')).toBe(true)
    expect(preview.filter((fragment) => fragment.kind === 'changed')).toEqual(
      fragments.filter((fragment) => fragment.kind === 'changed'),
    )
    expect(preview.map((fragment) => fragment.text).join('')).not.toContain('\uFFFD')
  }
})

test('a legacy replacement without its previous snapshot falls back to the current objective safely', () => {
  const row = project([fact(1, goal({ objective: 'Available current objective' }))])[0]!
  const labels = getShellCopy('en-US').session.goalLifecycle
  const html = renderToStaticMarkup(
    <HbarGoalLifecycleCard row={{ ...row, action: 'replaced', previousGoal: null }} labels={labels} />,
  )
  expect(html).toContain('Available current objective')
  expect(html).not.toContain('<del')
  expect(html).not.toContain(labels.previousObjective)
  expect(html).not.toContain('undefined')
})
