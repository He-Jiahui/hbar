import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import type { Approval, SessionEvent } from '@hbar/contracts'
import {
  createApprovalResolutionStorage,
  APPROVAL_RESOLUTION_INDEX,
} from '../packages/storage/src/approval-resolutions'

function fixture(tool = 'write_file') {
  const db = new Database(':memory:')
  db.exec(
    'CREATE TABLE events(eventId TEXT,sessionId TEXT,seq INTEGER,runId TEXT,stepId TEXT,type TEXT,data TEXT,time INTEGER,version INTEGER)',
  )
  db.exec(APPROVAL_RESOLUTION_INDEX)
  const approval: Approval = {
    id: 'approval',
    sessionId: 'source',
    runId: 'original-run',
    callId: 'original-call',
    tool,
    args: { original: true },
    status: 'pending',
    createdAt: 1,
    decidedBy: 'original-actor',
  }
  const service = createApprovalResolutionStorage(db, () => approval)
  function write(data: unknown, type = 'approval.resolved'): SessionEvent {
    const event: SessionEvent = {
      eventId: 'original-event',
      sessionId: approval.sessionId,
      seq: 1,
      runId: approval.runId,
      stepId: null,
      type,
      data,
      time: 2,
      version: 1,
    }
    db.query('INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?)').run(
      event.eventId,
      event.sessionId,
      event.seq,
      event.runId,
      event.stepId,
      event.type,
      JSON.stringify(event.data),
      event.time,
      event.version,
    )
    return event
  }
  return { db, approval, service, write }
}

test('approval result reconciliation requires the original canonical event and actor', () => {
  const f = fixture()
  try {
    expect(f.service.read(f.approval.id)).toBeNull()
    f.approval.status = 'allowed'
    expect(() => f.service.read(f.approval.id)).toThrow('no matching canonical resolution')
    const event = f.write({ ...f.approval, automatic: { source: 'delegate' } })
    expect(f.service.read(f.approval.id)).toEqual({
      approval: f.approval,
      event,
      modeEvent: null,
      delegationEvents: [],
    })
    f.approval.decidedBy = 'different-actor'
    expect(() => f.service.read(f.approval.id)).toThrow('differs from the original request')
  } finally {
    f.db.close()
  }
})

test('Plan reconciliation returns the real mode event and rejects a changed mode or status', () => {
  const f = fixture('exit_plan_mode')
  try {
    f.approval.status = 'allowed'
    const event = f.write(
      { approval: { ...f.approval }, mode: 'default', exitRunId: f.approval.runId, callId: f.approval.callId },
      'plan_exit.resolved',
    )
    expect(f.service.read(f.approval.id)?.modeEvent).toEqual(event)
    f.db.query('UPDATE events SET data=?').run(
      JSON.stringify({
        approval: { ...f.approval },
        mode: null,
        exitRunId: f.approval.runId,
        callId: f.approval.callId,
      }),
    )
    expect(() => f.service.read(f.approval.id)).toThrow('differs from the original request')
    f.approval.status = 'cancelled'
    f.db.exec('DELETE FROM events')
    const cancelled = f.write({ ...f.approval })
    expect(f.service.read(f.approval.id)?.event).toEqual(cancelled)
    expect(f.service.read(f.approval.id)?.modeEvent).toBeNull()
  } finally {
    f.db.close()
  }
})
