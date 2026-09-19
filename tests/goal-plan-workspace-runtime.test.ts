import { expect, test } from 'bun:test'
import { CommandError } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import type { PlanState, ThreadGoal } from '@hbar/contracts'

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

test('goal and plan workspace owns drafts and reconciles an unknown plan save from Host facts', async () => {
  let goal: ThreadGoal | null = null
  let plan: PlanState | null = null
  let planWrites = 0
  const runtime = createAppRuntime({
    instanceId: 'goal-plan-workspace',
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
        const value = input as Record<string, unknown>
        if (name === 'goal.get') return { goal, remainingTokens: goal?.tokenBudget ?? null }
        if (name === 'goal.create') {
          goal = {
            threadId: session.id,
            goalId: 'goal',
            objective: String(value.objective),
            status: 'active',
            tokenBudget: typeof value.tokenBudget === 'number' ? value.tokenBudget : null,
            tokensUsed: 0,
            timeUsedSeconds: 0,
            createdAt: 10,
            updatedAt: 10,
          }
          return { goal, remainingTokens: goal.tokenBudget }
        }
        if (name === 'goal.clear') {
          const cleared = goal !== null
          goal = null
          return { cleared }
        }
        if (name === 'plan.get') return plan
        if (name === 'plan.update') {
          planWrites += 1
          plan = {
            sessionId: session.id,
            turnId: null,
            explanation: typeof value.explanation === 'string' ? value.explanation : null,
            plan: value.plan as PlanState['plan'],
            updatedAt: 20,
          }
          if (planWrites === 1) throw new CommandError('TIMEOUT', 'response lost after commit')
          return plan
        }
        if (name === 'plan.clear') {
          const cleared = plan !== null
          plan = null
          return { cleared }
        }
        throw new Error(`Unsupported goal command: ${name}`)
      },
    },
    surfaces: { canRender: (panelId) => panelId === 'goals' },
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    const panel = await runtime.view.commands.execute('app.openPanel', { panelId: 'goals' })
    await runtime.view.commands.execute('goalPlanWorkspace.refresh', { instanceId: panel.instanceId })

    await runtime.view.commands.execute('goalPlanWorkspace.setGoalField', {
      instanceId: panel.instanceId,
      field: 'objective',
      value: 'Ship the command-first UI',
    })
    await runtime.view.commands.execute('goalPlanWorkspace.setGoalField', {
      instanceId: panel.instanceId,
      field: 'tokenBudget',
      value: '24000',
    })
    await runtime.view.commands.execute('goalPlanWorkspace.saveGoal', { instanceId: panel.instanceId })
    expect(runtime.view.state.goals.getSnapshot().entries[panel.instanceId]!.goal).toMatchObject({
      objective: 'Ship the command-first UI',
      tokenBudget: 24_000,
    })

    await runtime.view.commands.execute('goalPlanWorkspace.setExplanation', {
      instanceId: panel.instanceId,
      value: 'Keep each slice reviewable.',
    })
    await runtime.view.commands.execute('goalPlanWorkspace.setNewStep', {
      instanceId: panel.instanceId,
      value: 'Implement the runtime',
    })
    await runtime.view.commands.execute('goalPlanWorkspace.addStep', { instanceId: panel.instanceId })
    await expect(
      runtime.view.commands.execute('goalPlanWorkspace.savePlan', { instanceId: panel.instanceId }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(runtime.view.state.goals.getSnapshot().entries[panel.instanceId]!.planAction.status).toBe('unknown')
    await expect(
      runtime.view.commands.execute('goalPlanWorkspace.setNewStep', {
        instanceId: panel.instanceId,
        value: 'Unsafe new text',
      }),
    ).rejects.toMatchObject({ code: 'BUSY' })

    await runtime.view.commands.execute('goalPlanWorkspace.refresh', { instanceId: panel.instanceId })
    const reconciled = runtime.view.state.goals.getSnapshot().entries[panel.instanceId]!
    expect(reconciled.planAction.status).toBe('idle')
    expect(reconciled.planDirty).toBe(false)
    expect(reconciled.plan?.plan).toEqual([{ step: 'Implement the runtime', status: 'pending' }])

    await runtime.view.commands.execute('goalPlanWorkspace.clearPlan', { instanceId: panel.instanceId })
    await runtime.view.commands.execute('goalPlanWorkspace.clearGoal', { instanceId: panel.instanceId })
    expect(runtime.view.state.goals.getSnapshot().entries[panel.instanceId]).toMatchObject({ goal: null, plan: null })
  } finally {
    runtime.dispose()
  }
})
