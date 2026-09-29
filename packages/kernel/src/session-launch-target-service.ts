import { execFile } from 'node:child_process'
import { lstat, mkdir, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { PathLayout, StoragePort } from '@hbar/storage'
import { HbarError } from '@hbar/contracts'
import type { SessionLaunchSelection, SessionLaunchTarget } from '@hbar/contracts/commands/session-launch-target'
import type {
  SessionLaunchTargetBinding,
  SessionLaunchTargetBindingInput,
  SessionLaunchTargetResolutionRecord,
  SessionLaunchTargetRuntimeSnapshot,
} from '@hbar/storage'

const GIT_TIMEOUT_MS = 60_000
const GIT_OUTPUT_LIMIT = 512 * 1024
const HEAD_PATTERN = /^[0-9a-f]{40,64}$/i

interface GitResult {
  code: number
  stdout: string
  stderr: string
}

interface GitWorktree {
  path: string
  head: string | null
  branch: string | null
}

interface ActivePreparation {
  revision: number
  controller: AbortController
  promise: Promise<SessionLaunchTarget>
}

interface PreparedTarget {
  path: string
  branch: string | null
  head: string | null
}

function inside(root: string, candidate: string): boolean {
  const value = relative(root, candidate)
  return value === '' || (!value.startsWith(`..${sep}`) && value !== '..' && !isAbsolute(value))
}

function samePath(left: string, right: string): boolean {
  const a = resolve(left).replace(/[\\/]+$/, '')
  const b = resolve(right).replace(/[\\/]+$/, '')
  return process.platform === 'win32' ? a.toLocaleLowerCase() === b.toLocaleLowerCase() : a === b
}

function abortError() {
  return new HbarError('USER_CANCELLED', 'Launch-target preparation was cancelled; no worktree was removed')
}

function gitEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_PAGER: 'cat',
    GIT_EDITOR: 'false',
    LANG: 'C',
    LC_ALL: 'C',
  }
  for (const key of ['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'HOME', 'USERPROFILE']) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }
  return env
}

function runGit(cwd: string, args: string[], signal: AbortSignal): Promise<GitResult> {
  signal.throwIfAborted()
  return new Promise((resolveResult, reject) => {
    const child = execFile(
      'git',
      args,
      {
        cwd,
        env: gitEnvironment(),
        encoding: 'utf8',
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: GIT_OUTPUT_LIMIT,
        windowsHide: true,
        shell: false,
        signal,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolveResult({ code: 0, stdout: String(stdout), stderr: String(stderr) })
          return
        }
        const processError = error as NodeJS.ErrnoException
        if (typeof processError.code === 'number') {
          resolveResult({ code: processError.code, stdout: String(stdout), stderr: String(stderr) })
          return
        }
        reject(error)
      },
    )
    child.on('error', reject)
  })
}

function output(result: GitResult, code: string, message: string): string {
  if (result.code !== 0) throw new HbarError(code, message)
  return result.stdout.trim()
}

function parseWorktrees(text: string): GitWorktree[] {
  return text
    .split(/(?:\r?\n){2,}/)
    .map((block) => {
      const path = block
        .split(/\r?\n/)
        .find((line) => line.startsWith('worktree '))
        ?.slice('worktree '.length)
      if (!path) return null
      return {
        path,
        head:
          block
            .split(/\r?\n/)
            .find((line) => line.startsWith('HEAD '))
            ?.slice(5) ?? null,
        branch:
          block
            .split(/\r?\n/)
            .find((line) => line.startsWith('branch '))
            ?.slice(7) ?? null,
      }
    })
    .filter((entry): entry is GitWorktree => entry !== null)
}

function safeGitError(error: unknown): never {
  if (error instanceof HbarError) throw error
  if (error instanceof Error && 'code' in error && error.code === 'ABORT_ERR') throw abortError()
  throw new HbarError(
    'SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED',
    'Git did not confirm the launch-target result; reconcile before retrying',
  )
}

export class SessionLaunchTargetService {
  private readonly active = new Map<string, ActivePreparation>()
  private closing = false

  constructor(
    private readonly storage: StoragePort,
    private readonly layout: PathLayout,
    private readonly executeGit = runGit,
  ) {}

  async get(sessionId: string): Promise<SessionLaunchTarget> {
    return this.storage.call('sessionLaunchTarget', sessionId)
  }

  async set(input: {
    actorId: string
    idempotencyKey: string
    sessionId: string
    expectedRevision: number
    selection: SessionLaunchSelection
  }) {
    return this.storage.call('setSessionLaunchTarget', input)
  }

  async prepare(sessionId: string, expectedRevision: number, signal?: AbortSignal): Promise<SessionLaunchTarget> {
    if (this.closing) throw new HbarError('BUSY', 'Host is shutting down')
    const externalSignal = signal
    if (externalSignal?.aborted) throw abortError()
    const controller = new AbortController()
    const onAbort = () => controller.abort(externalSignal?.reason ?? abortError())
    externalSignal?.addEventListener('abort', onAbort, { once: true })
    const prior = this.active.get(sessionId)
    if (prior) {
      externalSignal?.removeEventListener('abort', onAbort)
      if (prior.revision !== expectedRevision)
        throw new HbarError('BUSY', 'Another launch-target revision is being prepared')
      return prior.promise
    }
    const promise = this.prepareInternal(sessionId, expectedRevision, controller.signal)
    this.active.set(sessionId, { revision: expectedRevision, controller, promise })
    try {
      return await promise
    } finally {
      externalSignal?.removeEventListener('abort', onAbort)
      if (this.active.get(sessionId)?.promise === promise) this.active.delete(sessionId)
    }
  }

  async reconcile(sessionId: string, expectedRevision: number, signal?: AbortSignal): Promise<SessionLaunchTarget> {
    const runtime = await this.storage.call('sessionLaunchTargetRuntime', sessionId)
    if (runtime.target.revision !== expectedRevision)
      throw new HbarError('COMMAND_CONFLICT', 'Session launch target revision changed')
    if (!runtime.resolution || !['preparing', 'reconciling', 'ready'].includes(runtime.resolution.state))
      return this.prepare(sessionId, expectedRevision, signal)
    return this.prepare(sessionId, expectedRevision, signal)
  }

  async cancel(sessionId: string, expectedRevision: number): Promise<SessionLaunchTarget> {
    const active = this.active.get(sessionId)
    if (active && active.revision === expectedRevision) {
      active.controller.abort(abortError())
      await active.promise.catch(() => undefined)
      return this.get(sessionId)
    }
    const runtime = await this.storage.call('sessionLaunchTargetRuntime', sessionId)
    if (runtime.target.revision !== expectedRevision)
      throw new HbarError('COMMAND_CONFLICT', 'Session launch target revision changed')
    if (runtime.resolution?.state === 'ready') return runtime.target
    if (runtime.resolution && ['preparing', 'reconciling'].includes(runtime.resolution.state)) {
      await this.storage.call('updateSessionLaunchTargetPreparation', {
        sessionId,
        revision: expectedRevision,
        targetPath: runtime.resolution.targetPath,
        state: 'reconciling',
        errorCode: 'SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED',
        errorMessage: 'The preparation was interrupted; inspect the exact managed path before retrying',
      })
    }
    return this.get(sessionId)
  }

  async bindForRun(sessionId: string, signal?: AbortSignal): Promise<SessionLaunchTargetBindingInput> {
    const runtime = await this.storage.call('sessionLaunchTargetRuntime', sessionId)
    if (runtime.binding) {
      await this.verifyBoundTarget(runtime, signal)
      return this.bindingInput(runtime.binding)
    }
    const target = runtime.target
    if (target.locked)
      throw new HbarError('SESSION_LAUNCH_TARGET_LOCKED', 'The accepted session target could not be reconciled')
    const prepared = await this.prepare(sessionId, target.revision, signal)
    if (prepared.revision !== target.revision)
      throw new HbarError('COMMAND_CONFLICT', 'Session launch target revision changed')
    const ready = await this.storage.call('sessionLaunchTargetRuntime', sessionId)
    if (!ready.resolution || ready.resolution.state !== 'ready')
      throw new HbarError('SESSION_LAUNCH_TARGET_UNRESOLVED', 'Prepare the selected worktree before accepting a Run')
    return {
      sessionId,
      expectedRevision: ready.target.revision,
      selection: ready.target.selection,
      targetPath: ready.resolution.targetPath,
      branch: ready.resolution.branch,
      head: ready.resolution.resolvedHead,
    }
  }

  async workspaceForRun(sessionId: string, workspacePath: string, signal?: AbortSignal): Promise<string> {
    const runtime = await this.storage.call('sessionLaunchTargetRuntime', sessionId)
    const targetPath = runtime.binding?.targetPath ?? workspacePath
    if (runtime.binding) await this.verifyBoundTarget(runtime, signal)
    else if (runtime.target.selection.mode !== 'shared-current')
      throw new HbarError('SESSION_LAUNCH_TARGET_UNRESOLVED', 'The session worktree has not been accepted and bound')
    return targetPath
  }

  async isBoundWorktreeExecutionRoot(workspacePath: string): Promise<boolean> {
    let canonicalPath: string
    try {
      canonicalPath = await realpath(workspacePath)
    } catch {
      return false
    }
    let managedRoot: string
    try {
      managedRoot = await realpath(this.layout.worktrees)
    } catch {
      return false
    }
    if (!inside(managedRoot, canonicalPath) || samePath(managedRoot, canonicalPath)) return false
    const binding = await this.storage.call('sessionLaunchTargetBindingForPath', canonicalPath)
    return Boolean(binding && samePath(binding.targetPath, canonicalPath))
  }

  async close(): Promise<void> {
    this.closing = true
    const active = [...this.active.values()]
    for (const preparation of active)
      preparation.controller.abort(new HbarError('HOST_SHUTTING_DOWN', 'Host shutting down'))
    await Promise.all(active.map((preparation) => preparation.promise.catch(() => undefined)))
  }

  private bindingInput(binding: SessionLaunchTargetBinding): SessionLaunchTargetBindingInput {
    return {
      sessionId: binding.sessionId,
      expectedRevision: binding.expectedRevision,
      selection: binding.selection,
      targetPath: binding.targetPath,
      branch: binding.branch,
      head: binding.head,
    }
  }

  private async prepareInternal(
    sessionId: string,
    expectedRevision: number,
    signal: AbortSignal,
  ): Promise<SessionLaunchTarget> {
    signal.throwIfAborted()
    let runtime = await this.storage.call('sessionLaunchTargetRuntime', sessionId)
    if (runtime.target.revision !== expectedRevision)
      throw new HbarError('COMMAND_CONFLICT', 'Session launch target revision changed')
    if (runtime.binding) {
      await this.verifyBoundTarget(runtime, signal)
      return this.get(sessionId)
    }
    if (runtime.target.locked)
      throw new HbarError('SESSION_LAUNCH_TARGET_LOCKED', 'The launch target is already locked')
    const session = await this.storage.call('session', sessionId)
    const workspace = await this.storage.call('workspace', session.workspaceId)
    if (runtime.target.selection.mode === 'shared-current') {
      const targetPath = await realpath(workspace.path)
      const intent = await this.storage.call('beginSessionLaunchTargetPreparation', {
        sessionId,
        expectedRevision,
        selection: runtime.target.selection,
        targetPath,
        branch: null,
        requestedHead: null,
      })
      if (intent.state !== 'ready')
        await this.storage.call('updateSessionLaunchTargetPreparation', {
          sessionId,
          revision: expectedRevision,
          targetPath,
          state: 'ready',
          resolvedHead: null,
        })
      return this.get(sessionId)
    }

    const selection = runtime.target.selection
    const managed = await this.managedPaths(sessionId, expectedRevision, workspace.path, signal)
    runtime = await this.storage.call('sessionLaunchTargetRuntime', sessionId)
    let prior = runtime.resolution
    if (prior?.state === 'ready') {
      try {
        await this.verifyPreparedWorktree(managed, prior, signal)
      } catch (error) {
        await this.storeFailure(
          prior,
          error instanceof HbarError
            ? error
            : new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED', 'The prepared worktree could not be verified'),
        )
        throw error
      }
      return this.get(sessionId)
    }
    if (prior && (prior.state === 'preparing' || prior.state === 'reconciling')) {
      const reconciled = await this.reconcileIntent(managed, prior, signal)
      if (reconciled) return this.get(sessionId)
      runtime = await this.storage.call('sessionLaunchTargetRuntime', sessionId)
      prior = runtime.resolution
    }

    let requestedHead: string | null = null
    let partialBranch = Boolean(prior && ['preparing', 'reconciling'].includes(prior.state))
    try {
      const worktrees = await this.listWorktrees(managed.gitRoot, signal)
      if (selection.branch.kind === 'existing') {
        requestedHead = await this.resolveBranchHead(managed.gitRoot, selection.branch.name, signal)
        this.assertBranchAvailable(worktrees, selection.branch.name, managed.targetPath)
      } else {
        requestedHead = await this.resolveCommit(managed.gitRoot, selection.branch.startPoint ?? 'HEAD', signal)
        const branchHead = await this.tryResolveBranchHead(managed.gitRoot, selection.branch.name, signal)
        if (branchHead && !(partialBranch && branchHead === requestedHead))
          throw new HbarError(
            'BRANCH_EXISTS',
            'The selected new branch already exists; choose it as an existing branch',
          )
        if (branchHead) partialBranch = true
        this.assertBranchAvailable(worktrees, selection.branch.name, managed.targetPath)
      }
      await this.assertTargetPathAvailable(managed, worktrees)
    } catch (error) {
      await this.recordPreflightFailure(
        sessionId,
        expectedRevision,
        selection,
        managed.targetPath,
        requestedHead,
        error,
      )
      throw error
    }

    signal.throwIfAborted()
    const intent = await this.storage.call('beginSessionLaunchTargetPreparation', {
      sessionId,
      expectedRevision,
      selection,
      targetPath: managed.targetPath,
      branch: selection.branch.name,
      requestedHead,
    })
    if (intent.state === 'ready') {
      try {
        await this.verifyPreparedWorktree(managed, intent, signal)
      } catch (error) {
        await this.storeFailure(
          intent,
          error instanceof HbarError
            ? error
            : new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED', 'The prepared worktree could not be verified'),
        )
        throw error
      }
      return this.get(sessionId)
    }

    try {
      await mkdir(managed.sessionRoot, { recursive: true })
      await this.assertSafeManagedRoot(managed.gitRoot, managed.root, managed.targetPath)
      await this.assertTargetPathAbsent(managed.targetPath)
      const args =
        selection.branch.kind === 'new' && !partialBranch
          ? ['worktree', 'add', '-b', selection.branch.name, managed.targetPath, requestedHead!]
          : ['worktree', 'add', managed.targetPath, selection.branch.name]
      const result = await this.executeGit(managed.gitRoot, args, signal)
      if (result.code !== 0)
        throw new HbarError('GIT_OPERATION_FAILED', 'Git could not create the selected managed worktree')
      const inspected = await this.inspectTarget(managed, selection.branch.name, signal)
      if (inspected.head !== requestedHead)
        throw new HbarError(
          'SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT',
          'The worktree branch changed while it was being prepared',
        )
      await this.storage.call('updateSessionLaunchTargetPreparation', {
        sessionId,
        revision: expectedRevision,
        targetPath: managed.targetPath,
        state: 'ready',
        resolvedHead: inspected.head,
      })
      signal.throwIfAborted()
      return this.get(sessionId)
    } catch (error) {
      const outcome = await this.reconcileAfterMutation(managed, intent, error)
      if (signal.aborted) throw abortError()
      if (outcome === 'ready') return this.get(sessionId)
      if (outcome === 'unknown')
        throw new HbarError(
          'SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED',
          'Git may have changed the selected branch; reconcile before retrying',
        )
      throw error
    }
  }

  private async managedPaths(sessionId: string, revision: number, workspacePath: string, signal: AbortSignal) {
    const root = await realpath(this.layout.worktrees)
    const dataRoot = await realpath(this.layout.dataRoot)
    if (!inside(dataRoot, root) || samePath(dataRoot, root))
      throw new HbarError(
        'SESSION_LAUNCH_TARGET_INVALID_ROOT',
        'Host worktree storage must be inside the Host data root',
      )
    const requestedTarget = resolve(root, sessionId, `r${revision}`)
    const sessionRoot = resolve(root, sessionId)
    if (!inside(root, sessionRoot) || !inside(root, requestedTarget))
      throw new HbarError('SESSION_LAUNCH_TARGET_INVALID_ROOT', 'Session worktree path escaped Host storage')
    const targetPath = requestedTarget
    let gitRoot: string
    try {
      gitRoot = await realpath(
        output(
          await this.executeGit(await realpath(workspacePath), ['rev-parse', '--show-toplevel'], signal),
          'GIT_NOT_REPOSITORY',
          'The selected workspace is not a Git repository',
        ),
      )
    } catch (error) {
      if (error instanceof HbarError && error.code === 'GIT_NOT_REPOSITORY') throw error
      safeGitError(error)
    }
    const rootCandidate = gitRoot!
    const commonRelative = output(
      await this.executeGit(rootCandidate, ['rev-parse', '--git-common-dir'], signal),
      'GIT_NOT_REPOSITORY',
      'The selected workspace is not a Git repository',
    )
    const repository = await realpath(
      isAbsolute(commonRelative) ? commonRelative : resolve(rootCandidate, commonRelative),
    )
    const worktreeResult = await this.executeGit(rootCandidate, ['worktree', 'list', '--porcelain'], signal)
    if (worktreeResult.code !== 0)
      throw new HbarError('GIT_OPERATION_FAILED', 'Git could not inspect repository worktrees')
    const worktreePaths = parseWorktrees(worktreeResult.stdout).map((entry) => resolve(entry.path))
    const currentIsManaged = inside(root, rootCandidate)
    if (currentIsManaged && !worktreePaths.some((path) => samePath(path, rootCandidate)))
      throw new HbarError(
        'SESSION_LAUNCH_TARGET_INVALID_ROOT',
        'Frozen worktree is not registered with its source repository',
      )
    const sourceWorktrees = worktreePaths.filter((path) => !inside(root, path))
    if (
      sourceWorktrees.length === 0 ||
      sourceWorktrees.some((path) => inside(path, root) || inside(root, path)) ||
      (!currentIsManaged && inside(rootCandidate, root))
    )
      throw new HbarError(
        'SESSION_LAUNCH_TARGET_INVALID_ROOT',
        'Host worktree storage must be outside the source repository',
      )
    return { root, sessionRoot, targetPath, gitRoot: rootCandidate, repository }
  }

  private async assertSafeManagedRoot(gitRoot: string, root: string, targetPath: string) {
    const canonicalRoot = await realpath(root)
    if (!inside(canonicalRoot, targetPath) || inside(gitRoot, canonicalRoot) || inside(canonicalRoot, gitRoot))
      throw new HbarError(
        'SESSION_LAUNCH_TARGET_INVALID_ROOT',
        'Managed worktree path is outside its bounded Host root',
      )
    try {
      const canonicalTarget = await realpath(targetPath)
      if (!inside(canonicalRoot, canonicalTarget))
        throw new HbarError('SESSION_LAUNCH_TARGET_INVALID_ROOT', 'Managed target resolves outside Host storage')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  private assertTargetPathAbsent(targetPath: string) {
    return lstat(targetPath).then(
      () => {
        throw new HbarError('SESSION_LAUNCH_TARGET_PATH_OCCUPIED', 'The managed target path already contains data')
      },
      (error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      },
    )
  }

  private async assertTargetPathAvailable(managed: { targetPath: string }, worktrees: GitWorktree[]) {
    const entry = worktrees.find((item) => samePath(item.path, managed.targetPath))
    if (entry) return
    try {
      await lstat(managed.targetPath)
      throw new HbarError('SESSION_LAUNCH_TARGET_PATH_OCCUPIED', 'The managed target path already contains data')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  private assertBranchAvailable(worktrees: GitWorktree[], branch: string, targetPath: string) {
    const entry = worktrees.find((item) => item.branch === `refs/heads/${branch}`)
    if (entry && !samePath(entry.path, targetPath))
      throw new HbarError('BRANCH_IN_USE', 'The selected branch is already checked out in another worktree')
  }

  private async listWorktrees(repository: string, signal: AbortSignal) {
    const result = await this.executeGit(repository, ['worktree', 'list', '--porcelain'], signal)
    if (result.code !== 0) throw new HbarError('GIT_OPERATION_FAILED', 'Git could not inspect worktrees')
    return parseWorktrees(result.stdout)
  }

  private async resolveCommit(repository: string, reference: string, signal: AbortSignal) {
    const result = await this.executeGit(
      repository,
      ['rev-parse', '--verify', '--end-of-options', `${reference}^{commit}`],
      signal,
    )
    const value = output(result, 'GIT_REF_NOT_FOUND', 'The selected starting point does not resolve to a commit')
    if (!HEAD_PATTERN.test(value))
      throw new HbarError('GIT_OPERATION_FAILED', 'Git returned an invalid commit identifier')
    return value.toLowerCase()
  }

  private async resolveBranchHead(repository: string, branch: string, signal: AbortSignal) {
    const valid = await this.executeGit(repository, ['check-ref-format', `refs/heads/${branch}`], signal)
    if (valid.code !== 0) throw new HbarError('GIT_INVALID_BRANCH', 'The selected branch name is invalid')
    const result = await this.executeGit(
      repository,
      ['rev-parse', '--verify', '--end-of-options', `refs/heads/${branch}^{commit}`],
      signal,
    )
    const value = output(result, 'BRANCH_NOT_FOUND', 'The selected branch does not exist in this repository')
    if (!HEAD_PATTERN.test(value))
      throw new HbarError('GIT_OPERATION_FAILED', 'Git returned an invalid commit identifier')
    return value.toLowerCase()
  }

  private async tryResolveBranchHead(repository: string, branch: string, signal: AbortSignal): Promise<string | null> {
    const valid = await this.executeGit(repository, ['check-ref-format', `refs/heads/${branch}`], signal)
    if (valid.code !== 0) throw new HbarError('GIT_INVALID_BRANCH', 'The selected branch name is invalid')
    const result = await this.executeGit(
      repository,
      ['rev-parse', '--verify', '--end-of-options', `refs/heads/${branch}^{commit}`],
      signal,
    )
    if (result.code !== 0) return null
    const value = result.stdout.trim()
    if (!HEAD_PATTERN.test(value))
      throw new HbarError('GIT_OPERATION_FAILED', 'Git returned an invalid commit identifier')
    return value.toLowerCase()
  }

  private async inspectTarget(
    managed: { targetPath: string; root: string; gitRoot: string; repository: string },
    branch: string,
    signal: AbortSignal,
  ): Promise<PreparedTarget> {
    const canonicalRoot = await realpath(managed.root)
    const canonicalTarget = await realpath(managed.targetPath)
    if (!inside(canonicalRoot, canonicalTarget) || !samePath(canonicalTarget, managed.targetPath))
      throw new HbarError('SESSION_LAUNCH_TARGET_INVALID_ROOT', 'Managed worktree resolves outside Host storage')
    const top = output(
      await this.executeGit(canonicalTarget, ['rev-parse', '--show-toplevel'], signal),
      'SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT',
      'Managed target is not the selected repository worktree',
    )
    if (!samePath(await realpath(top), canonicalTarget))
      throw new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT', 'Managed target is not a repository root')
    const actualBranch = output(
      await this.executeGit(canonicalTarget, ['symbolic-ref', '--quiet', '--short', 'HEAD'], signal),
      'SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT',
      'Managed worktree is detached from its selected branch',
    )
    if (actualBranch !== branch)
      throw new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT', 'Managed worktree is attached to another branch')
    const commonValue = output(
      await this.executeGit(canonicalTarget, ['rev-parse', '--git-common-dir'], signal),
      'SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT',
      'Managed worktree is not linked to the selected repository',
    )
    const common = await realpath(isAbsolute(commonValue) ? commonValue : resolve(canonicalTarget, commonValue))
    if (!samePath(common, managed.repository))
      throw new HbarError(
        'SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT',
        'Managed worktree is linked to another repository',
      )
    const head = output(
      await this.executeGit(canonicalTarget, ['rev-parse', '--verify', 'HEAD^{commit}'], signal),
      'SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT',
      'Managed worktree has no valid HEAD',
    )
    if (!HEAD_PATTERN.test(head))
      throw new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT', 'Managed worktree has an invalid HEAD')
    return { path: canonicalTarget, branch, head: head.toLowerCase() }
  }

  private async reconcileIntent(
    managed: { targetPath: string; root: string; gitRoot: string; repository: string },
    intent: SessionLaunchTargetResolutionRecord,
    signal: AbortSignal,
  ): Promise<boolean> {
    const selection = intent.selection
    if (selection.mode !== 'isolated-worktree') return false
    try {
      const worktrees = await this.listWorktrees(managed.gitRoot, signal)
      const entry = worktrees.find((item) => samePath(item.path, intent.targetPath))
      if (entry) {
        const inspected = await this.inspectTarget(managed, selection.branch.name, signal)
        if (
          entry.head?.toLowerCase() !== intent.requestedHead?.toLowerCase() ||
          inspected.head !== intent.requestedHead?.toLowerCase()
        )
          throw new HbarError(
            'SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT',
            'Managed worktree HEAD differs from the persisted preparation intent',
          )
        await this.storage.call('updateSessionLaunchTargetPreparation', {
          sessionId: intent.sessionId,
          revision: intent.expectedRevision,
          targetPath: intent.targetPath,
          state: 'ready',
          resolvedHead: inspected.head,
        })
        return true
      }
      await this.assertTargetPathAbsent(intent.targetPath)
      const branchHead = await this.tryResolveBranchHead(managed.gitRoot, selection.branch.name, signal)
      if (branchHead && branchHead !== intent.requestedHead?.toLowerCase())
        throw new HbarError(
          'SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT',
          'The prepared branch has moved from its persisted starting point',
        )
      const used = worktrees.find((item) => item.branch === `refs/heads/${selection.branch.name}`)
      if (used) throw new HbarError('BRANCH_IN_USE', 'The selected branch is already checked out in another worktree')
      return false
    } catch (error) {
      if (error instanceof HbarError && error.code === 'SESSION_LAUNCH_TARGET_PATH_OCCUPIED') {
        await this.storeFailure(intent, error)
        throw error
      }
      if (error instanceof HbarError && error.code === 'SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT') {
        await this.storeFailure(intent, error)
        throw error
      }
      if (error instanceof HbarError && error.code === 'BRANCH_IN_USE') {
        await this.storeFailure(intent, error)
        throw error
      }
      if (signal.aborted) throw abortError()
      throw new HbarError(
        'SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED',
        'The prior Git result could not be reconciled safely',
      )
    }
  }

  private async reconcileAfterMutation(
    managed: { targetPath: string; root: string; gitRoot: string; repository: string },
    intent: SessionLaunchTargetResolutionRecord,
    error: unknown,
  ): Promise<'ready' | 'unknown' | 'failed'> {
    const selection = intent.selection
    if (selection.mode !== 'isolated-worktree') return 'failed'
    try {
      const worktrees = await this.listWorktrees(managed.gitRoot, new AbortController().signal)
      const entry = worktrees.find((item) => samePath(item.path, intent.targetPath))
      if (entry) {
        const inspected = await this.inspectTarget(managed, selection.branch.name, new AbortController().signal)
        if (
          entry.head?.toLowerCase() === intent.requestedHead?.toLowerCase() &&
          inspected.head === intent.requestedHead?.toLowerCase()
        ) {
          await this.storage.call('updateSessionLaunchTargetPreparation', {
            sessionId: intent.sessionId,
            revision: intent.expectedRevision,
            targetPath: intent.targetPath,
            state: 'ready',
            resolvedHead: inspected.head,
          })
          return 'ready'
        }
        const mismatch = new HbarError(
          'SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT',
          'Managed worktree does not match the persisted Git result',
        )
        await this.storeFailure(intent, mismatch)
        return 'failed'
      }
      try {
        await lstat(intent.targetPath)
        const occupied = new HbarError(
          'SESSION_LAUNCH_TARGET_PATH_OCCUPIED',
          'The managed target path already contains data',
        )
        await this.storeFailure(intent, occupied)
        return 'failed'
      } catch (pathError) {
        if ((pathError as NodeJS.ErrnoException).code !== 'ENOENT') throw pathError
      }
      const branchHead = await this.tryResolveBranchHead(
        managed.gitRoot,
        selection.branch.name,
        new AbortController().signal,
      )
      const used = await this.listWorktrees(managed.gitRoot, new AbortController().signal)
      if (used.some((item) => item.branch === `refs/heads/${selection.branch.name}`)) {
        const conflict = new HbarError(
          'BRANCH_IN_USE',
          'The selected branch is already checked out in another worktree',
        )
        await this.storeFailure(intent, conflict)
        return 'failed'
      }
      if (branchHead && branchHead !== intent.requestedHead?.toLowerCase()) {
        const conflict = new HbarError(
          'SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT',
          'The prepared branch has moved from its persisted starting point',
        )
        await this.storeFailure(intent, conflict)
        return 'failed'
      }
      await this.storage.call('updateSessionLaunchTargetPreparation', {
        sessionId: intent.sessionId,
        revision: intent.expectedRevision,
        targetPath: intent.targetPath,
        state: 'reconciling',
        errorCode: 'SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED',
        errorMessage: 'Git may have changed the branch without creating its worktree; reconcile before retrying',
      })
      return 'unknown'
    } catch (reconcileError) {
      const failure = reconcileError instanceof HbarError ? reconcileError : error
      if (
        failure instanceof HbarError &&
        ['BRANCH_IN_USE', 'SESSION_LAUNCH_TARGET_PATH_OCCUPIED', 'SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT'].includes(
          failure.code,
        )
      ) {
        await this.storeFailure(intent, failure)
        return 'failed'
      }
      await this.storage
        .call('updateSessionLaunchTargetPreparation', {
          sessionId: intent.sessionId,
          revision: intent.expectedRevision,
          targetPath: intent.targetPath,
          state: 'reconciling',
          errorCode: 'SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED',
          errorMessage: 'Git did not confirm the result; reconcile before retrying',
        })
        .catch(() => undefined)
      return 'unknown'
    }
  }

  private async recordPreflightFailure(
    sessionId: string,
    revision: number,
    selection: SessionLaunchSelection,
    targetPath: string,
    requestedHead: string | null,
    error: unknown,
  ) {
    if (!(error instanceof HbarError)) return
    const known = new Set([
      'BRANCH_IN_USE',
      'BRANCH_EXISTS',
      'BRANCH_NOT_FOUND',
      'GIT_INVALID_BRANCH',
      'GIT_REF_NOT_FOUND',
      'GIT_NOT_REPOSITORY',
      'SESSION_LAUNCH_TARGET_PATH_OCCUPIED',
      'SESSION_LAUNCH_TARGET_INVALID_ROOT',
    ])
    if (!known.has(error.code)) return
    try {
      const intent = await this.storage.call('beginSessionLaunchTargetPreparation', {
        sessionId,
        expectedRevision: revision,
        selection,
        targetPath,
        branch: selection.mode === 'isolated-worktree' ? selection.branch.name : null,
        requestedHead,
      })
      await this.storeFailure(intent, error)
    } catch {
      // The original safe validation error remains authoritative when no intent could be persisted.
    }
  }

  private async storeFailure(intent: SessionLaunchTargetResolutionRecord, error: HbarError) {
    await this.storage.call('updateSessionLaunchTargetPreparation', {
      sessionId: intent.sessionId,
      revision: intent.expectedRevision,
      targetPath: intent.targetPath,
      state: 'failed',
      resolvedHead: intent.resolvedHead,
      errorCode: error.code,
      errorMessage: error.message.slice(0, 1_000),
    })
  }

  private async verifyPreparedWorktree(
    managed: { targetPath: string; root: string; gitRoot: string; repository: string },
    intent: SessionLaunchTargetResolutionRecord,
    signal: AbortSignal,
  ) {
    if (intent.selection.mode !== 'isolated-worktree') return
    const inspected = await this.inspectTarget(managed, intent.selection.branch.name, signal)
    if (!intent.resolvedHead || inspected.head !== intent.resolvedHead.toLowerCase())
      throw new HbarError(
        'SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT',
        'Managed worktree no longer matches its prepared state',
      )
  }

  private async verifyBoundTarget(runtime: SessionLaunchTargetRuntimeSnapshot, signal?: AbortSignal): Promise<void> {
    const binding = runtime.binding
    if (!binding) return
    if (binding.selection.mode === 'shared-current') {
      const workspace = await this.storage.call('workspace', runtime.target.workspaceId)
      if (!samePath(await realpath(workspace.path), binding.targetPath))
        throw new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT', 'The frozen shared workspace path changed')
      return
    }
    const managed = await this.managedPaths(
      binding.sessionId,
      binding.expectedRevision,
      binding.targetPath,
      signal ?? new AbortController().signal,
    )
    if (!samePath(managed.targetPath, binding.targetPath))
      throw new HbarError('SESSION_LAUNCH_TARGET_INVALID_ROOT', 'Frozen worktree path is not Host managed')
    try {
      const inspected = await this.inspectTarget(
        managed,
        binding.selection.branch.name,
        signal ?? new AbortController().signal,
      )
      if (inspected.branch !== binding.branch)
        throw new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT', 'Frozen worktree branch changed')
    } catch (error) {
      const current = await this.storage.call('sessionLaunchTargetRuntime', binding.sessionId)
      if (current.resolution)
        await this.storeFailure(
          current.resolution,
          error instanceof HbarError
            ? error
            : new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED', 'Frozen worktree could not be verified'),
        )
      throw error
    }
  }
}
