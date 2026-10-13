import { createHash } from 'node:crypto'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import type {
  GitBranchInfo,
  GitCommitInfo,
  GitDiff,
  GitInfo,
  GitStatsReport,
  GitStatus,
  GitWorktreeInfo,
} from '@hbar/contracts'
import type {
  GitBranchOperation,
  GitCommitOptions,
  GitDiffOptions,
  GitLaunchBranchCreateInput,
  GitLaunchBranchCreateResult,
  GitLaunchBranchSnapshot,
  GitService,
  GitStatsOptions,
  GitWorktreeOperation,
} from '@hbar/plugin-sdk'
import { nodeCallAuthoritySchema, parseNodeWorkspaceLocator, workspaceLocationOf } from '@hbar/contracts/node'
import { nodeGitMethods, type NodeGitMethod } from '@hbar/contracts/node-git'
import {
  nodeLocalConfirmationCancelResultSchema,
  nodeLocalConfirmationRunLookupSchema,
  nodeLocalConfirmationStatusSchema,
} from '@hbar/contracts/node-confirmations'
import type { ResolvedSandboxProfile, SandboxSnapshotRef } from '@hbar/contracts/sandbox'
import { canonicalSandboxJSON, SANDBOX_EVALUATOR_FINGERPRINT, verifySandboxSnapshot } from '@hbar/sandbox'
import type { NodeExecutionPort, NodeExecutionScope } from './execution-port'
import { nodeExecutionRelativePath } from './execution-paths'

export interface NodeGitRouterOptions {
  readonly local: GitService
  readonly node: NodeExecutionPort
  readonly git: NodeGitPort
  readonly confirmation: NodeGitConfirmationPort
  current(): NodeExecutionScope | undefined
  loadSnapshot(ref: SandboxSnapshotRef, signal: AbortSignal): Promise<ResolvedSandboxProfile>
}

export interface NodeGitConfirmationPort {
  status(
    nodeId: string,
    input: z.input<typeof nodeLocalConfirmationRunLookupSchema>,
    signal: AbortSignal,
  ): Promise<z.output<typeof nodeLocalConfirmationStatusSchema>>
  cancel(
    nodeId: string,
    input: z.input<typeof nodeLocalConfirmationRunLookupSchema>,
    signal: AbortSignal,
  ): Promise<z.output<typeof nodeLocalConfirmationCancelResultSchema>>
}

export interface NodeGitPort {
  call<Method extends NodeGitMethod>(
    nodeId: string,
    method: Method,
    input: z.input<(typeof nodeGitMethods)[Method]['input']>,
    signal: AbortSignal,
  ): Promise<z.output<(typeof nodeGitMethods)[Method]['output']>>
}

interface Captured {
  readonly workspace: NodeExecutionScope['workspace']
  readonly authority: NonNullable<NodeExecutionScope['authority']>
  readonly signal: AbortSignal
}

const LOCAL_CONFIRMATION_WAIT_MS = 60_000

function confirmationLookup(
  method: NodeGitMethod,
  payload: Record<string, unknown>,
): z.output<typeof nodeLocalConfirmationRunLookupSchema> {
  const checked = nodeGitMethods[method].input.parse(payload)
  if (!('authority' in checked))
    throw new HbarError('WORKSPACE_SCOPE', 'Run-scoped Git confirmation requires NodeCallAuthority')
  const authority = nodeCallAuthoritySchema.parse(checked.authority)
  const argumentsDigest = createHash('sha256')
    .update(JSON.stringify({ method, request: { ...checked, method } }))
    .digest('hex')
  const admissionDigest = createHash('sha256')
    .update(canonicalSandboxJSON({ sandbox: authority.sandbox, admission: authority.admission }))
    .digest('hex')
  return nodeLocalConfirmationRunLookupSchema.parse({
    operationId: checked.operationId,
    rootId: checked.rootId,
    expectedRoot: checked.expectedRoot,
    authority,
    admissionDigest,
    argumentsDigest,
  })
}

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
      reject(signal.reason ?? new HbarError('CANCELLED', 'Git confirmation was cancelled'))
    }
    signal.addEventListener('abort', aborted, { once: true })
  })
}

/** Routes the bounded Git method set to the node captured by Host admission. */
export class NodeGitRouter implements GitService {
  private readonly stopped = new AbortController()
  constructor(private readonly options: NodeGitRouterOptions) {}

  private capture(cwd: string | undefined, signal?: AbortSignal): Captured | null {
    const scope = this.options.current()
    const combined = AbortSignal.any([
      this.stopped.signal,
      ...(scope ? [scope.signal] : []),
      ...(signal ? [signal] : []),
    ])
    combined.throwIfAborted()
    const path = cwd ?? scope?.workspace.path
    if (!path) return null
    const workspace = scope ? structuredClone(scope.workspace) : null
    const scopeAddress = workspace ? parseNodeWorkspaceLocator(workspace.path) : null
    const address = parseNodeWorkspaceLocator(path) ?? scopeAddress
    if (!address) return null
    if (!scope) throw new HbarError('RUNTIME_EXECUTION_REQUIRED', 'Node Git requires Host-owned workspace admission')
    const authority = scope.authority ? nodeCallAuthoritySchema.parse(structuredClone(scope.authority)) : undefined
    if (!authority) throw new HbarError('RUNTIME_EXECUTION_REQUIRED', 'Node Git requires completed Host admission')
    const location = workspaceLocationOf(workspace ?? structuredClone(scope.workspace))
    if (location.kind !== 'node' || location.nodeId !== address.nodeId || location.rootId !== address.rootId)
      throw new HbarError('WORKSPACE_SCOPE', 'Git node location disagrees with the captured workspace')
    return { workspace: workspace ?? structuredClone(scope.workspace), authority, signal: combined }
  }

  private async admitted(capture: Captured) {
    const { signal } = capture
    const location = workspaceLocationOf(structuredClone(capture.workspace))
    if (location.kind !== 'node') throw new HbarError('WORKSPACE_SCOPE', 'Node location is missing from Git scope')
    const authority = capture.authority
    const capabilities = await this.options.node.call(location.nodeId, 'node.capabilities', {}, signal)
    if (capabilities.nodeId !== location.nodeId || capabilities.evaluator !== SANDBOX_EVALUATOR_FINGERPRINT)
      throw new HbarError('NODE_EVALUATOR_MISMATCH', 'Workspace node identity or sandbox evaluator is incompatible')
    if (!capabilities.roots.some((root) => root.rootId === location.rootId && root.nodePath === location.nodePath))
      throw new HbarError('NODE_ROOT_CHANGED', 'The node root differs from the captured workspace binding')
    if (authority.sandbox) {
      const profile = verifySandboxSnapshot(
        authority.sandbox,
        await this.options.loadSnapshot(authority.sandbox, signal),
      )
      await this.options.node.call(location.nodeId, 'sandbox.put', { ref: authority.sandbox, profile }, signal)
    }
    return { location, authority, platform: capabilities.platform, signal }
  }

  private async call<Method extends NodeGitMethod>(
    method: Method,
    capture: Captured,
    cwd: string | undefined,
    input: Record<string, unknown>,
  ): Promise<z.output<(typeof nodeGitMethods)[Method]['output']>> {
    const target = await this.admitted(capture)
    const relativeCwd =
      cwd === undefined || cwd === target.location.nodePath || cwd === capture.workspace.path
        ? '.'
        : nodeExecutionRelativePath({ location: target.location, platform: target.platform }, cwd)
    const payload = {
      operationId: `${target.authority.runId}:${target.authority.callId}`,
      rootId: target.location.rootId,
      expectedRoot: target.location.nodePath,
      authority: target.authority,
      ...input,
      cwd: relativeCwd,
    }
    let result: unknown
    try {
      result = await this.dispatchGit(target.location.nodeId, method, payload, target.signal)
    } catch (error) {
      if (errorCode(error) !== 'NODE_LOCAL_CONFIRMATION_PENDING') throw error
      const lookup = confirmationLookup(method, payload)
      result = await this.awaitLocalConfirmation(target.location.nodeId, method, payload, lookup, target.signal)
    }
    return nodeGitMethods[method].output.parse(result) as z.output<(typeof nodeGitMethods)[Method]['output']>
  }

  private async awaitLocalConfirmation(
    nodeId: string,
    method: NodeGitMethod,
    payload: Record<string, unknown>,
    lookup: z.output<typeof nodeLocalConfirmationRunLookupSchema>,
    signal: AbortSignal,
  ): Promise<unknown> {
    const deadline = Date.now() + LOCAL_CONFIRMATION_WAIT_MS
    let delayMs = 150
    const cancel = async () => {
      try {
        await this.options.confirmation.cancel(nodeId, lookup, AbortSignal.timeout(3_000))
      } catch {
        // The B queue also expires independently; caller cancellation must not hang on cleanup.
      }
    }
    try {
      for (;;) {
        signal.throwIfAborted()
        const status = await this.options.confirmation.status(nodeId, lookup, signal)
        signal.throwIfAborted()
        if (status === 'approved') {
          try {
            return await this.dispatchGit(nodeId, method, payload, signal)
          } catch (error) {
            if (errorCode(error) === 'NODE_LOCAL_CONFIRMATION_PENDING') {
              await cancel()
              throw new HbarError(
                'NODE_LOCAL_CONFIRMATION_RETRY_REQUIRED',
                'Approved Git request could not be replayed',
              )
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
          throw new HbarError(code, `B-local Git confirmation ended with state ${status}`)
        }
        const remaining = deadline - Date.now()
        if (remaining <= 0) {
          await cancel()
          throw new HbarError('NODE_LOCAL_CONFIRMATION_EXPIRED', 'B-local Git confirmation timed out')
        }
        await waitForSignal(Math.min(delayMs, remaining), signal)
        delayMs = Math.min(1_000, Math.ceil(delayMs * 1.7))
      }
    } catch (error) {
      if (signal.aborted) await cancel()
      throw error
    }
  }

  private dispatchGit(
    nodeId: string,
    method: NodeGitMethod,
    payload: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<unknown> {
    switch (method) {
      case 'git.info':
        return this.options.git.call(nodeId, method, nodeGitMethods[method].input.parse(payload), signal)
      case 'git.status':
        return this.options.git.call(nodeId, method, nodeGitMethods[method].input.parse(payload), signal)
      case 'git.diff':
        return this.options.git.call(nodeId, method, nodeGitMethods[method].input.parse(payload), signal)
      case 'git.log':
        return this.options.git.call(nodeId, method, nodeGitMethods[method].input.parse(payload), signal)
      case 'git.stage':
        return this.options.git.call(nodeId, method, nodeGitMethods[method].input.parse(payload), signal)
      case 'git.unstage':
        return this.options.git.call(nodeId, method, nodeGitMethods[method].input.parse(payload), signal)
      case 'git.commit':
        return this.options.git.call(nodeId, method, nodeGitMethods[method].input.parse(payload), signal)
      case 'git.worktree':
        return this.options.git.call(nodeId, method, nodeGitMethods[method].input.parse(payload), signal)
    }
  }

  info(cwd?: string, signal?: AbortSignal): Promise<GitInfo> {
    const capture = this.capture(cwd, signal)
    return capture ? this.call('git.info', capture, cwd, {}) : this.options.local.info(cwd, signal)
  }
  status(cwd?: string, signal?: AbortSignal): Promise<GitStatus> {
    const capture = this.capture(cwd, signal)
    return capture ? this.call('git.status', capture, cwd, {}) : this.options.local.status(cwd, signal)
  }
  diff(cwd?: string, options: GitDiffOptions = {}, signal?: AbortSignal): Promise<GitDiff> {
    const capture = this.capture(cwd, signal)
    return capture
      ? this.call('git.diff', capture, cwd, { cached: options.cached ?? false, paths: options.paths ?? [] })
      : this.options.local.diff(cwd, options, signal)
  }
  log(cwd?: string, limit?: number, signal?: AbortSignal): Promise<GitCommitInfo[]> {
    const capture = this.capture(cwd, signal)
    return capture
      ? this.call('git.log', capture, cwd, { limit: limit ?? 20 })
      : this.options.local.log(cwd, limit, signal)
  }
  stats(cwd: string | undefined, options: GitStatsOptions, signal?: AbortSignal): Promise<GitStatsReport> {
    if (this.capture(cwd, signal)) return Promise.reject(this.unsupported('stats'))
    return this.options.local.stats(cwd, options, signal)
  }
  commit(cwd: string | undefined, options: GitCommitOptions, signal?: AbortSignal): Promise<GitCommitInfo> {
    const capture = this.capture(cwd, signal)
    if (!capture) return this.options.local.commit(cwd, options, signal)
    if (
      options.provenance.sessionId !== capture.authority.sessionId ||
      options.provenance.runId !== capture.authority.runId
    )
      return Promise.reject(new HbarError('WORKSPACE_SCOPE', 'Git provenance does not match Host admission'))
    return this.call('git.commit', capture, cwd, {
      message: options.message,
      paths: options.paths ?? [],
      stage: options.stage ?? false,
      source: options.provenance.source,
    })
  }
  stage(cwd: string | undefined, paths: string[], signal?: AbortSignal) {
    const capture = this.capture(cwd, signal)
    return capture ? this.call('git.stage', capture, cwd, { paths }) : this.options.local.stage(cwd, paths, signal)
  }
  unstage(cwd: string | undefined, paths: string[], signal?: AbortSignal) {
    const capture = this.capture(cwd, signal)
    return capture ? this.call('git.unstage', capture, cwd, { paths }) : this.options.local.unstage(cwd, paths, signal)
  }
  branch(
    cwd: string | undefined,
    operation?: GitBranchOperation,
    signal?: AbortSignal,
  ): Promise<GitBranchInfo[] | GitBranchInfo> {
    if (this.capture(cwd, signal)) return Promise.reject(this.unsupported('branch'))
    return this.options.local.branch(cwd, operation, signal)
  }
  async createLaunchBranch(
    cwd: string | undefined,
    input: GitLaunchBranchCreateInput,
    signal?: AbortSignal,
  ): Promise<GitLaunchBranchCreateResult> {
    if (this.capture(cwd, signal)) throw this.unsupported('createLaunchBranch')
    if (!this.options.local.createLaunchBranch) throw this.unsupported('createLaunchBranch')
    return this.options.local.createLaunchBranch(cwd, input, signal)
  }
  worktree(
    cwd: string | undefined,
    operation?: GitWorktreeOperation,
    signal?: AbortSignal,
  ): Promise<GitWorktreeInfo[] | GitWorktreeInfo> {
    if (this.capture(cwd, signal)) return Promise.reject(this.unsupported('worktree'))
    return this.options.local.worktree(cwd, operation, signal)
  }
  launchBranchSnapshot(cwd?: string, signal?: AbortSignal): Promise<GitLaunchBranchSnapshot> {
    if (this.capture(cwd, signal)) return Promise.reject(this.unsupported('launchBranchSnapshot'))
    return this.options.local.launchBranchSnapshot(cwd, signal)
  }
  diffToRemote(cwd?: string, signal?: AbortSignal, paths?: string[]) {
    if (this.capture(cwd, signal)) return Promise.reject(this.unsupported('diffToRemote'))
    return this.options.local.diffToRemote(cwd, signal, paths)
  }
  dispose(): void {
    this.stopped.abort(new HbarError('EXECUTION_CLOSED', 'Node Git router is closing'))
  }
  private unsupported(method: string) {
    return new HbarError('NODE_GIT_METHOD_UNAVAILABLE', `Remote Git method ${method} is not available`)
  }
}
