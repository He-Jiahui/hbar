import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { PathLayout, StoragePort } from '@hbar/storage'
import { HbarError } from '@hbar/contracts'
import { sessionLaunchDerivedBranchNameSchema } from '@hbar/contracts/commands/session-launch-target'
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
const MAX_PREPARATION_MS = 90_000
const RECONCILIATION_TIMEOUT_MS = 15_000
const MAX_CONCURRENT_GIT_COMMANDS = 4
const MAX_QUEUED_GIT_COMMANDS = 64

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

interface SharedCheckoutState {
  branchRef: string | null
  head: string | null
  selectedRefHead: string | null
}

interface CheckoutRootResult {
  path: string
  isRepository: boolean
}

export type SharedBranchCheckoutGuard = (sessionId: string, checkoutRoot: string, signal: AbortSignal) => Promise<void>

interface GitWaiter {
  signal: AbortSignal
  resolve: (release: () => void) => void
  reject: (error: unknown) => void
  onAbort: () => void
}

class GitCommandLimiter {
  private running = 0
  private readonly waiters: GitWaiter[] = []

  constructor(private readonly limit: number) {}

  acquire(signal: AbortSignal): Promise<() => void> {
    signal.throwIfAborted()
    if (this.running < this.limit && this.waiters.length === 0) {
      this.running++
      return Promise.resolve(this.createRelease())
    }
    if (this.waiters.length >= MAX_QUEUED_GIT_COMMANDS)
      throw new HbarError('BUSY', 'Host Git command capacity is full; retry after current work completes')
    return new Promise((resolveRelease, reject) => {
      const waiter: GitWaiter = {
        signal,
        resolve: resolveRelease,
        reject,
        onAbort: () => {
          const index = this.waiters.indexOf(waiter)
          if (index < 0) return
          this.waiters.splice(index, 1)
          reject(signalFailure(signal))
        },
      }
      this.waiters.push(waiter)
      signal.addEventListener('abort', waiter.onAbort, { once: true })
      if (signal.aborted) waiter.onAbort()
    })
  }

  private createRelease(): () => void {
    let released = false
    return () => {
      if (released) return
      released = true
      this.running--
      while (this.running < this.limit && this.waiters.length) {
        const waiter = this.waiters.shift()!
        waiter.signal.removeEventListener('abort', waiter.onAbort)
        if (waiter.signal.aborted) {
          waiter.reject(signalFailure(waiter.signal))
          continue
        }
        this.running++
        waiter.resolve(this.createRelease())
      }
    }
  }
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

function sameSelection(left: SessionLaunchSelection, right: SessionLaunchSelection): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function worktreeBranchName(selection: SessionLaunchSelection, sessionId: string, revision: number): string | null {
  if (selection.mode === 'shared-current') return null
  if (selection.mode === 'shared-branch') return selection.branch.ref.slice('refs/heads/'.length)
  if (selection.branch.kind !== 'derived') return selection.branch.name
  const hash = createHash('sha256').update(`${sessionId}\0${revision}`).digest('hex')
  return sessionLaunchDerivedBranchNameSchema.parse(`hbar/session-launch/${hash}`)
}

function abortError() {
  return new HbarError('USER_CANCELLED', 'Launch-target preparation was cancelled; no worktree was removed')
}

function signalFailure(signal: AbortSignal): HbarError {
  return signal.reason instanceof HbarError ? signal.reason : abortError()
}

function waitForWithSignal<Value>(promise: Promise<Value>, signal?: AbortSignal): Promise<Value> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(signalFailure(signal))
  return new Promise((resolveValue, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort)
      reject(signalFailure(signal))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolveValue(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
    if (signal.aborted) onAbort()
  })
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
    .split('\0')
    .reduce<string[][]>((blocks, field) => {
      if (field === '') {
        if (blocks.at(-1)?.length) blocks.push([])
      } else {
        if (blocks.length === 0) blocks.push([])
        blocks.at(-1)!.push(field)
      }
      return blocks
    }, [])
    .map((block) => {
      const path = block.find((field) => field.startsWith('worktree '))?.slice('worktree '.length)
      if (!path) return null
      const head = block.find((field) => field.startsWith('HEAD '))?.slice(5) ?? null
      const branch = block.find((field) => field.startsWith('branch '))?.slice(7) ?? null
      return {
        path,
        head,
        branch,
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
  private readonly trackedOperations = new Set<Promise<unknown>>()
  private readonly gitLimiter = new GitCommandLimiter(MAX_CONCURRENT_GIT_COMMANDS)
  private readonly closingController = new AbortController()
  private closing = false

  constructor(
    private readonly storage: StoragePort,
    private readonly layout: PathLayout,
    private readonly executeGit = runGit,
    private readonly guardSharedBranchCheckout?: SharedBranchCheckoutGuard,
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

  checkoutRootForWorkspace(workspacePath: string, signal?: AbortSignal): Promise<string> {
    return this.trackOperation(async () => {
      const canonicalWorkspace = await realpath(workspacePath)
      try {
        const result = await this.resolveCheckoutRoot(canonicalWorkspace, signal ?? new AbortController().signal)
        return result.path
      } catch (error) {
        if (
          signal?.aborted ||
          (error instanceof HbarError && ['HOST_SHUTTING_DOWN', 'USER_CANCELLED'].includes(error.code))
        )
          throw error
        return canonicalWorkspace
      }
    })
  }

  private trackOperation<Value>(action: () => Promise<Value>): Promise<Value> {
    if (this.closing) return Promise.reject(new HbarError('HOST_SHUTTING_DOWN', 'Host shutting down'))
    const operation = action()
    this.trackedOperations.add(operation)
    void operation.then(
      () => this.trackedOperations.delete(operation),
      () => this.trackedOperations.delete(operation),
    )
    return operation
  }

  private async git(cwd: string, args: string[], signal: AbortSignal): Promise<GitResult> {
    const gitSignal = AbortSignal.any([signal, this.closingController.signal])
    const release = await this.gitLimiter.acquire(gitSignal)
    try {
      gitSignal.throwIfAborted()
      try {
        return await this.executeGit(cwd, args, gitSignal)
      } catch (error) {
        if (gitSignal.aborted) throw signalFailure(gitSignal)
        throw error
      }
    } finally {
      release()
    }
  }

  private async resolveCheckoutRoot(workspacePath: string, signal: AbortSignal): Promise<CheckoutRootResult> {
    const canonicalWorkspace = await realpath(workspacePath)
    const result = await this.git(canonicalWorkspace, ['rev-parse', '--show-toplevel'], signal)
    if (result.code !== 0) {
      const diagnostic = `${result.stderr}\n${result.stdout}`
      if (/not a git repository/i.test(diagnostic)) return { path: canonicalWorkspace, isRepository: false }
      throw new HbarError('GIT_REPOSITORY_UNAVAILABLE', 'Git could not identify the registered workspace checkout')
    }
    const rootText = result.stdout.trim()
    if (!rootText) throw new HbarError('GIT_REPOSITORY_UNAVAILABLE', 'Git returned an empty checkout root')
    const checkoutRoot = await realpath(isAbsolute(rootText) ? rootText : resolve(canonicalWorkspace, rootText))
    if (!inside(checkoutRoot, canonicalWorkspace))
      throw new HbarError('GIT_REPOSITORY_SCOPE', 'The workspace is outside its Git checkout root')
    return { path: checkoutRoot, isRepository: true }
  }

  private async readSharedCheckoutState(
    checkoutRoot: string,
    ref: string,
    signal: AbortSignal,
  ): Promise<SharedCheckoutState> {
    const branchName = ref.slice('refs/heads/'.length)
    const [symbolic, head, selectedRefHead] = await Promise.all([
      this.git(checkoutRoot, ['symbolic-ref', '--quiet', 'HEAD'], signal),
      this.git(checkoutRoot, ['rev-parse', '--verify', '--quiet', '--end-of-options', 'HEAD^{commit}'], signal),
      this.tryResolveBranchHead(checkoutRoot, branchName, signal),
    ])
    if (symbolic.code !== 0 && symbolic.code !== 1)
      throw new HbarError('GIT_OPERATION_FAILED', 'Git could not inspect the current shared branch')
    const headValue = head.code === 0 ? head.stdout.trim() : null
    if (headValue !== null && !HEAD_PATTERN.test(headValue))
      throw new HbarError('GIT_OPERATION_FAILED', 'Git returned an invalid shared HEAD')
    return {
      branchRef: symbolic.code === 0 ? symbolic.stdout.trim() || null : null,
      head: headValue?.toLowerCase() ?? null,
      selectedRefHead,
    }
  }

  private sharedBranchIsReady(state: SharedCheckoutState, intent: SessionLaunchTargetResolutionRecord): boolean {
    const selection = intent.selection
    if (selection.mode !== 'shared-branch') return false
    const expectedHead = selection.branch.tipOid.toLowerCase()
    return (
      state.branchRef === selection.branch.ref &&
      state.head === expectedHead &&
      state.selectedRefHead === expectedHead &&
      intent.branch === selection.branch.ref.slice('refs/heads/'.length) &&
      intent.requestedHead?.toLowerCase() === expectedHead
    )
  }

  private async persistSharedBranchReconciliation(
    intent: SessionLaunchTargetResolutionRecord,
    message: string,
  ): Promise<void> {
    await this.storage.call('updateSessionLaunchTargetPreparation', {
      sessionId: intent.sessionId,
      revision: intent.expectedRevision,
      targetPath: intent.targetPath,
      state: 'reconciling',
      errorCode: 'SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED',
      errorMessage: message,
    })
  }

  async prepare(sessionId: string, expectedRevision: number, signal?: AbortSignal): Promise<SessionLaunchTarget> {
    if (this.closing) throw new HbarError('BUSY', 'Host is shutting down')
    const externalSignal = signal
    if (externalSignal?.aborted) throw abortError()
    const prior = this.active.get(sessionId)
    if (prior) {
      if (prior.revision !== expectedRevision)
        throw new HbarError('BUSY', 'Another launch-target revision is being prepared')
      return waitForWithSignal(prior.promise, externalSignal)
    }
    const controller = new AbortController()
    const onAbort = () => controller.abort(abortError())
    externalSignal?.addEventListener('abort', onAbort, { once: true })
    const timeout = setTimeout(
      () =>
        controller.abort(new HbarError('SESSION_LAUNCH_TARGET_TIMEOUT', 'Worktree preparation exceeded 90 seconds')),
      MAX_PREPARATION_MS,
    )
    const promise = this.prepareInternal(sessionId, expectedRevision, controller.signal)
    this.active.set(sessionId, { revision: expectedRevision, controller, promise })
    try {
      return await promise
    } finally {
      clearTimeout(timeout)
      externalSignal?.removeEventListener('abort', onAbort)
      if (this.active.get(sessionId)?.promise === promise) this.active.delete(sessionId)
    }
  }

  reconcile(sessionId: string, expectedRevision: number, signal?: AbortSignal): Promise<SessionLaunchTarget> {
    return this.trackOperation(() => this.reconcileInternal(sessionId, expectedRevision, signal))
  }

  reconcileCancelledPreparation(
    sessionId: string,
    expectedRevision: number,
    signal?: AbortSignal,
  ): Promise<SessionLaunchTarget> {
    const controller = new AbortController()
    const timeout = setTimeout(
      () =>
        controller.abort(
          new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED', 'Cancellation reconciliation exceeded 15 seconds'),
        ),
      RECONCILIATION_TIMEOUT_MS,
    )
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
    return this.trackOperation(() =>
      this.reconcileCancelledPreparationInternal(sessionId, expectedRevision, combined),
    ).finally(() => clearTimeout(timeout))
  }

  private async reconcileInternal(
    sessionId: string,
    expectedRevision: number,
    signal?: AbortSignal,
  ): Promise<SessionLaunchTarget> {
    const runtime = await this.storage.call('sessionLaunchTargetRuntime', sessionId)
    if (runtime.target.revision !== expectedRevision)
      throw new HbarError('COMMAND_CONFLICT', 'Session launch target revision changed')
    if (!runtime.resolution || !['preparing', 'reconciling', 'ready'].includes(runtime.resolution.state))
      return this.prepare(sessionId, expectedRevision, signal)
    return this.prepare(sessionId, expectedRevision, signal)
  }

  private async reconcileCancelledPreparationInternal(
    sessionId: string,
    expectedRevision: number,
    signal: AbortSignal,
  ): Promise<SessionLaunchTarget> {
    signal.throwIfAborted()
    const runtime = await this.storage.call('sessionLaunchTargetRuntime', sessionId)
    if (runtime.target.revision !== expectedRevision)
      throw new HbarError('COMMAND_CONFLICT', 'Session launch target revision changed')
    if (runtime.binding) {
      await this.verifyBoundTarget(runtime, signal)
      return this.get(sessionId)
    }
    const intent = runtime.resolution
    if (!intent || intent.state === 'cancelled' || intent.state === 'failed') return runtime.target
    if (intent.state === 'ready') {
      if (intent.selection.mode === 'shared-current') return runtime.target
      const session = await this.storage.call('session', sessionId)
      const workspace = await this.storage.call('workspace', session.workspaceId)
      if (intent.selection.mode === 'shared-branch') {
        try {
          await this.verifyPreparedSharedBranch(workspace.path, intent, signal)
          return runtime.target
        } catch (error) {
          await this.storeFailure(
            intent,
            error instanceof HbarError
              ? error
              : new HbarError(
                  'SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED',
                  'Prepared shared branch could not be verified',
                ),
          )
          throw error
        }
      }
      const managed = await this.managedPaths(sessionId, expectedRevision, workspace.path, signal)
      try {
        await this.verifyPreparedWorktree(managed, intent, signal)
        return runtime.target
      } catch (error) {
        await this.storeFailure(
          intent,
          error instanceof HbarError
            ? error
            : new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED', 'Prepared worktree could not be verified'),
        )
        throw error
      }
    }

    if (intent.selection.mode === 'shared-current') {
      await this.storage.call('updateSessionLaunchTargetPreparation', {
        sessionId,
        revision: expectedRevision,
        targetPath: intent.targetPath,
        state: 'cancelled',
        errorCode: 'USER_CANCELLED',
        errorMessage: 'Launch-target preparation was cancelled before any worktree was created',
      })
      return this.get(sessionId)
    }

    if (intent.selection.mode === 'shared-branch') return this.reconcileCancelledSharedBranch(intent, signal)

    const session = await this.storage.call('session', sessionId)
    const workspace = await this.storage.call('workspace', session.workspaceId)
    const managed = await this.managedPaths(sessionId, expectedRevision, workspace.path, signal)
    const reconciled = await this.reconcileIntent(managed, intent, signal)
    if (reconciled) return this.get(sessionId)
    await this.storage.call('updateSessionLaunchTargetPreparation', {
      sessionId,
      revision: expectedRevision,
      targetPath: intent.targetPath,
      state: 'cancelled',
      errorCode: 'USER_CANCELLED',
      errorMessage: 'Launch-target preparation was cancelled after confirming no worktree was created',
    })
    return this.get(sessionId)
  }

  cancel(sessionId: string, expectedRevision: number): Promise<SessionLaunchTarget> {
    return this.trackOperation(() => this.cancelInternal(sessionId, expectedRevision))
  }

  private async cancelInternal(sessionId: string, expectedRevision: number): Promise<SessionLaunchTarget> {
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

  bindForRun(
    sessionId: string,
    signal?: AbortSignal,
    expectedLaunchTargetRevision?: number,
  ): Promise<SessionLaunchTargetBindingInput> {
    return this.trackOperation(() => this.bindForRunInternal(sessionId, signal, expectedLaunchTargetRevision))
  }

  private async bindForRunInternal(
    sessionId: string,
    signal?: AbortSignal,
    expectedLaunchTargetRevision?: number,
  ): Promise<SessionLaunchTargetBindingInput> {
    const runtime = await this.storage.call('sessionLaunchTargetRuntime', sessionId)
    if (expectedLaunchTargetRevision !== undefined)
      return this.bindPreparedTargetForRun(sessionId, expectedLaunchTargetRevision, runtime, signal)
    if (runtime.binding) {
      await this.verifyBoundTarget(runtime, signal)
      return this.bindingInput(runtime.binding)
    }
    const target = runtime.target
    if (target.locked)
      throw new HbarError('SESSION_LAUNCH_TARGET_LOCKED', 'The accepted session target could not be reconciled')
    const bindingRevision = target.revision
    const prepared = await this.prepare(sessionId, bindingRevision, signal)
    if (prepared.revision !== bindingRevision)
      throw new HbarError('COMMAND_CONFLICT', 'Session launch target revision changed')
    const ready = await this.storage.call('sessionLaunchTargetRuntime', sessionId)
    if (ready.target.revision !== bindingRevision)
      throw new HbarError('COMMAND_CONFLICT', 'Session launch target revision changed')
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

  private async bindPreparedTargetForRun(
    sessionId: string,
    expectedRevision: number,
    runtime: SessionLaunchTargetRuntimeSnapshot,
    signal?: AbortSignal,
  ): Promise<SessionLaunchTargetBindingInput> {
    if (runtime.target.revision !== expectedRevision)
      throw new HbarError('COMMAND_CONFLICT', 'Session launch target revision changed')
    if (runtime.binding) {
      if (runtime.binding.expectedRevision !== expectedRevision)
        throw new HbarError('COMMAND_CONFLICT', 'Session launch target revision changed')
      await this.verifyBoundTarget(runtime, signal)
      return this.bindingInput(runtime.binding, true)
    }
    if (runtime.target.locked)
      throw new HbarError('SESSION_LAUNCH_TARGET_LOCKED', 'The accepted session target could not be reconciled')

    const initial = runtime.resolution
    if (
      !initial ||
      initial.state !== 'ready' ||
      initial.expectedRevision !== expectedRevision ||
      !sameSelection(initial.selection, runtime.target.selection)
    )
      throw new HbarError('SESSION_LAUNCH_TARGET_UNRESOLVED', 'Prepare the selected worktree before accepting a Run')

    const verificationSignal = signal
      ? AbortSignal.any([signal, this.closingController.signal])
      : this.closingController.signal
    verificationSignal.throwIfAborted()
    const session = await this.storage.call('session', sessionId)
    const workspace = await this.storage.call('workspace', session.workspaceId)
    if (initial.selection.mode === 'shared-current') {
      let sharedPath: string
      try {
        sharedPath = await realpath(workspace.path)
      } catch {
        throw new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT', 'The prepared shared workspace is unavailable')
      }
      if (!samePath(sharedPath, initial.targetPath) || initial.branch !== null || initial.resolvedHead !== null)
        throw new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT', 'The prepared shared target no longer matches')
    } else if (initial.selection.mode === 'shared-branch') {
      await this.verifyPreparedSharedBranch(workspace.path, initial, verificationSignal)
    } else {
      const managed = await this.managedPaths(sessionId, expectedRevision, workspace.path, verificationSignal)
      if (!samePath(managed.targetPath, initial.targetPath))
        throw new HbarError('SESSION_LAUNCH_TARGET_INVALID_ROOT', 'Prepared worktree path is not Host managed')
      await this.verifyPreparedWorktree(managed, initial, verificationSignal)
    }
    verificationSignal.throwIfAborted()

    const verified = await this.storage.call('sessionLaunchTargetRuntime', sessionId)
    if (verified.target.revision !== expectedRevision || !sameSelection(verified.target.selection, initial.selection))
      throw new HbarError('COMMAND_CONFLICT', 'Session launch target revision changed')
    if (verified.binding) {
      if (verified.binding.expectedRevision !== expectedRevision)
        throw new HbarError('COMMAND_CONFLICT', 'Session launch target revision changed')
      await this.verifyBoundTarget(verified, signal)
      return this.bindingInput(verified.binding, true)
    }
    if (verified.target.locked)
      throw new HbarError('SESSION_LAUNCH_TARGET_LOCKED', 'The accepted session target could not be reconciled')
    const ready = verified.resolution
    if (
      !ready ||
      ready.state !== 'ready' ||
      ready.expectedRevision !== expectedRevision ||
      !sameSelection(ready.selection, initial.selection) ||
      !samePath(ready.targetPath, initial.targetPath) ||
      ready.branch !== initial.branch ||
      ready.resolvedHead !== initial.resolvedHead
    )
      throw new HbarError('SESSION_LAUNCH_TARGET_UNRESOLVED', 'Prepare the selected worktree before accepting a Run')

    return {
      sessionId,
      expectedRevision,
      selection: ready.selection,
      targetPath: ready.targetPath,
      branch: ready.branch,
      head: ready.resolvedHead,
      requirePreparedTarget: true,
    }
  }

  workspaceForRun(sessionId: string, workspacePath: string, signal?: AbortSignal): Promise<string> {
    return this.trackOperation(() => this.workspaceForRunInternal(sessionId, workspacePath, signal))
  }

  private async workspaceForRunInternal(
    sessionId: string,
    workspacePath: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const runtime = await this.storage.call('sessionLaunchTargetRuntime', sessionId)
    const targetPath = runtime.binding?.targetPath ?? workspacePath
    if (runtime.binding) await this.verifyBoundTarget(runtime, signal)
    else if (runtime.target.selection.mode !== 'shared-current')
      throw new HbarError('SESSION_LAUNCH_TARGET_UNRESOLVED', 'The session worktree has not been accepted and bound')
    return targetPath
  }

  isBoundWorktreeExecutionRoot(workspacePath: string): Promise<boolean> {
    return this.trackOperation(() => this.isBoundWorktreeExecutionRootInternal(workspacePath))
  }

  private async isBoundWorktreeExecutionRootInternal(workspacePath: string): Promise<boolean> {
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
    this.closingController.abort(new HbarError('HOST_SHUTTING_DOWN', 'Host shutting down'))
    const active = [...this.active.values()]
    for (const preparation of active)
      preparation.controller.abort(new HbarError('HOST_SHUTTING_DOWN', 'Host shutting down'))
    await Promise.all([
      ...active.map((preparation) => preparation.promise.catch(() => undefined)),
      ...[...this.trackedOperations].map((operation) => operation.catch(() => undefined)),
    ])
  }

  private bindingInput(
    binding: SessionLaunchTargetBinding,
    requirePreparedTarget = false,
  ): SessionLaunchTargetBindingInput {
    return {
      sessionId: binding.sessionId,
      expectedRevision: binding.expectedRevision,
      selection: binding.selection,
      targetPath: binding.targetPath,
      branch: binding.branch,
      head: binding.head,
      ...(requirePreparedTarget ? { requirePreparedTarget: true } : {}),
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

    if (runtime.target.selection.mode === 'shared-branch')
      return this.prepareSharedBranchInternal(
        sessionId,
        expectedRevision,
        workspace.path,
        runtime.target.selection,
        runtime.resolution,
        signal,
      )

    const selection = runtime.target.selection
    const managed = await this.managedPaths(sessionId, expectedRevision, workspace.path, signal)
    const branch = worktreeBranchName(selection, sessionId, expectedRevision)
    if (!branch) throw new HbarError('INVALID_STATE', 'Isolated launch target has no branch')
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
    let partialBranch = false
    try {
      const worktrees = await this.listWorktrees(managed.gitRoot, signal)
      if (selection.branch.kind === 'existing') {
        requestedHead = await this.resolveBranchHead(managed.gitRoot, selection.branch.name, signal)
        this.assertBranchAvailable(worktrees, selection.branch.name, managed.targetPath)
      } else if (selection.branch.kind === 'new') {
        requestedHead = await this.resolveCommit(managed.gitRoot, selection.branch.startPoint ?? 'HEAD', signal)
        const branchHead = await this.tryResolveBranchHead(managed.gitRoot, selection.branch.name, signal)
        const recoverable =
          prior !== null &&
          ['preparing', 'reconciling'].includes(prior.state) &&
          sameSelection(prior.selection, selection) &&
          prior.branch === branch &&
          branchHead === prior.requestedHead
        const recoverableHead = recoverable && prior !== null ? prior.requestedHead : null
        if (branchHead && !recoverable)
          throw new HbarError(
            'BRANCH_EXISTS',
            'The selected new branch already exists; choose it as an existing branch',
          )
        if (recoverableHead) {
          requestedHead = recoverableHead
          partialBranch = true
        }
        this.assertBranchAvailable(worktrees, selection.branch.name, managed.targetPath)
      } else {
        const reusableBaseHead =
          prior !== null &&
          ['preparing', 'reconciling', 'cancelled'].includes(prior.state) &&
          sameSelection(prior.selection, selection) &&
          prior.branch === branch &&
          prior.requestedHead !== null
            ? prior.requestedHead
            : null
        requestedHead =
          reusableBaseHead ??
          (await this.resolveBranchHead(managed.gitRoot, selection.branch.baseRef.slice('refs/heads/'.length), signal))
        const branchHead = await this.tryResolveBranchHead(managed.gitRoot, branch, signal)
        const partialDerivedBranch = reusableBaseHead !== null && branchHead === requestedHead
        if (branchHead && !partialDerivedBranch)
          throw new HbarError('BRANCH_EXISTS', 'The generated session branch already exists')
        if (partialDerivedBranch) {
          partialBranch = true
          this.assertBranchAvailable(worktrees, branch, managed.targetPath)
        }
      }
      await this.assertTargetPathAvailable(managed, worktrees)
    } catch (error) {
      if (signal.aborted) throw signalFailure(signal)
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
      branch,
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

    const targetHead = intent.requestedHead
    if (!targetHead) {
      const error = new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT', 'Prepared target has no captured commit')
      await this.storeFailure(intent, error)
      throw error
    }

    let mutationAttempted = false
    try {
      await this.assertSessionRootSafe(managed.root, managed.sessionRoot)
      await mkdir(managed.sessionRoot, { recursive: true })
      await this.assertSafeManagedRoot(managed.gitRoot, managed.root, managed.targetPath)
      await this.assertTargetPathAbsent(managed.targetPath)
      const hooksPath = join(managed.sessionRoot, `.hbar-disabled-hooks-${crypto.randomUUID()}`)
      await this.assertTargetPathAbsent(hooksPath)
      const createsBranch = selection.branch.kind === 'new' || selection.branch.kind === 'derived'
      const args =
        createsBranch && !partialBranch
          ? ['-c', `core.hooksPath=${hooksPath}`, 'worktree', 'add', '-b', branch, managed.targetPath, targetHead]
          : ['-c', `core.hooksPath=${hooksPath}`, 'worktree', 'add', managed.targetPath, branch]
      signal.throwIfAborted()
      mutationAttempted = true
      const result = await this.git(managed.gitRoot, args, signal)
      if (result.code !== 0)
        throw new HbarError('GIT_OPERATION_FAILED', 'Git could not create the selected managed worktree')
      const inspected = await this.inspectTarget(managed, branch, signal)
      if (inspected.head !== targetHead)
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
      if (!mutationAttempted) {
        if (error instanceof HbarError) {
          if (error.code === 'USER_CANCELLED' || error.code === 'HOST_SHUTTING_DOWN') {
            await this.storage.call('updateSessionLaunchTargetPreparation', {
              sessionId,
              revision: expectedRevision,
              targetPath: managed.targetPath,
              state: 'cancelled',
              errorCode: error.code,
              errorMessage: error.message.slice(0, 1_000),
            })
          } else await this.storeFailure(intent, error)
        }
        throw error
      }
      const outcome = await this.reconcileAfterMutation(managed, intent, error)
      if (signal.aborted) throw signalFailure(signal)
      if (outcome === 'ready') return this.get(sessionId)
      if (outcome === 'unknown')
        throw new HbarError(
          'SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED',
          'Git may have changed the selected branch; reconcile before retrying',
        )
      throw error
    }
  }

  private async prepareSharedBranchInternal(
    sessionId: string,
    expectedRevision: number,
    workspacePath: string,
    selection: Extract<SessionLaunchSelection, { mode: 'shared-branch' }>,
    prior: SessionLaunchTargetResolutionRecord | null,
    signal: AbortSignal,
  ): Promise<SessionLaunchTarget> {
    const branch = selection.branch.ref.slice('refs/heads/'.length)
    const requestedHead = selection.branch.tipOid.toLowerCase()
    const targetPath = await realpath(workspacePath)
    let checkout: CheckoutRootResult
    try {
      checkout = await this.resolveCheckoutRoot(targetPath, signal)
      if (!checkout.isRepository)
        throw new HbarError('GIT_NOT_REPOSITORY', 'The selected shared branch is not in a Git repository')
      const branchHead = await this.resolveLocalBranchRefHead(checkout.path, selection.branch.ref, signal)
      if (branchHead !== requestedHead)
        throw new HbarError('GIT_BRANCH_BASE_CHANGED', 'The selected local branch moved; refresh and choose it again')
      const worktrees = await this.listWorktrees(checkout.path, signal)
      this.assertBranchAvailable(worktrees, branch, checkout.path)
    } catch (error) {
      if (signal.aborted) throw signalFailure(signal)
      await this.recordPreflightFailure(sessionId, expectedRevision, selection, targetPath, requestedHead, error)
      throw error
    }

    if (prior?.state === 'ready') {
      try {
        await this.verifyPreparedSharedBranch(workspacePath, prior, signal)
      } catch (error) {
        await this.storeFailure(
          prior,
          error instanceof HbarError
            ? error
            : new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED', 'Prepared shared branch could not be verified'),
        )
        throw error
      }
      return this.get(sessionId)
    }

    const hadAmbiguousIntent =
      prior !== null && ['preparing', 'reconciling'].includes(prior.state) && sameSelection(prior.selection, selection)
    const intent = await this.storage.call('beginSessionLaunchTargetPreparation', {
      sessionId,
      expectedRevision,
      selection,
      targetPath,
      branch,
      requestedHead,
    })
    if (intent.state === 'ready') {
      try {
        await this.verifyPreparedSharedBranch(workspacePath, intent, signal)
      } catch (error) {
        await this.storeFailure(
          intent,
          error instanceof HbarError
            ? error
            : new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED', 'Prepared shared branch could not be verified'),
        )
        throw error
      }
      return this.get(sessionId)
    }

    if (hadAmbiguousIntent) {
      const state = await this.readSharedCheckoutState(checkout.path, selection.branch.ref, signal).catch(() => null)
      if (state && this.sharedBranchIsReady(state, intent)) {
        await this.storage.call('updateSessionLaunchTargetPreparation', {
          sessionId,
          revision: expectedRevision,
          targetPath,
          state: 'ready',
          resolvedHead: state.head,
        })
        return this.get(sessionId)
      }
      await this.persistSharedBranchReconciliation(
        intent,
        'Git did not confirm the shared checkout; inspect the current branch before continuing',
      )
      throw new HbarError(
        'SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED',
        'The shared branch checkout is ambiguous; reconcile before retrying',
      )
    }

    let mutationAttempted = false
    try {
      let state = await this.readSharedCheckoutState(checkout.path, selection.branch.ref, signal)
      if (this.sharedBranchIsReady(state, intent)) {
        await this.storage.call('updateSessionLaunchTargetPreparation', {
          sessionId,
          revision: expectedRevision,
          targetPath,
          state: 'ready',
          resolvedHead: state.head,
        })
        return this.get(sessionId)
      }
      if (state.selectedRefHead !== requestedHead)
        throw new HbarError('GIT_BRANCH_BASE_CHANGED', 'The selected local branch moved before checkout')
      if (state.branchRef === selection.branch.ref && state.head !== requestedHead)
        throw new HbarError(
          'SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT',
          'The current shared branch does not match its captured tip',
        )

      signal.throwIfAborted()
      await this.guardSharedBranchCheckout?.(sessionId, checkout.path, signal)
      signal.throwIfAborted()

      const latestHead = await this.resolveLocalBranchRefHead(checkout.path, selection.branch.ref, signal)
      if (latestHead !== requestedHead)
        throw new HbarError('GIT_BRANCH_BASE_CHANGED', 'The selected local branch moved before checkout')
      state = await this.readSharedCheckoutState(checkout.path, selection.branch.ref, signal)
      if (this.sharedBranchIsReady(state, intent)) {
        await this.storage.call('updateSessionLaunchTargetPreparation', {
          sessionId,
          revision: expectedRevision,
          targetPath,
          state: 'ready',
          resolvedHead: state.head,
        })
        return this.get(sessionId)
      }

      const hooksPath = join(this.layout.dataRoot, `.hbar-disabled-hooks-${crypto.randomUUID()}`)
      await this.assertTargetPathAbsent(hooksPath)
      mutationAttempted = true
      const result = await this.git(
        checkout.path,
        ['-c', `core.hooksPath=${hooksPath}`, 'switch', '--no-guess', '--', branch],
        signal,
      )
      if (result.code !== 0)
        throw new HbarError('GIT_OPERATION_FAILED', 'Git could not switch the shared workspace to the selected branch')
      state = await this.readSharedCheckoutState(checkout.path, selection.branch.ref, signal)
      if (!this.sharedBranchIsReady(state, intent))
        throw new HbarError(
          'SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED',
          'Git did not confirm the selected shared branch tip',
        )
      await this.storage.call('updateSessionLaunchTargetPreparation', {
        sessionId,
        revision: expectedRevision,
        targetPath,
        state: 'ready',
        resolvedHead: state.head,
      })
      signal.throwIfAborted()
      return this.get(sessionId)
    } catch (error) {
      if (!mutationAttempted) {
        if (error instanceof HbarError && (error.code === 'USER_CANCELLED' || error.code === 'HOST_SHUTTING_DOWN')) {
          await this.storage.call('updateSessionLaunchTargetPreparation', {
            sessionId,
            revision: expectedRevision,
            targetPath,
            state: error.code === 'USER_CANCELLED' ? 'cancelled' : 'reconciling',
            errorCode: error.code,
            errorMessage: error.message.slice(0, 1_000),
          })
        } else {
          await this.storeFailure(
            intent,
            error instanceof HbarError
              ? error
              : new HbarError('SESSION_LAUNCH_TARGET_PREPARATION_FAILED', 'Host could not prepare the shared branch'),
          )
        }
        throw error
      }

      const ready = await this.reconcileSharedBranchAfterMutation(intent, error)
      if (ready) {
        if (signal.aborted) throw signalFailure(signal)
        return this.get(sessionId)
      }
      if (signal.aborted) throw signalFailure(signal)
      throw new HbarError(
        'SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED',
        'Git may have changed the shared branch; inspect it before continuing',
      )
    }
  }

  private async reconcileCancelledSharedBranch(
    intent: SessionLaunchTargetResolutionRecord,
    signal: AbortSignal,
  ): Promise<SessionLaunchTarget> {
    const checkout = await this.resolveCheckoutRoot(intent.targetPath, signal)
    if (!checkout.isRepository) {
      await this.persistSharedBranchReconciliation(
        intent,
        'The shared Git checkout could not be inspected after cancellation',
      )
      return this.get(intent.sessionId)
    }
    const selection = intent.selection
    if (selection.mode !== 'shared-branch') return this.get(intent.sessionId)
    try {
      const state = await this.readSharedCheckoutState(checkout.path, selection.branch.ref, signal)
      if (this.sharedBranchIsReady(state, intent)) {
        await this.storage.call('updateSessionLaunchTargetPreparation', {
          sessionId: intent.sessionId,
          revision: intent.expectedRevision,
          targetPath: intent.targetPath,
          state: 'ready',
          resolvedHead: state.head,
        })
      } else {
        await this.persistSharedBranchReconciliation(
          intent,
          'Cancellation cannot confirm whether the shared checkout changed; inspect the current branch',
        )
      }
    } catch {
      await this.persistSharedBranchReconciliation(
        intent,
        'Cancellation could not inspect the shared checkout; reconcile before continuing',
      )
    }
    return this.get(intent.sessionId)
  }

  private async reconcileSharedBranchAfterMutation(
    intent: SessionLaunchTargetResolutionRecord,
    _cause: unknown,
  ): Promise<boolean> {
    const controller = new AbortController()
    const timeout = setTimeout(
      () =>
        controller.abort(
          new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED', 'Shared branch reconciliation exceeded 15 seconds'),
        ),
      RECONCILIATION_TIMEOUT_MS,
    )
    const onShutdown = () => controller.abort(this.closingController.signal.reason)
    this.closingController.signal.addEventListener('abort', onShutdown, { once: true })
    if (this.closingController.signal.aborted) onShutdown()
    try {
      const selection = intent.selection
      if (selection.mode !== 'shared-branch') return false
      const checkout = await this.resolveCheckoutRoot(intent.targetPath, controller.signal)
      if (!checkout.isRepository) return false
      const state = await this.readSharedCheckoutState(checkout.path, selection.branch.ref, controller.signal)
      if (this.sharedBranchIsReady(state, intent)) {
        await this.storage.call('updateSessionLaunchTargetPreparation', {
          sessionId: intent.sessionId,
          revision: intent.expectedRevision,
          targetPath: intent.targetPath,
          state: 'ready',
          resolvedHead: state.head,
        })
        return true
      }
      await this.persistSharedBranchReconciliation(
        intent,
        'Git did not confirm the selected shared branch; inspect the current checkout before continuing',
      )
      return false
    } catch {
      await this.persistSharedBranchReconciliation(
        intent,
        'Git did not confirm the shared branch result; reconcile before continuing',
      ).catch(() => undefined)
      return false
    } finally {
      clearTimeout(timeout)
      this.closingController.signal.removeEventListener('abort', onShutdown)
    }
  }

  private async verifyPreparedSharedBranch(
    workspacePath: string,
    intent: SessionLaunchTargetResolutionRecord,
    signal: AbortSignal,
  ): Promise<void> {
    const selection = intent.selection
    if (selection.mode !== 'shared-branch' || !intent.branch || !intent.resolvedHead)
      throw new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT', 'Prepared shared branch is incomplete')
    if (intent.branch !== selection.branch.ref.slice('refs/heads/'.length))
      throw new HbarError(
        'SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT',
        'Prepared shared branch differs from its selection',
      )
    const canonicalWorkspace = await realpath(workspacePath)
    if (!samePath(canonicalWorkspace, intent.targetPath))
      throw new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT', 'Prepared shared workspace path changed')
    const checkout = await this.resolveCheckoutRoot(canonicalWorkspace, signal)
    if (!checkout.isRepository)
      throw new HbarError(
        'SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT',
        'Prepared shared workspace is no longer a Git repository',
      )
    const state = await this.readSharedCheckoutState(checkout.path, selection.branch.ref, signal)
    if (
      !this.sharedBranchIsReady(state, intent) ||
      state.head !== intent.resolvedHead.toLowerCase() ||
      intent.resolvedHead.toLowerCase() !== selection.branch.tipOid.toLowerCase()
    )
      throw new HbarError(
        'SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT',
        'Prepared shared branch no longer matches its captured tip',
      )
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
          await this.git(await realpath(workspacePath), ['rev-parse', '--show-toplevel'], signal),
          'GIT_NOT_REPOSITORY',
          'The selected workspace is not a Git repository',
        ),
      )
    } catch (error) {
      if (error instanceof HbarError && error.code === 'GIT_NOT_REPOSITORY') throw error
      safeGitError(error)
    }
    const rootCandidate = gitRoot!
    if (!samePath(await realpath(workspacePath), rootCandidate))
      throw new HbarError(
        'SESSION_LAUNCH_TARGET_SUBDIRECTORY_UNSUPPORTED',
        'Isolated launch currently requires a repository-root workspace; use the shared directory or register the repository root',
      )
    const commonRelative = output(
      await this.git(rootCandidate, ['rev-parse', '--git-common-dir'], signal),
      'GIT_NOT_REPOSITORY',
      'The selected workspace is not a Git repository',
    )
    const repository = await realpath(
      isAbsolute(commonRelative) ? commonRelative : resolve(rootCandidate, commonRelative),
    )
    const worktreeResult = await this.git(rootCandidate, ['worktree', 'list', '--porcelain', '-z'], signal)
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
    const canonicalSessionRoot = await realpath(dirname(targetPath))
    if (!inside(canonicalRoot, targetPath) || inside(gitRoot, canonicalRoot) || inside(canonicalRoot, gitRoot))
      throw new HbarError(
        'SESSION_LAUNCH_TARGET_INVALID_ROOT',
        'Managed worktree path is outside its bounded Host root',
      )
    if (!inside(canonicalRoot, canonicalSessionRoot) || !samePath(canonicalSessionRoot, dirname(targetPath)))
      throw new HbarError(
        'SESSION_LAUNCH_TARGET_INVALID_ROOT',
        'Managed session directory resolves outside Host storage',
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

  private async assertSessionRootSafe(root: string, sessionRoot: string): Promise<void> {
    const canonicalRoot = await realpath(root)
    try {
      const info = await lstat(sessionRoot)
      const canonicalSessionRoot = await realpath(sessionRoot)
      if (
        !info.isDirectory() ||
        info.isSymbolicLink() ||
        !inside(canonicalRoot, canonicalSessionRoot) ||
        !samePath(canonicalSessionRoot, sessionRoot)
      )
        throw new HbarError(
          'SESSION_LAUNCH_TARGET_INVALID_ROOT',
          'Managed session directory is not a safe Host directory',
        )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
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
    const result = await this.git(repository, ['worktree', 'list', '--porcelain', '-z'], signal)
    if (result.code !== 0) throw new HbarError('GIT_OPERATION_FAILED', 'Git could not inspect worktrees')
    return parseWorktrees(result.stdout)
  }

  private async resolveCommit(repository: string, reference: string, signal: AbortSignal) {
    const result = await this.git(
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
    const valid = await this.git(repository, ['check-ref-format', `refs/heads/${branch}`], signal)
    if (valid.code !== 0) throw new HbarError('GIT_INVALID_BRANCH', 'The selected branch name is invalid')
    const result = await this.git(
      repository,
      ['rev-parse', '--verify', '--end-of-options', `refs/heads/${branch}^{commit}`],
      signal,
    )
    const value = output(result, 'BRANCH_NOT_FOUND', 'The selected branch does not exist in this repository')
    if (!HEAD_PATTERN.test(value))
      throw new HbarError('GIT_OPERATION_FAILED', 'Git returned an invalid commit identifier')
    return value.toLowerCase()
  }

  private async resolveLocalBranchRefHead(repository: string, ref: string, signal: AbortSignal): Promise<string> {
    const valid = await this.git(repository, ['check-ref-format', ref], signal)
    if (valid.code !== 0) throw new HbarError('GIT_INVALID_BRANCH', 'The selected local branch ref is invalid')
    const result = await this.git(repository, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], signal)
    const value = output(result, 'BRANCH_NOT_FOUND', 'The selected local branch does not exist in this repository')
    if (!HEAD_PATTERN.test(value))
      throw new HbarError('GIT_OPERATION_FAILED', 'Git returned an invalid local branch commit identifier')
    return value.toLowerCase()
  }

  private async tryResolveBranchHead(repository: string, branch: string, signal: AbortSignal): Promise<string | null> {
    const valid = await this.git(repository, ['check-ref-format', `refs/heads/${branch}`], signal)
    if (valid.code !== 0) throw new HbarError('GIT_INVALID_BRANCH', 'The selected branch name is invalid')
    const result = await this.git(
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
      await this.git(canonicalTarget, ['rev-parse', '--show-toplevel'], signal),
      'SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT',
      'Managed target is not the selected repository worktree',
    )
    if (!samePath(await realpath(top), canonicalTarget))
      throw new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT', 'Managed target is not a repository root')
    const actualBranch = output(
      await this.git(canonicalTarget, ['symbolic-ref', '--quiet', '--short', 'HEAD'], signal),
      'SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT',
      'Managed worktree is detached from its selected branch',
    )
    if (actualBranch !== branch)
      throw new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT', 'Managed worktree is attached to another branch')
    const commonValue = output(
      await this.git(canonicalTarget, ['rev-parse', '--git-common-dir'], signal),
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
      await this.git(canonicalTarget, ['rev-parse', '--verify', 'HEAD^{commit}'], signal),
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
    const branch = intent.branch
    if (!branch) throw new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT', 'Prepared branch is missing')
    try {
      const worktrees = await this.listWorktrees(managed.gitRoot, signal)
      const entry = worktrees.find((item) => samePath(item.path, intent.targetPath))
      if (entry) {
        const inspected = await this.inspectTarget(managed, branch, signal)
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
      const branchHead = await this.tryResolveBranchHead(managed.gitRoot, branch, signal)
      if (branchHead && branchHead !== intent.requestedHead?.toLowerCase())
        throw new HbarError(
          'SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT',
          'The prepared branch has moved from its persisted starting point',
        )
      const used = worktrees.find((item) => item.branch === `refs/heads/${branch}`)
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
      if (signal.aborted) throw signalFailure(signal)
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
    const branch = intent.branch
    if (!branch) {
      await this.storeFailure(
        intent,
        new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT', 'Prepared branch is missing'),
      )
      return 'failed'
    }
    const controller = new AbortController()
    const timeout = setTimeout(
      () =>
        controller.abort(
          new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED', 'Git reconciliation exceeded 15 seconds'),
        ),
      RECONCILIATION_TIMEOUT_MS,
    )
    const signal = controller.signal
    const onShutdown = () => controller.abort(this.closingController.signal.reason)
    this.closingController.signal.addEventListener('abort', onShutdown, { once: true })
    if (this.closingController.signal.aborted) onShutdown()
    try {
      const worktrees = await this.listWorktrees(managed.gitRoot, signal)
      const entry = worktrees.find((item) => samePath(item.path, intent.targetPath))
      if (entry) {
        const inspected = await this.inspectTarget(managed, branch, signal)
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
      const branchHead = await this.tryResolveBranchHead(managed.gitRoot, branch, signal)
      const used = await this.listWorktrees(managed.gitRoot, signal)
      if (used.some((item) => item.branch === `refs/heads/${branch}`)) {
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
    } finally {
      clearTimeout(timeout)
      this.closingController.signal.removeEventListener('abort', onShutdown)
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
      'GIT_BRANCH_BASE_CHANGED',
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
        branch: worktreeBranchName(selection, sessionId, revision),
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
    if (!intent.branch) throw new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT', 'Prepared branch is missing')
    const inspected = await this.inspectTarget(managed, intent.branch, signal)
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
    if (binding.selection.mode === 'shared-branch') {
      const operationSignal = signal ?? new AbortController().signal
      const workspace = await this.storage.call('workspace', runtime.target.workspaceId)
      if (!samePath(await realpath(workspace.path), binding.targetPath))
        throw new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT', 'The frozen shared workspace path changed')
      const checkoutRoot = await this.resolveCheckoutRoot(binding.targetPath, operationSignal)
      if (!checkoutRoot.isRepository)
        throw new HbarError(
          'SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT',
          'The frozen shared workspace is no longer a Git repository',
        )
      const state = await this.readSharedCheckoutState(checkoutRoot.path, binding.selection.branch.ref, operationSignal)
      if (state.branchRef !== binding.selection.branch.ref)
        throw new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT', 'Frozen shared branch changed')
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
    if (!binding.branch)
      throw new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT', 'Frozen worktree branch is missing')
    try {
      const inspected = await this.inspectTarget(managed, binding.branch, signal ?? new AbortController().signal)
      if (inspected.branch !== binding.branch)
        throw new HbarError('SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT', 'Frozen worktree branch changed')
    } catch (error) {
      const current = await this.storage.call('sessionLaunchTargetRuntime', binding.sessionId)
      const transient =
        error instanceof HbarError &&
        ['USER_CANCELLED', 'RUN_TIMEOUT', 'HOST_SHUTTING_DOWN', 'SESSION_LAUNCH_TARGET_TIMEOUT'].includes(error.code)
      if (!this.closing && !signal?.aborted && !transient && current.resolution)
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
