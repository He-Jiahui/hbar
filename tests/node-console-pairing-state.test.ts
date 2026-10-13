import { expect, test } from 'bun:test'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { HbarError } from '@hbar/contracts'
import { NodeStateStorage } from '@hbar/storage/node-state'

function codeDigest(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}
function publicKey(): string {
  return randomBytes(32).toString('base64url')
}
async function rejectsCode(action: Promise<unknown>, code: string): Promise<void> {
  try {
    await action
  } catch (error) {
    expect(error).toBeInstanceOf(HbarError)
    expect(error).toMatchObject({ code })
    return
  }
  throw new Error(`Expected ${code}`)
}

test('B console pairing persists independent devices, one-use five-minute invites, scopes and revocation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hbar-node-console-pairing-'))
  const path = join(directory, 'node.sqlite')
  let state: NodeStateStorage | undefined
  try {
    state = new NodeStateStorage(path)
    expect(await state.call('ready', {})).toEqual({ version: 4 })
    const at = 1_800_000_000_000
    const invite = await state.call('console.pairing.create', {
      inviteId: 'invite-one',
      codeDigest: codeDigest('00112233'),
      role: 'observer',
      roots: ['engine'],
      createdAt: at,
    })
    expect(invite).toMatchObject({ expiresAt: at + 5 * 60_000, consumedAt: null, deviceId: null })
    await state.call('console.pairing.create', {
      inviteId: 'invite-retained-recently',
      codeDigest: codeDigest('11002233'),
      role: 'observer',
      roots: ['engine'],
      createdAt: at + 1,
    })
    const firstKey = publicKey()
    const device = await state.call('console.pairing.consume', {
      codeDigest: codeDigest('00112233'),
      deviceId: 'device-one',
      publicKey: firstKey,
      name: 'Build display',
      now: at + 2,
    })
    expect(device).toMatchObject({
      deviceId: 'device-one',
      publicKey: firstKey,
      role: 'observer',
      roots: ['engine'],
      revokedAt: null,
    })
    await rejectsCode(
      state.call('console.pairing.consume', {
        codeDigest: codeDigest('00112233'),
        deviceId: 'device-two',
        publicKey: publicKey(),
        name: 'Second device',
        now: at + 2,
      }),
      'PAIRING_CODE_INVALID',
    )
    await rejectsCode(
      state.call('console.pairing.consume', {
        codeDigest: codeDigest('00112233'),
        deviceId: 'device-reused-key',
        publicKey: firstKey,
        name: 'Reused key',
        now: at + 2,
      }),
      'PAIRING_CODE_INVALID',
    )
    await state.close()
    state = new NodeStateStorage(path)
    await state.call('ready', {})
    expect(await state.call('console.devices.list', {})).toMatchObject([{ deviceId: 'device-one', role: 'observer' }])
    expect(await state.call('console.device.touch', { deviceId: 'device-one', lastSeenAt: at + 10 })).toMatchObject({
      lastSeenAt: at + 10,
    })
    const revoked = await state.call('console.device.revoke', { deviceId: 'device-one', revokedAt: at + 11 })
    expect(revoked?.revokedAt).toBe(at + 11)
    expect(await state.call('console.device.touch', { deviceId: 'device-one', lastSeenAt: at + 12 })).toBeNull()
    expect(await state.call('console.device.get', { deviceId: 'device-one' })).toMatchObject({ revokedAt: at + 11 })
    await state.call('console.pairing.create', {
      inviteId: 'invite-two',
      codeDigest: codeDigest('22334455'),
      role: 'operator',
      roots: [],
      createdAt: at + 12,
    })
    await rejectsCode(
      state.call('console.pairing.consume', {
        codeDigest: codeDigest('22334455'),
        deviceId: 'device-one',
        publicKey: publicKey(),
        name: 'Attempted identity replacement',
        now: at + 13,
      }),
      'DEVICE_ALREADY_PAIRED',
    )
    await rejectsCode(
      state.call('console.pairing.consume', {
        codeDigest: codeDigest('22334455'),
        deviceId: 'new-device-id',
        publicKey: firstKey,
        name: 'Attempted revoked key reuse',
        now: at + 14,
      }),
      'DEVICE_ALREADY_PAIRED',
    )
    const replacement = await state.call('console.pairing.consume', {
      codeDigest: codeDigest('22334455'),
      deviceId: 'new-device-id',
      publicKey: publicKey(),
      name: 'Independent device',
      now: at + 15,
    })
    expect(replacement).toMatchObject({ deviceId: 'new-device-id', role: 'operator', revokedAt: null })
    expect(await state.call('console.device.get', { deviceId: 'device-one' })).toMatchObject({
      publicKey: firstKey,
      revokedAt: at + 11,
    })
  } finally {
    await state?.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('expired invites cannot be consumed and B console pairing attempts stay rate limited across restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hbar-node-console-rate-'))
  const path = join(directory, 'node.sqlite')
  let state: NodeStateStorage | undefined
  try {
    state = new NodeStateStorage(path)
    const now = 1_800_000_100_000
    await state.call('console.pairing.create', {
      inviteId: 'expired-invite',
      codeDigest: codeDigest('88990011'),
      role: 'operator',
      roots: [],
      createdAt: now,
    })
    await rejectsCode(
      state.call('console.pairing.consume', {
        codeDigest: codeDigest('88990011'),
        deviceId: 'late-device',
        publicKey: publicKey(),
        name: 'Late device',
        now: now + 5 * 60_000,
      }),
      'PAIRING_CODE_INVALID',
    )
    for (let index = 0; index < 5; index++)
      expect(await state.call('console.pairing.attempt', { sourceKey: 'source-digest', now })).toEqual({
        allowed: true,
      })
    await state.close()
    state = new NodeStateStorage(path)
    await state.call('ready', {})
    expect(await state.call('console.pairing.attempt', { sourceKey: 'source-digest', now: now + 1 })).toEqual({
      allowed: false,
    })
    expect(await state.call('console.pairing.attempt', { sourceKey: 'source-digest', now: now + 15 * 60_000 })).toEqual(
      { allowed: true },
    )
  } finally {
    await state?.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('pairing invitation retention is capped and prunes only stale invitations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hbar-node-console-invite-cap-'))
  let state: NodeStateStorage | undefined
  try {
    state = new NodeStateStorage(join(directory, 'node.sqlite'))
    const start = 1_800_000_150_000
    for (let index = 0; index < 256; index++) {
      const createdAt = start + Math.floor(index / 8) * 15 * 60_000
      await state.call('console.pairing.create', {
        inviteId: `retained-${index}`,
        codeDigest: createHash('sha256').update(`retained-${index}`).digest('hex'),
        role: 'observer',
        roots: [],
        createdAt,
      })
    }
    await rejectsCode(
      state.call('console.pairing.create', {
        inviteId: 'over-cap',
        codeDigest: codeDigest('99001122'),
        role: 'operator',
        roots: [],
        createdAt: start + 32 * 15 * 60_000,
      }),
      'NODE_BUSY',
    )
    const afterRetention = start + 24 * 60 * 60_000 + 5 * 60_000 + 1
    expect(
      await state.call('console.pairing.create', {
        inviteId: 'after-retention',
        codeDigest: codeDigest('99001122'),
        role: 'operator',
        roots: [],
        createdAt: afterRetention,
      }),
    ).toMatchObject({ inviteId: 'after-retention' })
  } finally {
    await state?.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('pairing attempt source table refuses new sources at capacity while preserving known-source limits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hbar-node-console-source-cap-'))
  let state: NodeStateStorage | undefined
  try {
    state = new NodeStateStorage(join(directory, 'node.sqlite'))
    const now = 1_800_000_180_000
    for (let index = 0; index < 4_096; index++) {
      expect(await state.call('console.pairing.attempt', { sourceKey: `source-${index}`, now })).toEqual({
        allowed: true,
      })
    }
    expect(await state.call('console.pairing.attempt', { sourceKey: 'overflow-source', now })).toEqual({
      allowed: false,
    })
    expect(await state.call('console.pairing.attempt', { sourceKey: 'source-0', now: now + 15 * 60_000 })).toEqual({
      allowed: true,
    })
    expect(
      await state.call('console.pairing.attempt', {
        sourceKey: 'after-retention-source',
        now: now + 24 * 60 * 60_000 + 1,
      }),
    ).toEqual({ allowed: true })
  } finally {
    await state?.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('parallel consumers can register exactly one device for an invitation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hbar-node-console-race-'))
  let state: NodeStateStorage | undefined
  try {
    state = new NodeStateStorage(join(directory, 'node.sqlite'))
    const now = 1_800_000_200_000,
      digest = codeDigest('44556677')
    await state.call('console.pairing.create', {
      inviteId: 'race-invite',
      codeDigest: digest,
      role: 'observer',
      roots: ['engine'],
      createdAt: now,
    })
    const consumers = ['race-one', 'race-two'].map((deviceId) =>
      state?.call('console.pairing.consume', {
        codeDigest: digest,
        deviceId,
        publicKey: publicKey(),
        name: deviceId,
        now: now + 1,
      }),
    )
    const consumed = await Promise.allSettled(consumers)
    expect(consumed.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(consumed.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(await state.call('console.devices.list', {})).toHaveLength(1)
  } finally {
    await state?.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('node state migration adds B console tables without replacing v2 operation receipts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hbar-node-console-migration-'))
  const path = join(directory, 'node.sqlite')
  let state: NodeStateStorage | undefined
  try {
    const db = new Database(path, { create: true })
    db.exec(`
      CREATE TABLE config(key TEXT PRIMARY KEY,value TEXT NOT NULL CHECK(json_valid(value))) STRICT;
      CREATE TABLE operations(
        operationId TEXT PRIMARY KEY, argumentsDigest TEXT NOT NULL, kind TEXT NOT NULL,
        authority TEXT NOT NULL CHECK(json_valid(authority)), receipt TEXT NOT NULL CHECK(json_valid(receipt)),
        versions TEXT CHECK(versions IS NULL OR json_valid(versions)), updatedAt INTEGER NOT NULL,
        target TEXT CHECK(target IS NULL OR json_valid(target))
      ) STRICT;
      CREATE INDEX operations_updated ON operations(updatedAt);
      CREATE TABLE audit(seq INTEGER PRIMARY KEY AUTOINCREMENT,data TEXT NOT NULL CHECK(json_valid(data))) STRICT;
      INSERT INTO config(key,value) VALUES('floor','{"roots":[],"process":true,"network":false,"terminal":false,"osConfinement":"required","backend":"auto","protectedPaths":[],"environmentAllowlist":["LANG","LC_ALL","TERM","HOME","TMPDIR"],"maxConcurrentProcesses":4,"maxTimeoutMs":600000,"onLinkLost":{"action":"terminate","graceMs":30000},"localConfirm":"none"}');
      INSERT INTO operations(operationId,argumentsDigest,kind,authority,receipt,versions,updatedAt,target)
      VALUES(
        'run:already-settled','${'a'.repeat(64)}','exec',
        '{"sessionId":"session","runId":"run","callId":"call","sandbox":null,"admission":{"kind":"allow"}}',
        '{"state":"settled","acceptedAt":1800000000000,"startedAt":1800000000001,"settledAt":1800000000002,"result":{"text":"legacy result","isError":false,"details":{"code":0,"exitCode":0,"truncated":false,"executionStarted":true,"backend":"none"}}}',
        NULL,1800000000002,NULL
      );
      PRAGMA user_version=2;
    `)
    db.close()
    state = new NodeStateStorage(path)
    expect(await state.call('ready', {})).toEqual({ version: 4 })
    expect(await state.call('console.devices.list', {})).toEqual([])
    expect(await state.call('floor.get', {})).toMatchObject({ roots: [], osConfinement: 'required' })
    expect(await state.call('operation.get', { operationId: 'run:already-settled' })).toMatchObject({
      receipt: { state: 'settled', result: { text: 'legacy result' } },
      target: null,
    })
  } finally {
    await state?.close()
    await rm(directory, { recursive: true, force: true })
  }
})
