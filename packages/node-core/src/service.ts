import { createHash } from 'node:crypto'
import { HbarError } from '@hbar/contracts'
import { z } from 'zod'
import type { ExecutionProvider, OsConfinementOptions } from '@hbar/plugin-sdk'
import {
  NODE_PROTOCOL_VERSION,
  NODE_LIMITS,
  nodeFloorSchema,
  nodeCapabilitiesSchema,
  nodeExecStartSchema,
  nodeExecResultSchema,
  type NodeFloor,
  type NodeCapabilities,
  type NodeExecStart,
  type NodeReceipt,
  type NodeCallAuthority,
  type NodeExecResult,
} from '@hbar/contracts/node'
import type { NodeStatePort } from '@hbar/contracts/node-state'
import type { ResolvedSandboxProfile, SandboxSnapshotRef } from '@hbar/contracts/sandbox'
import type { ParsedWorkspaceSearchInput, ParsedWorkspaceFindInput } from '@hbar/contracts/workspace-query'
import type { ToolFileChange } from '@hbar/contracts/run-file-changes'
import {
  canonicalSandboxJSON,
  evaluateSandboxCall,
  verifySandboxSnapshot,
  SANDBOX_EVALUATOR_FINGERPRINT,
} from '@hbar/sandbox'
import {
  nodeOwnedPath,
  localNodePaths,
  localProcessPermissionPaths,
  validateNodeRoots,
  nodeProtectedPaths,
} from './paths'
import { createProcessPermissionManifest } from './process-permissions'
import type { NodeExecutionBackend } from './execution-backend'
export type { NodeExecutionBackend, NodeExecutionBackendOptions, NodeArgvResult } from './execution-backend'

const dangerousEnvironment = /^(?:PATH|PATHEXT|LD_PRELOAD|LD_LIBRARY_PATH|DYLD_.*|BASH_ENV|ENV|NODE_OPTIONS)$/i
const digestOf = (value: unknown) => createHash('sha256').update(canonicalSandboxJSON(value)).digest('hex')
function outputTail(text: string): string {
  const bytes = Buffer.from(text)
  let start = Math.max(0, bytes.length - NODE_LIMITS.outputBytes)
  while (start < bytes.length && ((bytes[start] ?? 0) & 0xc0) === 0x80) start++
  return bytes.subarray(start).toString('utf8')
}
export class WorkspaceNodeService {
  private floor: NodeFloor
  private floorRevision: number
  private paused = false
  private disposed = false
  private starting = 0
  private changingPolicy = false
  private readonly snapshots = new Map<string, ResolvedSandboxProfile>()
  private readonly active = new Map<string, { controller: AbortController; finished: Promise<void> }>()
  private readonly locks = new Map<string, Promise<void>>()
  private readonly pendingCancellations = new Map<string, number>()
  private linkTimer: ReturnType<typeof setTimeout> | undefined
  private linkExpired = false
  private closing: Promise<void> | undefined
  private readonly completions = new Set<Promise<void>>()
  private readonly policyListeners = new Set<() => void>()
  constructor(
    readonly id: string,
    readonly dataRoot: string,
    private readonly state: NodeStatePort,
    private readonly execution: ExecutionProvider,
    floor: NodeFloor,
    floorRevision: number,
    private readonly backend: NodeExecutionBackend,
  ) {
    this.floor = nodeFloorSchema.parse(floor)
    this.floorRevision = floorRevision
  }
  static async open(
    id: string,
    dataRoot: string,
    state: NodeStatePort,
    execution: ExecutionProvider,
    backend: NodeExecutionBackend,
  ) {
    await state.call('ready', {})
    let snapshot = await state.call('floor.snapshot', {})
    if (!snapshot) {
      await state.call('floor.set', nodeFloorSchema.parse({ roots: [] }))
      snapshot = await state.call('floor.snapshot', {})
    }
    const floor = snapshot.floor ?? nodeFloorSchema.parse({ roots: [] })
    if (!snapshot.floor) {
      await state.call('floor.set', floor)
      snapshot = await state.call('floor.snapshot', {})
    }
    const node = new WorkspaceNodeService(
      id,
      dataRoot,
      state,
      execution,
      await validateNodeRoots(floor, dataRoot),
      snapshot.revision,
      backend,
    )
    node.paused = (await state.call('config.get', { key: 'paused' })) === true
    return node
  }
  get policy(): NodeFloor {
    return nodeFloorSchema.parse(this.floor)
  }
  get running(): string[] {
    return [...this.active.keys()]
  }
  async setPolicy(value: unknown): Promise<NodeFloor> {
    const result = await this.updatePolicy(value, this.floorRevision)
    return result.floor
  }
  async updatePolicy(value: unknown, expectedRevision: number): Promise<{ floor: NodeFloor; revision: number }> {
    if (this.active.size || this.starting || this.locks.size || this.changingPolicy)
      throw new HbarError('NODE_BUSY', 'Stop active operations before changing the floor')
    this.changingPolicy = true
    try {
      const floor = await validateNodeRoots(nodeFloorSchema.parse(value), this.dataRoot, true)
      const updated = await this.state.call('floor.update', { floor, expectedRevision })
      this.floor = updated.floor
      this.floorRevision = updated.revision
      for (const listener of this.policyListeners) {
        try {
          listener()
        } catch {
          /* A notification observer cannot roll back the persisted floor. */
        }
      }
      return { floor: this.policy, revision: this.floorRevision }
    } finally {
      this.changingPolicy = false
    }
  }
  get isPaused(): boolean {
    return this.paused
  }
  onPolicyChanged(listener: () => void): () => void {
    this.policyListeners.add(listener)
    return () => this.policyListeners.delete(listener)
  }
  capabilities(): NodeCapabilities {
    const { roots, protectedPaths: _paths, environmentAllowlist: _env, ...floor } = this.floor
    return nodeCapabilitiesSchema.parse({
      protocol: NODE_PROTOCOL_VERSION,
      nodeId: this.id,
      platform: process.platform,
      evaluator: SANDBOX_EVALUATOR_FINGERPRINT,
      roots: roots.map(({ path, ...root }) => ({ ...root, nodePath: path })),
      sandbox: {
        backends: [this.backend.name],
        filesystem: this.backend.filesystem ? 'enforced' : 'none',
        network: this.backend.network ? 'enforced' : 'none',
      },
      floor,
    })
  }
  putSnapshot(ref: SandboxSnapshotRef, value: unknown): void {
    const profile = verifySandboxSnapshot(ref, value)
    this.snapshots.delete(ref.digest)
    this.snapshots.set(ref.digest, profile)
    while (this.snapshots.size > 64) this.snapshots.delete(this.snapshots.keys().next().value ?? '')
  }
  private profile(authority: NodeCallAuthority): ResolvedSandboxProfile | null {
    if (!authority.sandbox) return null
    const profile = this.snapshots.get(authority.sandbox.digest)
    if (!profile || profile.profileId !== authority.sandbox.profileId)
      throw new HbarError('SANDBOX_SNAPSHOT_NOT_FOUND', 'The node has no verified snapshot for this call')
    return profile
  }
  private available(): void {
    if (this.disposed) throw new HbarError('NODE_OFFLINE', 'Workspace node is closed')
    if (this.linkExpired) throw new HbarError('NODE_OFFLINE', 'Owning node link exceeded its loss grace period')
    if (this.paused) throw new HbarError('NODE_PAUSED', 'Workspace node is paused locally')
    if (this.changingPolicy) throw new HbarError('NODE_BUSY', 'Node floor is being changed locally')
  }
  private availableToStart(operationId: string): void {
    this.available()
    if (this.pendingCancellations.has(operationId))
      throw new HbarError('CANCELLED', 'Execution was cancelled before process launch')
  }
  async canonicalize(rootId: string, paths: readonly string[]) {
    this.available()
    const result: string[] = []
    let root = ''
    for (const requested of paths) {
      const checked = await nodeOwnedPath(this.floor, this.dataRoot, rootId, requested)
      root = checked.root
      result.push(checked.path)
    }
    return {
      root,
      paths: result,
      dialect: process.platform === 'win32' ? ('win32' as const) : ('posix' as const),
      caseInsensitive: localNodePaths.caseInsensitive,
    }
  }
  async checkFile(rootId: string, path: string, authority: NodeCallAuthority, writing = false): Promise<string> {
    this.available()
    const target = await nodeOwnedPath(this.floor, this.dataRoot, rootId, path, writing)
    const profile = this.profile(authority)
    if (profile) {
      const verdict = await evaluateSandboxCall(
        profile,
        {
          workspace: target.root,
          tool: {
            name: writing ? 'write_file' : 'read_file',
            effect: writing ? 'write' : 'read',
            workspaceAccess: { kind: 'paths', arguments: [{ field: 'path', access: writing ? 'write' : 'read' }] },
          },
          args: { path },
        },
        localNodePaths,
      )
      if (verdict.decision === 'deny' || (verdict.decision === 'ask' && authority.admission.kind !== 'approved'))
        throw new HbarError('NODE_DENIED', 'Node sandbox reevaluation refused the file operation')
    }
    if (writing && ['always', 'write'].includes(this.floor.localConfirm))
      throw new HbarError('NODE_LOCAL_CONFIRMATION_REQUIRED', 'The floor requires a local confirmation')
    return target.root
  }
  async list(rootId: string, path: string, authority: NodeCallAuthority) {
    const root = await this.checkFile(rootId, path, authority)
    const entries = await this.execution.list(root, path)
    const safe: typeof entries = []
    for (const entry of entries) {
      try {
        await this.checkFile(rootId, entry.path, authority)
        safe.push(entry)
      } catch (error) {
        if (!(error instanceof HbarError) || error.code !== 'NODE_DENIED') throw error
      }
    }
    return safe
  }
  async read(rootId: string, path: string, authority: NodeCallAuthority): Promise<Uint8Array> {
    const data = await this.execution.readBytes(await this.checkFile(rootId, path, authority), path)
    await this.checkFile(rootId, path, authority)
    return data
  }
  async fileVersion(rootId: string, operationId: string, version: 'before' | 'after'): Promise<Uint8Array> {
    const operation = await this.state.call('operation.get', { operationId })
    if (
      !operation?.versions ||
      !operation.target ||
      operation.target.rootId !== rootId ||
      !operation.target.nodePath ||
      this.floor.roots.find((root) => root.rootId === rootId)?.path !== operation.target.nodePath
    )
      throw new HbarError('NODE_RECEIPT_SCOPE', 'The file receipt has no verified target in this root')
    await this.checkFile(rootId, operation.target.path, operation.authority)
    return Buffer.from(operation.versions[version])
  }
  async search(rootId: string, query: ParsedWorkspaceSearchInput, authority: NodeCallAuthority, signal: AbortSignal) {
    const root = await this.checkFile(rootId, query.path, authority)
    if (!this.execution.workspaceQuery) throw new HbarError('QUERY_UNAVAILABLE', 'Node search backend unavailable')
    const result = await this.execution.workspaceQuery.search(root, query, signal)
    const matches: typeof result.matches = []
    for (const match of result.matches) {
      try {
        await this.checkFile(rootId, match.path, authority)
        matches.push(match)
      } catch (error) {
        if (!(error instanceof HbarError) || error.code !== 'NODE_DENIED') throw error
      }
    }
    // Counts in a filtered page cannot reveal matches outside this authority.
    if (matches.length !== result.matches.length) {
      const { pagination: _pagination, ...visible } = result
      return {
        ...visible,
        matches,
        truncated: true,
        filesChecked: 0,
        cache: { contentHits: 0, contentMisses: 0, matchHits: 0, matchMisses: 0, bytesRead: 0 },
      }
    }
    return { ...result, matches }
  }
  async find(rootId: string, query: ParsedWorkspaceFindInput, authority: NodeCallAuthority, signal: AbortSignal) {
    const root = await this.checkFile(rootId, query.path, authority)
    if (!this.execution.workspaceQuery) throw new HbarError('QUERY_UNAVAILABLE', 'Node search backend unavailable')
    const result = await this.execution.workspaceQuery.find(root, query, signal)
    const paths: string[] = []
    for (const path of result.paths) {
      try {
        await this.checkFile(rootId, path, authority)
        paths.push(path)
      } catch (error) {
        if (!(error instanceof HbarError) || error.code !== 'NODE_DENIED') throw error
      }
    }
    return { ...result, paths, truncated: result.truncated || paths.length !== result.paths.length }
  }
  async readRange(
    rootId: string,
    path: string,
    authority: NodeCallAuthority,
    startLine: number,
    lineCount: number,
    signal: AbortSignal,
  ) {
    const root = await this.checkFile(rootId, path, authority)
    if (!this.execution.workspaceQuery) throw new HbarError('QUERY_UNAVAILABLE', 'Node ranged reads unavailable')
    const data = await this.execution.workspaceQuery.readRange(root, path, startLine, lineCount, signal)
    await this.checkFile(rootId, path, authority)
    return data
  }
  async invalidate(rootId: string, path: string) {
    this.available()
    const target = await nodeOwnedPath(this.floor, this.dataRoot, rootId, path)
    await this.execution.workspaceQuery?.invalidate(target.root, path)
  }
  private async serial<Value>(id: string, action: () => Promise<Value>): Promise<Value> {
    const prior = this.locks.get(id) ?? Promise.resolve()
    let unlock: (() => void) | undefined
    const next = new Promise<void>((resolve) => {
      unlock = resolve
    })
    this.locks.set(id, next)
    await prior
    try {
      return await action()
    } finally {
      unlock?.()
      if (this.locks.get(id) === next) this.locks.delete(id)
    }
  }
  private result(error: unknown, started: boolean): NodeExecResult {
    return {
      text: outputTail(error instanceof Error ? error.message : 'Node execution failed'),
      isError: true,
      details: {
        code: error instanceof HbarError ? error.code : 'NODE_EXECUTION_FAILED',
        exitCode: null,
        executionStarted: started,
        truncated: false,
        backend: this.backend.name,
      },
    }
  }
  private async audit(request: NodeExecStart, result: NodeExecResult): Promise<void> {
    await this.state.call('audit.append', {
      operationId: request.operationId,
      sessionId: request.sessionId,
      runId: request.runId,
      callId: request.callId,
      tool: 'shell',
      argumentsDigest: digestOf(request),
      decision: result.details.executionStarted ? 'allow' : 'deny',
      admission: request.admission,
      backend: this.backend.name,
      code: result.details.code,
    })
  }
  async start(value: unknown, transportSignal?: AbortSignal): Promise<NodeReceipt> {
    transportSignal?.throwIfAborted()
    const request = nodeExecStartSchema.parse(value)
    return this.serial(request.operationId, async () => {
      // A disconnected peer can be waiting behind another request for this id.
      // Fence it before any durable acceptance when its transport has closed.
      transportSignal?.throwIfAborted()
      const prior = await this.state.call('operation.get', { operationId: request.operationId })
      transportSignal?.throwIfAborted()
      const argumentsDigest = digestOf(request)
      if (prior) {
        if (prior.argumentsDigest !== argumentsDigest)
          throw new HbarError('IDEMPOTENCY_CONFLICT', 'Execution key has different parameters')
        return prior.receipt
      }
      this.available()
      if (this.active.size + this.starting >= this.floor.maxConcurrentProcesses)
        throw new HbarError('NODE_BUSY', 'Node process capacity reached')
      this.starting++
      try {
        transportSignal?.throwIfAborted()
        const accepted = await this.state.call('operation.accept', {
          operationId: request.operationId,
          argumentsDigest,
          kind: 'exec',
          target: { rootId: request.rootId, path: request.cwd },
          authority: {
            sessionId: request.sessionId,
            runId: request.runId,
            callId: request.callId,
            sandbox: request.sandbox,
            admission: request.admission,
          },
        })
        if (!accepted.accepted) return accepted.operation.receipt
        try {
          // From acceptance until durable start, cancellation settles a no-start receipt.
          // Once started, transport loss belongs to the independent process controller.
          transportSignal?.throwIfAborted()
          if (!this.floor.process) throw new HbarError('NODE_DENIED', 'Processes are disabled by the node floor')
          if (['always', 'process'].includes(this.floor.localConfirm))
            throw new HbarError(
              'NODE_LOCAL_CONFIRMATION_REQUIRED',
              'The node floor requires local process confirmation',
            )
          const target = await nodeOwnedPath(this.floor, this.dataRoot, request.rootId, request.cwd)
          transportSignal?.throwIfAborted()
          const profile = this.profile(request)
          if (profile) {
            const verdict = await evaluateSandboxCall(
              profile,
              {
                workspace: target.root,
                tool: {
                  name: 'shell',
                  effect: 'process',
                  commandArgument: 'command',
                  workspaceAccess: { kind: 'workspace' },
                },
                args: { command: request.command },
              },
              localNodePaths,
            )
            if (verdict.decision === 'deny' || (verdict.decision === 'ask' && request.admission.kind !== 'approved'))
              throw new HbarError('NODE_DENIED', 'Node sandbox reevaluation refused the command')
          }
          const network = this.floor.network && (profile?.network.enabled ?? true)
          const requireConfinement =
            this.floor.osConfinement === 'required' ||
            !!profile?.osConfinement?.enabled ||
            target.registration.access === 'read' ||
            !network ||
            nodeProtectedPaths(this.floor, this.dataRoot).length > 0
          if (
            (requireConfinement && !this.backend.filesystem) ||
            (!network && !this.backend.network) ||
            !this.backend.processTree
          )
            throw new HbarError(
              'NODE_CONFINEMENT_UNAVAILABLE',
              'The node cannot enforce the requested filesystem, network or process-tree isolation',
            )
          const environment = profile?.environment.set ?? {}
          if (Object.keys(environment).some((name) => dangerousEnvironment.test(name)))
            throw new HbarError('NODE_DENIED', 'The snapshot contains an unsafe process environment variable')
          const manifest = await createProcessPermissionManifest({
            root: target.root,
            cwd: target.path,
            registrationAccess: target.registration.access,
            profile,
            floorProtectedPaths: nodeProtectedPaths(this.floor, this.dataRoot),
            paths: localProcessPermissionPaths,
          })
          const confinement: OsConfinementOptions | null =
            requireConfinement || (this.floor.osConfinement === 'preferred' && this.backend.filesystem)
              ? {
                  level: 'elevated',
                  readableRoots: [...manifest.readableRoots],
                  writableRoots: [...manifest.writableRoots],
                  networkEnabled: network,
                  envOverrides: environment,
                }
              : null
          const controller = new AbortController()
          this.availableToStart(request.operationId)
          transportSignal?.throwIfAborted()
          const started = await this.state.call('operation.start', { operationId: request.operationId })
          if (started.receipt.state !== 'started') return started.receipt
          this.availableToStart(request.operationId)
          transportSignal?.throwIfAborted()
          const timeoutMs = Math.min(request.timeoutMs, this.floor.maxTimeoutMs)
          const finished = Promise.resolve()
            .then(async () => {
              let result: NodeExecResult
              try {
                this.availableToStart(request.operationId)
                controller.signal.throwIfAborted()
                const execution = await this.backend.exec(target.path, request.command, controller.signal, {
                  timeoutMs,
                  environment,
                  confinement,
                  protectedPaths: [...manifest.protectedPaths],
                  readOnlyPaths: [...manifest.readOnlyPaths],
                  environmentAllowlist: this.floor.environmentAllowlist,
                })
                const details = z
                  .object({
                    code: z.union([z.string(), z.number(), z.null()]).optional(),
                    exitCode: z.number().nullable().optional(),
                    truncated: z.boolean().optional(),
                  })
                  .parse(execution.details ?? {})
                const text = outputTail(execution.text)
                result = nodeExecResultSchema.parse({
                  text,
                  isError: !!execution.isError,
                  details: {
                    code: details.code ?? null,
                    exitCode: details.exitCode ?? (typeof details.code === 'number' ? details.code : null),
                    truncated: !!details.truncated || text.length !== execution.text.length,
                    executionStarted: true,
                    backend: this.backend.name,
                    timeoutMs,
                  },
                })
              } catch (error) {
                if (error instanceof HbarError && error.code === 'EFFECT_UNKNOWN') {
                  await this.state.call('operation.lost', { operationId: request.operationId, reason: 'unknown' })
                  return
                }
                result = this.result(error, true)
              }
              await this.state.call('operation.settle', { operationId: request.operationId, result })
              await this.audit(request, result)
            })
            .finally(() => {
              this.active.delete(request.operationId)
              this.completions.delete(finished)
            })
          this.active.set(request.operationId, { controller, finished })
          this.completions.add(finished)
          finished.catch(() => {
            this.paused = true
          })
          return started.receipt
        } catch (error) {
          const result = this.result(error, false)
          const settled = await this.state.call('operation.settle', { operationId: request.operationId, result })
          await this.audit(request, result)
          return settled.receipt
        }
      } finally {
        this.starting--
      }
    })
  }

  async write(
    rootId: string,
    path: string,
    text: string,
    operationId: string,
    authority: NodeCallAuthority,
    expectedRevision?: string,
  ) {
    if (Buffer.byteLength(text) > NODE_LIMITS.fileBytes)
      throw new HbarError('LIMIT_EXCEEDED', 'Node file write exceeds its limit')
    return this.serial(operationId, async () => {
      const argumentsDigest = digestOf({ rootId, path, text, authority, expectedRevision })
      const prior = await this.state.call('operation.get', { operationId })
      if (prior) {
        if (prior.argumentsDigest !== argumentsDigest)
          throw new HbarError('IDEMPOTENCY_CONFLICT', 'File operation key has different parameters')
        if (prior.versions) {
          if (
            !prior.target?.nodePath ||
            this.floor.roots.find((root) => root.rootId === rootId)?.path !== prior.target.nodePath
          )
            throw new HbarError('NODE_RECEIPT_SCOPE', 'The file receipt belongs to a different shared root location')
          await this.checkFile(rootId, path, authority, true)
          return prior.versions
        }
        if (prior.receipt.state === 'settled' && prior.receipt.result.isError)
          throw new HbarError(
            String(prior.receipt.result.details.code ?? 'NODE_WRITE_FAILED'),
            prior.receipt.result.text,
          )
        throw new HbarError('EFFECT_UNKNOWN', 'The prior file write has no verified versions; do not replay it')
      }
      const root = await this.checkFile(rootId, path, authority, true)
      await this.state.call('operation.accept', {
        operationId,
        argumentsDigest,
        kind: 'write',
        authority,
        target: { rootId, path, nodePath: root },
      })
      await this.state.call('operation.start', { operationId })
      try {
        this.available()
        const versions = await this.execution.write(root, path, text, {
          ...(expectedRevision ? { expectedRevision } : {}),
        })
        const stored = {
          before: versions.before,
          after: versions.after,
          path: versions.path,
          revision: versions.revision,
          created: !!versions.created,
        }
        await this.state.call('operation.settle', {
          operationId,
          versions: stored,
          result: {
            text: '',
            isError: false,
            details: { code: 0, exitCode: 0, executionStarted: true, truncated: false, backend: 'none' },
          },
        })
        await this.state.call('audit.append', {
          operationId,
          sessionId: authority.sessionId,
          runId: authority.runId,
          callId: authority.callId,
          tool: 'write_file',
          argumentsDigest,
          decision: 'allow',
          admission: authority.admission,
          backend: 'none',
          code: 0,
        })
        return stored
      } catch (error) {
        await this.state.call('operation.settle', { operationId, result: this.result(error, true) })
        throw error
      }
    })
  }
  async receipt(operationId: string): Promise<NodeReceipt> {
    return (await this.state.call('operation.get', { operationId }))?.receipt ?? { state: 'absent' }
  }
  async restore(
    rootId: string,
    operationId: string,
    authority: NodeCallAuthority,
    changes: readonly ToolFileChange[],
    signal: AbortSignal,
  ): Promise<void> {
    return this.serial(operationId, async () => {
      const argumentsDigest = digestOf({ rootId, authority, changes })
      const prior = await this.state.call('operation.get', { operationId })
      if (prior) {
        if (prior.argumentsDigest !== argumentsDigest)
          throw new HbarError('IDEMPOTENCY_CONFLICT', 'Restore key has different parameters')
        if (prior.receipt.state !== 'settled') throw new HbarError('EFFECT_UNKNOWN', 'Prior restore outcome is unknown')
        if (prior.receipt.result.isError)
          throw new HbarError(String(prior.receipt.result.details.code), prior.receipt.result.text)
        return
      }
      let root = ''
      for (const change of changes) root = await this.checkFile(rootId, change.path, authority, true)
      if (!changes.length || !this.execution.restoreFiles)
        throw new HbarError('NODE_RESTORE_UNAVAILABLE', 'Node restore backend unavailable')
      signal.throwIfAborted()
      await this.state.call('operation.accept', {
        operationId,
        argumentsDigest,
        kind: 'restore',
        authority,
        target: { rootId, path: '.', nodePath: root },
      })
      await this.state.call('operation.start', { operationId })
      try {
        this.available()
        await this.execution.restoreFiles(root, changes, signal)
        await this.state.call('operation.settle', {
          operationId,
          result: {
            text: '',
            isError: false,
            details: { code: 0, exitCode: 0, executionStarted: true, truncated: false, backend: 'none' },
          },
        })
        await this.state.call('audit.append', {
          operationId,
          sessionId: authority.sessionId,
          runId: authority.runId,
          callId: authority.callId,
          tool: 'restore_files',
          argumentsDigest,
          decision: 'allow',
          admission: authority.admission,
          backend: 'none',
          code: 0,
        })
      } catch (error) {
        await this.state.call('operation.lost', { operationId, reason: 'unknown' })
        throw error
      }
    })
  }
  async cancel(operationId: string): Promise<NodeReceipt> {
    this.pendingCancellations.set(operationId, (this.pendingCancellations.get(operationId) ?? 0) + 1)
    try {
      return await this.serial(operationId, async () => {
        const active = this.active.get(operationId)
        active?.controller.abort(new HbarError('CANCELLED', 'Execution cancelled locally or by its owning node link'))
        if (active) await active.finished
        return this.receipt(operationId)
      })
    } finally {
      const remaining = (this.pendingCancellations.get(operationId) ?? 1) - 1
      if (remaining) this.pendingCancellations.set(operationId, remaining)
      else this.pendingCancellations.delete(operationId)
    }
  }
  async pause(value = true): Promise<void> {
    this.paused = value
    await this.state.call('config.set', { key: 'paused', value })
  }
  linkRestored(): void {
    clearTimeout(this.linkTimer)
    this.linkTimer = undefined
    this.linkExpired = false
  }
  linkLost(): void {
    if (this.floor.onLinkLost.action === 'continue' || this.linkTimer) return
    this.linkTimer = setTimeout(() => {
      this.linkTimer = undefined
      this.linkExpired = true
      const task = Promise.all(
        [...this.active].map(async ([id, active]) => {
          await this.state.call('operation.lost', { operationId: id, reason: 'link-lost' })
          active.controller.abort(new HbarError('EFFECT_UNKNOWN', 'Owning node link was lost'))
          await active.finished
        }),
      ).then(() => undefined)
      this.completions.add(task)
      task.then(
        () => this.completions.delete(task),
        () => {
          this.completions.delete(task)
          this.paused = true
        },
      )
    }, this.floor.onLinkLost.graceMs)
  }
  dispose(): Promise<void> {
    return (this.closing ??= this.close())
  }
  private async close(): Promise<void> {
    this.disposed = true
    this.policyListeners.clear()
    this.linkRestored()
    for (const active of this.active.values())
      active.controller.abort(new HbarError('CANCELLED', 'Workspace node is stopping'))
    await Promise.allSettled([...this.locks.values()])
    await Promise.allSettled([...this.completions])
    await this.backend.dispose?.()
    await this.execution.dispose?.()
  }
}
