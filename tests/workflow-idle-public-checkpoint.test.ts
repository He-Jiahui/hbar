// Public Workflow idle checkpoints with actual Kernel services; no provider dispatch or private-state mutation.
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { WorkflowRuntime, workflowPlugin, workflowConfigSchema } from '@hbar/workflow'
import { definePlugin } from '@hbar/plugin-sdk'
import type { HbarAPI, GoalService, AgentService, PlanService, GitService } from '@hbar/plugin-sdk'

async function fixture(
  action: (runtime: WorkflowRuntime, kernel: Kernel, api: HbarAPI) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'hbar-workflow-idle-public-'))
  let kernel: Kernel | undefined
  let primary: unknown
  let failed = false
  let cleanup: unknown
  let cleanupFailed = false
  try {
    const observed: { api?: HbarAPI; runtime?: WorkflowRuntime } = {}
    const capture = definePlugin({
      manifest: workflowPlugin.manifest,
      ...(workflowPlugin.configSchema === undefined ? {} : { configSchema: workflowPlugin.configSchema }),
      async apply(ctx, config) {
        const api = ctx.hbar.api
        // Load the real bundled service; the separate instance below deliberately remains unhydrated.
        await workflowPlugin.apply(ctx, config)
        observed.api = api
        observed.runtime = new WorkflowRuntime(
          api,
          api.service<GoalService>('goal'),
          api.service<AgentService>('agent'),
          workflowConfigSchema.parse({}),
          api.service<PlanService>('plan'),
          api.service<GitService>('git'),
        )
      },
    })
    kernel = await Kernel.create({
      home: join(root, 'data'),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      lifecycle: 'managed',
      profile: { replacements: { 'workflow.focus': capture } },
    })
    kernel.beginDrain()
    // Managed lifecycle skips automatic workspace creation; use the public setup entry explicitly.
    await kernel.createWorkspace(root)
    if (!observed.runtime || !observed.api) throw new Error('Public declared Workflow fixture was not injected')
    await action(observed.runtime, kernel, observed.api)
  } catch (error: unknown) {
    failed = true
    primary = error
  } finally {
    try {
      await kernel?.close()
      await rm(root, { recursive: true })
    } catch (error: unknown) {
      cleanupFailed = true
      cleanup = error
    }
  }
  if (failed && cleanupFailed)
    throw new AggregateError([primary, cleanup], 'Workflow fixture and cleanup failed', { cause: primary })
  if (failed) throw primary
  if (cleanupFailed) throw cleanup
}

test('unhydrated and hydrated metadata checkpoints are pure and do not count idle history as work', async () => {
  await fixture(async (runtime, kernel) => {
    expect(runtime.idleCheckpoint().supported).toBe(false)
    await runtime.restore()
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Missing actual workspace')
    const session = await kernel.createSession(workspace.id)
    await runtime.savePlan(session.id, 'Only a durable draft', [
      {
        id: 'item',
        title: 'One item',
        scope: { readPaths: ['.'], writePaths: [], tools: ['read_file'] },
        acceptanceChecks: [{ id: 'user', description: 'User checks', verifier: { kind: 'user' } }],
      },
    ])
    const before = await kernel.storage.call('session', session.id)
    for (let index = 0; index < 10; index++)
      expect(runtime.idleCheckpoint()).toEqual({
        supported: true,
        requests: 0,
        resources: 0,
        background: 0,
        unconfirmed: 0,
      })
    expect((await kernel.storage.call('session', session.id)).seq).toBe(before.seq)
  })
}, 20_000)

test('actual public session reads keep the serial lock busy until their reply settles', async () => {
  await fixture(async (_runtime, kernel, api) => {
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Missing actual workspace')
    const session = await kernel.createSession(workspace.id)
    let finish: (() => void) | undefined, signal: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      finish = resolve
    })
    const entered = new Promise<void>((resolve) => {
      signal = resolve
    })
    const observedApi: HbarAPI = {
      ...api,
      sessions: {
        ...api.sessions,
        get: async (id) => {
          const value = await api.sessions.get(id)
          signal?.()
          await gate
          return value
        },
      },
    }
    const runtime = new WorkflowRuntime(
      observedApi,
      api.service<GoalService>('goal'),
      api.service<AgentService>('agent'),
      workflowConfigSchema.parse({}),
      api.service<PlanService>('plan'),
      api.service<GitService>('git'),
    )
    await runtime.restore()
    const operation = runtime.savePlan(session.id, 'Draft', [
      {
        id: 'item',
        title: 'Item',
        scope: { readPaths: ['.'], writePaths: [], tools: ['read_file'] },
        acceptanceChecks: [{ id: 'user', description: 'User checks', verifier: { kind: 'user' } }],
      },
    ])
    const outcome = operation.then(
      () => undefined,
      () => undefined,
    )
    try {
      await Promise.race([
        entered,
        operation.then(() => {
          throw new Error('Workflow operation completed before entering the public read gate')
        }),
      ])
      expect(runtime.idleCheckpoint().background).toBeGreaterThan(0)
      expect(runtime.idleCheckpoint().background).toBeGreaterThan(0)
    } finally {
      finish?.()
      await outcome
    }
    await operation
    expect(runtime.idleCheckpoint().background).toBe(0)
  })
}, 20_000)

test('pending or rejected public hydration never advertises a supported empty domain', async () => {
  await fixture(async (_runtime, _kernel, api) => {
    let fail: ((reason: Error) => void) | undefined
    const gate = new Promise<never>((_resolve, reject) => {
      fail = reject
    })
    const observedApi: HbarAPI = { ...api, sessions: { ...api.sessions, list: () => gate } }
    const runtime = new WorkflowRuntime(
      observedApi,
      api.service<GoalService>('goal'),
      api.service<AgentService>('agent'),
      workflowConfigSchema.parse({}),
      api.service<PlanService>('plan'),
      api.service<GitService>('git'),
    )
    const restoration = runtime.restore()
    const outcome = restoration.then(
      () => undefined,
      () => undefined,
    )
    try {
      expect(runtime.idleCheckpoint().supported).toBe(false)
      fail?.(new Error('Controlled public hydration rejection'))
      await expect(restoration).rejects.toBeDefined()
      expect(runtime.idleCheckpoint().supported).toBe(false)
    } finally {
      fail?.(new Error('Fixture cleanup'))
      await outcome
    }
  })
}, 20_000)
