import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { ManagedProcess } from '@hbar/runtime'
import type { IpcPeer } from '@hbar/runtime'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { diagnosticEventSchema } from '@hbar/contracts/diagnostics'
import type { DiagnosticEvent } from '@hbar/contracts/diagnostics'
import { stopDriverWithDiagnostic } from '../apps/host/src/runtime-driver-stop-diagnostics'
import type { DriverStopReason } from '../apps/host/src/runtime-driver-stop-diagnostics'

const reasons: DriverStopReason[] = [
  'stream_flush_scheduled_failure',
  'stream_flush_requeued_failure',
  'cancel_grace_expired',
  'completion_event_failure',
  'completion_flush_failure',
  'terminal_delivery_failure',
]
const owner = { unitId: 'driver.pi', generation: 1, incarnation: 'owner-fixture-incarnation' }

test('every fixed driver stop reason exits immediately without waiting for a diagnostic acknowledgement', () => {
  const events: DiagnosticEvent[] = []
  const exitSentinel = new Error('fixture-exit')
  for (const reason of reasons) {
    let exitCode: number | undefined
    expect(() =>
      stopDriverWithDiagnostic({
        owner,
        reason,
        activeCount: 10,
        invocationId: 'private-invalid-id-do-not-log',
        notify: (event) => {
          events.push(event)
          return new Promise<void>(() => {})
        },
        exit: (code) => {
          exitCode = code
          throw exitSentinel
        },
      }),
    ).toThrow(exitSentinel)
    expect(exitCode).toBe(76)
  }
  expect(events.map((event) => event.phase)).toEqual(reasons)
  expect(events.every((event) => event.pending === 10 && event.requestId === owner.incarnation)).toBe(true)
  expect(events.every((event) => event.callId === undefined)).toBe(true)
  expect(new Set(events.map((event) => event.rpcId)).size).toBe(reasons.length)
  expect(JSON.stringify(events)).not.toContain('private-invalid-id-do-not-log')
})

test('synchronous and rejected diagnostic observers cannot replace fail-closed exit76', async () => {
  for (const notify of [
    () => {
      throw new Error('private-notify-error')
    },
    () => Promise.reject(new Error('private-notify-error')),
  ]) {
    const sentinel = new Error('exit')
    expect(() =>
      stopDriverWithDiagnostic({
        owner,
        reason: 'terminal_delivery_failure',
        activeCount: 1,
        notify,
        exit: (code) => {
          expect(code).toBe(76)
          throw sentinel
        },
      }),
    ).toThrow(sentinel)
  }
  await Promise.resolve()
})

test('a real owned process emits safe driver reason and invocation identity then physically exits76', async () => {
  const root = await mkdtemp(join(process.cwd(), 'artifacts', 'driver-stop-diagnostic-'))
  const modulePath = join(root, 'fixture.ts')
  const invocationId = crypto.randomUUID()
  await writeFile(
    modulePath,
    `
    import { stopDriverWithDiagnostic } from '../../apps/host/src/runtime-driver-stop-diagnostics'
    export function create(context) {
      context.peer.register('fixture.stop', { invoke: async () => {
        setTimeout(() => stopDriverWithDiagnostic({ owner: context.peer.owner, reason: 'cancel_grace_expired',
          activeCount: 10, invocationId: '${invocationId}',
          notify: event => context.peer.notify('runtime.diagnostic', event), exit: code => process.exit(code) }), 20)
      } })
      return { prepare: async input => ({ contractFingerprint: input.descriptor.contractFingerprint,
        storageSchema: input.descriptor.storageSchema, capabilities: [] }), activate: async () => {},
        drain: async () => ({ requests: 0, runs: 0, resources: 0 }), dispose: async () => {} }
    }
  `,
  )
  const events: DiagnosticEvent[] = []
  let peer: IpcPeer | undefined
  let complete: ((code: number) => void) | undefined
  const exited = new Promise<number>((resolve) => {
    complete = resolve
  })
  const managed = new ManagedProcess({
    descriptor: {
      id: 'driver.pi',
      kind: 'driver',
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: 'a'.repeat(64),
      storageSchema: STORAGE_SCHEMA_VERSION,
    },
    artifactId: 'b'.repeat(64),
    modulePath,
    generation: 1,
    parent: { unitId: 'base', generation: 1, incarnation: 'parent-fixture-incarnation' },
    onPeer: (value) => {
      peer = value
      value.onEvent('runtime.diagnostic', diagnosticEventSchema, (event) => {
        events.push(event)
      })
    },
    onExit: async (_identity, exit) => {
      complete?.(exit.exitCode)
    },
  })
  let deadline: ReturnType<typeof setTimeout> | undefined
  try {
    await managed.prepare()
    const connected = peer
    if (!connected) throw new Error('Driver fixture peer missing')
    await connected.call('fixture.stop', undefined, z.undefined())
    const timedOut = new Promise<never>((_resolve, reject) => {
      deadline = setTimeout(() => reject(new Error('Driver fixture exit deadline exceeded')), 5_000)
    })
    expect(await Promise.race([exited, timedOut])).toBe(76)
    expect(managed.snapshot().pid).toBeNull()
    expect(events.find((event) => event.event === 'host.runtime_driver_stop')).toMatchObject({
      phase: 'cancel_grace_expired',
      errorCode: 'DRIVER_STOP_CANCEL_GRACE_EXPIRED',
      exitCode: 76,
      requestId: connected.remote.incarnation,
      callId: invocationId,
      pending: 10,
    })
  } finally {
    clearTimeout(deadline)
    try {
      await managed.dispose()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
}, 15_000)
