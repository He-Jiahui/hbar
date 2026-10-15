import type { DiagnosticEvent } from '@hbar/contracts'
import { workflowStateSchema } from '@hbar/contracts/workflow'
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { Storage, createPathLayout, ensurePathLayout } from '@hbar/storage'
import type { GoalService, PlanService, WorkflowService } from '@hbar/plugin-sdk'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { commitRuntimeWorkflowRecovery } from '../apps/host/src/runtime-workflow-recovery'

// No model request, server, provider, native executor, or tool process is needed to seed historical facts.
test('managed Host reconciles released historical pending after projection restore without rewriting unknown outcomes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-workflow-pending-recovery-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  let kernel: Kernel | undefined
  let storage: Storage | undefined
  let runtime: ProcessHostRuntime | undefined
  let failed = false
  let primary: unknown
  const cleanup: unknown[] = []
  const recoveryDiagnostics: DiagnosticEvent[] = []
  try {
    await ensurePathLayout(layout)
    storage = new Storage(layout.database, layout)
    const stable = storage
    kernel = await Kernel.create({
      home: layout.dataRoot,
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      lifecycle: 'managed',
      profile: {
        createStorage: async () => ({ call: (method, ...args) => stable.call(method, ...args), close: async () => {} }),
      },
    })
    await kernel.changePlugin('goal.codex', true, { autoContinue: false })
    const workspace = await storage.call('createWorkspace', root, 'Recovery fixture')
    const plans = kernel.plugins.get<PlanService>('plan')
    const workflows = kernel.plugins.get<WorkflowService>('workflow')
    const cases = []
    for (const released of [true, false]) {
      const session = await storage.call('createSession', workspace.id)
      await kernel.plugins.get<GoalService>('goal').create(session.id, 'Inspect historical unknown tool')
      const plan = await plans.update(session.id, [{ step: 'Review saved module', status: 'in_progress' }], null)
      await workflows.focus(
        session.id,
        0,
        {
          id: 'module',
          title: 'Review saved module',
          scope: { readPaths: ['.'], writePaths: [], tools: ['read_file'] },
          acceptanceChecks: [],
        },
        'agent',
        plan.revision,
      )
      const run = await storage.call(
        'enqueue',
        session.id,
        crypto.randomUUID(),
        { text: 'Historical fixture', images: [] },
        'local-fixture',
      )
      const version = { unitId: 'kernel', generation: 1, artifactId: 'a'.repeat(64) }
      const lease = await storage.call('runtimeExecutionClaim', {
        leaseId: crypto.randomUUID(),
        sessionId: session.id,
        runId: run.id,
        owner: { unitId: 'kernel', generation: 1, incarnation: crypto.randomUUID() },
        fence: 1,
        acquiredAt: Date.now(),
        versions: { kernel: version, driver: version, plugins: [], hooks: [] },
      })
      if (!lease) throw new Error('Historical execution claim was not accepted')
      const saved = await storage.call('events', session.id, 0, 1_000)
      const latest = saved
        .flatMap((event) =>
          event.data && typeof event.data === 'object' && 'workflow' in event.data
            ? [workflowStateSchema.parse(event.data.workflow)]
            : [],
        )
        .at(-1)
      if (!latest) throw new Error('Expected historical workflow')
      const current = latest
      const pending = { callId: 'old-shell', runId: run.id, toolName: 'shell' }
      await storage.callOwned(
        lease,
        'append',
        session.id,
        'workflow.updated',
        { workflow: { ...current, revision: current.revision + 1, pendingMutations: [pending], status: 'verifying' } },
        run.id,
      )
      await storage.callOwned(lease, 'setRun', run.id, 'interrupted', 'Unknown historical tool', {
        code: 'EFFECT_UNKNOWN',
        category: 'result_unknown',
        retryable: false,
      })
      if (released) await storage.call('runtimeExecutionRelease', lease)
      else await storage.call('runtimeExecutionRevoke', lease.owner, [run.id])
      cases.push({ session, run, released, pending, planRevision: plan.revision })
    }
    await kernel.close()
    kernel = await Kernel.create({
      home: layout.dataRoot,
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      lifecycle: 'managed',
      profile: {
        createStorage: async () => ({ call: (method, ...args) => stable.call(method, ...args), close: async () => {} }),
      },
    })
    for (const entry of cases) {
      const hydrated = (await kernel.plugins.get<WorkflowService>('workflow').get(entry.session.id)).workflow
      expect(hydrated?.pendingMutations).toEqual([entry.pending])
      expect(hydrated?.status).toBe('verifying')
    }
    await kernel.close()
    kernel = await Kernel.create({
      home: layout.dataRoot,
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      lifecycle: 'managed',
      profile: {
        createStorage: async () => ({ call: (method, ...args) => stable.call(method, ...args), close: async () => {} }),
      },
    })
    for (const entry of cases) {
      const hydrated = (await kernel.plugins.get<WorkflowService>('workflow').get(entry.session.id)).workflow
      expect(hydrated?.pendingMutations).toEqual([entry.pending])
      expect(hydrated?.status).toBe('verifying')
    }
    await kernel.close()
    kernel = undefined
    await storage.close()
    storage = undefined
    runtime = await ProcessHostRuntime.create({
      diagnostics: {
        emit(event) {
          if (event.event === 'host.runtime_workflow_recovery') recoveryDiagnostics.push(event)
        },
      },
      layout,
      sourceRoot: process.cwd(),
      demo: true,
      workspace: root,
      secrets: new MemorySecrets(),
    })
    const liveWorkflow = runtime.kernel.plugins.get('workflow')
    // The public application facade does not expose the parent-only lifecycle methods.
    expect(Reflect.get(liveWorkflow, 'recoverPendingMutations')).toBeUndefined()
    expect(Reflect.get(liveWorkflow, 'pendingRecoverySessions')).toBeUndefined()
    const workflowOwner = runtime
      .snapshot()
      .units.find((unit) => unit.descriptor.id === 'plugin.workflow')
      ?.generations.find((generation) => generation.role === 'default')
    if (!workflowOwner) throw new Error('Expected current managed Workflow owner')
    for (const entry of cases) {
      const current = (await liveWorkflow.get(entry.session.id)).workflow
      expect(current?.status).toBe(entry.released ? 'needs_revision' : 'verifying')
      expect(current?.pendingMutations).toEqual(entry.released ? [] : [entry.pending])
      const old = await runtime.storage.call('run', entry.run.id)
      expect(old.failure).toMatchObject({ code: 'EFFECT_UNKNOWN', category: 'result_unknown', retryable: false })
      expect(old.status).toBe('interrupted')
      expect((await runtime.storage.call('runtimeExecutionRead', old.id))?.state).toBe(
        entry.released ? 'released' : 'revoked',
      )
      const events = await runtime.storage.call('events', entry.session.id, 0, 1_000)
      const recovery = events.filter(
        (event) =>
          event.type === 'workflow.updated' &&
          event.data &&
          typeof event.data === 'object' &&
          'diagnosis' in event.data,
      )
      expect(recovery).toHaveLength(entry.released ? 1 : 0)
      if (entry.released) {
        await liveWorkflow.focus(
          entry.session.id,
          0,
          {
            id: 'review-after-recovery',
            title: 'Review saved module',
            scope: { readPaths: ['.'], writePaths: [], tools: ['read_file'] },
            acceptanceChecks: [],
          },
          'agent',
          entry.planRevision,
        )
        expect((await liveWorkflow.get(entry.session.id)).workflow?.focus?.focusId).toBe('review-after-recovery')
      }
      const observed = recoveryDiagnostics.filter((event) => event.sessionId === entry.session.id)
      expect(observed).toHaveLength(1)
      expect(observed[0]).toMatchObject({
        event: 'host.runtime_workflow_recovery',
        contextId: 'plugin.workflow',
        instanceId: runtime.instanceId,
        processId: process.pid,
        outcome: entry.released ? 'success' : 'skipped',
        errorCode: entry.released ? 'WORKFLOW_RECOVERY_RECONCILED' : 'WORKFLOW_RECOVERY_OWNED',
      })
      expect(observed[0]?.requestId).toBe(workflowOwner.incarnation)
      expect(observed[0]?.phase).toBe('generation.' + workflowOwner.generation)
    }
    expect(recoveryDiagnostics).toHaveLength(2)
    // The Host-only commit validates its entire transition; it is not a general Storage append escape.
    const untouched = cases.find((entry) => !entry.released)
    if (!untouched) throw new Error('Expected unreleased fixture')
    const saved = await runtime.storage.call('events', untouched.session.id, 0, 1_000)
    const current = saved
      .flatMap((event) =>
        event.data && typeof event.data === 'object' && 'workflow' in event.data
          ? [workflowStateSchema.parse(event.data.workflow)]
          : [],
      )
      .at(-1)
    if (!current) throw new Error('Expected unreleased workflow')
    let refused: unknown
    try {
      await commitRuntimeWorkflowRecovery({
        storage: runtime.storage,
        sessionId: untouched.session.id,
        input: {
          current,
          next: {
            ...current,
            pendingMutations: [],
            status: 'needs_revision',
            revision: current.revision + 1,
            updatedAt: Date.now(),
            goalId: 'forged-goal',
          },
        },
        assertAuthority() {},
      })
    } catch (error) {
      refused = error
    }
    expect(refused).toMatchObject({ code: 'WORKFLOW_RECOVERY_CONFLICT' })
  } catch (error) {
    failed = true
    primary = error
  }
  try {
    await kernel?.close()
  } catch (error) {
    cleanup.push(error)
  }
  try {
    await runtime?.close()
  } catch (error) {
    cleanup.push(error)
  }
  try {
    await storage?.close()
  } catch (error) {
    cleanup.push(error)
  }
  try {
    const absolute = resolve(root)
    if (dirname(absolute) !== resolve(tmpdir()) || !basename(absolute).startsWith('hbar-workflow-pending-recovery-'))
      throw new Error('Fixture cleanup path is outside its private temporary prefix')
    await rm(absolute, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  } catch (error) {
    cleanup.push(error)
  }
  if (failed) throw primary
  if (cleanup.length) throw new AggregateError(cleanup, 'Workflow recovery fixture cleanup failed')
}, 120_000)
