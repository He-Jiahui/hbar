import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { Storage, type StorageMethods, type StoragePort } from '@hbar/storage'

interface Deferred {
  readonly promise: Promise<void>
  readonly resolve: () => void
}

function deferred(): Deferred {
  let resolve!: () => void
  const promise = new Promise<void>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 3_000
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for the Kernel session summary')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

interface SummaryGate {
  readonly entered: Deferred
  readonly release: Deferred
  readonly failure?: unknown
}

async function createFixture(options: { readonly storageCloseFailure?: unknown } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-summary-coalescing-'))
  const storage = new Storage(join(root, 'state.sqlite'))
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', root, 'fixture')
  const session = await storage.call('createSession', workspace.id)
  const gates: SummaryGate[] = []
  let gateEnabled = false
  let summaryCalls = 0
  let activeReads = 0
  let maxActiveReads = 0
  let storagePortClosed = false
  const port: StoragePort = {
    call: async <K extends keyof StorageMethods>(method: K, ...args: Parameters<StorageMethods[K]>) => {
      if (method === 'sessionSummary' && gateEnabled) {
        summaryCalls += 1
        activeReads += 1
        maxActiveReads = Math.max(maxActiveReads, activeReads)
        const gate = gates[summaryCalls - 1]
        try {
          const snapshot = await storage.call('sessionSummary', args[0] as string)
          if (gate) {
            gate.entered.resolve()
            await gate.release.promise
            if ('failure' in gate) throw gate.failure
          }
          return snapshot as ReturnType<StorageMethods[K]>
        } finally {
          activeReads -= 1
        }
      }
      return storage.call(method, ...args)
    },
    close: () => {
      storagePortClosed = true
      return 'storageCloseFailure' in options ? Promise.reject(options.storageCloseFailure) : Promise.resolve()
    },
  }
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    lifecycle: 'managed',
    demo: true,
    secrets: new MemorySecrets(),
    profile: { createStorage: async () => port },
  })
  await kernel.activate()
  return {
    root,
    storage,
    sessionId: session.id,
    kernel,
    gates,
    enableGates() {
      gateEnabled = true
    },
    get summaryCalls() {
      return summaryCalls
    },
    get maxActiveReads() {
      return maxActiveReads
    },
    get activeReads() {
      return activeReads
    },
    get storagePortClosed() {
      return storagePortClosed
    },
  }
}

test('public Kernel/StoragePort coalesces bursts during a blocked summary read and publishes the final sequence', async () => {
  const fixture = await createFixture()
  const summaries: Array<{ seq: number }> = []
  fixture.kernel.subscribe((event) => {
    if (event.method === 'session.summary') summaries.push({ seq: event.params.seq })
  })
  try {
    fixture.gates.push(...Array.from({ length: 3 }, () => ({ entered: deferred(), release: deferred() })))
    fixture.enableGates()
    await fixture.kernel.append(fixture.sessionId, 'fixture.changed', { index: 0 })
    await fixture.gates[0]?.entered.promise

    for (let index = 1; index <= 8; index += 1)
      await fixture.kernel.append(fixture.sessionId, 'fixture.changed', { index })
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(fixture.summaryCalls).toBe(1)
    expect(fixture.maxActiveReads).toBe(1)

    fixture.gates[0]?.release.resolve()
    await fixture.gates[1]?.entered.promise
    await fixture.kernel.append(fixture.sessionId, 'fixture.changed', { index: 9 })
    await fixture.kernel.append(fixture.sessionId, 'fixture.changed', { index: 10 })
    fixture.gates[1]?.release.resolve()
    await fixture.gates[2]?.entered.promise
    expect(fixture.summaryCalls).toBe(3)
    expect(fixture.maxActiveReads).toBe(1)

    const latest = await fixture.storage.call('sessionSummary', fixture.sessionId)
    fixture.gates[2]?.release.resolve()
    await waitFor(() => summaries.at(-1)?.seq === latest.seq)
    expect(summaries.length).toBeGreaterThan(0)
    expect(summaries.every((summary, index) => index === 0 || summary.seq > (summaries[index - 1]?.seq ?? 0))).toBe(
      true,
    )
    expect(summaries.at(-1)?.seq).toBe(latest.seq)
    expect(fixture.maxActiveReads).toBe(1)
  } finally {
    await fixture.kernel.close()
    await fixture.storage.close()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('public Kernel keeps publishing bounded summaries during repeated same-run appends', async () => {
  const fixture = await createFixture()
  const summaries: Array<{ seq: number }> = []
  fixture.kernel.subscribe((event) => {
    if (event.method === 'session.summary') summaries.push({ seq: event.params.seq })
  })
  try {
    fixture.gates.push(...Array.from({ length: 4 }, () => ({ entered: deferred(), release: deferred() })))
    fixture.enableGates()
    await fixture.kernel.append(fixture.sessionId, 'fixture.changed', { index: 0 })
    for (let index = 0; index < 3; index += 1) {
      const currentGate = fixture.gates[index]
      const nextGate = fixture.gates[index + 1]
      await currentGate?.entered.promise
      await fixture.kernel.append(fixture.sessionId, 'fixture.changed', { index: index + 1 })
      currentGate?.release.resolve()
      await nextGate?.entered.promise
    }
    const latest = await fixture.storage.call('sessionSummary', fixture.sessionId)
    fixture.gates[3]?.release.resolve()
    await waitFor(() => summaries.at(-1)?.seq === latest.seq)
    expect(summaries).toHaveLength(4)
    expect(summaries.every((summary, index) => index === 0 || summary.seq > (summaries[index - 1]?.seq ?? 0))).toBe(
      true,
    )
    expect(fixture.maxActiveReads).toBe(1)
  } finally {
    await fixture.kernel.close()
    await fixture.storage.close()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('public Kernel releases a failed summary read and publishes the latest pending update', async () => {
  const fixture = await createFixture()
  const summaries: Array<{ seq: number }> = []
  fixture.kernel.subscribe((event) => {
    if (event.method === 'session.summary') summaries.push({ seq: event.params.seq })
  })
  try {
    fixture.gates.push(
      { entered: deferred(), release: deferred(), failure: new Error('fixture summary read failure') },
      { entered: deferred(), release: deferred() },
    )
    fixture.enableGates()
    await fixture.kernel.append(fixture.sessionId, 'fixture.changed', { index: 0 })
    await fixture.gates[0]?.entered.promise
    await fixture.kernel.append(fixture.sessionId, 'fixture.changed', { index: 1 })
    fixture.gates[0]?.release.resolve()
    await fixture.gates[1]?.entered.promise
    const latest = await fixture.storage.call('sessionSummary', fixture.sessionId)
    fixture.gates[1]?.release.resolve()
    await waitFor(() => summaries.at(-1)?.seq === latest.seq)
    expect(fixture.summaryCalls).toBe(2)
    expect(fixture.maxActiveReads).toBe(1)
  } finally {
    await fixture.kernel.close()
    await fixture.storage.close()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('public Kernel close waits for a blocked summary before storage retirement and suppresses publication', async () => {
  const fixture = await createFixture()
  const summaries: unknown[] = []
  fixture.kernel.subscribe((event) => {
    if (event.method === 'session.summary') summaries.push(event)
  })
  fixture.gates.push({ entered: deferred(), release: deferred() })
  fixture.enableGates()
  await fixture.kernel.append(fixture.sessionId, 'fixture.changed', { index: 0 })
  await fixture.gates[0]?.entered.promise
  let closed = false
  const close = fixture.kernel.close().then(() => {
    closed = true
  })
  try {
    await Bun.sleep(0)
    expect(closed).toBe(false)
    expect(fixture.activeReads).toBe(1)
    expect(fixture.storagePortClosed).toBe(false)
    fixture.gates[0]?.release.resolve()
    await close
    expect(closed).toBe(true)
    expect(fixture.activeReads).toBe(0)
    expect(fixture.storagePortClosed).toBe(true)
    expect(summaries).toHaveLength(0)
  } finally {
    for (const gate of fixture.gates) gate.release.resolve()
    await close
    await fixture.storage.close()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('public Kernel close retires storage after a settled failed summary and then propagates the failure', async () => {
  const fixture = await createFixture()
  const failure = new Error('controlled-summary-shutdown-read-failure')
  const gate = { entered: deferred(), release: deferred(), failure }
  fixture.gates.push(gate)
  fixture.enableGates()
  try {
    await fixture.kernel.append(fixture.sessionId, 'fixture.changed', { index: 0 })
    await gate.entered.promise
    const outcome = fixture.kernel.close().then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error }),
    )
    gate.release.resolve()
    const result = await outcome
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('EXPECTED_SUMMARY_DRAIN_FAILURE')
    expect(result.error).toMatchObject({ code: 'SUMMARY_DRAIN_FAILED' })
    expect(fixture.activeReads).toBe(0)
    expect(fixture.storagePortClosed).toBe(true)
  } finally {
    gate.release.resolve()
    await fixture.storage.close()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('settled falsy summary and storage cleanup failures are both preserved after cleanup attempts', async () => {
  const fixture = await createFixture({ storageCloseFailure: 0 })
  const gate = { entered: deferred(), release: deferred(), failure: false }
  fixture.gates.push(gate)
  fixture.enableGates()
  try {
    await fixture.kernel.append(fixture.sessionId, 'fixture.changed', { index: 0 })
    await gate.entered.promise
    const outcome = fixture.kernel.close().then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error }),
    )
    gate.release.resolve()
    const result = await outcome
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('EXPECTED_AGGREGATED_SHUTDOWN_FAILURE')
    expect(result.error).toBeInstanceOf(AggregateError)
    if (!(result.error instanceof AggregateError)) throw result.error
    const errors: unknown[] = result.error.errors
    expect(errors).toHaveLength(2)
    expect(errors[1]).toBe(0)
    const summaryError = errors[0]
    if (!(summaryError instanceof Error)) throw new Error('EXPECTED_SUMMARY_FAILURE')
    expect(summaryError.cause).toBeInstanceOf(AggregateError)
    if (!(summaryError.cause instanceof AggregateError)) throw new Error('EXPECTED_SUMMARY_CAUSE')
    expect(summaryError.cause.errors).toEqual([false])
    expect(fixture.activeReads).toBe(0)
    expect(fixture.storagePortClosed).toBe(true)
  } finally {
    gate.release.resolve()
    await fixture.storage.close()
    await rm(fixture.root, { recursive: true, force: true })
  }
})
