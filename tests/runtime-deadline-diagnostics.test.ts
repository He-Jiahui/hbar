import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { diagnosticEventSchema, type DiagnosticEvent } from '@hbar/contracts'
import type { SessionWakeAck } from '@hbar/contracts/session-wake'
import { RuntimeDeadlineDiagnostics } from '../apps/host/src/runtime-deadline-diagnostics'

const owner = { unitId: 'kernel', generation: 1, incarnation: 'kernel-old' }
const hash = (value: string): string => createHash('sha256').update(value).digest('hex')
function wake(count = 1): SessionWakeAck {
  return {
    token: 'private-transfer-capability',
    manifest: {
      schemaVersion: 1,
      owner,
      revision: 9,
      entries: Array.from({ length: count }, (_, index) => ({
        sessionId: `session-${index}`,
        goalId: `goal-${index}`,
        intentId: `intent-${index}`,
        requestId: `goal-intent-${index}`,
        dueAt: 20_000 + index,
        goalRevision: 7,
      })),
    },
  }
}

test('correlates original absolute Goal deadlines across owner changes without exposing capability tokens', () => {
  const events: DiagnosticEvent[] = []
  const observer = new RuntimeDeadlineDiagnostics({ enabled: () => true, emit: (event) => events.push(event) })
  const ack = wake()
  const original = structuredClone(ack)
  observer.observe(owner, 'checkpointed', () => ({ domain: 'goal', ack }))
  observer.observe({ ...owner, generation: 2, incarnation: 'kernel-new' }, 'restored', () => ({ domain: 'goal', ack }))
  observer.observe({ ...owner, generation: 2, incarnation: 'kernel-new' }, 'serving', () => ({ domain: 'goal', ack }))
  expect(events).toHaveLength(3)
  for (const event of events) {
    expect(diagnosticEventSchema.parse(event)).toMatchObject({
      runtimeDeadline: {
        domain: 'goal',
        tokenSha256: hash(ack.token),
        checkpointSha256: hash(JSON.stringify(ack.manifest)),
        dueAt: 20_000,
        revision: 9,
        entries: 1,
      },
      sessionId: 'session-0',
    })
    expect(JSON.stringify(event)).not.toContain(ack.token)
  }
  expect(events.map((event) => event.requestId)).toEqual(['kernel-old', 'kernel-new', 'kernel-new'])
  expect(ack).toEqual(original)
})

test('disabled and failed observations neither read checkpoints nor escape to lifecycle callers', () => {
  let reads = 0
  let writes = 0
  const read = () => {
    reads++
    return { domain: 'goal' as const, ack: wake() }
  }
  const disabled = new RuntimeDeadlineDiagnostics({
    enabled: () => false,
    emit: () => {
      writes++
    },
  })
  disabled.observe(owner, 'checkpointed', read)
  expect(reads).toBe(0)
  expect(writes).toBe(0)
  const broken = new RuntimeDeadlineDiagnostics({
    enabled: () => true,
    emit: () => {
      writes++
      throw new Error('sink')
    },
  })
  expect(() => broken.observe(owner, 'restored', read)).not.toThrow()
  expect(() =>
    broken.observe(owner, 'restored', () => {
      throw new Error('metadata')
    }),
  ).not.toThrow()
  expect(reads).toBe(1)
  expect(writes).toBe(1)
})

test('bounds one observation to the public128-session capacity and retains no mutable checkpoint', () => {
  const events: DiagnosticEvent[] = []
  const observer = new RuntimeDeadlineDiagnostics({ enabled: () => true, emit: (event) => events.push(event) })
  const ack = wake(128)
  observer.observe(owner, 'checkpointed', () => ({ domain: 'goal', ack }))
  expect(events).toHaveLength(128)
  expect(events.at(-1)?.runtimeDeadline).toMatchObject({ dueAt: 20_127, entries: 128 })
  const first = ack.manifest.entries[0]
  if (!first) throw new Error('Expected first deadline')
  first.dueAt = 30_000
  expect(events[0]?.runtimeDeadline?.dueAt).toBe(20_000)
})

test('Maintenance exposes its periodic deadline and checksum without a cursor or raw ACK', () => {
  const events: DiagnosticEvent[] = []
  const observer = new RuntimeDeadlineDiagnostics({ enabled: () => true, emit: (event) => events.push(event) })
  const checkpoint = { version: 1 as const, cursor: 'private-journal-cursor', nextCheckAt: 40_000 }
  observer.observe({ unitId: 'maintenance', generation: 2, incarnation: 'maintenance-new' }, 'restored', () => ({
    domain: 'maintenance',
    checkpoint,
    ack: {
      epoch: 'epoch',
      token: 'private-maintenance-token',
      version: 3,
      source: { databaseId: 'd'.repeat(64), catalogRevision: 'c'.repeat(64) },
    },
  }))
  expect(events).toHaveLength(1)
  expect(events[0]?.runtimeDeadline).toMatchObject({
    domain: 'maintenance',
    dueAt: 40_000,
    checkpointSha256: hash(JSON.stringify(checkpoint)),
    revision: 3,
  })
  expect(JSON.stringify(events)).not.toContain(checkpoint.cursor)
  expect(JSON.stringify(events)).not.toContain('private-maintenance-token')
})

test('strict deadline metadata rejects unsafe clocks, counts, domains and raw capability fields', () => {
  const events: DiagnosticEvent[] = []
  const observer = new RuntimeDeadlineDiagnostics({ enabled: () => true, emit: (event) => events.push(event) })
  observer.observe(owner, 'checkpointed', () => ({ domain: 'goal', ack: wake() }))
  expect(events).toHaveLength(1)
  const event = events[0]
  for (const delta of [
    { dueAt: -1 },
    { dueAt: Infinity },
    { dueAt: Number.MAX_SAFE_INTEGER + 1 },
    { entries: 1_000_001 },
    { revision: -1 },
    { domain: 'other' },
    { token: 'secret' },
    { tokenSha256: 'bad' },
  ])
    expect(
      diagnosticEventSchema.safeParse({ ...event, runtimeDeadline: { ...event?.runtimeDeadline, ...delta } }).success,
    ).toBe(false)
})
