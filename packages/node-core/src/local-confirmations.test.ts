import { describe, expect, test } from 'bun:test'
import { HbarError } from '@hbar/contracts'
import {
  nodeLocalConfirmationRunLookupSchema,
  nodeLocalConfirmationSchema,
  type NodeLocalConfirmationIdentity,
  type NodeLocalConfirmationPort,
} from '@hbar/contracts/node-confirmations'
import { NodeLocalConfirmationService } from './local-confirmations'

class MemoryConfirmations implements NodeLocalConfirmationPort {
  readonly entries = new Map<string, ReturnType<typeof nodeLocalConfirmationSchema.parse>>()

  async list(input: { readonly includeResolved: boolean }) {
    return [...this.entries.values()].filter((entry) =>
      input.includeResolved ? true : entry.state === 'waiting' || entry.state === 'approved',
    )
  }
  async get(input: { readonly id: string }) {
    return this.entries.get(input.id) ?? null
  }
  async latest(input: { readonly operationId: string }) {
    return [...this.entries.values()].filter((entry) => entry.identity.operationId === input.operationId).at(-1) ?? null
  }
  async create(input: { readonly entry: unknown }) {
    const entry = nodeLocalConfirmationSchema.parse(input.entry)
    this.entries.set(entry.id, entry)
    return entry
  }
  async resolve(input: {
    readonly id: string
    readonly state: 'approved' | 'rejected' | 'cancelled' | 'expired' | 'consumed'
    readonly now: number
    readonly deviceId: string | null
  }) {
    const entry = this.entries.get(input.id)
    if (!entry || (entry.state !== 'waiting' && entry.state !== 'approved')) return null
    const updated = nodeLocalConfirmationSchema.parse({
      ...entry,
      state: input.state,
      resolvedAt: input.now,
      resolvedByDeviceId: input.deviceId,
    })
    this.entries.set(updated.id, updated)
    return updated
  }
}

const identity = {
  operationId: 'run-a:call-a',
  source: 'run',
  sessionId: 'session-a',
  runId: 'run-a',
  callId: 'call-a',
  ownerDeviceId: null,
  rootId: 'workspace',
  rootPath: 'C:/workspace',
  floorRevision: 4,
  admissionDigest: 'a'.repeat(64),
  argumentsDigest: 'b'.repeat(64),
  tool: 'shell',
  summary: 'nodePath: src',
} satisfies NodeLocalConfirmationIdentity
const operator = { deviceId: 'operator-1', role: 'operator' as const }
const unchanged = async () => true

async function expectCode(action: () => Promise<unknown>, code: string) {
  try {
    await action()
    throw new Error(`Expected ${code}`)
  } catch (error) {
    if (!(error instanceof HbarError)) throw error
    expect(error.code).toBe(code)
  }
}

describe('B-local confirmation gate', () => {
  test('operator approval is one-shot and never starts the original operation', async () => {
    const store = new MemoryConfirmations()
    const service = new NodeLocalConfirmationService(
      store,
      () => 1_000,
      () => '1'.repeat(32),
    )
    await expectCode(() => service.require(identity, unchanged), 'NODE_LOCAL_CONFIRMATION_PENDING')
    expect((await service.list()).map((entry) => entry.state)).toEqual(['waiting'])
    await expectCode(
      () =>
        service.resolve(
          { deviceId: 'observer', role: 'observer' },
          { confirmationId: '1'.repeat(32), decision: 'approve' },
          unchanged,
        ),
      'NODE_CONSOLE_FORBIDDEN',
    )
    await service.resolve(operator, { confirmationId: '1'.repeat(32), decision: 'approve' }, unchanged)
    await service.require(identity, unchanged)
    expect(store.entries.get('1'.repeat(32))?.state).toBe('consumed')
    await expectCode(() => service.require(identity, unchanged), 'NODE_LOCAL_CONFIRMATION_PENDING')
    expect((await service.list()).map((entry) => entry.state)).toEqual(['waiting'])
  })

  test('operator rejection remains terminal for the exact operation', async () => {
    const store = new MemoryConfirmations()
    const service = new NodeLocalConfirmationService(
      store,
      () => 2_000,
      () => '2'.repeat(32),
    )
    await expectCode(() => service.require(identity, unchanged), 'NODE_LOCAL_CONFIRMATION_PENDING')
    await service.resolve(operator, { confirmationId: '2'.repeat(32), decision: 'reject' }, unchanged)
    await expectCode(() => service.require(identity, unchanged), 'NODE_LOCAL_CONFIRMATION_REJECTED')
  })

  test('manual requests preserve the authenticated A owner while only a B operator can approve', async () => {
    const store = new MemoryConfirmations()
    const service = new NodeLocalConfirmationService(
      store,
      () => 2_500,
      () => 'a'.repeat(32),
    )
    const manual = {
      ...identity,
      operationId: 'terminal:operation-1',
      source: 'manual' as const,
      runId: null,
      callId: null,
      ownerDeviceId: 'device-known-only-to-A',
      tool: 'manual-terminal',
    }
    await expectCode(() => service.require(manual, unchanged), 'NODE_LOCAL_CONFIRMATION_PENDING')
    expect(store.entries.get('a'.repeat(32))?.identity.ownerDeviceId).toBe('device-known-only-to-A')
    await service.resolve(operator, { confirmationId: 'a'.repeat(32), decision: 'approve' }, unchanged)
    await service.require(manual, unchanged)
    expect(store.entries.get('a'.repeat(32))?.state).toBe('consumed')
  })

  test('run confirmation lookup binds the managed checkout and accepted mount-manifest digest', async () => {
    const store = new MemoryConfirmations()
    const service = new NodeLocalConfirmationService(
      store,
      () => 2_700,
      () => 'd'.repeat(32),
    )
    const managedWorktree = { worktreeId: 'e'.repeat(32), targetRevision: 9 }
    const workspaceMounts = {
      schemaVersion: 1 as const,
      workspaceId: 'workspace-1',
      revision: 12,
      digest: 'c'.repeat(64),
      nodeId: 'node-b',
      primaryRootId: 'engine',
      roots: [{ rootId: 'engine', expectedRoot: 'C:/engine', alias: 'engine' }],
    }
    const runIdentity = {
      ...identity,
      rootId: 'managed-root',
      rootPath: 'C:/engine/.worktrees/review',
      managedWorktree,
      workspaceMountsDigest: workspaceMounts.digest,
    }
    await expectCode(() => service.require(runIdentity, unchanged), 'NODE_LOCAL_CONFIRMATION_PENDING')
    const authority = {
      sessionId: identity.sessionId,
      runId: identity.runId,
      callId: identity.callId,
      sandbox: null,
      admission: { kind: 'allow' as const },
      managedWorktree,
      workspaceMounts,
    }
    const lookup = nodeLocalConfirmationRunLookupSchema.parse({
      operationId: identity.operationId,
      rootId: runIdentity.rootId,
      expectedRoot: runIdentity.rootPath,
      authority,
      admissionDigest: identity.admissionDigest,
      argumentsDigest: identity.argumentsDigest,
    })
    expect(await service.lookup(lookup)).toEqual(runIdentity)
    await expectCode(
      () =>
        service.lookup({
          ...lookup,
          authority: { ...authority, managedWorktree: { ...managedWorktree, targetRevision: 10 } },
        }),
      'WORKSPACE_SCOPE',
    )
    await expectCode(
      () =>
        service.lookup({
          ...lookup,
          authority: { ...authority, workspaceMounts: { ...workspaceMounts, digest: 'f'.repeat(64) } },
        }),
      'WORKSPACE_SCOPE',
    )
  })

  test('root, floor or digest changes cancel the queued authority and require a fresh decision', async () => {
    const store = new MemoryConfirmations()
    const service = new NodeLocalConfirmationService(
      store,
      () => 3_000,
      () => '3'.repeat(32),
    )
    await expectCode(() => service.require(identity, unchanged), 'NODE_LOCAL_CONFIRMATION_PENDING')
    await expectCode(
      () => service.resolve(operator, { confirmationId: '3'.repeat(32), decision: 'approve' }, async () => false),
      'NODE_LOCAL_CONFIRMATION_STALE',
    )
    expect(store.entries.get('3'.repeat(32))?.state).toBe('cancelled')
    const changed = { ...identity, floorRevision: 5, argumentsDigest: 'c'.repeat(64) }
    await expectCode(() => service.require(changed, unchanged), 'NODE_LOCAL_CONFIRMATION_PENDING')
    expect(await service.status(changed, unchanged)).toBe('waiting')
  })

  test('expired and restart-lost decisions cannot execute', async () => {
    const store = new MemoryConfirmations()
    let time = 10_000
    const service = new NodeLocalConfirmationService(
      store,
      () => time,
      () => '4'.repeat(32),
    )
    await expectCode(() => service.require(identity, unchanged), 'NODE_LOCAL_CONFIRMATION_PENDING')
    const restarted = new NodeLocalConfirmationService(
      store,
      () => time,
      () => '5'.repeat(32),
    )
    expect(await restarted.status(identity, unchanged)).toBe('cancelled')
    expect(store.entries.get('4'.repeat(32))?.state).toBe('cancelled')
    await expectCode(() => restarted.require(identity, unchanged), 'NODE_LOCAL_CONFIRMATION_PENDING')
    time += 60_001
    expect(await restarted.status(identity, unchanged)).toBe('expired')
    expect((await restarted.list()).some((entry) => entry.state === 'waiting')).toBe(false)
  })

  test('expired queue entries release durable capacity without a list call and approved entries cannot be consumed after TTL', async () => {
    const store = new MemoryConfirmations()
    let time = 40_000
    let nextId = 1
    const service = new NodeLocalConfirmationService(
      store,
      () => time,
      () => (nextId++).toString(16).padStart(32, '0'),
    )
    const identities = Array.from({ length: 64 }, (_, index) => {
      const runId = `run-cap-${index}`
      const callId = `call-cap-${index}`
      return { ...identity, operationId: `${runId}:${callId}`, runId, callId }
    })
    for (const item of identities)
      await expectCode(() => service.require(item, unchanged), 'NODE_LOCAL_CONFIRMATION_PENDING')
    await service.resolve(operator, { confirmationId: '0'.repeat(31) + '1', decision: 'approve' }, unchanged)

    time += 60_001
    const replacement = {
      ...identity,
      operationId: 'run-after-expiry:call-after-expiry',
      runId: 'run-after-expiry',
      callId: 'call-after-expiry',
    }
    await expectCode(() => service.require(replacement, unchanged), 'NODE_LOCAL_CONFIRMATION_PENDING')

    expect(store.entries.get('0'.repeat(31) + '1')?.state).toBe('expired')
    expect(
      [...store.entries.values()].filter((entry) => entry.state === 'waiting' || entry.state === 'approved'),
    ).toHaveLength(1)
    const firstIdentity = identities[0]
    if (!firstIdentity) throw new Error('Missing capacity fixture identity')
    await expectCode(() => service.require(firstIdentity, unchanged), 'NODE_LOCAL_CONFIRMATION_PENDING')
    expect(store.entries.get('0'.repeat(31) + '1')?.state).toBe('expired')
  })

  test('revoking the approving B device cancels its unused decision', async () => {
    const store = new MemoryConfirmations()
    const service = new NodeLocalConfirmationService(
      store,
      () => 20_000,
      () => '6'.repeat(32),
    )
    await expectCode(() => service.require(identity, unchanged), 'NODE_LOCAL_CONFIRMATION_PENDING')
    await service.resolve(operator, { confirmationId: '6'.repeat(32), decision: 'approve' }, unchanged)
    await service.cancelDevice(operator.deviceId)
    expect(await service.status(identity, unchanged)).toBe('cancelled')
    await expectCode(() => service.require(identity, unchanged), 'NODE_LOCAL_CONFIRMATION_PENDING')
  })

  test('A can cancel only the exact pending operation identity', async () => {
    const store = new MemoryConfirmations()
    const service = new NodeLocalConfirmationService(
      store,
      () => 30_000,
      () => '7'.repeat(32),
    )
    await expectCode(() => service.require(identity, unchanged), 'NODE_LOCAL_CONFIRMATION_PENDING')
    await expectCode(() => service.cancel({ ...identity, argumentsDigest: 'd'.repeat(64) }), 'WORKSPACE_SCOPE')
    expect(await service.cancel(identity)).toBe('cancelled')
  })
})
