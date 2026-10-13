import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { HbarError } from '@hbar/contracts'
import { NODE_LIMITS } from '@hbar/contracts/node'
import {
  nodeGitQueryMethods,
  type NodeGitQueryAuthority,
  type NodeGitQueryMethod,
} from '@hbar/contracts/node-git-query'
import type { GitService } from '@hbar/plugin-sdk'
import { canonicalSandboxJSON } from '@hbar/sandbox'
import { isPathWithin } from '@hbar/contracts/path-containment'
import type { NodeExecutionBackend } from './execution-backend'
import type { NodeGitAdmissionContext } from './git-operation'
import { createNodeGitRunner, withNodeGitAdmission, type NodeGitAdmission } from './git-service'
import { localNodePaths } from './paths'
import type { NodeProcessReservation } from './process-lifecycle'

const MAX_QUERY_RESULT_BYTES = NODE_LIMITS.frameBytes - 4_096
const MAX_QUERY_COMMAND_MS = 120_000
const MAX_QUERY_ACTIVE = 8
const MAX_QUERY_CACHE = 128
const QUERY_CACHE_MS = 60_000
export interface NodeGitQueryRequest {
  readonly method: NodeGitQueryMethod
  readonly authority: NodeGitQueryAuthority
  readonly cwd: string
  readonly cached?: boolean
  readonly paths?: readonly string[]
  readonly limit?: number
  readonly from?: number
  readonly to?: number
  readonly bucketMs?: number
  readonly maxBuckets?: number
  readonly sources?: readonly ('auto' | 'manual' | 'external')[]
}

export interface NodeGitQueryAuditRecord {
  readonly operationId: string
  readonly deviceId: string
  readonly workspaceId: string
  readonly sessionId: string | null
  readonly rootId: string
  readonly expectedRoot: string
  readonly method: NodeGitQueryMethod
  readonly argumentsDigest: string
  readonly decision: 'allow' | 'deny' | 'ask'
  readonly backend: NodeExecutionBackend['name']
  readonly code: string | number | null
}

export interface NodeGitQueryOperationOptions {
  readonly backend: NodeExecutionBackend
  readonly gitForRoot: (root: string, runner: ReturnType<typeof createNodeGitRunner>) => GitService
  readonly admit: (
    request: NodeGitQueryRequest,
    argumentsDigest: string,
    signal: AbortSignal,
  ) => Promise<NodeGitAdmissionContext>
  readonly available: () => void
  readonly audit: (record: NodeGitQueryAuditRecord) => Promise<void>
  readonly reserveProcess: (operationId: string) => NodeProcessReservation
}

interface CachedQuery {
  readonly digest: string
  readonly promise: Promise<unknown>
  lastAt: number
}

function queryDigest(method: NodeGitQueryMethod, request: NodeGitQueryRequest): string {
  return createHash('sha256').update(canonicalSandboxJSON({ method, request })).digest('hex')
}

function parseRequest(method: NodeGitQueryMethod, raw: unknown): NodeGitQueryRequest {
  switch (method) {
    case 'git.query.info':
    case 'git.query.status':
    case 'git.query.branchList':
    case 'git.query.launchBranchSnapshot':
      return { ...nodeGitQueryMethods[method].input.parse(raw), method }
    case 'git.query.diff':
      return { ...nodeGitQueryMethods[method].input.parse(raw), method }
    case 'git.query.log':
      return { ...nodeGitQueryMethods[method].input.parse(raw), method }
    case 'git.query.stats': {
      const { from, to, bucketMs, maxBuckets, sources, ...rest } = nodeGitQueryMethods[method].input.parse(raw)
      return {
        ...rest,
        method,
        ...(from === undefined ? {} : { from }),
        ...(to === undefined ? {} : { to }),
        ...(bucketMs === undefined ? {} : { bucketMs }),
        ...(maxBuckets === undefined ? {} : { maxBuckets }),
        ...(sources === undefined ? {} : { sources }),
      }
    }
    case 'git.query.diffToRemote':
      return { ...nodeGitQueryMethods[method].input.parse(raw), method }
  }
}

function safeGitArgs(args: readonly string[], hooksPath: string): [string, ...string[]] {
  const portableHooksPath = hooksPath.replaceAll('\\', '/')
  const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null'
  return [
    'git',
    '--no-pager',
    '--literal-pathspecs',
    '-c',
    `core.hooksPath=${portableHooksPath}`,
    '-c',
    'core.fsmonitor=false',
    '-c',
    `core.attributesFile=${nullDevice}`,
    '-c',
    `core.excludesFile=${nullDevice}`,
    '-c',
    'core.pager=cat',
    '-c',
    'pager.branch=false',
    '-c',
    'pager.status=false',
    '-c',
    'diff.external=',
    '-c',
    'diff.textconv=false',
    '-c',
    'credential.helper=',
    '-c',
    'protocol.file.allow=never',
    '-c',
    'protocol.ext.allow=never',
    ...args,
  ]
}

function safeOriginUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const parsed = new URL(value)
    parsed.username = ''
    parsed.password = ''
    for (const key of [...parsed.searchParams.keys()])
      if (/token|secret|password|credential|auth|key/i.test(key)) parsed.searchParams.delete(key)
    return parsed.toString()
  } catch {
    return value.replace(/^(?:[^@/]+@)(?=[^/]+:)/, '')
  }
}

function execute(service: GitService, method: NodeGitQueryMethod, request: NodeGitQueryRequest, signal: AbortSignal) {
  switch (method) {
    case 'git.query.info':
      return service.info(request.cwd, signal)
    case 'git.query.status':
      return service.status(request.cwd, signal)
    case 'git.query.diff':
      return service.diff(
        request.cwd,
        { cached: request.cached, paths: [...(request.paths ?? [])], scope: 'execution-root' },
        signal,
      )
    case 'git.query.log':
      return service.log(request.cwd, request.limit, signal)
    case 'git.query.branchList':
      return service.branch(request.cwd, { operation: 'list' }, signal)
    case 'git.query.stats':
      return service.stats(
        request.cwd,
        {
          ...(request.from === undefined ? {} : { from: request.from }),
          ...(request.to === undefined ? {} : { to: request.to }),
          bucketMs: request.bucketMs!,
          maxBuckets: request.maxBuckets!,
          sources: [...(request.sources ?? [])],
        },
        signal,
      )
    case 'git.query.diffToRemote':
      return service.diffToRemote(request.cwd, signal, [...(request.paths ?? [])])
    case 'git.query.launchBranchSnapshot':
      return service.launchBranchSnapshot(request.cwd, signal)
  }
}

/** B-local, ephemeral Git reads under the same confined argv backend as admitted Git writes. */
export class NodeGitQueryOperationService {
  private readonly stopped = new AbortController()
  private readonly cached = new Map<string, CachedQuery>()
  private readonly active = new Set<Promise<unknown>>()

  constructor(private readonly options: NodeGitQueryOperationOptions) {}

  private prune(now: number): void {
    for (const [id, entry] of this.cached) if (entry.lastAt < now - QUERY_CACHE_MS) this.cached.delete(id)
    while (this.cached.size >= MAX_QUERY_CACHE) {
      const oldest = [...this.cached].sort((left, right) => left[1].lastAt - right[1].lastAt)[0]
      if (!oldest) break
      this.cached.delete(oldest[0])
    }
  }

  async invoke(method: NodeGitQueryMethod, raw: unknown, transportSignal: AbortSignal): Promise<unknown> {
    if (!Object.hasOwn(nodeGitQueryMethods, method))
      throw new HbarError('METHOD_NOT_FOUND', 'Manual Git query method is not in the read-only allowlist')
    const request = parseRequest(method, raw)
    if (request.authority.nodeId.length < 1 || request.authority.rootId.length < 1)
      throw new HbarError('WORKSPACE_SCOPE', 'Git query identity is incomplete')
    const operationId = request.authority.operationId
    const digest = queryDigest(method, request)
    const now = Date.now()
    this.prune(now)
    const prior = this.cached.get(operationId)
    if (prior) {
      if (prior.digest !== digest)
        throw new HbarError('IDEMPOTENCY_CONFLICT', 'Manual Git query key has different parameters')
      prior.lastAt = now
      return await prior.promise
    }
    if (this.active.size >= MAX_QUERY_ACTIVE) throw new HbarError('NODE_BUSY', 'Manual Git query capacity reached')
    const reservation = this.options.reserveProcess(operationId)
    const signal = AbortSignal.any([transportSignal, this.stopped.signal, reservation.signal])
    let finish!: () => void
    const finished = new Promise<void>((resolve) => {
      finish = resolve
    })
    let unregister: (() => void) | undefined
    const promise = this.run(method, request, digest, signal, (admission) => {
      unregister = reservation.activate({ controller: reservation.controller, finished })
      admission.release()
    })
    this.cached.set(operationId, { digest, promise, lastAt: now })
    this.active.add(promise)
    promise
      .finally(() => {
        unregister?.()
        reservation.release()
        finish()
        this.active.delete(promise)
      })
      .catch(() => undefined)
    promise.catch(() => {
      if (this.cached.get(operationId)?.promise === promise) this.cached.delete(operationId)
    })
    return await promise
  }

  private async run(
    method: NodeGitQueryMethod,
    request: NodeGitQueryRequest,
    argumentsDigest: string,
    signal: AbortSignal,
    activate: (admission: NodeGitAdmissionContext) => void,
  ): Promise<unknown> {
    const authority = request.authority
    const audit = async (decision: 'allow' | 'deny' | 'ask', code: string | number | null) =>
      this.options.audit({
        operationId: authority.operationId,
        deviceId: authority.deviceId,
        workspaceId: authority.workspaceId,
        sessionId: authority.sessionId,
        rootId: authority.rootId,
        expectedRoot: authority.expectedRoot,
        method,
        argumentsDigest,
        decision,
        backend: this.options.backend.name,
        code,
      })
    let admission: NodeGitAdmissionContext | undefined
    try {
      signal.throwIfAborted()
      this.options.available()
      admission = await this.options.admit(request, argumentsDigest, signal)
      signal.throwIfAborted()
      this.options.available()
      if (admission.rootPath !== authority.expectedRoot)
        throw new HbarError('NODE_ROOT_CHANGED', 'Manual Git query root changed after admission')
      if (admission.networkEnabled)
        throw new HbarError('NODE_NETWORK_UNSUPPORTED', 'Git query network access must remain disabled')
      if (
        !admission.confinement ||
        !admission.manifest ||
        !this.options.backend.filesystem ||
        !this.options.backend.network ||
        !this.options.backend.processTree ||
        !this.options.backend.execArgv
      )
        throw new HbarError(
          'NODE_CONFINEMENT_UNAVAILABLE',
          'Manual Git query requires managed filesystem, network and process-tree confinement',
        )
      if (!Number.isSafeInteger(admission.timeoutMs) || admission.timeoutMs < 1)
        throw new HbarError('INVALID_INPUT', 'Manual Git query requires a positive timeout')

      const realRoot = await realpath(admission.rootPath)
      const realCwd = await realpath(admission.cwd)
      const paths = { separator: localNodePaths.separator, caseInsensitive: false }
      if (realRoot !== admission.rootPath || realCwd !== admission.cwd || !isPathWithin(realRoot, realCwd, paths))
        throw new HbarError('NODE_ROOT_CHANGED', 'Manual Git query path is not canonical within its registered root')

      const backend = this.options.backend
      const deadline = Date.now() + Math.min(admission.timeoutMs, MAX_QUERY_COMMAND_MS)
      const runArgv = async (args: readonly string[], childSignal: AbortSignal, timeoutMs: number) => {
        const remaining = deadline - Date.now()
        if (remaining <= 0) throw new HbarError('GIT_TIMEOUT', 'Manual Git query exceeded its operation deadline')
        const argv = safeGitArgs(args, admission!.hooksPath)
        const result = await backend.execArgv!(admission!.cwd, argv, childSignal, {
          timeoutMs: Math.min(timeoutMs, remaining),
          environment: {
            ...admission!.environment,
            GIT_CONFIG_NOSYSTEM: '1',
            GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
            GIT_TERMINAL_PROMPT: '0',
            GIT_OPTIONAL_LOCKS: '0',
            GIT_PAGER: 'cat',
            PAGER: 'cat',
            GIT_EDITOR: 'true',
            GIT_SEQUENCE_EDITOR: 'true',
          },
          environmentAllowlist: admission!.environmentAllowlist,
          confinement: admission!.confinement,
          protectedPaths: [...admission!.protectedPaths, ...admission!.manifest.protectedPaths],
          readOnlyPaths: [...admission!.readOnlyPaths, ...admission!.manifest.readOnlyPaths],
        })
        if (result.timedOut) throw new HbarError('GIT_TIMEOUT', 'Git query subprocess exceeded its deadline')
        if (
          Buffer.byteLength(result.stdout, 'utf8') + Buffer.byteLength(result.stderr, 'utf8') >
          admission!.maxOutputBytes
        )
          throw new HbarError('GIT_OUTPUT_LIMIT', 'Git query subprocess exceeded its output limit')
        return result
      }
      const runner = createNodeGitRunner()
      activate(admission)
      const context: NodeGitAdmission = {
        rootPath: admission.rootPath,
        cwd: admission.cwd,
        timeoutMs: admission.timeoutMs,
        run: async (args, commandSignal, limits) => {
          commandSignal.throwIfAborted()
          const result = await runArgv(args, commandSignal, limits.timeoutMs)
          return { stdout: result.stdout, stderr: result.stderr, code: result.exitCode, truncated: result.truncated }
        },
      }
      const value = await withNodeGitAdmission(context, signal, async () => {
        const textconvConfig = await runArgv(
          ['config', '--local', '--no-includes', '--name-only', '--get-regexp', '^diff\\..*\\.textconv$'],
          signal,
          5_000,
        )
        if (textconvConfig.exitCode === 0 && textconvConfig.stdout.trim())
          throw new HbarError(
            'GIT_TEXTCONV_DENIED',
            'Repository text conversion commands are not allowed for Git queries',
          )
        if (textconvConfig.exitCode !== 0 && textconvConfig.exitCode !== 1)
          throw new HbarError('GIT_CONFIG_UNAVAILABLE', 'Could not verify repository text conversion configuration')
        const metadata = await runArgv(
          ['rev-parse', '--path-format=absolute', '--show-toplevel', '--absolute-git-dir', '--git-common-dir'],
          signal,
          5_000,
        )
        if (metadata.exitCode !== 0)
          throw new HbarError('GIT_REPOSITORY_REQUIRED', 'Manual Git query requires a registered repository root')
        const [topLevel, gitDir, commonDir] = metadata.stdout.split(/\r?\n/).filter(Boolean)
        const canonicalGitDir = gitDir
          ? await realpath(isAbsolute(gitDir) ? gitDir : resolve(admission!.cwd, gitDir))
          : ''
        const canonicalCommonDir = commonDir
          ? await realpath(isAbsolute(commonDir) ? commonDir : resolve(admission!.cwd, commonDir))
          : ''
        if (
          resolve(topLevel ?? '') !== realRoot ||
          !isPathWithin(realRoot, canonicalGitDir, paths) ||
          !isPathWithin(realRoot, canonicalCommonDir, paths)
        )
          throw new HbarError('GIT_REPOSITORY_SCOPE', 'Manual Git query repository metadata leaves its registered root')
        const service = this.options.gitForRoot(realRoot, runner)
        return await execute(service, method, request, signal)
      })
      const parsed = nodeGitQueryMethods[method].output.parse(value)
      if (method === 'git.query.info' && parsed && typeof parsed === 'object' && 'originUrl' in parsed)
        (parsed as { originUrl: string | null }).originUrl = safeOriginUrl(
          (parsed as { originUrl: string | null }).originUrl,
        )
      if (Buffer.byteLength(JSON.stringify(parsed), 'utf8') > MAX_QUERY_RESULT_BYTES)
        throw new HbarError('GIT_OUTPUT_LIMIT', 'Manual Git query result exceeds the node frame budget')
      signal.throwIfAborted()
      await audit('allow', 0)
      return parsed
    } catch (error) {
      const code = error instanceof HbarError ? error.code : 'GIT_QUERY_FAILED'
      await audit(code === 'NODE_LOCAL_CONFIRMATION_PENDING' ? 'ask' : 'deny', code)
      throw error
    } finally {
      if (admission) admission.release()
    }
  }

  async dispose(): Promise<void> {
    this.stopped.abort(new HbarError('EXECUTION_CLOSED', 'Manual Git query service is closing'))
    await Promise.allSettled([...this.active])
    this.cached.clear()
  }
}
