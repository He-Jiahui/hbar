import { HbarError, PROTOCOL_VERSION } from '@hbar/contracts'
import type { ArtifactRef, HostInfo, RpcMethod, RpcParams, RpcResults, WireNotification } from '@hbar/contracts'

export interface ClientTransport {
  call<M extends RpcMethod>(method: M, params: RpcParams<M>): Promise<RpcResults[M]>
}
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'pairing'
export class HbarClient implements ClientTransport {
  private socket?: WebSocket
  private pending = new Map<
    number,
    { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
  >()
  private nextId = 0
  private events = new Set<(event: WireNotification) => void>()
  private statuses = new Set<(status: ConnectionStatus) => void>()
  private closed = false
  private retry = 0
  private retryTimer?: ReturnType<typeof setTimeout>
  private connectPromise?: Promise<HostInfo>
  private follows = new Map<string, number>()
  constructor(
    readonly baseUrl: string,
    private token?: string,
  ) {}
  onEvent(listener: (event: WireNotification) => void) {
    this.events.add(listener)
    return () => {
      this.events.delete(listener)
    }
  }
  onStatus(listener: (status: ConnectionStatus) => void) {
    this.statuses.add(listener)
    return () => {
      this.statuses.delete(listener)
    }
  }
  private status(status: ConnectionStatus) {
    for (const listener of this.statuses) listener(status)
  }
  connect(): Promise<HostInfo> {
    if (this.connectPromise) return this.connectPromise
    this.closed = false
    this.status('connecting')
    const url = new URL('/rpc', this.baseUrl)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    this.connectPromise = new Promise((resolve, reject) => {
      const socket = new WebSocket(url)
      this.socket = socket
      socket.onopen = async () => {
        try {
          const host = await this.call('system.hello', { protocol: PROTOCOL_VERSION, token: this.token })
          this.retry = 0
          this.status('connected')
          resolve(host)
          for (const [sessionId, cursor] of this.follows) await this.follow(sessionId, cursor)
        } catch (error) {
          if (error instanceof HbarError && error.code === 'UNAUTHORIZED') {
            this.closed = true
            this.status('pairing')
          }
          reject(error)
          socket.close()
        }
      }
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as {
            id?: number
            result?: unknown
            error?: { message: string; data?: string }
            method?: WireNotification['method']
            params: unknown
          }
          if (message.id !== undefined) {
            const pending = this.pending.get(message.id)
            if (!pending) return
            clearTimeout(pending.timer)
            this.pending.delete(message.id)
            if (message.error) pending.reject(new HbarError(message.error.data ?? 'RPC_ERROR', message.error.message))
            else pending.resolve(message.result)
          } else if (message.method) {
            const notification = message as unknown as WireNotification
            if (notification.method === 'session.event')
              this.follows.set(
                notification.params.sessionId,
                Math.max(this.follows.get(notification.params.sessionId) ?? 0, notification.params.seq),
              )
            if (notification.method === 'auth.revoked') {
              this.closed = true
              this.status('pairing')
            }
            for (const listener of this.events) listener(notification)
          }
        } catch (error) {
          console.error('Invalid host message:', error)
        }
      }
      socket.onerror = () => reject(new Error('Cannot connect to hbar host'))
      socket.onclose = () => {
        this.connectPromise = undefined
        for (const pending of this.pending.values()) {
          clearTimeout(pending.timer)
          pending.reject(new HbarError('DISCONNECTED', 'Connection closed; reconcile using the request id'))
        }
        this.pending.clear()
        if (!this.closed) {
          this.status('disconnected')
          this.retryTimer = setTimeout(
            () => {
              void this.connect().catch(() => {})
            },
            Math.min(10_000, 300 * 2 ** this.retry++),
          )
        }
      }
    })
    return this.connectPromise
  }
  call<M extends RpcMethod>(method: M, params: RpcParams<M>): Promise<RpcResults[M]> {
    if (this.socket?.readyState !== WebSocket.OPEN)
      return Promise.reject(new HbarError('DISCONNECTED', 'Host is not connected'))
    return new Promise((resolve, reject) => {
      const id = ++this.nextId
      const timer = setTimeout(
        () => {
          this.pending.delete(id)
          reject(new HbarError('TIMEOUT', 'Request timed out'))
        },
        method === 'context.compact' ? 300_000 : 30_000,
      )
      this.pending.set(id, { resolve: (value) => resolve(value as RpcResults[M]), reject, timer })
      this.socket!.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
    })
  }
  async follow(sessionId: string, cursor: number) {
    this.follows.set(sessionId, cursor)
    const result = await this.call('session.follow', { sessionId, cursor })
    if (result.reset) {
      for (const listener of this.events) listener({ method: 'host.changed', params: { kind: 'resync' } })
      return result
    }
    for (const event of result.events)
      for (const listener of this.events) listener({ method: 'session.event', params: event })
    for (const stream of result.streams)
      for (const listener of this.events) listener({ method: 'stream.update', params: stream })
    this.follows.set(sessionId, Math.max(this.follows.get(sessionId) ?? 0, result.cursor))
    return result
  }
  async unfollow(sessionId: string) {
    this.follows.delete(sessionId)
    if (this.socket?.readyState === WebSocket.OPEN) await this.call('session.unfollow', { sessionId })
  }
  async pair(code: string, name: string) {
    const response = await fetch(new URL('/auth/pair', this.baseUrl), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name }),
    })
    const result = (await response.json()) as { token?: string; error?: string }
    if (!response.ok) throw new Error(result.error ?? 'Pairing failed')
    this.token = result.token
    this.closed = false
    this.connectPromise = undefined
    return this.connect()
  }
  async upload(file: File): Promise<ArtifactRef> {
    const response = await fetch(new URL('/api/artifacts', this.baseUrl), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': file.type,
        'X-Filename': encodeURIComponent(file.name),
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: file,
    })
    const data = await response.json()
    if (!response.ok) throw new Error((data as { error: string }).error)
    return data as ArtifactRef
  }
  artifactUrl(id: string) {
    return new URL(`/api/artifacts/${id}`, this.baseUrl).href
  }
  disconnect() {
    this.closed = true
    clearTimeout(this.retryTimer)
    this.socket?.close()
    this.connectPromise = undefined
  }
}
