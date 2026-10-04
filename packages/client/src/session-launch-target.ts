import { CommandError, createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import type { RpcParams } from '@hbar/contracts'
import { sessionLaunchTargetCommands } from '@hbar/contracts/commands/session-launch-target'
import type { SessionLaunchTargetReader } from '@hbar/contracts/commands/session-launch-target'

export interface SessionLaunchTargetReadTransport {
  call(method: 'command.execute', params: RpcParams<'command.execute'>): Promise<unknown>
}

function observeRead<Result>(pending: Promise<Result>, signal?: AbortSignal): Promise<Result> {
  if (!signal) return pending
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', cancel)
    const cancel = () => {
      cleanup()
      reject(new CommandError('CANCELLED', 'Session launch-target observation was cancelled'))
    }
    signal.addEventListener('abort', cancel, { once: true })
    // There is no remote query-cancel RPC. Always consume settlement, even when
    // the observer leaves; the authenticated transport still owns its deadline.
    void pending.then(
      (result) => {
        cleanup()
        resolve(result)
      },
      (error: unknown) => {
        cleanup()
        reject(error)
      },
    )
    if (signal.aborted) cancel()
  })
}

/** No cache or guessed revision: every read asks this client's authenticated Host. */
export function createSessionLaunchTargetReader(client: SessionLaunchTargetReadTransport): SessionLaunchTargetReader {
  const commands = createCommandClient(
    { 'sessionLaunchTarget.get': sessionLaunchTargetCommands['sessionLaunchTarget.get'] },
    {
      execute(commandId, input, options) {
        if (options?.signal?.aborted)
          return Promise.reject(new CommandError('CANCELLED', 'Session launch-target read was not dispatched'))
        return observeRead(
          client.call('command.execute', {
            protocol: COMMAND_PROTOCOL_VERSION,
            requestId: options?.requestId ?? crypto.randomUUID(),
            commandId,
            commandVersion: options?.version ?? 1,
            input,
          }),
          options?.signal,
        )
      },
    },
  )
  return {
    async read(sessionId, options) {
      const target = await commands.execute('sessionLaunchTarget.get', { sessionId }, options)
      if (target.sessionId !== sessionId)
        throw new CommandError('INVALID_OUTPUT', 'Session launch-target response belongs to another session')
      return target
    },
  }
}
