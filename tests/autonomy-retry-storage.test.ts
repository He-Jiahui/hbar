import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage, isDurableSessionEvent } from '@hbar/storage'
import { SettingsService } from '@hbar/kernel/controller'
import { BACKEND_UNATTENDED_SETTING } from '@hbar/contracts/backend'
import { autonomyRetryInput } from '@hbar/contracts/autonomy-retry'
import type { RunFailure } from '@hbar/contracts'
import { removeOwnedTestDirectory } from './owned-temp-directory'
import { getShellCopy } from '../apps/web/src/shell-copy'

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
  const fail = async (
    reason: RunFailure = { code: 'PROVIDER_CONNECTION_FAILED', category: 'transient', retryable: true },
  ) => {
    const run = await storage.call(
      'enqueue',
      session.id,
      crypto.randomUUID(),
      { text: 'Complete the original task', images: [], mode: 'plan', approval: 'deny' },
      'fixture',
    )
    await storage.call('claim', session.id)
    await storage.call('setRun', run.id, 'failed', 'Temporary provider failure', reason)
    return storage.call('run', run.id)
  }
  return {
    get storage() {
      return storage
    },
    session,
    workspace,
    policy,
    fail,
    async reopen() {
      await storage.close()
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
      const copy = getShellCopy(locale).settings
      expect(copy.resolve(field.labelKey)).not.toContain('i18n:')
      expect(copy.resolve(field.helpKey)).not.toContain('i18n:')
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
