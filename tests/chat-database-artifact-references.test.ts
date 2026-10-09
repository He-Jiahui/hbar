import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { appendFile, mkdtemp, readFile, rm, symlink, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { collectArtifactReferenceIds, type ArtifactRef } from '@hbar/contracts'
import type { ChatDatabaseDraftOwnerInput } from '@hbar/contracts/commands/chat-database'
import { Storage, createPathLayout, ensurePathLayout } from '@hbar/storage'
import { createChatDatabaseArtifactReferenceService } from '@hbar/kernel'

const resources: {
  root: string
  workers: Storage[]
  services: ReturnType<typeof createChatDatabaseArtifactReferenceService>[]
}[] = []
const errorOf = (value: Promise<unknown>) =>
  value.then(
    () => null,
    (reason: unknown) => reason,
  )
const actor = 'offline-device'
const identity = (id: string, actorId = actor) => ({ actorId, idempotencyKey: id })
const owner = (
  id: string,
  artifactIds: string[] = [],
  kind: ChatDatabaseDraftOwnerInput['kind'] = 'session',
  clientRevision = 0,
  pendingArtifactIds: string[] = [],
): ChatDatabaseDraftOwnerInput => ({ id, kind, artifactIds, pendingArtifactIds, clientRevision })

afterEach(async () => {
  for (const resource of resources.splice(0)) {
    for (const service of resource.services) await service.close()
    for (const storage of resource.workers) await storage.close()
    const target = resolve(resource.root)
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-artifact-references-'))
      throw new Error('Refusing fixture cleanup outside its temporary root')
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-artifact-references-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'paths.json'))
  await ensurePathLayout(layout)
  const resource: (typeof resources)[number] = { root, workers: [], services: [] }
  resources.push(resource)
  const open = async () => {
    const storage = new Storage(layout.database, layout)
    resource.workers.push(storage)
    await storage.call('ready')
    return storage
  }
  const storage = await open()
  const recover = async (current = storage) => {
    for (let index = 0; index < 1000; index++) {
      if ((await current.call('chatDatabaseDraftBackfill', 100)).done) break
    }
    while (!(await current.call('chatDatabaseUsageBackfill', 250)).complete) {
      /* bounded history pages */
    }
    await current.call('chatDatabaseLegacySettingsComplete', true)
  }
  const artifact = async (letter = 'a'): Promise<ArtifactRef> => {
    const ref = { id: letter.repeat(64), name: `${letter}.bin`, mime: 'application/octet-stream', size: 3 }
    await writeFile(join(layout.artifacts, ref.id), Uint8Array.from([1, 2, 3]))
    await storage.call('putArtifact', ref)
    await storage.call('chatDatabaseArtifactSeedLegacy', ref.id, 0, 0)
    return ref
  }
  return { root, layout, resource, storage, open, recover, artifact }
}

test('schema-shaped reference collection handles theme backgrounds and refuses oversized or cyclic input', () => {
  const ref = { id: 'a'.repeat(64), name: 'file', mime: 'image/png', size: 1 }
  expect(
    collectArtifactReferenceIds({
      tools: [{ images: [ref, ref] }],
      values: { 'theme.backgroundAsset': 'b'.repeat(64) },
      unrelated: 'c'.repeat(64),
    }),
  ).toEqual({ ids: ['a'.repeat(64), 'b'.repeat(64)], complete: true })
  const cycle: Record<string, unknown> = {}
  cycle.self = cycle
  expect(collectArtifactReferenceIds(cycle).complete).toBe(false)
  expect(collectArtifactReferenceIds(Array.from({ length: 100_001 }, () => null)).complete).toBe(false)
})

test('session, new-chat, appearance and offline owner references require explicit release with revision checks', async () => {
  const f = await fixture()
  const ref = await f.artifact()
  await f.recover()
  const owners = []
  for (const kind of ['session', 'preSession', 'appearance'] as const)
    owners.push(
      await f.storage.call(
        'chatDatabaseDraftSync',
        { owner: owner(`window-${kind}`, [ref.id], kind), expectedRevision: 0 },
        identity(`declare-${kind}`),
      ),
    )
  expect(await f.storage.call('chatDatabaseArtifactClaim', ref.id, 'cleanup', Date.now() + 1)).toEqual({
    claimed: false,
    reason: 'referenced',
  })
  for (const current of owners) {
    const input = { owner: owner(current.id, [], current.kind, 1), expectedRevision: current.revision }
    const cleared = await f.storage.call('chatDatabaseDraftSync', input, identity(`release-${current.kind}`))
    expect(await f.storage.call('chatDatabaseDraftSync', input, identity(`release-${current.kind}`))).toEqual(cleared)
    expect(
      await errorOf(
        f.storage.call(
          'chatDatabaseDraftSync',
          { ...input, owner: owner(current.id, [ref.id], current.kind) },
          identity(`stale-${current.kind}`),
        ),
      ),
    ).toMatchObject({ code: 'COMMAND_CONFLICT' })
  }
  expect(await f.storage.call('chatDatabaseArtifactClaim', ref.id, 'cleanup', Date.now() + 1)).toEqual({
    claimed: true,
    reason: null,
  })
})

test('a draft removal transfers protection to committed messages and event logs', async () => {
  const f = await fixture()
  const ref = await f.artifact()
  const workspace = await f.storage.call('createWorkspace', f.root, 'workspace')
  const session = await f.storage.call('createSession', workspace.id, 'sent draft')
  const draft = await f.storage.call(
    'chatDatabaseDraftSync',
    { owner: owner('window-draft', [ref.id]), expectedRevision: 0 },
    identity('draft'),
  )
  await f.storage.call('commit', session.id, 'sent', 'user', [{ type: 'file', artifact: ref }])
  await f.storage.call(
    'chatDatabaseDraftSync',
    { owner: owner('window-draft', [], 'session', 1), expectedRevision: draft.revision },
    identity('sent-release'),
  )
  await f.recover()
  expect(await f.storage.call('chatDatabaseArtifactClaim', ref.id, 'cleanup', Date.now() + 1)).toMatchObject({
    claimed: false,
    reason: 'referenced',
  })
})

test('legacy inventory remains protected until a complete manifest is acknowledged; concurrent generations conflict', async () => {
  const f = await fixture()
  const ref = await f.artifact()
  await f.storage.call('putDevice', { id: actor, name: 'old device', createdAt: 0, lastSeenAt: 0 }, 'token-hash')
  await f.recover()
  expect(await f.storage.call('chatDatabaseArtifactClaim', ref.id, 'cleanup', Date.now())).toMatchObject({
    reason: 'legacyInventory',
  })
  const draft = await f.storage.call(
    'chatDatabaseDraftSync',
    { owner: owner('shared-window'), expectedRevision: 0 },
    identity('declare-empty'),
  )
  await f.storage.call(
    'chatDatabaseInventoryBegin',
    { inventoryId: 'old-generation', ownerIds: ['session:shared-window'] },
    identity('begin-old'),
  )
  await f.storage.call(
    'chatDatabaseInventoryBegin',
    { inventoryId: 'current-generation', ownerIds: ['session:shared-window'] },
    identity('begin-current'),
  )
  expect(
    await errorOf(
      f.storage.call(
        'chatDatabaseInventoryFinish',
        { inventoryId: 'old-generation', ownerRevisions: { 'session:shared-window': draft.revision } },
        identity('finish-old'),
      ),
    ),
  ).toMatchObject({ code: 'COMMAND_CONFLICT' })
  expect(
    await errorOf(
      f.storage.call(
        'chatDatabaseInventoryFinish',
        { inventoryId: 'current-generation', ownerRevisions: {} },
        identity('finish-incomplete'),
      ),
    ),
  ).toMatchObject({ code: 'COMMAND_CONFLICT' })
  const finished = await f.storage.call(
    'chatDatabaseInventoryFinish',
    { inventoryId: 'current-generation', ownerRevisions: { 'session:shared-window': draft.revision } },
    identity('finish-current'),
  )
  expect(finished).toMatchObject({ complete: true, revision: 3 })
  expect(await f.storage.call('chatDatabaseArtifactClaim', ref.id, 'cleanup', Date.now())).toMatchObject({
    claimed: true,
  })
})

test('a new window cannot erase another window declaration and owner paging stays bounded at 101', async () => {
  const f = await fixture()
  const ref = await f.artifact()
  await f.recover()
  await f.storage.call(
    'chatDatabaseDraftSync',
    { owner: owner('offline-window', [ref.id]), expectedRevision: 0 },
    identity('offline'),
  )
  for (let index = 0; index < 100; index++)
    await f.storage.call(
      'chatDatabaseDraftSync',
      { owner: owner(`new-window-${index.toString().padStart(3, '0')}`), expectedRevision: 0 },
      identity(`new-${index}`),
    )
  const first = await f.storage.call('chatDatabaseDraftList', actor, null, 100)
  const second = await f.storage.call('chatDatabaseDraftList', actor, first.next, 100)
  expect(first.items).toHaveLength(100)
  expect(second.items).toHaveLength(1)
  expect(second.next).toBeNull()
  expect(await errorOf(f.storage.call('chatDatabaseDraftList', actor, null, 101))).toMatchObject({
    code: 'INVALID_INPUT',
  })
  await f.storage.call(
    'chatDatabaseInventoryBegin',
    { inventoryId: 'new-window-inventory', ownerIds: [] },
    identity('empty-begin'),
  )
  await f.storage.call(
    'chatDatabaseInventoryFinish',
    { inventoryId: 'new-window-inventory', ownerRevisions: {} },
    identity('empty-finish'),
  )
  expect(await f.storage.call('chatDatabaseArtifactClaim', ref.id, 'cleanup', Date.now() + 1)).toMatchObject({
    reason: 'referenced',
  })
})

test('offline declarations and unknown legacy devices survive restart and a full SQLite rebuild', async () => {
  const f = await fixture()
  const ref = await f.artifact()
  await f.storage.call('putDevice', { id: actor, name: 'offline', createdAt: 0, lastSeenAt: 0 }, 'hash')
  let declared = await f.storage.call(
    'chatDatabaseDraftSync',
    { owner: owner('persistent', [ref.id]), expectedRevision: 0 },
    identity('durable-draft'),
  )
  await f.storage.close()
  for (const rebuild of [false, true]) {
    if (rebuild) for (const suffix of ['', '-wal', '-shm']) await rm(`${f.layout.database}${suffix}`, { force: true })
    const current = await f.open()
    await f.recover(current)
    await current.call('chatDatabaseArtifactSeedLegacy', ref.id, 0, 0)
    expect((await current.call('chatDatabaseDraftList', actor, null)).items).toEqual([declared])
    expect(await current.call('chatDatabaseInventoryRead', actor)).toMatchObject({ complete: false })
    expect(await current.call('chatDatabaseArtifactClaim', ref.id, 'cleanup', Date.now())).toMatchObject({
      reason: 'referenced',
    })
    const cleared = await current.call(
      'chatDatabaseDraftSync',
      { owner: owner('persistent', [], 'session', declared.clientRevision + 1), expectedRevision: declared.revision },
      identity(`clear-persistent-${rebuild}`),
    )
    expect(cleared.revision).toBe(declared.revision + 1)
    expect(await current.call('chatDatabaseArtifactClaim', ref.id, 'cleanup', Date.now())).toMatchObject({
      reason: 'legacyInventory',
    })
    // Restore the declaration before testing recovery from an empty SQLite projection.
    declared = await current.call(
      'chatDatabaseDraftSync',
      {
        owner: owner('persistent', [ref.id], 'session', cleared.clientRevision + 1),
        expectedRevision: cleared.revision,
      },
      identity(`restore-${rebuild}`),
    )
    await current.close()
  }
})

test('a pending upload stays protected after draft removal until its independent upload lease settles', async () => {
  const f = await fixture()
  const ref = await f.artifact()
  await f.recover()
  const reservation = {
    artifactId: ref.id,
    deviceId: actor,
    ownerId: 'preSession:pending',
    clientRevision: 0,
    leaseId: 'active-upload',
  }
  await f.storage.call('chatDatabaseArtifactReserve', reservation)
  await f.storage.call(
    'chatDatabaseDraftSync',
    { owner: owner('pending', [], 'preSession', 1), expectedRevision: 0 },
    identity('discard'),
  )
  expect(await f.storage.call('chatDatabaseArtifactClaim', ref.id, 'cleanup', Date.now() + 1000)).toMatchObject({
    reason: 'inUse',
  })
  expect(
    await errorOf(f.storage.call('chatDatabaseArtifactReserve', { ...reservation, leaseId: 'late-upload' })),
  ).toMatchObject({ code: 'DRAFT_CHANGED' })
  await f.storage.call('chatDatabaseArtifactFinishUpload', ref, reservation.leaseId)
  expect(await f.storage.call('chatDatabaseArtifactClaim', ref.id, 'cleanup', Date.now() + 1000)).toMatchObject({
    claimed: true,
  })
})

test('a claimed artifact rejects draft, Run and event references before canonical logs grow, and reupload restores it', async () => {
  const f = await fixture()
  const ref = await f.artifact()
  const workspace = await f.storage.call('createWorkspace', f.root, 'workspace')
  const session = await f.storage.call('createSession', workspace.id, 'claim race')
  await f.recover()
  const before = await f.storage.call('session', session.id)
  const logPage = await f.storage.call('chatDatabaseLogPage', { kind: 'session', targetId: session.id }, null)
  const logs = await Promise.all(logPage.paths.map((path) => readFile(join(f.layout.sessions, path))))
  expect(await f.storage.call('chatDatabaseArtifactClaim', ref.id, 'reclaim', Date.now())).toMatchObject({
    claimed: true,
  })
  expect(
    await errorOf(
      f.storage.call(
        'chatDatabaseDraftSync',
        { owner: owner('raced', [ref.id]), expectedRevision: 0 },
        identity('raced'),
      ),
    ),
  ).toMatchObject({ code: 'ARTIFACT_RESERVED' })
  expect(await errorOf(f.storage.call('append', session.id, 'tool.executed', { images: [ref] }))).toMatchObject({
    code: 'ARTIFACT_RESERVED',
  })
  expect(
    await errorOf(
      f.storage.call('enqueue', session.id, 'raced-run', { text: 'raced', images: [], files: [ref] }, 'fixture'),
    ),
  ).toMatchObject({ code: 'ARTIFACT_RESERVED' })
  expect((await f.storage.call('session', session.id)).seq).toBe(before.seq)
  expect(await Promise.all(logPage.paths.map((path) => readFile(join(f.layout.sessions, path))))).toEqual(logs)
  await rm(join(f.layout.artifacts, ref.id))
  const receipt = await f.storage.call('chatDatabaseArtifactFinishReclaim', ref.id, 'reclaim', 3)
  expect(await f.storage.call('chatDatabaseArtifactFinishReclaim', ref.id, 'reclaim', 999)).toEqual(receipt)
  expect(await errorOf(f.storage.call('append', session.id, 'tool.executed', { images: [ref] }))).toMatchObject({
    code: 'ARTIFACT_UNAVAILABLE',
  })
  await f.storage.call('chatDatabaseArtifactReserve', {
    artifactId: ref.id,
    deviceId: actor,
    ownerId: 'session:restored',
    leaseId: 'reupload',
  })
  await writeFile(join(f.layout.artifacts, ref.id), Uint8Array.from([1, 2, 3]))
  await f.storage.call('chatDatabaseArtifactFinishUpload', ref, 'reupload')
  await f.storage.call(
    'chatDatabaseDraftSync',
    { owner: owner('restored', [ref.id]), expectedRevision: 0 },
    identity('restored'),
  )
  expect(await f.storage.call('chatDatabaseArtifactClaim', ref.id, 'next', Date.now() + 1)).toMatchObject({
    reason: 'referenced',
  })
})

test('two Storage Workers share one hash claim and cannot register new references through another Worker', async () => {
  const f = await fixture()
  const ref = await f.artifact()
  const other = await f.open()
  await f.recover()
  await f.recover(other)
  const [first, second] = await Promise.all([
    f.storage.call('chatDatabaseArtifactClaim', ref.id, 'first', Date.now()),
    other.call('chatDatabaseArtifactClaim', ref.id, 'second', Date.now()),
  ])
  expect([first, second].filter((result) => result.claimed)).toHaveLength(1)
  expect([first, second].filter((result) => result.reason === 'inUse')).toHaveLength(1)
  expect(
    await errorOf(
      other.call(
        'chatDatabaseDraftSync',
        { owner: owner('other-worker', [ref.id]), expectedRevision: 0 },
        identity('other-worker'),
      ),
    ),
  ).toMatchObject({ code: 'ARTIFACT_RESERVED' })
})

test('legacy theme settings are indexed from files, live changes update references and redirected directories stay incomplete', async () => {
  const f = await fixture()
  const ref = await f.artifact()
  await mkdir(join(f.layout.settings, 'projects'), { recursive: true })
  await writeFile(
    join(f.layout.settings, 'projects', 'theme-project.json'),
    JSON.stringify({ version: 1, values: { 'theme.backgroundAsset': ref.id } }),
  )
  const service = createChatDatabaseArtifactReferenceService(f.storage, f.layout.settings)
  f.resource.services.push(service)
  await service.ready
  while (!(await f.storage.call('chatDatabaseUsageBackfill', 250)).complete) {
    /* finish projections */
  }
  expect(await f.storage.call('chatDatabaseReferenceHealth')).toEqual({
    drafts: true,
    legacySettings: true,
    events: true,
  })
  expect(await f.storage.call('chatDatabaseArtifactClaim', ref.id, 'cleanup', Date.now())).toMatchObject({
    reason: 'referenced',
  })
  await f.storage.call('setSettings', 'project', 'theme-project', {})
  expect(await f.storage.call('chatDatabaseArtifactClaim', ref.id, 'cleanup', Date.now())).toMatchObject({
    claimed: true,
  })
  const outside = join(f.root, 'outside')
  await mkdir(outside)
  await writeFile(join(outside, 'secret.json'), JSON.stringify({ backgroundAsset: ref.id }))
  await rm(join(f.layout.settings, 'projects'), { recursive: true })
  await symlink(outside, join(f.layout.settings, 'projects'), 'junction')
  await f.storage.call('chatDatabaseLegacySettingsComplete', false)
  await service.ensure()
  expect((await f.storage.call('chatDatabaseReferenceHealth')).legacySettings).toBe(false)
  expect(await readFile(join(outside, 'secret.json'), 'utf8')).toContain(ref.id)
})

test('a canonical declaration survives a database commit failure and malformed journals conservatively block reclamation', async () => {
  const f = await fixture()
  const ref = await f.artifact()
  await f.recover()
  const db = new Database(f.layout.database)
  try {
    db.exec(
      "CREATE TRIGGER fail_reference_receipt BEFORE INSERT ON entity_command_receipts WHEN NEW.commandId='chatDatabase.draft.sync' BEGIN SELECT RAISE(ABORT,'fixture failed receipt'); END",
    )
    expect(
      await errorOf(
        f.storage.call(
          'chatDatabaseDraftSync',
          { owner: owner('crash-draft', [ref.id]), expectedRevision: 0 },
          identity('crash-draft'),
        ),
      ),
    ).toBeInstanceOf(Error)
    expect((await f.storage.call('chatDatabaseReferenceHealth')).drafts).toBe(false)
    db.exec('DROP TRIGGER fail_reference_receipt')
  } finally {
    db.close()
  }
  await f.recover()
  expect((await f.storage.call('chatDatabaseDraftList', actor, null)).items[0]?.artifactIds).toEqual([ref.id])
  const path = join(
    f.layout.sessions,
    '.maintenance',
    'artifact-drafts',
    `${createHash('sha256').update(actor).digest('hex')}.jsonl`,
  )
  await appendFile(path, '{incomplete')
  await f.storage.close()
  const current = await f.open()
  let batch = await current.call('chatDatabaseDraftBackfill', 100)
  while (!batch.done) batch = await current.call('chatDatabaseDraftBackfill', 100)
  expect(batch).toMatchObject({ done: true, healthy: false })
  expect(batch.issues).toContain('DRAFT_JOURNAL_TRUNCATED')
  expect((await current.call('chatDatabaseReferenceHealth')).drafts).toBe(false)
  expect((await readFile(path, 'utf8')).endsWith('\n')).toBe(true)
})

test('upload journal revisions do not replay an old released pin over a reclaim claim after restart', async () => {
  const f = await fixture()
  const ref = await f.artifact()
  const reservation = { artifactId: ref.id, deviceId: actor, ownerId: 'preSession:unassigned' }
  await f.storage.call('chatDatabaseArtifactReserve', reservation)
  await f.storage.call('chatDatabaseArtifactReleaseUpload', reservation)
  await f.recover()
  expect(
    await f.storage.call('chatDatabaseArtifactClaim', ref.id, 'interrupted-reclaim', Date.now() + 1000),
  ).toMatchObject({ claimed: true })
  await f.storage.close()
  const current = await f.open()
  await f.recover(current)
  expect((await current.call('chatDatabaseReferenceHealth')).drafts).toBe(true)
  expect(
    await current.call('chatDatabaseArtifactClaim', ref.id, 'interrupted-reclaim', Date.now() + 1000),
  ).toMatchObject({ claimed: true })
})

test('a failed event commit blocks reclamation until canonical logs recover their references on restart', async () => {
  const f = await fixture()
  const ref = await f.artifact()
  const workspace = await f.storage.call('createWorkspace', f.root, 'workspace')
  const session = await f.storage.call('createSession', workspace.id, 'failed event transaction')
  await f.recover()
  const db = new Database(f.layout.database)
  try {
    db.exec(
      "CREATE TRIGGER fail_event_commit AFTER INSERT ON events WHEN NEW.type='tool.executed' BEGIN SELECT RAISE(ABORT,'fixture failed event commit'); END",
    )
    expect(await errorOf(f.storage.call('append', session.id, 'tool.executed', { images: [ref] }))).toBeInstanceOf(
      Error,
    )
    expect((await f.storage.call('chatDatabaseReferenceHealth')).events).toBe(false)
    expect(await f.storage.call('chatDatabaseArtifactClaim', ref.id, 'cleanup', Date.now())).toMatchObject({
      reason: 'legacyArtifact',
    })
    db.exec('DROP TRIGGER fail_event_commit')
  } finally {
    db.close()
  }
  await f.storage.close()
  const current = await f.open()
  await f.recover(current)
  expect((await current.call('chatDatabaseReferenceHealth')).events).toBe(true)
  expect(await current.call('chatDatabaseArtifactClaim', ref.id, 'cleanup', Date.now())).toMatchObject({
    reason: 'referenced',
  })
})

test('a completed legacy inventory keeps its generation and acknowledgment after SQLite is rebuilt', async () => {
  const f = await fixture()
  const ref = await f.artifact()
  await f.storage.call('putDevice', { id: actor, name: 'upgraded', createdAt: 0, lastSeenAt: 0 }, 'hash')
  await f.storage.call(
    'chatDatabaseInventoryBegin',
    { inventoryId: 'complete-generation', ownerIds: [] },
    identity('complete-begin'),
  )
  const inventory = await f.storage.call(
    'chatDatabaseInventoryFinish',
    { inventoryId: 'complete-generation', ownerRevisions: {} },
    identity('complete-finish'),
  )
  await f.storage.close()
  for (const suffix of ['', '-wal', '-shm']) await rm(`${f.layout.database}${suffix}`, { force: true })
  const current = await f.open()
  await f.recover(current)
  await current.call('chatDatabaseArtifactSeedLegacy', ref.id, 0, 0)
  expect(await current.call('chatDatabaseInventoryRead', actor)).toEqual(inventory)
  expect(await current.call('chatDatabaseArtifactClaim', ref.id, 'cleanup', Date.now())).toMatchObject({
    claimed: true,
  })
})

test('canonical creation proof distinguishes fresh devices from legacy unknown devices across SQLite rebuild', async () => {
  const f = await fixture()
  await f.storage.call('putDevice', { id: 'new-device', name: 'fresh', createdAt: 1, lastSeenAt: 1 }, 'new-hash')
  const db = new Database(f.layout.database, { strict: true })
  db.query('INSERT INTO devices VALUES(?,?,?,?,?)').run('legacy-device', 'old', 'legacy-hash', 0, 0)
  db.close()
  await f.storage.close()
  const current = await f.open()
  const service = createChatDatabaseArtifactReferenceService(current, f.layout.settings)
  try {
    expect(await service.inventory('legacy-device')).toMatchObject({ complete: false, legacyRequired: true })
    expect(await service.inventory('new-device')).toMatchObject({ complete: false, legacyRequired: false })
  } finally {
    await service.close()
  }
  await current.close()
  for (const suffix of ['', '-wal', '-shm']) await rm(`${f.layout.database}${suffix}`, { force: true })
  const rebuilt = await f.open()
  await f.recover(rebuilt)
  expect(await rebuilt.call('chatDatabaseInventoryRead', 'new-device')).toMatchObject({ legacyRequired: false })
  expect(await rebuilt.call('chatDatabaseInventoryRead', 'legacy-device')).toMatchObject({ legacyRequired: true })
})

test('legacy attachment metadata is captured in bounded batches and survives SQLite rebuild without a message', async () => {
  const f = await fixture()
  const artifacts = Array.from({ length: 26 }, (_, index) => ({
    id: index.toString(16).padStart(64, '0'),
    name: `legacy-${index}.txt`,
    mime: 'text/plain',
    size: 3,
  }))
  for (const artifact of artifacts) await f.storage.call('putArtifact', artifact)
  let first = await f.storage.call('chatDatabaseDraftBackfill', 100)
  expect(first.done).toBe(false)
  first = await f.storage.call('chatDatabaseDraftBackfill', 100)
  expect(first.done).toBe(false)
  expect((await f.storage.call('chatDatabaseReferenceHealth')).drafts).toBe(false)
  await f.recover()
  expect((await f.storage.call('chatDatabaseReferenceHealth')).drafts).toBe(true)
  await f.storage.close()
  for (const suffix of ['', '-wal', '-shm']) await rm(`${f.layout.database}${suffix}`, { force: true })
  const current = await f.open()
  await f.recover(current)
  expect(await current.call('artifact', artifacts[0]!.id)).toEqual(artifacts[0]!)
  expect(await current.call('artifact', artifacts[25]!.id)).toEqual(artifacts[25]!)
})
