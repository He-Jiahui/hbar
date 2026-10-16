import { expect, test } from 'bun:test'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import type { ExecutionOwnership, RuntimeOwner, RuntimeUnitDescriptor, RuntimeVersion } from '@hbar/contracts/runtime'
import { IpcPeer, RuntimeCoordinator, RuntimeValuePort } from '@hbar/runtime'
import { StableStoragePort } from '@hbar/storage'
import { runtimePluginStateSchema } from '@hbar/plugin-sdk/runtime-plugin'
import { RuntimePluginRelay, type RuntimePluginEndpoint } from '../apps/host/src/runtime-plugin-relay'
import { runtimePluginInvocationSchema } from '../apps/host/src/runtime-plugin-contract'

function paired(base: RuntimeOwner, owner: RuntimeOwner) {
  let unit: IpcPeer | undefined
  const host = new IpcPeer({ owner: base, remote: owner, transport: { send: (frame) => unit?.receive(frame) } })
  unit = new IpcPeer({ owner, remote: base, transport: { send: (frame) => host.receive(frame) } })
  return { host, unit }
}

test('real Relay permits only external audited Goal/Plan observation after driver dependency revocation', async () => {
  const makeOwner = (unitId: string): RuntimeOwner => ({ unitId, generation: 1, incarnation: crypto.randomUUID() })
  const base = makeOwner('base'),
    kernel = makeOwner('kernel'),
    driver = makeOwner('driver.pi')
  const goal = makeOwner('plugin.goal'),
    plan = makeOwner('plugin.plan'),
    workflow = makeOwner('plugin.workflow')
  const version = (owner: RuntimeOwner): RuntimeVersion => ({
    unitId: owner.unitId,
    generation: owner.generation,
    artifactId: 'a'.repeat(64),
  })
  let durableWrites = 0
  const coordinator = new RuntimeCoordinator({
    claim: async (lease) => lease,
    release: async () => {},
    revoke: async () => {},
  })
  for (const owner of [kernel, driver, goal, plan, workflow]) {
    const kind: RuntimeUnitDescriptor['kind'] = owner === kernel ? 'kernel' : owner === driver ? 'driver' : 'plugin'
    coordinator.register(owner, version(owner), {
      id: owner.unitId,
      kind,
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: 'a'.repeat(64),
      storageSchema: 24,
    })
    coordinator.activate(owner)
  }
  const lease = await coordinator.claim(kernel, 'session', 'run', {
    kernel: version(kernel),
    driver: version(driver),
    plugins: [goal, plan, workflow].map(version),
    hooks: [],
  })
  if (!lease) throw new Error('Missing actual execution lease')
  const kernelPeers = paired(base, kernel)
  const pluginPeers = [goal, plan, workflow].map((owner) => ({ owner, ...paired(base, owner) }))
  const ports: RuntimeValuePort[] = []
  const storage = new StableStoragePort()
  const routed: Array<{ unitId: string; leaseId: string | null; sessionId: string | undefined }> = []
  const callbackReads: string[] = []
  let callbackMethod = 'sessions.get'
  let callbackSession = 'session'
  const endpoints: RuntimePluginEndpoint[] = []
  const relay = new RuntimePluginRelay({
    coordinator,
    storage,
    current: () => endpoints,
    resolve: (unitId, execution, sessionId) => {
      routed.push({ unitId, leaseId: execution?.leaseId ?? null, sessionId })
      const endpoint = endpoints.find((item) => item.owner.unitId === unitId)
      if (!endpoint) throw new HbarError('RUNTIME_RECOVERING', 'Missing bound plugin')
      return endpoint
    },
  })
  const detach = [relay.attachKernel(kernelPeers.host, kernel)]
  for (const peers of pluginPeers) {
    const attached = relay.attachPlugin(peers.host, peers.owner)
    detach.push(attached.dispose)
    const application = attached.application
    const receiver = new RuntimeValuePort(peers.unit, { prefix: 'plugin.application' })
    ports.push(receiver)
    const capability = peers.owner === goal ? 'goal' : peers.owner === plan ? 'plan' : 'workflow'
    receiver.register('invoke', async ([description, values, host]) => {
      const request = runtimePluginInvocationSchema.parse(description)
      const [sessionId] = z.tuple([z.string()]).parse(values)
      if (typeof host !== 'function') throw new Error('Missing authenticated application callback')
      try {
        const response: unknown = await Reflect.apply(host, undefined, [callbackMethod, [callbackSession]])
        z.object({ id: z.literal(sessionId) }).parse(response)
        return { kind: 'value', value: { sessionId, capability, method: request.method } }
      } finally {
        await peers.unit.notify('plugin.finished', { invocationId: request.invocationId })
      }
    })
    endpoints.push({
      owner: peers.owner,
      version: version(peers.owner),
      application,
      state: runtimePluginStateSchema.parse({
        manifests: [
          {
            id: `${capability}.fixture`,
            name: capability,
            description: 'Observation boundary fixture',
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
        capabilities: { [capability]: ['get', 'snapshot'] },
      }),
    })
  }
  const caller = new RuntimeValuePort(kernelPeers.unit, { prefix: 'kernel.plugins' })
  ports.push(caller)
  const invoke = (
    name: string,
    method: string,
    authority: { sessionId: string; execution?: ExecutionOwnership } = { sessionId: 'session' },
    args: unknown[] = ['session'],
    unitId = `plugin.${name}`,
  ) =>
    caller.call('invoke', [
      unitId,
      authority,
      { operation: 'capability', name, method, catalog: [] },
      args,
      async (methodValue: unknown, parameters: unknown) => {
        const methodName = z.string().parse(methodValue)
        const [id] = z.tuple([z.string()]).parse(parameters)
        if (methodName !== 'sessions.get') durableWrites++
        callbackReads.push(id)
        return { id }
      },
    ])
  const rejected = (operation: Promise<unknown>) => operation.catch((error: unknown) => error)
  try {
    expect(await invoke('goal', 'get', { sessionId: 'session', execution: lease })).toEqual({
      kind: 'value',
      value: { sessionId: 'session', capability: 'goal', method: 'get' },
    })
    expect(coordinator.snapshot().resources).toBe(0)
    callbackReads.length = 0
    routed.length = 0
    const revoked = await coordinator.revoke(driver)
    coordinator.ownerExited(driver)
    expect(revoked.map((item) => item.runId)).toEqual(['run'])
    expect(coordinator.executionForSession('session')?.leaseId).toBe(lease.leaseId)
    expect(coordinator.snapshot().blockedSessions).toEqual(['session'])
    expect(() => coordinator.assertExecution(lease)).toThrow('Execution submission is from an invalid or revoked owner')
    for (const name of ['goal', 'plan'])
      for (const method of ['get', 'snapshot']) {
        expect(await invoke(name, method)).toEqual({
          kind: 'value',
          value: { sessionId: 'session', capability: name, method },
        })
      }
    expect(callbackReads).toEqual(['session', 'session', 'session', 'session'])
    expect(routed.every((item) => item.leaseId === lease.leaseId && item.sessionId === 'session')).toBe(true)
    const priorDispatches = routed.length
    for (const name of ['goal', 'plan'])
      for (const method of ['get', 'snapshot'])
        expect(await rejected(invoke(name, method, { sessionId: 'session', execution: lease }))).toMatchObject({
          code: 'EXECUTION_OWNER_REVOKED',
        })
    for (const [name, method] of [
      ['goal', 'update'],
      ['plan', 'update'],
      ['goal', 'unknownMutation'],
      ['workflow', 'get'],
    ]) {
      if (!name || !method) throw new Error('Incomplete denied fixture')
      expect(await rejected(invoke(name, method))).toMatchObject({ code: 'EXECUTION_OWNER_REVOKED' })
    }
    expect(routed).toHaveLength(priorDispatches)
    expect(await rejected(invoke('goal', 'snapshot', { sessionId: 'session' }, ['foreign']))).toMatchObject({
      code: 'EXECUTION_OWNER_MISMATCH',
    })
    expect(
      await rejected(invoke('goal', 'snapshot', { sessionId: 'foreign', execution: lease }, ['foreign'])),
    ).toMatchObject({ code: 'EXECUTION_OWNER_MISMATCH' })
    expect(
      await rejected(invoke('goal', 'snapshot', { sessionId: 'session' }, ['session'], 'plugin.plan')),
    ).toMatchObject({ code: 'EXECUTION_OWNER_REVOKED' })
    callbackSession = 'foreign'
    expect(await rejected(invoke('goal', 'get'))).toMatchObject({ code: 'EXECUTION_OWNER_MISMATCH' })
    callbackSession = 'session'
    callbackMethod = 'sessions.append'
    expect(await rejected(invoke('plan', 'snapshot'))).toMatchObject({ code: 'RUNTIME_METHOD_UNAVAILABLE' })
    expect(durableWrites).toBe(0)
    expect(coordinator.snapshot()).toMatchObject({
      sessions: 1,
      blockedSessions: ['session'],
      physicalTools: 0,
      resources: 0,
    })
    callbackMethod = 'sessions.get'
    await coordinator.revoke(goal)
    expect(await rejected(invoke('goal', 'get'))).toMatchObject({ code: 'EXECUTION_OWNER_REVOKED' })
    await coordinator.revoke(kernel)
    expect(await rejected(invoke('plan', 'get'))).toMatchObject({ code: 'EXECUTION_OWNER_REVOKED' })
  } finally {
    for (const dispose of detach.reverse()) dispose()
    for (const port of ports) port.dispose()
    kernelPeers.host.close()
    kernelPeers.unit.close()
    for (const peers of pluginPeers) {
      peers.host.close()
      peers.unit.close()
    }
    await storage.close()
  }
})
