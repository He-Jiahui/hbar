import { randomInt, timingSafeEqual } from 'node:crypto'
import { HbarError } from '@hbar/contracts'
import {
  nodeInviteSchema,
  registeredNodeSchema,
  type NodeRegistryStatePort,
  type RegisteredNode,
} from '@hbar/contracts/node-registry'
import { nodePublicKeySchema, type NodeCapabilities } from '@hbar/contracts/node'
import {
  createNodeIdentity,
  validateNodeIdentity,
  nodeFingerprint,
  nodeIdFromPublicKey,
  type NodeIdentity,
} from '@hbar/node-core'

interface Invitation {
  code: string
  name: string
  expiresAt: number
  consuming: boolean
}
export class NodeRegistryService {
  private readonly invitations = new Map<string, Invitation>()
  private readonly attempts = new Map<string, { count: number; resetAt: number }>()
  private readonly revocations = new Set<(nodeId: string) => void>()
  private pendingInvitations = 0
  private consumingInvitations = 0
  /** Pure: expiry is evaluated without sweeping or extending any invitation. */
  idleSnapshot() {
    const now = this.now()
    return {
      invitations: [...this.invitations.values()].filter((value) => value.expiresAt > now || value.consuming).length,
      pendingInvitations: this.pendingInvitations,
      consumingInvitations: this.consumingInvitations,
      rateLimitSources: [...this.attempts.values()].filter((value) => value.resetAt > now).length,
    }
  }
  private constructor(
    readonly identity: NodeIdentity,
    private readonly state: NodeRegistryStatePort,
    private readonly now: () => number,
  ) {}
  static async open(state: NodeRegistryStatePort, now = Date.now): Promise<NodeRegistryService> {
    const identity = validateNodeIdentity(await state.call('identity.ensure', createNodeIdentity()))
    return new NodeRegistryService(identity, state, now)
  }
  private sweep(): void {
    const now = this.now()
    for (const [code, invitation] of this.invitations) if (invitation.expiresAt <= now) this.invitations.delete(code)
    for (const [source, attempt] of this.attempts) if (attempt.resetAt <= now) this.attempts.delete(source)
  }
  async invite(value: string) {
    this.sweep()
    const name = registeredNodeSchema.shape.name.parse(value)
    if (this.invitations.size + this.pendingInvitations >= 128)
      throw new HbarError('NODE_INVITE_CAPACITY', 'Too many pending node invitations')
    this.pendingInvitations++
    try {
      if ((await this.list()).some((node) => node.revokedAt === null && node.name.toLowerCase() === name.toLowerCase()))
        throw new HbarError('NODE_NAME_CONFLICT', 'A live node already has this name')
      for (let attempt = 0; attempt < 32; attempt++) {
        const code = String(randomInt(10_000_000, 100_000_000))
        if (this.invitations.has(code)) continue
        const invitation = { code, name, expiresAt: this.now() + 5 * 60_000, consuming: false }
        this.invitations.set(code, invitation)
        return nodeInviteSchema.parse({
          code,
          name,
          expiresAt: invitation.expiresAt,
          fingerprint: nodeFingerprint(this.identity.publicKey),
        })
      }
      throw new HbarError('NODE_INVITE_CAPACITY', 'Unable to allocate a distinct node invitation')
    } finally {
      this.pendingInvitations--
    }
  }
  list(): Promise<RegisteredNode[]> {
    return this.state.call('node.list', {})
  }
  async known(publicKey: string): Promise<RegisteredNode> {
    const key = nodePublicKeySchema.parse(publicKey)
    const node = await this.state.call('node.get', { nodeId: nodeIdFromPublicKey(key) })
    if (!node || node.publicKey !== key)
      throw new HbarError('NODE_UNRECOGNIZED', 'Node public key has not been registered')
    if (node.revokedAt !== null) throw new HbarError('NODE_REVOKED', 'Node public key has been revoked')
    return node
  }
  /** Called only after the workspace key proves the signed, two-party challenge. */
  async join(publicKey: string, supplied: string, source: string): Promise<RegisteredNode> {
    this.sweep()
    if (!this.attempts.has(source) && this.attempts.size >= 2000)
      throw new HbarError('RATE_LIMIT', 'Node invitation source capacity reached')
    const attempt = this.attempts.get(source) ?? { count: 0, resetAt: this.now() + 60_000 }
    this.attempts.set(source, attempt)
    if (++attempt.count > 5) throw new HbarError('RATE_LIMIT', 'Try node pairing again after one minute')
    const candidate = this.invitations.get(supplied)
    const incoming = Buffer.from(supplied),
      expected = Buffer.from(candidate?.code ?? '')
    if (
      !candidate ||
      candidate.consuming ||
      candidate.expiresAt <= this.now() ||
      incoming.length !== expected.length ||
      !timingSafeEqual(incoming, expected)
    )
      throw new HbarError('NODE_PAIRING_FAILED', 'Invalid, used or expired node invitation')
    const key = nodePublicKeySchema.parse(publicKey)
    candidate.consuming = true
    this.consumingInvitations++
    try {
      const node = await this.state.call('node.register', {
        nodeId: nodeIdFromPublicKey(key),
        publicKey: key,
        name: candidate.name,
        createdAt: this.now(),
      })
      this.invitations.delete(supplied)
      return node
    } catch (error) {
      candidate.consuming = false
      throw error
    } finally {
      this.consumingInvitations--
    }
  }
  async touch(nodeId: string, capabilities: NodeCapabilities): Promise<RegisteredNode> {
    return this.state.call('node.touch', { nodeId, time: this.now(), capabilities })
  }
  async revoke(selector: string): Promise<RegisteredNode> {
    const nodes = await this.list()
    const direct = nodes.find((node) => node.nodeId === selector)
    const matches = nodes.filter(
      (node) => node.revokedAt === null && node.name.toLowerCase() === selector.toLowerCase(),
    )
    const target = direct ?? (matches.length === 1 ? matches[0] : undefined)
    if (!target) throw new HbarError('NODE_NOT_FOUND', 'Node selector is unknown or ambiguous')
    const revoked = await this.state.call('node.revoke', { nodeId: target.nodeId, time: this.now() })
    for (const listener of this.revocations) listener(target.nodeId)
    return revoked
  }
  onRevoke(listener: (nodeId: string) => void): () => void {
    this.revocations.add(listener)
    return () => this.revocations.delete(listener)
  }
  dispose(): void {
    this.invitations.clear()
    this.attempts.clear()
    this.revocations.clear()
  }
}
