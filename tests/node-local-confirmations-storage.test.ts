import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarError } from '@hbar/contracts'
import { NodeLocalConfirmationService } from '@hbar/node-core/local-confirmations'
import { NodeStateStorage } from '../packages/storage/src/node-state'
import { NodeLocalConfirmationStorage } from '../packages/storage/src/node-local-confirmations'

const directories: string[] = []
const identity = {
  operationId: 'run-persist:call-persist',
  source: 'run',
  sessionId: 'session-persist',
  runId: 'run-persist',
  callId: 'call-persist',
  ownerDeviceId: null,
  rootId: 'engine',
  rootPath: 'C:/engine',
  floorRevision: 7,
  admissionDigest: 'a'.repeat(64),
  argumentsDigest: 'b'.repeat(64),
  tool: 'write_file',
  summary: 'src/main.ts',
}

afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})

async function expectPending(action: () => Promise<unknown>) {
  try {
    await action()
    throw new Error('Expected a pending local confirmation')
  } catch (error) {
    if (!(error instanceof HbarError)) throw error
    expect(error.code).toBe('NODE_LOCAL_CONFIRMATION_PENDING')
  }
}

describe('SQLite B-local confirmations', () => {
  test('pending and approved decisions are cancelled after the storage worker restarts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hbar-node-local-confirm-'))
    directories.push(directory)
    const path = join(directory, 'node.sqlite')
    const firstState = new NodeStateStorage(path)
    expect(await firstState.call('ready', {})).toEqual({ version: 4 })
    const firstStore = new NodeLocalConfirmationStorage(firstState)
    const first = new NodeLocalConfirmationService(
      firstStore,
      () => 1_000,
      () => '1'.repeat(32),
    )
    await expectPending(() => first.require(identity, async () => true))
    await first.resolve(
      { deviceId: 'operator-1', role: 'operator' },
      { confirmationId: '1'.repeat(32), decision: 'approve' },
      async () => true,
    )
    await firstState.close()

    const reopenedState = new NodeStateStorage(path)
    expect(await reopenedState.call('ready', {})).toEqual({ version: 4 })
    const reopened = new NodeLocalConfirmationService(new NodeLocalConfirmationStorage(reopenedState), () => 2_000)
    expect(await reopened.status(identity, async () => true)).toBe('cancelled')
    await expectPending(() => reopened.require(identity, async () => true))
    const entries = await reopened.list(true)
    expect(entries.map((entry) => entry.state)).toEqual(['waiting', 'cancelled'])
    await reopenedState.close()
  })

  test('confirmation state persists through NodeStateStorage migration and is bounded at 64 pending items', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hbar-node-local-confirm-cap-'))
    directories.push(directory)
    const state = new NodeStateStorage(join(directory, 'node.sqlite'))
    expect(await state.call('ready', {})).toEqual({ version: 4 })
    const gate = new NodeLocalConfirmationService(
      new NodeLocalConfirmationStorage(state),
      () => 5_000,
      (() => {
        let id = 0
        return () => (++id).toString(16).padStart(32, '0')
      })(),
    )
    for (let index = 0; index < 64; index++) {
      const callId = `call-${index}`
      await expectPending(() =>
        gate.require({ ...identity, callId, operationId: `${identity.runId}:${callId}` }, async () => true),
      )
    }
    try {
      await gate.require(
        { ...identity, callId: 'call-overflow', operationId: `${identity.runId}:call-overflow` },
        async () => true,
      )
      throw new Error('Expected the bounded queue to reject overflow')
    } catch (error) {
      if (!(error instanceof HbarError)) throw error
      expect(error.code).toBe('NODE_BUSY')
    }
    expect((await gate.list()).length).toBe(64)
    await state.close()
  })

  test('expired queue rows free SQLite capacity without list and an approved row cannot be consumed after TTL', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hbar-node-local-confirm-expiry-'))
    directories.push(directory)
    const state = new NodeStateStorage(join(directory, 'node.sqlite'))
    let now = 10_000
    let nextId = 0
    const gate = new NodeLocalConfirmationService(
      new NodeLocalConfirmationStorage(state),
      () => now,
      () => (++nextId).toString(16).padStart(32, '0'),
    )
    const identities = Array.from({ length: 64 }, (_, index) => {
      const callId = `call-expiry-${index}`
      return { ...identity, callId, operationId: `${identity.runId}:${callId}` }
    })
    for (const item of identities) await expectPending(() => gate.require(item, async () => true))
    const approved = identities[0]
    if (!approved) throw new Error('Missing first confirmation fixture')
    await gate.resolve(
      { deviceId: 'operator-expiry', role: 'operator' },
      { confirmationId: '0'.repeat(31) + '1', decision: 'approve' },
      async () => true,
    )

    now += 60_001
    const nextCallId = 'call-after-ttl'
    await expectPending(() =>
      gate.require(
        { ...identity, callId: nextCallId, operationId: `${identity.runId}:${nextCallId}` },
        async () => true,
      ),
    )
    expect(await state.call('local-confirmation.list', { includeResolved: false })).toHaveLength(1)
    expect(await state.call('local-confirmation.latest', { operationId: approved.operationId })).toMatchObject({
      state: 'expired',
    })

    await expectPending(() => gate.require(approved, async () => true))
    expect(await state.call('local-confirmation.latest', { operationId: approved.operationId })).toMatchObject({
      state: 'waiting',
    })
    await state.close()
  })
})
