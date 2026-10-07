import { createRoot, type Root } from 'react-dom/client'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError } from '@hbar/commands'
import type { ThreadGoal, PlanState } from '@hbar/contracts'
import { goalPlanCommands } from '@hbar/contracts/commands/goals'
import { HbarGoalPlanWorkspace, HbarRuntimeProvider } from '@hbar/app-react'
import { LumenProvider, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'

export interface GoalWorkspaceContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly state: 'overview' | 'empty' | 'editor' | 'read-error' | 'failed' | 'unknown' | 'loading' | 'offline'
  readonly count: number
  readonly suffix: string
  readonly objective: string
  readonly step: string
}
declare global {
  interface Window {
    mountGoalWorkspaceContent(input: GoalWorkspaceContentInput): Promise<void>
    goalWorkspaceContentState(): {
      readonly calls: readonly { name: string; input: unknown }[]
      readonly entry: import('@hbar/app-runtime').GoalPlanWorkspaceEntryState | undefined
    }
    repairGoalWorkspaceContent(): void
    mutateGoalWorkspaceContent(): Promise<void>
    disposeGoalWorkspaceContent?: () => void
  }
}
const workspace = { id: 'original-workspace', path: 'D:/owned-goal-fixture', name: 'Original workspace', createdAt: 1 }
const session = {
  id: 'original-session',
  workspaceId: workspace.id,
  title: 'Original session',
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 2,
  seq: 3,
}
let root: Root | undefined
let runtime: ReturnType<typeof createAppRuntime> | undefined
let release: (() => void) | undefined
window.mountGoalWorkspaceContent = async (input) => {
  window.disposeGoalWorkspaceContent?.()
  const element = document.getElementById('goal-workspace-content-fixture')
  if (!element) throw new Error('Missing owned goal fixture')
  const calls: { name: string; input: unknown }[] = []
  let failed = input.state === 'read-error' || input.state === 'failed'
  let goal: ThreadGoal | null =
    input.state === 'empty'
      ? null
      : {
          goalId: 'original-goal',
          threadId: session.id,
          objective: input.objective,
          status: 'active',
          tokenBudget: 30_000,
          tokensUsed: 4_000,
          timeUsedSeconds: 120,
          createdAt: 4,
          updatedAt: 5,
        }
  let plan: PlanState | null =
    input.state === 'empty'
      ? null
      : {
          sessionId: session.id,
          revision: 1,
          turnId: null,
          explanation: input.suffix,
          plan: Array.from({ length: input.count }, (_, index) => ({
            step: `${input.step} ${index}`,
            status: 'pending',
          })),
          updatedAt: 6,
        }
  let hold = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const owned = createAppRuntime({
    instanceId: 'goal-workspace-content',
    hostId: 'owned-fixture',
    directory: {
      execute(name) {
        if (name === 'session.get') return Promise.resolve(session)
        if (name === 'workspace.get') return Promise.resolve(workspace)
        if (name === 'session.list') return Promise.resolve({ items: [session], nextCursor: null })
        if (name === 'workspace.list') return Promise.resolve({ items: [workspace], nextCursor: null })
        return Promise.reject(new Error(`Unexpected directory command: ${name}`))
      },
    },
    surfaces: { canRender: (id) => id === 'goals' },
    workflows: {
      execute(name) {
        if (name === 'workflow.get') return Promise.resolve({ plan, workflow: null })
        return Promise.reject(new Error(`Unexpected workflow command: ${name}`))
      },
    },
    goals: {
      async execute(name, raw) {
        if (hold) await gate
        if ((name === 'goal.get' || name === 'plan.get') && failed && input.state === 'read-error')
          throw new CommandError('DISCONNECTED', 'Owned read failure')
        if (name === 'goal.get') return { goal, remainingTokens: goal ? 26_000 : null }
        if (name === 'plan.get') return plan
        if (name === 'goal.snapshot') {
          goalPlanCommands['goal.snapshot'].input.parse(raw)
          return {
            sessionId: session.id,
            goalSeq: goal?.updatedAt ?? 0,
            planSeq: plan?.revision ?? 0,
            goal,
            plan,
            remainingTokens: goal ? 26_000 : null,
          }
        }
        calls.push({ name, input: raw })
        if (name === 'goal.set') {
          const target = goalPlanCommands['goal.set'].input.parse(raw)
          if (failed) throw new CommandError('GOAL_CONFLICT', 'Owned goal changed')
          if (!goal || typeof target.objective !== 'string') throw new Error('Missing captured goal objective')
          goal = { ...goal, objective: target.objective, updatedAt: goal.updatedAt + 1 }
          if (input.state === 'unknown') throw new CommandError('DISCONNECTED', 'Owned response lost after mutation')
          return { goal, remainingTokens: 26_000 }
        }
        throw new Error(`Unexpected goal command: ${name}`)
      },
    },
  })
  runtime = owned
  await owned.ready
  const execute = owned.view.commands.execute
  await execute('app.setSession', { workspaceId: workspace.id, sessionId: session.id })
  const panel = await execute('app.openPanel', { panelId: 'goals' })
  const invalidOutput =
    !goalPlanCommands['plan.get'].output.safeParse(plan).success ||
    !goalPlanCommands['goal.get'].output.safeParse({ goal, remainingTokens: goal ? 26_000 : null }).success
  await execute('goalPlanWorkspace.refresh', { instanceId: panel.instanceId }).catch((error: unknown) => {
    if (input.state !== 'read-error' && !invalidOutput) throw error
  })
  await execute('workflowWorkspace.refresh', { instanceId: panel.instanceId }).catch((error: unknown) => {
    if (!invalidOutput) throw error
  })
  if (input.state === 'editor' || input.state === 'failed' || input.state === 'unknown') {
    await execute('goalPlanWorkspace.showGoalEditor', { instanceId: panel.instanceId })
    await execute('goalPlanWorkspace.setGoalField', {
      instanceId: panel.instanceId,
      field: 'objective',
      value: 'Original retained goal draft 原始草稿',
    })
    if (input.state === 'failed' || input.state === 'unknown')
      await execute('goalPlanWorkspace.saveGoal', { instanceId: panel.instanceId }).catch((error: unknown) => {
        if (!(error instanceof CommandError)) throw error
      })
  }
  if (input.state === 'loading') {
    hold = true
    void execute('goalPlanWorkspace.refresh', { instanceId: panel.instanceId }).catch(() => {})
  }
  const base = getShellCopy(input.locale).goals
  const labels = {
    ...base,
    title: base.title + input.suffix,
    description: base.description + input.suffix,
    loading: base.loading + input.suffix,
    goal: {
      ...base.goal,
      title: base.goal.title + input.suffix,
      document: base.goal.document + input.suffix,
      replacementWarning: base.goal.replacementWarning + input.suffix,
      composerHint: base.goal.composerHint + input.suffix,
      saved: base.goal.saved + input.suffix,
      statuses: { ...base.goal.statuses, active: base.goal.statuses.active + input.suffix },
    },
    plan: {
      ...base.plan,
      title: base.plan.title + input.suffix,
      count: (count: number) => base.plan.count(count) + input.suffix,
      empty: base.plan.empty + input.suffix,
      statuses: { ...base.plan.statuses, pending: base.plan.statuses.pending + input.suffix },
    },
    error: (code: string) => base.error(code) + input.suffix,
  }
  window.goalWorkspaceContentState = () => ({
    calls,
    entry: owned.view.state.goals.getSnapshot().entries[panel.instanceId],
  })
  window.repairGoalWorkspaceContent = () => {
    failed = false
    hold = false
    release?.()
  }
  window.mutateGoalWorkspaceContent = async () => {
    plan = plan ? { ...plan, revision: plan.revision + 1, plan: [...plan.plan].reverse() } : null
    await execute('goalPlanWorkspace.refresh', { instanceId: panel.instanceId })
  }
  window.disposeGoalWorkspaceContent = () => {
    root?.unmount()
    release?.()
    runtime?.dispose()
    root = undefined
    runtime = undefined
    release = undefined
  }
  root = createRoot(element)
  root.render(
    <LumenProvider
      className="goal-workspace-fixture-provider"
      appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}
    >
      <HbarRuntimeProvider view={owned.view}>
        <HbarGoalPlanWorkspace labels={labels} connected={input.state !== 'offline'} />
      </HbarRuntimeProvider>
    </LumenProvider>,
  )
}
