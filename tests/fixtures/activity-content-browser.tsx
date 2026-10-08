import { createRoot, type Root } from 'react-dom/client'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError } from '@hbar/commands'
import { activeOperationsInputSchema } from '@hbar/contracts/commands/run'
import { agentCommands, type AgentRecord } from '@hbar/contracts/commands/agents'
import { goalPlanCommands } from '@hbar/contracts/commands/goals'
import type { PlanState, WorkflowSnapshot } from '@hbar/contracts'
import { HbarRuntimeProvider, HbarSessionActivityWorkspace } from '@hbar/app-react'
import { LumenProvider, LumenFrame, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import {
  activityContentObjective,
  activityContentStep,
  activityContentFocus,
  activityContentPreview,
} from './activity-content-data'
import '@lumen/app-ui/styles.css'

export interface ActivityContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly runs: number
  readonly agents: number
  readonly steps: number
  readonly delegations: number
  readonly suffix: string
  readonly state?: 'ready' | 'loading' | 'error' | 'offline'
  readonly invalid?:
    'duplicate-run' | 'foreign-run' | 'oversized-run' | 'duplicate-agent' | 'foreign-agent' | 'duplicate-delegation'
  readonly objectiveLength?: number
  readonly stepLength?: number
  readonly focusLength?: number
}
declare global {
  interface Window {
    mountActivityContent(input: ActivityContentInput): Promise<void>
    activityContentState(): {
      readonly calls: readonly { name: string; input: unknown }[]
      readonly activity: ReturnType<ReturnType<typeof createAppRuntime>['view']['state']['activity']['getSnapshot']>
      readonly workflows: ReturnType<ReturnType<typeof createAppRuntime>['view']['state']['workflows']['getSnapshot']>
      readonly facts: ReturnType<
        ReturnType<typeof createAppRuntime>['view']['state']['composerIntent']['getSnapshot']
      >['facts']
      readonly sessionId: string | null
    }
    refreshActivityContent(): Promise<void>
    loadMoreActivityContent(kind: 'runs' | 'agents'): Promise<unknown>
    reorderActivityContent(remove?: boolean): Promise<void>
    repairActivityContent(): void
    disposeActivityContent?: () => void
  }
}
const workspace = { id: 'original-workspace', path: 'D:/owned-activity', name: 'Original workspace', createdAt: 1 }
const session = {
  id: 'original-parent',
  workspaceId: workspace.id,
  title: 'Original parent',
  parentId: null,
  archived: false,
  createdAt: 1,
  updatedAt: 2,
  seq: 3,
}
let root: Root | undefined
window.mountActivityContent = async (input) => {
  window.disposeActivityContent?.()
  const element = document.getElementById('activity-content-fixture')
  if (!element) throw new Error('Missing owned Activity fixture')
  const calls: { name: string; input: unknown }[] = []
  let failed = input.state === 'error'
  let held = input.state === 'loading'
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const wait = async () => {
    if (held) await gate
    if (failed) throw new CommandError('READ_FAILED', 'Owned Activity read failed')
  }
  let records: AgentRecord[] = Array.from({ length: input.agents }, (_, index) => ({
    agentId:
      input.invalid === 'duplicate-agent' ? 'duplicate-agent' : `original-agent-${String(index).padStart(3, '0')}`,
    parentSessionId: input.invalid === 'foreign-agent' ? 'foreign-parent' : session.id,
    sessionId: `original-child-${index}`,
    runId: `original-child-run-${index}`,
    requestId: `original-request-${index}`,
    objective: input.objectiveLength
      ? activityContentObjective(index).padEnd(input.objectiveLength, '原')
      : activityContentObjective(index),
    modelId: 'original-model',
    tokenBudget: null,
    status: index % 2 ? 'completed' : 'running',
    error: null,
    createdAt: index + 1,
    updatedAt: index + 2,
  }))
  const plan: PlanState = {
    sessionId: session.id,
    revision: 1,
    turnId: null,
    explanation: null,
    updatedAt: 1,
    plan: Array.from({ length: input.steps }, (_, index) => ({
      step: input.stepLength ? activityContentStep(index).padEnd(input.stepLength, '原') : activityContentStep(index),
      status: index % 2 ? 'pending' : 'completed',
    })),
  }
  const snapshot: WorkflowSnapshot = {
    plan,
    workflow: {
      schemaVersion: 2,
      executionModel: 'focus_v2',
      workflowId: 'original-workflow',
      sessionId: session.id,
      goalId: null,
      planRevision: 1,
      revision: 1,
      status: 'active',
      explorationCount: 0,
      focus: {
        focusId: 'original-focus',
        planRevision: 1,
        stepIndex: 0,
        stepTextHash: 'a'.repeat(64),
        title: input.focusLength ? activityContentFocus.padEnd(input.focusLength, '原') : activityContentFocus,
        status: 'delegated',
        scope: { readPaths: [], writePaths: [], tools: [] },
        acceptanceChecks: [],
        completionPolicy: 'agent',
        startedAt: 1,
        completedAt: null,
      },
      scopeExpansions: [],
      evidence: [],
      rejection: null,
      transitionIntent: null,
      review: null,
      delegations: Array.from({ length: input.delegations }, (_, index) => ({
        delegationId:
          input.invalid === 'duplicate-delegation' ? 'duplicate-delegation' : `original-delegation-${index}`,
        itemId: index % 2 ? 'previous-focus' : 'original-focus',
        agentId: index === 0 ? (records[0]?.agentId ?? null) : null,
        modelId: 'original-complete-model-name-'.repeat(4),
        tokenBudget: null,
        status: index % 2 ? 'failed' : 'queued',
        patchId: null,
        createdAt: index + 1,
        updatedAt: index + 2,
      })),
      createdAt: 1,
      updatedAt: 2,
    },
  }
  const owned = createAppRuntime({
    instanceId: crypto.randomUUID(),
    hostId: 'owned-activity-host',
    directory: {
      execute(name, raw) {
        if (name === 'workspace.get') return Promise.resolve(workspace)
        if (name === 'workspace.list') return Promise.resolve({ items: [workspace], nextCursor: null })
        if (name === 'session.list') return Promise.resolve({ items: [session], nextCursor: null })
        if (name === 'session.get') {
          const id = raw && typeof raw === 'object' && 'sessionId' in raw ? raw.sessionId : null
          const child = records.find((record) => record.sessionId === id)
          return Promise.resolve(
            id === session.id
              ? session
              : child
                ? { ...session, id: child.sessionId, parentId: session.id, title: child.objective }
                : null,
          )
        }
        return Promise.reject(new Error(`Unexpected directory read ${name}`))
      },
    },
    surfaces: { canRender: (id) => id === 'activity' },
    run: {
      async execute(name, raw) {
        calls.push({ name, input: raw })
        await wait()
        if (name !== 'session.activeOperations') throw new Error(`Unexpected Run read ${name}`)
        const query = activeOperationsInputSchema.parse(raw)
        const start = query.cursor ? Number(query.cursor.afterOperationId.replace('original-run-', '')) + 1 : 0
        const end = Math.min(start + query.limit, input.runs)
        const items = Array.from(
          { length: end - start + (input.invalid === 'oversized-run' ? 1 : 0) },
          (_, offset) => ({
            operationId: input.invalid === 'duplicate-run' ? 'duplicate-run' : `original-run-${start + offset}`,
            status: offset % 2 ? ('queued' as const) : ('running' as const),
            createdAt: 1760000000000 + offset,
            startedAt: offset % 2 ? null : 1760000000000 + offset,
            intentPreview: activityContentPreview,
          }),
        )
        return {
          sessionId: input.invalid === 'foreign-run' ? 'foreign-parent' : session.id,
          sessionSeq: 3,
          totalActive: input.runs,
          items,
          nextCursor: end < input.runs ? { afterOperationId: items.at(-1)?.operationId, sessionSeq: 3 } : null,
        }
      },
      getReceipt: () => Promise.resolve(null),
    },
    agents: {
      async execute(name, raw) {
        calls.push({ name, input: raw })
        await wait()
        if (name === 'agent.list') {
          const query = agentCommands['agent.list'].input.parse(raw)
          const start = query.after ? records.findIndex((record) => record.agentId === query.after) + 1 : 0
          const items = records.slice(start, start + query.limit)
          return { items, nextCursor: start + items.length < records.length ? items.at(-1)?.agentId : null }
        }
        if (name === 'agent.result.get') {
          const query = agentCommands['agent.result.get'].input.parse(raw)
          const record = records.find((item) => item.agentId === query.agentId)
          if (!record) throw new CommandError('NOT_FOUND', 'Original Agent no longer exists')
          return record
        }
        throw new Error(`Unexpected Agent read ${name}`)
      },
    },
    workflows: {
      async execute(name, raw) {
        calls.push({ name, input: raw })
        await wait()
        if (name !== 'workflow.get') throw new Error(`Unexpected workflow read ${name}`)
        return snapshot
      },
    },
    goals: {
      async execute(name, raw) {
        calls.push({ name, input: raw })
        await wait()
        if (name !== 'goal.snapshot') throw new Error(`Unexpected Goal read ${name}`)
        goalPlanCommands['goal.snapshot'].input.parse(raw)
        return { sessionId: session.id, goalSeq: 0, planSeq: 1, goal: null, plan, remainingTokens: null }
      },
    },
  })
  await owned.ready
  await owned.view.commands.execute('app.setSession', { sessionId: session.id, workspaceId: workspace.id })
  const tab = owned.view.state.workspaceTabs
    .getSnapshot()
    .items.find((item) => item.kind === 'session' && item.sessionId === session.id)
  if (!tab) throw new Error('Missing original parent tab')
  const panel = await owned.view.commands.execute('sessionTools.open', {
    panelId: 'activity',
    workspaceId: workspace.id,
    sessionId: session.id,
    sourceTabInstanceKey: tab.instanceKey,
  })
  const refresh = async () => {
    await Promise.allSettled([
      owned.view.commands.execute('activityWorkspace.refresh', { instanceId: panel.instanceId }),
      owned.view.commands.execute('activityWorkspace.refreshAgents', { instanceId: panel.instanceId }),
      owned.view.commands.execute('workflowWorkspace.refresh', { instanceId: panel.instanceId }),
      owned.view.commands.execute('composerIntent.refresh', { sessionId: session.id }),
    ])
  }
  if (!held) await refresh()
  else void refresh().catch(() => {})
  const base = getShellCopy(input.locale).activity
  const labels = {
    ...base,
    title: base.title + input.suffix,
    description: base.description + input.suffix,
    runs: base.runs + input.suffix,
    close: base.close + input.suffix,
    refresh: base.refresh + input.suffix,
    retry: base.retry + input.suffix,
    loadMore: base.loadMore + input.suffix,
    status: (status: Parameters<typeof base.status>[0]) => base.status(status) + input.suffix,
    startedAt: (value: number) => base.startedAt(value) + input.suffix,
    queuedAt: (value: number) => base.queuedAt(value) + input.suffix,
    agents: {
      ...base.agents,
      title: base.agents.title + input.suffix,
      retry: base.agents.retry + input.suffix,
      loadMore: base.agents.loadMore + input.suffix,
      status: (status: Parameters<typeof base.agents.status>[0]) => base.agents.status(status) + input.suffix,
    },
    tasks: {
      ...base.tasks,
      title: base.tasks.title + input.suffix,
      retry: base.tasks.retry + input.suffix,
      progress: (done: number, total: number) => base.tasks.progress(done, total) + input.suffix,
    },
    workflow: {
      ...base.workflow,
      title: base.workflow.title + input.suffix,
      other: base.workflow.other + input.suffix,
      retry: base.workflow.retry + input.suffix,
    },
  }
  root = createRoot(element)
  root.render(
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode }}>
      <HbarRuntimeProvider view={owned.view}>
        <LumenFrame className="owned-activity-pane">
          <HbarSessionActivityWorkspace
            instanceId={panel.instanceId}
            connected={input.state !== 'offline'}
            labels={labels}
            targetLabel={session.title + input.suffix}
          />
        </LumenFrame>
      </HbarRuntimeProvider>
    </LumenProvider>,
  )
  window.activityContentState = () => ({
    calls,
    activity: owned.view.state.activity.getSnapshot(),
    workflows: owned.view.state.workflows.getSnapshot(),
    facts: owned.view.state.composerIntent.getSnapshot().facts,
    sessionId: owned.view.state.navigation.getSnapshot().sessionId,
  })
  window.refreshActivityContent = refresh
  window.loadMoreActivityContent = (kind) =>
    owned.view.commands
      .execute(kind === 'runs' ? 'activityWorkspace.loadMore' : 'activityWorkspace.loadMoreAgents', {
        instanceId: panel.instanceId,
      })
      .catch(() => {})
  window.reorderActivityContent = async (remove = false) => {
    records = remove ? records.slice(1) : [...records].reverse()
    await refresh()
  }
  window.repairActivityContent = () => {
    failed = false
    held = false
    release()
  }
  window.disposeActivityContent = () => {
    release()
    root?.unmount()
    root = undefined
    owned.dispose()
  }
}
