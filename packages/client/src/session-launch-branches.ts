import { CommandError, createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import {
  sessionLaunchBranchesCommands,
  type SessionLaunchBranchesReader,
} from '@hbar/contracts/commands/session-launch-branches'
import type { SessionLaunchTargetReadTransport } from './session-launch-target'

function observeQuery<Result>(pending: Promise<Result>, signal?: AbortSignal): Promise<Result> {
  if (!signal) return pending
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', cancel)
    const cancel = () => {
      cleanup()
      reject(new CommandError('CANCELLED', 'Branch discovery observation was cancelled'))
    }
    signal.addEventListener('abort', cancel, { once: true })
    void pending.then(
      (value) => {
        cleanup()
        resolve(value)
      },
      (error: unknown) => {
        cleanup()
        reject(error)
      },
    )
    if (signal.aborted) cancel()
  })
}

/** A workspace-scoped query: no Session creation, arbitrary cwd, branch mutation or cached truth. */
export function createSessionLaunchBranchesReader(
  transport: SessionLaunchTargetReadTransport,
): SessionLaunchBranchesReader {
  const commands = createCommandClient(sessionLaunchBranchesCommands, {
    execute(commandId, input, options) {
      if (options?.signal?.aborted) throw new CommandError('CANCELLED', 'Branch discovery was not dispatched')
      return observeQuery(
        transport.call('command.execute', {
          protocol: COMMAND_PROTOCOL_VERSION,
          requestId: options?.requestId ?? crypto.randomUUID(),
          commandId,
          commandVersion: options?.version ?? 1,
          input,
        }),
        options?.signal,
      )
    },
  })
  return {
    async list(input, options) {
      const workspaceId = input.workspaceId
      const page = await commands.execute('sessionLaunchBranches.list', input, options)
      if (page.workspaceId !== workspaceId)
        throw new CommandError('INVALID_OUTPUT', 'Branch discovery page belongs to another workspace')
      return page
    },
  }
}
