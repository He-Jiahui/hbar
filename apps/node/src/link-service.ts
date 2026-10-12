import { HbarError } from '@hbar/contracts'
import { nodeFingerprintSchema } from '@hbar/contracts/node'
import {
  nodeSavedLinkSchema,
  nodeLinkStatusSchema,
  type NodeSavedLink,
  type NodeLinkStatus,
} from '@hbar/contracts/node-link-state'
import type { NodeStatePort } from '@hbar/contracts/node-state'
import { nodeFingerprint, WorkspaceNodeProtocol, type NodeIdentity, type WorkspaceNodeService } from '@hbar/node-core'
import { WorkspaceNodeClient, nodeWebSocketURL } from '@hbar/node-link'

export interface NodeInitialJoin {
  readonly url: string
  readonly code: string
  readonly fingerprint: string
}
/** Owns B's single outbound link, pinned state and bounded backoff. Commands are never replayed on reconnect. */
export class WorkspaceNodeLink {
  private readonly protocol: WorkspaceNodeProtocol
  private readonly client: WorkspaceNodeClient
  private readonly unlisten: () => void
  private saved: NodeSavedLink | null = null
  private initial: NodeInitialJoin | null = null
  private epoch = 0
  private closed = false
  private attempts = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private work: Promise<void> | null = null
  private writes: Promise<void> = Promise.resolve()
  private status: NodeLinkStatus = { phase: 'unlinked', reasonCode: null, nextAttemptAt: null }
  constructor(
    private readonly state: NodeStatePort,
    identity: NodeIdentity,
    private readonly node: WorkspaceNodeService,
    private readonly retryDelayMs = 12_000,
  ) {
    this.protocol = new WorkspaceNodeProtocol(node)
    this.client = new WorkspaceNodeClient({
      identity,
      handle: (method, input, signal) => this.protocol.invoke(method, input, signal),
      onJoined: async (joined, signal) => {
        const epoch = this.epoch
        const target = this.initial ?? this.saved
        if (!target || this.closed) throw new HbarError('CANCELLED', 'Node link authority expired')
        const saved = nodeSavedLinkSchema.parse({
          url: target.url,
          fingerprint: target.fingerprint,
          ...joined,
        })
        await this.write(async () => {
          signal.throwIfAborted()
          if (epoch !== this.epoch || this.closed)
            throw new HbarError('CANCELLED', 'Node link authority changed locally')
          await this.state.call('config.set', { key: 'link', value: saved })
          signal.throwIfAborted()
          if (epoch !== this.epoch || this.closed) return
          this.saved = saved
          this.initial = null
        })
      },
      onDisconnected: (error) => {
        this.protocol.resetTransfers()
        this.node.linkLost()
        if (this.closed || (!this.initial && !this.saved)) return
        this.fail(error)
        if (!this.work) this.schedule()
      },
    })
    this.unlisten = node.onPolicyChanged(() => {
      if (this.status.phase !== 'online') return
      try {
        this.client.notify('node.floorChanged', { revision: Date.now() })
        this.client.notify('node.rootsChanged', { revision: Date.now() })
      } catch {
        /* Reconnection reads the current capabilities. */
      }
    })
  }
  get connection(): NodeLinkStatus {
    return nodeLinkStatusSchema.parse(this.status)
  }
  get linked(): boolean {
    return this.saved !== null
  }
  private write(action: () => Promise<void>): Promise<void> {
    const task = this.writes.then(action)
    this.writes = task.catch(() => {})
    return task
  }
  async start(initial?: NodeInitialJoin): Promise<void> {
    if (this.closed || this.work || this.saved || this.initial)
      throw new HbarError('NODE_CONNECTION_ACTIVE', 'Node link lifecycle has already started')
    const value = await this.state.call('config.get', { key: 'link' })
    if (value !== null) {
      this.saved = nodeSavedLinkSchema.parse(value)
      this.saved.url = nodeWebSocketURL(this.saved.url)
      if (nodeFingerprint(this.saved.publicKey) !== this.saved.fingerprint)
        throw new HbarError('NODE_HOST_KEY_CHANGED', 'Saved conversation identity does not match its fingerprint')
    }
    if (initial) {
      this.initial = {
        url: nodeWebSocketURL(initial.url),
        code: /^\d{8}$/.test(initial.code) ? initial.code : invalidCode(),
        fingerprint: nodeFingerprintSchema.parse(initial.fingerprint),
      }
      if (this.saved && (this.saved.url !== this.initial.url || this.saved.fingerprint !== this.initial.fingerprint))
        throw new HbarError('NODE_LINK_PINNED', 'Unlink locally before selecting another conversation identity')
    }
    if (this.initial || this.saved) this.launch()
  }
  private launch(): void {
    if (this.closed || this.work || this.status.phase === 'blocked' || (!this.saved && !this.initial)) return
    const epoch = this.epoch
    this.work = this.dial(epoch).finally(() => {
      this.work = null
      if (epoch === this.epoch && this.status.phase !== 'online') this.schedule()
    })
    void this.work.catch(() => {})
  }
  private async dial(epoch: number): Promise<void> {
    const target = this.initial ?? this.saved
    if (!target) return
    this.status = { phase: 'connecting', reasonCode: null, nextAttemptAt: null }
    try {
      await this.client.connect({
        url: target.url,
        fingerprint: target.fingerprint,
        ...(this.saved ? { pinnedPublicKey: this.saved.publicKey } : {}),
        ...(this.initial ? { code: this.initial.code } : {}),
      })
      if (this.closed || epoch !== this.epoch || !this.client.isOnline) return
      this.attempts = 0
      this.status = { phase: 'online', reasonCode: null, nextAttemptAt: null }
      this.node.linkRestored()
    } catch (error) {
      if (this.closed || epoch !== this.epoch) return
      this.fail(error instanceof HbarError ? error : new HbarError('NODE_OFFLINE', 'Node dial failed'))
    }
  }
  private fail(error: HbarError): void {
    // Retry transport failures only. Invalid invitations, revoked keys and schema/version failures need local action.
    const transient = ['NODE_OFFLINE', 'NODE_AUTH_EXPIRED', 'NODE_BUSY', 'RATE_LIMIT'].includes(error.code)
    this.status = { phase: transient ? 'retrying' : 'blocked', reasonCode: error.code, nextAttemptAt: null }
    if (!transient) this.initial = null
  }
  private schedule(): void {
    if (this.closed || this.timer || this.status.phase === 'blocked' || (!this.saved && !this.initial)) return
    const delay = Math.min(60_000, this.retryDelayMs * 2 ** Math.min(this.attempts++, 3))
    this.status = { ...this.status, phase: 'retrying', nextAttemptAt: Date.now() + delay }
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.launch()
    }, delay)
  }
  async unlink(): Promise<void> {
    this.epoch++
    this.saved = null
    this.initial = null
    clearTimeout(this.timer)
    this.timer = undefined
    this.client.close()
    this.protocol.resetTransfers()
    this.status = { phase: 'unlinked', reasonCode: null, nextAttemptAt: null }
    await this.write(async () => {
      await this.state.call('config.set', { key: 'link', value: null })
    })
  }
  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.epoch++
    this.initial = null
    clearTimeout(this.timer)
    this.unlisten()
    this.client.close()
    this.protocol.dispose()
    await this.work
    await this.writes
  }
}
function invalidCode(): never {
  throw new HbarError('INVALID_INPUT', 'Node invitation needs eight digits')
}
