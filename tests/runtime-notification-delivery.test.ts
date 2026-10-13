import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WireNotification } from '@hbar/contracts'
import type { RuntimeOwner } from '@hbar/contracts/runtime'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { RUNTIME_NOTIFICATION_BATCH_MAX_BYTES, runtimeWireNotificationBatchSchema, runtimeWireNotificationSchema } from '@hbar/contracts/runtime-notifications'
import { IpcPeer, RuntimeNotificationDelivery, type RuntimeNotificationFailureSnapshot } from '@hbar/runtime'

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

test('bounded batches preserve all notification order while reducing slow IPC acknowledgements', async () => {
  const received: number[] = []
  let batches = 0
  let individualTransfers = 0
  const serial = new RuntimeNotificationDelivery({ send: async () => { individualTransfers++; await Bun.sleep(1) }, failed: code => { throw new Error(code) } })
  for (let seq = 1; seq <= 101; seq++) serial.publish(event(seq))
  await serial.settled()
  expect(individualTransfers).toBe(101)
  serial.dispose()

  const delivery = new RuntimeNotificationDelivery({
    send: async input => { if (input.method === 'session.event') received.push(input.params.seq) },
    sendBatch: async events => {
      batches++
      await Bun.sleep(1)
      const parsed = runtimeWireNotificationBatchSchema.parse(events)
      for (const item of parsed) if (item.method === 'session.event') received.push(item.params.seq)
    },
    failed: code => { throw new Error(`unexpected notification failure: ${code}`) },
    maximumQueued: 256,
  })
  for (let seq = 1; seq <= 101; seq++) delivery.publish(event(seq))
  expect(delivery.snapshot()).toMatchObject({ queued: 101, acceptedEvents: 101, failure: null })
  await delivery.settled()
  expect(received).toEqual(Array.from({ length: 101 }, (_, index) => index + 1))
  expect(batches).toBe(4)
  expect(delivery.snapshot()).toMatchObject({ queued: 0, deliveredEvents: 101, acceptedEvents: 101, batchTransfers: 4, singleTransfers: 0, failure: null })
  delivery.dispose()
})

test('batch selection includes brackets, commas, and multibyte UTF-8 at the byte boundary', async () => {
  const makePair = (characters: number): WireNotification[] => {
    const first = event(1), second = event(2)
    if (first.method === 'session.event') first.params.data = { body: '界'.repeat(characters) }
    if (second.method === 'session.event') second.params.data = { body: '界'.repeat(characters) }
    return [first, second]
  }
  let low = 0, high = Math.floor(RUNTIME_NOTIFICATION_BATCH_MAX_BYTES / 6), selected = 0
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const bytes = new TextEncoder().encode(JSON.stringify(makePair(middle))).byteLength
    if (bytes <= RUNTIME_NOTIFICATION_BATCH_MAX_BYTES) { selected = middle; low = middle + 1 }
    else high = middle - 1
  }
  const pair = makePair(selected)
  const actualBytes = new TextEncoder().encode(JSON.stringify(pair)).byteLength
  expect(actualBytes).toBeLessThanOrEqual(RUNTIME_NOTIFICATION_BATCH_MAX_BYTES)
  expect(actualBytes).toBeGreaterThan(RUNTIME_NOTIFICATION_BATCH_MAX_BYTES - 16)
  let sentBatches = 0
  let sentSingles = 0
  const delivery = new RuntimeNotificationDelivery({ send: async () => { sentSingles++ }, sendBatch: async events => {
    sentBatches++
    expect(new TextEncoder().encode(JSON.stringify(events)).byteLength).toBeLessThanOrEqual(RUNTIME_NOTIFICATION_BATCH_MAX_BYTES)
  }, failed: code => { throw new Error(`unexpected notification failure: ${code}`) } })
  for (const item of pair) delivery.publish(item)
  await delivery.settled()
  expect(sentBatches).toBe(1)
  expect(sentSingles).toBe(0)
  expect(delivery.snapshot()).toMatchObject({ deliveredEvents: 2, failure: null })
  delivery.dispose()
})

test('a publish in the flush completion window wakes the queue and settled drains the follow-up send', async () => {
  let begin!: () => void
  let release!: () => void
  const started = new Promise<void>(resolve => { begin = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  const received: number[] = []
  let delivery!: RuntimeNotificationDelivery
  delivery = new RuntimeNotificationDelivery({
    send: async item => { if (item.method === 'session.event') received.push(item.params.seq) },
    sendBatch: async events => {
      begin()
      await gate
      queueMicrotask(() => queueMicrotask(() => delivery.publish(event(3))))
      for (const item of events) if (item.method === 'session.event') received.push(item.params.seq)
    },
    failed: code => { throw new Error(`unexpected notification failure: ${code}`) },
  })
  delivery.publish(event(1))
  delivery.publish(event(2))
  await started
  release()
  await delivery.settled()
  expect(received).toEqual([1, 2, 3])
  expect(delivery.snapshot()).toMatchObject({ queued: 0, acceptedEvents: 3, deliveredEvents: 3, failure: null })
  delivery.dispose()
})

test('oversized batch members travel alone and batch schema rejects its event and byte bounds', async () => {
  let singles = 0
  const delivery = new RuntimeNotificationDelivery({ send: async () => { singles++ }, sendBatch: async () => {},
    failed: code => { throw new Error(`unexpected notification failure: ${code}`) } })
  delivery.publish(event(1))
  const large = event(2)
  if (large.method === 'session.event') large.params.data = { body: 'x'.repeat(RUNTIME_NOTIFICATION_BATCH_MAX_BYTES + 128) }
  expect(new TextEncoder().encode(JSON.stringify(large)).byteLength).toBeGreaterThan(RUNTIME_NOTIFICATION_BATCH_MAX_BYTES)
  delivery.publish(large)
  delivery.publish(event(3))
  await delivery.settled()
  expect(singles).toBe(3)
  expect(runtimeWireNotificationBatchSchema.safeParse(Array.from({ length: 33 }, (_, index) => event(index))).success).toBe(false)
  expect(runtimeWireNotificationBatchSchema.safeParse([large]).success).toBe(false)
  expect(runtimeWireNotificationBatchSchema.safeParse([{ method: 'host.changed', params: { kind: '' } }]).success).toBe(false)
  expect(delivery.snapshot()).toMatchObject({ acceptedEvents: 3, deliveredEvents: 3, singleTransfers: 3, failure: null })
  delivery.dispose()
})

test('an oversized single notification still fails at the IPC frame cap instead of bypassing it as a batch', async () => {
  const owner: RuntimeOwner = { unitId: 'kernel', generation: 1, incarnation: 'kernel-frame-test' }
  const remote: RuntimeOwner = { unitId: 'base', generation: 1, incarnation: 'base-frame-test' }
  let fragments = 0
  const peer = new IpcPeer({ owner, remote, messageBytes: 1024, transport: { send: () => { fragments++ } } })
  let failed: string | undefined
  let batches = 0
  const delivery = new RuntimeNotificationDelivery({
    send: item => peer.notify('kernel.notification', item),
    sendBatch: events => { batches++; return peer.notify('kernel.notifications.batch', events) },
    failed: code => { failed = code },
  })
  const large = event(1)
  if (large.method === 'session.event') large.params.data = { body: 'x'.repeat(2_000) }
  delivery.publish(large)
  await delivery.settled()
  expect(batches).toBe(0)
  expect(fragments).toBe(0)
  expect(failed).toBe('RUNTIME_NOTIFICATION_DISCONNECTED')
  expect(delivery.snapshot()).toMatchObject({ failure: 'RUNTIME_NOTIFICATION_DISCONNECTED', queued: 0, bufferedBytes: 0 })
  delivery.dispose()
  peer.close()
})
test('overflow and transport rejection have one bounded failure path and do not reject in the background', async () => {
  for (const kind of ['capacity', 'bytes', 'transfer'] as const) {
    const codes: string[] = []
    const failures: RuntimeNotificationFailureSnapshot[] = []
    const delivery = new RuntimeNotificationDelivery({ maximumQueued: 1, maximumBytes: kind === 'bytes' ? 10 : 10_000,
      send: async () => { if (kind === 'transfer') throw new Error('dead owner') }, failed: (code, snapshot) => { codes.push(code); failures.push(snapshot) } })
    delivery.publish(event(1))
    if (kind === 'capacity') delivery.publish(event(2))
    await delivery.settled()
    delivery.publish(event(3))
    expect(codes).toHaveLength(1)
    expect(delivery.snapshot()).toMatchObject({ queued: 0, bufferedBytes: 0, failure: codes[0] })
    if (kind === 'capacity') expect(failures[0]).toMatchObject({ overflowCount: 1, queued: 1, acceptedEvents: 1,
      incomingClass: 'session-event', queuedByClass: { 'session-event': 1 } })
    delivery.dispose()
  }
})

test('partial legacy sends count only individually acknowledged events when a later event fails', async () => {
  const failures: RuntimeNotificationFailureSnapshot[] = []
  let calls = 0
  const delivery = new RuntimeNotificationDelivery({
    send: async item => {
      calls++
      if (item.method === 'session.event' && item.params.seq === 2) throw new Error('fixture transfer failure')
    },
    failed: (_code, snapshot) => { failures.push(snapshot) },
  })
  delivery.publish(event(1))
  delivery.publish(event(2))
  await delivery.settled()
  expect(calls).toBe(2)
  expect(delivery.snapshot()).toMatchObject({ acceptedEvents: 2, deliveredEvents: 1, singleTransfers: 1,
    failure: 'RUNTIME_NOTIFICATION_DISCONNECTED' })
  expect(failures[0]).toMatchObject({ acceptedEvents: 2, deliveredEvents: 1, singleTransfers: 1, queued: 2 })
  delivery.dispose()
})

test('dispose clears pending events and prevents another batch after an in-flight transfer', async () => {
  let begin!: () => void
  let release!: () => void
  const started = new Promise<void>(resolve => { begin = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  let batches = 0
  const delivery = new RuntimeNotificationDelivery({ send: async () => {}, sendBatch: async () => { batches++; begin(); await gate },
    failed: code => { throw new Error(`unexpected notification failure: ${code}`) } })
  delivery.publish(event(1))
  delivery.publish(event(2))
  await started
  delivery.publish(event(3))
  delivery.dispose()
  release()
  await delivery.settled()
  expect(batches).toBe(1)
  expect(delivery.snapshot()).toMatchObject({ queued: 0, bufferedBytes: 0, deliveredEvents: 2, failure: null })
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
