import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { runSchema, workflowSnapshotSchema } from '@hbar/contracts'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { ManagedProcess, RuntimeArtifactStore, RuntimeValuePort } from '@hbar/runtime'
import { describeRuntimeHook, describeRuntimeTool, runtimePluginStateSchema } from '@hbar/plugin-sdk/runtime-plugin'
import type { RuntimePluginState } from '@hbar/plugin-sdk/runtime-plugin'
import {
  PLUGIN_RUNTIME_FINGERPRINT,
  RUNTIME_PLUGIN_CONTROL_METHODS,
  runtimePluginResultSchema,
} from '../apps/host/src/runtime-plugin-contract'
import type { GoalService, PlanService, ToolContext, ToolDefinition, WorkflowService } from '@hbar/plugin-sdk'
import { WorkflowRuntime } from '../plugins/workflow/src/index'

const resources: { root: string; kernel: Kernel }[] = []
afterEach(async () => {
  const failures: unknown[] = []
  for (const { root, kernel } of resources.splice(0)) {
    try {
      await kernel.close()
    } catch (error) {
      failures.push(error)
    }
    try {
      await rm(root, { recursive: true, force: true })
    } catch (error) {
      failures.push(error)
    }
  }
  if (failures.length) throw new AggregateError(failures, 'Workflow admission fixture cleanup failed')
})

const readTool: ToolDefinition = {
  name: 'read_file',
  description: 'Admission fixture read',
  effect: 'read',
  inputSchema: z.object({ path: z.string() }),
  workspaceAccess: { kind: 'paths', arguments: [{ field: 'path', access: 'read' }] },
  execute: async () => ({ text: 'verified proof' }),
}
const writeTool: ToolDefinition = {
  ...readTool,
  name: 'write_file',
  effect: 'write',
  workspaceAccess: { kind: 'paths', arguments: [{ field: 'path', access: 'write' }] },
}
const item = {
  id: 'proof',
  title: 'Verify proof',
  scope: { readPaths: ['proof.txt'], writePaths: ['proof.txt'], tools: ['read_file', 'write_file'] },
  acceptanceChecks: [
    {
      id: 'readback',
      description: 'Read the proof',
      verifier: {
        kind: 'tool' as const,
        toolName: 'read_file',
        result: { kind: 'textContains' as const, value: 'verified proof' },
      },
    },
  ],
}

/** Separate serialization at each stage reproduces owned plugin hook RPC identity. */
function wire(context: ToolContext): ToolContext {
  const { signal, ...value } = context
  return { ...structuredClone(value), signal }
}
async function rejection(operation: Promise<unknown>) {
  try {
    await operation
  } catch (error) {
    return error
  }
  throw new Error('Expected workflow admission rejection')
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-workflow-admission-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, kernel })
  await kernel.changePlugin('goal.codex', true, { autoContinue: false, maxContinuations: 0 })
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Fixture workspace missing')
  const session = await kernel.createSession(workspace.id)
  const plans = kernel.plugins.get<PlanService>('plan')
  const goals = kernel.plugins.get<GoalService>('goal')
  const runtime = kernel.plugins.get<WorkflowService>('workflow')
  if (!(runtime instanceof WorkflowRuntime)) throw new Error('Fixture requires the concrete local workflow runtime')
  await goals.create(session.id, 'Verify admitted tools')
  const plan = await plans.update(session.id, [{ step: item.title, status: 'in_progress' }])
  const focus = () => runtime.focus(session.id, 0, item, 'user', plan.revision)
  await focus()
  const run = runSchema.parse({
    id: 'run',
    sessionId: session.id,
    requestId: 'request',
    input: { text: 'fixture', images: [] },
    modelId: 'local-fixture',
    status: 'running',
    createdAt: 1,
    startedAt: 1,
    endedAt: null,
    error: null,
  })
  const context: ToolContext = { session, workspace, run, callId: 'call', signal: new AbortController().signal }
  return { root, kernel, plans, goals, plan, runtime, context, focus }
}
const args = { path: 'proof.txt' }

async function firstCheck(runtime: WorkflowService, sessionId: string) {
  const check = (await runtime.get(sessionId)).workflow?.focus?.acceptanceChecks[0]
  if (!check) throw new Error('Fixture workflow check missing')
  return check
}

test('serialized admission executes reads and writes and retains settled verification evidence', async () => {
  const { runtime, context } = await fixture()
  for (const tool of [writeTool, readTool]) {
    const call = { ...context, callId: tool.name }
    await runtime.beforeTool(tool.name, args, wire(call), tool)
    await runtime.beginTool(tool.name, args, wire(call), tool)
    await runtime.settleTool(tool.name, args, { text: 'verified proof' }, wire(call), tool)
  }
  expect((await firstCheck(runtime, context.session.id)).status).toBe('passed')
  expect(
    await rejection(runtime.beginTool(readTool.name, args, wire({ ...context, callId: readTool.name }), readTool)),
  ).toMatchObject({ code: 'WORKFLOW_REVISION_CONFLICT' })
})

test('same call ID cannot borrow another session, run, workspace, tool or argument admission', async () => {
  const { runtime, context } = await fixture()
  await runtime.beforeTool(readTool.name, args, wire(context), readTool)
  const altered = [
    { ...wire(context), session: { ...context.session, id: 'other-session' } },
    { ...wire(context), run: { ...context.run, id: 'other-run' } },
    { ...wire(context), workspace: { ...context.workspace, id: 'other-workspace' } },
    { ...wire(context), workspace: { ...context.workspace, path: context.workspace.path + '/other' } },
  ]
  for (const candidate of altered)
    expect(await rejection(runtime.beginTool(readTool.name, args, candidate, readTool))).toMatchObject({
      code: 'WORKFLOW_REVISION_CONFLICT',
    })
  expect(await rejection(runtime.beginTool(writeTool.name, args, wire(context), writeTool))).toMatchObject({
    code: 'WORKFLOW_REVISION_CONFLICT',
  })
  expect(
    await rejection(runtime.beginTool(readTool.name, { path: 'other.txt' }, wire(context), readTool)),
  ).toMatchObject({ code: 'WORKFLOW_REVISION_CONFLICT' })
  // A mismatched settlement must not consume the real call's admission.
  await runtime.settleTool(readTool.name, { path: 'other.txt' }, { text: 'verified proof' }, wire(context), readTool)
  await runtime.beginTool(readTool.name, args, wire(context), readTool)
  expect(await rejection(runtime.beginTool(readTool.name, args, wire(context), readTool))).toMatchObject({
    code: 'WORKFLOW_TOOL_IN_FLIGHT',
  })
  await runtime.settleTool(readTool.name, args, { text: 'verified proof' }, wire(context), readTool)
  expect((await firstCheck(runtime, context.session.id)).status).toBe('passed')
})

test('denial and replaced focus do not grant execution and terminal Run releases abandoned admissions', async () => {
  const { runtime, context, focus } = await fixture()
  expect(
    await rejection(runtime.beforeTool(readTool.name, { path: 'outside.txt' }, wire(context), readTool)),
  ).toMatchObject({ code: 'WORKFLOW_SCOPE_REQUIRED' })
  expect(await rejection(runtime.beginTool(readTool.name, args, wire(context), readTool))).toMatchObject({
    code: 'WORKFLOW_REVISION_CONFLICT',
  })
  await runtime.beforeTool(readTool.name, args, wire(context), readTool)
  await focus()
  expect(await rejection(runtime.beginTool(readTool.name, args, wire(context), readTool))).toMatchObject({
    code: 'WORKFLOW_REVISION_CONFLICT',
  })
  await runtime.settleTargetRun({
    sessionId: context.session.id,
    runId: context.run.id,
    run: { ...context.run, status: 'cancelled' },
    status: 'cancelled',
  })
  // Released capacity permits a fresh admission; no old focus token is reused.
  await runtime.beforeTool(readTool.name, args, wire(context), readTool)
  await runtime.beginTool(readTool.name, args, wire(context), readTool)
  await runtime.settleTool(readTool.name, args, { text: 'verified proof' }, wire(context), readTool)
})

test('bounded admission capacity rejects without evicting active calls and recovers on Run end', async () => {
  const { runtime, context } = await fixture()
  for (let index = 0; index < 4096; index++)
    await runtime.beforeTool(writeTool.name, args, wire({ ...context, callId: `pending-${index}` }), writeTool)
  expect(await rejection(runtime.beforeTool(writeTool.name, args, wire(context), writeTool))).toMatchObject({
    code: 'WORKFLOW_TOOL_IN_FLIGHT',
  })
  const admitted = wire({ ...context, callId: 'pending-0' })
  await runtime.beginTool(writeTool.name, args, admitted, writeTool)
  await runtime.settleTool(writeTool.name, args, { text: 'written' }, wire(admitted), writeTool)
  await runtime.beforeTool(writeTool.name, args, wire(context), writeTool)
  await runtime.settleTargetRun({
    sessionId: context.session.id,
    runId: context.run.id,
    run: { ...context.run, status: 'cancelled' },
    status: 'cancelled',
  })
  await runtime.beforeTool(writeTool.name, args, wire(context), writeTool)
}, 60_000)

test('owned workflow plugin preserves admission and verification across actual process hook RPCs', async () => {
  const { kernel, plans, goals, plan, context } = await fixture()
  const ownerRoot = await mkdtemp(join(process.cwd(), 'artifacts', 'workflow-admission-owner-'))
  const source = join(ownerRoot, 'plugin.ts')
  await writeFile(
    source,
    `
    import { workflowPlugin } from '../../plugins/workflow/src/index'
    import { createRuntimePlugin } from '../../apps/host/src/runtime-plugin-process'
    export const create = context => createRuntimePlugin(context, { plugins: [workflowPlugin] })
  `,
  )
  const host = async (method: string, values: readonly unknown[]): Promise<unknown> => {
    if (method === 'sessions.list') return []
    if (method === 'sessions.get') return kernel.storage.call('session', z.string().parse(values[0]))
    if (method === 'service.plan.get') return plans.get(z.string().parse(values[0]))
    if (method === 'service.goal.get') return goals.get(z.string().parse(values[0]))
    if (method === 'sessions.append')
      return kernel.append(
        z.string().parse(values[0]),
        z.string().parse(values[1]),
        values[2],
        z.string().optional().parse(values[3]),
      )
    if (method === 'sessions.wake' || method === 'notify' || method === 'changed') return undefined
    throw new Error(`Unexpected owned workflow fixture callback: ${method}`)
  }
  const descriptor = {
    id: 'plugin.workflow-admission-fixture',
    kind: 'plugin' as const,
    isolation: 'process' as const,
    dependencies: [],
    required: true,
    reloadable: true,
    contractFingerprint: PLUGIN_RUNTIME_FINGERPRINT,
    storageSchema: STORAGE_SCHEMA_VERSION,
  }
  const artifacts = new RuntimeArtifactStore(join(ownerRoot, 'bundles'), process.cwd())
  let application: RuntimeValuePort | undefined
  let readState: (() => Promise<RuntimePluginState>) | undefined
  let owner: ManagedProcess | undefined
  try {
    const artifact = await artifacts.build({ descriptor, entrypoint: source })
    owner = new ManagedProcess({
      descriptor,
      artifactId: artifact.id,
      generation: 1,
      modulePath: await artifacts.modulePath(artifact.id),
      configuration: { dataRoot: ownerRoot, cacheRoot: join(ownerRoot, 'cache') },
      parent: { unitId: 'base', generation: 1, incarnation: 'workflow-admission-base' },
      controlMethods: RUNTIME_PLUGIN_CONTROL_METHODS,
      onPeer: (peer) => {
        readState = () => peer.call('plugin.state', undefined, runtimePluginStateSchema)
        application = new RuntimeValuePort(peer, { prefix: 'plugin.application' })
        application.register('host.read', (values) =>
          host(z.string().parse(values[0]), z.array(z.unknown()).parse(values[1])),
        )
      },
    })
    await owner.prepare()
    await owner.activate()
    const port = application
    if (!port || !readState) throw new Error('Owned workflow fixture port missing')
    const state = await readState()
    expect(owner.snapshot().pid).not.toBe(process.pid)
    const catalog = [...state.tools, describeRuntimeTool(readTool), describeRuntimeTool(writeTool)]
    const invoke = async (request: Record<string, unknown>, values: readonly unknown[]) => {
      const result = runtimePluginResultSchema.parse(await port.call('invoke', [{ ...request, catalog }, values, host]))
      if (result.kind !== 'value') throw new Error(JSON.stringify(result))
      return result.value
    }
    await invoke({ operation: 'capability', name: 'workflow', method: 'focus' }, [
      context.session.id,
      0,
      item,
      'user',
      plan.revision,
    ])
    for (const tool of [writeTool, readTool]) {
      const call = { ...context, callId: `owned-${tool.name}` }
      for (const event of ['tool.before', 'tool.executing'] as const)
        await invoke({ operation: 'hook', name: event }, [
          describeRuntimeHook(event, { name: tool.name, args, context: wire(call), tool }),
        ])
      await invoke({ operation: 'hook', name: 'tool.settled' }, [
        describeRuntimeHook('tool.settled', {
          name: tool.name,
          args,
          context: wire(call),
          tool,
          result: { text: 'verified proof' },
        }),
      ])
    }
    const result = workflowSnapshotSchema.parse(
      await invoke({ operation: 'capability', name: 'workflow', method: 'get' }, [context.session.id]),
    )
    expect(result.workflow?.focus?.acceptanceChecks[0]?.status).toBe('passed')
    expect(port.snapshot().callbacks).toBe(0)
  } finally {
    try {
      await owner?.dispose()
    } finally {
      application?.dispose()
      await rm(ownerRoot, { recursive: true, force: true })
    }
  }
}, 60_000)
