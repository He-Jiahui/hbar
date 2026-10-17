import { expect, test } from 'bun:test'
import { AsyncResource } from 'node:async_hooks'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { IpcPeer, RuntimeCoordinator, RuntimeValuePort } from '@hbar/runtime'
import { runtimeGenerationSchema, type RuntimeOwner } from '@hbar/contracts/runtime'
import { runtimeKernelStateSchema } from '@hbar/kernel/runtime-port'
import { createPathLayout } from '@hbar/storage'
import { HostCommandExecutionScopes } from '../apps/host/src/command-execution-scopes'
import { RuntimeKernelFacade, type RuntimeKernelEndpoint } from '../apps/host/src/runtime-kernel-facade'

async function fixture() {
  const hash = 'a'.repeat(64)
  const scopes = new HostCommandExecutionScopes()
  const coordinator = new RuntimeCoordinator({
    claim: async (value) => value,
    release: async () => {},
    revoke: async () => {},
  })
  const endpoints: RuntimeKernelEndpoint[] = []
  const called: string[] = []
  const channels: Array<{ close(): void }> = []
  const transport = new AsyncResource('source-kernel-command-routing')
  const make = (generation: number) => {
    const owner: RuntimeOwner = { unitId: 'kernel', generation, incarnation: `kernel-${generation}` }
    const version = { unitId: owner.unitId, generation, artifactId: hash }
    coordinator.register(owner, version, {
      id: 'kernel',
      kind: 'kernel',
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: hash,
      storageSchema: 32,
    })
    coordinator.activate(owner)
    let remote!: IpcPeer
    const local = new IpcPeer({
      owner: { unitId: 'base', generation: 1, incarnation: 'routing-host' },
      remote: owner,
      transport: {
        send: (frame) => transport.runInAsyncScope(() => remote.receive(JSON.parse(JSON.stringify(frame)))),
      },
    })
    remote = new IpcPeer({
      owner,
      remote: local.owner,
      transport: { send: (frame) => transport.runInAsyncScope(() => local.receive(JSON.parse(JSON.stringify(frame)))) },
    })
    const application = new RuntimeValuePort(local, { prefix: 'kernel.application', callbackSettlement: 'physical' })
    const implementation = new RuntimeValuePort(remote, {
      prefix: 'kernel.application',
      callbackSettlement: 'physical',
    })
    for (const method of ['kernel.providerProfiles', 'budget.get'])
      implementation.register(method, () => {
        called.push(`${generation}:${method}`)
        return method === 'budget.get' ? null : []
      })
    const state = runtimeGenerationSchema.parse({
      ...owner,
      artifactId: hash,
      role: 'default',
      phase: 'serving',
      pid: null,
      references: { runs: 0, resources: 0, requests: 0 },
      lastHeartbeatAt: null,
      failures: 0,
      nextAttemptAt: null,
      reasonCode: null,
    })
    const endpoint: RuntimeKernelEndpoint = {
      owner,
      application,
      process: { call: () => Promise.reject(new Error('Unexpected process control call')), snapshot: () => state },
      state: runtimeKernelStateSchema.parse({
        instanceId: 'routing-host',
        permission: 'ask',
        recovered: 0,
        driverIsolation: 'managed',
        active: [],
        tools: [],
        plugins: [],
        protectedRoots: [],
        idle: false,
        userInputs: [],
        protection: [],
        modes: [],
      }),
    }
    endpoints.push(endpoint)
    channels.push({
      close() {
        application.dispose()
        implementation.dispose()
        local.close()
        remote.close()
      },
    })
    return { endpoint, implementation, state, version }
  }
  const original = make(1)
  const source = await coordinator.claim(original.endpoint.owner, 'source-session', 'source-run', {
    kernel: original.version,
    driver: original.version,
    plugins: [],
    hooks: [],
  })
  if (!source) throw new Error('Source claim was not accepted')
  const current = make(2)
  original.state.role = 'draining'
  original.state.phase = 'draining'
  const other = await coordinator.claim(current.endpoint.owner, 'target-session', 'target-run', {
    kernel: current.version,
    driver: current.version,
    plugins: [],
    hooks: [],
  })
  if (!other) throw new Error('Target claim was not accepted')
  let operatorResolutions = 0
  const facade = new RuntimeKernelFacade({
    instanceId: 'routing-host',
    demo: false,
    coordinator,
    commandScopes: scopes,
    layout: createPathLayout(
      join(tmpdir(), 'hbar-routing-data'),
      join(tmpdir(), 'hbar-routing-cache'),
      join(tmpdir(), 'hbar-routing-pointer.json'),
    ),
    storage: { call: () => Promise.reject(new Error('Unexpected storage call')), close: async () => {} },
    current: () => {
      operatorResolutions++
      return current.endpoint
    },
    endpoints: () => endpoints,
    resolve: async (_target, _method, args, captured) => {
      await Promise.resolve()
      if (args[0] === other.sessionId) return current.endpoint
      if (captured) return captured
      operatorResolutions++
      return current.endpoint
    },
    maintain: (operation) => operation(),
  })
  const controller = new AbortController()
  const scope = {
    source,
    callId: 'command-call',
    beforeStart: async () => {},
    application: {
      owner: source.owner,
      callId: 'command-call',
      signal: controller.signal,
      timeoutMs: 5_000,
      port: { call: () => Promise.reject(new Error('Unexpected filesystem source call')) },
    },
  }
  return {
    scopes,
    coordinator,
    endpoints,
    original,
    current,
    source,
    facade,
    scope,
    controller,
    called,
    operatorResolutions: () => operatorResolutions,
    close() {
      facade.dispose()
      channels.forEach((channel) => channel.close())
      transport.emitDestroy()
    },
  }
}

test('a command keeps its draining source Kernel for default and idle-session APIs while an explicit active target keeps its actual owner', async () => {
  const f = await fixture()
  try {
    await f.scopes.run(f.scope, async () => {
      await f.facade.api.providerProfiles()
      const budget = f.facade.api.plugins.get('budget')
      expect(await budget.get(f.source.sessionId)).toBeNull()
      expect(await budget.get('idle-session')).toBeNull()
      expect(await budget.get('target-session')).toBeNull()
    })
    expect(f.called).toEqual(['1:kernel.providerProfiles', '1:budget.get', '1:budget.get', '2:budget.get'])
    expect(f.operatorResolutions()).toBe(0)
    await f.facade.api.providerProfiles()
    expect(f.called.at(-1)).toBe('2:kernel.providerProfiles')
  } finally {
    f.close()
  }
})

test('missing or revoked command source Kernels fail without rerouting to the operator generation', async () => {
  const f = await fixture()
  try {
    f.endpoints.splice(0, 1)
    await expect(f.scopes.run(f.scope, () => f.facade.api.providerProfiles())).rejects.toMatchObject({
      code: 'COMMAND_SOURCE_KERNEL_UNAVAILABLE',
    })
    f.endpoints.unshift(f.original.endpoint)
    f.coordinator.ownerExited(f.source.owner)
    await expect(f.scopes.run(f.scope, () => f.facade.api.providerProfiles())).rejects.toMatchObject({
      code: 'EXECUTION_OWNER_REVOKED',
    })
    expect(f.called).toEqual([])
    expect(f.operatorResolutions()).toBe(0)
  } finally {
    f.close()
  }
})

test('a cancelled source API call retains its physical wait until the original IPC handler actually returns', async () => {
  const f = await fixture()
  const entered = Promise.withResolvers<void>(),
    released = Promise.withResolvers<void>(),
    cancelled = Promise.withResolvers<void>()
  let returned = false
  f.original.implementation.register('kernel.models', async (_args, signal) => {
    signal.addEventListener('abort', () => cancelled.resolve(), { once: true })
    entered.resolve()
    await released.promise
    returned = true
    return []
  })
  let finished = false
  const operation = f.scopes
    .run(f.scope, () => f.facade.api.models())
    .finally(() => {
      finished = true
    })
  try {
    await entered.promise
    f.controller.abort(new Error('Source cancelled'))
    await cancelled.promise
    expect(returned).toBe(false)
    expect(finished).toBe(false)
    released.resolve()
    expect(await operation).toEqual([])
    expect(returned).toBe(true)
    expect(f.operatorResolutions()).toBe(0)
  } finally {
    released.resolve()
    await operation.catch(() => undefined)
    f.close()
  }
})

test('an admitted callback inside a source Kernel API retains its physical operation after cancellation', async () => {
  const f = await fixture()
  const entered = Promise.withResolvers<void>(),
    released = Promise.withResolvers<void>(),
    cancelled = Promise.withResolvers<void>()
  let callbackFinished = false,
    handlerFinished = false,
    finished = false
  f.original.implementation.register('mode.commitExit', async (args, signal) => {
    signal.addEventListener('abort', () => cancelled.resolve(), { once: true })
    const commit = args[1]
    if (typeof commit !== 'function') throw new Error('Expected the admitted commit callback')
    const result: unknown = await Reflect.apply(commit, undefined, [])
    handlerFinished = true
    return result
  })
  const operation = f.scopes
    .run(f.scope, () =>
      f.facade.api.plugins.get('mode').commitExit('source-session', async () => {
        entered.resolve()
        await released.promise
        callbackFinished = true
        return { modeEvent: null }
      }),
    )
    .finally(() => {
      finished = true
    })
  try {
    await entered.promise
    f.controller.abort(new Error('Source callback cancelled'))
    await cancelled.promise
    expect(callbackFinished).toBe(false)
    expect(handlerFinished).toBe(false)
    expect(finished).toBe(false)
    released.resolve()
    expect(await operation).toEqual({ modeEvent: null })
    expect(callbackFinished).toBe(true)
    expect(handlerFinished).toBe(true)
  } finally {
    released.resolve()
    await operation.catch(() => undefined)
    f.close()
  }
})
