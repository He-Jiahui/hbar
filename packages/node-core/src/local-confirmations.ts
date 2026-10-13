import { randomBytes } from 'node:crypto'
import { HbarError } from '@hbar/contracts'
import {
  nodeLocalConfirmationSchema,
  nodeLocalConfirmationIdSchema,
  nodeLocalConfirmationIdentitySchema,
  nodeLocalConfirmationRunLookupSchema,
  type NodeLocalConfirmationPort,
} from '@hbar/contracts/node-confirmations'

const CAPACITY = 64
const TTL_MS = 60_000

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** B-owned one-shot consent. It never starts an operation; the original caller must retry it. */
export class NodeLocalConfirmationService {
  private lock: Promise<void> = Promise.resolve()
  private initialized: Promise<void> | undefined

  constructor(
    private readonly store: NodeLocalConfirmationPort,
    private readonly now: () => number = Date.now,
    private readonly id: () => string = () => randomBytes(16).toString('hex'),
  ) {}

  private async serial<T>(action: () => Promise<T>): Promise<T> {
    const previous = this.lock
    let unlock: (() => void) | undefined
    this.lock = new Promise<void>((resolve) => (unlock = resolve))
    await previous
    try {
      return await action()
    } finally {
      unlock?.()
    }
  }

  private ready(): Promise<void> {
    return (this.initialized ??= this.serial(async () => {
      const now = this.now()
      const entries = await this.store.list({ includeResolved: false })
      for (const raw of entries) {
        const entry = nodeLocalConfirmationSchema.parse(raw)
        if (entry.state === 'waiting' || entry.state === 'approved')
          await this.store.resolve({ id: entry.id, state: 'cancelled', now, deviceId: null })
      }
    }))
  }

  async list(includeResolved = false) {
    await this.ready()
    return await this.serial(async () => {
      const now = this.now()
      const entries = (await this.store.list({ includeResolved })).map((item) =>
        nodeLocalConfirmationSchema.parse(item),
      )
      for (const entry of entries) {
        if ((entry.state === 'waiting' || entry.state === 'approved') && entry.expiresAt <= now)
          await this.store.resolve({ id: entry.id, state: 'expired', now, deviceId: null })
      }
      return (await this.store.list({ includeResolved })).map((item) => nodeLocalConfirmationSchema.parse(item))
    })
  }

  /** First call queues consent; after operator approval the exact original call must retry. */
  async require(identityValue: unknown, recheck: (identity: unknown) => Promise<boolean>): Promise<void> {
    await this.ready()
    const identity = nodeLocalConfirmationIdentitySchema.parse(identityValue)
    const consumed = await this.serial(async () => {
      const now = this.now()
      const rawPrior = await this.store.latest({ operationId: identity.operationId })
      const prior = rawPrior ? nodeLocalConfirmationSchema.parse(rawPrior) : undefined
      const entries = (await this.store.list({ includeResolved: false })).map((item) =>
        nodeLocalConfirmationSchema.parse(item),
      )
      for (const entry of entries) {
        if ((entry.state === 'waiting' || entry.state === 'approved') && entry.expiresAt <= now)
          await this.store.resolve({ id: entry.id, state: 'expired', now, deviceId: null })
      }
      if (prior && same(prior.identity, identity)) {
        if (prior.state === 'approved' && prior.expiresAt > now) {
          if (!(await recheck(identity))) {
            await this.store.resolve({ id: prior.id, state: 'cancelled', now, deviceId: null })
            throw new HbarError(
              'NODE_LOCAL_CONFIRMATION_STALE',
              'Local confirmation no longer matches current authority',
            )
          }
          await this.store.resolve({ id: prior.id, state: 'consumed', now, deviceId: null })
          return true
        }
        if (prior.state === 'waiting' && prior.expiresAt > now)
          throw new HbarError('NODE_LOCAL_CONFIRMATION_PENDING', 'Waiting for a B-local operator decision')
        if (prior.state === 'rejected')
          throw new HbarError('NODE_LOCAL_CONFIRMATION_REJECTED', 'A B-local operator rejected this operation')
      } else if (prior && (prior.state === 'waiting' || prior.state === 'approved')) {
        await this.store.resolve({ id: prior.id, state: 'cancelled', now, deviceId: null })
      }

      const active = entries.filter(
        (entry) => (entry.state === 'waiting' || entry.state === 'approved') && entry.expiresAt > now,
      )
      if (active.length >= CAPACITY) throw new HbarError('NODE_BUSY', 'Local confirmation queue is full')
      const id = nodeLocalConfirmationIdSchema.parse(this.id())
      const entry = nodeLocalConfirmationSchema.parse({
        id,
        identity,
        state: 'waiting',
        createdAt: now,
        expiresAt: now + TTL_MS,
        resolvedAt: null,
        resolvedByDeviceId: null,
      })
      await this.store.create({ entry })
      return false
    })
    if (!consumed) throw new HbarError('NODE_LOCAL_CONFIRMATION_PENDING', 'Waiting for a B-local operator decision')
  }

  async resolve(
    device: { readonly deviceId: string; readonly role: 'operator' | 'observer' },
    input: { readonly confirmationId: string; readonly decision: 'approve' | 'reject' },
    recheck: (identity: unknown) => Promise<boolean>,
  ) {
    await this.ready()
    if (device.role !== 'operator') throw new HbarError('NODE_CONSOLE_FORBIDDEN', 'Only a B-local operator may decide')
    return await this.serial(async () => {
      const id = nodeLocalConfirmationIdSchema.parse(input.confirmationId)
      const raw = await this.store.get({ id })
      if (!raw) throw new HbarError('NODE_LOCAL_CONFIRMATION_CLOSED', 'Confirmation does not exist')
      const entry = nodeLocalConfirmationSchema.parse(raw)
      const now = this.now()
      if (entry.state !== 'waiting')
        throw new HbarError('NODE_LOCAL_CONFIRMATION_CLOSED', 'Confirmation is no longer waiting')
      if (entry.expiresAt <= now) {
        await this.store.resolve({ id, state: 'expired', now, deviceId: null })
        throw new HbarError('NODE_LOCAL_CONFIRMATION_EXPIRED', 'Local confirmation expired')
      }
      if (input.decision === 'approve' && !(await recheck(entry.identity))) {
        await this.store.resolve({ id, state: 'cancelled', now, deviceId: null })
        throw new HbarError('NODE_LOCAL_CONFIRMATION_STALE', 'Root, floor or operation authority changed')
      }
      const updated = await this.store.resolve({
        id,
        state: input.decision === 'approve' ? 'approved' : 'rejected',
        now,
        deviceId: device.deviceId,
      })
      if (!updated) throw new HbarError('NODE_LOCAL_CONFIRMATION_CLOSED', 'Confirmation was resolved concurrently')
      return nodeLocalConfirmationSchema.parse(updated)
    })
  }

  async cancelDevice(deviceId: string): Promise<void> {
    await this.ready()
    await this.serial(async () => {
      const now = this.now()
      for (const raw of await this.store.list({ includeResolved: false })) {
        const entry = nodeLocalConfirmationSchema.parse(raw)
        if (entry.resolvedByDeviceId === deviceId && entry.state === 'approved')
          await this.store.resolve({ id: entry.id, state: 'cancelled', now, deviceId: null })
      }
    })
  }

  async cancelOperation(operationId: string): Promise<void> {
    await this.ready()
    await this.serial(async () => {
      const raw = await this.store.latest({ operationId })
      if (!raw) return
      const entry = nodeLocalConfirmationSchema.parse(raw)
      if (entry.state === 'waiting' || entry.state === 'approved')
        await this.store.resolve({ id: entry.id, state: 'cancelled', now: this.now(), deviceId: null })
    })
  }

  async lookup(inputValue: unknown) {
    await this.ready()
    const input = nodeLocalConfirmationRunLookupSchema.parse(inputValue)
    const raw = await this.store.latest({ operationId: input.operationId })
    if (!raw) return null
    const entry = nodeLocalConfirmationSchema.parse(raw)
    const authority = input.authority
    if (
      entry.identity.source !== 'run' ||
      entry.identity.operationId !== input.operationId ||
      entry.identity.sessionId !== authority.sessionId ||
      entry.identity.runId !== authority.runId ||
      entry.identity.callId !== authority.callId ||
      entry.identity.rootId !== input.rootId ||
      entry.identity.rootPath !== input.expectedRoot ||
      entry.identity.admissionDigest !== input.admissionDigest ||
      entry.identity.argumentsDigest !== input.argumentsDigest ||
      !same(entry.identity.managedWorktree ?? null, authority.managedWorktree ?? null) ||
      entry.identity.workspaceMountsDigest !== authority.workspaceMounts?.digest
    )
      throw new HbarError('WORKSPACE_SCOPE', 'Confirmation query does not match the original admitted operation')
    return entry.identity
  }

  async cancelRun(inputValue: unknown): Promise<'cancelled' | 'absent' | 'closed'> {
    const identity = await this.lookup(inputValue)
    return identity ? await this.cancel(identity) : 'absent'
  }

  async cancelPending(): Promise<readonly string[]> {
    await this.ready()
    return await this.serial(async () => {
      const operationIds: string[] = []
      const now = this.now()
      for (const raw of await this.store.list({ includeResolved: false })) {
        const entry = nodeLocalConfirmationSchema.parse(raw)
        if (entry.state !== 'waiting' && entry.state !== 'approved') continue
        await this.store.resolve({ id: entry.id, state: 'cancelled', now, deviceId: null })
        operationIds.push(entry.identity.operationId)
      }
      return operationIds
    })
  }

  async status(
    identityValue: unknown,
    recheck: (identity: unknown) => Promise<boolean>,
  ): Promise<'waiting' | 'approved' | 'rejected' | 'cancelled' | 'expired' | 'consumed' | 'absent'> {
    await this.ready()
    const identity = nodeLocalConfirmationIdentitySchema.parse(identityValue)
    return await this.serial(async () => {
      const now = this.now()
      const rawEntry = await this.store.latest({ operationId: identity.operationId })
      const entry = rawEntry ? nodeLocalConfirmationSchema.parse(rawEntry) : undefined
      if (!entry) return 'absent'
      if (!same(entry.identity, identity)) {
        if (entry.state === 'waiting' || entry.state === 'approved')
          await this.store.resolve({ id: entry.id, state: 'cancelled', now, deviceId: null })
        return 'cancelled'
      }
      if ((entry.state === 'waiting' || entry.state === 'approved') && !(await recheck(identity))) {
        await this.store.resolve({ id: entry.id, state: 'cancelled', now, deviceId: null })
        return 'cancelled'
      }
      if ((entry.state === 'waiting' || entry.state === 'approved') && entry.expiresAt <= now) {
        await this.store.resolve({ id: entry.id, state: 'expired', now, deviceId: null })
        return 'expired'
      }
      return entry.state
    })
  }

  async cancel(identityValue: unknown): Promise<'cancelled' | 'absent' | 'closed'> {
    await this.ready()
    const identity = nodeLocalConfirmationIdentitySchema.parse(identityValue)
    return await this.serial(async () => {
      const now = this.now()
      const rawEntry = await this.store.latest({ operationId: identity.operationId })
      const entry = rawEntry ? nodeLocalConfirmationSchema.parse(rawEntry) : undefined
      if (!entry) return 'absent'
      if (!same(entry.identity, identity))
        throw new HbarError('WORKSPACE_SCOPE', 'Confirmation identity does not match')
      if (entry.state !== 'waiting' && entry.state !== 'approved') return 'closed'
      await this.store.resolve({ id: entry.id, state: 'cancelled', now, deviceId: null })
      return 'cancelled'
    })
  }
}
