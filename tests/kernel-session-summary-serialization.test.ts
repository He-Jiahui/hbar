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
  readonly failure?: Error
}

async function createFixture() {
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
            if (gate.failure) throw gate.failure
          }
          return snapshot as ReturnType<StorageMethods[K]>
        } finally {
          activeReads -= 1
        }
      }
      return storage.call(method, ...args)
    },
    close: async () => {},
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

test('public Kernel close suppresses a blocked session summary publication', async () => {
  const fixture = await createFixture()
  const summaries: unknown[] = []
  fixture.kernel.subscribe((event) => {
    if (event.method === 'session.summary') summaries.push(event)
  })
  fixture.gates.push({ entered: deferred(), release: deferred() })
  fixture.enableGates()
  await fixture.kernel.append(fixture.sessionId, 'fixture.changed', { index: 0 })
  await fixture.gates[0]?.entered.promise
  await fixture.kernel.close()
  fixture.gates[0]?.release.resolve()
  await new Promise((resolve) => setTimeout(resolve, 120))
  expect(summaries).toHaveLength(0)
  await fixture.storage.close()
  await rm(fixture.root, { recursive: true, force: true })
})
