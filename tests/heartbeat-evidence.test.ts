import { expect, test } from 'bun:test'
import { diagnosticEventSchema } from '@hbar/contracts/diagnostics'
import { HeartbeatEvidence, writeHeartbeatEvidence } from '../packages/runtime/src/heartbeat-diagnostics'

const owner = { unitId: 'driver.pi', generation: 1, incarnation: 'heartbeat-fixture' }
test('controlled parent scheduling stall and wallclock jump leave different numeric evidence', () => {
  const stalled = new HeartbeatEvidence(2000, 100_000, 0)
  expect(stalled.monitor(107_000, 7000, 500)).toEqual({ durationMs: 7000, executionMs: 7000, queueWaitMs: 6500 })
  const jumped = new HeartbeatEvidence(2000, 100_000, 0)
  expect(jumped.monitor(107_000, 500, 500)).toEqual({ durationMs: 7000, executionMs: 500, queueWaitMs: 0 })
  jumped.received(107_000, 500)
  expect(jumped.monitor(107_500, 1000, 500)).toEqual({ durationMs: 500, executionMs: 500, queueWaitMs: 0 })
})
test('child cadence does not warn during ordinary ticks; severe delays and failures are bounded', () => {
  const evidence = new HeartbeatEvidence(2000, 0, 0)
  for (const time of [2000, 4000, 6000]) expect(evidence.tick(time)).toBe(0)
  expect(evidence.tick(14000)).toBe(6000)
  expect(evidence.shouldReport(14000)).toBe(true)
  expect(evidence.shouldReport(16000)).toBe(false)
  expect(evidence.shouldReport(16000, true)).toBe(true)
  expect(evidence.shouldReport(17000, true)).toBe(false)
  expect(evidence.shouldReport(44000)).toBe(true)
})
test('synchronous evidence reaches sink before fencing and cannot prevent it on sink failure', () => {
  const order: string[] = [],
    lines: string[] = []
  const evidence = new HeartbeatEvidence(2000, 0, 0)
  const fields = evidence.monitor(7000, 7000, 500)
  writeHeartbeatEvidence(owner, 'parent_timeout', { ...fields, pending: 6, recordsIn: 30, bytesIn: 1000 }, (line) => {
    lines.push(line)
    order.push('diagnostic')
  })
  order.push('fence')
  expect(order).toEqual(['diagnostic', 'fence'])
  expect(diagnosticEventSchema.parse(JSON.parse(lines.join('')))).toMatchObject({
    phase: 'parent_timeout',
    errorCode: 'RUNTIME_HEARTBEAT_TIMEOUT',
    durationMs: 7000,
    executionMs: 7000,
    queueWaitMs: 6500,
    requestId: owner.incarnation,
    pending: 6,
    recordsIn: 30,
    bytesIn: 1000,
  })
  expect(() =>
    writeHeartbeatEvidence(owner, 'child_send_failed', { replyMs: 5000 }, () => {
      throw new Error('PRIVATE_CANARY')
    }),
  ).not.toThrow()
  order.push('exit76')
  expect(order.at(-1)).toBe('exit76')
  expect(lines.join('')).not.toContain('PRIVATE_CANARY')
})
