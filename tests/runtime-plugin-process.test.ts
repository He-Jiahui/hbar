import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { expect, test } from 'bun:test'
import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { ManagedProcess, RuntimeArtifactStore, RuntimeValuePort } from '@hbar/runtime'
import { runtimePluginStateSchema, type RuntimePluginState } from '@hbar/plugin-sdk/runtime-plugin'
import { PLUGIN_RUNTIME_FINGERPRINT, RUNTIME_PLUGIN_CONTROL_METHODS, runtimePluginResultSchema } from '../apps/host/src/runtime-plugin-contract'

test('an owned Bun plugin prepares without writes, validates and executes locally, and preserves the original commit callback scope', async () => {
  const root = await mkdtemp(join(process.cwd(), 'artifacts', 'runtime-plugin-owner-'))
  const marker = join(root, 'effect.txt'), source = join(root, 'plugin.ts')
  await writeFile(source, `
    import { z } from 'zod'
    import { writeFile } from 'node:fs/promises'
    import { definePlugin, provide } from '@hbar/plugin-sdk'
    import { createRuntimePlugin } from '../../apps/host/src/runtime-plugin-process'
    const plugin = definePlugin({ manifest: { id: 'owned.fixture', name: 'Owned fixture', description: 'Process boundary verification', version: '1.0.0', apiVersion: '^1.0.0', scope: 'host', provides: { budget: '1.0.0' }, permissions: [] },
      configSchema: z.object({ limit: z.number().int().positive().default(9) }),
      apply(ctx, config) {
        provide(ctx, 'budget', { get: async sessionId => ({ pid: process.pid, session: await ctx.hbar.api.sessions.get(sessionId), limit: config.limit }) })
        ctx.hbar.api.tools.register({ name: 'owned_write', description: 'Write once inside the owner', effect: 'write', inputSchema: z.object({ count: z.number().int().positive().default(7) }),
          execute: async args => { await writeFile(${JSON.stringify(marker)}, String(args.count)); return { text: 'owned:' + process.pid } } })
        ctx.hbar.api.hooks.on('goal.beforeComplete', value => ({ ...value, commit: async () => { await value.commit() } }))
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
      if (method !== 'sessions.get') throw new Error('Unexpected fixture API method')
      return { id: z.string().parse(args[0]) }
    }
    const validation = runtimePluginResultSchema.parse(await port.call('invoke', [{ operation: 'validate', name: 'owned_write', catalog: state.tools }, [{}], host]))
    expect(validation).toEqual({ kind: 'value', value: { count: 7 } })
    const capability = runtimePluginResultSchema.parse(await port.call('invoke', [{ operation: 'capability', name: 'budget', method: 'get', catalog: state.tools }, ['session'], host]))
    expect(capability).toMatchObject({ kind: 'value', value: { pid: processOwner.snapshot().pid, limit: 9, session: { id: 'session' } } })
    expect(processOwner.snapshot().pid).not.toBe(process.pid)
    const executed = runtimePluginResultSchema.parse(await port.call('invoke', [{ operation: 'execute', name: 'owned_write', catalog: state.tools },
      [{ count: 7 }, { signal: new AbortController().signal, callId: 'owned-call',
        session: { id: 'session', workspaceId: 'workspace', title: 'Fixture', archived: false, parentId: null, createdAt: 1, updatedAt: 1, seq: 0 },
        workspace: { id: 'workspace', path: root, name: 'Fixture', createdAt: 1 },
        run: { id: 'run', sessionId: 'session', requestId: 'request', input: { text: '', images: [] }, modelId: 'model', status: 'running', createdAt: 1, startedAt: 1, endedAt: null, error: null } }], host]))
    expect(executed.kind).toBe('value'); expect(await readFile(marker, 'utf8')).toBe('7')
    const authority = new AsyncLocalStorage<string>(); let committed = 0
    const complete = await authority.run('original-execution-lease', () => port.call('invoke', [{ operation: 'commitGoal', name: 'goal.beforeComplete', catalog: state.tools },
      [{ sessionId: 'session', runId: 'run', goal: {}, commit: () => { expect(authority.getStore()).toBe('original-execution-lease'); committed++ } }], host]))
    expect(runtimePluginResultSchema.parse(complete).kind).toBe('value'); expect(committed).toBe(1)
    const forbidden = runtimePluginResultSchema.parse(await port.call('invoke', [{ operation: 'capability', name: 'budget', method: 'dispose', catalog: state.tools }, [], host]))
    expect(forbidden).toMatchObject({ kind: 'error', code: 'RUNTIME_METHOD_UNAVAILABLE' })
    expect(port.snapshot().callbacks).toBe(0)
  } finally { await processOwner.dispose(); application?.dispose(); await rm(root, { recursive: true, force: true }) }
}, 30_000)
