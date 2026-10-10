import { artifactSchema, HbarError, PROTOCOL_VERSION } from '@hbar/contracts'
import { createImageArtifactReader, type ImageArtifactReadOptions, type ImageArtifactBytes } from './image-artifacts'
export {
  MAX_IMAGE_ARTIFACT_BYTES,
  IMAGE_ARTIFACT_TIMEOUT_MS,
  IMAGE_ARTIFACT_CONCURRENCY,
  IMAGE_ARTIFACT_QUEUE_LIMIT,
  type ImageArtifactReadOptions,
  type ImageArtifactBytes,
  type ImageArtifactMime,
} from './image-artifacts'
export { createDirectoryQueryAdapter } from './directory'
export { createResourceCommandClient } from './resources'
import { readResourceMedia } from './resources'
import type { ResourceReadInput } from '@hbar/contracts/commands/resources'
export { createSessionSearchCommandClient } from './session-search'
export { createNotificationCommandClient } from './notifications'
export { createPromptTemplateCommandClient } from './prompt-templates'
export { createSandboxCommandClient } from './sandbox'
export { createRunBoardCommandClient } from './run-board'
export { createScheduleCommandClient, type ScheduleCommandOptions } from './schedules'
export { createCommandCatalogClient } from './command-catalog'
export { createBudgetCommandClient } from './budget'
export { createRunCommandClient } from './run'
export { createOperationWatcher } from './run'
export { createSessionTimelineClient, type SessionTimelineTransport } from './session-timeline'
export { registerSurfaceClient, type SurfaceClientOptions } from './surfaces'
export { createSchemaCallbackClient } from './schema-content'
export { createSettingsCommandClient } from './settings'
export { createChatDatabaseCommandClient } from './chat-database'
export { createSystemCommandClient } from './system'
export { createUsageCommandClient } from './usage'
export { createInteractionCommandClient, createInteractionRecoveryClient } from './interaction'
export { createGoalPlanCommandClient } from './goals'
export { createWorkflowCommandClient } from './workflows'
export { createModelCommandClient } from './models'
export { createMetricsCommandClient, createMetricsWatcher, type MetricsWatchTransport } from './metrics'
export { createAgentCommandClient } from './agents'
export { createBrowserCommandClient } from './browser'
export { createComputerCommandClient } from './computer'
export { createConnectionCommands, type ConnectionCommandPort } from './connection'
export { createConfigurationCommandClient } from './configuration'
export { createGitCommandClient } from './git'
export { createSessionLaunchTargetReader, type SessionLaunchTargetReadTransport } from './session-launch-target'
export { createSessionLaunchTargetPreparationManager } from './session-launch-target-preparation'
export { createSessionLaunchBranchesManager, createSessionLaunchBranchesReader } from './session-launch-branches'
export { createSessionBranchTargetCommandClient } from './session-branch-target'
export type {
  SessionLaunchBranchCreateOptions,
  SessionLaunchBranchCreateRequest,
  SessionLaunchBranchCreateResult,
  SessionLaunchBranchesManager,
  SessionLaunchBranchesReader,
  SessionLaunchBranchesReadOptions,
  SessionLaunchBranchesRequest,
  SessionLaunchBranchesPage,
} from '@hbar/contracts/commands/session-launch-branches'
export type {
  SessionLaunchTargetReader,
  SessionLaunchTargetReadOptions,
  SessionLaunchTargetPreparationManager,
  SessionLaunchTargetWriteOptions,
} from '@hbar/contracts/commands/session-launch-target'
export { createExtensionCommandClient } from './extensions'
export { allWorkspaceSessionCommands, createWorkspaceSessionCommandClient, exportSessionEvents } from './workspaces'
export {
  createAttachmentCommandClient,
  createAttachmentSourceDescriptor,
  createFileCommandClient,
  type AttachmentSourcePort,
  type AttachmentUploadTransport,
  type AttachmentUploadOptions,
} from './files'
export {
  createBrowserAttachmentController,
  type BrowserAttachmentControllerOptions,
  type BrowserAttachmentSelection,
} from './browser-attachments'
export {
  createBrowserResourcePicker,
  type BrowserFileSelectionPort,
  type BrowserResourcePickerOptions,
} from './browser-resource-picker'
import type { ArtifactRef, HostInfo, RpcMethod, RpcParams, RpcResults, WireNotification } from '@hbar/contracts'

import type { ClientTransport } from './transport'
import type { AttachmentUploadOptions } from './files'
import { chatDatabaseUploadOwnerSchema } from '@hbar/contracts/commands/chat-database'
import { HbarClientDiagnostics, type HbarClientOptions } from './diagnostics'
export { HbarClientDiagnostics, type ClientDiagnosticInput, type HbarClientOptions } from './diagnostics'
export type { ClientTransport } from './transport'
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'pairing'
export class HbarClient implements ClientTransport {
  private socket: WebSocket | undefined
  private pending = new Map<
    number,
    {
      resolve(value: unknown): void
      reject(error: Error): void
      timer: ReturnType<typeof setTimeout>
      method: RpcMethod
      requestId?: string | undefined
      startedAt: number
      bytesOut: number
    }
  >()
  private nextId = 0
  private events = new Set<(event: WireNotification) => void>()
  private statuses = new Set<(status: ConnectionStatus) => void>()
  private closed = false
  private retry = 0
  private retryTimer?: ReturnType<typeof setTimeout>
  private connectPromise?: Promise<HostInfo> | undefined
  private rejectConnection: ((error: Error) => void) | undefined
  private readonly connectTimeoutMs: number
  private readonly restoringFollows = new Set<string>()
  private currentStatus: ConnectionStatus = 'disconnected'
  private currentHost: HostInfo | null = null
  private follows = new Map<string, number>()
  private imageHostId: string | null = null
  private imageReadsRevoked = false
  private readonly imageArtifacts: ReturnType<typeof createImageArtifactReader>
  private readonly diagnostics: HbarClientDiagnostics
  constructor(
    readonly baseUrl: string,
    private token?: string,
    options?: HbarClientOptions,
  ) {
    this.connectTimeoutMs = options?.connectTimeoutMs ?? 10_000
    if (!Number.isSafeInteger(this.connectTimeoutMs) || this.connectTimeoutMs < 1 || this.connectTimeoutMs > 2_147_483_647)
      throw new RangeError('connectTimeoutMs must be a positive timer-safe integer')
    this.diagnostics = new HbarClientDiagnostics(options)
    this.imageArtifacts = createImageArtifactReader({
      baseUrl,
      token: () => this.token,
      enabled: () => !this.closed && !this.imageReadsRevoked,
    })
  }
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
    this.currentStatus = status
    this.dispatch(this.statuses, status)
  }
  private dispatch<Value>(listeners: ReadonlySet<(value: Value) => void>, value: Value): boolean {
    let applied = true
    for (const listener of [...listeners]) {
      try {
        listener(value)
      } catch {
        applied = false
        this.diagnostics.emit({ event: 'listener.failed', level: 'error', errorCode: 'LISTENER_FAILED', outcome: 'failure' }, true)
      }
    }
    return applied
  }
  private notify(notification: WireNotification, replay = false): void {
    if (notification.method !== 'session.event') {
      this.dispatch(this.events, notification)
      return
    }
    const { sessionId, seq } = notification.params
    const cursor = this.follows.get(sessionId)
    if (cursor === undefined) {
      this.dispatch(this.events, notification)
      return
    }
    if (seq <= cursor) return
    if (seq === cursor + 1) {
      if (this.dispatch(this.events, notification)) this.follows.set(sessionId, seq)
      else this.dispatch(this.events, { method: 'host.changed', params: { kind: 'resync' } })
      return
    }
    if (replay || this.restoringFollows.has(sessionId)) return
    this.restoringFollows.add(sessionId)
    void this.follow(sessionId, cursor)
      .catch(() => {
        this.dispatch(this.events, { method: 'host.changed', params: { kind: 'resync' } })
      })
      .finally(() => this.restoringFollows.delete(sessionId))
  }
  private rejectPending(error: HbarError) {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      this.diagnostics.emit(
        {
          event: 'rpc.pending_rejected',
          level: 'warn',
          phase: 'connection',
          rpcId: String(id),
          method: pending.method,
          requestId: pending.requestId,
          errorCode: error.code,
          outcome: 'unknown',
          durationMs: performance.now() - pending.startedAt,
          bytesOut: pending.bytesOut,
          pending: this.pending.size,
        },
        true,
      )
      pending.reject(error)
    }
    this.pending.clear()
  }
  connect(): Promise<HostInfo> {
    if (this.connectPromise && !this.closed) return this.connectPromise
    clearTimeout(this.retryTimer)
    if (this.closed) {
      this.connectPromise = undefined
      const previous = this.socket
      this.socket = undefined
      previous?.close()
    }
    this.closed = false
    this.diagnostics.emit({ event: 'connection.attempt', level: 'info', phase: 'connect', outcome: 'unknown' }, true)
    const url = new URL('/rpc', this.baseUrl)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    this.connectPromise = new Promise((resolve, reject) => {
      const socket = new WebSocket(url)
      this.socket = socket
      const deadline = setTimeout(() => {
        if (this.socket !== socket) return
        rejectConnection(new HbarError('CONNECTION_TIMEOUT', 'Host handshake timed out'))
        socket.close()
      }, this.connectTimeoutMs)
      const rejectConnection = (error: Error) => {
        clearTimeout(deadline)
        reject(error)
      }
      this.rejectConnection = rejectConnection
      socket.onopen = async () => {
        if (this.socket !== socket) return socket.close()
        this.diagnostics.emit({ event: 'connection.open', level: 'debug', phase: 'transport', outcome: 'unknown' }, true)
        try {
          const host = await this.call('system.hello', { protocol: PROTOCOL_VERSION, token: this.token })
          if (this.socket !== socket || this.closed) throw new HbarError('DISCONNECTED', 'Connection changed')
          // The first hello also invalidates reads begun before Host identity was known.
          if (this.imageHostId !== host.instanceId) this.imageArtifacts.invalidate()
          this.imageHostId = host.instanceId
          this.imageReadsRevoked = false
          this.retry = 0
          this.currentHost = host
          this.diagnostics.emit({ event: 'connection.connected', level: 'info', phase: 'hello', instanceId: host.instanceId, outcome: 'success' }, true)
          this.status('connected')
          clearTimeout(deadline)
          this.rejectConnection = undefined
          resolve(host)
          for (const [sessionId, cursor] of this.follows) await this.follow(sessionId, cursor)
        } catch (error) {
          this.diagnostics.emit(
            {
              event: 'connection.hello_failed',
              level: 'error',
              phase: 'hello',
              errorCode: error instanceof HbarError ? error.code : 'CONNECTION_FAILED',
              outcome: 'failure',
            },
            true,
          )
          if (this.socket === socket && error instanceof HbarError && error.code === 'UNAUTHORIZED') {
            this.closed = true
            this.imageReadsRevoked = true
            this.imageArtifacts.invalidate()
            this.currentHost = null
            this.status('pairing')
          }
          rejectConnection(error instanceof Error ? error : new Error('Host handshake failed'))
          socket.close()
        }
      }
      socket.onmessage = (event) => {
        if (this.socket !== socket) return
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
            const durationMs = performance.now() - pending.startedAt
            const errorCode = message.error?.data ?? 'RPC_ERROR'
            this.diagnostics.emit(
              {
                event: message.error ? 'rpc.error' : 'rpc.settled',
                level: message.error ? 'error' : 'debug',
                phase: 'response',
                instanceId: this.currentHost?.instanceId,
                rpcId: String(message.id),
                requestId: pending.requestId,
                method: pending.method,
                ...(message.error ? { errorCode } : {}),
                outcome: message.error ? 'failure' : 'success',
                durationMs,
                bytesIn: new TextEncoder().encode(String(event.data)).byteLength,
                bytesOut: pending.bytesOut,
                pending: this.pending.size,
              },
              Boolean(message.error) || durationMs >= 100,
            )
            if (message.error) pending.reject(new HbarError(errorCode, message.error.message))
            else pending.resolve(message.result)
          } else if (message.method) {
            const notification = message as unknown as WireNotification
            if (notification.method === 'auth.revoked') {
              this.diagnostics.emit({ event: 'connection.revoked', level: 'warn', phase: 'auth', instanceId: this.currentHost?.instanceId, outcome: 'failure', errorCode: 'UNAUTHORIZED' }, true)
              this.closed = true
              this.imageReadsRevoked = true
              this.imageArtifacts.invalidate()
              this.currentHost = null
              this.status('pairing')
            }
            this.notify(notification)
          }
        } catch (error) {
          console.error('Invalid host message:', error)
        }
      }
      socket.onerror = () => {
        if (this.socket !== socket) return
        this.diagnostics.emit({ event: 'connection.error', level: 'error', phase: 'transport', errorCode: 'CONNECTION_FAILED', outcome: 'failure' }, true)
        rejectConnection(new HbarError('CONNECTION_FAILED', 'Cannot connect to hbar host'))
      }
      socket.onclose = () => {
        rejectConnection(new HbarError('DISCONNECTED', 'Host closed before the handshake completed'))
        if (this.socket !== socket) return
        this.rejectConnection = undefined
        this.socket = undefined
        this.connectPromise = undefined
        this.currentHost = null
        this.diagnostics.emit({ event: 'connection.closed', level: this.closed ? 'info' : 'warn', phase: 'transport', outcome: this.closed ? 'success' : 'unknown' }, true)
        this.rejectPending(new HbarError('DISCONNECTED', 'Connection closed; reconcile using the request id'))
        if (!this.closed) {
          this.status('disconnected')
          this.retryTimer = setTimeout(
            () => {
              this.diagnostics.emit({ event: 'connection.reconnect', level: 'info', phase: 'retry', outcome: 'unknown' }, true)
              void this.connect().catch(() => {})
            },
            Math.min(10_000, 300 * 2 ** this.retry++),
          )
        }
      }
    })
    const attempt = this.connectPromise
    this.status('connecting')
    return attempt
  }
  call<M extends RpcMethod>(method: M, params: RpcParams<M>): Promise<RpcResults[M]> {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      this.diagnostics.emit({ event: 'rpc.admission_rejected', level: 'warn', phase: 'admission', method, errorCode: 'DISCONNECTED', outcome: 'failure', pending: this.pending.size }, true)
      return Promise.reject(new HbarError('DISCONNECTED', 'Host is not connected'))
    }
    return new Promise((resolve, reject) => {
      const id = ++this.nextId
      const startedAt = performance.now()
      const requestId =
        typeof params === 'object' && params !== null && 'requestId' in params && typeof params.requestId === 'string'
          ? params.requestId.slice(0, 160)
          : undefined
      let bytesOut = 0
      const longRunning =
        method === 'context.compact' ||
        (method === 'command.execute' &&
          typeof params === 'object' &&
          params !== null &&
          'commandId' in params &&
          params.commandId === 'context.compact')
      const message = JSON.stringify({ jsonrpc: '2.0', id, method, params })
      bytesOut = new TextEncoder().encode(message).byteLength
      const timer = setTimeout(
        () => {
          this.pending.delete(id)
          this.diagnostics.emit({ event: 'rpc.timeout', level: 'error', phase: 'timeout', instanceId: this.currentHost?.instanceId, rpcId: String(id), requestId, method, errorCode: 'TIMEOUT', outcome: 'unknown', durationMs: performance.now() - startedAt, bytesOut, pending: this.pending.size }, true)
          reject(new HbarError('TIMEOUT', 'Request timed out'))
        },
        longRunning ? 300_000 : 30_000,
      )
      this.pending.set(id, { resolve: (value) => resolve(value as RpcResults[M]), reject, timer, method, requestId, startedAt, bytesOut })
      this.diagnostics.emit({ event: 'rpc.sent', level: 'debug', phase: 'transport', instanceId: this.currentHost?.instanceId, rpcId: String(id), requestId, method, outcome: 'unknown', bytesOut, pending: this.pending.size }, false)
      try {
        this.socket!.send(message)
      } catch (error) {
        this.pending.delete(id)
        clearTimeout(timer)
        this.diagnostics.emit({ event: 'rpc.send_error', level: 'error', phase: 'transport', instanceId: this.currentHost?.instanceId, rpcId: String(id), requestId, method, errorCode: error instanceof HbarError ? error.code : 'SEND_FAILED', outcome: 'failure', bytesOut, pending: this.pending.size }, true)
        reject(error instanceof Error ? error : new Error('RPC send failed'))
      }
    })
  }
  async follow(sessionId: string, cursor: number) {
    this.follows.set(sessionId, cursor)
    const socket = this.socket
    const result = await this.call('session.follow', { sessionId, cursor })
    if (this.socket !== socket || !this.follows.has(sessionId))
      throw new HbarError('DISCONNECTED', 'Follow owner changed')
    if (result.reset) {
      this.dispatch(this.events, { method: 'host.changed', params: { kind: 'resync' } })
      return result
    }
    for (const event of result.events) this.notify({ method: 'session.event', params: event }, true)
    for (const stream of result.streams)
      this.notify({
        method: 'stream.update',
        params: {
          id: stream.id,
          sessionId: stream.sessionId,
          runId: stream.runId,
          operation: 'reset',
          text: stream.text,
          thinking: stream.thinking,
          textOffset: 0,
          thinkingOffset: 0,
          version: stream.version,
        },
      })
    if (result.cursor !== this.follows.get(sessionId))
      this.dispatch(this.events, { method: 'host.changed', params: { kind: 'resync' } })
    return result
  }
  async unfollow(sessionId: string) {
    this.follows.delete(sessionId)
    if (this.socket?.readyState === WebSocket.OPEN) await this.call('session.unfollow', { sessionId })
  }
  async pair(code: string, name: string, signal?: AbortSignal) {
    const response = await fetch(new URL('/auth/pair', this.baseUrl), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name }),
      ...(signal ? { signal } : {}),
    })
    const result = (await response.json()) as { token?: string; error?: string }
    if (!response.ok) throw new Error(result.error ?? 'Pairing failed')
    signal?.throwIfAborted()
    this.imageArtifacts.invalidate()
    this.token = result.token
    this.closed = false
    this.connectPromise = undefined
    return this.connect()
  }
  async upload(file: File, signal?: AbortSignal, options?: AttachmentUploadOptions): Promise<ArtifactRef> {
    signal?.throwIfAborted()
    const owner = options?.owner ? chatDatabaseUploadOwnerSchema.parse(options.owner) : undefined
    const digest = options?.sha256 ?? [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))]
      .map((byte) => byte.toString(16).padStart(2, '0')).join('')
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new HbarError('INVALID_INPUT', 'Attachment content hash is invalid')
    signal?.throwIfAborted()
    const response = await fetch(new URL('/api/artifacts', this.baseUrl), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': file.type,
        'X-Filename': encodeURIComponent(file.name),
        'X-Content-Sha256': digest,
        ...(owner ? { 'X-Artifact-Owner': encodeURIComponent(JSON.stringify(owner)) } : {}),
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: file,
      ...(signal ? { signal } : {}),
    })
    const data: unknown = await response.json()
    signal?.throwIfAborted()
    if (!response.ok)
      throw new HbarError(
        typeof data === 'object' && data && 'code' in data && typeof data.code === 'string'
          ? data.code
          : 'UPLOAD_FAILED',
        typeof data === 'object' && data && 'error' in data && typeof data.error === 'string'
          ? data.error
          : 'Artifact upload failed',
      )
    return artifactSchema.parse(data)
  }
  artifactUrl(id: string) {
    return new URL(`/api/artifacts/${id}`, this.baseUrl).href
  }
  readImageArtifact(ref: ArtifactRef, options?: ImageArtifactReadOptions): Promise<ImageArtifactBytes> {
    return this.imageArtifacts.read(ref, options)
  }
  async readResourceMedia(input: ResourceReadInput, signal: AbortSignal): Promise<Blob> {
    const token = this.token
    const host = this.connectionHost()?.instanceId
    const media = await readResourceMedia(this.baseUrl, token, input, signal)
    if (this.token !== token || this.connectionHost()?.instanceId !== host) throw new HbarError('DISCONNECTED', 'Resource owner changed')
    return media
  }
  disconnect() {
    this.closed = true
    this.rejectConnection?.(new HbarError('DISCONNECTED', 'Connection cancelled'))
    this.rejectConnection = undefined
    this.imageArtifacts.invalidate()
    clearTimeout(this.retryTimer)
    const socket = this.socket
    this.socket = undefined
    socket?.close()
    this.connectPromise = undefined
    this.currentHost = null
    this.rejectPending(new HbarError('DISCONNECTED', 'Connection closed; reconcile using the request id'))
    this.status('disconnected')
  }
  /** Replace trusted transport credentials without replacing the Client or its follow cursors. */
  provideAuthentication(token: string): boolean {
    if (!token || token.length > 4096) throw new HbarError('INVALID_INPUT', 'Invalid connection credentials')
    if (token === this.token) return false
    this.token = token
    this.disconnect()
    return true
  }
  connectionStatus() {
    return this.currentStatus
  }
  connectionHost() {
    return this.currentHost
  }
}
