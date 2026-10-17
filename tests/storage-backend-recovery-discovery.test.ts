import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  Storage,
  type RuntimeBackendRecoveryCursor,
  type RuntimeBackendRecoveryPage,
  type RuntimeRecoveryRecord,
} from '@hbar/storage'
import { removeOwnedTestDirectory } from './owned-temp-directory'

interface Fixture {
  storage: Storage
  sessionId: string
}

async function withFixture(action: (fixture: Fixture) => Promise<void>) {
  const prefix = 'hbar-recovery-discovery-page-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const storage = new Storage(join(root, 'state.sqlite'))
  let primary: { error: unknown } | undefined
  try {
    await storage.call('ready')
    const workspace = await storage.call('createWorkspace', root, 'Discovery page fixture')
    const session = await storage.call('createSession', workspace.id)
    await action({ storage, sessionId: session.id })
  } catch (error) {
    primary = { error }
  }
  const failures: unknown[] = []
  try {
    await storage.close()
  } catch (error) {
    failures.push(error)
  }
  if (failures.length === 0) {
    try {
      await removeOwnedTestDirectory(root, prefix)
    } catch (error) {
      failures.push(error)
    }
  }
  if (primary) {
    if (failures.length)
      throw new AggregateError([primary.error, ...failures], 'Discovery page failed during cleanup', {
        cause: primary.error,
      })
    throw primary.error
  }
  if (failures.length) throw new AggregateError(failures, 'Discovery page cleanup failed; retain unclosed resources')
}

async function hold(f: Fixture, reason: string) {
  const run = await f.storage.call(
    'enqueue',
    f.sessionId,
    crypto.randomUUID(),
    { text: 'Existing request', images: [], source: 'user' },
    'fixture',
  )
  await f.storage.call('claim', f.sessionId)
  await f.storage.call('recover', { runIds: [run.id], preserveQueued: true, preserveApprovals: true })
  const record = await f.storage.call('runtimeRecoveryPlan', run.id)
  return f.storage.call('runtimeRecoveryHold', run.id, record.recoveryId, reason)
}

test('bounded recovery windows advance across empty matches and return only canonical identities', async () => {
  await withFixture(async (f) => {
    const rows: RuntimeRecoveryRecord[] = []
    for (let index = 0; index < 9; index++) rows.push(await hold(f, 'WORKFLOW_WAIT'))
    rows.sort((left, right) => (left.predecessorRunId < right.predecessorRunId ? -1 : 1))
    const target = rows.at(-1)
    if (!target) throw new Error('Missing the final discovery candidate')
    await f.storage.call(
      'runtimeRecoveryHold',
      target.predecessorRunId,
      target.recoveryId,
      'BACKEND_AUTOMATION_DISABLED',
    )
    await f.storage.call('append', f.sessionId, 'fixture.padding', { body: 'unrelated'.repeat(8_192) })
    let cursor: RuntimeBackendRecoveryCursor | undefined
    const discovered: RuntimeBackendRecoveryPage['items'] = []
    for (let index = 0; index < 5; index++) {
      const page = await f.storage.call('runtimeBackendRecoveryPage', { ...(cursor ? { cursor } : {}), limit: 2 })
      if (index < 4) {
        expect(page.items).toHaveLength(0)
        expect(page.nextCursor).not.toBeNull()
      } else {
        expect(page.items).toEqual([{ recoveryId: target.recoveryId, predecessorRunId: target.predecessorRunId }])
        expect(page.nextCursor).toBeNull()
      }
      expect(JSON.stringify(page).length).toBeLessThan(1_024)
      if (cursor && page.nextCursor) {
        expect(page.nextCursor.after > cursor.after).toBe(true)
        expect(page.nextCursor.through).toBe(cursor.through)
      }
      discovered.push(...page.items)
      cursor = page.nextCursor ?? undefined
    }
    expect(discovered).toHaveLength(1)
    expect((await f.storage.call('runtimeRecoveryRead', target.predecessorRunId))?.run).toBeNull()
    // An independent reader must not inherit another window's prepared-statement cursor.
    const first = await f.storage.call('runtimeBackendRecoveryPage', { limit: 1 })
    const wider = await f.storage.call('runtimeBackendRecoveryPage', { limit: 4 })
    expect(first.nextCursor?.after).toBe(rows[0]?.predecessorRunId)
    expect(wider.nextCursor?.after).toBe(rows[3]?.predecessorRunId)
  })
}, 20_000)

test('a recovery scan keeps its original upper boundary while a fresh scan sees later identities', async () => {
  await withFixture(async (f) => {
    const original: RuntimeRecoveryRecord[] = []
    for (let index = 0; index < 3; index++) original.push(await hold(f, 'BACKEND_AUTOMATION_DISABLED'))
    const first = await f.storage.call('runtimeBackendRecoveryPage', { limit: 1 })
    if (!first.nextCursor) throw new Error('Missing the original recovery window')
    const through = first.nextCursor.through
    for (let index = 0; index < 3; index++) await hold(f, 'BACKEND_AUTOMATION_DISABLED')
    const seen = [...first.items]
    let cursor: RuntimeBackendRecoveryCursor | undefined = first.nextCursor
    for (let index = 0; cursor && index < 8; index++) {
      const page: RuntimeBackendRecoveryPage = await f.storage.call('runtimeBackendRecoveryPage', { cursor, limit: 1 })
      expect(page.items.every((item) => item.predecessorRunId <= through)).toBe(true)
      if (page.nextCursor) expect(page.nextCursor.through).toBe(through)
      seen.push(...page.items)
      cursor = page.nextCursor ?? undefined
    }
    expect(cursor).toBeUndefined()
    expect(new Set(seen.map((item) => item.predecessorRunId)).size).toBe(seen.length)
    expect(original.every((record) => seen.some((item) => item.recoveryId === record.recoveryId))).toBe(true)
    const fresh = await f.storage.call('runtimeBackendRecoveryPage', { limit: 64 })
    expect(fresh.items).toHaveLength(6)
    expect(fresh.nextCursor).toBeNull()
  })
}, 20_000)

test('empty recovery pages terminate and invalid capacity fails before any recovery admission', async () => {
  await withFixture(async (f) => {
    expect(await f.storage.call('runtimeBackendRecoveryPage', {})).toEqual({ items: [], nextCursor: null })
    for (const limit of [0, 65, -1, 1.5]) {
      const failure = await f.storage.call('runtimeBackendRecoveryPage', { limit }).then(
        () => null,
        (error: unknown) => error,
      )
      expect(failure).toBeInstanceOf(Error)
    }
    expect((await f.storage.call('snapshot', f.sessionId)).runs).toHaveLength(0)
  })
}, 20_000)
