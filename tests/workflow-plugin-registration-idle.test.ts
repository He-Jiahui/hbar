import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { z } from 'zod'
import { runSchema } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { WorkflowRuntime, workflowPlugin } from '@hbar/workflow'
import { definePlugin, runtimePluginIdleCheckpointSchema } from '@hbar/plugin-sdk'
import type {
  RuntimePluginIdleRegistry,
  WorkflowService,
  PlanService,
  GoalService,
  ToolDefinition,
  ToolContext,
} from '@hbar/plugin-sdk'

type Reader = Parameters<RuntimePluginIdleRegistry['register']>[0]
async function fixture(action: (kernel: Kernel, read: Reader) => Promise<void>): Promise<void> {
  const prefix = 'hbar-workflow-registration-idle-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith(prefix))
    throw new Error('Unowned fixture TMP')
  let reader: Reader | undefined
  const observed = definePlugin({
    manifest: workflowPlugin.manifest,
    ...(workflowPlugin.configSchema === undefined ? {} : { configSchema: workflowPlugin.configSchema }),
    async apply(ctx, config) {
      const api = ctx.hbar.api,
        previous = api.runtimeIdle
      api.runtimeIdle = {
        register(read) {
          if (reader) throw new Error('Duplicate Workflow checkpoint registration')
          reader = read
          const unregister = () => {
            if (reader === read) reader = undefined
          }
          // Reload disposes this exact owner's effect before the successor may register.
          ctx.effect(() => unregister)
          return unregister
        },
      }
      // Complete production apply and default dependencies; only optional owner-local registry is supplied.
      try {
        await workflowPlugin.apply(ctx, config)
      } finally {
        if (previous === undefined) delete api.runtimeIdle
        else api.runtimeIdle = previous
      }
    },
  })
  let kernel: Kernel | undefined
  let failed = false,
    cleanupFailed = false
  let primary: unknown, cleanup: unknown
  try {
    kernel = await Kernel.create({
      home: join(root, 'data'),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      lifecycle: 'managed',
      profile: { replacements: { 'workflow.focus': observed } },
    })
    kernel.beginDrain()
    await kernel.createWorkspace(root)
    await kernel.changePlugin('goal.codex', true, { autoContinue: false, maxContinuations: 0 })
    if (!reader) throw new Error('Production Workflow apply did not register its checkpoint')
    await action(kernel, reader)
  } catch (error: unknown) {
    failed = true
    primary = error
  } finally {
    try {
      await kernel?.close()
      await rm(target, { recursive: true })
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

const item = {
  id: 'proof',
  title: 'Verify proof',
  scope: { readPaths: ['proof.txt'], writePaths: ['proof.txt'], tools: ['read_file', 'write_file'] },
  acceptanceChecks: [
    {
      id: 'readback',
      description: 'Read proof',
      verifier: {
        kind: 'tool' as const,
        toolName: 'read_file',
        result: { kind: 'textContains' as const, value: 'verified proof' },
      },
    },
  ],
}
const write: ToolDefinition = {
  name: 'write_file',
  description: 'Logical admission fixture',
  effect: 'write',
  inputSchema: z.object({ path: z.string() }),
  workspaceAccess: { kind: 'paths', arguments: [{ field: 'path', access: 'write' }] },
  execute: async () => ({ text: 'written' }),
}
function wire(context: ToolContext): ToolContext {
  const { signal, ...value } = context
  return { ...structuredClone(value), signal }
}

test('complete Workflow plugin apply registers a pure checkpoint beside its working public service', async () => {
  await fixture(async (kernel, read) => {
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Missing actual workspace')
    const session = await kernel.createSession(workspace.id)
    const workflows = kernel.plugins.get<WorkflowService>('workflow')
    const saved = await workflows.savePlan(session.id, 'Durable draft only', [item])
    const before = await kernel.storage.call('session', session.id)
    for (let index = 0; index < 5; index++)
      expect(runtimePluginIdleCheckpointSchema.parse(read())).toEqual({
        supported: true,
        requests: 0,
        resources: 0,
        background: 0,
        unconfirmed: 0,
      })
    expect((await kernel.storage.call('session', session.id)).seq).toBe(before.seq)
    expect(await workflows.get(session.id)).toEqual(saved)
  })
}, 20_000)

test('registered Workflow checkpoint retains logical tool admission and pending mutation until exact hook settlement', async () => {
  await fixture(async (kernel, read) => {
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Missing actual workspace')
    const session = await kernel.createSession(workspace.id)
    const workflows = kernel.plugins.get<WorkflowService>('workflow')
    if (!(workflows instanceof WorkflowRuntime)) throw new Error('Expected actual local Workflow runtime')
    await kernel.plugins.get<GoalService>('goal').create(session.id, 'Verify admitted proof')
    const plan = await kernel.plugins
      .get<PlanService>('plan')
      .update(session.id, [{ step: item.title, status: 'in_progress' }])
    await workflows.focus(session.id, 0, item, 'user', plan.revision)
    // Public logical hook context only: not a submitted/physically running Run or native-exit proof.
    const run = runSchema.parse({
      id: 'logical-run',
      sessionId: session.id,
      requestId: 'logical-request',
      input: { text: 'fixture', images: [] },
      modelId: 'local-fixture',
      status: 'running',
      createdAt: 1,
      startedAt: 1,
      endedAt: null,
      error: null,
    })
    const context: ToolContext = {
      session,
      workspace,
      run,
      callId: 'logical-write',
      signal: new AbortController().signal,
    }
    const args = { path: 'proof.txt' }
    await workflows.beforeTool(write.name, args, wire(context), write)
    expect(runtimePluginIdleCheckpointSchema.parse(read()).resources).toBe(1)
    await workflows.beginTool(write.name, args, wire(context), write)
    expect(runtimePluginIdleCheckpointSchema.parse(read()).background).toBeGreaterThan(0)
    const before = await kernel.storage.call('session', session.id)
    for (let index = 0; index < 5; index++) {
      const checkpoint = runtimePluginIdleCheckpointSchema.parse(read())
      expect(checkpoint.resources).toBe(1)
      expect(checkpoint.background).toBeGreaterThan(0)
    }
    expect((await kernel.storage.call('session', session.id)).seq).toBe(before.seq)
    await workflows.settleTool(
      write.name,
      { path: 'different.txt' },
      { text: 'wrong settlement' },
      wire(context),
      write,
    )
    expect(runtimePluginIdleCheckpointSchema.parse(read()).resources).toBe(1)
    expect(runtimePluginIdleCheckpointSchema.parse(read()).background).toBeGreaterThan(0)
    await workflows.settleTool(write.name, args, { text: 'written' }, wire(context), write)
    const settled = runtimePluginIdleCheckpointSchema.parse(read())
    expect(settled.resources).toBe(0)
    expect(settled.background).toBe(0)
    await workflows.beforeTool(write.name, args, wire({ ...context, callId: 'abandoned' }), write)
    expect(runtimePluginIdleCheckpointSchema.parse(read()).resources).toBe(1)
    await workflows.settleTargetRun({
      sessionId: session.id,
      runId: run.id,
      run: { ...run, status: 'cancelled' },
      status: 'cancelled',
    })
    expect(runtimePluginIdleCheckpointSchema.parse(read()).resources).toBe(0)
  })
}, 20_000)
