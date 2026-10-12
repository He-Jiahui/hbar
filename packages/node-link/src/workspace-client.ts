import { HbarError } from '@hbar/contracts'
import {
  NODE_LIMITS,
  nodeWorkspaceMethods,
  nodeObservationMethods,
  nodeNotificationSchemas,
  type NodeObservationMethod,
} from '@hbar/contracts/node'
import type { NodeIdentity } from '@hbar/node-core'
import { WorkspaceNodeHandshake } from './handshake'
import { NodeRpcPeer } from './rpc-peer'
import { encodeNodeFrame, nodeWebSocketURL } from './wire'
import { z } from 'zod'
import { NODE_CLOSE_CODES } from '@hbar/contracts/node-wire'

export interface NodeJoinedIdentity {
  readonly publicKey: string
  readonly nodeId: string
  readonly name: string
}
/** B actively dials A. Reconnection is owned by the caller, so no execution is replayed here. */
export class WorkspaceNodeClient {
  private socket: WebSocket | null = null
  private peer: NodeRpcPeer<typeof nodeObservationMethods> | null = null
  private stopConnection: (() => void) | null = null
  private ready = false
  constructor(
    private readonly options: {
      identity: NodeIdentity
      handle(method: string, input: unknown, signal: AbortSignal): Promise<unknown>
      onJoined?(identity: NodeJoinedIdentity, signal: AbortSignal): Promise<void>
      onDisconnected?(error: HbarError): void
      heartbeatTimeoutMs?: number
    },
  ) {}
  async connect(input: {
    url: string
    fingerprint: string
    pinnedPublicKey?: string
    code?: string
  }): Promise<NodeJoinedIdentity> {
    if (this.socket)
      throw new HbarError('NODE_CONNECTION_ACTIVE', 'Close the previous workspace connection before dialing again')
    const url = nodeWebSocketURL(input.url)
    const handshake = new WorkspaceNodeHandshake({ identity: this.options.identity, ...input })
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url)
      this.socket = socket
      let settled = false,
        stopped = false,
        processing = false
      let lastSeenAt = Date.now()
      const authority = new AbortController()
      const deadline = setTimeout(
        () => stop(new HbarError('NODE_AUTH_EXPIRED', 'Workspace node dial or handshake expired')),
        10_000,
      )
      const heartbeat = setInterval(
        () => {
          if (Date.now() - lastSeenAt >= (this.options.heartbeatTimeoutMs ?? NODE_LIMITS.heartbeatTimeoutMs))
            stop(new HbarError('NODE_OFFLINE', 'Conversation heartbeat expired'))
        },
        Math.min(5_000, this.options.heartbeatTimeoutMs ?? NODE_LIMITS.heartbeatTimeoutMs),
      )
      const stop = (error: HbarError) => {
        if (stopped) return
        stopped = true
        authority.abort(error)
        clearTimeout(deadline)
        clearInterval(heartbeat)
        this.ready = false
        try {
          this.peer?.close(4001, 'Workspace link closed')
        } catch {
          /* Continue releasing the expired socket. */
        }
        this.peer = null
        if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)
          try {
            socket.close(4001, 'Workspace link closed')
          } catch {
            /* An already failed dial still releases authority. */
          }
        if (this.socket === socket) {
          this.socket = null
          this.stopConnection = null
        }
        if (!settled) {
          settled = true
          reject(error)
        }
        this.options.onDisconnected?.(error)
      }
      this.stopConnection = () => stop(new HbarError('CANCELLED', 'Workspace node disconnected locally'))
      const transport = {
        send(text: string): boolean {
          if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 4 * NODE_LIMITS.frameBytes) return false
          socket.send(text)
          return true
        },
        close(code: number, reason: string): void {
          if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)
            try {
              socket.close(code >= 3000 && code <= 4999 ? code : 4000, reason)
            } catch {
              /* Transport is already closed. */
            }
        },
      }
      socket.onopen = () => {
        try {
          if (!transport.send(encodeNodeFrame(handshake.hello())))
            stop(new HbarError('NODE_OFFLINE', 'Node hello was not sent'))
        } catch {
          stop(new HbarError('NODE_OFFLINE', 'Node hello failed'))
        }
      }
      socket.onerror = () => stop(new HbarError('NODE_OFFLINE', 'Workspace node connection failed'))
      socket.onclose = (event) =>
        stop(
          new HbarError(
            event.code === NODE_CLOSE_CODES.revoked
              ? 'NODE_REVOKED'
              : event.code === NODE_CLOSE_CODES.evaluator
                ? 'NODE_EVALUATOR_MISMATCH'
                : event.code === NODE_CLOSE_CODES.replaced
                  ? 'NODE_LINK_REPLACED'
                  : 'NODE_OFFLINE',
            'Conversation node disconnected',
          ),
        )
      socket.onmessage = (event) => {
        void (async () => {
          if (stopped) return
          if (typeof event.data !== 'string') throw new HbarError('NODE_FRAME_INVALID', 'Node frames must be JSON text')
          lastSeenAt = Date.now()
          if (this.peer) {
            await this.peer.receive(event.data)
            return
          }
          if (processing) throw new HbarError('NODE_AUTH_INVALID', 'Concurrent conversation authentication frames')
          processing = true
          try {
            const result = handshake.receive(event.data)
            if (result.reply) {
              if (!transport.send(encodeNodeFrame(result.reply)))
                throw new HbarError('NODE_OFFLINE', 'Node identity proof was not sent')
              return
            }
            if (!result.joined) throw new HbarError('NODE_AUTH_INVALID', 'Node joined proof is missing')
            this.peer = new NodeRpcPeer({
              remote: nodeObservationMethods,
              local: nodeWorkspaceMethods,
              transport,
              outgoingNotifications: nodeNotificationSchemas,
              handle: (method, value, signal) => {
                if (!this.ready && method !== 'node.capabilities' && method !== 'node.ping')
                  throw new HbarError('NODE_LINK_PREPARING', 'Workspace link identity is being saved')
                return this.options.handle(method, value, signal)
              },
              onClose: () => stop(new HbarError('NODE_OFFLINE', 'Workspace RPC link closed')),
            })
            await this.options.onJoined?.(result.joined, authority.signal)
            if (stopped) return
            this.ready = true
            settled = true
            clearTimeout(deadline)
            resolve(result.joined)
          } finally {
            processing = false
          }
        })().catch((error: unknown) =>
          stop(
            error instanceof HbarError ? error : new HbarError('NODE_AUTH_INVALID', 'Node handshake or frame failed'),
          ),
        )
      }
    })
  }
  async observe<Method extends NodeObservationMethod>(
    method: Method,
    input: z.input<(typeof nodeObservationMethods)[Method]['input']>,
    signal?: AbortSignal,
  ) {
    if (!this.peer || !this.ready) throw new HbarError('NODE_OFFLINE', 'Workspace observation link is offline')
    return this.peer.call(method, input, { ...(signal ? { signal } : {}) })
  }
  get isOnline(): boolean {
    return this.ready && this.peer !== null && this.socket?.readyState === WebSocket.OPEN
  }
  notify(method: keyof typeof nodeNotificationSchemas, value: unknown): void {
    if (!this.peer || !this.ready) throw new HbarError('NODE_OFFLINE', 'Workspace node is not linked')
    this.peer.notify(method, value)
  }
  close(): void {
    this.stopConnection?.()
  }
}
