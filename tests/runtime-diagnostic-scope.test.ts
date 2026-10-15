import { expect, test } from 'bun:test'
import { diagnosticEvent, diagnosticEventSchema, type DiagnosticEvent } from '@hbar/contracts'
import { IpcPeer } from '@hbar/runtime'
import type { RuntimeOwner } from '@hbar/contracts/runtime'
import { scopeRuntimeDiagnostic } from '../apps/host/src/runtime-diagnostic-scope'

test('actual IPC diagnostic forwarding scopes equal Storage request IDs by authenticated incarnation', async () => {
  const host: RuntimeOwner = { unitId: 'base', generation: 1, incarnation: 'host-owner' }
  const observed: DiagnosticEvent[] = []
  for (const incarnation of ['storage-first', 'storage-replacement']) {
    const owner: RuntimeOwner = { unitId: 'storage', generation: 1, incarnation }
    let child: IpcPeer | undefined
    const parent = new IpcPeer({
      owner: host,
      remote: owner,
      transport: {
        send: (frame) => {
          child?.receive(frame)
        },
      },
    })
    child = new IpcPeer({
      owner,
      remote: host,
      transport: {
        send: (frame) => {
          parent.receive(frame)
        },
      },
    })
    parent.onEvent('runtime.diagnostic', diagnosticEventSchema, (value) => {
      observed.push(scopeRuntimeDiagnostic(value, owner, 'host-instance'))
    })
    try {
      for (const event of ['storage.request_dispatched', 'storage.request_completed'])
        await child.notify(
          'runtime.diagnostic',
          diagnosticEvent({
            level: 'debug',
            component: 'storage',
            event,
            instanceId: 'FORGED_SCOPE',
            storageRequestId: 1,
          }),
        )
    } finally {
      child.close()
      parent.close()
    }
  }
  expect(observed.map((event) => event.instanceId)).toEqual([
    'storage-first',
    'storage-first',
    'storage-replacement',
    'storage-replacement',
  ])
  expect(new Set(observed.map((event) => `${event.instanceId}:${event.storageRequestId}`)).size).toBe(2)
})

test('other diagnostics retain Host scope and non Storage owners cannot spoof Storage scope', () => {
  const raw = diagnosticEvent({
    level: 'debug',
    component: 'storage',
    event: 'storage.request_dispatched',
    instanceId: 'forged',
    storageRequestId: 1,
  })
  const kernel: RuntimeOwner = { unitId: 'kernel', generation: 1, incarnation: 'kernel-owner' }
  const storage: RuntimeOwner = { unitId: 'storage', generation: 1, incarnation: 'storage-owner' }
  expect(scopeRuntimeDiagnostic(raw, kernel, 'host-instance').instanceId).toBe('host-instance')
  expect(scopeRuntimeDiagnostic({ ...raw, event: 'storage.close' }, storage, 'host-instance').instanceId).toBe(
    'host-instance',
  )
  expect(scopeRuntimeDiagnostic({ ...raw, component: 'kernel' }, storage, 'host-instance').instanceId).toBe(
    'host-instance',
  )
  expect(scopeRuntimeDiagnostic(raw, storage, 'host-instance')).toMatchObject({
    storageRequestId: 1,
    instanceId: 'storage-owner',
  })
})
