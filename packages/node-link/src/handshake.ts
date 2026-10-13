import { HbarError } from '@hbar/contracts'
import { NODE_PROTOCOL_VERSION } from '@hbar/contracts/node'
import { nodeHandshakeFrameSchema, type NodeHandshakeFrame } from '@hbar/contracts/node-wire'
import {
  nodeChallenge,
  nodeAuthTranscript,
  signNode,
  verifyNode,
  nodeFingerprint,
  nodeIdFromPublicKey,
  type NodeIdentity,
} from '@hbar/node-core'
import type { RegisteredNode } from '@hbar/contracts/node-registry'
import type { NodeRegistryService } from './registry'
import { decodeNodeFrame } from './wire'

/** The handshake controller never has operator or model method handlers. */
export class ConversationNodeHandshake {
  private phase: 'hello' | 'authenticate' | 'joined' | 'failed' = 'hello'
  private workspaceKey = ''
  private workspaceChallenge = ''
  private readonly challenge = nodeChallenge()
  private readonly expiresAt: number
  private registered: RegisteredNode | undefined
  constructor(
    private readonly registry: NodeRegistryService,
    private readonly source: string,
    private readonly now = Date.now,
  ) {
    this.expiresAt = now() + 10_000
  }
  get node(): RegisteredNode | undefined {
    return this.registered
  }
  async receive(text: string): Promise<NodeHandshakeFrame> {
    try {
      if (this.now() >= this.expiresAt || this.phase === 'failed' || this.phase === 'joined')
        throw new HbarError('NODE_AUTH_EXPIRED', 'Node authentication authority expired')
      const frame = nodeHandshakeFrameSchema.parse(decodeNodeFrame(text))
      if (this.phase === 'hello' && frame.type === 'hello') {
        this.workspaceKey = frame.publicKey
        this.workspaceChallenge = frame.challenge
        this.phase = 'authenticate'
        return {
          type: 'challenge',
          protocol: NODE_PROTOCOL_VERSION,
          publicKey: this.registry.identity.publicKey,
          challenge: this.challenge,
          signature: signNode(this.registry.identity, this.transcript('conversation')),
        }
      }
      if (this.phase !== 'authenticate' || frame.type !== 'authenticate')
        throw new HbarError('NODE_AUTH_INVALID', 'Unexpected node authentication step')
      this.phase = 'failed'
      if (!verifyNode(this.workspaceKey, this.transcript('workspace'), frame.signature))
        throw new HbarError('NODE_AUTH_INVALID', 'Workspace node signature is invalid')
      let registered: RegisteredNode
      try {
        registered = await this.registry.known(this.workspaceKey)
      } catch (error) {
        // A may have committed a join whose final acknowledgement never reached B.
        // Only an unknown, freshly proven key may consume an invitation; revocation remains final.
        if (!(error instanceof HbarError) || error.code !== 'NODE_UNRECOGNIZED' || !frame.pairingCode) throw error
        registered = await this.registry.join(this.workspaceKey, frame.pairingCode, this.source)
      }
      this.registered = registered
      this.phase = 'joined'
      return {
        type: 'joined',
        nodeId: registered.nodeId,
        name: registered.name,
        signature: signNode(this.registry.identity, this.transcript('joined')),
      }
    } catch (error) {
      this.phase = 'failed'
      throw error
    }
  }
  private transcript(side: 'conversation' | 'workspace' | 'joined'): string {
    return nodeAuthTranscript(
      this.registry.identity.publicKey,
      this.workspaceKey,
      this.challenge,
      this.workspaceChallenge,
      side,
    )
  }
}
export class WorkspaceNodeHandshake {
  private phase: 'challenge' | 'joined' | 'complete' | 'failed' = 'challenge'
  private conversationKey = ''
  private conversationChallenge = ''
  private readonly challenge = nodeChallenge()
  private readonly expiresAt: number
  constructor(
    private readonly options: {
      identity: NodeIdentity
      fingerprint: string
      pinnedPublicKey?: string
      code?: string
      now?: () => number
    },
  ) {
    this.expiresAt = (options.now ?? Date.now)() + 10_000
  }
  hello(): NodeHandshakeFrame {
    return {
      type: 'hello',
      protocol: NODE_PROTOCOL_VERSION,
      publicKey: this.options.identity.publicKey,
      challenge: this.challenge,
    }
  }
  receive(text: string): {
    reply: NodeHandshakeFrame | null
    joined: { publicKey: string; nodeId: string; name: string } | null
  } {
    try {
      if ((this.options.now ?? Date.now)() >= this.expiresAt || this.phase === 'failed' || this.phase === 'complete')
        throw new HbarError('NODE_AUTH_EXPIRED', 'Node authentication authority expired')
      const frame = nodeHandshakeFrameSchema.parse(decodeNodeFrame(text))
      if (frame.type === 'error') throw new HbarError(frame.code, frame.message)
      if (this.phase === 'challenge' && frame.type === 'challenge') {
        if (
          nodeFingerprint(frame.publicKey) !== this.options.fingerprint ||
          (this.options.pinnedPublicKey && frame.publicKey !== this.options.pinnedPublicKey)
        )
          throw new HbarError('NODE_HOST_KEY_CHANGED', 'Conversation node public key differs from its pinned identity')
        this.conversationKey = frame.publicKey
        this.conversationChallenge = frame.challenge
        if (!verifyNode(frame.publicKey, this.transcript('conversation'), frame.signature))
          throw new HbarError('NODE_AUTH_INVALID', 'Conversation node signature is invalid')
        this.phase = 'joined'
        return {
          reply: {
            type: 'authenticate',
            signature: signNode(this.options.identity, this.transcript('workspace')),
            ...(this.options.code ? { pairingCode: this.options.code } : {}),
          },
          joined: null,
        }
      }
      if (
        this.phase !== 'joined' ||
        frame.type !== 'joined' ||
        frame.nodeId !== nodeIdFromPublicKey(this.options.identity.publicKey) ||
        !verifyNode(this.conversationKey, this.transcript('joined'), frame.signature)
      )
        throw new HbarError('NODE_AUTH_INVALID', 'Node joined proof is invalid')
      this.phase = 'complete'
      return { reply: null, joined: { publicKey: this.conversationKey, nodeId: frame.nodeId, name: frame.name } }
    } catch (error) {
      this.phase = 'failed'
      throw error
    }
  }
  private transcript(side: 'conversation' | 'workspace' | 'joined'): string {
    return nodeAuthTranscript(
      this.conversationKey,
      this.options.identity.publicKey,
      this.conversationChallenge,
      this.challenge,
      side,
    )
  }
}
