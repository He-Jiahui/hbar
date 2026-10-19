import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { z } from 'zod'
import { type DiagnosticEvent } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { IpcPeer, RuntimeValuePort } from '@hbar/runtime'
import { describeRuntimeHook, restoreRuntimeHook } from '@hbar/plugin-sdk/runtime-plugin'
import { RuntimePluginAdapter } from '../apps/host/src/runtime-plugin-adapter'
import { runtimePluginInvocationTools } from '../apps/host/src/runtime-plugin-api'
import {
  runtimePluginAuthoritySchema,
  runtimePluginCatalogSchema,
  runtimePluginInvocationSchema,
  runtimePluginResultSchema,
} from '../apps/host/src/runtime-plugin-contract'

type Behavior = 'cancel-hook' | 'spoof-hook' | 'failure-after-abort' | 'write-timeout'

async function fixture(behavior: Behavior) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-managed-hook-cancellation-'))
  const cleanupTarget = await realpath(root)
  const canonicalTmpdir = await realpath(tmpdir())
  if (
    !isAbsolute(cleanupTarget) ||
    dirname(cleanupTarget) !== canonicalTmpdir ||
    !basename(cleanupTarget).startsWith('hbar-managed-hook-cancellation-')
  )
    throw new Error('Managed-hook fixture root failed its ownership fence')
  const entered = Promise.withResolvers<void>()
  const held = Promise.withResolvers<void>()
  const diagnostics: DiagnosticEvent[] = []
  let hostPeer: IpcPeer | undefined
  const kernelPeer = new IpcPeer({
    owner: { unitId: 'kernel', generation: 1, incarnation: 'managed-hook-kernel' },
    remote: { unitId: 'host', generation: 1, incarnation: 'managed-hook-host' },
    transport: { send: (frame) => hostPeer?.receive(frame) },
  })
  hostPeer = new IpcPeer({
    owner: kernelPeer.remote,
    remote: kernelPeer.owner,
    transport: { send: (frame) => kernelPeer.receive(frame) },
  })
  const ownerValues = new RuntimeValuePort(hostPeer, { prefix: 'kernel.plugins' })
  const managedUnitId = 'plugin.managed-hook-fixture'
  const managedCatalog = [
    {
      unitId: managedUnitId,
      state: {
        manifests: [
          {
            id: 'managed.hook.fixture',
            name: 'Managed hook fixture',
            description: 'Cancellation bridge regression',
            version: '1.0.0',
            apiVersion: '^1.0.0',
            scope: 'host',
            permissions: [],
          },
        ],
        config: {},
        configSchema: null,
        tools: [],
        hooks: ['tool.before'],
        panels: [],
        capabilities: {},
      },
    },
  ] satisfies z.output<typeof runtimePluginCatalogSchema>
  ownerValues.register('catalog', () => runtimePluginCatalogSchema.parse(managedCatalog))
  ownerValues.register('invoke', async (args): Promise<z.output<typeof runtimePluginResultSchema>> => {
    const unitId = z.string().min(1).max(160).parse(args[0])
    runtimePluginAuthoritySchema.parse(args[1])
    const request = runtimePluginInvocationSchema.parse(args[2])
    const rawArgs = z.array(z.unknown()).max(32).parse(args[3])
    const callback = args[4]
    if (
      unitId !== managedUnitId ||
      request.operation !== 'hook' ||
      request.name !== 'tool.before' ||
      typeof callback !== 'function'
    )
      throw new Error('Unexpected managed hook invocation')
    const catalog = runtimePluginInvocationTools(request.catalog, async (method, parameters) => {
      const result: unknown = await Reflect.apply(callback, undefined, [method, [...parameters]])
      return result
    })
    const value = restoreRuntimeHook('tool.before', rawArgs[0], catalog)
    if (value.name === 'managed_hook_probe') {
      if (behavior === 'cancel-hook') {
        entered.resolve()
        await held.promise
      }
      if (behavior === 'spoof-hook')
        return { kind: 'error', code: 'USER_CANCELLED', message: 'Independent plugin failure' }
    }
    return { kind: 'value', value: describeRuntimeHook('tool.before', value, true) }
  })
  let kernel: Kernel | undefined
  const adapter = new RuntimePluginAdapter(kernelPeer, () => {
    if (!kernel) throw new Error('Kernel not ready')
    return kernel
  })
  let executed = 0
  const close = async () => {
    held.resolve()
    const failures: unknown[] = []
    const attempt = async (release: () => void | Promise<void>): Promise<void> => {
      try {
        await release()
      } catch (error) {
        failures.push(error)
      }
    }
    await attempt(() => kernel?.close())
    await attempt(() => adapter.dispose())
    await attempt(() => ownerValues.dispose())
    await attempt(() => kernelPeer.close())
    await attempt(() => hostPeer?.close())
    await attempt(async () => {
      const resolved = await realpath(cleanupTarget)
      if (
        resolved !== cleanupTarget ||
        !isAbsolute(resolved) ||
        dirname(resolved) !== canonicalTmpdir ||
        (await realpath(tmpdir())) !== canonicalTmpdir ||
        !basename(resolved).startsWith('hbar-managed-hook-cancellation-')
      )
        throw new Error('Refusing cleanup outside managed-hook fixture')
      await rm(cleanupTarget, { recursive: true })
    })
    if (failures.length) throw new AggregateError(failures, 'Managed-hook fixture cleanup failed')
  }
  try {
    const managedPlugins = await adapter.load()
    kernel = await Kernel.create({
      home: join(root, 'data'),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      profile: { managedPlugins },
      diagnostics: { emit: (event) => diagnostics.push(event) },
    })
    kernel.tools.register({
      name: 'managed_hook_probe',
      description: 'Observable managed hook admission probe',
      effect: 'write',
      ...(behavior === 'write-timeout' ? { timeoutMs: 40 } : {}),
      inputSchema: z.object({}),
      async execute() {
        executed++
        await writeFile(join(root, 'physical-effect.txt'), 'Recorded physical effect')
        if (behavior === 'failure-after-abort' || behavior === 'write-timeout') {
          entered.resolve()
          await held.promise
          if (behavior === 'failure-after-abort') throw new Error('Unrelated tool failure after Run abort')
        }
        return { text: 'Physical tool executed' }
      },
    })
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Missing managed-hook fixture workspace')
    const session = await kernel.createSession(workspace.id)
    return {
      kernel,
      session,
      entered: entered.promise,
      release: () => held.resolve(),
      close,
      diagnostics,
      executed: () => executed,
      effectExists: () => existsSync(join(root, 'physical-effect.txt')),
      peerSnapshot: () => kernelPeer.snapshot(),
    }
  } catch (error) {
    try {
      await close()
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Managed-hook fixture initialization and cleanup failed', {
        cause: cleanupError,
      })
    }
    throw error
  }
}

for (const behavior of ['cancel-hook', 'spoof-hook', 'failure-after-abort', 'write-timeout'] as const)
  test(`managed hook bridge preserves Host outcome attribution: ${behavior}`, async () => {
    const f = await fixture(behavior)
    let primaryFailure: { error: unknown } | undefined
    let cleanupFailure: { error: unknown } | undefined
    try {
      const run = await f.kernel.submit(
        f.session.id,
        crypto.randomUUID(),
        {
          text: '/tool managed_hook_probe {}',
          images: [],
          approval: 'allow',
        },
        'local-fixture',
      )
      if (behavior === 'cancel-hook' || behavior === 'failure-after-abort') {
        await f.entered
        await f.kernel.cancel(run.id)
      }
      if (behavior === 'cancel-hook') {
        // Cancellation is logical until the original hook supplies its physical reply.
        expect(f.peerSnapshot().inFlight).toBe(1)
        expect(f.executed()).toBe(0)
        expect(f.effectExists()).toBe(false)
        expect((await f.kernel.storage.call('run', run.id)).endedAt).toBeNull()
        f.release()
      }
      if (behavior === 'failure-after-abort') f.release()
      await f.kernel.waitForIdle()
      const result = (await f.kernel.snapshot(f.session.id)).messages
        .filter((message) => message.runId === run.id)
        .flatMap((message) => message.content)
        .find((block) => block.type === 'tool_result')
      const expectedKind =
        behavior === 'cancel-hook' ? 'cancelled' : behavior === 'write-timeout' ? 'unknown' : 'failed'
      const executionStarted = behavior === 'failure-after-abort' || behavior === 'write-timeout'
      expect(result).toMatchObject({ isError: true, outcome: { kind: expectedKind, executionStarted } })
      expect(f.executed()).toBe(executionStarted ? 1 : 0)
      expect(f.effectExists()).toBe(executionStarted)
      const diagnostics = f.diagnostics.filter((event) => event.runId === run.id)
      if (behavior === 'cancel-hook') {
        expect(
          diagnostics.some((event) => event.event === 'tool.cancelled' && event.errorCode === 'USER_CANCELLED'),
        ).toBe(true)
        expect(diagnostics.some((event) => event.event === 'tool.failed')).toBe(false)
        expect(diagnostics.some((event) => event.event === 'tool.started')).toBe(false)
        expect(f.peerSnapshot().inFlight).toBe(0)
        expect((await f.kernel.storage.call('run', run.id)).status).toBe('cancelled')
      } else {
        expect(diagnostics.some((event) => event.event === 'tool.cancelled')).toBe(false)
        if (behavior === 'write-timeout') expect(result).toMatchObject({ details: { resultUnknown: true } })
      }
    } catch (error) {
      primaryFailure = { error }
    } finally {
      try {
        await f.close()
      } catch (cleanupError) {
        cleanupFailure = { error: cleanupError }
      }
    }
    if (primaryFailure && cleanupFailure)
      throw new AggregateError(
        [primaryFailure.error, cleanupFailure.error],
        'Managed-hook assertion and cleanup failed',
      )
    if (primaryFailure) throw primaryFailure.error
    if (cleanupFailure) throw cleanupFailure.error
  })
