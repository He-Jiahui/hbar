import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage, isDurableSessionEvent } from '@hbar/storage'
import { SettingsService } from '@hbar/kernel/settings'
import { BACKEND_UNATTENDED_SETTING } from '@hbar/contracts/backend'
import {
  autonomyRetryInput,
  autonomyRetryConfigurationSchema,
  AUTONOMY_TRANSIENT_RETRIES_SETTING,
  AUTONOMY_REPAIR_RETRIES_SETTING,
  AUTONOMY_RETRY_DELAY_SETTING,
  type AutonomyRetryConfiguration,
} from '@hbar/contracts/autonomy-retry'
import { inputSchema, type RunFailure, type UserInput } from '@hbar/contracts'
import { removeOwnedTestDirectory } from './owned-temp-directory'
import { resolveBackendExecutionSettingCopy } from '../apps/web/src/backend-execution-settings-copy'

async function failure(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
  } catch (error) {
    return error
  }
  throw new Error('Expected retry admission to fail')
}
async function fixture(
  access: { role: 'operator' | 'observer'; workspaceIds: string[] | null } = { role: 'operator', workspaceIds: null },
) {
  const prefix = 'hbar-autonomy-retry-worker-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const file = join(root, 'state.sqlite')
  let storage = new Storage(file)
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', root, 'Retry source')
  await storage.call(
    'putDevice',
    { id: 'source-operator', name: 'Retry owner', createdAt: Date.now(), lastSeenAt: Date.now(), ...access },
    'fake-local-hash',
  )
  const session = await storage.call('createSessionCommand', {
    workspaceId: workspace.id,
    actorId: 'source-operator',
    idempotencyKey: 'create',
  })
  const policy = async (enabled: boolean) => {
    const service = new SettingsService(storage)
    const before = await service.get({ kind: 'global' })
    await service.apply({
      schemaVersion: before.schemaVersion,
      scope: before.scope,
      baselineRevisions: before.revisions,
      actorId: 'source-operator',
      idempotencyKey: crypto.randomUUID(),
      changes: [{ op: 'set', path: [{ kind: 'field', name: BACKEND_UNATTENDED_SETTING }], value: enabled }],
    })
  }
  const configure = async (configuration: Partial<AutonomyRetryConfiguration>) => {
    const service = new SettingsService(storage)
    const before = await service.get({ kind: 'global' })
    return service.apply({
      schemaVersion: before.schemaVersion,
      scope: before.scope,
      baselineRevisions: before.revisions,
      actorId: 'source-operator',
      idempotencyKey: crypto.randomUUID(),
      changes: [
        { name: AUTONOMY_TRANSIENT_RETRIES_SETTING, value: configuration.transientRetries },
        { name: AUTONOMY_REPAIR_RETRIES_SETTING, value: configuration.repairRetries },
        { name: AUTONOMY_RETRY_DELAY_SETTING, value: configuration.retryDelayMs },
      ].flatMap((field) =>
        field.value === undefined
          ? []
          : [
              {
                op: 'set' as const,
                path: [{ kind: 'field' as const, name: field.name }],
                value: field.value,
              },
            ],
      ),
    })
  }
  const fail = async (
    reason: RunFailure = { code: 'PROVIDER_CONNECTION_FAILED', category: 'transient', retryable: true },
    detail = 'Temporary provider failure',
  ) => {
    const run = await storage.call(
      'enqueue',
      session.id,
      crypto.randomUUID(),
      { text: 'Complete the original task', images: [], mode: 'plan', approval: 'deny' },
      'fixture',
    )
    await storage.call('claim', session.id)
    await storage.call('setRun', run.id, 'failed', detail, reason)
    return storage.call('run', run.id)
  }
  return {
    get storage() {
      return storage
    },
    session,
    workspace,
    policy,
    configure,
    fail,
    async reopen() {
      await storage.close()
      storage = new Storage(file)
      await storage.call('ready')
    },
    async editProjection(edit: (database: Database) => void) {
      // Fixture-only legacy/corruption shapes, with the real Worker fully closed.
      await storage.close()
      const database = new Database(file)
      try {
        edit(database)
      } finally {
        database.close()
      }
      storage = new Storage(file)
      await storage.call('ready')
    },
    async close() {
      await storage.close()
      await removeOwnedTestDirectory(root, prefix)
    },
  }
}

test('ordinary transient retries retain their durable delay, two-attempt lineage, source principal and stable acceptance across restart', async () => {
  const f = await fixture()
  try {
    const original = await f.fail()
    expect(await f.storage.call('autonomyRetryPlan', f.session.id)).toBeNull()
    await f.policy(true)
    const first = await f.storage.call('autonomyRetryPlan', f.session.id)
    if (!first) throw new Error('Missing first retry')
    expect(first.plan).toMatchObject({
      rootRunId: original.id,
      predecessorRunId: original.id,
      transientRetries: 1,
      repairRetries: 0,
    })
    expect(first.plan.wakeAt).toBe((original.endedAt ?? 0) + 1000)
    const admission = { plan: first.plan, settingsRevision: first.settingsRevision }
    expect(
      await failure(
        f.storage.call(
          'enqueue',
          f.session.id,
          first.plan.requestId,
          autonomyRetryInput(original),
          original.modelId,
          undefined,
          undefined,
          undefined,
          admission,
        ),
      ),
    ).toMatchObject({ code: 'AUTONOMY_RETRY_BACKOFF' })
    await f.reopen()
    expect(await f.storage.call('autonomyRetryPlan', f.session.id)).toEqual(first)
    await Bun.sleep(Math.max(1, first.plan.wakeAt - Date.now() + 5))
    const retry = await f.storage.call(
      'enqueue',
      f.session.id,
      first.plan.requestId,
      autonomyRetryInput(original),
      original.modelId,
      undefined,
      undefined,
      undefined,
      admission,
    )
    expect(await f.storage.call('runExecutionPrincipal', retry.id)).toEqual(
      await f.storage.call('runExecutionPrincipal', original.id),
    )
    expect(
      (
        await f.storage.call(
          'enqueue',
          f.session.id,
          first.plan.requestId,
          autonomyRetryInput(original),
          original.modelId,
          undefined,
          undefined,
          undefined,
          admission,
        )
      ).id,
    ).toBe(retry.id)
    expect(await f.storage.call('autonomyRetryPlan', f.session.id)).toBeNull()
    await f.storage.call('claim', f.session.id)
    await f.storage.call('setRun', retry.id, 'failed', 'Again', {
      code: 'PROVIDER_CONNECTION_FAILED',
      category: 'transient',
      retryable: true,
    })
    const second = await f.storage.call('autonomyRetryPlan', f.session.id)
    if (!second) throw new Error('Missing second retry')
    expect(second.plan).toMatchObject({ rootRunId: original.id, predecessorRunId: retry.id, transientRetries: 2 })
    await f.reopen()
    expect((await f.storage.call('autonomyRetryPlan', f.session.id))?.plan).toEqual(second.plan)
    await Bun.sleep(Math.max(1, second.plan.wakeAt - Date.now() + 5))
    const last = await f.storage.call(
      'enqueue',
      f.session.id,
      second.plan.requestId,
      autonomyRetryInput(second.predecessor),
      original.modelId,
      undefined,
      undefined,
      undefined,
      { plan: second.plan, settingsRevision: second.settingsRevision },
    )
    await f.storage.call('claim', f.session.id)
    await f.storage.call('setRun', last.id, 'failed', 'Exhausted', {
      code: 'PROVIDER_CONNECTION_FAILED',
      category: 'transient',
      retryable: true,
    })
    expect(await f.storage.call('autonomyRetryPlan', f.session.id)).toBeNull()
    expect((await f.storage.call('snapshot', f.session.id)).runs).toHaveLength(3)
    const events = await f.storage.call('events', f.session.id, 0, 100)
    expect(events.filter((event) => event.type.startsWith('run.autonomyRetry.'))).toHaveLength(2)
    expect(
      events
        .filter((event) => event.type.startsWith('run.autonomyRetry.'))
        .every((event) => isDurableSessionEvent(event.type)),
    ).toBe(true)
  } finally {
    await f.close()
  }
})

test('changed policy, a newer user turn and unresolved effects prevent stale autonomous acceptance', async () => {
  const f = await fixture()
  try {
    await f.policy(true)
    const original = await f.fail()
    const first = await f.storage.call('autonomyRetryPlan', f.session.id)
    if (!first) throw new Error('Missing retry')
    await f.policy(false)
    expect(await f.storage.call('autonomyRetryPlan', f.session.id)).toBeNull()
    expect(
      await failure(
        f.storage.call(
          'enqueue',
          f.session.id,
          first.plan.requestId,
          autonomyRetryInput(original),
          original.modelId,
          undefined,
          undefined,
          undefined,
          { plan: first.plan, settingsRevision: first.settingsRevision },
        ),
      ),
    ).toMatchObject({ code: 'AUTONOMY_RETRY_STALE' })
    await f.policy(true)
    await f.storage.call('toolStart', f.session.id, original.id, 'unknown', 'write_file', { path: 'a.txt' })
    expect(await f.storage.call('autonomyRetryPlan', f.session.id)).toBeNull()
    await f.storage.call('toolEnd', f.session.id, original.id, 'unknown')
    expect((await f.storage.call('autonomyRetryPlan', f.session.id))?.plan).toEqual(first.plan)
    await f.storage.call(
      'enqueue',
      f.session.id,
      'new-user-turn',
      { text: 'A new task supersedes the failed task', images: [] },
      original.modelId,
    )
    expect(await f.storage.call('autonomyRetryPlan', f.session.id)).toBeNull()
    expect(
      await failure(
        f.storage.call(
          'enqueue',
          f.session.id,
          first.plan.requestId,
          autonomyRetryInput(original),
          original.modelId,
          undefined,
          undefined,
          undefined,
          { plan: first.plan, settingsRevision: first.settingsRevision },
        ),
      ),
    ).toMatchObject({ code: 'AUTONOMY_RETRY_STALE' })
  } finally {
    await f.close()
  }
})

test('budget, user cancellation, unknown effects, timeout, interruption and ordinary execution errors are not transient replays', async () => {
  const f = await fixture()
  try {
    await f.policy(true)
    for (const category of [
      'budget',
      'usage_limit',
      'cancelled',
      'timeout',
      'interrupted',
      'result_unknown',
      'execution',
    ] as const) {
      await f.fail({ code: category.toUpperCase(), category, retryable: false })
      expect(await f.storage.call('autonomyRetryPlan', f.session.id)).toBeNull()
    }
  } finally {
    await f.close()
  }
})

test('revoking the real source device invalidates an already planned retry before its acceptance', async () => {
  const f = await fixture()
  try {
    await f.policy(true)
    const original = await f.fail()
    const planned = await f.storage.call('autonomyRetryPlan', f.session.id)
    if (!planned) throw new Error('Missing retry before revocation')
    await f.storage.call('revokeDevice', 'source-operator')
    expect(await f.storage.call('autonomyRetryPlan', f.session.id)).toBeNull()
    expect(
      await failure(
        f.storage.call(
          'enqueue',
          f.session.id,
          planned.plan.requestId,
          autonomyRetryInput(original),
          original.modelId,
          undefined,
          undefined,
          undefined,
          { plan: planned.plan, settingsRevision: planned.settingsRevision },
        ),
      ),
    ).toMatchObject({ code: 'AUTONOMY_RETRY_STALE' })
  } finally {
    await f.close()
  }
})

test('unattended execution has global-only persisted settings and typed host-owned copy in both locales', async () => {
  const f = await fixture()
  try {
    const service = new SettingsService(f.storage)
    const field = service
      .describe()
      .fields.find((value) => value.path[0]?.kind === 'field' && value.path[0].name === BACKEND_UNATTENDED_SETTING)
    if (!field?.helpKey) throw new Error('Missing unattended execution setting')
    expect(field).toMatchObject({
      type: 'boolean',
      allowedScopes: ['global'],
      applyMode: 'immediate',
      defaultValue: false,
    })
    for (const locale of ['zh-CN', 'en-US'] as const) {
      const label = resolveBackendExecutionSettingCopy(locale, field.labelKey)
      const help = resolveBackendExecutionSettingCopy(locale, field.helpKey)
      if (!label || !help) throw new Error('Missing unattended execution copy')
      expect(label).not.toContain('i18n:')
      expect(help).not.toContain('i18n:')
    }
    const before = await service.get({ kind: 'workspace', targetId: f.workspace.id })
    expect(
      await failure(
        service.apply({
          schemaVersion: before.schemaVersion,
          scope: before.scope,
          baselineRevisions: before.revisions,
          actorId: 'source-operator',
          idempotencyKey: 'wrong-scope',
          changes: [{ op: 'set', path: [{ kind: 'field', name: BACKEND_UNATTENDED_SETTING }], value: true }],
        }),
      ),
    ).toBeInstanceOf(Error)
    await f.policy(true)
    await f.reopen()
    const saved = await new SettingsService(f.storage).get({ kind: 'global' })
    expect(saved.resolution.reports['f:backend.unattended']?.effectiveValue).toBe(true)
  } finally {
    await f.close()
  }
})

test('durable retry planning reports bounded real Worker latency without model or backoff time', async () => {
  const f = await fixture()
  try {
    await f.policy(true)
    const writes: number[] = [],
      reads: number[] = []
    for (let sample = 0; sample < 24; sample++) {
      await f.fail()
      const start = performance.now()
      const created = await f.storage.call('autonomyRetryPlan', f.session.id)
      writes.push(performance.now() - start)
      expect(created).not.toBeNull()
      const readStart = performance.now()
      expect((await f.storage.call('autonomyRetryPlan', f.session.id))?.plan).toEqual(created?.plan)
      reads.push(performance.now() - readStart)
    }
    const report = (values: number[]) => {
      const ordered = values.toSorted((a, b) => a - b)
      return { p95Ms: ordered[Math.ceil(ordered.length * 0.95) - 1], maxMs: ordered.at(-1) }
    }
    console.log(
      JSON.stringify({
        event: 'autonomy-retry-plan-latency',
        samples: writes.length,
        durablePlan: report(writes),
        indexedReplay: report(reads),
      }),
    )
  } finally {
    await f.close()
  }
})

test('cancelling a retry root also cancels its second queued successor and survives restart without rewriting failed Runs', async () => {
  const f = await fixture()
  try {
    await f.policy(true)
    const original = await f.fail()
    const accepted = [original.id]
    for (let attempt = 1; attempt <= 2; attempt++) {
      const planned = await f.storage.call('autonomyRetryPlan', f.session.id)
      if (!planned) throw new Error('Missing retry cancellation plan')
      await Bun.sleep(Math.max(1, planned.plan.wakeAt - Date.now() + 5))
      const child = await f.storage.call(
        'enqueue',
        f.session.id,
        planned.plan.requestId,
        autonomyRetryInput(planned.predecessor),
        planned.predecessor.modelId,
        undefined,
        undefined,
        undefined,
        { plan: planned.plan, settingsRevision: planned.settingsRevision },
      )
      accepted.push(child.id)
      if (attempt === 1) {
        await f.storage.call('claim', f.session.id)
        await f.storage.call('setRun', child.id, 'failed', 'Temporary failure again', {
          code: 'PROVIDER_CONNECTION_FAILED',
          category: 'transient',
          retryable: true,
        })
      }
    }
    const cancelled = await f.storage.call('runtimeRecoveryCancel', original.id)
    expect(cancelled.targets?.map((target) => target.id)).toEqual(accepted)
    expect(cancelled.targets?.map((target) => target.status)).toEqual(['failed', 'failed', 'cancelled'])
    await f.reopen()
    for (const id of accepted.slice(0, -1)) expect(await f.storage.call('cancelRequested', id)).toBe(true)
    const queuedId = accepted.at(-1)
    if (!queuedId) throw new Error('Missing cancelled queued successor')
    expect((await f.storage.call('run', queuedId)).status).toBe('cancelled')
    expect(await f.storage.call('autonomyRetryPlan', f.session.id)).toBeNull()
    expect((await f.storage.call('runtimeRecoveryCancel', original.id)).events).toEqual([])
  } finally {
    await f.close()
  }
})

test('a manually supplied colliding request ID never makes an unrelated queued task a retry descendant', async () => {
  const f = await fixture()
  try {
    await f.policy(true)
    const original = await f.fail()
    const planned = await f.storage.call('autonomyRetryPlan', f.session.id)
    if (!planned) throw new Error('Missing collision fixture plan')
    const manual = await f.storage.call(
      'enqueue',
      f.session.id,
      planned.plan.requestId,
      { text: 'An independent user task', images: [], mode: 'plan', approval: 'deny' },
      original.modelId,
    )
    const cancelled = await f.storage.call('runtimeRecoveryCancel', original.id)
    expect(cancelled.targets?.map((target) => target.id)).toEqual([original.id])
    expect((await f.storage.call('run', manual.id)).status).toBe('queued')
    expect(await f.storage.call('cancelRequested', manual.id)).toBe(false)
  } finally {
    await f.close()
  }
})

test('root cancellation follows an accepted retry through its interrupted-runtime recovery successor', async () => {
  const f = await fixture()
  try {
    await f.policy(true)
    const original = await f.fail()
    const planned = await f.storage.call('autonomyRetryPlan', f.session.id)
    if (!planned) throw new Error('Missing interrupted retry plan')
    await Bun.sleep(Math.max(1, planned.plan.wakeAt - Date.now() + 5))
    const retry = await f.storage.call(
      'enqueue',
      f.session.id,
      planned.plan.requestId,
      autonomyRetryInput(original),
      original.modelId,
      undefined,
      undefined,
      undefined,
      { plan: planned.plan, settingsRevision: planned.settingsRevision },
    )
    await f.storage.call('claim', f.session.id)
    await f.storage.call('recover', {
      runIds: [retry.id],
      preserveQueued: true,
      preserveApprovals: true,
      reconcileInterrupted: true,
    })
    const recovery = await f.storage.call('runtimeRecoveryPlan', retry.id)
    const queued = await f.storage.call('runtimeRecoveryQueue', retry.id, recovery.recoveryId)
    if (!queued.run) throw new Error('Missing runtime recovery of the accepted retry')
    const cancelled = await f.storage.call('runtimeRecoveryCancel', original.id)
    expect(cancelled.targets?.map((target) => target.id)).toEqual([original.id, retry.id, queued.run.id])
    expect((await f.storage.call('run', queued.run.id)).status).toBe('cancelled')
    expect((await f.storage.call('run', retry.id)).status).toBe('interrupted')
    expect(await f.storage.call('cancelRequested', original.id)).toBe(true)
    expect(await f.storage.call('cancelRequested', retry.id)).toBe(true)
  } finally {
    await f.close()
  }
})

for (const access of [
  { role: 'observer' as const, workspaceIds: null },
  { role: 'operator' as const, workspaceIds: [] },
])
  test(`autonomous continuation rechecks the source device role and workspace permission: ${JSON.stringify(access)}`, async () => {
    const f = await fixture(access)
    try {
      await f.policy(true)
      await f.fail()
      expect(await f.storage.call('autonomyRetryPlan', f.session.id)).toBeNull()
    } finally {
      await f.close()
    }
  })

const diagnosedFailure: RunFailure = { code: 'TOOL_NOT_FOUND', category: 'execution', retryable: true }
const temporaryFailure: RunFailure = { code: 'PROVIDER_CONNECTION_FAILED', category: 'transient', retryable: true }

async function acceptPlannedRetry(f: Awaited<ReturnType<typeof fixture>>) {
  const planned = await f.storage.call('autonomyRetryPlan', f.session.id)
  if (!planned) throw new Error('Missing diagnosed retry plan')
  await Bun.sleep(Math.max(1, planned.plan.wakeAt - Date.now() + 5))
  const child = await f.storage.call(
    'enqueue',
    f.session.id,
    planned.plan.requestId,
    autonomyRetryInput(planned.predecessor),
    planned.predecessor.modelId,
    undefined,
    undefined,
    undefined,
    { plan: planned.plan, settingsRevision: planned.settingsRevision },
  )
  return { planned, child }
}

async function commitRetryTask(f: Awaited<ReturnType<typeof fixture>>) {
  const original = await f.storage.call('enqueue', f.session.id, crypto.randomUUID(), {
    text: 'Preserve the accepted task reference', images: [], mode: 'plan', approval: 'deny',
  }, 'fixture')
  await f.storage.call('claim', f.session.id)
  const { message } = await f.storage.call('commit', f.session.id, original.id, 'user', [
    { type: 'text', text: original.input.text },
  ])
  await f.storage.call('setRun', original.id, 'failed', 'Diagnosed tool failure', diagnosedFailure)
  return { original, message }
}

test('canonical input references are assigned only by trusted retry acceptance', async () => {
  const f = await fixture()
  try {
    await f.policy(true)
    await f.configure({ retryDelayMs: 100 })
    const { message } = await commitRetryTask(f)
    const planned = await f.storage.call('autonomyRetryPlan', f.session.id)
    if (!planned) throw new Error('Missing canonical reference fixture plan')
    await Bun.sleep(Math.max(1, planned.plan.wakeAt - Date.now() + 5))
    const forged = {
      plan: planned.plan, settingsRevision: planned.settingsRevision,
      canonicalInputMessageId: crypto.randomUUID(),
    }
    expect(await failure(f.storage.call(
      'enqueue', f.session.id, planned.plan.requestId, autonomyRetryInput(planned.predecessor),
      planned.predecessor.modelId, undefined, undefined, undefined, forged,
    ))).toMatchObject({ code: 'STORAGE_ERROR' })
    expect(await f.storage.call('runByRequest', f.session.id, planned.plan.requestId)).toBeNull()
    const { child } = await acceptPlannedRetry(f)
    const accepted = (await f.storage.call('events', f.session.id, 0, 200))
      .find((event) => event.runId === child.id && event.type === 'run.queued')
    expect(accepted?.data).toMatchObject({
      autonomyRetry: planned.plan, canonicalInputMessageId: message.id,
    })
    expect(await f.storage.call('recoveryInputMessage', child.id)).toMatchObject({ id: message.id })
  } finally {
    await f.close()
  }
})

test('legacy accepted retries retain the original input when the optional reference is absent', async () => {
  const f = await fixture()
  try {
    await f.policy(true)
    await f.configure({ retryDelayMs: 100 })
    const { original, message } = await commitRetryTask(f)
    const { child } = await acceptPlannedRetry(f)
    await f.editProjection((database) => {
      database.query("UPDATE events SET data=json_remove(data,'$.canonicalInputMessageId') WHERE runId=? AND type='run.queued'")
        .run(child.id)
    })
    const accepted = (await f.storage.call('events', f.session.id, 0, 200))
      .find((event) => event.runId === child.id && event.type === 'run.queued')
    expect(accepted?.data).not.toHaveProperty('canonicalInputMessageId')
    expect(await f.storage.call('recoveryInputMessage', child.id)).toMatchObject({
      id: message.id, runId: original.id, role: 'user', content: message.content,
    })
  } finally {
    await f.close()
  }
})

for (const corruption of ['missing', 'foreign-session', 'wrong-role', 'invalid-id', 'null-id'] as const) {
  test(`canonical retry input fails closed for a persisted ${corruption} reference`, async () => {
    const f = await fixture()
    try {
      await f.policy(true)
      await f.configure({ retryDelayMs: 100 })
      const { original } = await commitRetryTask(f)
      const { child } = await acceptPlannedRetry(f)
      let reference: string | number | null = crypto.randomUUID()
      if (corruption === 'foreign-session') {
        const foreign = await f.storage.call('createSessionCommand', {
          workspaceId: f.workspace.id, actorId: 'source-operator', idempotencyKey: crypto.randomUUID(),
        })
        const run = await f.storage.call('enqueue', foreign.id, crypto.randomUUID(), {
          text: 'A different task', images: [], mode: 'plan', approval: 'deny',
        }, 'fixture')
        await f.storage.call('claim', foreign.id)
        reference = (await f.storage.call('commit', foreign.id, run.id, 'user', [
          { type: 'text', text: run.input.text },
        ])).message.id
      } else if (corruption === 'wrong-role') {
        reference = (await f.storage.call('commit', f.session.id, original.id, 'assistant', [
          { type: 'text', text: 'A reply is not the task' },
        ])).message.id
      } else if (corruption === 'invalid-id') reference = 42
      else if (corruption === 'null-id') reference = null
      const before = (await f.storage.call('snapshot', f.session.id)).messages
      const encodedReference = JSON.stringify(reference)
      if (encodedReference === undefined) throw new Error('Missing corrupt reference fixture encoding')
      await f.editProjection((database) => {
        database.query("UPDATE events SET data=json_set(data,'$.canonicalInputMessageId',json(?)) WHERE runId=? AND type='run.queued'")
          .run(encodedReference, child.id)
      })
      expect(await failure(f.storage.call('recoveryInputMessage', child.id)))
        .toMatchObject({ code: 'SESSION_LOG_CORRUPTED' })
      expect((await f.storage.call('snapshot', f.session.id)).messages).toEqual(before)
    } finally {
      await f.close()
    }
  })
}

test('mixed retry and recovery capacity retains the original message beyond thirty-two predecessors', async () => {
  const f = await fixture()
  try {
    await f.policy(true)
    await f.configure({ transientRetries: 8, repairRetries: 8, retryDelayMs: 100 })
    const original = await f.storage.call('enqueue', f.session.id, crypto.randomUUID(), {
      text: 'One task across admitted mixed continuations', images: [], mode: 'plan', approval: 'deny',
    }, 'fixture')
    await f.storage.call('claim', f.session.id)
    const { message } = await f.storage.call('commit', f.session.id, original.id, 'user', [
      { type: 'text', text: original.input.text },
    ])
    await f.storage.call('setRun', original.id, 'failed', 'Diagnosed tool failure', diagnosedFailure)
    let currentId = original.id
    for (let index = 0; index < 11; index++) {
      const { child } = await acceptPlannedRetry(f)
      currentId = child.id
      for (let recoveryIndex = 0; recoveryIndex < 2; recoveryIndex++) {
        await f.storage.call('claim', f.session.id)
        await f.storage.call('recover', {
          runIds: [currentId], preserveQueued: true, preserveApprovals: true, reconcileInterrupted: true,
        })
        const planned = await f.storage.call('runtimeRecoveryPlan', currentId)
        const recovered = await f.storage.call('runtimeRecoveryQueue', currentId, planned.recoveryId)
        if (!recovered.run) throw new Error(`Expected an admitted recovery: ${recovered.chain.reasonCode}`)
        expect(recovered.chain.automaticAttempts).toBe(recoveryIndex + 1)
        currentId = recovered.run.id
      }
      if (index < 10) {
        await f.storage.call('claim', f.session.id)
        await f.storage.call('setRun', currentId, 'failed', 'Actionable failure after safe recovery',
          index % 2 === 0 ? temporaryFailure : diagnosedFailure)
      }
    }
    expect(await f.storage.call('autonomyRetryContext', currentId)).toMatchObject({
      plan: { rootRunId: original.id, transientRetries: 5, repairRetries: 6 },
    })
    expect((await f.storage.call('snapshot', f.session.id)).messages.filter((item) => item.role === 'user')).toHaveLength(1)
    await f.reopen()
    expect(await f.storage.call('recoveryInputMessage', currentId)).toMatchObject({
      id: message.id, runId: original.id, role: 'user', content: message.content,
    })
  } finally {
    await f.close()
  }
})

test('automatic retry input reuses the committed task through restart and interrupted recovery', async () => {
  const f = await fixture()
  try {
    await f.policy(true)
    await f.configure({ retryDelayMs: 100 })
    const original = await f.storage.call('enqueue', f.session.id, crypto.randomUUID(), {
      text: 'Retain the one original task', images: [], mode: 'plan', approval: 'deny',
    }, 'fixture')
    await f.storage.call('claim', f.session.id)
    const { message } = await f.storage.call('commit', f.session.id, original.id, 'user', [
      { type: 'text', text: original.input.text },
    ])
    await f.storage.call('setRun', original.id, 'failed', 'Diagnosed tool failure', diagnosedFailure)
    const { child } = await acceptPlannedRetry(f)
    expect(await f.storage.call('recoveryInputMessage', child.id)).toMatchObject({
      id: message.id, runId: original.id, role: 'user', content: message.content,
    })
    await f.storage.call('claim', f.session.id)
    await f.storage.call('recover', {
      runIds: [child.id], preserveQueued: true, preserveApprovals: true, reconcileInterrupted: true,
    })
    const recovery = await f.storage.call('runtimeRecoveryPlan', child.id)
    const successor = await f.storage.call('runtimeRecoveryQueue', child.id, recovery.recoveryId)
    if (!successor.run) throw new Error('Missing interrupted retry successor')
    expect(await f.storage.call('recoveryInputMessage', successor.run.id)).toMatchObject({ id: message.id })
    await f.reopen()
    expect(await f.storage.call('recoveryInputMessage', successor.run.id)).toMatchObject({ id: message.id })
    expect((await f.storage.call('snapshot', f.session.id)).messages.filter((item) => item.role === 'user')).toHaveLength(1)
  } finally {
    await f.close()
  }
})

test('an uncommitted original input is written only once by its first accepted retry', async () => {
  const f = await fixture()
  try {
    await f.policy(true)
    await f.configure({ retryDelayMs: 100 })
    const original = await f.fail(diagnosedFailure)
    const { child } = await acceptPlannedRetry(f)
    expect(await f.storage.call('recoveryInputMessage', child.id)).toBeNull()
    const firstAcceptance = (await f.storage.call('events', f.session.id, 0, 200))
      .find((event) => event.runId === child.id && event.type === 'run.queued')
    expect(firstAcceptance?.data).not.toHaveProperty('canonicalInputMessageId')
    await f.storage.call('claim', f.session.id)
    const { message } = await f.storage.call('commit', f.session.id, child.id, 'user', [
      { type: 'text', text: original.input.text },
    ])
    await f.storage.call('setRun', child.id, 'failed', 'Temporary connection failure', temporaryFailure)
    const { child: next } = await acceptPlannedRetry(f)
    const nextAcceptance = (await f.storage.call('events', f.session.id, 0, 200))
      .find((event) => event.runId === next.id && event.type === 'run.queued')
    expect(nextAcceptance?.data).toHaveProperty('canonicalInputMessageId', message.id)
    expect(await f.storage.call('recoveryInputMessage', next.id)).toMatchObject({
      id: message.id, runId: child.id, role: 'user', content: message.content,
    })
    await f.reopen()
    expect(await f.storage.call('recoveryInputMessage', next.id)).toMatchObject({ id: message.id })
    expect((await f.storage.call('snapshot', f.session.id)).messages.filter((item) => item.role === 'user')).toHaveLength(1)
  } finally {
    await f.close()
  }
})

test('a system input without a trusted retry acceptance cannot reuse an earlier task message', async () => {
  const f = await fixture()
  try {
    await f.policy(true)
    const original = await f.storage.call('enqueue', f.session.id, crypto.randomUUID(), {
      text: 'The same text is not lineage', images: [], mode: 'plan', approval: 'deny',
    }, 'fixture')
    await f.storage.call('claim', f.session.id)
    await f.storage.call('commit', f.session.id, original.id, 'user', [{ type: 'text', text: original.input.text }])
    await f.storage.call('setRun', original.id, 'failed', 'Usage exhausted', {
      code: 'PROVIDER_USAGE_LIMIT', category: 'usage_limit', retryable: false,
    })
    const unrelated = await f.storage.call('enqueue', f.session.id, crypto.randomUUID(), {
      ...original.input, source: 'system',
    }, original.modelId)
    expect(await f.storage.call('recoveryInputMessage', unrelated.id)).toBeNull()
    const originalMessage = (await f.storage.call('snapshot', f.session.id)).messages.find((message) => message.role === 'user')
    if (!originalMessage) throw new Error('Missing original task fixture message')
    await f.editProjection((database) => {
      database.query("UPDATE events SET data=json_set(data,'$.canonicalInputMessageId',?) WHERE runId=? AND type='run.queued'")
        .run(originalMessage.id, unrelated.id)
    })
    expect(await f.storage.call('recoveryInputMessage', unrelated.id)).toBeNull()
  } finally {
    await f.close()
  }
})

test('diagnostic repairs and transient retries consume independent durable allowances through restart', async () => {
  const f = await fixture()
  try {
    expect(autonomyRetryConfigurationSchema.parse({})).toEqual({
      transientRetries: 2,
      repairRetries: 3,
      retryDelayMs: 1000,
    })
    await f.configure({ retryDelayMs: 100 })
    await f.policy(true)
    const original = await f.fail(diagnosedFailure)
    const expected = [
      { kind: 'repair', transientRetries: 0, repairRetries: 1, next: temporaryFailure, delay: 100 },
      { kind: 'transient', transientRetries: 1, repairRetries: 1, next: diagnosedFailure, delay: 100 },
      { kind: 'repair', transientRetries: 1, repairRetries: 2, next: temporaryFailure, delay: 200 },
      { kind: 'transient', transientRetries: 2, repairRetries: 2, next: diagnosedFailure, delay: 200 },
      { kind: 'repair', transientRetries: 2, repairRetries: 3, next: diagnosedFailure, delay: 400 },
    ]
    for (const step of expected) {
      const before = await f.storage.call('autonomyRetryPlan', f.session.id)
      expect(before?.plan).toMatchObject({
        kind: step.kind,
        transientRetries: step.transientRetries,
        repairRetries: step.repairRetries,
        rootRunId: original.id,
      })
      expect(before?.plan.wakeAt).toBe((before?.predecessor.endedAt ?? 0) + step.delay)
      await f.reopen()
      expect(await f.storage.call('autonomyRetryPlan', f.session.id)).toEqual(before)
      const { child, planned } = await acceptPlannedRetry(f)
      expect(child.input).toMatchObject({ mode: 'plan', approval: 'deny', source: 'system' })
      if (step.kind === 'repair') {
        expect(await f.storage.call('autonomyRetryContext', child.id)).toMatchObject({
          plan: planned.plan,
          failureCode: 'TOOL_NOT_FOUND',
          diagnostic: planned.predecessor.error,
        })
      }
      expect(child.input.text).toBe(original.input.text)
      expect(await f.storage.call('runExecutionPrincipal', child.id)).toEqual(
        await f.storage.call('runExecutionPrincipal', original.id),
      )
      await f.storage.call('claim', f.session.id)
      await f.storage.call('setRun', child.id, 'failed', 'The diagnosed failure remains', step.next)
    }
    expect(await f.storage.call('autonomyRetryPlan', f.session.id)).toBeNull()
    await f.reopen()
    expect(await f.storage.call('autonomyRetryPlan', f.session.id)).toBeNull()
    expect((await f.storage.call('snapshot', f.session.id)).runs).toHaveLength(6)
    await f.configure({ repairRetries: 4, retryDelayMs: 60_000 })
    const capped = await f.storage.call('autonomyRetryPlan', f.session.id)
    expect(capped?.plan).toMatchObject({ repairRetries: 4, transientRetries: 2 })
    expect(capped?.plan.wakeAt).toBe((capped?.predecessor.endedAt ?? 0) + 300_000)
  } finally {
    await f.close()
  }
})

test('retry configuration can disable either category, increase its count and change only unsaved delays', async () => {
  const f = await fixture()
  try {
    await f.policy(true)
    await f.configure({ transientRetries: 0, repairRetries: 0, retryDelayMs: 100 })
    await f.fail(temporaryFailure)
    expect(await f.storage.call('autonomyRetryPlan', f.session.id)).toBeNull()
    await f.fail(diagnosedFailure)
    expect(await f.storage.call('autonomyRetryPlan', f.session.id)).toBeNull()
    await f.configure({ repairRetries: 1 })
    const planned = await f.storage.call('autonomyRetryPlan', f.session.id)
    if (!planned) throw new Error('Missing configured repair')
    await f.configure({ retryDelayMs: 60_000 })
    const updated = await f.storage.call('autonomyRetryPlan', f.session.id)
    expect(updated?.plan).toEqual(planned.plan)
    expect(updated?.settingsRevision).not.toBe(planned.settingsRevision)
    expect(
      await failure(
        f.storage.call(
          'enqueue',
          f.session.id,
          planned.plan.requestId,
          autonomyRetryInput(planned.predecessor),
          planned.predecessor.modelId,
          undefined,
          undefined,
          undefined,
          { plan: planned.plan, settingsRevision: planned.settingsRevision },
        ),
      ),
    ).toMatchObject({ code: 'AUTONOMY_RETRY_STALE' })
    const { child } = await acceptPlannedRetry(f)
    await f.storage.call('claim', f.session.id)
    await f.storage.call('setRun', child.id, 'failed', 'Still diagnosed', diagnosedFailure)
    expect(await f.storage.call('autonomyRetryPlan', f.session.id)).toBeNull()
    await f.configure({ repairRetries: 4 })
    const second = await f.storage.call('autonomyRetryPlan', f.session.id)
    expect(second?.plan).toMatchObject({ repairRetries: 2, transientRetries: 0 })
    expect(second?.plan.wakeAt).toBe((second?.predecessor.endedAt ?? 0) + 120_000)
    await f.reopen()
    expect(await f.storage.call('autonomyRetryPlan', f.session.id)).toEqual(second)
    await f.configure({ repairRetries: 0 })
    expect(await f.storage.call('autonomyRetryPlan', f.session.id)).toBeNull()
  } finally {
    await f.close()
  }
})

test('repair eligibility never bypasses unknown effects, current authority or source cancellation', async () => {
  const f = await fixture()
  try {
    await f.policy(true)
    await f.configure({ retryDelayMs: 100 })
    for (const code of ['PERMISSION_DENIED', 'RESULT_UNKNOWN', 'EFFECT_UNKNOWN', 'STORAGE_FAILURE', 'RUN_STEP_LIMIT']) {
      await f.fail({ code, category: 'execution', retryable: true })
      expect(await f.storage.call('autonomyRetryPlan', f.session.id)).toBeNull()
    }
    const original = await f.fail(diagnosedFailure)
    await f.storage.call('toolStart', f.session.id, original.id, 'unsettled', 'write_file', { path: 'fixture.txt' })
    expect(await f.storage.call('autonomyRetryPlan', f.session.id)).toBeNull()
    await f.storage.call('toolEnd', f.session.id, original.id, 'unsettled')
    const { child } = await acceptPlannedRetry(f)
    const cancelled = await f.storage.call('runtimeRecoveryCancel', original.id)
    expect(cancelled.targets?.map((run) => run.id)).toEqual([original.id, child.id])
    expect((await f.storage.call('run', child.id)).status).toBe('cancelled')
    await f.reopen()
    expect(await f.storage.call('autonomyRetryPlan', f.session.id)).toBeNull()
    expect(await f.storage.call('cancelRequested', original.id)).toBe(true)
  } finally {
    await f.close()
  }
})

test('retry settings expose localized bounded numeric controls and preserve strict save validation', async () => {
  const f = await fixture()
  try {
    const service = new SettingsService(f.storage)
    for (const name of [
      AUTONOMY_TRANSIENT_RETRIES_SETTING,
      AUTONOMY_REPAIR_RETRIES_SETTING,
      AUTONOMY_RETRY_DELAY_SETTING,
    ]) {
      const field = service
        .describe()
        .fields.find((field) => field.path[0]?.kind === 'field' && field.path[0].name === name)
      if (!field?.helpKey) throw new Error('Missing retry settings description')
      expect(field).toMatchObject({
        type: 'integer',
        component: 'NumberField',
        allowedScopes: ['global'],
        applyMode: 'nextRequest',
      })
      for (const locale of ['zh-CN', 'en-US'] as const) {
        const label = resolveBackendExecutionSettingCopy(locale, field.labelKey)
        const help = resolveBackendExecutionSettingCopy(locale, field.helpKey)
        if (!label || !help) throw new Error('Missing retry settings copy')
        expect(label).not.toContain('i18n:')
        expect(help).not.toContain('i18n:')
      }
    }
    for (const invalid of [
      { transientRetries: 9 },
      { repairRetries: -1 },
      { repairRetries: 1.5 },
      { retryDelayMs: 99 },
      { retryDelayMs: 60_001 },
    ]) {
      expect(await failure(f.configure(invalid))).toBeInstanceOf(Error)
    }
    await f.configure({ transientRetries: 4, repairRetries: 0, retryDelayMs: 250 })
    await f.reopen()
    const saved = await new SettingsService(f.storage).get({ kind: 'global' })
    expect(saved.resolution.reports['f:backend.transientRetries']?.effectiveValue).toBe(4)
    expect(saved.resolution.reports['f:backend.repairRetries']?.effectiveValue).toBe(0)
    expect(saved.resolution.reports['f:backend.retryDelayMs']?.effectiveValue).toBe(250)
  } finally {
    await f.close()
  }
})

test('retry input preserves a maximum-size original task without recursive prompt growth', async () => {
  const f = await fixture()
  try {
    const run = await f.fail(diagnosedFailure)
    const full = { ...run, input: { ...run.input, text: '界'.repeat(200_000) } }
    const next = autonomyRetryInput(full)
    expect(inputSchema.parse(next).text).toBe(full.input.text)
    expect(autonomyRetryInput({ ...full, input: next })).toEqual(next)
  } finally {
    await f.close()
  }
})

test('bounded diagnostic context survives recovery of its accepted child without repeating the task body', async () => {
  const f = await fixture()
  try {
    await f.policy(true)
    await f.configure({ retryDelayMs: 100 })
    const original = await f.fail(diagnosedFailure, '界'.repeat(12_000))
    const { child } = await acceptPlannedRetry(f)
    const context = await f.storage.call('autonomyRetryContext', child.id)
    expect(context?.diagnostic).toHaveLength(4000)
    expect(context?.failureCode).toBe('TOOL_NOT_FOUND')
    expect(await f.storage.call('autonomyRetryContext', original.id)).toBeNull()
    await f.storage.call('claim', f.session.id)
    await f.storage.call('recover', {
      runIds: [child.id],
      preserveQueued: true,
      preserveApprovals: true,
      reconcileInterrupted: true,
    })
    const recovery = await f.storage.call('runtimeRecoveryPlan', child.id)
    const successor = await f.storage.call('runtimeRecoveryQueue', child.id, recovery.recoveryId)
    if (!successor.run) throw new Error('Missing recovery of the accepted diagnostic repair')
    expect(await f.storage.call('autonomyRetryContext', successor.run.id)).toEqual(context)
    await f.reopen()
    expect(await f.storage.call('autonomyRetryContext', successor.run.id)).toEqual(context)
  } finally {
    await f.close()
  }
})

test('automatic repair admission cannot replace the original approval, mode, sandbox or attachments', async () => {
  const f = await fixture()
  try {
    await f.policy(true)
    await f.configure({ retryDelayMs: 100 })
    await f.fail(diagnosedFailure)
    const planned = await f.storage.call('autonomyRetryPlan', f.session.id)
    if (!planned) throw new Error('Missing retained-constraint repair')
    const original = autonomyRetryInput(planned.predecessor)
    await Bun.sleep(Math.max(1, planned.plan.wakeAt - Date.now() + 5))
    const attempts: UserInput[] = [
      { ...original, approval: 'allow' },
      { ...original, mode: 'default' },
      { ...original, maxMode: true },
      { ...original, sandbox: { profileId: ':workspace-write', digest: 'c'.repeat(64) } },
      { ...original, images: [{ id: 'a'.repeat(64), name: 'Other image', mime: 'image/png', size: 1 }] },
      { ...original, files: [{ id: 'b'.repeat(64), name: 'Other file', mime: 'text/plain', size: 1 }] },
      { ...original, continuation: { goalId: 'different-goal', intentId: 'different-intent' } },
    ]
    for (const changed of attempts) {
      expect(
        await failure(
          f.storage.call(
            'enqueue',
            f.session.id,
            planned.plan.requestId,
            changed,
            planned.predecessor.modelId,
            undefined,
            undefined,
            undefined,
            { plan: planned.plan, settingsRevision: planned.settingsRevision },
          ),
        ),
      ).toMatchObject({ code: 'AUTONOMY_RETRY_INVALID' })
    }
    expect((await f.storage.call('snapshot', f.session.id)).runs).toHaveLength(1)
    const { child } = await acceptPlannedRetry(f)
    expect(child.input).toEqual(original)
  } finally {
    await f.close()
  }
})
