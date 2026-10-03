import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage } from '@hbar/storage'
import type { SessionEvent } from '@hbar/contracts'
import { notificationFromSessionEvent } from '../packages/storage/src/notification-projection'

const event: SessionEvent = {
  eventId: 'committed-source',
  sessionId: 'session',
  seq: 5,
  runId: 'run',
  stepId: null,
  type: 'run.settled',
  time: 20,
  version: 1,
  data: {
    run: {
      id: 'run',
      sessionId: 'session',
      requestId: 'request',
      input: { text: 'test', images: [] },
      modelId: 'fixture',
      status: 'failed',
      createdAt: 1,
      startedAt: 2,
      endedAt: 20,
      error: 'Failure',
    },
  },
}

test('notification projection validates actual nested Run and raw pending Approval source identities', () => {
  expect(notificationFromSessionEvent(event, 'workspace')).toMatchObject({
    id: event.eventId,
    sourceEventId: event.eventId,
    kind: 'run.failed',
    detail: 'Failure',
    createdAt: event.time,
    target: { kind: 'session', workspaceId: 'workspace', sessionId: 'session', runId: 'run' },
  })
  expect(notificationFromSessionEvent({ ...event, sessionId: 'other-session' }, 'workspace')).toBeNull()
  expect(notificationFromSessionEvent({ ...event, runId: 'other-run' }, 'workspace')).toBeNull()
  expect(notificationFromSessionEvent({ ...event, data: { status: 'completed' } }, 'workspace')).toBeNull()
  expect(notificationFromSessionEvent({ ...event, type: 'run.status' }, 'workspace')).toBeNull()
  const approval = { id: 'approval', sessionId: 'session', runId: 'run', status: 'pending', tool: 'write_file' }
  expect(
    notificationFromSessionEvent({ ...event, type: 'approval.requested', data: approval }, 'workspace'),
  ).toMatchObject({ kind: 'approval.pending', target: { approvalId: 'approval', runId: 'run' } })
  expect(
    notificationFromSessionEvent(
      { ...event, type: 'approval.requested', data: { ...approval, status: 'allowed' } },
      'workspace',
    ),
  ).toBeNull()
})

test('JSONL recovery recreates a missing notification in the same source projection without replaying execution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-notification-log-recovery-'))
  const path = join(root, 'storage.sqlite')
  let store = new Storage(path)
  try {
    await store.call('ready')
    const workspace = await store.call('createWorkspace', root, 'Recovery')
    const session = await store.call('createSession', workspace.id)
    const run = await store.call('enqueue', session.id, 'once', { text: 'fixture', images: [] }, 'fixture')
    const source = await store.call('setRun', run.id, 'completed')
    const committed = await store.call('notificationBySourceEvent', source.eventId)
    expect(committed?.target).toMatchObject({ workspaceId: workspace.id, sessionId: session.id, runId: run.id })
    await store.close()
    const db = new Database(path)
    try {
      db.transaction(() => {
        db.query('DELETE FROM notifications WHERE sourceEventId=?').run(source.eventId)
        db.query('DELETE FROM session_event_index WHERE eventId=?').run(source.eventId)
        db.query('DELETE FROM events WHERE eventId=?').run(source.eventId)
        db.query("UPDATE runs SET status='running', endedAt=NULL WHERE id=?").run(run.id)
      })()
    } finally {
      db.close()
    }
    store = new Storage(path)
    await store.call('ready')
    const recovered = await store.call('notificationBySourceEvent', source.eventId)
    expect(recovered?.id).toBe(committed?.id)
    expect(recovered?.createdAt).toBe(source.time)
    expect((await store.call('run', run.id)).status).toBe('completed')
    expect((await store.call('notificationPage', {})).items).toHaveLength(1)
    const duplicate = await store.call('insertNotification', recovered!)
    expect(duplicate.inserted).toBe(false)
  } finally {
    await store.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('failed schedule occurrences commit a stable notification before any Host callback and deduplicate terminal replay', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-schedule-notification-'))
  const store = new Storage(join(root, 'storage.sqlite'))
  try {
    await store.call('ready')
    const workspace = await store.call('createWorkspace', root, 'Scheduled')
    const schedule = await store.call('createSchedule', {
      workspaceId: workspace.id,
      name: 'Scheduled fixture',
      input: 'Fixture',
      modelId: 'fixture',
      timezone: 'UTC',
      target: { mode: 'new-session' },
      spec: { kind: 'once', at: 20 },
    })
    const occurrence = await store.call('claimScheduleOccurrence', schedule.id, 20, 30)
    if (!occurrence) throw new Error('Missing scheduled occurrence')
    const failed = await store.call(
      'transitionScheduleOccurrence',
      occurrence.id,
      'failed',
      undefined,
      'Target missing',
    )
    const source = `schedule:${occurrence.id}:failed`
    const record = await store.call('notificationBySourceEvent', source)
    expect(record).toMatchObject({
      kind: 'schedule.failed',
      detail: 'Target missing',
      createdAt: failed.updatedAt,
      target: { kind: 'schedule', scheduleId: schedule.id, occurrenceId: occurrence.id },
    })
    await store.call('transitionScheduleOccurrence', occurrence.id, 'failed')
    expect((await store.call('notificationPage', {})).items).toHaveLength(1)
    expect((await store.call('notificationBySourceEvent', source))?.id).toBe(record?.id)
  } finally {
    await store.close()
    await rm(root, { recursive: true, force: true })
  }
})
