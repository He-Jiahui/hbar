import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { type ArtifactRef } from '@hbar/contracts'
import type {
  ChatDatabaseOperation,
  ChatDatabasePreviewItem,
  ChatDatabaseScope,
} from '@hbar/contracts/commands/chat-database'
import { Storage, createPathLayout, ensurePathLayout, createChatDatabaseFileScanner } from '@hbar/storage'
import {
  SettingsService,
  createChatDatabaseArtifactReferenceService,
  createChatDatabaseMaintenanceService,
  createChatDatabaseResourceService,
  createChatDatabaseStatisticsService,
} from '@hbar/kernel'
import { createChatDatabaseArtifactStorage } from '../packages/storage/src/chat-database-artifacts'
import {
  createChatDatabaseResourceLedger,
  type ChatDatabaseResourceStage,
} from '../packages/storage/src/chat-database-resource-ledger'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})
const identity = () => ({ actorId: 'device', idempotencyKey: crypto.randomUUID() })
const errorOf = (task: Promise<unknown>) =>
  task.then(
    () => null,
    (reason: unknown) => reason,
  )
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-chat-resources-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'paths.json'))
  await ensurePathLayout(layout)
  const workers: Storage[] = []
  const services: (() => Promise<void>)[] = []
  cleanups.push(async () => {
    for (const close of services.reverse()) await close()
    for (const worker of workers) await worker.close()
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('hbar-chat-resources-'))
      throw new Error('Fixture cleanup leaves its temporary root')
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })
  async function open() {
    const worker = new Storage(layout.database, layout)
    workers.push(worker)
    await worker.call('ready')
    return worker
  }
  const storage = await open()
  const settings = new SettingsService(storage)
  const references = createChatDatabaseArtifactReferenceService(storage, layout.settings)
  const statistics = createChatDatabaseStatisticsService(storage, settings, createChatDatabaseFileScanner(layout))
  const protectedRoots: string[] = []
  let busy = false
  let beforeRemove: (item: ChatDatabasePreviewItem) => Promise<void> = () => Promise.resolve()
  const resources = createChatDatabaseResourceService(storage, layout, references, {
    protectedRoots: () => protectedRoots,
    async remove(input) {
      await beforeRemove(input.item)
      if (busy && input.item.kind === 'cache') return { deleted: false, reason: 'inUse', reclaimedBytes: 0 }
      return storage.call('chatDatabaseResourceRemove', { ...input, protectedRoots })
    },
  })
  const maintenance = createChatDatabaseMaintenanceService(
    storage,
    settings,
    statistics,
    {
      protection: () => null,
      removeSession: (input) => storage.call('chatDatabaseDeleteSession', input),
      deleted: () => undefined,
    },
    resources,
  )
  const closeServices = async () => {
    await maintenance.close()
    await statistics.close()
    await references.close()
  }
  services.push(closeServices)
  async function recover(worker = storage) {
    for (let attempt = 0; attempt < 1000; attempt++) {
      const result = await worker.call('chatDatabaseDraftBackfill', 100)
      if (result.done) {
        expect(result.healthy).toBe(true)
        break
      }
    }
    while (!(await worker.call('chatDatabaseUsageBackfill', 250)).complete) {
      /* bounded history batches */
    }
    await worker.call('chatDatabaseLegacySettingsComplete', true)
  }
  async function artifact(text = 'orphan data'): Promise<ArtifactRef> {
    const data = Buffer.from(text)
    const ref = {
      id: createHash('sha256').update(data).digest('hex'),
      name: `${text}.bin`,
      mime: 'application/octet-stream',
      size: data.length,
    }
    await writeFile(join(layout.artifacts, ref.id), data)
    await storage.call('putArtifact', ref)
    await storage.call('chatDatabaseArtifactSeedLegacy', ref.id, 0, 0)
    await recover()
    return ref
  }
  async function cache(path: string, text = 'cached data') {
    const target = join(layout.cacheRoot, path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, text)
    await utimes(target, 0, 0)
    return target
  }
  async function settled(id: string): Promise<ChatDatabaseOperation> {
    for (let attempt = 0; attempt < 2000; attempt++) {
      const state = await maintenance.read(id)
      if (['completed', 'failed', 'cancelled', 'unknown'].includes(state.status)) return state
      await new Promise<void>((resolve) => setTimeout(resolve, 5))
    }
    throw new Error('Resource operation did not settle')
  }
  async function preview(kind: 'attachments' | 'cache', scope: ChatDatabaseScope = { kind: 'global' }) {
    const state = await settled((await maintenance.preview({ kind, scope }, identity())).operationId)
    expect(state.status).toBe('completed')
    return state
  }
  async function cleanup(fixed: ChatDatabaseOperation) {
    return settled((await maintenance.cleanup({ previewId: fixed.operationId }, identity())).operationId)
  }
  async function items(fixed: ChatDatabaseOperation) {
    return (await maintenance.page({ previewId: fixed.operationId, limit: 100 })).items
  }
  return {
    root,
    layout,
    storage,
    open,
    settings,
    references,
    statistics,
    maintenance,
    recover,
    artifact,
    cache,
    settled,
    preview,
    cleanup,
    items,
    closeServices,
    protectedRoots,
    busy: (value: boolean) => {
      busy = value
    },
    beforeRemove: (callback: typeof beforeRemove) => {
      beforeRemove = callback
    },
  }
}

test('raw orphan deletion reports real bytes, keeps fixed candidates, and returns the same receipt on retry', async () => {
  const f = await fixture()
  const ref = await f.artifact()
  const fixed = await f.preview('attachments')
  const item = (await f.items(fixed)).find((item) => item.id === ref.id)!
  expect(item).toMatchObject({ eligible: true, estimatedBytes: ref.size, resource: { path: ref.id, size: ref.size } })
  const later = await f.artifact('outside preview')
  const done = await f.cleanup(fixed)
  expect(done).toMatchObject({ status: 'completed', deletedCount: 1, reclaimedBytes: ref.size })
  expect(await errorOf(lstat(join(f.layout.artifacts, ref.id)))).toMatchObject({ code: 'ENOENT' })
  expect((await lstat(join(f.layout.artifacts, later.id))).size).toBe(later.size)
  expect(
    await f.storage.call('chatDatabaseResourceRemove', {
      operationId: done.operationId,
      scope: fixed.scope,
      item,
      cutoffAt: fixed.createdAt,
    }),
  ).toEqual({ deleted: true, reason: null, reclaimedBytes: ref.size })
})

test('a new draft reference or changed file after preview blocks reclamation', async () => {
  const f = await fixture()
  const reference = await f.artifact('now referenced')
  const changed = await f.artifact('changed bytes')
  const fixed = await f.preview('attachments')
  await f.storage.call(
    'chatDatabaseDraftSync',
    {
      expectedRevision: 0,
      owner: {
        id: 'window',
        kind: 'preSession',
        clientRevision: 0,
        artifactIds: [reference.id],
        pendingArtifactIds: [],
      },
    },
    identity(),
  )
  await writeFile(join(f.layout.artifacts, changed.id), 'new data')
  const done = await f.cleanup(fixed)
  expect(done).toMatchObject({ status: 'completed', deletedCount: 0, reclaimedBytes: 0 })
  expect(done.skipped).toContainEqual({ code: 'referenced', count: 1 })
  expect(done.skipped).toContainEqual({ code: 'fileChanged', count: 1 })
  expect(await readFile(join(f.layout.artifacts, changed.id), 'utf8')).toBe('new data')
  expect((await lstat(join(f.layout.artifacts, reference.id))).size).toBe(reference.size)
})

test('legacy devices, live upload leases and incomplete reference indexes stay protected', async () => {
  const f = await fixture()
  const legacy = await f.artifact('legacy inventory')
  const upload = await f.artifact('upload lease')
  await f.storage.call('putDevice', { id: 'old-device', name: 'old', createdAt: 0, lastSeenAt: 0 }, 'hash')
  await f.storage.call('chatDatabaseArtifactReserve', {
    artifactId: upload.id,
    deviceId: 'new-device',
    ownerId: 'preSession:upload',
    leaseId: 'lease',
  })
  const fixed = await f.preview('attachments')
  expect((await f.items(fixed)).find((item) => item.id === legacy.id)?.skipReason).toBe('legacyInventory')
  expect((await f.items(fixed)).find((item) => item.id === upload.id)?.skipReason).toBe('inUse')
  await f.storage.call('chatDatabaseLegacySettingsComplete', false)
  expect((await f.storage.call('chatDatabaseArtifactEligibility', legacy.id, Date.now())).reason).toBe('legacyArtifact')
})

test('only the scope that removes the last shared reference owns the orphan, including after database rebuild', async () => {
  const f = await fixture()
  const ref = await f.artifact('shared reference')
  const firstWorkspace = await f.storage.call('createWorkspace', f.root, 'first')
  const secondWorkspace = await f.storage.call('createWorkspace', join(f.root, 'second'), 'second')
  const first = await f.storage.call('createSession', firstWorkspace.id, 'first')
  const second = await f.storage.call('createSession', secondWorkspace.id, 'second')
  for (const session of [first, second])
    await f.storage.call('commit', session.id, 'fixture', 'user', [{ type: 'file', artifact: ref }])
  await f.recover()
  for (const session of [first, second]) {
    const usage = await f.storage.call('chatDatabaseUsage', { kind: 'session', targetId: session.id })
    const db = new Database(f.layout.database, { strict: true })
    const lastActivityAt = db
      .query<{ lastActivityAt: number }, [string]>('SELECT lastActivityAt FROM chat_database_usage WHERE sessionId=?')
      .get(session.id)!.lastActivityAt
    db.close()
    expect(usage.sessionCount).toBe(1)
    await f.storage.call('chatDatabaseDeleteSession', {
      sessionId: session.id,
      operationId: `delete-${session.id}`,
      expectedSeq: (await f.storage.call('session', session.id)).seq,
      expectedActivityAt: lastActivityAt,
    })
  }
  expect(
    await f.storage.call('chatDatabaseArtifactHasCause', ref.id, { kind: 'workspace', targetId: firstWorkspace.id }),
  ).toBe(false)
  expect(await f.storage.call('chatDatabaseArtifactHasCause', ref.id, { kind: 'session', targetId: second.id })).toBe(
    true,
  )
  const scoped = await f.preview('attachments', { kind: 'workspace', targetId: firstWorkspace.id })
  expect(scoped.candidateCount).toBe(0)
  await f.closeServices()
  await f.storage.close()
  for (const suffix of ['', '-wal', '-shm']) await rm(`${f.layout.database}${suffix}`, { force: true })
  const rebuilt = await f.open()
  await f.recover(rebuilt)
  expect(
    await rebuilt.call('chatDatabaseArtifactHasCause', ref.id, { kind: 'workspace', targetId: firstWorkspace.id }),
  ).toBe(false)
  expect(await rebuilt.call('chatDatabaseArtifactHasCause', ref.id, { kind: 'session', targetId: second.id })).toBe(
    true,
  )
  const info = await lstat(join(f.layout.artifacts, ref.id))
  await rebuilt.call('chatDatabaseArtifactSeedLegacy', ref.id, Math.floor(info.birthtimeMs), Math.floor(info.mtimeMs))
  expect(
    await rebuilt.call('chatDatabaseArtifactEligibility', ref.id, Date.now(), { kind: 'session', targetId: second.id }),
  ).toMatchObject({ claimed: true })
})

test('known cache categories reclaim old bytes while preserving locks, registered packages, junctions and unknown roots', async () => {
  const f = await fixture()
  const old = await f.cache('markdown/old.html')
  const locked = await f.cache('tmp/active/data')
  await f.cache('tmp/active/.lock')
  const plugin = await f.cache('plugin-extract/loaded/lazy.js')
  f.protectedRoots.push(dirname(plugin))
  const unknown = await f.cache('custom/user-data')
  const outside = join(f.root, 'external')
  await mkdir(outside)
  await writeFile(join(outside, 'keep'), 'external')
  await symlink(outside, join(f.layout.cache.tmp, 'mounted'), 'junction')
  const fixed = await f.preview('cache')
  const done = await f.cleanup(fixed)
  expect(done).toMatchObject({ status: 'completed', deletedCount: 1, reclaimedBytes: 11 })
  expect(await errorOf(lstat(old))).toMatchObject({ code: 'ENOENT' })
  for (const path of [locked, plugin, unknown, join(outside, 'keep')]) expect((await lstat(path)).isFile()).toBe(true)
  expect(done.skipped).toContainEqual({ code: 'redirected', count: 1 })
  expect(
    await errorOf(
      f.maintenance.preview({ kind: 'cache', scope: { kind: 'workspace', targetId: 'project' } }, identity()),
    ),
  ).toMatchObject({ code: 'INVALID_SCOPE' })
})

test('cache checks current locks and idle protection again at the deletion boundary', async () => {
  const f = await fixture()
  const file = await f.cache('tmp/work/data')
  const fixed = await f.preview('cache')
  await f.cache('tmp/work/.in-use')
  expect((await f.cleanup(fixed)).deletedCount).toBe(0)
  await rm(join(dirname(file), '.in-use'))
  const next = await f.preview('cache')
  f.busy(true)
  expect((await f.cleanup(next)).skipped).toContainEqual({ code: 'inUse', count: 1 })
  expect((await lstat(file)).isFile()).toBe(true)
})

test('resource preview uses saved global retention and fails confirmation after its revision changes', async () => {
  const f = await fixture()
  await f.artifact()
  const fixed = await f.preview('attachments')
  const current = await f.settings.get({ kind: 'global' })
  await f.settings.apply({
    ...identity(),
    schemaVersion: 1,
    scope: { kind: 'global' },
    baselineRevisions: current.revisions,
    changes: [{ op: 'set', path: [{ kind: 'field', name: 'chatDatabase.attachmentRetentionDays' }], value: 30 }],
  })
  expect(await errorOf(f.maintenance.cleanup({ previewId: fixed.operationId }, identity()))).toMatchObject({
    code: 'POLICY_CHANGED',
  })
})

test('lost acknowledgement retains actual resource progress and reconciles the original candidate set', async () => {
  const f = await fixture()
  const first = await f.artifact('first orphan')
  await f.artifact('second orphan')
  const fixed = await f.preview('attachments')
  let lose = true
  f.beforeRemove(async (item) => {
    if (!lose) return
    lose = false
    const result = await f.storage.call('chatDatabaseResourceRemove', {
      operationId: currentId,
      scope: fixed.scope,
      item,
      cutoffAt: fixed.createdAt,
    })
    expect(result.deleted).toBe(true)
    throw new Error('lost resource acknowledgement')
  })
  let currentId = ''
  const accepted = await f.maintenance.cleanup({ previewId: fixed.operationId }, identity())
  currentId = accepted.operationId
  expect((await f.settled(currentId)).status).toBe('unknown')
  const outside = await f.artifact('new outside candidate')
  await f.maintenance.reconcile(currentId, identity())
  const done = await f.settled(currentId)
  expect(done).toMatchObject({
    status: 'completed',
    deletedCount: 2,
    reclaimedBytes: first.size + Buffer.byteLength('second orphan'),
  })
  expect((await lstat(join(f.layout.artifacts, outside.id))).isFile()).toBe(true)
})

test('cancellation stops at a resource boundary and reports the already reclaimed bytes', async () => {
  const f = await fixture()
  const refs = [await f.artifact('first candidate'), await f.artifact('second candidate')]
  const fixed = await f.preview('attachments')
  const first = (await f.items(fixed))[0]!
  let entered = () => {}
  let release = () => {}
  const started = new Promise<void>((resolve) => {
    entered = resolve
  })
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let calls = 0
  f.beforeRemove(async () => {
    if (calls++ === 0) {
      entered()
      await gate
    }
  })
  const accepted = await f.maintenance.cleanup({ previewId: fixed.operationId }, identity())
  await started
  expect((await f.maintenance.cancel(accepted.operationId, identity())).status).toBe('cancelRequested')
  release()
  expect(await f.settled(accepted.operationId)).toMatchObject({
    status: 'cancelled',
    processedCount: 1,
    deletedCount: 1,
    reclaimedBytes: first.estimatedBytes,
  })
  const survivors = await Promise.all(
    refs.map((ref) =>
      lstat(join(f.layout.artifacts, ref.id)).then(
        () => true,
        () => false,
      ),
    ),
  )
  expect(survivors.filter(Boolean)).toHaveLength(1)
})

test('a redirected parent after cache preview cannot delete files outside the managed root', async () => {
  const f = await fixture()
  const target = await f.cache('tmp/redirect/data')
  const fixed = await f.preview('cache')
  const outside = join(f.root, 'outside-redirect')
  await mkdir(outside)
  await writeFile(join(outside, 'data'), 'external data')
  await rm(dirname(target), { recursive: true })
  await symlink(outside, dirname(target), 'junction')
  const done = await f.cleanup(fixed)
  expect(done).toMatchObject({ status: 'unknown', deletedCount: 0, reclaimedBytes: 0, error: 'PATH_REDIRECTED' })
  expect(await readFile(join(outside, 'data'), 'utf8')).toBe('external data')
})

for (const stage of ['intent', 'moved', 'deleted'] satisfies ChatDatabaseResourceStage[]) {
  for (const rebuild of [false, true])
    test(`recovery after ${stage} preserves a canonical reclaim receipt${rebuild ? ' when SQLite is rebuilt' : ''}`, async () => {
      const f = await fixture()
      const ref = await f.artifact(`crash ${stage} ${rebuild}`)
      const fixed = await f.preview('attachments')
      const item = (await f.items(fixed)).find((item) => item.id === ref.id)!
      await f.closeServices()
      await f.storage.close()
      const db = new Database(f.layout.database, { strict: true })
      const artifacts = createChatDatabaseArtifactStorage(db, f.layout.sessions, f.layout.artifacts, f.layout.settings)
      while (!artifacts.backfill().done) {
        /* restore owner journal */
      }
      artifacts.markLegacySettingsComplete(true)
      const ledger = createChatDatabaseResourceLedger(
        db,
        f.layout.sessions,
        f.layout.artifacts,
        f.layout.cacheRoot,
        artifacts,
        (current) => {
          if (current === stage) throw new Error(`crash after ${stage}`)
        },
      )
      while (!ledger.restore().done) {
        /* bounded ledger records */
      }
      expect(() =>
        ledger.remove({ operationId: 'original-reclaim', scope: fixed.scope, item, cutoffAt: fixed.createdAt }),
      ).toThrow(`crash after ${stage}`)
      ledger.close()
      db.close()
      if (rebuild) for (const suffix of ['', '-wal', '-shm']) await rm(`${f.layout.database}${suffix}`, { force: true })
      const reopened = await f.open()
      await f.recover(reopened)
      expect(await reopened.call('chatDatabaseResourceReceipt', 'original-reclaim', 'attachments', ref.id)).toEqual({
        deleted: true,
        reason: null,
        reclaimedBytes: ref.size,
      })
      expect(await errorOf(reopened.call('artifact', ref.id))).toMatchObject({ code: 'NOT_FOUND' })
      expect(await errorOf(lstat(join(f.layout.artifacts, ref.id)))).toMatchObject({ code: 'ENOENT' })
    })
}

test('reclaimed metadata never resurrects; a later verified upload of the same hash survives full rebuild', async () => {
  const f = await fixture()
  const ref = await f.artifact('same content hash')
  const done = await f.cleanup(await f.preview('attachments'))
  expect(done.deletedCount).toBe(1)
  await f.closeServices()
  await f.storage.close()
  for (const suffix of ['', '-wal', '-shm']) await rm(`${f.layout.database}${suffix}`, { force: true })
  const rebuilt = await f.open()
  await f.recover(rebuilt)
  expect(await errorOf(rebuilt.call('artifact', ref.id))).toMatchObject({ code: 'NOT_FOUND' })
  const replacement = { ...ref, name: 'new upload.bin' }
  const reservation = {
    artifactId: ref.id,
    deviceId: 'device',
    ownerId: 'preSession:replacement',
    artifact: replacement,
  }
  await rebuilt.call('chatDatabaseArtifactReserve', reservation)
  await writeFile(join(f.layout.artifacts, ref.id), 'same content hash')
  await rebuilt.call('chatDatabaseArtifactFinishUpload', replacement, undefined, 'device')
  await rebuilt.call('chatDatabaseArtifactReleaseUpload', reservation)
  await rebuilt.close()
  for (const suffix of ['', '-wal', '-shm']) await rm(`${f.layout.database}${suffix}`, { force: true })
  const reuploaded = await f.open()
  await f.recover(reuploaded)
  expect(await reuploaded.call('artifact', ref.id)).toEqual(replacement)
  expect((await lstat(join(f.layout.artifacts, ref.id))).size).toBe(ref.size)
  expect(await reuploaded.call('chatDatabaseResourceReceipt', done.operationId, 'attachments', ref.id)).toEqual({
    deleted: true,
    reason: null,
    reclaimedBytes: ref.size,
  })
})
