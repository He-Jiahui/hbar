// SOURCE-ONLY DRAFT. Not executed; these tests do NOT prove process exit/native join.
import { expect, test } from 'bun:test'
import {
  readRuntimeIdleProbe,
  runtimeIdleIpcIsEmpty,
  runtimeIdleProbeSchema,
  type RuntimeIdleIpc,
  type RuntimeServiceIdle,
} from '../packages/runtime/src/lifecycle'

function wire(overrides: Partial<RuntimeIdleIpc> = {}): RuntimeIdleIpc {
  return {
    inFlight: 0,
    waiting: 0,
    queued: 0,
    queuedBytes: 0,
    incoming: 1,
    incomingWaiting: 0,
    incomingQueued: 0,
    incomingBytes: 128,
    bufferedBytes: 0,
    failed: false,
    ...overrides,
  }
}
const zero: RuntimeServiceIdle = { eligible: true, requests: 0, runs: 0, resources: 0 }

test('unsupported and non-serving roles never acquire idle eligibility', async () => {
  expect(
    (
      await readRuntimeIdleProbe(
        undefined,
        () => 'serving',
        () => wire(),
      )
    ).eligible,
  ).toBe(false)
  let reads = 0
  const service = {
    idle: () => {
      reads++
      return zero
    },
  }
  for (const phase of ['boot', 'preparing', 'ready', 'disposed'])
    expect(
      (
        await readRuntimeIdleProbe(
          service,
          () => phase,
          () => wire(),
        )
      ).eligible,
    ).toBe(false)
  expect(reads).toBe(0)
})

test('the exact current inbound probe is excluded, raw byte evidence remains', async () => {
  const counters = wire()
  const before = structuredClone(counters)
  const probe = await readRuntimeIdleProbe(
    { idle: () => zero },
    () => 'serving',
    () => counters,
  )
  expect(runtimeIdleProbeSchema.parse(probe).eligible).toBe(true)
  expect(probe.ipc.incoming).toBe(0)
  expect(probe.ipc.incomingBytes).toBe(128)
  expect(counters).toEqual(before)
})

test('both-direction calls, queued frames and fragment sends each veto eligibility', async () => {
  const occupied: Partial<RuntimeIdleIpc>[] = [
    { inFlight: 1 },
    { waiting: 1 },
    { incomingWaiting: 1 },
    { queued: 1 },
    { queuedBytes: 1 },
    { incoming: 2 },
    { incomingQueued: 1 },
    { bufferedBytes: 1 },
    { failed: true },
  ]
  for (const counter of occupied)
    expect(
      (
        await readRuntimeIdleProbe(
          { idle: () => zero },
          () => 'draining',
          () => wire(counter),
        )
      ).eligible,
    ).toBe(false)
  expect(runtimeIdleIpcIsEmpty(wire({ incoming: 0, bufferedBytes: 1 }))).toBe(false)
})

test('service retained work and lifecycle movement across await cannot pass a probe', async () => {
  for (const counts of [
    { ...zero, requests: 1 },
    { ...zero, runs: 1 },
    { ...zero, resources: 1 },
    { ...zero, eligible: false },
  ])
    expect(
      (
        await readRuntimeIdleProbe(
          { idle: () => counts },
          () => 'serving',
          () => wire(),
        )
      ).eligible,
    ).toBe(false)
  let phase = 'serving'
  const result = await readRuntimeIdleProbe(
    {
      idle: async () => {
        await Promise.resolve()
        phase = 'disposed'
        return zero
      },
    },
    () => phase,
    () => wire(),
  )
  expect(result.eligible).toBe(false)
})

test('service probe errors remain unknown failures rather than fabricated idle', async () => {
  const primary = new Error('fixture failure')
  const observed = readRuntimeIdleProbe(
    {
      idle: () => {
        throw primary
      },
    },
    () => 'serving',
    () => wire(),
  )
  await expect(observed).rejects.toBe(primary)
})
