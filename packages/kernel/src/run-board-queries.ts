import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import {
  runBoardCommands,
  runBoardInputSchema,
  runBoardPageSchema,
  type RunBoardInput,
  type RunBoardPage,
} from '@hbar/contracts/commands/run-board'
import type { StoragePort } from '@hbar/storage'

/** Read-only projection used by the Run/Plan board. The projection is rebuilt from storage facts per request. */
export function createRunBoardQueries(storage: StoragePort) {
  const registry = new CommandRegistry({ execution: 'host' })
  registry.register(runBoardCommands['run.board.list'], async (raw, context) => {
    if (context.signal.aborted) throw new CommandError('CANCELLED', 'Run board read was cancelled')
    let input: RunBoardInput
    try {
      input = runBoardInputSchema.parse(raw)
    } catch {
      throw new CommandError('INVALID_INPUT', 'Invalid run board query')
    }
    try {
      const page = await readRunBoardPage(storage, input)
      if (context.signal.aborted) throw new CommandError('CANCELLED', 'Run board read was cancelled')
      return page
    } catch (error) {
      if (error instanceof CommandError) throw error
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  })
  return {
    ...createCommandClient(runBoardCommands, registry),
    dispatchPrepared: registry.dispatchPrepared.bind(registry),
    dispatchPreparedTracked: registry.dispatchPreparedTracked.bind(registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    dispose: () => registry.dispose(),
  }
}

async function readRunBoardPage(storage: StoragePort, input: RunBoardInput): Promise<RunBoardPage> {
  const parsed = runBoardInputSchema.parse(input)
  try {
    const page = await storage.call('runBoard', parsed)
    const result = runBoardPageSchema.parse(page)
    if (result.workspaceId !== parsed.workspaceId || result.sessionId !== (parsed.sessionId ?? null))
      throw new CommandError('INVALID_OUTPUT', 'Run board scope does not match the request')
    if (result.items.length > parsed.limit || result.items.length > 100)
      throw new CommandError('INVALID_OUTPUT', 'Run board page exceeds its bound')
    const ids = new Set(result.items.map((item) => item.run.id))
    if (ids.size !== result.items.length) throw new CommandError('INVALID_OUTPUT', 'Run board contains duplicate runs')
    return result
  } catch (error) {
    if (error instanceof CommandError) throw error
    if (error instanceof HbarError) throw new CommandError(error.code, error.message)
    throw new CommandError('RESULT_UNKNOWN', 'Run board storage read failed')
  }
}
