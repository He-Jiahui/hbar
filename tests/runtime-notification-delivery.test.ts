import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WireNotification } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { runtimeWireNotificationSchema } from '@hbar/contracts/runtime-notifications'
import { RuntimeNotificationDelivery } from '@hbar/runtime'

function event(seq: number): WireNotification { return { method: 'session.event', params: {
  eventId: `event-${seq}`, sessionId: 'session', runId: null, stepId: null, seq, type: 'fixture', data: { seq }, time: seq, version: 1,
} } }
test('event delivery retains durable sequence and captured data, and awaits the actual transfer before releasing its bound', async () => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const received: WireNotification[] = []
  const delivery = new RuntimeNotificationDelivery({ maximumQueued: 3, send: async input => { await gate; received.push(input) }, failed: () => {} })
  const first = event(1)
  delivery.publish(first)
  if (first.method === 'session.event') first.params.data = { changed: true }
  delivery.publish(event(2)); delivery.publish(event(3))
  expect(delivery.snapshot()).toMatchObject({ queued: 3, queuedPeak: 3, failure: null })
  release(); await delivery.settled()
  expect(received.map(input => input.method === 'session.event' ? input.params.seq : -1)).toEqual([1, 2, 3])
  expect(received[0]).toMatchObject({ params: { data: { seq: 1 } } })
  expect(delivery.snapshot()).toMatchObject({ queued: 0, bufferedBytes: 0 })
  delivery.dispose()
})
test('overflow and transport rejection have one bounded failure path and do not reject in the background', async () => {
  for (const kind of ['capacity', 'bytes', 'transfer'] as const) {
    const codes: string[] = []
    const delivery = new RuntimeNotificationDelivery({ maximumQueued: 1, maximumBytes: kind === 'bytes' ? 10 : 10_000,
      send: async () => { if (kind === 'transfer') throw new Error('dead owner') }, failed: code => { codes.push(code) } })
    delivery.publish(event(1))
    if (kind === 'capacity') delivery.publish(event(2))
    await delivery.settled()
    delivery.publish(event(3))
    expect(codes).toHaveLength(1)
    expect(delivery.snapshot()).toMatchObject({ queued: 0, bufferedBytes: 0, failure: codes[0] })
    delivery.dispose()
  }
})
test('invalid observer events produce diagnostics while later valid events continue to transfer', async () => {
  const codes: string[] = []
  const received: WireNotification[] = []
  const delivery = new RuntimeNotificationDelivery({ send: async input => { received.push(input) },
    failed: () => { throw new Error('Invalid observer must not fail its owner') }, diagnostic: code => { codes.push(code) } })
  delivery.publish({ method: 'host.changed', params: { kind: '' } })
  const invalid = event(1)
  if (invalid.method === 'session.event') invalid.params.data = new Date()
  delivery.publish(invalid)
  delivery.publish(event(1))
  await delivery.settled()
  expect(codes).toEqual(['RUNTIME_NOTIFICATION_INVALID', 'RUNTIME_NOTIFICATION_INVALID'])
  expect(received).toHaveLength(1)
  expect(delivery.snapshot()).toMatchObject({ failure: null, invalidEvents: 2 })
  delivery.dispose()
})
test('wire validation rejects negative stream offsets and non-finite sequence values', () => {
  expect(runtimeWireNotificationSchema.safeParse({ method: 'stream.update', params: {
    id: 'stream', sessionId: 'session', runId: 'run', operation: 'append', text: '', thinking: '', textOffset: -1, thinkingOffset: 0, version: 1,
  } }).success).toBe(false)
  const bad = event(1)
  if (bad.method === 'session.event') bad.params.seq = Infinity
  expect(runtimeWireNotificationSchema.safeParse(bad).success).toBe(false)
})

test('an asynchronous Kernel subscriber rejection is diagnosed without becoming a fatal background rejection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-observer-boundary-'))
  const kernel = await Kernel.create({ home: root, lifecycle: 'managed', secrets: new MemorySecrets() })
  try {
    let healthy = 0
    kernel.subscribe(async () => { throw new Error('fixture observer failure') })
    kernel.subscribe(() => { healthy++ })
    kernel.changed('fixture')
    await Bun.sleep(0)
    kernel.changed('fixture-again')
    await Bun.sleep(0)
    expect(healthy).toBe(2)
  } finally { await kernel.close(); await rm(root, { recursive: true, force: true }) }
})
