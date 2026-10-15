import { createPathLayout, ensurePathLayout, StableStoragePort, Storage, STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import type { SessionEventPage } from '@hbar/contracts'
import type { StorageMethods } from '@hbar/storage'
import type { RuntimeOwner } from '@hbar/contracts/runtime'
import { expect, test } from 'bun:test'
import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { IpcPeer, ManagedProcess, RuntimeArtifactStore, RuntimeCoordinator, RuntimeValuePort } from '@hbar/runtime'
import { runtimePluginStateSchema, type RuntimePluginState } from '@hbar/plugin-sdk/runtime-plugin'
import { PLUGIN_RUNTIME_FINGERPRINT, RUNTIME_PLUGIN_CONTROL_METHODS, runtimePluginResultSchema } from '../apps/host/src/runtime-plugin-contract'
import { RuntimePluginRelay } from '../apps/host/src/runtime-plugin-relay'

test('an owned Bun plugin prepares without writes, validates and executes locally, and preserves the original commit callback scope', async () => {
  const root = await mkdtemp(join(process.cwd(), 'artifacts', 'runtime-plugin-owner-'))
  const marker = join(root, 'effect.txt'), source = join(root, 'plugin.ts')
  await writeFile(source, `
    import { z } from 'zod'
    import { readFile, writeFile } from 'node:fs/promises'
    import { definePlugin, provide } from '@hbar/plugin-sdk'
    import { createRuntimePlugin } from '../../apps/host/src/runtime-plugin-process'
    const plugin = definePlugin({ manifest: { id: 'owned.fixture', name: 'Owned fixture', description: 'Process boundary verification', version: '1.0.0', apiVersion: '^1.0.0', scope: 'host', provides: { budget: '1.0.0', execution: '1.0.0' }, permissions: [] },
      configSchema: z.object({ limit: z.number().int().positive().default(9) }),
      apply(ctx, config) {
        provide(ctx, 'budget', { get: async sessionId => ({ pid: process.pid, session: await ctx.hbar.api.sessions.get(sessionId), page: await ctx.hbar.api.sessions.readEventPage({ sessionId, afterSeq: 0, types: ['automation.changed'], limit: 5, maxReplyBytes: 1024 }), limit: config.limit }) })
        provide(ctx, 'execution', { readBytes: async () => readFile(${JSON.stringify(join(root, 'missing-private.txt'))}) })
        ctx.hbar.api.tools.register({ name: 'owned_write', description: 'Write once inside the owner', effect: 'write', inputSchema: z.object({ count: z.number().int().positive().default(7) }),
          execute: async (args, c) => { await writeFile(${JSON.stringify(marker)}, String(args.count)); return { text: 'owned:' + process.pid, details: { osConfinement: c.osConfinement, nodeAuthority: c.nodeAuthority } } } })
        ctx.hbar.api.hooks.on('goal.beforeComplete', value => ({ ...value, commit: async () => { await value.commit() } }))
        ctx.hbar.api.hooks.on('tool.admitting', value => {
          if (value.args.count === 13) throw new Error('Final admission fixture rejected the call')
          return { ...value, args: { count: 99 } }
        })
      } })
    export const create = context => createRuntimePlugin(context, { plugins: [plugin] })
  `)
  const descriptor = { id: 'plugin.fixture', kind: 'plugin' as const, isolation: 'process' as const, dependencies: [], required: true, reloadable: true,
    contractFingerprint: PLUGIN_RUNTIME_FINGERPRINT, storageSchema: STORAGE_SCHEMA_VERSION }
  const artifacts = new RuntimeArtifactStore(join(root, 'bundles'), process.cwd())
  const artifact = await artifacts.build({ descriptor, entrypoint: source })
  expect(artifact.inputs).not.toContain('packages/kernel/src/index.ts')
  let application: RuntimeValuePort | undefined
  let readState: (() => Promise<RuntimePluginState>) | undefined
  const processOwner = new ManagedProcess({ descriptor, artifactId: artifact.id, generation: 1, modulePath: await artifacts.modulePath(artifact.id),
    configuration: { dataRoot: root, cacheRoot: join(root, 'cache') }, parent: { unitId: 'base', generation: 1, incarnation: 'plugin-fixture-base' },
    controlMethods: RUNTIME_PLUGIN_CONTROL_METHODS,
    onPeer: peer => {
      readState = () => peer.call('plugin.state', undefined, runtimePluginStateSchema)
      application = new RuntimeValuePort(peer, { prefix: 'plugin.application' }); application.register('host.read', () => { throw new Error('The fixture did not declare preparation reads') })
    } })
  try {
    await processOwner.prepare()
    const port = application
    if (!port || !readState) throw new Error('The owned application port was not registered')
    const state = await readState()
    expect(state.config).toEqual({ limit: 9 }); expect(state.tools[0]?.inputSchema).toMatchObject({ type: 'object' })
    expect(await Bun.file(marker).exists()).toBe(false)
    const rejected: unknown = await port.call('invoke', [{ operation: 'validate', name: 'owned_write', catalog: [] }, [{}], async () => null]).catch((error: unknown) => error)
    expect(rejected).toMatchObject({ code: 'RUNTIME_PREPARING' })
    await processOwner.activate()
    const host = async (method: string, args: readonly unknown[]) => {
      if (method === 'sessions.get') return { id: z.string().parse(args[0]) }
      if (method === 'sessions.readEventPage') {
        const input = z.object({ sessionId: z.string(), afterSeq: z.number(), types: z.array(z.string()) }).parse(args[0])
        expect(input).toMatchObject({ sessionId: 'session', afterSeq: 0, types: ['automation.changed'] })
        return { sessionId: input.sessionId, afterSeq: 0, throughSeq: 0, totalEventCount: 0,
          remainingEventCount: 0, matchingEventCount: 0, items: [], nextAfterSeq: 0, hasMore: false }
      }
      throw new Error('Unexpected fixture API method: ' + method)
    }
    const missingFile = runtimePluginResultSchema.parse(await port.call('invoke', [
      { operation: 'capability', name: 'execution', method: 'readBytes', catalog: state.tools }, [root, 'missing-private.txt'], host,
    ]))
    expect(missingFile).toMatchObject({ kind: 'error', code: 'ENOENT' })
    expect(JSON.stringify(missingFile)).not.toContain(root)
    const validation = runtimePluginResultSchema.parse(await port.call('invoke', [{ operation: 'validate', name: 'owned_write', catalog: state.tools }, [{}], host]))
    expect(validation).toEqual({ kind: 'value', value: { count: 7 } })
    const capability = runtimePluginResultSchema.parse(await port.call('invoke', [{ operation: 'capability', name: 'budget', method: 'get', catalog: state.tools }, ['session'], host]))
    expect(capability).toMatchObject({ kind: 'value', value: { pid: processOwner.snapshot().pid, limit: 9, session: { id: 'session' }, page: { sessionId: 'session', afterSeq: 0, throughSeq: 0, items: [], hasMore: false } } })
    expect(processOwner.snapshot().pid).not.toBe(process.pid)
    const sandbox = { profileId: ':read-only', digest: 'b'.repeat(64) }
    const nodeAuthority = { sessionId: 'session', runId: 'run', callId: 'owned-call', sandbox, admission: { kind: 'approved', approvalId: 'approval' } }
    const toolContext = { signal: new AbortController().signal, callId: 'owned-call',
        session: { id: 'session', workspaceId: 'workspace', title: 'Fixture', archived: false, parentId: null, createdAt: 1, updatedAt: 1, seq: 0 },
        workspace: { id: 'workspace', path: root, name: 'Fixture', createdAt: 1 },
        run: { id: 'run', sessionId: 'session', requestId: 'request', input: { text: '', images: [], approval: 'sandbox', sandbox }, modelId: 'model', status: 'running', createdAt: 1, startedAt: 1, endedAt: null, error: null },
        nodeAuthority,
        osConfinement: { level: 'elevated', writableRoots: [root], readableRoots: [root], networkEnabled: false, envOverrides: { LANG: 'C' } } }
    const admitted = runtimePluginResultSchema.parse(await port.call('invoke', [
      { operation: 'hook', name: 'tool.admitting', catalog: state.tools },
      [{ name: 'owned_write', args: { count: 7 }, context: toolContext, tool: state.tools[0] }], host,
    ]))
    expect(admitted).toMatchObject({ kind: 'value', value: { args: { count: 99 } } })
    const resolvedTool = { ...state.tools[0], effect: 'process', commandArgument: 'command' }
    const resolvedAdmission = runtimePluginResultSchema.parse(await port.call('invoke', [
      { operation: 'hook', name: 'tool.admitting', catalog: [resolvedTool] },
      [{ name: 'owned_write', args: { count: 7, command: 'echo approved' }, context: toolContext, tool: resolvedTool }], host,
    ]))
    expect(resolvedAdmission).toMatchObject({ kind: 'value', value: { tool: { effect: 'process', commandArgument: 'command' } } })
    const admissionDenied = runtimePluginResultSchema.parse(await port.call('invoke', [
      { operation: 'hook', name: 'tool.admitting', catalog: state.tools },
      [{ name: 'owned_write', args: { count: 13 }, context: toolContext, tool: state.tools[0] }], host,
    ]))
    expect(admissionDenied.kind).toBe('error')
    const executed = runtimePluginResultSchema.parse(await port.call('invoke', [{ operation: 'execute', name: 'owned_write', catalog: state.tools },
      [{ count: 7 }, toolContext], host]))
    expect(executed.kind).toBe('value'); expect(await readFile(marker, 'utf8')).toBe('7')
    expect(executed).toMatchObject({ kind: 'value', value: { details: { osConfinement: {
      level: 'elevated', writableRoots: [root], readableRoots: [root], networkEnabled: false, envOverrides: { LANG: 'C' },
    } } } })
    expect(executed).toMatchObject({ kind: 'value', value: { details: { nodeAuthority } } })
    for (const invalidAuthority of [
      { ...nodeAuthority, callId: 'other-call' },
      { ...nodeAuthority, runId: 'other-run' },
      { ...nodeAuthority, sandbox: { profileId: ':read-only', digest: 'a'.repeat(64) } },
      { ...nodeAuthority, sandbox: null },
    ]) {
      const invalid = runtimePluginResultSchema.parse(await port.call('invoke', [{ operation: 'execute', name: 'owned_write', catalog: state.tools },
        [{ count: 99 }, { ...toolContext, nodeAuthority: invalidAuthority }], host]))
      expect(invalid).toMatchObject({ kind: 'error', code: 'INVALID_TOOL_INPUT' })
      expect(await readFile(marker, 'utf8')).toBe('7')
    }
    const authority = new AsyncLocalStorage<string>(); let committed = 0
    const complete = await authority.run('original-execution-lease', () => port.call('invoke', [{ operation: 'commitGoal', name: 'goal.beforeComplete', catalog: state.tools },
      [{ sessionId: 'session', runId: 'run', goal: {}, commit: () => { expect(authority.getStore()).toBe('original-execution-lease'); committed++ } }], host]))
    expect(runtimePluginResultSchema.parse(complete).kind).toBe('value'); expect(committed).toBe(1)
    const forbidden = runtimePluginResultSchema.parse(await port.call('invoke', [{ operation: 'capability', name: 'budget', method: 'dispose', catalog: state.tools }, [], host]))
    expect(forbidden).toMatchObject({ kind: 'error', code: 'RUNTIME_METHOD_UNAVAILABLE' })
    expect(port.snapshot().callbacks).toBe(0)
  } finally { await processOwner.dispose(); application?.dispose(); await rm(root, { recursive: true, force: true }) }
}, 30_000)

test('the Host plugin relay validates and forwards event-page reads to the actual Storage Worker', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-runtime-plugin-event-page-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  await ensurePathLayout(layout)
  const storage = new Storage(layout.database, layout)
  const stable = new StableStoragePort()
  const storageOwner: RuntimeOwner = { unitId: 'storage', generation: 1, incarnation: 'event-page-storage-owner' }
  const pluginOwner: RuntimeOwner = { unitId: 'plugin.fixture', generation: 1, incarnation: 'event-page-plugin-owner' }
  const hostOwner: RuntimeOwner = { unitId: 'host', generation: 1, incarnation: 'event-page-host-owner' }
  let hostPeer: IpcPeer | undefined
  const pluginPeer = new IpcPeer({
    owner: pluginOwner,
    remote: hostOwner,
    transport: { send: (frame) => hostPeer?.receive(frame) },
  })
  hostPeer = new IpcPeer({
    owner: hostOwner,
    remote: pluginOwner,
    transport: { send: (frame) => pluginPeer.receive(frame) },
  })
  let relay: RuntimePluginRelay | undefined
  let attached: ReturnType<RuntimePluginRelay['attachPlugin']> | undefined
  let application: RuntimeValuePort | undefined
  try {
    await storage.call('ready')
    const workspace = await storage.call('createWorkspace', root, 'Event page relay')
    const session = await storage.call('createSession', workspace.id, 'Event page fixture')
    stable.install({
      owner: storageOwner,
      call<K extends keyof StorageMethods>(method: K, args: Parameters<StorageMethods[K]>) {
        return storage.call(method, ...args)
      },
      retire: async () => {},
    })
    const coordinator = new RuntimeCoordinator({
      claim: async (lease) => lease,
      release: async () => {},
      revoke: async () => {},
    })
    coordinator.register(
      pluginOwner,
      { unitId: pluginOwner.unitId, generation: pluginOwner.generation, artifactId: 'a'.repeat(64) },
      {
        id: pluginOwner.unitId,
        kind: 'plugin',
        isolation: 'process',
        dependencies: [],
        required: true,
        reloadable: true,
        contractFingerprint: PLUGIN_RUNTIME_FINGERPRINT,
        storageSchema: STORAGE_SCHEMA_VERSION,
      },
    )
    relay = new RuntimePluginRelay({
      storage: stable,
      coordinator,
      current: () => [],
      resolve: () => {
        throw new Error('No endpoint resolution is expected in a Host read')
      },
    })
    attached = relay.attachPlugin(hostPeer, pluginOwner)
    application = new RuntimeValuePort(pluginPeer, { prefix: 'plugin.application' })
    const page = await application.call<SessionEventPage>('host.read', [
      'sessions.readEventPage',
      [
        {
          sessionId: session.id,
          afterSeq: 0,
          types: ['session.created'],
          limit: 10,
          maxReplyBytes: 4_096,
        },
      ],
    ])
    expect(page).toMatchObject({
      sessionId: session.id,
      afterSeq: 0,
      throughSeq: 1,
      items: [{ kind: 'event', event: { sessionId: session.id, type: 'session.created', seq: 1 } }],
      nextAfterSeq: 1,
      hasMore: false,
    })
    expect(stable.snapshot()).toMatchObject({ phase: 'serving', owner: storageOwner, inFlight: 0, queued: 0 })
  } finally {
    attached?.dispose()
    application?.dispose()
    hostPeer?.close()
    pluginPeer.close()
    await stable.close()
    await storage.close()
    await rm(root, { recursive: true, force: true })
  }
})
