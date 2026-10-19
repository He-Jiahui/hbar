import { HbarError } from '@hbar/contracts'
import {
  NODE_LIMITS,
  nodeWorkspaceMethods,
  nodeObservationMethods,
  nodeNotificationSchemas,
  type NodeCapabilities,
  type NodeWorkspaceMethod,
} from '@hbar/contracts/node'
import { SANDBOX_EVALUATOR_FINGERPRINT } from '@hbar/sandbox'
import { nodeChallenge } from '@hbar/node-core'
import type { RegisteredNode } from '@hbar/contracts/node-registry'
import { NodeRpcPeer, type NodeWireTransport } from './rpc-peer'
import { ConversationNodeHandshake } from './handshake'
import { encodeNodeFrame } from './wire'
import type { NodeRegistryService } from './registry'
import { z } from 'zod'
import { NODE_CLOSE_CODES } from '@hbar/contracts/node-wire'

type Peer = NodeRpcPeer<typeof nodeWorkspaceMethods>
interface Connection {
  id: string
  transport: NodeWireTransport
  handshake: ConversationNodeHandshake
  node: RegisteredNode | null
  peer: Peer | null
  capabilities: NodeCapabilities | null
  lastSeenAt: number
  busy: boolean
  pinging: boolean
  refreshing: boolean
  refreshAgain: boolean
  deadline: ReturnType<typeof setTimeout>
}
/** A-side owner of authenticated node links. Stable HTTP sockets are injected as narrow transports. */
export class ConversationNodeConnections {
  private readonly connections = new Map<string, Connection>()
  private readonly byNode = new Map<string, string>()
  private readonly attempts = new Map<string, { count: number; resetAt: number }>()
  private readonly heartbeat: ReturnType<typeof setInterval>
  private readonly unlisten: () => void
  private closed = false
  private physicalBackground = 0
  private physicalRequests = 0
  private uncertainRemote = false
  idleSnapshot() {
    const now = this.now()
    return {
      connections: this.connections.size,
      handshakes: [...this.connections.values()].filter((entry) => entry.node === null).length,
      physicalBackground: this.physicalBackground,
      physicalRequests: this.physicalRequests,
      uncertainRemote: this.uncertainRemote,
      rateLimitSources: [...this.attempts.values()].filter((entry) => entry.resetAt > now).length,
    }
  }
  private async background<Result>(operation: () => Promise<Result>): Promise<Result> {
    this.physicalBackground++
    try {
      return await operation()
    } catch (error) {
      this.uncertainRemote = true
      throw error
    } finally {
      this.physicalBackground--
    }
  }
  private readonly now: () => number
  constructor(
    private readonly registry: NodeRegistryService,
    private readonly options: {
      observe(nodeId: string, method: string, input: unknown, signal: AbortSignal): Promise<unknown>
      onChanged?(): void
      onNotification?(nodeId: string, method: string, input: unknown): void
      heartbeatMs?: number
      heartbeatTimeoutMs?: number
      now?: () => number
    },
  ) {
    this.now = options.now ?? Date.now
    this.heartbeat = setInterval(() => this.tick(), options.heartbeatMs ?? NODE_LIMITS.heartbeatMs)
    this.unlisten = registry.onRevoke((nodeId) => {
      const id = this.byNode.get(nodeId)
      if (id) this.closeConnection(id, NODE_CLOSE_CODES.revoked, 'Node identity revoked')
    })
  }
  open(id: string, source: string, transport: NodeWireTransport): void {
    if (this.closed || this.connections.has(id)) throw new HbarError('NODE_OFFLINE', 'Node link owner is unavailable')
    const now = this.now()
    for (const [key, entry] of this.attempts) if (entry.resetAt <= now) this.attempts.delete(key)
    if (!this.attempts.has(source) && this.attempts.size >= 2000)
      throw new HbarError('RATE_LIMIT', 'Node connection source capacity reached')
    const attempt = this.attempts.get(source) ?? { count: 0, resetAt: now + 60_000 }
    this.attempts.set(source, attempt)
    if (++attempt.count > 5) throw new HbarError('RATE_LIMIT', 'Try node authentication again after one minute')
    const pending = [...this.connections.values()].filter((entry) => !entry.node).length
    if (pending >= 64 || this.connections.size >= 1000)
      throw new HbarError('NODE_BUSY', 'Node connection capacity reached')
    const deadline = setTimeout(() => this.closeConnection(id, 4001, 'Node authentication deadline exceeded'), 10_000)
    this.connections.set(id, {
      id,
      transport,
      handshake: new ConversationNodeHandshake(this.registry, source, this.now),
      node: null,
      peer: null,
      capabilities: null,
      lastSeenAt: now,
      busy: false,
      pinging: false,
      refreshing: false,
      refreshAgain: false,
      deadline,
    })
  }
  async receive(id: string, text: string): Promise<void> {
    this.physicalRequests++
    try {
      const connection = this.connections.get(id)
      if (!connection || this.closed) return
      if (connection.peer) {
        connection.lastSeenAt = this.now()
        await connection.peer.receive(text)
        return
      }
      if (connection.busy) {
        this.closeConnection(id, 4002, 'Concurrent node authentication frames')
        return
      }
      connection.busy = true
      try {
        const reply = await connection.handshake.receive(text)
        if (this.connections.get(id) !== connection) return
        if (!connection.transport.send(encodeNodeFrame(reply))) {
          this.closeConnection(id)
          return
        }
        const node = connection.handshake.node
        if (!node) return
        const prior = this.byNode.get(node.nodeId)
        if (prior)
          this.closeConnection(prior, NODE_CLOSE_CODES.replaced, 'Node link replaced by a new signed connection')
        connection.node = node
        connection.peer = this.peer(connection)
        this.byNode.set(node.nodeId, id)
        clearTimeout(connection.deadline)
        // Do not hold a transport dispatch request while its capability reply needs the same IPC owner.
        void this.refresh(connection).catch(() =>
          this.closeConnection(id, NODE_CLOSE_CODES.evaluator, 'Node capabilities rejected'),
        )
      } catch (error) {
        try {
          connection.transport.send(
            encodeNodeFrame({
              type: 'error',
              code: error instanceof HbarError ? error.code : 'NODE_AUTH_INVALID',
              message: error instanceof HbarError ? error.message : 'Node authentication failed',
            }),
          )
        } finally {
          this.closeConnection(id, 4001, 'Node authentication failed')
        }
      } finally {
        connection.busy = false
      }
    } finally {
      this.physicalRequests--
    }
  }
  private peer(connection: Connection): Peer {
    return new NodeRpcPeer({
      remote: nodeWorkspaceMethods,
      local: nodeObservationMethods,
      transport: connection.transport,
      incomingNotifications: nodeNotificationSchemas,
      handle: async (method, input, signal) => {
        return this.background(async () => {
          const node = connection.node
          if (!node || this.byNode.get(node.nodeId) !== connection.id)
            throw new HbarError('NODE_OFFLINE', 'Node link authority was replaced')
          await this.registry.known(node.publicKey)
          return this.options.observe(node.nodeId, method, input, signal)
        })
      },
      onNotification: (method, input) => {
        if (!connection.node) return
        if (method === 'node.rootsChanged' || method === 'node.floorChanged')
          void this.refresh(connection).catch(() =>
            this.closeConnection(connection.id, NODE_CLOSE_CODES.evaluator, 'Node capabilities rejected'),
          )
        else this.options.onNotification?.(connection.node.nodeId, method, input)
      },
      onClose: () => this.closedConnection(connection.id),
    })
  }
  private async refresh(connection: Connection): Promise<void> {
    if (!connection.peer || !connection.node) return
    if (connection.refreshing) {
      connection.refreshAgain = true
      return
    }
    connection.refreshing = true
    this.physicalBackground++
    try {
      do {
        connection.refreshAgain = false
        const capabilities = await connection.peer.call('node.capabilities', {})
        if (capabilities.nodeId !== connection.node.nodeId || capabilities.evaluator !== SANDBOX_EVALUATOR_FINGERPRINT)
          throw new HbarError(
            'NODE_EVALUATOR_MISMATCH',
            'Node identity or sandbox evaluator differs from the conversation owner',
          )
        await this.registry.touch(connection.node.nodeId, capabilities)
        if (this.connections.get(connection.id) !== connection) return
        connection.capabilities = capabilities
        connection.lastSeenAt = this.now()
        this.options.onChanged?.()
      } while (connection.refreshAgain)
    } catch (error) {
      this.uncertainRemote = true
      throw error
    } finally {
      connection.refreshing = false
      this.physicalBackground--
    }
  }
  private tick(): void {
    for (const connection of this.connections.values()) {
      if (!connection.peer || !connection.node) continue
      if (this.now() - connection.lastSeenAt >= (this.options.heartbeatTimeoutMs ?? NODE_LIMITS.heartbeatTimeoutMs)) {
        this.closeConnection(connection.id, 4003, 'Node heartbeat expired')
        continue
      }
      if (connection.pinging) continue
      connection.pinging = true
      this.physicalBackground++
      const nonce = nodeChallenge()
      void connection.peer
        .call('node.ping', { nonce }, { timeoutMs: this.options.heartbeatTimeoutMs ?? NODE_LIMITS.heartbeatTimeoutMs })
        .then(async (reply) => {
          if (reply.nonce !== nonce)
            throw new HbarError('NODE_HEARTBEAT_INVALID', 'Node heartbeat proof differs from its request')
          connection.lastSeenAt = this.now()
          if (connection.node && connection.capabilities)
            await this.registry.touch(connection.node.nodeId, connection.capabilities)
        })
        .catch(() => {
          this.uncertainRemote = true
          this.closeConnection(connection.id, 4003, 'Node heartbeat failed')
        })
        .finally(() => {
          connection.pinging = false
          this.physicalBackground--
        })
    }
  }
  async call<Method extends NodeWorkspaceMethod>(
    nodeId: string,
    method: Method,
    input: z.input<(typeof nodeWorkspaceMethods)[Method]['input']>,
    signal?: AbortSignal,
  ) {
    const id = this.byNode.get(nodeId),
      connection = id ? this.connections.get(id) : undefined
    if (!connection?.peer || !connection.capabilities)
      throw new HbarError('NODE_OFFLINE', 'Workspace node is offline or preparing')
    this.physicalRequests++
    try {
      return await connection.peer.call(method, input, { ...(signal ? { signal } : {}) })
    } catch (error) {
      this.uncertainRemote = true
      throw error
    } finally {
      this.physicalRequests--
    }
  }
  async list() {
    return (await this.registry.list()).map((node) => {
      const id = this.byNode.get(node.nodeId),
        connection = id ? this.connections.get(id) : undefined
      return {
        ...node,
        online: !!connection?.capabilities,
        capabilities: connection?.capabilities ?? node.capabilities,
      }
    })
  }
  private closedConnection(id: string): void {
    const connection = this.connections.get(id)
    if (!connection) return
    this.connections.delete(id)
    clearTimeout(connection.deadline)
    if (connection.node && this.byNode.get(connection.node.nodeId) === id) this.byNode.delete(connection.node.nodeId)
    connection.peer?.close()
    this.options.onChanged?.()
  }
  closeConnection(id: string, code = 1001, reason = 'Node connection closed'): void {
    const connection = this.connections.get(id)
    if (!connection) return
    if (connection.peer) connection.peer.close(code, reason)
    else {
      this.closedConnection(id)
      connection.transport.close(code, reason)
    }
  }
  dispose(): void {
    if (this.closed) return
    this.closed = true
    clearInterval(this.heartbeat)
    this.unlisten()
    for (const id of [...this.connections.keys()]) this.closeConnection(id)
    this.attempts.clear()
  }
}
