import { expect, test } from 'bun:test'
import { RuntimeCoordinator, RuntimeValuePort, ExecutionDeadlines, IpcPeer } from '@hbar/runtime'
import { StableStoragePort, STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import type { RuntimeOwner, RuntimeVersion } from '@hbar/contracts/runtime'
import { userInputStateSchema } from '@hbar/contracts/user-input-state'
import { runtimePluginStateSchema } from '@hbar/plugin-sdk/runtime-plugin'
import { RuntimePluginRelay, type RuntimePluginEndpoint } from '../apps/host/src/runtime-plugin-relay'
import { RuntimeHumanWaits } from '../apps/host/src/runtime-human-waits'
import { withRuntimeHumanWait } from '../apps/host/src/runtime-human-wait-client'
import { runtimePluginInvocationSchema } from '../apps/host/src/runtime-plugin-contract'

test('the real plugin relay preserves every parent callback across a confirmed human wait and releases actual resources afterwards', async () => {
  const host: RuntimeOwner = { unitId: 'base', generation: 1, incarnation: 'host' }
  const kernel: RuntimeOwner = { unitId: 'kernel', generation: 1, incarnation: 'kernel' }
  const driver: RuntimeOwner = { unitId: 'driver.pi', generation: 1, incarnation: 'driver' }
  const plugin: RuntimeOwner = { unitId: 'plugin.plan', generation: 1, incarnation: 'plugin' }
  const version = (owner: RuntimeOwner): RuntimeVersion => ({
    unitId: owner.unitId,
    generation: 1,
    artifactId: 'a'.repeat(64),
  })
  const coordinator = new RuntimeCoordinator({
    claim: async (lease) => lease,
    release: async () => {},
    revoke: async () => {},
  })
  for (const [owner, kind] of [
    [kernel, 'kernel'],
    [driver, 'driver'],
    [plugin, 'plugin'],
  ] as const) {
    coordinator.register(owner, version(owner), {
      id: owner.unitId,
      kind,
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: 'a'.repeat(64),
      storageSchema: STORAGE_SCHEMA_VERSION,
    })
    coordinator.activate(owner)
  }
  const execution = await coordinator.claim(kernel, 'session', 'run', {
    kernel: version(kernel),
    driver: version(driver),
    plugins: [version(plugin)],
    hooks: [],
  })
  if (!execution) throw new Error('Original execution was not admitted')
  const state = userInputStateSchema.parse({
    version: 1,
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    settlement: null,
    policy: { sessionId: 'session', policy: { mode: 'wait_user' }, source: 'default', revisions: {} },
    request: {
      requestId: 'question',
      sessionId: 'session',
      runId: 'run',
      callId: 'call',
      isBlocking: true,
      questions: [
        { id: 'fact', header: 'Fact', question: 'Supply the fact', purpose: 'fact', isOther: false, isSecret: false },
      ],
    },
  })
  const waits = new RuntimeHumanWaits({
    coordinator,
    decisions: {
      question: async () => state,
      approval: async () => {
        throw new Error('No approval expected')
      },
    },
  })
  let timeouts = 0
  function pair(remote: RuntimeOwner) {
    let child!: IpcPeer
    const parent = new IpcPeer({
      owner: host,
      remote,
      controlRemoteDeadlines: true,
      transport: { send: (frame) => child.receive(frame) },
    })
    child = new IpcPeer({
      owner: remote,
      remote: host,
      acceptRemoteDeadlineControl: true,
      onTimeout: () => {
        timeouts++
      },
      transport: { send: (frame) => parent.receive(frame) },
    })
    return {
      parent,
      child,
      close() {
        parent.close()
        child.close()
      },
    }
  }
  const kernelPeers = pair(kernel),
    pluginPeers = pair(plugin),
    storage = new StableStoragePort()
  let endpoint: RuntimePluginEndpoint | undefined
  const relay = new RuntimePluginRelay({
    storage,
    coordinator,
    humanWaits: waits,
    current: () => (endpoint ? [endpoint] : []),
    resolve: () => {
      if (!endpoint) throw new Error('Missing plugin endpoint')
      return endpoint
    },
  })
  const attached = relay.attachPlugin(pluginPeers.parent, plugin)
  endpoint = {
    owner: plugin,
    version: version(plugin),
    application: attached.application,
    state: runtimePluginStateSchema.parse({
      manifests: [
        {
          id: 'plan',
          name: 'Plan',
          description: 'Local question fixture',
          version: '1.0.0',
          apiVersion: '^1.0.0',
          scope: 'host',
          permissions: [],
        },
      ],
      config: {},
      configSchema: null,
      tools: [],
      hooks: [],
      capabilities: {},
    }),
  }
  const detachRelay = relay.attachKernel(kernelPeers.parent, kernel),
    detachWaits = waits.attachKernel(kernelPeers.parent, kernel)
  const source = new RuntimeValuePort(kernelPeers.child, {
    prefix: 'kernel.plugins',
    callbackTimeoutMs: 100,
    callbackSettlement: 'physical',
  })
  const actual = new RuntimeValuePort(pluginPeers.child, {
    prefix: 'plugin.application',
    callbackTimeoutMs: 100,
    callbackSettlement: 'physical',
  })
  const entered = Promise.withResolvers<void>(),
    answer = Promise.withResolvers<{ answers: { fact: { answers: string[] } } }>()
  const local = new ExecutionDeadlines()
  actual.register('invoke', async ([description, _args, invoke]) => {
    if (typeof invoke !== 'function') throw new Error('Missing original Host callback')
    const request = runtimePluginInvocationSchema.parse(description)
    const { invocationId } = request
    if (!invocationId) throw new Error('Missing invocation identity')
    try {
      if (request.operation === 'capability') return { kind: 'value', value: 'readable while parked' }
      if (request.operation === 'hook') return await Reflect.apply(invoke, undefined, ['execution.nodeCall', []])
      const response: unknown = await Reflect.apply(invoke, undefined, ['userInput.request', [state.request]])
      return { kind: 'value', value: response }
    } finally {
      await pluginPeers.child.notify('plugin.finished', { invocationId })
    }
  })
  const result = local.execute(execution, 'call', () =>
    source.callTracked(
      'invoke',
      [
        plugin.unitId,
        { execution },
        { operation: 'execute', name: 'request_user_input', catalog: [], toolTimeoutMs: 100 },
        [{}, { callId: 'call', run: { id: 'run' }, session: { id: 'session' } }],
        async (method: string) => {
          if (method !== 'userInput.request') throw new Error('Unexpected callback')
          return withRuntimeHumanWait(
            kernelPeers.child,
            execution,
            'call',
            { kind: 'questionnaire', id: 'question', revision: 1 },
            async (confirmed) => {
              if (!confirmed) throw new Error('Original pending decision was not confirmed')
              const resume = local.suspend(execution, 'call')
              entered.resolve()
              try {
                return await answer.promise
              } finally {
                resume()
              }
            },
          )
        },
      ],
      { timeoutMs: 100 },
    ),
  )
  void result.catch(() => {})
  try {
    await entered.promise
    await Bun.sleep(180)
    expect(timeouts).toBe(0)
    expect(waits.snapshot()).toEqual({ waits: 1, active: 1, callbacks: 3 })
    expect(local.snapshot().callbacks).toBe(1)
    expect(coordinator.snapshot()).toMatchObject({ sessions: 1, resources: 1, physicalTools: 1 })
    expect(pluginPeers.child.snapshot()).toMatchObject({ inFlight: 1, failed: false })
    expect(coordinator.suspendWaitingExecution(execution, ['call'])).toBe(true)
    expect(coordinator.executionCapacity().suspendedExecutions).toBe(1)
    const dispatch = (operation: string, name: string, method?: string) =>
      source.call('invoke', [
        plugin.unitId,
        { execution },
        { operation, name, ...(method ? { method } : {}), catalog: [] },
        [],
        () => {
          throw new Error('No execution callback may escape admission')
        },
      ])
    expect(await dispatch('capability', 'budget', 'get')).toEqual({ kind: 'value', value: 'readable while parked' })
    await expect(dispatch('capability', 'execution', 'exec')).rejects.toHaveProperty(
      'code',
      'EXECUTION_CAPACITY_WAITING',
    )
    await expect(dispatch('capability', 'custom', 'get')).rejects.toHaveProperty('code', 'EXECUTION_CAPACITY_WAITING')
    await expect(dispatch('hook', 'run.end')).rejects.toHaveProperty('code', 'EXECUTION_CAPACITY_WAITING')
    expect(coordinator.snapshot()).toMatchObject({ sessions: 1, resources: 1, physicalTools: 1 })
    expect(coordinator.resumeExecutionCapacity(execution)).toBe(true)
    const response = { answers: { fact: { answers: ['provided by human'] } } }
    answer.resolve(response)
    expect(await result).toEqual({ kind: 'value', value: response })
    await coordinator.requestRelease(execution, async () => {})
    expect(coordinator.snapshot()).toMatchObject({ sessions: 0, resources: 0, physicalTools: 0 })
    expect(waits.snapshot()).toEqual({ waits: 0, active: 0, callbacks: 0 })
    expect(local.snapshot()).toEqual({ scopes: 0, executions: 0, callbacks: 0 })
  } finally {
    answer.resolve({ answers: { fact: { answers: ['cleanup'] } } })
    source.dispose()
    actual.dispose()
    detachRelay()
    detachWaits()
    attached.dispose()
    kernelPeers.close()
    pluginPeers.close()
  }
})
