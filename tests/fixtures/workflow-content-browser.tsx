import { createRoot } from 'react-dom/client'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import {
  workflowSnapshotSchema,
  workflowPublicStateSchema,
  planStateSchema,
  agentPatchSchema,
  workflowScopeSchema,
  WORKFLOW_SCHEMA_VERSION,
  type WorkflowSnapshot,
} from '@hbar/contracts'
import { agentCommands, agentRecordSchema } from '@hbar/contracts/commands/agents'
import { workflowCommands } from '@hbar/contracts/commands/workflows'
import { workflowWorkspaceCommands } from '@hbar/contracts/commands/workflow-workspace'
import { HbarRuntimeProvider, HbarWorkflowOverview, useHbarRuntime, useHbarRuntimeState } from '@hbar/app-react'
import { LumenFrame, LumenProvider, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import { workflowFocusTitle, workflowCheckTitle, workflowPath } from './workflow-content-data'
import '@lumen/app-ui/styles.css'

export interface WorkflowContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly suffix: string
  readonly evidence: number
  readonly checks: number
  readonly delegations: number
  readonly scope: number
  readonly files: number
  readonly state: 'ready' | 'empty' | 'draft' | 'stale' | 'review' | 'read-error' | 'duplicate' | 'offline'
}
const workspace = { id: 'original-workspace', path: 'D:/owned-workflow', name: 'Original workspace', createdAt: 1 }
const session = {
  id: 'original-parent',
  workspaceId: workspace.id,
  title: 'Original parent',
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 2,
  seq: 3,
}
const child = { ...session, id: 'original-child-0', parentId: session.id }

function snapshot(input: WorkflowContentInput): WorkflowSnapshot {
  const plan = planStateSchema.parse({
    sessionId: session.id,
    revision: 3,
    turnId: null,
    explanation: 'Original plan',
    plan: [{ step: workflowFocusTitle, status: 'in_progress' }],
    updatedAt: 1,
  })
  if (input.state === 'empty') return { plan: null, workflow: null }
  if (input.state === 'draft') return { plan, workflow: null }
  const checks = Array.from({ length: input.checks }, (_, index) => ({
    id: `original-check-${index}`,
    description: workflowCheckTitle(index),
    required: true,
    verifier: { kind: 'user' as const },
    status: 'pending' as const,
    evidenceId: null,
    updatedAt: 1,
  }))
  if (input.state === 'duplicate' && checks[0]) checks.push({ ...checks[0], description: 'Rejected duplicate check' })
  const scope = {
    readPaths: Array.from({ length: input.scope }, (_, index) => workflowPath(index)),
    writePaths: [],
    tools: ['read_file', 'write_file'],
  }
  return workflowSnapshotSchema.parse({
    plan,
    workflow: workflowPublicStateSchema.parse({
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      executionModel: 'focus_v2',
      workflowId: 'original-workflow',
      sessionId: session.id,
      goalId: null,
      planRevision: 3,
      revision: 4,
      status: 'waiting_user',
      explorationCount: 0,
      focus:
        input.state === 'stale'
          ? null
          : {
              focusId: 'original-focus',
              planRevision: 3,
              stepIndex: 0,
              stepTextHash: 'a'.repeat(64),
              title: workflowFocusTitle,
              status: 'verifying',
              completionPolicy: 'user',
              scope,
              acceptanceChecks: checks,
              startedAt: 1,
              completedAt: null,
            },
      scopeExpansions: [],
      delegations: Array.from({ length: input.delegations }, (_, index) => ({
        delegationId: `original-delegation-${index}`,
        itemId: `original-item-${index}`,
        agentId: `original-agent-${index}`,
        modelId: 'local-fixture',
        tokenBudget: 100,
        status: index === 0 ? 'conflict' : 'patch_ready',
        patchId: `original-patch-${index}`,
        createdAt: 1,
        updatedAt: 2,
      })),
      evidence: Array.from({ length: input.evidence }, (_, index) => ({
        evidenceId: `original-evidence-${index}`,
        itemId: 'original-focus',
        checkId: `original-proof-${index}`,
        planRevision: 3,
        workspaceRevision: null,
        createdAt: 1000 + index,
        source: 'user',
        outcome: 'accepted',
        actorId: 'original-reviewer',
        note: null,
      })),
      ...(input.state === 'review'
        ? {
            review: {
              reviewId: 'original-review',
              planRevision: 3,
              stepTextHash: 'a'.repeat(64),
              workspaceFingerprint: 'b'.repeat(64),
              resumeModelId: 'local-fixture',
              reviewerAgentId: 'original-agent-0',
              status: 'rejected',
              summary: '原始独立复核说明 Complete original review summary '.repeat(8),
              createdAt: 1,
              updatedAt: 2,
            },
            rejection: {
              fingerprint: 'b'.repeat(64),
              toolName: 'write_file',
              path: workflowPath(0),
              reason: '原始拒绝原因 Complete original rejection reason '.repeat(8),
              count: 3,
              updatedAt: 2,
            },
          }
        : {}),
      createdAt: 1,
      updatedAt: 2,
    }),
  })
}
function agent(input: WorkflowContentInput, index: number) {
  return agentRecordSchema.parse({
    agentId: `original-agent-${index}`,
    parentSessionId: session.id,
    sessionId: `original-child-${index}`,
    runId: `original-run-${index}`,
    requestId: `original-request-${index}`,
    objective: 'Original isolated task',
    modelId: 'local-fixture',
    tokenBudget: 100,
    status: 'completed',
    error: null,
    resultSummary: '原始委派结果 Complete original delegated result '.repeat(8),
    patch: input.files
      ? {
          patchId: `original-patch-${index}`,
          agentId: `original-agent-${index}`,
          parentSessionId: session.id,
          itemId: `original-item-${index}`,
          planRevision: 3,
          status: index === 0 ? 'conflict' : 'ready',
          artifactId: `original-artifact-${index}`,
          artifactSha256: 'a'.repeat(64),
          files: Array.from({ length: input.files }, (_, file) => ({
            path: workflowPath(file),
            operation: 'update',
            beforeSha256: 'b'.repeat(64),
            afterSha256: 'c'.repeat(64),
          })),
          summary: 'Original patch',
          createdAt: 1,
          appliedAt: null,
        }
      : null,
    createdAt: 1,
    updatedAt: 2,
  })
}
declare global {
  interface Window {
    mountWorkflowContent(input: WorkflowContentInput): Promise<void>
    releaseWorkflowContent(): void
    repairWorkflowContent(): Promise<void>
    reverseWorkflowChecks(): void
    failNextWorkflowAction(): void
    workflowContentState(): {
      readonly calls: readonly { readonly name: string; readonly input: unknown }[]
      readonly selected: string | null
      readonly visibleEvidence: number | undefined
      readonly error: string | null | undefined
      readonly actions: unknown
    }
    workflowContentBounds(): Readonly<Record<string, boolean>>
  }
}
function Overview({ instanceId, input }: { readonly instanceId: string; readonly input: WorkflowContentInput }) {
  const runtime = useHbarRuntime()
  const state = useHbarRuntimeState(runtime.state.workflows)
  const base = getShellCopy(input.locale).goals.workflow
  const labels = {
    ...base,
    title: base.title + input.suffix,
    acceptance: base.acceptance + input.suffix,
    agents: base.agents + input.suffix,
    evidence: base.evidence + input.suffix,
    review: base.review + input.suffix,
    diagnosis: base.diagnosis + input.suffix,
    scope: base.scope + input.suffix,
    readPaths: base.readPaths + input.suffix,
    applyPatch: base.applyPatch + input.suffix,
    coordinate: base.coordinate + input.suffix,
    accept: base.accept + input.suffix,
    reject: base.reject + input.suffix,
    loadMore: base.loadMore + input.suffix,
  }
  const invoke = (name: string, value: unknown) => {
    let result: Promise<unknown>
    if (name === 'workflowWorkspace.acceptCheck')
      result = runtime.commands.execute(name, workflowWorkspaceCommands[name].input.parse(value))
    else if (name === 'workflowWorkspace.applyPatch')
      result = runtime.commands.execute(name, workflowWorkspaceCommands[name].input.parse(value))
    else if (name === 'workflowWorkspace.loadMoreEvidence')
      result = runtime.commands.execute(name, workflowWorkspaceCommands[name].input.parse(value))
    else if (
      name === 'app.setSession' &&
      value &&
      typeof value === 'object' &&
      'sessionId' in value &&
      typeof value.sessionId === 'string'
    )
      result = runtime.commands.execute('app.setSession', { sessionId: value.sessionId })
    else throw new Error(`Unexpected original UI action ${name}`)
    result.catch(() => {}) // The original runtime owns and renders each action's failure.
  }
  return (
    <HbarWorkflowOverview
      entry={state.entries[instanceId]}
      labels={labels}
      connected={input.state !== 'offline'}
      instanceId={instanceId}
      invoke={invoke}
    />
  )
}
window.mountWorkflowContent = async (input) => {
  const container = document.getElementById('workflow-content-fixture')
  if (!container) throw new Error('Missing workflow fixture root')
  let current = snapshot(input)
  let readFailed = input.state === 'read-error'
  let actionFailed = false
  const calls: { readonly name: string; readonly input: unknown }[] = []
  const watchers = new Set<(value: WorkflowSnapshot) => void>()
  const notify = () => {
    for (const watcher of watchers) watcher(current)
  }
  const workflows = {
    watch(_sessionId: string, callback: (value: WorkflowSnapshot) => void) {
      watchers.add(callback)
      return () => watchers.delete(callback)
    },
    async execute(name: string, value: unknown) {
      calls.push({ name, input: value })
      if (name === 'workflow.get') {
        workflowCommands[name].input.parse(value)
        if (readFailed) throw new CommandError('DISCONNECTED', 'Owned read failure')
        return current
      }
      if (name === 'workflow.acceptCheck') {
        const target = workflowCommands[name].input.parse(value)
        if (actionFailed) {
          actionFailed = false
          throw new CommandError('REVISION_CONFLICT', 'Owned acceptance failure')
        }
        if (!current.workflow?.focus) throw new Error('Missing original focus')
        current = workflowSnapshotSchema.parse({
          ...current,
          workflow: {
            ...current.workflow,
            revision: current.workflow.revision + 1,
            focus: {
              ...current.workflow.focus,
              acceptanceChecks: current.workflow.focus.acceptanceChecks.map((check) =>
                check.id === target.checkId ? { ...check, status: target.decision } : check,
              ),
            },
          },
        })
        notify()
        return current
      }
      throw new Error(`Unexpected workflow query ${name}`)
    },
  }
  const records = new Map(
    Array.from({ length: input.delegations }, (_, index) => {
      const record = agent(input, index)
      return [record.agentId, record] as const
    }),
  )
  const agents: CommandExecutor = {
    async execute(name, value) {
      calls.push({ name, input: value })
      if (name === 'agent.result.get') {
        const target = agentCommands[name].input.parse(value)
        const record = records.get(target.agentId)
        if (!record) throw new Error('Missing original agent')
        return record
      }
      if (name === 'agent.patch.apply') {
        const target = agentCommands[name].input.parse(value)
        const record = records.get(target.agentId)
        if (!record?.patch || !current.workflow) throw new Error('Missing original patch')
        const updated = agentRecordSchema.parse({
          ...record,
          patch: { ...record.patch, status: 'applied', appliedAt: 3 },
        })
        records.set(target.agentId, updated)
        current = workflowSnapshotSchema.parse({
          ...current,
          workflow: {
            ...current.workflow,
            revision: current.workflow.revision + 1,
            delegations: current.workflow.delegations.map((row) =>
              row.agentId === target.agentId ? { ...row, status: 'applied' } : row,
            ),
          },
        })
        notify()
        return updated
      }
      throw new Error(`Unexpected original Agent query ${name}`)
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'workflow-content-runtime',
    hostId: 'owned-host',
    workflows,
    agents,
    directory: {
      async execute(name, value) {
        if (name === 'workspace.get') return workspace
        if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
        if (name === 'session.get')
          return value && typeof value === 'object' && 'sessionId' in value && value.sessionId === child.id
            ? child
            : session
        if (name === 'session.list') return { items: [session, child], nextCursor: null }
        throw new Error(`Unexpected workflow directory query ${name}`)
      },
    },
    surfaces: { canRender: (panel) => panel === 'goals' },
  })
  const root = createRoot(container)
  window.releaseWorkflowContent = () => {
    root.unmount()
    runtime.dispose()
    if (watchers.size) throw new Error('Workflow watcher was not released')
  }
  await runtime.ready
  await runtime.view.commands.execute('app.setSession', { workspaceId: workspace.id, sessionId: session.id })
  const panel = await runtime.view.commands.execute('app.openPanel', { panelId: 'goals' })
  try {
    await runtime.view.commands.execute('workflowWorkspace.refresh', { instanceId: panel.instanceId })
  } catch (reason) {
    if (input.state !== 'read-error' && input.state !== 'duplicate') throw reason
  }
  root.render(
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}>
      <HbarRuntimeProvider view={runtime.view}>
        <LumenFrame
          className="workflow-content-reading"
          role="region"
          aria-label={getShellCopy(input.locale).goals.workflow.title}
          tabIndex={0}
        >
          <Overview instanceId={panel.instanceId} input={input} />
        </LumenFrame>
      </HbarRuntimeProvider>
    </LumenProvider>,
  )
  window.repairWorkflowContent = async () => {
    readFailed = false
    await runtime.view.commands.execute('workflowWorkspace.refresh', { instanceId: panel.instanceId })
  }
  window.reverseWorkflowChecks = () => {
    if (!current.workflow?.focus) throw new Error('Missing original focus')
    current = workflowSnapshotSchema.parse({
      ...current,
      workflow: {
        ...current.workflow,
        revision: current.workflow.revision + 1,
        focus: { ...current.workflow.focus, acceptanceChecks: [...current.workflow.focus.acceptanceChecks].reverse() },
      },
    })
    notify()
  }
  window.failNextWorkflowAction = () => {
    actionFailed = true
  }
  window.workflowContentState = () => {
    const entry = runtime.view.state.workflows.getSnapshot().entries[panel.instanceId]
    return {
      calls,
      selected: runtime.view.state.navigation.getSnapshot().sessionId,
      visibleEvidence: entry?.visibleEvidence,
      error: entry?.error,
      actions: entry?.actions,
    }
  }
  window.workflowContentBounds = () => {
    const boundary = (key: 'evidence' | 'delegations', count: number) => {
      if (!current.workflow) throw new Error('Missing boundary workflow')
      const first = current.workflow[key][0]
      if (!first) throw new Error('Missing boundary record')
      return workflowPublicStateSchema.safeParse({
        ...current.workflow,
        [key]: Array.from({ length: count }, (_, index) => ({
          ...first,
          ...(key === 'evidence' ? { evidenceId: `bound-${index}` } : { delegationId: `bound-${index}` }),
        })),
      }).success
    }
    const record = records.values().next().value
    const file = record?.patch?.files[0]
    return {
      evidence1000: boundary('evidence', 1000),
      evidence1001: boundary('evidence', 1001),
      delegations128: boundary('delegations', 128),
      delegations129: boundary('delegations', 129),
      checks32: workflowPublicStateSchema.safeParse({
        ...current.workflow,
        focus: current.workflow?.focus && {
          ...current.workflow.focus,
          acceptanceChecks: Array.from({ length: 32 }, (_, index) => ({
            ...current.workflow?.focus?.acceptanceChecks[0],
            id: `bound-${index}`,
          })),
        },
      }).success,
      checks33: workflowPublicStateSchema.safeParse({
        ...current.workflow,
        focus: current.workflow?.focus && {
          ...current.workflow.focus,
          acceptanceChecks: Array.from({ length: 33 }, (_, index) => ({
            ...current.workflow?.focus?.acceptanceChecks[0],
            id: `bound-${index}`,
          })),
        },
      }).success,
      scope128: workflowScopeSchema.safeParse({
        readPaths: Array.from({ length: 128 }, (_, index) => workflowPath(index)),
      }).success,
      scope129: workflowScopeSchema.safeParse({
        readPaths: Array.from({ length: 129 }, (_, index) => workflowPath(index)),
      }).success,
      files512: agentPatchSchema.safeParse({ ...record?.patch, files: Array.from({ length: 512 }, () => file) })
        .success,
      files513: agentPatchSchema.safeParse({ ...record?.patch, files: Array.from({ length: 513 }, () => file) })
        .success,
    }
  }
}
