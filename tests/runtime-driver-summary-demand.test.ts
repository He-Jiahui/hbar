import { expect, test } from 'bun:test'
import { emptyUsage, providerSchema } from '@hbar/contracts'
import type { RuntimeOwner, RuntimeUnitDescriptor, RuntimeVersion } from '@hbar/contracts/runtime'
import type { ModelRequest } from '@hbar/plugin-sdk'
import { runtimeDriverSummarySchema, runtimeDriverSummaryResultSchema } from '@hbar/plugin-sdk/runtime-driver'
import { IpcPeer, RuntimeCoordinator, procedure, runtimeDomainError } from '@hbar/runtime'
import { RuntimeDriverRelay, type RuntimeDriverDemand } from '../apps/host/src/runtime-driver-relay'

function gate() {
  let release: () => void = () => {
    throw new Error('Uninitialized fixture gate')
  }
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}
function pair(owner: RuntimeOwner, remote: RuntimeOwner) {
  let right!: IpcPeer
  const left = new IpcPeer({
    owner,
    remote,
    transport: {
      send: (frame) => {
        queueMicrotask(() => right.receive(structuredClone(frame)))
      },
    },
  })
  right = new IpcPeer({
    owner: remote,
    remote: owner,
    transport: {
      send: (frame) => {
        queueMicrotask(() => left.receive(structuredClone(frame)))
      },
    },
  })
  return {
    left,
    right,
    close() {
      left.close()
      right.close()
    },
  }
}
function fixture() {
  const base = { unitId: 'base', generation: 1, incarnation: 'summary-base' }
  const kernel = { unitId: 'kernel', generation: 1, incarnation: 'summary-kernel' }
  const driver = { unitId: 'driver.pi', generation: 1, incarnation: 'summary-driver' }
  const coordinator = new RuntimeCoordinator({
    claim: async (value) => value,
    release: async () => {},
    revoke: async () => {},
  })
  function register(owner: RuntimeOwner, kind: RuntimeUnitDescriptor['kind']) {
    const version: RuntimeVersion = { unitId: owner.unitId, generation: owner.generation, artifactId: 'a'.repeat(64) }
    coordinator.register(owner, version, {
      id: owner.unitId,
      kind,
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: 'b'.repeat(64),
      storageSchema: 1,
    })
    coordinator.activate(owner)
    return version
  }
  const kernelVersion = register(kernel, 'kernel'),
    driverVersion = register(driver, 'driver')
  const caller = pair(base, kernel),
    target = pair(base, driver)
  const demanded = gate(),
    grant = gate(),
    dispatched = gate(),
    reply = gate(),
    physicallySettled = gate()
  let holds = 0,
    calls = 0
  const markers: string[] = [],
    resolvedVersions: (RuntimeVersion | undefined)[] = []
  const sent = gate(),
    callerReply = gate()
  const callerSettlements: string[] = []
  const settlements: string[] = []
  const endpoint = { peer: target.left, owner: driver, version: driverVersion }
  const demand: RuntimeDriverDemand = {
    async withDefault(_signal, operation) {
      holds++
      demanded.release()
      await grant.promise
      return operation(endpoint, {
        onDispatchStarted: (event) => {
          markers.push(event)
          if (event === 'sent') sent.release()
        },
        onDispatchSettled: (event) => {
          settlements.push(event)
          physicallySettled.release()
        },
      })
    },
  }
  const relay = new RuntimeDriverRelay({
    coordinator,
    demand,
    resolve: (version) => {
      resolvedVersions.push(version)
      return endpoint
    },
  })
  const detach = relay.attachKernel(caller.left)
  target.right.register(
    'driver.summarize',
    procedure(runtimeDriverSummarySchema, runtimeDriverSummaryResultSchema, async () => {
      calls++
      dispatched.release()
      await reply.promise
      return { text: 'Controlled summary receipt', usage: emptyUsage() }
    }),
  )
  const request: ModelRequest = {
    system: 'Fixture summary',
    model: providerSchema.parse({
      id: 'fixture',
      name: 'Fixture',
      protocol: 'mock',
      baseUrl: 'http://127.0.0.1',
      model: 'fixture',
    }),
    messages: [],
    context: { sessionId: 'session', purpose: 'context-inspection' },
  }
  const accepted: Promise<unknown>[] = []
  return {
    coordinator,
    kernel,
    driver,
    kernelVersion,
    driverVersion,
    register,
    demanded,
    grant,
    dispatched,
    reply,
    physicallySettled,
    settlements,
    request,
    markers,
    sent,
    resolvedVersions,
    callerReply,
    callerSettlements,
    counts: () => ({ holds, calls }),
    summarize(signal = new AbortController().signal) {
      const pending = caller.right.call(
        'driver.summarize',
        { request, apiKey: null },
        runtimeDriverSummaryResultSchema,
        {
          signal,
          timeoutMs: 5000,
          onDispatchSettled: (event) => {
            callerSettlements.push(event)
            if (event === 'reply') callerReply.release()
          },
        },
      )
      void pending.catch(() => undefined)
      accepted.push(pending)
      return pending
    },
    async close(primaryFailed: boolean, primary: unknown) {
      grant.release()
      reply.release()
      const errors: unknown[] = primaryFailed ? [primary] : []
      // Rejections are expected in refusal/cancellation cases and asserted by callers.
      await Promise.allSettled(accepted)
      try {
        detach()
        caller.close()
        target.close()
      } catch (error) {
        errors.push(error)
      }
      if (errors.length) throw new AggregateError(errors, 'Summary relay component failed', { cause: errors[0] })
    },
  }
}
test('unbound summary acquires one demand and forwards actual IPC dispatch markers', async () => {
  const f = fixture()
  let failed = false,
    primary: unknown
  try {
    const pending = f.summarize()
    await f.demanded.promise
    expect(f.counts()).toEqual({ holds: 1, calls: 0 })
    expect(f.markers).toEqual([])
    f.grant.release()
    await f.dispatched.promise
    await f.sent.promise
    expect(f.counts()).toEqual({ holds: 1, calls: 1 })
    expect(f.markers).toEqual(['submitting', 'sent'])
    f.reply.release()
    expect((await pending).text).toBe('Controlled summary receipt')
    expect(f.settlements).toEqual(['reply'])
  } catch (error) {
    failed = true
    primary = error
  }
  await f.close(failed, primary)
}, 20_000)
for (const mode of ['replaced', 'aborted']) {
  test(`unbound summary cannot dispatch after demand wait when caller is ${mode}`, async () => {
    const f = fixture()
    let failed = false,
      primary: unknown
    try {
      const abort = new AbortController(),
        pending = f.summarize(abort.signal)
      let rejected = false
      const outcome = pending.then(
        () => undefined,
        (error) => {
          rejected = true
          return runtimeDomainError(error)?.code
        },
      )
      await f.demanded.promise
      if (mode === 'replaced') f.register({ ...f.kernel, generation: 2, incarnation: 'new-kernel' }, 'kernel')
      else abort.abort()
      f.grant.release()
      expect(await outcome).toBe(mode === 'replaced' ? 'RUNTIME_NOT_DEFAULT' : 'IPC_CANCELLED')
      expect(rejected).toBe(true)
      await f.callerReply.promise
      expect(f.callerSettlements).toEqual(['reply'])
      expect(f.counts().calls).toBe(0)
      expect(f.settlements).toEqual([])
    } catch (error) {
      failed = true
      primary = error
    }
    await f.close(failed, primary)
  }, 20_000)
}
test('bound execution preserves captured driver version and does not demand a replacement', async () => {
  const f = fixture()
  let failed = false,
    primary: unknown
  try {
    const ownership = await f.coordinator.claim(f.kernel, 'session', 'run', {
      kernel: f.kernelVersion,
      driver: f.driverVersion,
      plugins: [],
      hooks: [],
    })
    if (!ownership) throw new Error('Real Coordinator claim missing')
    f.request.context = { sessionId: 'session', runId: 'run', purpose: 'execution' }
    f.register({ ...f.driver, generation: 2, incarnation: 'replacement-driver' }, 'driver')
    const pending = f.summarize()
    await f.dispatched.promise
    expect(f.counts()).toEqual({ holds: 0, calls: 1 })
    expect(f.markers).toEqual([])
    expect(f.resolvedVersions).toEqual([f.driverVersion])
    f.reply.release()
    await pending
  } catch (error) {
    failed = true
    primary = error
  }
  await f.close(failed, primary)
}, 20_000)
test('logical cancellation after dispatch never fabricates not-dispatched settlement', async () => {
  const f = fixture()
  let failed = false,
    primary: unknown
  try {
    const abort = new AbortController(),
      pending = f.summarize(abort.signal)
    const outcome = pending.then(
      () => 'resolved',
      () => 'rejected',
    )
    await f.demanded.promise
    f.grant.release()
    await f.dispatched.promise
    abort.abort()
    expect(await outcome).toBe('rejected')
    expect(f.settlements).toEqual([])
    f.reply.release()
    await f.physicallySettled.promise
    expect(f.settlements).toEqual(['reply'])
  } catch (error) {
    failed = true
    primary = error
  }
  await f.close(failed, primary)
}, 20_000)
