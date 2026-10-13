import { HbarError } from '@hbar/contracts'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { nodeFloorSchema } from '@hbar/contracts/node'
import type { NodeFloor } from '@hbar/contracts/node'
import type { ResolvedSandboxProfile, SandboxSnapshotRef } from '@hbar/contracts/sandbox'
import { verifySandboxSnapshot } from '@hbar/sandbox'
import {
  NODE_TERMINAL_LIMITS,
  nodeTerminalCloseSchema,
  nodeTerminalInputSchema,
  nodeTerminalOpenSchema,
  nodeTerminalOutputSchema,
  nodeTerminalResizeSchema,
  type NodeTerminalInfo,
  type NodeTerminalScope,
} from '@hbar/contracts/node-terminal'
import { localProcessPermissionPaths, nodeOwnedPath, nodeProtectedPaths } from './paths'
import { createProcessPermissionManifest } from './process-permissions'
import type { NodeProcessReservation } from './process-lifecycle'

export interface NodeTerminalProcess {
  write(data: string): void
  resize(cols: number, rows: number): void
  close(): Promise<void>
}
export interface NodeTerminalBackend {
  readonly backend: 'bwrap' | 'seatbelt'
  readonly available: boolean
  open(input: {
    root: string
    cwd: string
    readableRoots: readonly string[]
    writableRoots: readonly string[]
    protectedPaths: readonly string[]
    readOnlyPaths: readonly string[]
    cols: number
    rows: number
    environment: Readonly<Record<string, string>>
    networkEnabled: boolean
    timeoutMs: number
    onOutput(data: string): void
    onExit(): void
  }): Promise<NodeTerminalProcess>
}
export interface NodeManualTerminalConfirmation {
  readonly operationId: string
  readonly sessionId: string
  readonly ownerDeviceId: string
  readonly rootId: string
  readonly rootPath: string
  readonly snapshotDigest: string
  readonly argumentsDigest: string
  readonly summary: string
}
interface Entry {
  operationId: string
  info: NodeTerminalInfo
  scope: NodeTerminalScope
  process: NodeTerminalProcess
  frames: { seq: number; data: string; bytes: number }[]
  bytes: number
  seq: number
  firstSeq: number
  closed: boolean
  finishPromise: Promise<void> | undefined
  finishActive: () => void
  unregisterLifecycle: (() => void) | undefined
  timer: ReturnType<typeof setTimeout>
  retentionTimer: ReturnType<typeof setTimeout> | undefined
}
const sameScope = (a: NodeTerminalScope, b: NodeTerminalScope) =>
  a.nodeId === b.nodeId && a.rootId === b.rootId && a.sessionId === b.sessionId && a.ownerDeviceId === b.ownerDeviceId
const zOutputCursor = z.strictObject({
  terminalId: z.string().min(1).max(160),
  scope: nodeTerminalCloseSchema.shape.scope,
  afterSeq: z.number().int().min(0),
  creditBytes: z
    .number()
    .int()
    .min(NODE_TERMINAL_LIMITS.outputFrameBytes)
    .max(NODE_TERMINAL_LIMITS.outputFrameBytes * 2),
})

/** Owns B-local PTYs. Manual operator sessions have a fresh operation key and immutable owner scope. */
export class NodeTerminalService {
  private readonly entries = new Map<string, Entry>()
  private readonly openedOperations = new Map<string, { terminalId: string; requestJSON: string }>()
  private readonly snapshots = new Map<string, ResolvedSandboxProfile>()
  private linkTimer: ReturnType<typeof setTimeout> | undefined
  constructor(
    private readonly nodeId: string,
    private readonly dataRoot: string,
    private readonly getFloor: () => NodeFloor,
    private readonly backend: NodeTerminalBackend,
    private readonly isPaused: () => boolean = () => false,
    private readonly confirm?: (input: NodeManualTerminalConfirmation) => Promise<void>,
    private readonly lifecycle?: {
      reserveProcess(operationId: string): NodeProcessReservation
      assertProcessAvailable(): void
    },
  ) {}

  async open(value: unknown): Promise<NodeTerminalInfo> {
    const request = nodeTerminalOpenSchema.parse(value)
    if (request.scope.nodeId !== this.nodeId)
      throw new HbarError('NODE_TERMINAL_SCOPE', 'Terminal request targets another node')
    if (this.isPaused()) throw new HbarError('NODE_PAUSED', 'Workspace node is paused locally')
    const requestJSON = JSON.stringify(request)
    const prior = this.openedOperations.get(request.operationId)
    if (prior) {
      const existing = this.entries.get(prior.terminalId)
      if (existing && prior.requestJSON === requestJSON) return existing.info
      throw new HbarError('IDEMPOTENCY_CONFLICT', 'Terminal operation key was already used')
    }
    const floor = nodeFloorSchema.parse(this.getFloor())
    if (!floor.terminal || !floor.process)
      throw new HbarError('NODE_DENIED', 'The node floor disables terminal or process access')
    if (!this.lifecycle)
      throw new HbarError('NODE_PROCESS_LIFECYCLE_UNAVAILABLE', 'Terminal process lifecycle is unavailable')
    if (!this.backend.available)
      throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', 'A confined PTY backend is unavailable')
    if (floor.backend !== 'auto' && floor.backend !== this.backend.backend)
      throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', 'The terminal backend does not match the current node floor')
    const activeCount = [...this.entries.values()].filter((entry) => !entry.closed).length
    if (activeCount >= NODE_TERMINAL_LIMITS.maxSessions) throw new HbarError('NODE_BUSY', 'Terminal capacity reached')
    while (this.entries.size >= NODE_TERMINAL_LIMITS.maxRetainedSessions) {
      const retained = [...this.entries].find(([, entry]) => entry.closed)
      if (!retained) throw new HbarError('NODE_BUSY', 'Terminal retention capacity reached')
      clearTimeout(retained[1].retentionTimer)
      this.entries.delete(retained[0])
    }
    const reservation = this.lifecycle.reserveProcess(request.operationId)
    try {
      reservation.signal.throwIfAborted()
      const target = await nodeOwnedPath(floor, this.dataRoot, request.scope.rootId, request.cwd)
      reservation.signal.throwIfAborted()
      const confirmationRequired =
        floor.localConfirm === 'always' ||
        floor.localConfirm === 'process' ||
        (floor.localConfirm === 'write' && target.registration.access === 'write')
      if (confirmationRequired && !this.confirm)
        throw new HbarError('NODE_LOCAL_CONFIRMATION_REQUIRED', 'The node floor requires local process confirmation')
      const profile = this.profile(request.sandbox)
      const manifest = await createProcessPermissionManifest({
        root: target.root,
        cwd: target.path,
        registrationAccess: target.registration.access,
        profile,
        floorProtectedPaths: nodeProtectedPaths(floor, this.dataRoot),
        paths: localProcessPermissionPaths,
      })
      reservation.signal.throwIfAborted()
      if (confirmationRequired) {
        const argumentsDigest = createHash('sha256')
          .update(
            JSON.stringify({
              operationId: request.operationId,
              scope: request.scope,
              rootId: request.scope.rootId,
              rootPath: target.root,
              cwd: request.cwd,
              cols: request.cols,
              rows: request.rows,
              snapshotDigest: request.sandbox.digest,
            }),
          )
          .digest('hex')
        await this.confirm!({
          operationId: request.operationId,
          sessionId: request.scope.sessionId,
          ownerDeviceId: request.scope.ownerDeviceId,
          rootId: request.scope.rootId,
          rootPath: target.root,
          snapshotDigest: request.sandbox.digest,
          argumentsDigest,
          summary: `Open an interactive terminal in ${request.cwd}`,
        })
        reservation.signal.throwIfAborted()
      }
      this.lifecycle.assertProcessAvailable()
      const id = crypto.randomUUID()
      let entry: Entry | undefined
      let exitedBeforeRegistration = false
      const process = await this.backend.open({
        cwd: target.path,
        root: target.root,
        readableRoots: manifest.readableRoots,
        writableRoots: manifest.writableRoots,
        protectedPaths: manifest.protectedPaths,
        readOnlyPaths: manifest.readOnlyPaths,
        cols: request.cols,
        rows: request.rows,
        environment: this.environment(floor, profile.environment.set),
        networkEnabled: floor.network && profile.network.enabled,
        timeoutMs: floor.maxTimeoutMs,
        onOutput: (data) => {
          if (entry) this.append(entry, data)
        },
        onExit: () => {
          if (entry)
            void this.finish(entry).catch((error: unknown) =>
              console.error('[hbar] terminal exit cleanup failed', error),
            )
          else exitedBeforeRegistration = true
        },
      })
      const startedAt = new Date().toISOString()
      const info: NodeTerminalInfo = {
        terminalId: id,
        scope: request.scope,
        cwd: request.cwd,
        cols: request.cols,
        rows: request.rows,
        startedAt,
        backend: this.backend.backend,
      }
      const timer = setTimeout(() => {
        void this.close({ terminalId: id, scope: request.scope }).catch(() => undefined)
      }, floor.maxTimeoutMs)
      entry = {
        operationId: request.operationId,
        info,
        scope: request.scope,
        process,
        frames: [],
        bytes: 0,
        seq: 0,
        firstSeq: 1,
        closed: false,
        finishPromise: undefined,
        finishActive: () => undefined,
        unregisterLifecycle: undefined,
        timer,
        retentionTimer: undefined,
      }
      this.entries.set(id, entry)
      const activeEntry = entry
      let finishActive!: () => void
      const finished = new Promise<void>((resolve) => {
        finishActive = resolve
      })
      entry.finishActive = finishActive
      try {
        entry.unregisterLifecycle = reservation.activate({
          controller: reservation.controller,
          finished,
          cancel: () => this.finish(activeEntry),
        })
      } catch (error) {
        this.entries.delete(id)
        clearTimeout(timer)
        await process.close()
        finishActive()
        throw error
      }
      this.openedOperations.set(request.operationId, { terminalId: id, requestJSON })
      while (this.openedOperations.size > 256)
        this.openedOperations.delete(this.openedOperations.keys().next().value ?? '')
      if (exitedBeforeRegistration) await this.finish(activeEntry)
      return info
    } catch (error) {
      reservation.release()
      throw error
    }
  }
  private profile(ref: SandboxSnapshotRef): ResolvedSandboxProfile {
    const value = this.snapshots.get(ref.digest)
    if (!value || value.profileId !== ref.profileId)
      throw new HbarError('SANDBOX_SNAPSHOT_NOT_FOUND', 'The node has no verified snapshot for this terminal')
    return value
  }

  putSnapshot(ref: SandboxSnapshotRef, value: unknown): void {
    const profile = verifySandboxSnapshot(ref, value)
    this.snapshots.delete(ref.digest)
    this.snapshots.set(ref.digest, profile)
    while (this.snapshots.size > 64) this.snapshots.delete(this.snapshots.keys().next().value ?? '')
  }

  private environment(floor: NodeFloor, snapshot: Readonly<Record<string, string>>): Record<string, string> {
    const result: Record<string, string> = { TERM: 'xterm-256color', COLORTERM: 'truecolor' }
    for (const name of floor.environmentAllowlist) {
      if (/^(PATH|PATHEXT|LD_PRELOAD|LD_LIBRARY_PATH|DYLD_.*|BASH_ENV|ENV|NODE_OPTIONS)$/i.test(name)) continue
      const value = process.env[name]
      if (value !== undefined) result[name] = value
    }
    for (const [name, value] of Object.entries(snapshot))
      if (
        floor.environmentAllowlist.includes(name) &&
        !/^(PATH|PATHEXT|LD_PRELOAD|LD_LIBRARY_PATH|DYLD_.*|BASH_ENV|ENV|NODE_OPTIONS)$/i.test(name)
      )
        result[name] = value
    if (process.env.PATH) result.PATH = process.env.PATH
    return result
  }
  private append(entry: Entry, input: string): void {
    // Split by UTF-8 bytes, preserving scalar boundaries; each serialized output frame stays bounded.
    let part = ''
    let bytes = 0
    for (const char of input) {
      const size = Buffer.byteLength(char)
      if (bytes + size > NODE_TERMINAL_LIMITS.outputFrameBytes) {
        this.storeFrame(entry, part, bytes)
        part = ''
        bytes = 0
      }
      part += char
      bytes += size
    }
    if (part) this.storeFrame(entry, part, bytes)
  }
  private storeFrame(entry: Entry, data: string, bytes: number): void {
    entry.frames.push({ seq: ++entry.seq, data, bytes })
    entry.bytes += bytes
    while (entry.bytes > NODE_TERMINAL_LIMITS.outputRingBytes) {
      const removed = entry.frames.shift()
      if (!removed) break
      entry.bytes -= removed.bytes
      entry.firstSeq = removed.seq + 1
    }
  }
  private release(entry: Entry): void {
    if (entry.closed) return
    entry.closed = true
    clearTimeout(entry.timer)
    entry.retentionTimer = setTimeout(() => {
      if (this.entries.get(entry.info.terminalId) === entry) this.entries.delete(entry.info.terminalId)
    }, 120_000)
  }
  private finish(entry: Entry): Promise<void> {
    if (entry.finishPromise) return entry.finishPromise
    entry.finishPromise = (async () => {
      this.release(entry)
      try {
        await entry.process.close()
      } finally {
        entry.unregisterLifecycle?.()
        entry.unregisterLifecycle = undefined
        entry.finishActive()
      }
    })()
    return entry.finishPromise
  }
  private owned(id: string, scope: NodeTerminalScope): Entry {
    const entry = this.entries.get(id)
    if (!entry || !sameScope(entry.scope, scope))
      throw new HbarError('NODE_TERMINAL_SCOPE', 'Terminal is unavailable for this owner scope')
    return entry
  }
  input(value: unknown): { accepted: true } {
    const request = nodeTerminalInputSchema.parse(value)
    const entry = this.owned(request.terminalId, request.scope)
    if (entry.closed) throw new HbarError('NODE_TERMINAL_CLOSED', 'Terminal has exited')
    entry.process.write(request.data)
    return { accepted: true }
  }
  resize(value: unknown): { accepted: true } {
    const request = nodeTerminalResizeSchema.parse(value)
    const entry = this.owned(request.terminalId, request.scope)
    if (entry.closed) throw new HbarError('NODE_TERMINAL_CLOSED', 'Terminal has exited')
    entry.process.resize(request.cols, request.rows)
    entry.info.cols = request.cols
    entry.info.rows = request.rows
    return { accepted: true }
  }
  output(value: unknown) {
    const requestData = zOutputCursor.parse(value)
    const { afterSeq, terminalId, scope, creditBytes } = requestData
    const entry = this.owned(terminalId, scope)
    const cursorAhead = afterSeq > entry.seq
    const reset = cursorAhead || afterSeq + 1 < entry.firstSeq
    const candidates = cursorAhead ? entry.frames : entry.frames.filter((frame) => frame.seq > afterSeq)
    const frames: { seq: number; data: string }[] = []
    let frameBytes = 0
    if (!reset || cursorAhead) {
      for (const frame of candidates) {
        if (frames.length === 32 || frameBytes + frame.bytes > creditBytes) break
        frames.push({ seq: frame.seq, data: frame.data })
        frameBytes += frame.bytes
      }
    }
    return nodeTerminalOutputSchema.parse({
      terminalId,
      afterSeq,
      nextSeq: frames.at(-1)?.seq ?? (cursorAhead ? entry.seq : reset ? entry.firstSeq - 1 : afterSeq),
      reset,
      closed: entry.closed,
      frames,
    })
  }
  async close(value: unknown): Promise<{ closed: boolean }> {
    const request = nodeTerminalCloseSchema.parse(value)
    const entry = this.entries.get(request.terminalId)
    if (!entry) return { closed: false }
    if (!sameScope(entry.scope, request.scope))
      throw new HbarError('NODE_TERMINAL_SCOPE', 'Terminal is unavailable for this owner scope')
    await this.finish(entry)
    return { closed: true }
  }
  running(): readonly string[] {
    return [...this.entries.values()].filter((entry) => !entry.closed).map((entry) => entry.operationId)
  }
  async cancel(operationId: string): Promise<boolean> {
    const opened = this.openedOperations.get(operationId)
    if (!opened) return false
    const entry = this.entries.get(opened.terminalId)
    if (!entry || entry.closed) return false
    await this.close({ terminalId: entry.info.terminalId, scope: entry.scope })
    return true
  }
  linkLost(): void {
    const floor = nodeFloorSchema.parse(this.getFloor())
    if (floor.onLinkLost.action === 'continue' || this.linkTimer) return
    this.linkTimer = setTimeout(() => {
      this.linkTimer = undefined
      void Promise.all(
        [...this.entries.values()]
          .filter((entry) => !entry.closed)
          .map((entry) => this.close({ terminalId: entry.info.terminalId, scope: entry.scope })),
      ).catch(() => console.error('[hbar] terminal link-loss cleanup failed'))
    }, floor.onLinkLost.graceMs)
  }
  linkRestored(): void {
    if (this.linkTimer) clearTimeout(this.linkTimer)
    this.linkTimer = undefined
  }
  async pause(): Promise<void> {
    await Promise.all(
      [...this.entries.values()]
        .filter((entry) => !entry.closed)
        .map((entry) => this.close({ terminalId: entry.info.terminalId, scope: entry.scope })),
    )
  }
  async dispose(): Promise<void> {
    this.linkRestored()
    await Promise.all(
      [...this.entries.values()].map(async (entry) => {
        if (entry.retentionTimer) clearTimeout(entry.retentionTimer)
        await this.finish(entry)
      }),
    )
    this.entries.clear()
    this.openedOperations.clear()
    this.snapshots.clear()
  }
}
