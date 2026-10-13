import { AsyncLocalStorage } from 'node:async_hooks'
import { isAbsolute, resolve } from 'node:path'
import { HbarError } from '@hbar/contracts'
import { isPathWithin } from '@hbar/contracts/path-containment'

export interface NodeGitCommandResult {
  readonly stdout: string
  readonly stderr: string
  readonly code: number
  readonly truncated: boolean
  readonly timedOut?: boolean
}

export interface NodeGitLimits {
  readonly timeoutMs: number
  readonly maxOutputBytes: number
}

/** B-local authority captured and re-evaluated for one complete Git operation. */
export interface NodeGitAdmission {
  readonly rootPath: string
  readonly cwd: string
  readonly timeoutMs?: number
  readonly environment?: Readonly<Record<string, string>>
  readonly confinement?: import('@hbar/plugin-sdk').OsConfinementOptions | null
  readonly protectedPaths?: readonly string[]
  readonly readOnlyPaths?: readonly string[]
  readonly environmentAllowlist?: readonly string[]
  run(args: readonly string[], signal: AbortSignal, limits: NodeGitLimits): Promise<NodeGitCommandResult>
}

interface GitContext {
  readonly admission: NodeGitAdmission
  readonly signal: AbortSignal
}

const context = new AsyncLocalStorage<GitContext>()
const pathComparison = {
  separator: process.platform === 'win32' ? ('\\' as const) : ('/' as const),
  caseInsensitive: false,
}

/** Run every subprocess belonging to one GitService method under the same B admission. */
export function withNodeGitAdmission<T>(
  admission: NodeGitAdmission,
  signal: AbortSignal,
  operation: () => Promise<T>,
): Promise<T> {
  signal.throwIfAborted()
  if (!isAbsolute(admission.rootPath) || !isAbsolute(admission.cwd))
    throw new HbarError('NODE_DENIED', 'Git admission paths must be absolute node paths')
  if (!isPathWithin(resolve(admission.rootPath), resolve(admission.cwd), pathComparison))
    throw new HbarError('NODE_DENIED', 'Git operation cwd leaves its admitted root')
  return context.run({ admission, signal }, operation)
}

/** Structural adapter for GitRuntime's private GitRunner seam. It never spawns a local process. */
export function createNodeGitRunner() {
  return {
    async run(cwd: string, args: string[], signal: AbortSignal, limits: NodeGitLimits): Promise<NodeGitCommandResult> {
      const active = context.getStore()
      if (!active) throw new HbarError('NODE_GIT_ADMISSION_REQUIRED', 'Git process has no node admission')
      active.signal.throwIfAborted()
      signal.throwIfAborted()
      const requestedCwd = resolve(cwd)
      const admittedCwd = resolve(active.admission.cwd)
      if (
        !isPathWithin(requestedCwd, admittedCwd, pathComparison) ||
        !isPathWithin(admittedCwd, requestedCwd, pathComparison)
      )
        throw new HbarError('NODE_DENIED', 'Git subprocess cwd differs from its admitted operation target')
      return active.admission.run(args, AbortSignal.any([active.signal, signal]), limits)
    },
  }
}
