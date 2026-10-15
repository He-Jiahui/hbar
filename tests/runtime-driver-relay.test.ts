import { expect, test } from 'bun:test'
import { HbarError } from '@hbar/contracts/errors'
import { driverRelayFixture } from './fixtures/runtime-driver-relay'

const outcome = (promise: Promise<unknown>) => promise.catch((error: unknown) => error)
async function settled(check: () => boolean) {
  const deadline = Date.now() + 2_000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('Driver relay did not settle')
    await Bun.sleep(5)
  }
}

test('driver retries share the original receipt while changed context and forged ownership are rejected', async () => {
  const f = driverRelayFixture()
  try {
    const input = await f.payload('original', 'context'.repeat(16_384))
    expect(await f.start(input)).toEqual({ invocationId: 'original' })
    expect(await f.start(structuredClone(input))).toEqual({ invocationId: 'original' })
    expect(f.stats()).toMatchObject({ starts: 1, invocations: 1 })
    for (const changed of [
      { ...input, request: { ...input.request, system: input.request.system + 'changed' } },
      { ...input, apiKey: 'different-local-fixture-key' },
      { ...input, steering: true },
    ]) {
      expect(await outcome(f.start(changed))).toMatchObject({ code: 'DRIVER_INVOCATION_CONFLICT' })
    }
    const forged = structuredClone(input)
    if (!forged.ownership) throw new Error('Fixture ownership missing')
    forged.ownership.owner.incarnation = 'foreign'
    expect(await outcome(f.start(forged))).toMatchObject({ code: 'EXECUTION_OWNER_MISMATCH' })
    expect(await f.callback(input.invocationId)).toBeNull()
    await f.terminal(input.invocationId)
    await settled(() => f.stats().invocations === 0)
    expect(f.stats()).toEqual({ starts: 1, callbacks: 1, terminals: 1, invocations: 0 })
  } finally {
    f.close()
  }
})

test('an unknown start result keeps physical routing and reuses its failure until terminal or driver exit', async () => {
  const f = driverRelayFixture({ startError: new HbarError('DRIVER_START_UNKNOWN', 'Local fixture unknown result') })
  try {
    const input = await f.payload('unknown')
    expect(await outcome(f.start(input))).toMatchObject({ code: 'DRIVER_START_UNKNOWN' })
    expect(await outcome(f.start(input))).toMatchObject({ code: 'DRIVER_START_UNKNOWN' })
    expect(f.stats()).toMatchObject({ starts: 1, invocations: 1 })
    expect(await f.callback(input.invocationId)).toBeNull()
    await f.terminal(input.invocationId)
    await settled(() => f.stats().invocations === 0)
    const second = await f.payload('exited')
    expect(await outcome(f.start(second))).toMatchObject({ code: 'DRIVER_START_UNKNOWN' })
    f.relay.driverExited(f.driver)
    expect(f.stats().invocations).toBe(0)
  } finally {
    f.close()
  }
})

test('thirty active routes retain independent receipts, callbacks and terminal cleanup', async () => {
  const f = driverRelayFixture()
  try {
    const payloads = await Promise.all(
      Array.from({ length: 30 }, (_, index) => f.payload(`parallel-${index}`, `${index}:` + 'context'.repeat(2048))),
    )
    await Promise.all(payloads.map((input) => f.start(input)))
    expect(f.stats()).toMatchObject({ starts: 30, invocations: 30 })
    await Promise.all(payloads.map((input) => f.start(input)))
    expect(f.stats().starts).toBe(30)
    await Promise.all(payloads.map((input) => f.callback(input.invocationId)))
    await Promise.all(payloads.map((input) => f.terminal(input.invocationId)))
    await settled(() => f.stats().invocations === 0)
    expect(f.stats()).toEqual({ starts: 30, callbacks: 30, terminals: 30, invocations: 0 })
  } finally {
    f.close()
  }
})
