import { createHash } from 'node:crypto'
import { lstat, mkdir, realpath } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { HbarError } from '@hbar/contracts'
import {
  sessionBranchTargetPageSchema,
  sessionBranchTargetListInputSchema,
  sessionBranchTargetSelectInputSchema,
  type SessionBranchTargetSelectInput,
  type SessionBranchTargetOperation,
} from '@hbar/contracts/commands/session-branch-target'
import type { PathLayout, StoragePort, SessionBranchTargetRecord, SessionBranchTargetIdentity } from '@hbar/storage'
import {
  branchGitOutput,
  branchRepository,
  inspectBranchRepository,
  branchWorktrees,
  insideBranchPath,
  sameBranchPath,
  verifyBranchExecutionRoot,
  type BranchGit,
} from './session-branch-git'

const MAX_REFS = 4_096
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const objectId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i

/** Branch actions journal their exact Git intent before touching any checkout. */
export class SessionBranchTargetService {
  private readonly closing = new AbortController()
  private readonly operations = new Set<Promise<unknown>>()
  constructor(
    private readonly storage: StoragePort,
    private readonly layout: PathLayout,
    private readonly git: BranchGit,
    private readonly assertCheckoutIdle: (
      path: string,
      signal: AbortSignal,
      excludeSessionId?: string,
    ) => Promise<void>,
  ) {}

  idleCounts() {
    return { operations: this.operations.size, closed: this.closing.signal.aborted }
  }

  private track<Result>(signal: AbortSignal, action: (signal: AbortSignal) => Promise<Result>): Promise<Result> {
    if (this.closing.signal.aborted) return Promise.reject(new HbarError('HOST_SHUTTING_DOWN', 'Host shutting down'))
    if (this.operations.size >= 64)
      return Promise.reject(new HbarError('BUSY', 'Branch target operation capacity is full'))
    const promise = action(AbortSignal.any([signal, this.closing.signal]))
    this.operations.add(promise)
    void promise.then(
      () => this.operations.delete(promise),
      () => this.operations.delete(promise),
    )
    return promise
  }
  async close() {
    this.closing.abort(new HbarError('HOST_SHUTTING_DOWN', 'Host shutting down'))
    await Promise.all([...this.operations].map((operation) => operation.catch(() => undefined)))
  }
  /** Called under the checkout/admission locks immediately before a Run starts using files or tools. */
  prepareForRun(sessionId: string, signal: AbortSignal) {
    return this.track(signal, async (currentSignal) => {
      const runtime = await this.storage.call('sessionLaunchTargetRuntime', sessionId)
      if (runtime.branchTargetPending)
        throw new HbarError('RESULT_UNKNOWN', 'Reconcile the pending branch operation before starting a task')
      const target = runtime.branchTarget
      if (!target || target.revision !== runtime.target.revision) return null
      await verifyBranchExecutionRoot(this.git, target, currentSignal)
      if (target.branch) {
        const current = await this.git(target.targetPath, ['symbolic-ref', '--quiet', 'HEAD'], currentSignal)
        if (current.code !== 0 && current.code !== 1) branchGitOutput(current)
        if (current.stdout.trim() !== `refs/heads/${target.branch}`) {
          await this.assertCheckoutIdle(target.targetPath, currentSignal, sessionId)
          const switched = await this.git(
            target.targetPath,
            [
              '-c',
              `core.hooksPath=${resolve(this.layout.cacheRoot, 'disabled-branch-hooks')}`,
              'switch',
              '--no-guess',
              '--',
              target.branch,
            ],
            currentSignal,
          )
          if (switched.code !== 0)
            throw new HbarError(
              'GIT_SWITCH_BLOCKED',
              'Git could not restore the selected task branch while preserving local changes',
            )
          const confirmed = branchGitOutput(
            await this.git(target.targetPath, ['symbolic-ref', '--quiet', 'HEAD'], currentSignal),
          )
          if (confirmed !== `refs/heads/${target.branch}`)
            throw new HbarError('SESSION_BRANCH_TARGET_CHANGED', 'The task branch changed before execution')
        }
      }
      return target
    })
  }
  observeRunBranch(
    sessionId: string,
    runId: string,
    expectedRevision: number,
    targetPath: string,
    signal: AbortSignal,
  ) {
    return this.track(signal, async (currentSignal) => {
      const runtime = await this.storage.call('sessionLaunchTargetRuntime', sessionId)
      const target = runtime.branchTarget
      if (!target || target.revision !== expectedRevision || !sameBranchPath(target.targetPath, targetPath))
        return false
      await verifyBranchExecutionRoot(this.git, target, currentSignal)
      const current = await this.git(target.targetPath, ['symbolic-ref', '--quiet', 'HEAD'], currentSignal)
      if (current.code === 1) return false
      const ref = branchGitOutput(current)
      if (!ref.startsWith('refs/heads/')) return false
      return this.storage.call('observeSessionBranchTargetRun', {
        sessionId,
        runId,
        expectedRevision,
        targetPath: target.targetPath,
        branch: ref.slice(11),
      })
    })
  }

  private async context(sessionId: string, workspaceId: string, signal: AbortSignal) {
    const session = await this.storage.call('session', sessionId)
    if (session.workspaceId !== workspaceId)
      throw new HbarError('STALE_TARGET', 'The session belongs to another workspace')
    const workspace = await this.storage.call('workspace', workspaceId)
    const runtime = await this.storage.call('sessionLaunchTargetRuntime', sessionId)
    const registered = await inspectBranchRepository(this.git, workspace.path, signal)
    const path = runtime.branchTarget?.targetPath ?? runtime.binding?.targetPath ?? workspace.path
    if (registered.kind === 'plain') {
      if (
        runtime.branchTarget ||
        runtime.branchTargetPending ||
        runtime.binding?.head ||
        runtime.binding?.branch ||
        !sameBranchPath(path, workspace.path)
      )
        throw new HbarError('SESSION_BRANCH_TARGET_CHANGED', 'The task repository is no longer available')
      return { kind: 'plain' as const, session, workspace, runtime, registered }
    }
    const execution = await branchRepository(this.git, path, signal)
    if (!sameBranchPath(registered.common, execution.common))
      throw new HbarError('SESSION_BRANCH_TARGET_CHANGED', 'The execution checkout belongs to another repository')
    return { kind: 'git' as const, session, workspace, runtime, registered, execution }
  }

  list(raw: unknown, signal: AbortSignal, actorId?: string) {
    return this.track(signal, (currentSignal) => this.listInternal(raw, currentSignal, actorId))
  }
  private async listInternal(raw: unknown, signal: AbortSignal, actorId?: string) {
    const input = sessionBranchTargetListInputSchema.parse(raw)
    const context = await this.context(input.sessionId, input.workspaceId, signal)
    if (context.kind === 'plain') {
      const latest = await this.storage.call('sessionLaunchTargetRuntime', input.sessionId)
      if (latest.target.workspaceId !== input.workspaceId || latest.target.revision !== context.runtime.target.revision)
        throw new HbarError('COMMAND_CONFLICT', 'The execution target changed during repository discovery')
      if (latest.branchTarget || latest.branchTargetPending)
        throw new HbarError('SESSION_BRANCH_TARGET_CHANGED', 'The task repository changed during discovery')
      signal.throwIfAborted()
      return sessionBranchTargetPageSchema.parse({
        repository: 'plain',
        sessionId: input.sessionId,
        workspaceId: input.workspaceId,
        revision: latest.target.revision,
        execution: { path: context.registered.path, kind: 'directory', branch: null },
        base: null,
        branches: [],
        nextCursor: null,
        incomplete: false,
        pending: null,
      })
    }
    const [refsResult, worktreeResult, currentResult] = await Promise.all([
      this.git(
        context.registered.root,
        [
          'for-each-ref',
          '--sort=refname',
          `--count=${MAX_REFS + 1}`,
          '--format=%(refname)%00%(objectname)',
          'refs/heads/',
        ],
        signal,
      ),
      this.git(context.registered.root, ['worktree', 'list', '--porcelain', '-z'], signal),
      this.git(context.execution.path, ['symbolic-ref', '--quiet', 'HEAD'], signal),
    ])
    if (currentResult.code !== 0 && currentResult.code !== 1) branchGitOutput(currentResult)
    const currentRef = currentResult.code === 0 ? currentResult.stdout.trim() : null
    const selectedRef = context.runtime.branchTarget?.branch
      ? `refs/heads/${context.runtime.branchTarget.branch}`
      : currentRef
    const refs = branchGitOutput(refsResult)
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [ref, tipOid] = line.replace(/\r$/, '').split('\0')
        if (!ref?.startsWith('refs/heads/') || !tipOid || !objectId.test(tipOid))
          throw new HbarError('INVALID_OUTPUT', 'Git returned an invalid local branch')
        return { ref, tipOid: tipOid.toLowerCase(), name: ref.slice(11) }
      })
    const worktrees = branchWorktrees(branchGitOutput(worktreeResult))
    const incomplete = refs.length > MAX_REFS
    const search = input.search.toLowerCase()
    const fingerprint = hash(
      JSON.stringify([
        input.sessionId,
        input.workspaceId,
        context.runtime.target.revision,
        search,
        refs,
        worktrees,
        currentRef,
      ]),
    )
    let after = ''
    if (input.cursor) {
      try {
        const cursor: unknown = JSON.parse(Buffer.from(input.cursor, 'base64url').toString())
        if (
          !cursor ||
          typeof cursor !== 'object' ||
          !('fingerprint' in cursor) ||
          cursor.fingerprint !== fingerprint ||
          !('after' in cursor) ||
          typeof cursor.after !== 'string'
        )
          throw new Error('Invalid cursor')
        after = cursor.after
      } catch {
        throw new HbarError('STALE_CURSOR', 'Refresh the branch list because the repository changed')
      }
    }
    const matches = refs
      .slice(0, MAX_REFS)
      .filter((entry) => entry.name.toLowerCase().includes(search) && entry.ref > after)
    const branches = matches.slice(0, input.limit).map((entry) => ({
      ...entry,
      current: entry.ref === selectedRef,
      worktreePath: worktrees.find((item) => item.ref === entry.ref)?.path ?? null,
    }))
    const currentBase = selectedRef?.startsWith('refs/heads/')
      ? (refs.find((entry) => entry.ref === selectedRef) ?? {
          ref: selectedRef,
          name: selectedRef.slice(11),
          tipOid: branchGitOutput(
            await this.git(
              context.execution.path,
              ['rev-parse', '--verify', '--end-of-options', `${selectedRef}^{commit}`],
              signal,
            ),
          ).toLowerCase(),
        })
      : null
    const latest = await this.storage.call('sessionLaunchTarget', input.sessionId)
    if (latest.workspaceId !== input.workspaceId || latest.revision !== context.runtime.target.revision)
      throw new HbarError('COMMAND_CONFLICT', 'The execution target changed during branch discovery')
    return sessionBranchTargetPageSchema.parse({
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
      revision: latest.revision,
      execution: {
        path: context.execution.path,
        kind: sameBranchPath(context.registered.root, context.execution.root) ? 'checkout' : 'worktree',
        branch: selectedRef?.startsWith('refs/heads/') ? selectedRef.slice(11) : null,
      },
      base: currentBase,
      branches,
      nextCursor:
        matches.length > input.limit
          ? Buffer.from(JSON.stringify({ fingerprint, after: branches.at(-1)!.ref })).toString('base64url')
          : null,
      incomplete,
      pending: await this.storage.call('pendingSessionBranchTargetOperation', input.sessionId, actorId),
    })
  }

  select(
    raw: SessionBranchTargetSelectInput,
    identity: Omit<SessionBranchTargetIdentity, 'sessionId'>,
    signal: AbortSignal,
  ): Promise<SessionBranchTargetOperation> {
    return this.track(signal, (currentSignal) => this.selectInternal(raw, identity, currentSignal))
  }
  private async selectInternal(
    raw: SessionBranchTargetSelectInput,
    identity: Omit<SessionBranchTargetIdentity, 'sessionId'>,
    signal: AbortSignal,
  ): Promise<SessionBranchTargetOperation> {
    const request = sessionBranchTargetSelectInputSchema.parse(raw)
    const lookup = { ...identity, sessionId: request.sessionId }
    const prior = await this.storage.call('sessionBranchTargetOperation', lookup)
    if (prior) {
      if (JSON.stringify(prior.request) !== JSON.stringify(request))
        throw new HbarError('IDEMPOTENCY_CONFLICT', 'The branch operation key belongs to another choice')
      return prior.snapshot.status === 'ready' || prior.snapshot.status === 'failed'
        ? prior.snapshot
        : this.reconcile(lookup, signal)
    }
    const context = await this.context(request.sessionId, request.workspaceId, signal)
    if (context.kind === 'plain')
      throw new HbarError('CAPABILITY_UNAVAILABLE', 'Branch targets require a Git repository')
    if (context.runtime.target.revision !== request.expectedRevision)
      throw new HbarError('COMMAND_CONFLICT', 'Refresh before switching execution targets')
    const choice = request.choice
    const ref = choice.kind === 'branch' ? choice.ref : choice.baseRef
    const expectedOid = choice.kind === 'branch' ? choice.expectedOid : choice.expectedBaseOid
    const tip = branchGitOutput(
      await this.git(context.registered.root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], signal),
    ).toLowerCase()
    if (tip !== expectedOid)
      throw new HbarError('COMMAND_CONFLICT', 'The selected branch changed; refresh before switching')
    const branch = choice.kind === 'branch' ? choice.ref.slice(11) : choice.name
    const validName = await this.git(context.registered.root, ['check-ref-format', '--branch', branch], signal)
    if (validName.code !== 0 || validName.stdout.trim() !== branch)
      throw new HbarError('INVALID_BRANCH_NAME', 'Enter a valid literal Git branch name')
    const worktrees = branchWorktrees(
      branchGitOutput(await this.git(context.registered.root, ['worktree', 'list', '--porcelain', '-z'], signal)),
    )
    const linked = choice.kind === 'branch' ? worktrees.find((entry) => entry.ref === choice.ref) : null
    let targetPath = linked ? await realpath(linked.path) : context.execution.path
    let kind: 'checkout' | 'worktree' = sameBranchPath(linked?.path ?? context.execution.root, context.registered.root)
      ? 'checkout'
      : 'worktree'
    if (choice.kind !== 'branch') {
      const exists = await this.git(
        context.registered.root,
        ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`],
        signal,
      )
      if (exists.code === 0)
        throw new HbarError('BRANCH_EXISTS', 'This branch already exists; choose it from the branch list')
      if (exists.code !== 1) branchGitOutput(exists)
    }
    if (choice.kind === 'new-worktree') {
      const managedRoot = resolve(this.layout.worktrees)
      if (insideBranchPath(context.registered.root, managedRoot) || sameBranchPath(managedRoot, this.layout.dataRoot))
        throw new HbarError('SESSION_LAUNCH_TARGET_INVALID_ROOT', 'Host worktrees require a separate managed directory')
      await mkdir(managedRoot, { recursive: true })
      if (!sameBranchPath(await realpath(managedRoot), managedRoot))
        throw new HbarError(
          'SESSION_LAUNCH_TARGET_INVALID_ROOT',
          'The managed worktree root must not resolve through a symlink',
        )
      const suffix = hash(`${identity.actorId}\0${identity.idempotencyKey}`)
      targetPath = resolve(managedRoot, request.sessionId, `branch-target-${suffix}`)
      if (!insideBranchPath(managedRoot, targetPath))
        throw new HbarError('SESSION_LAUNCH_TARGET_INVALID_ROOT', 'Invalid managed worktree target')
      await mkdir(dirname(targetPath), { recursive: true })
      if (!sameBranchPath(await realpath(dirname(targetPath)), dirname(targetPath)))
        throw new HbarError(
          'SESSION_LAUNCH_TARGET_INVALID_ROOT',
          'The worktree parent must not resolve through a symlink',
        )
      try {
        await lstat(targetPath)
        throw new HbarError('SESSION_LAUNCH_TARGET_PATH_OCCUPIED', 'The managed target path already contains data')
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
      }
      kind = 'worktree'
    } else {
      const targetRepository = await branchRepository(this.git, targetPath, signal)
      if (!sameBranchPath(targetRepository.common, context.registered.common))
        throw new HbarError('SESSION_BRANCH_TARGET_CHANGED', 'The selected worktree belongs to another repository')
      // Keep a registered subdirectory when selecting its own checkout, use the root of other worktrees.
      if (linked && sameBranchPath(targetRepository.root, context.execution.root)) targetPath = context.execution.path
      if (!linked || choice.kind !== 'branch') await this.assertCheckoutIdle(targetPath, signal)
    }
    const operation = await this.storage.call('beginSessionBranchTarget', {
      ...lookup,
      request,
      operationId: crypto.randomUUID(),
      targetPath,
      commonPath: context.registered.common,
      kind,
      branch,
      head: tip,
    })
    let mutated = false
    try {
      if (choice.kind === 'new-worktree') {
        mutated = true
        const result = await this.git(
          context.registered.root,
          [
            '-c',
            `core.hooksPath=${resolve(this.layout.cacheRoot, 'disabled-branch-hooks')}`,
            'worktree',
            'add',
            '-b',
            branch,
            '--',
            targetPath,
            tip,
          ],
          signal,
        )
        if (result.code !== 0)
          throw new HbarError(
            'GIT_WORKTREE_BLOCKED',
            'Git could not create the requested worktree; inspect the branch list before retrying',
          )
      } else {
        if (choice.kind === 'new-branch') {
          mutated = true
          // Expected-zero creation cannot overwrite a branch created by a competing Git command.
          const result = await this.git(
            context.registered.root,
            ['update-ref', `refs/heads/${branch}`, tip, '0'.repeat(tip.length)],
            signal,
          )
          if (result.code !== 0)
            throw new HbarError('BRANCH_EXISTS', 'Git could not create this branch without overwriting an existing ref')
        }
        if (!linked || choice.kind !== 'branch') {
          mutated = true
          const result = await this.git(
            targetPath,
            [
              '-c',
              `core.hooksPath=${resolve(this.layout.cacheRoot, 'disabled-branch-hooks')}`,
              'switch',
              '--no-guess',
              '--',
              branch,
            ],
            signal,
          )
          if (result.code !== 0)
            throw new HbarError(
              'GIT_SWITCH_BLOCKED',
              'Git refused the branch switch; keep local changes and resolve checkout conflicts before retrying',
            )
        }
      }
      await this.verifyIntent(operation, signal)
      return await this.storage.call('finishSessionBranchTarget', lookup, { status: 'ready' })
    } catch (error) {
      const failure =
        error instanceof HbarError
          ? error
          : new HbarError('RESULT_UNKNOWN', 'The Git result was interrupted; reconcile the original operation')
      const unknown =
        mutated && (signal.aborted || failure.code === 'RESULT_UNKNOWN' || failure.code === 'HOST_SHUTTING_DOWN')
      return this.storage.call('finishSessionBranchTarget', lookup, {
        status: unknown ? 'unknown' : 'failed',
        error: { code: failure.code, message: failure.message.slice(0, 1_000) },
      })
    }
  }

  private async verifyIntent(operation: SessionBranchTargetRecord, signal: AbortSignal) {
    const repository = await branchRepository(this.git, operation.targetPath, signal)
    if (!sameBranchPath(repository.common, operation.commonPath))
      throw new HbarError(
        'SESSION_BRANCH_TARGET_CHANGED',
        'The selected execution target belongs to another repository',
      )
    const actualBranch = branchGitOutput(
      await this.git(operation.targetPath, ['symbolic-ref', '--quiet', 'HEAD'], signal),
    )
    const actualHead = branchGitOutput(
      await this.git(operation.targetPath, ['rev-parse', '--verify', 'HEAD^{commit}'], signal),
    ).toLowerCase()
    if (actualBranch !== `refs/heads/${operation.branch}` || actualHead !== operation.head)
      throw new HbarError('SESSION_BRANCH_TARGET_CHANGED', 'The checkout does not match the captured branch and commit')
    const worktrees = branchWorktrees(
      branchGitOutput(await this.git(repository.root, ['worktree', 'list', '--porcelain', '-z'], signal)),
    )
    if (!worktrees.some((entry) => sameBranchPath(entry.path, repository.root) && entry.ref === actualBranch))
      throw new HbarError('SESSION_BRANCH_TARGET_CHANGED', 'The target branch is not registered at this worktree')
  }

  reconcile(identity: SessionBranchTargetIdentity, signal: AbortSignal) {
    return this.track(signal, (currentSignal) => this.reconcileInternal(identity, currentSignal))
  }
  private async reconcileInternal(identity: SessionBranchTargetIdentity, signal: AbortSignal) {
    const operation = await this.storage.call('sessionBranchTargetOperation', identity)
    if (!operation) throw new HbarError('NOT_FOUND', 'Branch operation not found')
    if (operation.snapshot.status === 'ready' || operation.snapshot.status === 'failed') return operation.snapshot
    try {
      await this.verifyIntent(operation, signal)
      return await this.storage.call('finishSessionBranchTarget', identity, { status: 'ready' })
    } catch (error) {
      const definitive = error instanceof HbarError && error.code === 'SESSION_BRANCH_TARGET_CHANGED'
      return this.storage.call('finishSessionBranchTarget', identity, {
        status: definitive ? 'failed' : 'unknown',
        error: {
          code: definitive ? 'SESSION_BRANCH_TARGET_CHANGED' : 'RESULT_UNKNOWN',
          message: 'The original branch operation could not be confirmed; inspect the checkout before retrying',
        },
      })
    }
  }
}
