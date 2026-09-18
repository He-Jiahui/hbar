import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { gitCommands } from '@hbar/contracts/commands/git'
import type { GitBranchOperation, GitService, GitWorktreeOperation } from '@hbar/plugin-sdk'

export function createGitCommands(service: GitService) {
  const registry = new CommandRegistry({ execution: 'host' })
  const translate = async <Value>(operation: () => Promise<Value>): Promise<Value> => {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  }
  const translateExternal = async <Value>(operation: () => Promise<Value>): Promise<Value> => {
    try {
      return await translate(operation)
    } catch (error) {
      if (error instanceof CommandError && ['ABORT_ERR', 'GIT_TIMEOUT'].includes(error.code))
        throw new CommandError('RESULT_UNKNOWN', 'Git mutation may have completed; inspect repository state')
      throw error
    }
  }
  const branchOperation = (input: {
    operation: 'list' | 'create' | 'switch' | 'delete'
    name?: string | undefined
    force: boolean
  }): GitBranchOperation => {
    if (input.operation === 'list') return { operation: 'list' }
    if (!input.name) throw new CommandError('INVALID_INPUT', 'Branch name is required for mutations')
    return { operation: input.operation, name: input.name, force: input.force }
  }
  const worktreeOperation = (input: {
    operation: 'list' | 'add' | 'remove'
    path?: string | undefined
    branch?: string | undefined
    createBranch: boolean
    force: boolean
  }): GitWorktreeOperation => {
    if (input.operation === 'list') return { operation: 'list' }
    if (!input.path) throw new CommandError('INVALID_INPUT', 'Worktree path is required for mutations')
    return input.operation === 'add'
      ? { operation: 'add', path: input.path, branch: input.branch, createBranch: input.createBranch }
      : { operation: 'remove', path: input.path, force: input.force }
  }

  registry.register(gitCommands['git.info'], (input, context) =>
    translate(() => service.info(input.cwd, context.signal)),
  )
  registry.register(gitCommands['git.status'], (input, context) =>
    translate(() => service.status(input.cwd, context.signal)),
  )
  registry.register(gitCommands['git.diff'], (input, context) =>
    translate(() => service.diff(input.cwd, { cached: input.cached, paths: input.paths }, context.signal)),
  )
  registry.register(gitCommands['git.log'], (input, context) =>
    translate(() => service.log(input.cwd, input.limit, context.signal)),
  )
  registry.register(gitCommands['git.stats'], (input, context) =>
    translate(() =>
      service.stats(
        input.cwd,
        {
          from: input.from,
          to: input.to,
          bucketMs: input.bucketMs,
          maxBuckets: input.maxBuckets,
          sources: input.sources,
        },
        context.signal,
      ),
    ),
  )
  registry.register(
    gitCommands['git.commit'],
    (input, context) =>
      translateExternal(() =>
        service.commit(
          input.cwd,
          {
            message: input.message,
            paths: input.paths,
            stage: input.stage,
            provenance: {
              source: 'manual',
              sessionId: input.sessionId,
              runId: input.runId,
              operationId: context.requestId,
            },
          },
          context.signal,
        ),
      ),
    { durable: true },
  )
  registry.register(
    gitCommands['git.branch'],
    (input, context) => translateExternal(() => service.branch(input.cwd, branchOperation(input), context.signal)),
    { durable: true },
  )
  registry.register(
    gitCommands['git.worktree'],
    (input, context) => translateExternal(() => service.worktree(input.cwd, worktreeOperation(input), context.signal)),
    { durable: true },
  )
  registry.register(gitCommands['git.diffToRemote'], (input, context) =>
    translate(() => service.diffToRemote(input.cwd, context.signal)),
  )
  return {
    ...createCommandClient(gitCommands, registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    dispose: () => registry.dispose(),
  }
}
