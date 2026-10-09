import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, mkdir, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import {
  HbarClient,
  createAttachmentCommandClient,
  createAttachmentSourceDescriptor,
  createChatDatabaseCommandClient,
} from '@hbar/client'
import { startServer } from '../apps/host/src/server'

const resources: {
  root: string
  kernel: Kernel
  host?: Awaited<ReturnType<typeof startServer>>
  clients: HbarClient[]
}[] = []
const errorOf = (value: Promise<unknown>) =>
  value.then(
    () => null,
    (reason: unknown) => reason,
  )
afterEach(async () => {
  for (const resource of resources.splice(0)) {
    for (const client of resource.clients) client.disconnect()
    await resource.host?.close()
    await resource.kernel.close()
    const target = resolve(resource.root)
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-artifact-upload-'))
      throw new Error('Refusing fixture cleanup outside its temporary root')
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
async function fixture(http = false) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-artifact-upload-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const resource: (typeof resources)[number] = { root, kernel, clients: [] }
  resources.push(resource)
  if (http) resource.host = await startServer(kernel, { port: 0 })
  const connect = async () => {
    if (!resource.host) throw new Error('Fixture HTTP Host is missing')
    const device = await resource.host.auth.createDevice('upload fixture')
    const address = `http://127.0.0.1:${resource.host.server.port}`
    const client = new HbarClient(address, device.token)
    resource.clients.push(client)
    await client.connect()
    return { client, device, address }
  }
  return {
    ...resource,
    connect,
    replaceKernel: (next: Kernel) => {
      resource.kernel = next
    },
  }
}

test('uploads atomically publish exact bytes, repair an old partial file and leave no temporary files', async () => {
  const f = await fixture()
  const bytes = new TextEncoder().encode('complete durable content')
  const id = createHash('sha256').update(bytes).digest('hex')
  await writeFile(join(f.kernel.options.layout.artifacts, id), bytes.subarray(0, 5))
  const [first, second] = await Promise.all([
    f.kernel.upload('first.txt', 'text/plain', bytes),
    f.kernel.upload('second.txt', 'text/plain', bytes),
  ])
  expect(first.id).toBe(id)
  expect(second.id).toBe(id)
  expect(new Uint8Array(await readFile(join(f.kernel.options.layout.artifacts, id)))).toEqual(bytes)
  expect((await readdir(f.kernel.options.layout.artifacts)).filter((name) => name.endsWith('.pending'))).toEqual([])
  expect(await f.kernel.storage.call('artifact', id)).toMatchObject({ id, size: bytes.length })
  expect(
    await errorOf(f.kernel.upload('forged.txt', 'text/plain', bytes, { actorId: 'fixture', sha256: '0'.repeat(64) })),
  ).toMatchObject({ code: 'CONTENT_MISMATCH' })
})

test('Client upload descriptors carry a device-bound owner and hash through HTTP, then transfer to a durable draft', async () => {
  const f = await fixture(true)
  const { client, device } = await f.connect()
  const commands = createChatDatabaseCommandClient(client)
  const file = new File(['owned bytes'], 'owned.txt', { type: 'text/plain' })
  const descriptor = await createAttachmentSourceDescriptor('selected-source', file)
  const owner = { id: 'window-owned-draft', kind: 'preSession' as const, clientRevision: 0 }
  const pending = await commands.execute(
    'chatDatabase.draft.sync',
    { owner: { ...owner, artifactIds: [], pendingArtifactIds: [descriptor.sha256] }, expectedRevision: 0 },
    { idempotencyKey: 'declare-upload' },
  )
  const uploads = createAttachmentCommandClient(client, { resolve: () => file })
  try {
    const uploaded = await uploads.execute('attachment.upload', { ...descriptor, owner })
    const stored = await commands.execute(
      'chatDatabase.draft.sync',
      { owner: { ...owner, artifactIds: [uploaded.id], pendingArtifactIds: [] }, expectedRevision: pending.revision },
      { idempotencyKey: 'confirm-upload' },
    )
    expect(stored.artifactIds).toEqual([descriptor.sha256])
    expect((await f.kernel.storage.call('chatDatabaseDraftList', device.device.id, null)).items).toEqual([stored])
    expect(await client.upload(file, undefined, { owner })).toEqual(uploaded)
    expect(new Uint8Array(await readFile(join(f.kernel.options.layout.artifacts, uploaded.id)))).toEqual(
      new TextEncoder().encode('owned bytes'),
    )
    const other = await f.connect()
    const otherCommands = createChatDatabaseCommandClient(other.client)
    expect((await otherCommands.execute('chatDatabase.draft.list', {})).items).toEqual([])
    await otherCommands.execute(
      'chatDatabase.draft.sync',
      { owner: { ...owner, artifactIds: [], pendingArtifactIds: [] }, expectedRevision: 0 },
      { idempotencyKey: 'other-window-empty' },
    )
    expect((await commands.execute('chatDatabase.draft.list', {})).items[0]?.artifactIds).toEqual([uploaded.id])
  } finally {
    await uploads.dispose()
  }
})

test('HTTP rejects a forged owner device, wrong content proof and uploads from a discarded draft generation', async () => {
  const f = await fixture(true)
  const { client, device, address } = await f.connect()
  const file = new File(['late bytes'], 'late.txt', { type: 'text/plain' })
  const commands = createChatDatabaseCommandClient(client)
  const owner = { id: 'discarded', kind: 'session' as const, clientRevision: 1 }
  await commands.execute(
    'chatDatabase.draft.sync',
    { owner: { ...owner, artifactIds: [], pendingArtifactIds: [] }, expectedRevision: 0 },
    { idempotencyKey: 'discard-before-upload' },
  )
  expect(await errorOf(client.upload(file, undefined, { owner: { ...owner, clientRevision: 0 } }))).toMatchObject({
    code: 'DRAFT_CHANGED',
  })
  expect(await errorOf(client.upload(file, undefined, { owner, sha256: 'f'.repeat(64) }))).toMatchObject({
    code: 'CONTENT_MISMATCH',
  })
  const forged = await fetch(`${address}/api/artifacts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${device.token}`,
      'Content-Type': 'text/plain',
      'X-Artifact-Owner': encodeURIComponent(JSON.stringify({ ...owner, deviceId: 'another-device' })),
    },
    body: file,
  })
  expect(forged.status).toBe(400)
  expect(await readdir(f.kernel.options.layout.artifacts)).toEqual([])
  const preflight = await fetch(`${address}/api/artifacts`, { method: 'OPTIONS' })
  expect(preflight.headers.get('access-control-allow-headers')).toContain('X-Artifact-Owner')
})

test('a claimed content hash rejects uploads before touching its file and allows the same content after the claim ends', async () => {
  const f = await fixture(true)
  const { client } = await f.connect()
  const owner = { id: 'reclaim-race', kind: 'session' as const, clientRevision: 0 }
  const file = new File(['race bytes'], 'race.txt', { type: 'text/plain' })
  const artifact = await client.upload(file, undefined, { owner })
  const commands = createChatDatabaseCommandClient(client)
  await commands.execute(
    'chatDatabase.draft.sync',
    { owner: { ...owner, clientRevision: 1, artifactIds: [], pendingArtifactIds: [] }, expectedRevision: 0 },
    { idempotencyKey: 'release-owner' },
  )
  while (!(await f.kernel.storage.call('chatDatabaseUsageBackfill', 250)).complete) {
    /* complete history projection */
  }
  let health = await f.kernel.storage.call('chatDatabaseReferenceHealth')
  for (let attempt = 0; attempt < 100 && (!health.drafts || !health.legacySettings); attempt++) {
    await new Promise<void>((done) => setTimeout(done, 5))
    health = await f.kernel.storage.call('chatDatabaseReferenceHealth')
  }
  expect(
    await f.kernel.storage.call('chatDatabaseArtifactClaim', artifact.id, 'cleanup', Date.now() + 1000),
  ).toMatchObject({ claimed: true })
  const before = await readFile(join(f.kernel.options.layout.artifacts, artifact.id))
  expect(await errorOf(client.upload(file, undefined, { owner: { ...owner, clientRevision: 1 } }))).toMatchObject({
    code: 'ARTIFACT_RESERVED',
  })
  expect(await readFile(join(f.kernel.options.layout.artifacts, artifact.id))).toEqual(before)
  await f.kernel.storage.call('chatDatabaseArtifactReleaseClaim', artifact.id, 'cleanup')
  expect((await client.upload(file, undefined, { owner: { ...owner, clientRevision: 1 } })).id).toBe(artifact.id)
})

test('a redirected attachment root rejects uploads and never writes through a Windows junction', async () => {
  const f = await fixture()
  const outside = join(f.root, 'outside')
  await mkdir(outside)
  await rm(f.kernel.options.layout.artifacts, { recursive: true })
  await symlink(outside, f.kernel.options.layout.artifacts, 'junction')
  expect(
    await errorOf(f.kernel.upload('redirected.txt', 'text/plain', new TextEncoder().encode('protected'))),
  ).toMatchObject({ code: 'PATH_REDIRECTED' })
  expect(await readdir(outside)).toEqual([])
})

test('a complete SQLite rebuild preserves both retained-message and offline-draft artifact metadata', async () => {
  const f = await fixture()
  const bytes = new TextEncoder().encode('rebuildable attachment')
  const artifact = await f.kernel.upload('offline.txt', 'text/plain', bytes, {
    actorId: 'rebuild-device',
    owner: { id: 'offline-draft', kind: 'session', clientRevision: 0 },
  })
  const workspace = (await f.kernel.storage.call('workspaces'))[0]!
  const session = await f.kernel.createSession(workspace.id, 'retained attachment')
  await f.kernel.storage.call('commit', session.id, 'fixture', 'user', [{ type: 'file', artifact }])
  const draftOnly = await f.kernel.upload('draft-only.txt', 'text/plain', new TextEncoder().encode('offline-only'), {
    actorId: 'rebuild-device',
    owner: { id: 'only-draft', kind: 'preSession', clientRevision: 0 },
  })
  await f.kernel.close()
  for (const suffix of ['', '-wal', '-shm']) await rm(`${f.kernel.options.layout.database}${suffix}`, { force: true })
  const current = await Kernel.create({
    home: join(f.root, 'data'),
    workspace: f.root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  f.replaceKernel(current)
  while (!(await current.storage.call('chatDatabaseDraftBackfill', 100)).done) {
    /* bounded recovery */
  }
  expect(await current.storage.call('artifact', artifact.id)).toEqual(artifact)
  expect(await current.storage.call('artifact', draftOnly.id)).toEqual(draftOnly)
})

test('a lost response after publication recovers metadata only when the complete file matches its reserved hash', async () => {
  const f = await fixture()
  const bytes = new TextEncoder().encode('published before metadata')
  const artifact = {
    id: createHash('sha256').update(bytes).digest('hex'),
    name: 'unknown.txt',
    mime: 'text/plain',
    size: bytes.length,
  }
  await f.kernel.storage.call('chatDatabaseArtifactReserve', {
    artifactId: artifact.id,
    artifact,
    deviceId: 'fixture',
    ownerId: 'preSession:unknown',
  })
  await writeFile(join(f.kernel.options.layout.artifacts, artifact.id), bytes.subarray(0, 5))
  expect(await errorOf(f.kernel.storage.call('artifact', artifact.id))).toMatchObject({ code: 'NOT_FOUND' })
  await writeFile(join(f.kernel.options.layout.artifacts, artifact.id), new Uint8Array(bytes.length))
  expect(await errorOf(f.kernel.storage.call('artifact', artifact.id))).toMatchObject({ code: 'NOT_FOUND' })
  await writeFile(join(f.kernel.options.layout.artifacts, artifact.id), bytes)
  expect(await f.kernel.storage.call('artifact', artifact.id)).toEqual(artifact)
  await f.kernel.close()
  const current = await Kernel.create({
    home: join(f.root, 'data'),
    workspace: f.root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  f.replaceKernel(current)
  while (!(await current.storage.call('chatDatabaseDraftBackfill', 100)).done) {
    /* bounded recovery */
  }
  expect(await current.storage.call('artifact', artifact.id)).toEqual(artifact)
})

test('the upload completion proof survives a failed metadata projection commit', async () => {
  const f = await fixture()
  const db = new Database(f.kernel.options.layout.database)
  const bytes = new TextEncoder().encode('metadata projection failure')
  const id = createHash('sha256').update(bytes).digest('hex')
  try {
    db.exec(
      "CREATE TRIGGER fail_artifact_projection BEFORE INSERT ON artifacts BEGIN SELECT RAISE(ABORT,'fixture metadata projection failure'); END",
    )
    expect(await errorOf(f.kernel.upload('recovered.txt', 'text/plain', bytes))).toBeInstanceOf(Error)
    db.exec('DROP TRIGGER fail_artifact_projection')
  } finally {
    db.close()
  }
  while (!(await f.kernel.storage.call('chatDatabaseDraftBackfill', 100)).done) {
    /* canonical completion replay */
  }
  expect(await f.kernel.storage.call('artifact', id)).toEqual({
    id,
    name: 'recovered.txt',
    mime: 'text/plain',
    size: bytes.length,
  })
})

test('repeating a hash preserves the original catalog metadata while each upload returns its selected filename', async () => {
  const f = await fixture()
  const bytes = new TextEncoder().encode('same content')
  const first = await f.kernel.upload('first.txt', 'text/plain', bytes)
  const second = await f.kernel.upload('second.bin', 'application/octet-stream', bytes)
  expect(second).toMatchObject({ id: first.id, name: 'second.bin', mime: 'application/octet-stream' })
  expect(await f.kernel.storage.call('artifact', first.id)).toEqual(first)
  await f.kernel.close()
  for (const suffix of ['', '-wal', '-shm']) await rm(`${f.kernel.options.layout.database}${suffix}`, { force: true })
  const current = await Kernel.create({
    home: join(f.root, 'data'),
    workspace: f.root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  f.replaceKernel(current)
  while (!(await current.storage.call('chatDatabaseDraftBackfill', 100)).done) {
    /* canonical metadata replay */
  }
  expect(await current.storage.call('artifact', first.id)).toEqual(first)
})

test('a publication without its final RPC remains recoverable after a full SQLite rebuild', async () => {
  const f = await fixture()
  const bytes = new TextEncoder().encode('unacknowledged publication')
  const artifact = {
    id: createHash('sha256').update(bytes).digest('hex'),
    name: 'unacknowledged.txt',
    mime: 'text/plain',
    size: bytes.length,
  }
  await f.kernel.storage.call('chatDatabaseArtifactReserve', {
    artifactId: artifact.id,
    artifact,
    deviceId: 'fixture',
    ownerId: 'preSession:unknown',
  })
  await writeFile(join(f.kernel.options.layout.artifacts, artifact.id), bytes)
  await f.kernel.close()
  for (const suffix of ['', '-wal', '-shm']) await rm(`${f.kernel.options.layout.database}${suffix}`, { force: true })
  const current = await Kernel.create({
    home: join(f.root, 'data'),
    workspace: f.root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  f.replaceKernel(current)
  while (!(await current.storage.call('chatDatabaseDraftBackfill', 100)).done) {
    /* recover candidate declarations */
  }
  expect(await current.storage.call('artifact', artifact.id)).toEqual(artifact)
})
