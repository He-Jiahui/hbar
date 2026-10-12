import { createHash } from 'node:crypto'
import { HbarError } from '@hbar/contracts'
import { z } from 'zod'
import type { ExecutionProvider, ToolResult, OsConfinementOptions } from '@hbar/plugin-sdk'
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
import { nodeOwnedPath, localNodePaths, validateNodeRoots, nodeProtectedPaths } from './paths'

export interface NodeExecutionBackend {
  readonly name: NodeCapabilities['sandbox']['backends'][number]
  readonly filesystem: boolean
  readonly network: boolean
  readonly processTree: boolean
  exec(
    workspace: string,
    command: string,
    signal: AbortSignal,
    options: {
      timeoutMs: number
      environment: Readonly<Record<string, string>>
      confinement: OsConfinementOptions | null
      protectedPaths: readonly string[]
      environmentAllowlist: readonly string[]
    },
  ): Promise<ToolResult>
  dispose?(): Promise<void>
}
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
  private paused = false
  private disposed = false
  private starting = 0
  private changingPolicy = false
  private readonly snapshots = new Map<string, ResolvedSandboxProfile>()
  private readonly active = new Map<string, { controller: AbortController; finished: Promise<void> }>()
  private readonly locks = new Map<string, Promise<void>>()
  private linkTimer: ReturnType<typeof setTimeout> | undefined
  private readonly completions = new Set<Promise<void>>()
  constructor(
    readonly id: string,
    readonly dataRoot: string,
    private readonly state: NodeStatePort,
    private readonly execution: ExecutionProvider,
    floor: NodeFloor,
    private readonly backend: NodeExecutionBackend,
  ) {
    this.floor = nodeFloorSchema.parse(floor)
  }
  static async open(
    id: string,
    dataRoot: string,
    state: NodeStatePort,
    execution: ExecutionProvider,
    backend: NodeExecutionBackend,
  ) {
    await state.call('ready', {})
    const floor = (await state.call('floor.get', {})) ?? nodeFloorSchema.parse({ roots: [] })
    const node = new WorkspaceNodeService(
      id,
      dataRoot,
      state,
      execution,
      await validateNodeRoots(floor, dataRoot),
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
    if (this.active.size || this.starting || this.locks.size || this.changingPolicy)
      throw new HbarError('NODE_BUSY', 'Stop active operations before changing the floor')
    this.changingPolicy = true
    try {
      const floor = await validateNodeRoots(nodeFloorSchema.parse(value), this.dataRoot)
      this.floor = await this.state.call('floor.set', floor)
      return this.policy
    } finally {
      this.changingPolicy = false
    }
  }
  get isPaused(): boolean {
    return this.paused
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
    if (this.paused) throw new HbarError('NODE_PAUSED', 'Workspace node is paused locally')
    if (this.changingPolicy) throw new HbarError('NODE_BUSY', 'Node floor is being changed locally')
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
    if (!operation?.versions || !operation.target || operation.target.rootId !== rootId)
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
  async start(value: unknown): Promise<NodeReceipt> {
    const request = nodeExecStartSchema.parse(value)
    return this.serial(request.operationId, async () => {
      const prior = await this.state.call('operation.get', { operationId: request.operationId })
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
          if (!this.floor.process) throw new HbarError('NODE_DENIED', 'Processes are disabled by the node floor')
          if (['always', 'process'].includes(this.floor.localConfirm))
            throw new HbarError(
              'NODE_LOCAL_CONFIRMATION_REQUIRED',
              'The node floor requires local process confirmation',
            )
          const target = await nodeOwnedPath(this.floor, this.dataRoot, request.rootId, request.cwd)
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
          const readOnlyProfile =
            profile &&
            (profile.filesystem.default !== 'write' ||
              profile.filesystem.grants.some((grant) => grant.access !== 'write'))
          // A backend must support exclusions before granting broad workspace writes.
          const writableRoots = target.registration.access === 'write' && !readOnlyProfile ? [target.root] : []
          const confinement: OsConfinementOptions | null =
            requireConfinement || (this.floor.osConfinement === 'preferred' && this.backend.filesystem)
              ? {
                  level: 'elevated',
                  readableRoots: [target.root],
                  writableRoots,
                  networkEnabled: network,
                  envOverrides: environment,
                }
              : null
          const controller = new AbortController()
          const started = await this.state.call('operation.start', { operationId: request.operationId })
          if (started.receipt.state !== 'started') return started.receipt
          const timeoutMs = Math.min(request.timeoutMs, this.floor.maxTimeoutMs)
          const finished = Promise.resolve()
            .then(async () => {
              let result: NodeExecResult
              try {
                const execution = await this.backend.exec(target.path, request.command, controller.signal, {
                  timeoutMs,
                  environment,
                  confinement,
                  protectedPaths: nodeProtectedPaths(this.floor, this.dataRoot),
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
        if (prior.versions) return prior.versions
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
        target: { rootId, path },
      })
      await this.state.call('operation.start', { operationId })
      try {
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
        target: { rootId, path: '.' },
      })
      await this.state.call('operation.start', { operationId })
      try {
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
    const active = this.active.get(operationId)
    active?.controller.abort(new HbarError('CANCELLED', 'Execution cancelled locally or by its owning node link'))
    if (active) await active.finished
    return this.receipt(operationId)
  }
  async pause(value = true): Promise<void> {
    this.paused = value
    await this.state.call('config.set', { key: 'paused', value })
  }
  linkRestored(): void {
    clearTimeout(this.linkTimer)
    this.linkTimer = undefined
  }
  linkLost(): void {
    if (this.floor.onLinkLost.action === 'continue' || this.linkTimer) return
    this.linkTimer = setTimeout(() => {
      this.linkTimer = undefined
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
  async dispose(): Promise<void> {
    this.disposed = true
    this.linkRestored()
    for (const active of this.active.values())
      active.controller.abort(new HbarError('CANCELLED', 'Workspace node is stopping'))
    await Promise.allSettled([...this.completions])
    await this.backend.dispose?.()
    await this.execution.dispose?.()
  }
}
