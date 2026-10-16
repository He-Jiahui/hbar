import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test } from 'bun:test'
import { z } from 'zod'
import { HbarError, providerSchema } from '@hbar/contracts'
import type { RuntimeOwner, RuntimeVersion } from '@hbar/contracts/runtime'
import { IpcPeer, RuntimeCoordinator, procedure } from '@hbar/runtime'
import { runtimeDriverStartSchema, runtimeDriverCallbackSchema } from '@hbar/plugin-sdk/runtime-driver'
import { RuntimeDriverRelay } from '../apps/host/src/runtime-driver-relay'
import {
  RuntimeDriverCallbackGate,
  RuntimeDriverCallbackAdmission,
} from '../apps/host/src/runtime-driver-callback-gate'

function deferred() {
  let resolve: (() => void) | undefined
  let reject: ((error: unknown) => void) | undefined
  const promise = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, release: () => resolve?.(), fail: (error: unknown) => reject?.(error) }
}
function outcome(operation: Promise<unknown>) {
  return operation.then(
    (value: unknown) => ({ ok: true, value }),
    (value: unknown) => ({ ok: false, value }),
  )
}
async function until(check: () => boolean) {
  const end = Date.now() + 2_000
  while (!check()) {
    if (Date.now() >= end) throw new Error('Callback fixture progress deadline exceeded')
    await Bun.sleep(1)
  }
}
function pair(owner: RuntimeOwner, remote: RuntimeOwner) {
  let child: IpcPeer | undefined
  const parent = new IpcPeer({
    owner,
    remote,
    inFlight: 32,
    queued: 128,
    reservedControl: 8,
    controlMethods: ['fixed.control'],
    transport: {
      send(frame) {
        if (!child) throw new Error('Missing peer')
        child.receive(frame)
      },
    },
  })
  child = new IpcPeer({
    owner: remote,
    remote: owner,
    inFlight: 32,
    queued: 128,
    reservedControl: 8,
    controlMethods: ['fixed.control'],
    transport: { send: (frame) => parent.receive(frame) },
  })
  return {
    parent,
    child,
    close() {
      parent.close()
      child?.close()
    },
  }
}
const owner = (unitId: string, generation = 1): RuntimeOwner => ({
  unitId,
  generation,
  incarnation: crypto.randomUUID(),
})

test('logical IPC cancellation retains callback capacity until the real late reply', async () => {
  const peers = pair(owner('source'), owner('base'))
  const gate = new RuntimeDriverCallbackGate()
  const held = deferred()
  const abort = new AbortController()
  const signal = new AbortController().signal
  let received = 0
  peers.child.register(
    'callback',
    procedure(z.undefined(), z.undefined(), async () => {
      received++
      await held.promise
    }),
  )
  const work = Array.from({ length: 6 }, (_, index) =>
    outcome(
      gate.run(index === 0 ? abort.signal : signal, 2_000, (options) =>
        peers.parent.call('callback', undefined, z.undefined(), {
          ...options,
          signal: index === 0 ? abort.signal : signal,
        }),
      ),
    ),
  )
  const waiting = outcome(
    gate.run(signal, 2_000, (options) => peers.parent.call('callback', undefined, z.undefined(), options)),
  )
  try {
    await until(() => received === 6)
    abort.abort()
    expect((await work[0])?.value).toMatchObject({ code: 'IPC_CANCELLED' })
    expect(gate.snapshot()).toMatchObject({ active: 6, unconfirmed: 1, queued: 1, fenced: false })
    expect(peers.parent.snapshot()).toMatchObject({ inFlight: 6 })
    expect(received).toBe(6)
    held.release()
    await Promise.all([...work, waiting])
    expect(received).toBe(7)
    expect(gate.snapshot()).toMatchObject({ active: 0, unconfirmed: 0, queued: 0, fenced: false })
  } finally {
    held.release()
    gate.close()
    peers.close()
    await Promise.all([...work, waiting])
  }
})

test('bounded queue rejects overflow, queued cancellation sends no RPC, and close preserves active permits', async () => {
  const gate = new RuntimeDriverCallbackGate()
  const held = deferred()
  const signal = new AbortController().signal
  const abort = new AbortController()
  let dispatched = 0
  const operation = (options: Parameters<Parameters<RuntimeDriverCallbackGate['run']>[2]>[0]) => {
    dispatched++
    return held.promise.then(() => options.onDispatchSettled('reply'))
  }
  const active = Array.from({ length: 6 }, () => outcome(gate.run(signal, 2_000, operation)))
  const queued = Array.from({ length: 128 }, (_, index) =>
    outcome(gate.run(index === 0 ? abort.signal : signal, 2_000, operation)),
  )
  try {
    await until(() => dispatched === 6)
    expect(gate.snapshot()).toMatchObject({ active: 6, queued: 128 })
    expect((await outcome(gate.run(signal, 2_000, operation))).value).toMatchObject({
      code: 'DRIVER_CALLBACK_GATE_BUSY',
    })
    const reason = new Error('Queued local cancellation')
    abort.abort(reason)
    expect((await queued[0])?.value).toBe(reason)
    expect(gate.snapshot()).toMatchObject({ queued: 127, fenced: false })
    gate.close()
    await Promise.all(queued)
    expect(dispatched).toBe(6)
    expect(gate.snapshot()).toMatchObject({ active: 6, queued: 0, closed: true })
    held.release()
    await Promise.all(active)
    expect(gate.snapshot().active).toBe(0)
  } finally {
    held.release()
    gate.close()
    await Promise.all([...active, ...queued])
  }
})

test('queue wait consumes the original callback deadline and expires without dispatch', async () => {
  const gate = new RuntimeDriverCallbackGate()
  const held = deferred()
  const signal = new AbortController().signal
  const active = Array.from({ length: 6 }, () =>
    outcome(gate.run(signal, 2_000, (options) => held.promise.then(() => options.onDispatchSettled('reply')))),
  )
  let expiredDispatch = 0
  const expired = outcome(
    gate.run(signal, 30, async (options) => {
      expiredDispatch++
      options.onDispatchSettled('not-dispatched')
    }),
  )
  let remaining = 2_000
  const accepted = outcome(
    gate.run(signal, 2_000, async (options) => {
      remaining = options.timeoutMs
      options.onDispatchSettled('not-dispatched')
    }),
  )
  try {
    expect((await expired).value).toMatchObject({ code: 'IPC_TIMEOUT' })
    expect(expiredDispatch).toBe(0)
    expect(gate.snapshot()).toMatchObject({ active: 6, queued: 1, fenced: false })
    held.release()
    await Promise.all([...active, accepted])
    expect(remaining).toBeLessThan(1_980)
    expect(remaining).toBeGreaterThan(0)
    expect(gate.snapshot().active).toBe(0)
  } finally {
    held.release()
    gate.close()
    await Promise.all([...active, expired, accepted])
  }
})

for (const interrupt of ['close', 'fence']) {
  test('a granted callback rechecks ' + interrupt + ' before dispatch', async () => {
    const gate = new RuntimeDriverCallbackGate()
    const signal = new AbortController().signal
    const holds = Array.from({ length: 6 }, () => deferred())
    const receipts: Array<Parameters<Parameters<RuntimeDriverCallbackGate['run']>[2]>[0]> = []
    const work = holds.map((held, index) =>
      outcome(
        gate.run(signal, 2_000, (options) => {
          receipts[index] = options
          return held.promise
        }),
      ),
    )
    let dispatched = 0
    const waiting = outcome(
      gate.run(signal, 2_000, async (options) => {
        dispatched++
        options.onDispatchSettled('reply')
      }),
    )
    try {
      await until(() => receipts.length === 6)
      if (interrupt === 'fence') holds[1]?.fail(new HbarError('IPC_DISCONNECTED', 'Physical outcome unknown'))
      receipts[0]?.onDispatchSettled('reply')
      if (interrupt === 'close') gate.close()
      expect((await waiting).value).toMatchObject({
        code: interrupt === 'close' ? 'DRIVER_CALLBACK_GATE_CLOSED' : 'DRIVER_CALLBACK_GATE_FENCED',
      })
      expect(dispatched).toBe(0)
      expect(gate.snapshot()).toMatchObject({ active: 5, queued: 0, unconfirmed: interrupt === 'fence' ? 1 : 0 })
      gate.close()
      expect(gate.snapshot().active).toBe(5)
    } finally {
      for (const receipt of receipts) receipt.onDispatchSettled('reply')
      for (const held of holds) held.release()
      gate.close()
      await Promise.all([...work, waiting])
    }
    expect(gate.snapshot()).toMatchObject({ active: 0, unconfirmed: 0 })
  })
}

test('a business reply releases admission but peer close cannot prove physical completion', async () => {
  const peers = pair(owner('source'), owner('base'))
  const gate = new RuntimeDriverCallbackGate()
  const signal = new AbortController().signal
  const held = deferred()
  peers.child.register(
    'business',
    procedure(z.undefined(), z.undefined(), () => {
      throw new HbarError('WORKFLOW_SCOPE_REQUIRED', 'Local rejection')
    }),
  )
  peers.child.register(
    'blocked',
    procedure(z.undefined(), z.undefined(), () => held.promise),
  )
  let work: Promise<unknown> | undefined
  try {
    expect(
      (
        await outcome(
          gate.run(signal, 2_000, (options) => peers.parent.call('business', undefined, z.undefined(), options)),
        )
      ).value,
    ).toMatchObject({ code: 'WORKFLOW_SCOPE_REQUIRED' })
    expect(gate.snapshot()).toMatchObject({ active: 0, fenced: false })
    work = outcome(
      gate.run(signal, 2_000, (options) => peers.parent.call('blocked', undefined, z.undefined(), options)),
    )
    await until(() => peers.parent.snapshot().inFlight === 1)
    peers.parent.close()
    await work
    expect(gate.snapshot()).toMatchObject({ active: 1, unconfirmed: 1, fenced: true })
    gate.close()
    expect(gate.snapshot()).toMatchObject({ active: 1, unconfirmed: 1, closed: true })
  } finally {
    held.release()
    gate.close()
    peers.close()
    await work
  }
})

test('real relay shares six target-Kernel admissions across two physical driver generations', async () => {
  const base = owner('base'),
    kernel = owner('kernel'),
    drivers = [owner('driver.pi', 1), owner('driver.pi', 2)]
  const version = (value: RuntimeOwner): RuntimeVersion => ({
    unitId: value.unitId,
    generation: value.generation,
    artifactId: String(value.generation).repeat(64),
  })
  const coordinator = new RuntimeCoordinator({
    claim: async (lease) => lease,
    release: async () => {},
    revoke: async () => {},
  })
  const kp = pair(base, kernel)
  const driverPeers = drivers.map((value) => ({ owner: value, peers: pair(base, value) }))
  for (const value of [kernel, ...drivers])
    coordinator.register(value, version(value), {
      id: value.unitId,
      kind: value === kernel ? 'kernel' : 'driver',
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: 'a'.repeat(64),
      storageSchema: 24,
    })
  coordinator.activate(kernel)
  const relay = new RuntimeDriverRelay({
    coordinator,
    resolve: (selected) => {
      const target = driverPeers.find((entry) => entry.owner.generation === selected?.generation)
      if (!target) throw new Error('Unknown fixture driver')
      return { owner: target.owner, version: version(target.owner), peer: target.peers.parent }
    },
  })
  const detach = [relay.attachKernel(kp.parent), ...driverPeers.map((entry) => relay.attachDriver(entry.peers.parent))]
  const held = deferred()
  let received = 0
  let leafReceived = 0
  let leafRunning = 0
  let leafPeak = 0
  let combinedPeak = 0
  let running = 0
  let peak = 0
  kp.child.register(
    'driver.callback',
    procedure(runtimeDriverCallbackSchema, z.null(), async (input) => {
      if (input.method === 'closeSteering') {
        leafReceived++
        leafRunning++
        leafPeak = Math.max(leafPeak, leafRunning)
        combinedPeak = Math.max(combinedPeak, running + leafRunning)
        try {
          await held.promise
          return null
        } finally {
          leafRunning--
        }
      }
      received++
      running++
      peak = Math.max(peak, running)
      combinedPeak = Math.max(combinedPeak, running + leafRunning)
      try {
        await held.promise
        return null
      } finally {
        running--
      }
    }),
  )
  for (const entry of driverPeers)
    entry.peers.child.register(
      'driver.start',
      procedure(runtimeDriverStartSchema, z.object({ invocationId: z.string() }), (input) => ({
        invocationId: input.invocationId,
      })),
    )
  const callbacks: Array<Promise<unknown>> = []
  try {
    for (const entry of driverPeers) {
      coordinator.activate(entry.owner)
      for (let index = 0; index < 6; index++) {
        const id = entry.owner.incarnation + '-' + index
        const ownership = await coordinator.claim(kernel, 'session-' + id, 'run-' + id, {
          kernel: version(kernel),
          driver: version(entry.owner),
          plugins: [],
          hooks: [],
        })
        if (!ownership) throw new Error('Fixture claim rejected')
        const input = runtimeDriverStartSchema.parse({
          invocationId: id,
          ownership,
          apiKey: null,
          steering: false,
          tools: [],
          workspace: { id: 'workspace', path: process.cwd(), name: 'Fixture', createdAt: 1 },
          session: {
            id: 'session-' + id,
            workspaceId: 'workspace',
            title: 'Fixture',
            archived: false,
            parentId: null,
            createdAt: 1,
            updatedAt: 1,
            seq: 0,
          },
          run: {
            id: 'run-' + id,
            sessionId: 'session-' + id,
            requestId: id,
            input: { text: 'fixture', images: [] },
            modelId: 'fixture',
            status: 'running',
            createdAt: 1,
            startedAt: 1,
            endedAt: null,
            error: null,
          },
          request: {
            system: 'fixture',
            model: providerSchema.parse({
              id: 'fixture',
              name: 'Fixture',
              protocol: 'mock',
              model: 'fixture',
              baseUrl: 'http://127.0.0.1',
            }),
            messages: [],
          },
        })
        await kp.child.call('driver.start', input, z.object({ invocationId: z.string() }))
        callbacks.push(
          outcome(
            entry.peers.child.call(
              'driver.callback',
              { invocationId: id, method: 'resolveKey', modelId: 'fixture' },
              z.null(),
            ),
          ),
        )
      }
    }
    for (const entry of driverPeers) {
      for (let index = 0; index < 6; index++)
        callbacks.push(
          outcome(
            entry.peers.child.call(
              'driver.callback',
              { invocationId: entry.owner.incarnation + '-' + index, method: 'closeSteering' },
              z.null(),
            ),
          ),
        )
    }
    await until(() => received === 6 && leafReceived === 2)
    await Bun.sleep(10)
    expect(received).toBe(6)
    expect(kp.parent.snapshot().inFlight).toBe(8)
    expect(leafReceived).toBe(2)
    held.release()
    const results = await Promise.all(callbacks)
    expect(
      results.every((result) => result && typeof result === 'object' && 'ok' in result && result.ok === true),
    ).toBe(true)
    expect(received).toBe(12)
    expect(peak).toBeLessThanOrEqual(6)
    expect(leafReceived).toBe(12)
    expect(leafPeak).toBe(2)
    expect(combinedPeak).toBe(8)
  } finally {
    held.release()
    relay.kernelExited(kernel)
    for (const driver of drivers) relay.driverExited(driver)
    for (const dispose of detach) dispose()
    kp.close()
    for (const entry of driverPeers) entry.peers.close()
    await Promise.all(callbacks)
  }
})

test('fixed leaf admission progresses beside six held recursive IPC handlers with a shared waiting bound', async () => {
  const peers = pair(owner('source'), owner('base'))
  const admission = new RuntimeDriverCallbackAdmission()
  const held = deferred()
  const signal = new AbortController().signal
  let received = 0
  peers.child.register(
    'callback',
    procedure(z.undefined(), z.undefined(), async () => {
      received++
      await held.promise
    }),
  )
  const invoke = (method: string) =>
    outcome(
      admission.run(method, signal, 2_000, (options) =>
        peers.parent.call('callback', undefined, z.undefined(), options),
      ),
    )
  const active = [
    ...Array.from({ length: 6 }, () => invoke('execute')),
    ...Array.from({ length: 2 }, () => invoke('emit')),
  ]
  const queued = Array.from({ length: 128 }, (_, i) => invoke(i % 2 ? 'execute' : 'emit'))
  try {
    await until(() => received === 8)
    expect(admission.snapshot()).toMatchObject({
      active: 8,
      queued: 128,
      recursive: { active: 6 },
      leaf: { active: 2 },
    })
    expect((await invoke('emit')).value).toMatchObject({ code: 'DRIVER_CALLBACK_GATE_BUSY' })
    expect((await invoke('execute')).value).toMatchObject({ code: 'DRIVER_CALLBACK_GATE_BUSY' })
    admission.close()
    await Promise.all(queued)
    expect(received).toBe(8)
    expect(admission.snapshot()).toMatchObject({ active: 8, queued: 0 })
    held.release()
    await Promise.all(active)
    expect(admission.snapshot().active).toBe(0)
  } finally {
    held.release()
    admission.close()
    peers.close()
    await Promise.all([...active, ...queued])
  }
})

for (const interrupt of ['close', 'fence']) {
  test(
    'cross-lane ' + interrupt + ' rejects granted leaf before RPC and preserves unknown recursive permit',
    async () => {
      const admission = new RuntimeDriverCallbackAdmission()
      const signal = new AbortController().signal
      const heavy = deferred(),
        leaf = deferred()
      const receipts: Array<Parameters<Parameters<RuntimeDriverCallbackGate['run']>[2]>[0]> = []
      const work = [
        outcome(
          admission.run('execute', signal, 2_000, (options) => {
            receipts[0] = options
            return heavy.promise
          }),
        ),
      ]
      for (let i = 0; i < 2; i++)
        work.push(
          outcome(
            admission.run('emit', signal, 2_000, (options) => {
              receipts[i + 1] = options
              return leaf.promise
            }),
          ),
        )
      let dispatched = 0
      const queued = outcome(
        admission.run('emit', signal, 2_000, async (options) => {
          dispatched++
          options.onDispatchSettled('reply')
        }),
      )
      try {
        await until(() => receipts.length === 3)
        if (interrupt === 'fence') heavy.fail(new HbarError('IPC_DISCONNECTED', 'Unknown physical outcome'))
        receipts[1]?.onDispatchSettled('reply')
        if (interrupt === 'close') admission.close()
        expect((await queued).value).toMatchObject({
          code: interrupt === 'close' ? 'DRIVER_CALLBACK_GATE_CLOSED' : 'DRIVER_CALLBACK_GATE_FENCED',
        })
        expect(dispatched).toBe(0)
        expect(admission.snapshot()).toMatchObject({
          active: 2,
          queued: 0,
          recursive: { active: 1, unconfirmed: interrupt === 'fence' ? 1 : 0 },
          leaf: { active: 1 },
        })
        expect(
          (
            await outcome(
              admission.run('execute', signal, 2_000, async (options) => options.onDispatchSettled('reply')),
            )
          ).value,
        ).toMatchObject({ code: interrupt === 'close' ? 'DRIVER_CALLBACK_GATE_CLOSED' : 'DRIVER_CALLBACK_GATE_FENCED' })
        expect(
          (
            await outcome(
              admission.run('modelDiagnostic', signal, 2_000, async (options) => options.onDispatchSettled('reply')),
            )
          ).value,
        ).toMatchObject({ code: interrupt === 'close' ? 'DRIVER_CALLBACK_GATE_CLOSED' : 'DRIVER_CALLBACK_GATE_FENCED' })
      } finally {
        for (const receipt of receipts) receipt.onDispatchSettled('reply')
        heavy.release()
        leaf.release()
        admission.close()
        await Promise.all([...work, queued])
      }
      expect(admission.snapshot().active).toBe(0)
    },
  )
}

test('an independent public domain cancellation preserves physical permit and both lanes', async () => {
  class ForeignCancellation extends Error {
    readonly code = 'IPC_CANCELLED'
    constructor() {
      super('Caller cancelled')
      this.name = 'HbarError'
    }
  }
  const admission = new RuntimeDriverCallbackAdmission()
  const signal = new AbortController().signal
  let settlement: Parameters<Parameters<RuntimeDriverCallbackGate['run']>[2]>[0] | undefined
  const cancellation = new ForeignCancellation()
  try {
    const result = await outcome(
      admission.run('execute', signal, 2_000, async (options) => {
        settlement = options
        throw cancellation
      }),
    )
    expect(result.value).toBe(cancellation)
    expect(admission.snapshot()).toMatchObject({
      active: 1,
      recursive: { unconfirmed: 1, fenced: false },
      leaf: { fenced: false },
    })
    for (const method of ['execute', 'emit']) {
      const next = await admission.run(method, signal, 2_000, async (options) => {
        options.onDispatchSettled('reply')
        return method
      })
      expect(next).toBe(method)
    }
    expect(admission.snapshot().active).toBe(1)
    settlement?.onDispatchSettled('reply')
    expect(admission.snapshot()).toMatchObject({
      active: 0,
      recursive: { unconfirmed: 0, fenced: false },
      leaf: { fenced: false },
    })
  } finally {
    settlement?.onDispatchSettled('reply')
    admission.close()
  }
})

test('bundled admission accepts unbundled real IPC cancellation until the late physical reply', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hbar-callback-bundle-'))
  const peers = pair(owner('source'), owner('base'))
  const held = deferred()
  const abort = new AbortController()
  const signal = new AbortController().signal
  let admission: RuntimeDriverCallbackAdmission | undefined
  let work: Promise<unknown> | undefined
  let failed = false
  let primary: unknown
  const cleanup: unknown[] = []
  try {
    const build = await Bun.build({
      entrypoints: [resolve('apps/host/src/runtime-driver-callback-gate.ts')],
      outdir: directory,
      target: 'bun',
      format: 'esm',
      splitting: false,
    })
    if (!build.success || build.outputs.length !== 1) throw new Error('Callback bundle fixture build failed')
    const output = build.outputs[0]
    if (!output) throw new Error('Missing callback bundle output')
    const imported: unknown = await import(pathToFileURL(output.path).href)
    const Constructor = z
      .object({
        RuntimeDriverCallbackAdmission: z.custom<typeof RuntimeDriverCallbackAdmission>((value) => {
          if (typeof value !== 'function') return false
          const prototype: unknown = Reflect.get(value, 'prototype')
          return z.object({ run: z.function(), snapshot: z.function(), close: z.function() }).safeParse(prototype)
            .success
        }),
      })
      .parse(imported).RuntimeDriverCallbackAdmission
    admission = new Constructor()
    const active = admission
    let received = 0
    peers.child.register(
      'callback',
      procedure(z.undefined(), z.undefined(), async () => {
        received++
        await held.promise
      }),
    )
    peers.child.register(
      'fixed.control',
      procedure(z.undefined(), z.undefined(), () => undefined),
    )
    work = outcome(
      active.run('execute', abort.signal, 2_000, (options) =>
        peers.parent.call('callback', undefined, z.undefined(), { ...options, signal: abort.signal }),
      ),
    )
    await until(() => received === 1)
    abort.abort()
    expect(await work).toMatchObject({ ok: false, value: { code: 'IPC_CANCELLED' } })
    expect(active.snapshot()).toMatchObject({
      active: 1,
      recursive: { unconfirmed: 1, fenced: false },
      leaf: { fenced: false },
    })
    for (const method of ['execute', 'emit']) {
      expect(
        await active.run(method, signal, 2_000, (options) =>
          peers.parent.call('fixed.control', undefined, z.undefined(), options),
        ),
      ).toBeUndefined()
    }
    expect(active.snapshot()).toMatchObject({ active: 1, recursive: { fenced: false }, leaf: { fenced: false } })
    held.release()
    await until(() => active.snapshot().active === 0)
    expect(active.snapshot()).toMatchObject({
      active: 0,
      recursive: { unconfirmed: 0, fenced: false },
      leaf: { fenced: false },
    })
  } catch (error) {
    failed = true
    primary = error
  }
  held.release()
  try {
    admission?.close()
  } catch (error) {
    cleanup.push(error)
  }
  try {
    peers.close()
    await work
  } catch (error) {
    cleanup.push(error)
  }
  try {
    const target = resolve(directory)
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-callback-bundle-'))
      throw new Error('Unsafe callback bundle cleanup path')
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  } catch (error) {
    cleanup.push(error)
  }
  if (failed) {
    if (cleanup.length)
      throw new AggregateError([primary, ...cleanup], 'Callback bundle fixture failed', { cause: primary })
    throw primary
  }
  if (cleanup.length) throw new AggregateError(cleanup, 'Callback bundle fixture cleanup failed')
})
