import { afterEach, expect, test } from 'bun:test'
import { z } from 'zod'
import { CommandError } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import { goalPlanCommands } from '@hbar/contracts/commands/goals'
import type { ThreadGoal } from '@hbar/contracts'

const runtimes: ReturnType<typeof createAppRuntime>[] = []
afterEach(() => {
  for (const runtime of runtimes.splice(0)) runtime.dispose()
})
function gate() {
  let release!: () => void
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  return { wait, release }
}
async function fixture() {
  const workspace = { id: 'workspace', name: 'Workspace', path: 'D:/fixture', createdAt: 1 }
  const sessions = ['a', 'b'].map((id) => ({
    id,
    workspaceId: workspace.id,
    title: id,
    archived: false,
    parentId: null,
    createdAt: 1,
    updatedAt: 1,
    seq: 1,
  }))
  const makeGoal = (id: string): ThreadGoal => ({
    threadId: id,
    goalId: `goal-${id}`,
    objective: `Objective ${id}`,
    status: 'active',
    tokenBudget: 1000,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    createdAt: 1,
    updatedAt: 1,
  })
  const goals = new Map<string, ThreadGoal | null>(sessions.map((session) => [session.id, makeGoal(session.id)]))
  const writes: { name: string; input: unknown }[] = []
  const hooks: { afterRead?: () => Promise<void>; afterWrite?: (sessionId: string) => Promise<void> } = {}
  const runtime = createAppRuntime({
    instanceId: 'races',
    hostId: 'host',
    directory: {
      async execute(name, input) {
        if (name === 'session.get')
          return sessions.find((session) => session.id === z.object({ sessionId: z.string() }).parse(input).sessionId)
        if (name === 'workspace.get') return workspace
        if (name === 'session.list') return { items: sessions, nextCursor: null }
        if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
        throw new Error(`Unexpected query ${name}`)
      },
    },
    goals: {
      async execute(name, input) {
        const { sessionId } = z.object({ sessionId: z.string() }).parse(input)
        const existing = goals.get(sessionId) ?? null
        if (name === 'plan.get') return null
        if (name === 'goal.get') {
          const result = { goal: existing, remainingTokens: existing?.tokenBudget ?? null }
          await hooks.afterRead?.()
          return result
        }
        writes.push({ name, input })
        if (name === 'goal.create') throw new CommandError('GOAL_EXISTS', 'Goal was created elsewhere')
        if (name === 'goal.set') {
          const parsed = goalPlanCommands['goal.set'].input.parse(input)
          if (!existing || parsed.expectedGoalId !== existing.goalId)
            throw new CommandError('GOAL_CONFLICT', 'Identity changed')
          const goal = {
            ...existing,
            ...(parsed.objective ? { objective: parsed.objective } : {}),
            ...(parsed.status ? { status: parsed.status } : {}),
            ...(parsed.tokenBudget !== undefined ? { tokenBudget: parsed.tokenBudget } : {}),
          }
          goals.set(sessionId, goal)
          await hooks.afterWrite?.(sessionId)
          return { goal, remainingTokens: goal.tokenBudget }
        }
        if (name === 'goal.clear') {
          const parsed = goalPlanCommands['goal.clear'].input.parse(input)
          if (parsed.expectedGoalId !== existing?.goalId) throw new CommandError('GOAL_CONFLICT', 'Identity changed')
          goals.set(sessionId, null)
          await hooks.afterWrite?.(sessionId)
          return { cleared: true }
        }
        throw new Error(`Unexpected mutation ${name}`)
      },
    },
    surfaces: { canRender: (id) => id === 'goals' },
  })
  runtimes.push(runtime)
  await runtime.view.commands.execute('app.setSession', { sessionId: 'a' })
  const panel = await runtime.view.commands.execute('app.openPanel', { panelId: 'goals' })
  const target = { instanceId: panel.instanceId }
  await runtime.view.commands.execute('goalPlanWorkspace.refresh', target)
  await runtime.view.commands.execute('goalPlanWorkspace.showGoalEditor', target)
  const entry = () => runtime.view.state.goals.getSnapshot().entries[panel.instanceId]!
  return { runtime, goals, hooks, writes, target, entry }
}

test('dirty Goal drafts retain their original identity across refresh and cannot overwrite a replacement', async () => {
  const { runtime, goals, target, entry, writes } = await fixture()
  await runtime.view.commands.execute('goalPlanWorkspace.setGoalField', {
    ...target,
    field: 'objective',
    value: 'Old draft',
  })
  goals.set('a', { ...goals.get('a')!, goalId: 'replacement', objective: 'New objective' })
  await runtime.view.commands.execute('goalPlanWorkspace.refresh', target)
  expect(entry().goalDraft.baseline.goalId).toBe('goal-a')
  await expect(runtime.view.commands.execute('goalPlanWorkspace.saveGoal', target)).rejects.toMatchObject({
    code: 'GOAL_CONFLICT',
  })
  expect(writes[0]?.input).toMatchObject({ expectedGoalId: 'goal-a' })
  expect(goals.get('a')?.objective).toBe('New objective')
  expect(entry().goalAction.error).toBe('GOAL_CONFLICT')
})

test('budget-only draft does not replay a stale status or overwrite concurrently changed fields', async () => {
  const { runtime, goals, target, writes } = await fixture()
  await runtime.view.commands.execute('goalPlanWorkspace.setGoalField', {
    ...target,
    field: 'tokenBudget',
    value: '2000',
  })
  goals.set('a', { ...goals.get('a')!, status: 'budget_limited' })
  await runtime.view.commands.execute('goalPlanWorkspace.refresh', target)
  await runtime.view.commands.execute('goalPlanWorkspace.saveGoal', target)
  expect(writes[0]?.input).toEqual({ sessionId: 'a', expectedGoalId: 'goal-a', tokenBudget: 2000 })
  expect(goals.get('a')?.status).toBe('budget_limited')
})

test('a delayed refresh keeps edits made after the query started', async () => {
  const { runtime, target, hooks, entry } = await fixture()
  const pending = gate()
  hooks.afterRead = () => pending.wait
  const refresh = runtime.view.commands.execute('goalPlanWorkspace.refresh', target)
  await runtime.view.commands.execute('goalPlanWorkspace.setGoalField', {
    ...target,
    field: 'objective',
    value: 'Typed while loading',
  })
  pending.release()
  await refresh
  expect(entry().goalDraft.objective).toBe('Typed while loading')
  expect(entry().goalDirty).toBe(true)
})

for (const action of ['saveGoal', 'clearGoal'] as const)
  test(`a late ${action} result cannot replace another session or block its edits`, async () => {
    const { runtime, target, hooks, entry } = await fixture()
    const entered = gate(),
      pending = gate()
    hooks.afterWrite = async (id) => {
      if (id === 'a') {
        entered.release()
        await pending.wait
      }
    }
    await runtime.view.commands.execute('goalPlanWorkspace.setGoalField', {
      ...target,
      field: 'tokenBudget',
      value: '2000',
    })
    const oldResult = runtime.view.commands.execute(`goalPlanWorkspace.${action}`, target).then(
      () => null,
      (error: unknown) => error,
    )
    await entered.wait
    await runtime.view.commands.execute('app.setSession', { sessionId: 'b' })
    await runtime.view.commands.execute('goalPlanWorkspace.refresh', target)
    await runtime.view.commands.execute('goalPlanWorkspace.showGoalEditor', target)
    await runtime.view.commands.execute('goalPlanWorkspace.setGoalField', {
      ...target,
      field: 'tokenBudget',
      value: '3000',
    })
    await runtime.view.commands.execute('goalPlanWorkspace.saveGoal', target)
    pending.release()
    expect(await oldResult).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(entry()).toMatchObject({
      sessionId: 'b',
      goal: { goalId: 'goal-b', tokenBudget: 3000 },
      goalAction: { status: 'succeeded', error: null },
    })
  })

test('clear binds the displayed Goal identity instead of clearing a newer unseen Goal', async () => {
  const { runtime, target, goals } = await fixture()
  goals.set('a', { ...goals.get('a')!, goalId: 'replacement' })
  await expect(runtime.view.commands.execute('goalPlanWorkspace.clearGoal', target)).rejects.toMatchObject({
    code: 'GOAL_CONFLICT',
  })
  expect(goals.get('a')?.goalId).toBe('replacement')
})

test('a delayed old save cannot overwrite a replacement revealed by an in-flight refresh', async () => {
  const { runtime, target, hooks, goals, entry } = await fixture()
  const entered = gate(),
    pending = gate()
  hooks.afterWrite = async () => {
    entered.release()
    await pending.wait
  }
  await runtime.view.commands.execute('goalPlanWorkspace.setGoalField', {
    ...target,
    field: 'tokenBudget',
    value: '2000',
  })
  const result = runtime.view.commands.execute('goalPlanWorkspace.saveGoal', target).then(
    () => null,
    (error: unknown) => error,
  )
  await entered.wait
  goals.set('a', { ...goals.get('a')!, goalId: 'replacement', objective: 'New objective' })
  await runtime.view.commands.execute('goalPlanWorkspace.refresh', target)
  expect(entry().goalAction.status).toBe('submitting')
  pending.release()
  expect(await result).toMatchObject({ code: 'GOAL_CONFLICT' })
  expect(entry().goal?.goalId).toBe('replacement')
})
