import { createHash } from 'node:crypto'
import { canonicalSandboxJSON } from '@hbar/sandbox'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import type { GitBranchInfo, GitCommitInfo, GitDiff, GitInfo, GitStatsReport, GitStatus } from '@hbar/contracts'
import type {
  GitBranchOperation,
  GitDiffOptions,
  GitLaunchBranchSnapshot,
  GitService,
  GitStatsOptions,
} from '@hbar/plugin-sdk'
import { parseNodeWorkspaceLocator, workspaceLocationOf, type NodeWorkspaceLocation } from '@hbar/contracts/node'
import {
  nodeGitQueryMethods,
  nodeGitQueryAuthoritySchema,
  type NodeGitQueryMethod,
} from '@hbar/contracts/node-git-query'
import {
  nodeLocalConfirmationCancelResultSchema,
  nodeLocalConfirmationLookupSchema,
  nodeLocalConfirmationStatusSchema,
} from '@hbar/contracts/node-confirmations'
import { nodeExecutionRelativePath } from './execution-paths'
import type { NodeExecutionScope } from './execution-port'

export interface NodeGitQueryInvocation {
  readonly workspace: NodeExecutionScope['workspace']
  readonly deviceId: string
  readonly workspaceId: string
  readonly sessionId: string | null
  /** Host-created once for this UI command and reused for an exact consent retry. */
  readonly operationId: string
  readonly platform: 'linux' | 'darwin' | 'win32'
  readonly signal: AbortSignal
}

export interface NodeGitQueryPort {
  call<Method extends NodeGitQueryMethod>(
    nodeId: string,
    method: Method,
    input: z.input<(typeof nodeGitQueryMethods)[Method]['input']>,
    signal: AbortSignal,
  ): Promise<z.output<(typeof nodeGitQueryMethods)[Method]['output']>>
}
export interface NodeGitQueryConfirmationPort {
  status(
    nodeId: string,
    input: z.input<typeof nodeLocalConfirmationLookupSchema>,
    signal: AbortSignal,
  ): Promise<z.output<typeof nodeLocalConfirmationStatusSchema>>
  cancel(
    nodeId: string,
    input: z.input<typeof nodeLocalConfirmationLookupSchema>,
    signal: AbortSignal,
  ): Promise<z.output<typeof nodeLocalConfirmationCancelResultSchema>>
}

export interface NodeGitQueryRouterOptions {
  readonly base: GitService
  readonly node: NodeGitQueryPort
  readonly confirmation: NodeGitQueryConfirmationPort
  current(): NodeGitQueryInvocation | undefined
}

interface CapturedQuery {
  readonly location: NodeWorkspaceLocation
  readonly deviceId: string
  readonly workspaceId: string
  readonly sessionId: string | null
  readonly operationId: string
  readonly platform: 'linux' | 'darwin' | 'win32'
  readonly signal: AbortSignal
}

const CONFIRMATION_WAIT_MS = 60_000
function errorCode(error: unknown): string | undefined {
  return error instanceof HbarError ? error.code : undefined
}
function waitForSignal(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', aborted)
      resolve()
    }, ms)
    const aborted = () => {
      clearTimeout(timer)
      reject(signal.reason ?? new HbarError('CANCELLED', 'Manual Git query was cancelled'))
    }
    signal.addEventListener('abort', aborted, { once: true })
  })
}

/** Routes UI/read-only Git calls through a Host-injected manual query identity. */
export class NodeGitQueryRouter implements GitService {
  private readonly stopped = new AbortController()

  constructor(private readonly options: NodeGitQueryRouterOptions) {}

  private capture(cwd?: string, signal?: AbortSignal): { captured: CapturedQuery; relativeCwd: string } | null {
    const current = this.options.current()
    const scopePath = current?.workspace.path
    const path = cwd ?? scopePath
    if (!path) return null
    const address = parseNodeWorkspaceLocator(path)
    if (!address) return null
    // Run-scoped remote calls continue through the base NodeGitRouter. This
    // wrapper only intercepts a Host invocation explicitly marked manual-query.
    if (!current) return null
    const workspace = structuredClone(current.workspace)
    const location = workspaceLocationOf(workspace)
    const authorityLocation = location.kind === 'node' ? location : undefined
    if (
      !authorityLocation ||
      authorityLocation.nodeId !== address.nodeId ||
      authorityLocation.rootId !== address.rootId ||
      workspace.path !== scopePath
    )
      throw new HbarError('WORKSPACE_SCOPE', 'Git query target differs from the captured manual workspace')
    const scopeSignal = current.signal
    scopeSignal.throwIfAborted()
    signal?.throwIfAborted()
    const combined = AbortSignal.any([this.stopped.signal, scopeSignal, ...(signal ? [signal] : [])])
    const relativeCwd =
      path === workspace.path || path === authorityLocation.nodePath
        ? '.'
        : nodeExecutionRelativePath({ location: authorityLocation, platform: current.platform }, path)
    return {
      captured: {
        location: structuredClone(authorityLocation),
        deviceId: current.deviceId,
        workspaceId: current.workspaceId,
        sessionId: current.sessionId,
        operationId: current.operationId,
        platform: current.platform,
        signal: combined,
      },
      relativeCwd,
    }
  }

  private async query<Method extends NodeGitQueryMethod>(
    method: Method,
    cwd: string | undefined,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<{
    readonly routed: true
    readonly value: z.output<(typeof nodeGitQueryMethods)[Method]['output']>
  } | null> {
    const target = this.capture(cwd, signal)
    if (!target) return null
    const operationId = target.captured.operationId
    const authority = nodeGitQueryAuthoritySchema.parse({
      kind: 'manual-query',
      operationId,
      deviceId: target.captured.deviceId,
      workspaceId: target.captured.workspaceId,
      sessionId: target.captured.sessionId,
      nodeId: target.captured.location.nodeId,
      rootId: target.captured.location.rootId,
      expectedRoot: target.captured.location.nodePath,
    })
    const input = nodeGitQueryMethods[method].input.parse({
      authority,
      cwd: target.relativeCwd,
      ...args,
    }) as Record<string, unknown>
    const argumentsDigest = createHash('sha256')
      .update(canonicalSandboxJSON({ method, request: { ...input, method } }))
      .digest('hex')
    const lookup = nodeLocalConfirmationLookupSchema.parse({
      kind: 'manual-query',
      operationId,
      deviceId: authority.deviceId,
      workspaceId: authority.workspaceId,
      sessionId: authority.sessionId,
      nodeId: authority.nodeId,
      rootId: authority.rootId,
      expectedRoot: authority.expectedRoot,
      method,
      argumentsDigest,
    })
    const dispatch = () =>
      this.options.node.call(
        target.captured.location.nodeId,
        method,
        input as z.input<(typeof nodeGitQueryMethods)[Method]['input']>,
        target.captured.signal,
      )
    let value: z.output<(typeof nodeGitQueryMethods)[Method]['output']>
    try {
      value = await dispatch()
    } catch (error) {
      if (errorCode(error) !== 'NODE_LOCAL_CONFIRMATION_PENDING') throw error
      value = (await this.awaitConfirmation(
        target.captured.location.nodeId,
        dispatch,
        lookup,
        target.captured.signal,
      )) as z.output<(typeof nodeGitQueryMethods)[Method]['output']>
    }
    return { routed: true, value }
  }

  private async awaitConfirmation(
    nodeId: string,
    dispatch: () => Promise<unknown>,
    lookup: z.output<typeof nodeLocalConfirmationLookupSchema>,
    signal: AbortSignal,
  ): Promise<unknown> {
    const deadline = Date.now() + CONFIRMATION_WAIT_MS
    let delayMs = 150
    const cancel = async () => {
      try {
        await this.options.confirmation.cancel(nodeId, lookup, AbortSignal.timeout(3_000))
      } catch {
        // B expires queued consent independently; cleanup must not hold the caller.
      }
    }
    try {
      for (;;) {
        signal.throwIfAborted()
        const status = await this.options.confirmation.status(nodeId, lookup, signal)
        signal.throwIfAborted()
        if (status === 'approved') {
          try {
            return await dispatch()
          } catch (error) {
            if (errorCode(error) === 'NODE_LOCAL_CONFIRMATION_PENDING') {
              await cancel()
              throw new HbarError('NODE_LOCAL_CONFIRMATION_RETRY_REQUIRED', 'Approved Git query could not be replayed')
            }
            throw error
          }
        }
        if (status !== 'waiting') {
          await cancel()
          const code =
            status === 'rejected'
              ? 'NODE_LOCAL_CONFIRMATION_REJECTED'
              : status === 'expired'
                ? 'NODE_LOCAL_CONFIRMATION_EXPIRED'
                : status === 'cancelled'
                  ? 'NODE_LOCAL_CONFIRMATION_CANCELLED'
                  : 'NODE_LOCAL_CONFIRMATION_CLOSED'
          throw new HbarError(code, `B-local Git query consent ended with state ${status}`)
        }
        const remaining = deadline - Date.now()
        if (remaining <= 0) {
          await cancel()
          throw new HbarError('NODE_LOCAL_CONFIRMATION_EXPIRED', 'B-local Git query consent timed out')
        }
        await waitForSignal(Math.min(delayMs, remaining), signal)
        delayMs = Math.min(1_000, Math.ceil(delayMs * 1.7))
      }
    } catch (error) {
      if (signal.aborted) await cancel()
      throw error
    }
  }

  async info(cwd?: string, signal?: AbortSignal): Promise<GitInfo> {
    const result = await this.query('git.query.info', cwd, {}, signal)
    return result ? result.value : this.options.base.info(cwd, signal)
  }
  async status(cwd?: string, signal?: AbortSignal): Promise<GitStatus> {
    const result = await this.query('git.query.status', cwd, {}, signal)
    return result ? result.value : this.options.base.status(cwd, signal)
  }
  async diff(cwd?: string, options: GitDiffOptions = {}, signal?: AbortSignal): Promise<GitDiff> {
    const result = await this.query(
      'git.query.diff',
      cwd,
      { cached: options.cached ?? false, paths: options.paths ?? [] },
      signal,
    )
    return result ? result.value : this.options.base.diff(cwd, options, signal)
  }
  async log(cwd?: string, limit?: number, signal?: AbortSignal): Promise<GitCommitInfo[]> {
    const result = await this.query('git.query.log', cwd, { limit: limit ?? 20 }, signal)
    return result ? result.value : this.options.base.log(cwd, limit, signal)
  }
  async stats(cwd: string | undefined, options: GitStatsOptions, signal?: AbortSignal): Promise<GitStatsReport> {
    const result = await this.query(
      'git.query.stats',
      cwd,
      {
        ...(options.from === undefined ? {} : { from: options.from }),
        ...(options.to === undefined ? {} : { to: options.to }),
        bucketMs: options.bucketMs,
        maxBuckets: options.maxBuckets,
        sources: [...options.sources],
      },
      signal,
    )
    return result ? result.value : this.options.base.stats(cwd, options, signal)
  }
  async branch(
    cwd: string | undefined,
    operation?: GitBranchOperation,
    signal?: AbortSignal,
  ): Promise<GitBranchInfo[] | GitBranchInfo> {
    if (!operation || operation.operation === 'list') {
      const listed = await this.query('git.query.branchList', cwd, {}, signal)
      if (listed) return listed.value
    }
    return this.options.base.branch(cwd, operation, signal)
  }
  async launchBranchSnapshot(cwd?: string, signal?: AbortSignal): Promise<GitLaunchBranchSnapshot> {
    const result = await this.query('git.query.launchBranchSnapshot', cwd, {}, signal)
    return result ? result.value : this.options.base.launchBranchSnapshot(cwd, signal)
  }
  async diffToRemote(cwd?: string, signal?: AbortSignal, paths?: string[]) {
    const result = await this.query('git.query.diffToRemote', cwd, { paths: paths ?? [] }, signal)
    return result ? result.value : this.options.base.diffToRemote(cwd, signal, paths)
  }

  commit(...args: Parameters<GitService['commit']>) {
    return this.options.base.commit(...args)
  }
  stage(...args: Parameters<GitService['stage']>) {
    return this.options.base.stage(...args)
  }
  unstage(...args: Parameters<GitService['unstage']>) {
    return this.options.base.unstage(...args)
  }
  createLaunchBranch(...args: Parameters<NonNullable<GitService['createLaunchBranch']>>) {
    if (!this.options.base.createLaunchBranch)
      throw new HbarError('NODE_GIT_METHOD_UNAVAILABLE', 'Manual Git branch creation is unavailable')
    return this.options.base.createLaunchBranch(...args)
  }
  worktree(...args: Parameters<GitService['worktree']>) {
    return this.options.base.worktree(...args)
  }

  dispose(): void {
    this.stopped.abort(new HbarError('EXECUTION_CLOSED', 'Manual Git query router is closing'))
  }
}
