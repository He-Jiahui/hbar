import assert from 'node:assert/strict'
import { setImmediate as immediate } from 'node:timers/promises'
import { z } from 'zod'
import { IpcPeer, procedure } from '@hbar/runtime'

const events: string[] = []
const diagnostics: { reason: string; errorCode: string }[] = []
let sends = 0,
  handlers = 0
const left = new IpcPeer({
  owner: { unitId: 'host', generation: 1, incarnation: 'natural-send-failure-left' },
  remote: { unitId: 'fixture', generation: 1, incarnation: 'natural-send-failure-right' },
  timeoutMs: 60000,
  fragmentTimeoutMs: 60000,
  onProtocolFailure(event) {
    diagnostics.push({ reason: event.reason, errorCode: event.errorCode })
  },
  transport: {
    send() {
      sends++
      throw new Error('CONTROLLED_TRANSPORT_SEND_FAILURE')
    },
  },
})
const right = new IpcPeer({
  owner: left.remote,
  remote: left.owner,
  timeoutMs: 60000,
  fragmentTimeoutMs: 60000,
  transport: { send: (frame) => left.receive(frame) },
})
right.register(
  'value',
  procedure(z.number(), z.number(), (value) => {
    handlers++
    return value
  }),
)
let primary: { error: unknown } | undefined
try {
  let failure: unknown
  try {
    await left.call('value', 1, z.number(), {
      timeoutMs: 60000,
      onDispatchStarted: (event) => {
        events.push(event)
      },
      onDispatchSettled: (event) => {
        events.push(event)
      },
    })
  } catch (error) {
    failure = error
  }
  assert(failure instanceof Error && 'code' in failure)
  assert.equal(failure.code, 'IPC_DISCONNECTED')
  await immediate()
  assert.deepEqual(events, ['submitting', 'send-failed'])
  assert.equal(sends, 1)
  assert.equal(handlers, 0)
  assert.deepEqual(diagnostics, [{ reason: 'transport_send', errorCode: 'IPC_TRANSPORT_SEND' }])
  const snapshot = left.snapshot()
  assert.equal(snapshot.failed, true)
  assert.equal(snapshot.inFlight, 0)
  assert.equal(snapshot.queued, 0)
  assert.equal(snapshot.bufferedBytes, 0)
  process.stdout.write(
    JSON.stringify({
      schema: 'hbar.ipc-send-failure-natural-exit.v1',
      timeoutMs: 60000,
      fragmentTimeoutMs: 60000,
      errorCode: failure.code,
      events,
      sends,
      handlers,
      inFlight: snapshot.inFlight,
      queued: snapshot.queued,
      bufferedBytes: snapshot.bufferedBytes,
      failed: snapshot.failed,
      diagnostic: diagnostics[0],
    }) + '\n',
  )
} catch (error) {
  primary = { error }
}
const cleanupErrors: unknown[] = []
try {
  left.close()
} catch (error) {
  cleanupErrors.push(error)
}
try {
  right.close()
} catch (error) {
  cleanupErrors.push(error)
}
if (cleanupErrors.length) {
  const errors = primary ? [primary.error, ...cleanupErrors] : cleanupErrors
  throw new AggregateError(errors, 'Owned CLI cleanup failed', { cause: errors[0] })
}
if (primary) throw primary.error
// No process.exit, unref, timer patch or manual IPC timer clearing. Natural CLI
// termination before 5s is required by the parent despite the real 60s timeouts.
