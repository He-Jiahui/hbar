import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import type { SandboxProfileSaveInput } from '@hbar/contracts/sandbox'
import { HbarClient, createSandboxCommandClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { createSandboxProfileStorage, SANDBOX_PROFILES_SQL } from '../packages/storage/src/sandbox-profiles'
import { startServer } from '../apps/host/src/server'

function body(id: string, overrides: Partial<SandboxProfileSaveInput> = {}): SandboxProfileSaveInput {
  return {
    id,
    expectedRevision: null,
    name: id,
    description: '',
    extends: null,
    escalation: null,
    filesystem: { default: null, grants: [] },
    commands: { rules: [] },
    network: { enabled: null },
    tools: { rules: [] },
    ...overrides,
  }
}

function code(action: () => unknown): string {
  try {
    action()
  } catch (error) {
    if (error instanceof HbarError) return error.code
    throw error
  }
  throw new Error('Expected failure')
}

function memory() {
  const db = new Database(':memory:')
  db.exec(SANDBOX_PROFILES_SQL)
  return { db, storage: createSandboxProfileStorage(db) }
}

describe('sandbox profile storage', () => {
  test('creates, updates by revision and refuses duplicates or stale writes', () => {
    const { db, storage } = memory()
    const created = storage.save(
      body('strict', { filesystem: { default: 'none', grants: [{ path: 'src', access: 'write' }] } }),
    )
    expect(created).toMatchObject({ id: 'strict', builtin: false, revision: 1, filesystem: { default: 'none' } })
    expect(code(() => storage.save(body('strict')))).toBe('COMMAND_CONFLICT')
    const updated = storage.save(body('strict', { expectedRevision: 1, name: 'Strict' }))
    expect(updated).toMatchObject({ revision: 2, name: 'Strict', createdAt: created.createdAt })
    expect(code(() => storage.save(body('strict', { expectedRevision: 1 })))).toBe('COMMAND_CONFLICT')
    expect(code(() => storage.save(body('missing', { expectedRevision: 3 })))).toBe('COMMAND_CONFLICT')
    expect(storage.list().map((profile) => profile.id)).toEqual(['strict'])
    db.close()
  })

  test('validates parents and cycles inside the write transaction', () => {
    const { db, storage } = memory()
    expect(code(() => storage.save(body('child', { extends: 'missing' })))).toBe('SANDBOX_PROFILE_NOT_FOUND')
    storage.save(body('a', { extends: ':workspace-write' }))
    storage.save(body('b', { extends: 'a' }))
    expect(code(() => storage.save(body('a', { expectedRevision: 1, extends: 'b' })))).toBe('SANDBOX_PROFILE_CYCLE')
    for (const [id, parent] of [
      ['c', 'b'],
      ['d', 'c'],
      ['e', 'd'],
    ] as const)
      storage.save(body(id, { extends: parent }))
    expect(code(() => storage.save(body('f', { extends: 'e' })))).toBe('SANDBOX_PROFILE_TOO_DEEP')
    db.close()
  })

  test('deletes by revision and refuses to orphan child profiles', () => {
    const { db, storage } = memory()
    storage.save(body('base'))
    storage.save(body('child', { extends: 'base' }))
    expect(code(() => storage.delete({ id: 'base', expectedRevision: 1 }))).toBe('SANDBOX_PROFILE_IN_USE')
    expect(code(() => storage.delete({ id: 'child', expectedRevision: 2 }))).toBe('COMMAND_CONFLICT')
    expect(storage.delete({ id: 'child', expectedRevision: 1 })).toEqual({ deleted: true })
    expect(storage.delete({ id: 'base', expectedRevision: 1 })).toEqual({ deleted: true })
    expect(storage.delete({ id: 'base', expectedRevision: 1 })).toEqual({ deleted: false })
    db.close()
  })

  test('caps the number of stored profiles', () => {
    const { db, storage } = memory()
    for (let index = 0; index < 64; index++) storage.save(body(`p${index}`))
    expect(code(() => storage.save(body('overflow')))).toBe('LIMIT_EXCEEDED')
    storage.save(body('p0', { expectedRevision: 1, name: 'still editable' }))
    db.close()
  })

  test('replays receipts for the same key and rejects reuse with different input', () => {
    const { db, storage } = memory()
    const identity = { actorId: 'device-1', idempotencyKey: 'save-1' }
    const first = storage.save(body('keyed'), identity)
    expect(storage.save(body('keyed'), identity)).toEqual(first)
    expect(storage.receipt('sandbox.save', body('keyed'), identity)).toEqual(first)
    expect(code(() => storage.save(body('keyed', { name: 'other' }), identity))).toBe('IDEMPOTENCY_CONFLICT')
    db.close()
  })

  test('snapshots are content addressed and immutable', () => {
    const { db, storage } = memory()
    const data = JSON.stringify({
      version: 1,
      profileId: ':read-only',
      chain: [{ id: ':read-only', revision: 0 }],
      escalation: 'ask',
      filesystem: { default: 'read', grants: [] },
      commands: { rules: [] },
      network: { enabled: false },
      tools: { rules: [] },
    })
    const digest = createHash('sha256').update(data).digest('hex')
    expect(storage.snapshot(digest)).toBeNull()
    storage.putSnapshot({ digest, profileId: ':read-only', data })
    storage.putSnapshot({ digest, profileId: ':read-only', data })
    expect(storage.snapshot(digest)).toMatchObject({ profileId: ':read-only', escalation: 'ask' })
    expect(code(() => storage.putSnapshot({ digest: '0'.repeat(64), profileId: ':read-only', data }))).toBe(
      'INVALID_INPUT',
    )
    expect(code(() => storage.putSnapshot({ digest, profileId: 'other', data }))).toBe('INVALID_INPUT')
    db.close()
  })
})

const resources: { root: string; kernel: Kernel; client: HbarClient; host: Awaited<ReturnType<typeof startServer>> }[] =
  []
afterEach(async () => {
  for (const item of resources.splice(0)) {
    item.client.disconnect()
    await item.host.close()
    await item.kernel.close()
    await rm(item.root, { recursive: true, force: true })
  }
})

async function host() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-sandbox-profiles-'))
  const kernel = await Kernel.create({
    home: join(root, 'home'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const server = await startServer(kernel, { port: 0 })
  const baseUrl = `http://127.0.0.1:${server.server.port}`
  const response = await fetch(`${baseUrl}/auth/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: server.pairing.code, name: 'sandbox-profile-test' }),
  })
  const { token } = z.object({ token: z.string().min(1) }).parse(await response.json())
  const client = new HbarClient(baseUrl, token)
  await client.connect()
  resources.push({ root, kernel, client, host: server })
  return { kernel, commands: createSandboxCommandClient(client) }
}

describe('sandbox profile host commands', () => {
  test('lists built-ins first and resolves their chains', async () => {
    const { commands } = await host()
    expect((await commands.execute('sandbox.list', {})).items.map((item) => [item.id, item.builtin])).toEqual([
      [':read-only', true],
      [':workspace-write', true],
    ])
    const detail = await commands.execute('sandbox.get', { id: ':workspace-write' })
    expect(detail?.resolved?.chain.map((link) => link.id)).toEqual([':workspace-write', ':read-only'])
    expect(await commands.execute('sandbox.get', { id: 'missing' })).toBeNull()
  })

  test('saves, updates, replays and deletes user profiles with change hints', async () => {
    const { kernel, commands } = await host()
    const hints: string[] = []
    const unsubscribe = kernel.subscribe((event) => {
      if (event.method === 'host.changed') hints.push(event.params.kind)
    })
    const input = body('zircon-strict', {
      extends: ':read-only',
      escalation: 'deny',
      filesystem: { default: null, grants: [{ path: 'zircon_app/src', access: 'write' }] },
      commands: { rules: [{ pattern: 'cargo test *', decision: 'allow' }] },
    })
    const created = await commands.execute('sandbox.save', input, { idempotencyKey: 'zircon-1' })
    expect(created.revision).toBe(1)
    expect(await commands.execute('sandbox.save', input, { idempotencyKey: 'zircon-1' })).toEqual(created)
    expect(
      await commands.execute('sandbox.receipt', { commandId: 'sandbox.save', input, idempotencyKey: 'zircon-1' }),
    ).toEqual(created)
    const detail = await commands.execute('sandbox.get', { id: 'zircon-strict' })
    expect(detail?.resolved).toMatchObject({
      chain: [
        { id: 'zircon-strict', revision: 1 },
        { id: ':read-only', revision: 0 },
      ],
      escalation: 'deny',
      filesystem: { default: 'read', grants: [{ path: 'zircon_app/src', access: 'write' }] },
    })
    const updated = await commands.execute(
      'sandbox.save',
      { ...input, expectedRevision: 1, network: { enabled: true } },
      { idempotencyKey: 'zircon-2' },
    )
    expect(updated.revision).toBe(2)
    await expect(
      commands.execute('sandbox.save', { ...input, expectedRevision: 1 }, { idempotencyKey: 'zircon-stale' }),
    ).rejects.toMatchObject({ code: 'COMMAND_CONFLICT' })
    expect(
      await commands.execute(
        'sandbox.delete',
        { id: 'zircon-strict', expectedRevision: 2 },
        { idempotencyKey: 'del-1' },
      ),
    ).toEqual({ deleted: true })
    expect((await commands.execute('sandbox.list', {})).items).toHaveLength(2)
    unsubscribe()
    expect(hints.filter((kind) => kind === 'sandbox-profiles')).toHaveLength(3)
  })

  test('rejects chains that can never resolve, counting built-in ancestors', async () => {
    const { commands } = await host()
    let parent = ':workspace-write'
    for (const id of ['l1', 'l2', 'l3']) {
      await commands.execute('sandbox.save', body(id, { extends: parent }), { idempotencyKey: `chain-${id}` })
      parent = id
    }
    await expect(
      commands.execute('sandbox.save', body('l4', { extends: 'l3' }), { idempotencyKey: 'chain-l4' }),
    ).rejects.toMatchObject({ code: 'SANDBOX_PROFILE_TOO_DEEP' })
    await expect(
      commands.execute('sandbox.save', body('self', { extends: 'self' }), { idempotencyKey: 'self' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(
      commands.execute('sandbox.save', body('orphan', { extends: 'nope' }), { idempotencyKey: 'orphan' }),
    ).rejects.toMatchObject({ code: 'SANDBOX_PROFILE_NOT_FOUND' })
  })
})
