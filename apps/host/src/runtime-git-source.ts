import { HbarError } from '@hbar/contracts'
import {
  gitCommands,
  gitRunContextSchema,
  gitRunOperationSchema,
  type GitRunOperation,
} from '@hbar/contracts/commands/git'
import type { GitService, ToolContext } from '@hbar/plugin-sdk'

type RuntimeGitSource = Pick<
  GitService,
  'info' | 'status' | 'diff' | 'log' | 'stats' | 'commit' | 'branch' | 'worktree' | 'diffToRemote'
>

/** Ordinary service calls retain the original physical tool owner and use a captured workspace scope. */
export function createRuntimeGitSource(service: Pick<GitService, 'forRun'>, context: ToolContext): RuntimeGitSource {
  const facts = gitRunContextSchema.parse({
    workspacePath: context.workspace.path,
    sessionId: context.session.id,
    runId: context.run.id,
    callId: context.callId,
  })
  const signal = context.signal
  const remote = context.workspace.location?.kind === 'node'
  const call = async (method: GitRunOperation['method'], input: Record<string, unknown>, other?: AbortSignal) => {
    const actual = AbortSignal.any([signal, ...(other ? [other] : [])])
    actual.throwIfAborted()
    if (remote)
      throw new HbarError('COMMAND_SOURCE_NODE_GIT_UNAVAILABLE', 'This Git provider cannot execute on the source node')
    if (!service.forRun)
      throw new HbarError(
        'COMMAND_SOURCE_METHOD_UNAVAILABLE',
        'The source Git provider does not support Run-scoped commands',
      )
    const operation = gitRunOperationSchema.parse({ method, input: JSON.parse(JSON.stringify(input)) as unknown })
    return service.forRun(operation, structuredClone(facts), actual)
  }
  return {
    info: async (_cwd, signal) => gitCommands['git.info'].output.parse(await call('info', {}, signal)),
    status: async (_cwd, signal) => gitCommands['git.status'].output.parse(await call('status', {}, signal)),
    diff: async (_cwd, options, signal) =>
      gitCommands['git.diff'].output.parse(await call('diff', { ...options }, signal)),
    log: async (_cwd, limit, signal) => gitCommands['git.log'].output.parse(await call('log', { limit }, signal)),
    stats: async (_cwd, options, signal) =>
      gitCommands['git.stats'].output.parse(await call('stats', { ...options }, signal)),
    commit: async (_cwd, options, signal) =>
      gitCommands['git.commit'].output.parse(
        await call(
          'commit',
          {
            message: options.message,
            paths: options.paths,
            stage: options.stage,
          },
          signal,
        ),
      ),
    branch: async (_cwd, operation, signal) =>
      gitCommands['git.branch'].output.parse(await call('branch', { ...operation }, signal)),
    worktree: async (_cwd, operation, signal) =>
      gitCommands['git.worktree'].output.parse(await call('worktree', { ...operation }, signal)),
    diffToRemote: async (_cwd, signal) =>
      gitCommands['git.diffToRemote'].output.parse(await call('diffToRemote', {}, signal)),
  }
}
