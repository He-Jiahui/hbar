import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { Storage, type StoragePort } from '@hbar/storage'
import type { ExecutionOwnership } from '@hbar/contracts/runtime'
import type { GoalService, PlanService, WorkflowService } from '@hbar/plugin-sdk'

for (const toolName of ['workflow_checkpoint', 'workflow_update'] as const)
  test(`${toolName} completes historical Plan focus using the current real execution lease`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-workflow-current-authority-'))
    const storage = new Storage(join(root, 'state.sqlite'))
    let authority: ExecutionOwnership | undefined
    const source: StoragePort = {
      call: (method, ...args) =>
        authority ? storage.callOwned(authority, method, ...args) : storage.call(method, ...args),
      close: async () => {},
    }
    const kernel = await Kernel.create({
      home: join(root, 'data'),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      lifecycle: 'managed',
      profile: { createStorage: async () => source },
    })
    try {
      const workspace = await storage.call('createWorkspace', root, 'Fixture')
      const session = await storage.call('createSession', workspace.id)
      await kernel.changePlugin('goal.codex', true, { autoContinue: false })
      const plans = kernel.plugins.get<PlanService>('plan')
      const workflows = kernel.plugins.get<WorkflowService>('workflow')
      await kernel.plugins.get<GoalService>('goal').create(session.id, 'Complete historical focus safely')
      const claim = async (request: string, fence: number) => {
        const run = await storage.call(
          'enqueue',
          session.id,
          request,
          { text: 'Fixture execution', images: [] },
          'local-fixture',
        )
        const lease = await storage.call('runtimeExecutionClaim', {
          leaseId: crypto.randomUUID(),
          sessionId: session.id,
          runId: run.id,
          owner: { unitId: 'kernel', generation: 1, incarnation: `fixture-${fence}` },
          fence,
          acquiredAt: Date.now(),
          versions: {
            kernel: { unitId: 'kernel', generation: 1, artifactId: 'a'.repeat(64) },
            driver: { unitId: 'driver', generation: 1, artifactId: 'b'.repeat(64) },
            plugins: [],
            hooks: [],
          },
        })
        if (!lease) throw new Error('Expected real execution claim')
        return { run: await storage.call('run', run.id), lease }
      }
      const historical = await claim('historical-plan-owner', 1)
      authority = historical.lease
      const originalPlan = await plans.update(
        session.id,
        [{ step: 'Ship verified focus', status: 'in_progress' }],
        null,
        historical.run.id,
      )
      await workflows.focus(
        session.id,
        0,
        {
          id: 'ship',
          title: 'Ship verified focus',
          scope: { readPaths: ['.'], writePaths: [], tools: [] },
          acceptanceChecks: [],
        },
        'agent',
        originalPlan.revision,
      )
      await storage.callOwned(historical.lease, 'setRun', historical.run.id, 'completed')
      await storage.call('runtimeExecutionRelease', historical.lease)
      const current = await claim('current-recovered-owner', 2)
      authority = current.lease
      const tool = kernel.tools.get(toolName)
      if (!tool) throw new Error('Expected public Workflow tool')
      const focus = (await workflows.get(session.id)).workflow
      if (!focus) throw new Error('Expected current focus')
      const args =
        toolName === 'workflow_checkpoint'
          ? {
              itemId: 'ship',
              outcome: 'complete',
              summary: 'Verified already saved work',
              expectedFocusRevision: focus.focusRevision ?? focus.revision,
              expectedPlanRevision: originalPlan.revision,
            }
          : {
              action: 'checkpoint',
              itemId: 'ship',
              outcome: 'complete',
              summary: 'Verified already saved work',
              expectedRevision: focus.revision,
            }
      await tool.execute(args, {
        session,
        workspace,
        run: current.run,
        callId: 'checkpoint-current',
        signal: new AbortController().signal,
      })
      const updated = await plans.get(session.id)
      expect(updated?.plan[0]?.status).toBe('completed')
      expect(updated?.turnId).toBe(current.run.id)
      const events = await storage.call('events', session.id, 0, 1000)
      const saved = events.filter((event) => event.type === 'plan.updated')
      expect(events.some((event) => event.runId === historical.run.id)).toBe(true)
      expect(saved.at(-1)?.runId).toBe(current.run.id)
      expect((await workflows.get(session.id)).workflow?.status).toBe('completed')
      let rejected: unknown
      try {
        await storage.callOwned(
          current.lease,
          'append',
          session.id,
          'plan.updated',
          { forbidden: true },
          historical.run.id,
        )
      } catch (error: unknown) {
        rejected = error
      }
      expect(rejected).toMatchObject({ code: 'EXECUTION_OWNER_REVOKED' })
    } finally {
      authority = undefined
      await kernel.close()
      await storage.close()
      await rm(root, { recursive: true, force: true })
    }
  })
