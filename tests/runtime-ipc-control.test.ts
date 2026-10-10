import { expect, test } from 'bun:test'
import { z } from 'zod'
import { IpcPeer, procedure } from '@hbar/runtime'

test('reserved IPC slots admit control while all normal callbacks are physically blocked', async () => {
  const base = { unitId: 'base', generation: 1, incarnation: 'base' }
  const kernel = { unitId: 'kernel', generation: 1, incarnation: 'kernel' }
  let right!: IpcPeer
  const options = { inFlight: 4, queued: 3, reservedControl: 1, controlMethods: ['control.cancel'] }
  const left = new IpcPeer({ owner: base, remote: kernel, ...options, transport: { send: frame => right.receive(frame) } })
  right = new IpcPeer({ owner: kernel, remote: base, ...options, transport: { send: frame => left.receive(frame) } })
  let release!: () => void
  const physical = new Promise<void>(resolve => { release = resolve })
  let controls = 0
  right.register('work', procedure(z.undefined(), z.undefined(), () => physical))
  right.register('control.cancel', procedure(z.undefined(), z.number(), () => ++controls))
  const work = Array.from({ length: 6 }, () => left.call('work', undefined, z.undefined()))
  try {
    expect(left.snapshot()).toMatchObject({ inFlight: 3, queued: 3 })
    expect(await left.call('work', undefined, z.undefined()).catch((error: unknown) => error)).toMatchObject({ code: 'IPC_BUSY' })
    expect(await left.call('control.cancel', undefined, z.number())).toBe(1)
    expect(left.snapshot()).toMatchObject({ inFlight: 3, queued: 3 })
    release()
    await Promise.all(work)
    expect(left.snapshot().inFlight).toBe(0)
  } finally { release(); left.close(); right.close() }
})

test('the receiving peer independently reserves its control slots even when the sender does not', async () => {
  const base = { unitId: 'base', generation: 1, incarnation: 'base' }
  const kernel = { unitId: 'kernel', generation: 1, incarnation: 'kernel' }
  let right!: IpcPeer
  const left = new IpcPeer({ owner: base, remote: kernel, inFlight: 8, transport: { send: frame => right.receive(frame) } })
  right = new IpcPeer({ owner: kernel, remote: base, inFlight: 4, reservedControl: 1, controlMethods: ['control.cancel'], transport: { send: frame => left.receive(frame) } })
  let release!: () => void
  const physical = new Promise<void>(resolve => { release = resolve })
  right.register('work', procedure(z.undefined(), z.undefined(), () => physical))
  right.register('control.cancel', procedure(z.undefined(), z.literal(true), () => true))
  const work = Array.from({ length: 6 }, () => left.call('work', undefined, z.undefined()))
  try {
    expect(await left.call('control.cancel', undefined, z.literal(true))).toBe(true)
    release()
    await Promise.all(work)
  } finally { release(); left.close(); right.close() }
})
