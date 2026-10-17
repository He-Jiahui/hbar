import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage } from '@hbar/storage'
import { createScheduleAdmission } from '@hbar/kernel/controller'
import type { ScheduleCreateInput } from '@hbar/contracts/commands/schedules'
import { removeOwnedTestDirectory } from './owned-temp-directory'

async function failure(action: Promise<unknown>): Promise<unknown> {
  try {
    await action
  } catch (error) {
    return error
  }
  throw new Error('Expected schedule admission rejection')
}

async function fixture(existing = false) {
  const prefix = 'hbar-schedule-admission-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const storage = new Storage(join(root, 'state.sqlite'))
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', root, 'Schedule workspace')
  const device = {
    id: 'original-author',
    name: 'Author',
    createdAt: 1,
    lastSeenAt: 1,
    role: 'operator' as const,
    workspaceIds: [workspace.id],
  }
  await storage.call('putDevice', device, 'original-device-hash')
  const target = existing
    ? { mode: 'existing-session' as const, sessionId: (await storage.call('createSession', workspace.id)).id }
    : { mode: 'new-session' as const }
  const input: ScheduleCreateInput = {
    workspaceId: workspace.id,
    name: '用户设定的定时任务',
    input: 'Original authorized work',
    modelId: 'fixture',
    timezone: 'UTC',
    target,
    spec: { kind: 'once', at: Date.now() + 60_000 },
  }
  const schedule = await storage.call('createSchedule', input, { actorId: device.id, idempotencyKey: 'create' })
  const occurrence = await storage.call('claimScheduleOccurrence', schedule.id, 100, 100)
  if (!occurrence) throw new Error('Missing claimed schedule')
  let changes = 0
  const admission = createScheduleAdmission(storage, () => {
    changes++
  })
  const prepare = {
    occurrenceId: occurrence.id,
    actorId: device.id,
    scheduleId: schedule.id,
    workspaceId: workspace.id,
    target: target.mode,
    ...(target.mode === 'existing-session' ? { sessionId: target.sessionId } : {}),
  }
  return {
    storage,
    workspace,
    device,
    input,
    schedule,
    occurrence,
    admission,
    prepare,
    get changes() {
      return changes
    },
    async prepared() {
      const result = await admission.prepare(prepare)
      await storage.call(
        'transitionScheduleOccurrence',
        occurrence.id,
        'running',
        undefined,
        undefined,
        result.sessionId,
      )
      return {
        ...result,
        occurrenceId: occurrence.id,
        actorId: device.id,
        input: input.input,
        modelId: input.modelId,
        idempotencyKey: occurrence.idempotencyKey,
      }
    },
    async close() {
      await storage.close()
      await removeOwnedTestDirectory(root, prefix)
    },
  }
}

test('a claimed revision creates one session with its original author and user supplied name after another actor edits the schedule', async () => {
  const f = await fixture()
  try {
    await f.storage.call(
      'updateSchedule',
      {
        ...f.input,
        scheduleId: f.schedule.id,
        expectedRevision: f.schedule.revision,
        name: 'Later name',
        input: 'A different task',
        modelId: 'different-model',
      },
      { actorId: 'later-editor', idempotencyKey: 'edit' },
    )
    const first = await f.admission.prepare(f.prepare)
    const duplicate = await f.admission.prepare(f.prepare)
    expect(duplicate.sessionId).toBe(first.sessionId)
    expect((await f.storage.call('session', first.sessionId)).title).toBe(f.input.name)
    expect(await f.storage.call('sessionExecutionPrincipal', first.sessionId)).toMatchObject({ actorId: f.device.id })
    const submit = await f.prepared()
    await f.admission.authorizeSubmission(submit)
    expect(await failure(f.admission.authorizeSubmission({ ...submit, input: 'A different task' }))).toMatchObject({
      code: 'SCHEDULE_EXECUTION_CONFLICT',
    })
    expect((await f.storage.call('sessions')).map((value) => value.id)).toEqual([first.sessionId])
    expect(f.changes).toBe(3)
  } finally {
    await f.close()
  }
})

test('device role, scope and revocation are checked before preparation and again before submission', async () => {
  const f = await fixture()
  try {
    await f.storage.call('revokeDevice', f.device.id)
    await f.storage.call('putDevice', { ...f.device, role: 'observer' }, 'original-device-hash')
    expect(await failure(f.admission.prepare(f.prepare))).toMatchObject({ code: 'FORBIDDEN' })
    expect(await f.storage.call('sessions')).toEqual([])
    await f.storage.call('revokeDevice', f.device.id)
    await f.storage.call('putDevice', f.device, 'original-device-hash')
    const submit = await f.prepared()
    for (const value of [
      { ...f.device, workspaceIds: [] },
      { ...f.device, role: 'observer' as const },
    ]) {
      await f.storage.call('revokeDevice', f.device.id)
      await f.storage.call('putDevice', value, 'original-device-hash')
      expect(await failure(f.admission.authorizeSubmission(submit))).toMatchObject({ code: 'FORBIDDEN' })
    }
    await f.storage.call('revokeDevice', f.device.id)
    await f.storage.call('putDevice', f.device, 'original-device-hash')
    await f.admission.authorizeSubmission(submit)
    await f.storage.call('revokeDevice', f.device.id)
    expect(await failure(f.admission.authorizeSubmission(submit))).toMatchObject({ code: 'FORBIDDEN' })
  } finally {
    await f.close()
  }
})

test('an occurrence cannot borrow another actor, task, key or session, and cannot admit work after settlement', async () => {
  const f = await fixture()
  try {
    expect(await failure(f.admission.prepare({ ...f.prepare, actorId: 'another-actor' }))).toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(await failure(f.admission.prepare({ ...f.prepare, workspaceId: 'another-workspace' }))).toMatchObject({
      code: 'SCHEDULE_EXECUTION_CONFLICT',
    })
    const unrelated = await f.storage.call('createSession', f.workspace.id)
    expect(await failure(f.admission.prepare({ ...f.prepare, sessionId: unrelated.id }))).toMatchObject({
      code: 'SCHEDULE_EXECUTION_CONFLICT',
    })
    const submit = await f.prepared()
    for (const value of [
      { ...submit, input: 'Altered task' },
      { ...submit, modelId: 'altered-model' },
      { ...submit, sessionId: unrelated.id },
      { ...submit, idempotencyKey: 'new-key' },
    ])
      expect(await failure(f.admission.authorizeSubmission(value))).toMatchObject({
        code: 'SCHEDULE_EXECUTION_CONFLICT',
      })
    await f.storage.call('transitionScheduleOccurrence', f.occurrence.id, 'completed', 'accepted-run')
    expect(await failure(f.admission.authorizeSubmission(submit))).toMatchObject({
      code: 'SCHEDULE_EXECUTION_CONFLICT',
    })
  } finally {
    await f.close()
  }
})

test('an existing target must remain the original unarchived session in the permitted workspace', async () => {
  const f = await fixture(true)
  try {
    const submit = await f.prepared()
    if (!f.prepare.sessionId) throw new Error('Missing original existing target')
    expect(submit.sessionId).toBe(f.prepare.sessionId)
    expect(f.changes).toBe(0)
    await f.admission.authorizeSubmission(submit)
    await f.storage.call('updateSession', submit.sessionId, { archived: true })
    expect(await failure(f.admission.authorizeSubmission(submit))).toMatchObject({ code: 'COMMAND_CONFLICT' })
  } finally {
    await f.close()
  }
})

test('legacy schedules without original management receipts cannot acquire device authority', async () => {
  const f = await fixture()
  try {
    const legacy = await f.storage.call('createSchedule', f.input)
    const occurrence = await f.storage.call('claimScheduleOccurrence', legacy.id, 200, 200)
    if (!occurrence) throw new Error('Missing unattributed occurrence')
    expect(
      await failure(f.admission.prepare({ ...f.prepare, scheduleId: legacy.id, occurrenceId: occurrence.id })),
    ).toMatchObject({ code: 'SCHEDULE_AUTHORIZATION_REQUIRED' })
    expect(await f.storage.call('sessions')).toEqual([])
  } finally {
    await f.close()
  }
})
