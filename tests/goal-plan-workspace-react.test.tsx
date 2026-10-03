import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarGoalPlanWorkspace, HbarRuntimeProvider } from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError } from '@hbar/commands'
import type { PlanState, ThreadGoal } from '@hbar/contracts'
import { getShellCopy } from '../apps/web/src/shell-copy'

const workspace = { id: 'workspace', path: 'D:/workspace', name: 'Workspace', createdAt: 1 }
const session = {
  id: 'session',
  workspaceId: workspace.id,
  title: 'Goal session',
  archived: false,
  parentId: null,
  createdAt: 2,
  updatedAt: 3,
  seq: 4,
}
const goal: ThreadGoal = {
  threadId: session.id,
  goalId: 'goal',
  objective: 'Ship the modular workbench',
  status: 'active',
  tokenBudget: 30_000,
  tokensUsed: 4_000,
  timeUsedSeconds: 120,
  createdAt: 4,
  updatedAt: 5,
}
const plan: PlanState = {
  sessionId: session.id,
  revision: 1,
  turnId: null,
  explanation: 'Keep every slice reviewable.',
  plan: [
    { step: 'Build the runtime', status: 'completed' },
    { step: 'Connect the renderer', status: 'in_progress' },
  ],
  updatedAt: 6,
}

test('empty Goals pane offers the existing localized Goal editor entry', async () => {
  const runtime = createAppRuntime({
    instanceId: 'empty-goal-react',
    hostId: 'host',
    directory: {
      async execute(name: string) {
        if (name === 'session.get') return session
        if (name === 'workspace.get') return workspace
        if (name === 'session.list') return { items: [session], nextCursor: null }
        if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
        throw new Error(`Unsupported query: ${name}`)
      },
    },
    goals: {
      async execute(name: string) {
        if (name === 'goal.get') return { goal: null, remainingTokens: null }
        if (name === 'plan.get') return null
        throw new Error(`Unsupported goal command: ${name}`)
      },
    },
    surfaces: { canRender: (panelId) => panelId === 'goals' },
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    const panel = await runtime.view.commands.execute('app.openPanel', { panelId: 'goals' })
    await runtime.view.commands.execute('goalPlanWorkspace.refresh', { instanceId: panel.instanceId })
    for (const locale of ['en-US', 'zh-CN'] as const) {
      const labels = getShellCopy(locale).goals
      const html = renderToStaticMarkup(
        <HbarRuntimeProvider view={runtime.view}>
          <HbarGoalPlanWorkspace labels={labels} connected />
        </HbarRuntimeProvider>,
      )
      expect(html).toContain(labels.goal.composerHint)
      const buttonText = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((match) =>
        (match[1] ?? '').replace(/<[^>]+>/g, ''),
      )
      expect(buttonText).toContain(labels.goal.create)
      expect(buttonText).not.toContain(labels.goal.edit)
    }
  } finally {
    runtime.dispose()
  }
})

test('goal and plan panel keeps the Agent Plan authoritative and read-only', async () => {
  const runtime = createAppRuntime({
    instanceId: 'goal-plan-react',
    hostId: 'host',
    directory: {
      async execute(name: string) {
        if (name === 'session.get') return session
        if (name === 'workspace.get') return workspace
        if (name === 'session.list') return { items: [session], nextCursor: null }
        if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
        throw new Error(`Unsupported query: ${name}`)
      },
    },
    goals: {
      async execute(name: string) {
        if (name === 'goal.get') return { goal, remainingTokens: 26_000 }
        if (name === 'plan.get') return plan
        throw new Error(`Unsupported goal command: ${name}`)
      },
    },
    surfaces: { canRender: (panelId) => panelId === 'goals' },
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    const panel = await runtime.view.commands.execute('app.openPanel', { panelId: 'goals' })
    await runtime.view.commands.execute('goalPlanWorkspace.refresh', { instanceId: panel.instanceId })
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarGoalPlanWorkspace labels={getShellCopy('en-US').goals} connected />
      </HbarRuntimeProvider>,
    )
    expect(html).toContain('Goals and plans')
    expect(html).toContain('Ship the modular workbench')
    expect(html).toContain('26,000')
    expect(html).toContain('Keep every slice reviewable.')
    expect(html).toContain('Build the runtime')
    expect(html).toContain('Connect the renderer')
    expect(html).toContain('Edit goal')
    expect(html).not.toContain('Edit plan')
    expect(html).not.toContain('Clear plan')
    expect(html).not.toContain('Save 2 steps')

    await runtime.view.commands.execute('goalPlanWorkspace.showGoalEditor', { instanceId: panel.instanceId })
    const goalEditor = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarGoalPlanWorkspace labels={getShellCopy('en-US').goals} connected />
      </HbarRuntimeProvider>,
    )
    expect(goalEditor).toContain('Save goal')
    expect(goalEditor).not.toContain('Build the runtime')

    await runtime.view.commands.execute('goalPlanWorkspace.showPlanEditor', { instanceId: panel.instanceId })
    const planEditor = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarGoalPlanWorkspace labels={getShellCopy('en-US').goals} connected />
      </HbarRuntimeProvider>,
    )
    expect(planEditor).not.toContain('Save 2 steps')
    expect(planEditor).toContain('Keep every slice reviewable.')
  } finally {
    runtime.dispose()
  }
})

test('localized Goal facts expose effective allowance and stop reasons while editor preserves derived states', async () => {
  const limited: ThreadGoal = {
    ...goal,
    status: 'budget_limited',
    executionBudget: {
      goalRemainingTokens: 26000,
      sessionRemainingTokens: 0,
      effectiveRemainingTokens: 0,
      limitingSource: 'session',
    },
    continuation: { intentId: 'intent', trigger: 'run', phase: 'waiting', reason: 'budget_exhausted', updatedAt: 6 },
    blockerAudit: {
      reason: '需要持续展示且允许自然换行的很长的外部依赖说明'.repeat(8),
      consecutiveTurns: 2,
      requiredTurns: 3,
    },
  }
  const writes: unknown[] = []
  const runtime = createAppRuntime({
    instanceId: 'goal-facts',
    hostId: 'host',
    directory: {
      async execute(name: string) {
        if (name === 'session.get') return session
        if (name === 'workspace.get') return workspace
        if (name === 'session.list') return { items: [session], nextCursor: null }
        if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
        throw new Error(`Unsupported query: ${name}`)
      },
    },
    goals: {
      async execute(name: string, input: unknown) {
        if (name === 'goal.get') return { goal: limited, remainingTokens: 26000 }
        if (name === 'plan.get') return null
        if (name === 'goal.set') {
          writes.push(input)
          if (typeof input === 'object' && input && 'status' in input && input.status === 'complete')
            throw new CommandError('WORKFLOW_INCOMPLETE', 'Acceptance required')
          return { goal: limited, remainingTokens: 26000 }
        }
        throw new Error(`Unsupported command: ${name}`)
      },
    },
    surfaces: { canRender: (id) => id === 'goals' },
  })
  const render = () =>
    renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarGoalPlanWorkspace labels={getShellCopy('zh-CN').goals} connected />
      </HbarRuntimeProvider>,
    )
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    const panel = await runtime.view.commands.execute('app.openPanel', { panelId: 'goals' })
    const target = { instanceId: panel.instanceId }
    await runtime.view.commands.execute('goalPlanWorkspace.refresh', target)
    const overview = render()
    for (const text of [
      '目标剩余额度',
      '会话剩余额度',
      '有效剩余额度',
      '当前限制来源',
      '等待中',
      '执行额度耗尽',
      '阻塞审计 2/3',
      '26,000',
    ])
      expect(overview).toContain(text)
    expect(overview).toContain(limited.blockerAudit!.reason)
    await runtime.view.commands.execute('goalPlanWorkspace.showGoalEditor', target)
    const editor = render()
    expect(editor).not.toContain('<select')
    expect(editor).toContain('预算与执行详情')
    expect(editor).toContain('执行额度耗尽')
    expect(editor).not.toContain('value="blocked"')
    expect(editor).not.toContain('value="usage_limited"')
    for (const value of ['blocked', 'budget_limited', 'usage_limited'])
      await expect(
        runtime.view.commands.execute('goalPlanWorkspace.setGoalField', { ...target, field: 'status', value }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await runtime.view.commands.execute('goalPlanWorkspace.setGoalField', {
      ...target,
      field: 'tokenBudget',
      value: '50000',
    })
    await runtime.view.commands.execute('goalPlanWorkspace.saveGoal', target)
    expect(writes[0]).toMatchObject({ tokenBudget: 50000, expectedGoalId: goal.goalId })
    expect(writes[0]).not.toHaveProperty('status')
    await runtime.view.commands.execute('goalPlanWorkspace.setGoalField', {
      ...target,
      field: 'status',
      value: 'complete',
    })
    await expect(runtime.view.commands.execute('goalPlanWorkspace.saveGoal', target)).rejects.toMatchObject({
      code: 'WORKFLOW_INCOMPLETE',
    })
    expect(render()).toContain('WORKFLOW_INCOMPLETE')
    expect(runtime.view.state.goals.getSnapshot().entries[panel.instanceId]!.goal?.status).toBe('budget_limited')
  } finally {
    runtime.dispose()
  }
})
