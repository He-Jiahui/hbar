import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { HbarError } from '@hbar/contracts'
import { isPathWithin } from '@hbar/contracts/path-containment'
import { nodeGitMethods, type NodeGitMethod, type NodeGitWorktreeOperation } from '@hbar/contracts/node-git'
import type { NodeStatePort } from '@hbar/contracts/node-state'
import { nodeCallAuthoritySchema } from '@hbar/contracts/node-authority'
import type { GitService, OsConfinementOptions } from '@hbar/plugin-sdk'
import type { NodeCallAuthority } from '@hbar/contracts/node'
import {
  nodeWorktreeProvisioningAuthoritySchema,
  type NodeWorktreeProvisioningAuthority,
} from '@hbar/contracts/node-worktree-provisioning'
import type { ProcessPermissionManifest } from './process-permissions'
import type { NodeExecutionBackend } from './execution-backend'
import { createNodeGitRunner, withNodeGitAdmission, type NodeGitAdmission } from './git-service'
import { localNodePaths } from './paths'

const MAX_RESULT_BYTES = 48 * 1024
const MAX_GIT_COMMAND_MS = 120_000

interface NodeGitRequestBase {
  readonly operationId: string
  readonly rootId: string
  readonly expectedRoot: string
  readonly cwd: string
  readonly method: NodeGitMethod
}

export type NodeGitRequest = NodeGitRequestBase &
  (
    | {
        readonly method: 'git.worktree'
        readonly provisioning: NodeWorktreeProvisioningAuthority
        readonly operation: NodeGitWorktreeOperation
      }
    | {
        readonly method: Exclude<NodeGitMethod, 'git.worktree'>
        readonly authority: NodeCallAuthority
        readonly cached?: boolean
        readonly paths?: readonly string[]
        readonly limit?: number
        readonly message?: string
        readonly stage?: boolean
        readonly source?: 'auto' | 'manual'
      }
  )

export interface NodeGitAdmissionContext {
  readonly rootPath: string
  readonly cwd: string
  readonly registrationAccess: 'read' | 'write'
  readonly timeoutMs: number
  readonly environment: Readonly<Record<string, string>>
  readonly environmentAllowlist: readonly string[]
  readonly confinement: OsConfinementOptions | null
  readonly protectedPaths: readonly string[]
  readonly readOnlyPaths: readonly string[]
  readonly manifest: ProcessPermissionManifest
  readonly hooksPath: string
  readonly networkEnabled: boolean
  readonly maxOutputBytes: number
  /** Set only after allocator manifest authorization; never supplied by the Git caller. */
  readonly managedWorktreePath?: string
  /** Releases the policy reservation acquired by admit, including failed acceptance. */
  readonly release: () => void
}

export interface NodeGitOperationOptions {
  readonly state: NodeStatePort
  readonly backend: NodeExecutionBackend
  readonly gitForRoot: (root: string) => GitService
  /** Performs B-local root, floor, snapshot, admission, and repo metadata checks. */
  readonly admit: (
    request: NodeGitRequest,
    effect: 'read' | 'write',
    signal: AbortSignal,
  ) => Promise<NodeGitAdmissionContext>
  /** B-local approval gate. Core invokes it only after its policy admission and before receipt acceptance. */
  readonly confirm?: (
    request: NodeGitRequest,
    effect: 'read' | 'write',
    argumentsDigest: string,
    signal: AbortSignal,
  ) => Promise<void>
  readonly available: (operationId: string) => void
  readonly registerOperation: (input: {
    operationId: string
    controller: AbortController
    finished: Promise<void>
  }) => () => void
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function auditEntry(
  request: NodeGitRequest,
  argumentsDigest: string,
  decision: 'allow' | 'deny',
  backend: NodeExecutionBackend['name'],
  code: string | number | null,
) {
  return request.method === 'git.worktree'
    ? {
        operationId: request.operationId,
        source: 'launch-target' as const,
        sessionId: request.provisioning.sessionId,
        runId: request.provisioning.runId,
        workspaceId: request.provisioning.workspaceId,
        nodeId: request.provisioning.nodeId,
        targetRevision: request.provisioning.targetRevision,
        acceptedTargetDigest: request.provisioning.acceptedTargetDigest,
        workspaceFolderRevision: request.provisioning.workspaceFolderRevision,
        workspaceFolderDigest: request.provisioning.workspaceFolderDigest,
        rootId: request.rootId,
        rootPath: request.expectedRoot,
        tool: request.method,
        argumentsDigest,
        decision,
        backend,
        code,
      }
    : {
        operationId: request.operationId,
        sessionId: request.authority.sessionId,
        runId: request.authority.runId,
        callId: request.authority.callId,
        admission: request.authority.admission,
        tool: request.method,
        argumentsDigest,
        decision,
        backend,
        code,
      }
}

function requestEffect(method: NodeGitMethod): 'read' | 'write' {
  return method === 'git.stage' || method === 'git.unstage' || method === 'git.commit' || method === 'git.worktree'
    ? 'write'
    : 'read'
}

function parseRequest(method: NodeGitMethod, raw: unknown): NodeGitRequest {
  switch (method) {
    case 'git.info':
      return { ...nodeGitMethods[method].input.parse(raw), method }
    case 'git.status':
      return { ...nodeGitMethods[method].input.parse(raw), method }
    case 'git.diff':
      return { ...nodeGitMethods[method].input.parse(raw), method }
    case 'git.log':
      return { ...nodeGitMethods[method].input.parse(raw), method }
    case 'git.stage':
      return { ...nodeGitMethods[method].input.parse(raw), method }
    case 'git.unstage':
      return { ...nodeGitMethods[method].input.parse(raw), method }
    case 'git.commit':
      return { ...nodeGitMethods[method].input.parse(raw), method }
    case 'git.worktree':
      return { ...nodeGitMethods[method].input.parse(raw), cwd: '.', method }
  }
}

function executeGit(
  service: GitService,
  request: NodeGitRequest,
  signal: AbortSignal,
  managedWorktreePath?: string,
): Promise<unknown> {
  switch (request.method) {
    case 'git.info':
      return service.info(request.cwd, signal)
    case 'git.status':
      return service.status(request.cwd, signal)
    case 'git.diff':
      return service.diff(
        request.cwd,
        {
          cached: request.cached ?? false,
          paths: [...(request.paths ?? [])],
          scope: 'execution-root',
        },
        signal,
      )
    case 'git.log':
      return service.log(request.cwd, request.limit ?? 20, signal)
    case 'git.stage':
      return service.stage(request.cwd, [...(request.paths ?? [])], signal)
    case 'git.unstage':
      return service.unstage(request.cwd, [...(request.paths ?? [])], signal)
    case 'git.commit':
      return service.commit(
        request.cwd,
        {
          message: request.message ?? '',
          paths: [...(request.paths ?? [])],
          stage: request.stage ?? false,
          provenance: {
            source: request.source ?? 'auto',
            sessionId: request.authority.sessionId,
            runId: request.authority.runId,
            operationId: request.authority.callId,
          },
        },
        signal,
      )
    case 'git.worktree': {
      if (!request.operation || !managedWorktreePath)
        throw new HbarError('NODE_DENIED', 'Git worktree operation has no B-authorized target')
      const operation =
        request.operation.kind === 'add'
          ? {
              operation: 'add' as const,
              path: managedWorktreePath,
              branch: request.operation.branch,
              createBranch: request.operation.createBranch,
              ...(request.operation.startPoint ? { startPoint: request.operation.startPoint } : {}),
            }
          : { operation: 'remove' as const, path: managedWorktreePath }
      return service.worktree(request.cwd, operation, signal).then((result) => {
        if (Array.isArray(result))
          throw new HbarError('GIT_WORKTREE_RESULT', 'Git did not return the managed worktree result')
        return { path: result.path }
      })
    }
  }
}

function safeGitArgs(args: readonly string[], hooksPath: string): [string, ...string[]] {
  const portableHooksPath = hooksPath.replaceAll('\\', '/')
  const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null'
  const fixed = [
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
    'submodule.recurse=false',
    '-c',
    'status.submoduleSummary=false',
    '-c',
    'core.pager=cat',
    '-c',
    'pager.branch=false',
    '-c',
    'pager.status=false',
    '-c',
    'credential.helper=',
    '-c',
    'protocol.file.allow=never',
    '-c',
    'protocol.ext.allow=never',
  ]
  return ['git', ...fixed, ...args]
}

/** One durable domain receipt covers all bounded argv children of a GitService method. */
export class NodeGitOperationService {
  private readonly stopped = new AbortController()
  private readonly active = new Map<string, { controller: AbortController; finished: Promise<void> }>()
  private readonly locks = new Map<string, Promise<void>>()

  constructor(private readonly options: NodeGitOperationOptions) {}

  private async serial<T>(operationId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(operationId) ?? Promise.resolve()
    let unlock: (() => void) | undefined
    const next = new Promise<void>((resolve) => {
      unlock = resolve
    })
    this.locks.set(operationId, next)
    await previous
    try {
      return await action()
    } finally {
      unlock?.()
      if (this.locks.get(operationId) === next) this.locks.delete(operationId)
    }
  }

  async invoke(method: NodeGitMethod, raw: unknown, transportSignal: AbortSignal): Promise<unknown> {
    const request = parseRequest(method, raw)
    const operationSignal = AbortSignal.any([transportSignal, this.stopped.signal])
    const operationId = request.operationId
    if (request.method === 'git.worktree') {
      const provisioning = nodeWorktreeProvisioningAuthoritySchema.parse(request.provisioning)
      const expectedSuffix = request.operation.kind === 'add' ? 'worktree-create' : 'worktree-remove'
      if (operationId !== `${provisioning.runId}:${expectedSuffix}`)
        throw new HbarError('WORKSPACE_SCOPE', 'Git worktree operation key does not match launch-target authority')
    } else {
      const authority = nodeCallAuthoritySchema.parse(request.authority)
      if (operationId !== `${authority.runId}:${authority.callId}`)
        throw new HbarError('WORKSPACE_SCOPE', 'Git operation key does not match Host admission')
    }
    this.options.available(operationId)
    return this.serial(operationId, async () => {
      operationSignal.throwIfAborted()
      const prior = await this.options.state.call('operation.get', { operationId })
      const argumentsDigest = digest({ method, request })
      if (prior) {
        if (prior.argumentsDigest !== argumentsDigest)
          throw new HbarError('IDEMPOTENCY_CONFLICT', 'Git operation key has different parameters')
        if (prior.receipt.state === 'settled') {
          if (prior.receipt.result.isError)
            throw new HbarError(String(prior.receipt.result.details.code), prior.receipt.result.text)
          return nodeGitMethods[method].output.parse(JSON.parse(prior.receipt.result.text))
        }
        throw new HbarError('EFFECT_UNKNOWN', 'Prior Git operation has no verified result; inspect repository state')
      }
      const effect = requestEffect(method)
      const admission = await this.options.admit(request, effect, operationSignal)
      let released = false
      const release = () => {
        if (!released) {
          released = true
          admission.release()
        }
      }
      try {
        operationSignal.throwIfAborted()
        this.options.available(operationId)
        await this.options.confirm?.(request, effect, argumentsDigest, operationSignal)
        operationSignal.throwIfAborted()
        this.options.available(operationId)
        if (admission.networkEnabled)
          throw new HbarError('NODE_NETWORK_UNSUPPORTED', 'Git operations require network access to remain disabled')
        const execArgv = this.options.backend.execArgv
        if (!this.options.backend.processTree || !execArgv)
          throw new HbarError('NODE_CONFINEMENT_UNAVAILABLE', 'Git requires a managed argv process tree')
        if (!Number.isSafeInteger(admission.timeoutMs) || admission.timeoutMs < 1)
          throw new HbarError('INVALID_INPUT', 'Git operation requires a positive total timeout')
        const accepted = await this.options.state.call('operation.accept', {
          operationId,
          argumentsDigest,
          kind: 'git',
          target: { rootId: request.rootId, path: request.cwd, nodePath: admission.rootPath },
          authority: request.method === 'git.worktree' ? request.provisioning : request.authority,
        })
        if (!accepted.accepted) throw new HbarError('EFFECT_UNKNOWN', 'Git operation was accepted by another worker')
        try {
          this.options.available(operationId)
          await this.options.state.call('operation.start', { operationId })
          this.options.available(operationId)
        } catch (error) {
          const result = {
            text: error instanceof Error ? error.message.slice(0, 8_000) : 'Git operation was refused before start',
            isError: true,
            details: {
              code: error instanceof HbarError ? error.code : 'GIT_OPERATION_FAILED',
              exitCode: null,
              truncated: false,
              executionStarted: false,
              backend: this.options.backend.name,
              timeoutMs: admission.timeoutMs,
            },
          }
          await this.options.state.call('operation.settle', { operationId, result })
          await this.options.state.call(
            'audit.append',
            auditEntry(
              request,
              argumentsDigest,
              'deny',
              this.options.backend.name,
              error instanceof HbarError ? error.code : 'GIT_OPERATION_FAILED',
            ),
          )
          throw error
        }
        const controller = new AbortController()
        const signal = AbortSignal.any([operationSignal, controller.signal])
        const deadline = Date.now() + Math.min(admission.timeoutMs, MAX_GIT_COMMAND_MS)
        let finishActive: (() => void) | undefined
        const finished = new Promise<void>((resolve) => {
          finishActive = resolve
        })
        this.active.set(operationId, { controller, finished })
        const unregister = this.options.registerOperation({ operationId, controller, finished })
        // The running operation is now counted by the active map instead of the admission reservation.
        release()
        let started = false
        try {
          const service = this.options.gitForRoot(admission.rootPath)
          const executionRequest: NodeGitRequest = { ...request, cwd: admission.cwd }
          const runArgv = async (args: readonly string[], commandSignal: AbortSignal, timeoutMs: number) => {
            const remaining = deadline - Date.now()
            if (remaining <= 0) throw new HbarError('GIT_TIMEOUT', 'Git operation exceeded its total deadline')
            const result = await execArgv(admission.cwd, safeGitArgs(args, admission.hooksPath), commandSignal, {
              timeoutMs: Math.min(remaining, timeoutMs),
              environment: {
                ...admission.environment,
                GIT_CONFIG_NOSYSTEM: '1',
                ...(process.platform === 'win32' ? { GIT_CONFIG_GLOBAL: 'NUL' } : { GIT_CONFIG_GLOBAL: '/dev/null' }),
                GIT_TERMINAL_PROMPT: '0',
                GIT_OPTIONAL_LOCKS: '0',
                GIT_PAGER: 'cat',
                PAGER: 'cat',
                GIT_EDITOR: 'true',
                GIT_SEQUENCE_EDITOR: 'true',
              },
              environmentAllowlist: admission.environmentAllowlist,
              confinement: admission.confinement,
              protectedPaths: [...admission.protectedPaths, ...admission.manifest.protectedPaths],
              readOnlyPaths: [...admission.readOnlyPaths, ...admission.manifest.readOnlyPaths],
            })
            if (result.timedOut) throw new HbarError('GIT_TIMEOUT', 'Git argv command exceeded its deadline')
            if (result.truncated) throw new HbarError('GIT_OUTPUT_LIMIT', 'Git argv output exceeded its byte limit')
            if (
              Buffer.byteLength(result.stdout, 'utf8') + Buffer.byteLength(result.stderr, 'utf8') >
              admission.maxOutputBytes
            )
              throw new HbarError('GIT_OUTPUT_LIMIT', 'Git argv result exceeds its configured byte limit')
            return result
          }
          const validateArgs = async (args: readonly string[], childSignal: AbortSignal) => {
            const command = args[0]
            const worktreeAdd = command === 'worktree' && args[1] === 'add'
            if (command !== 'add' && command !== 'commit' && !worktreeAdd) return
            if (command === 'add' && !args.includes('--'))
              throw new HbarError('GIT_PATH_REQUIRED', 'Git stage requires explicit paths')
            const config = await runArgv(
              [
                'config',
                '--local',
                '--no-includes',
                '--name-only',
                '--get-regexp',
                '^(filter\\.|include(if)?(\\..*)?\\.path$)',
              ],
              childSignal,
              5_000,
            )
            if (config.exitCode === 0 && config.stdout.trim())
              throw new HbarError('GIT_FILTER_DENIED', 'Repository filter or include configuration is not allowed')
            if (config.exitCode !== 0 && config.exitCode !== 1)
              throw new HbarError('GIT_CONFIG_UNAVAILABLE', 'Could not verify repository Git configuration')
            if (worktreeAdd) return
            const separator = args.indexOf('--')
            const paths = separator >= 0 ? args.slice(separator + 1) : []
            if (paths.length) {
              const attributes = await runArgv(
                ['--literal-pathspecs', 'check-attr', '-z', 'filter', '--', ...paths],
                childSignal,
                5_000,
              )
              if (attributes.exitCode !== 0)
                throw new HbarError('GIT_ATTRIBUTE_UNAVAILABLE', 'Could not verify Git filter attributes')
              const fields = attributes.stdout.split('\0')
              for (let index = 2; index < fields.length; index += 3) {
                const value = fields[index]
                if (value !== undefined && value !== 'unspecified' && value !== 'unset')
                  throw new HbarError('GIT_FILTER_DENIED', 'Git filter attributes are not allowed for staged paths')
              }
            }
          }
          const runnerAdmission: NodeGitAdmission = {
            rootPath: admission.rootPath,
            cwd: admission.cwd,
            run: async (args, childSignal, limits) => {
              const commandSignal = AbortSignal.any([signal, childSignal])
              commandSignal.throwIfAborted()
              started = true
              await validateArgs(args, commandSignal)
              const result = await runArgv(args, commandSignal, limits.timeoutMs)
              return {
                stdout: result.stdout,
                stderr: result.stderr,
                code: result.exitCode,
                truncated: false,
              }
            },
          }
          const value = await withNodeGitAdmission(runnerAdmission, signal, () =>
            (async () => {
              started = true
              const repository = await runArgv(
                ['rev-parse', '--path-format=absolute', '--show-toplevel', '--absolute-git-dir', '--git-common-dir'],
                signal,
                5_000,
              )
              if (repository.exitCode !== 0)
                throw new HbarError('GIT_REPOSITORY_REQUIRED', 'The registered root is not a Git repository')
              const [topLevel, gitDir, commonDir] = repository.stdout.split(/\r?\n/).filter(Boolean)
              const root = await realpath(admission.rootPath)
              if (!topLevel || resolve(topLevel) !== root)
                throw new HbarError('GIT_REPOSITORY_SCOPE', 'Git repository root differs from the registered root')
              if (!gitDir || !commonDir)
                throw new HbarError('GIT_REPOSITORY_SCOPE', 'Git did not report its metadata directories')
              const canonicalGitDir = await realpath(gitDir)
              const canonicalCommonDir = await realpath(commonDir)
              const paths = { separator: localNodePaths.separator, caseInsensitive: false }
              if (!isPathWithin(root, canonicalGitDir, paths) || !isPathWithin(root, canonicalCommonDir, paths))
                throw new HbarError('GIT_REPOSITORY_SCOPE', 'External Git metadata directories are not allowed')
              return await executeGit(service, executionRequest, signal, admission.managedWorktreePath)
            })(),
          )
          const parsed = nodeGitMethods[method].output.parse(value)
          const serialized = JSON.stringify(parsed)
          if (Buffer.byteLength(serialized, 'utf8') > MAX_RESULT_BYTES)
            throw new HbarError('GIT_OUTPUT_LIMIT', 'Typed Git result exceeds the receipt size limit')
          const result = {
            text: serialized,
            isError: false,
            details: {
              code: 0,
              exitCode: 0,
              truncated: false,
              executionStarted: started,
              backend: this.options.backend.name,
              timeoutMs: admission.timeoutMs,
            },
          }
          await this.options.state.call('operation.settle', { operationId, result })
          await this.options.state.call(
            'audit.append',
            auditEntry(request, argumentsDigest, 'allow', this.options.backend.name, 0),
          )
          return parsed
        } catch (error) {
          if (error instanceof HbarError && error.code === 'EFFECT_UNKNOWN') {
            await this.options.state.call('operation.lost', { operationId, reason: 'unknown' })
            throw error
          }
          const failure = {
            text: error instanceof Error ? error.message.slice(0, 8_000) : 'Git operation failed',
            isError: true,
            details: {
              code: error instanceof HbarError ? error.code : 'GIT_OPERATION_FAILED',
              exitCode: null,
              truncated: false,
              executionStarted: started,
              backend: this.options.backend.name,
              timeoutMs: admission.timeoutMs,
            },
          }
          await this.options.state.call('operation.settle', { operationId, result: failure })
          await this.options.state.call(
            'audit.append',
            auditEntry(
              request,
              argumentsDigest,
              started ? 'allow' : 'deny',
              this.options.backend.name,
              error instanceof HbarError ? error.code : 'GIT_OPERATION_FAILED',
            ),
          )
          throw error
        } finally {
          this.active.delete(operationId)
          unregister()
          finishActive?.()
          release()
        }
      } catch (error) {
        release()
        throw error
      }
    })
  }

  async cancel(operationId: string): Promise<void> {
    this.active.get(operationId)?.controller.abort(new HbarError('CANCELLED', 'Git operation cancelled'))
  }
  async dispose(): Promise<void> {
    this.stopped.abort(new HbarError('NODE_OFFLINE', 'Git service is closing'))
    for (const active of this.active.values())
      active.controller.abort(new HbarError('NODE_OFFLINE', 'Git service is closing'))
    await Promise.allSettled([...this.locks.values()])
    await Promise.allSettled([...this.active.values()].map(({ finished }) => finished))
    this.active.clear()
  }
}

export function createNodeGitRuntimeRunner() {
  return createNodeGitRunner()
}
