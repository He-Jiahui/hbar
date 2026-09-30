import { CommandError, createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import {
  sessionLaunchBranchesCommands,
  sessionLaunchBranchCreateInputSchema,
  type SessionLaunchBranchCreateOptions,
  type SessionLaunchBranchCreateRequest,
  type SessionLaunchBranchCreateResult,
  type SessionLaunchBranchesManager,
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

function observeMutation<Result>(pending: Promise<Result>, signal?: AbortSignal): Promise<Result> {
  if (!signal) return pending
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', cancel)
    const cancel = () => {
      cleanup()
      reject(new CommandError('RESULT_UNKNOWN', 'Branch creation observation ended; verify the original ref'))
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

/** Workspace-bound ref creation; an uncertain result is never automatically retried. */
export function createSessionLaunchBranchesManager(
  transport: SessionLaunchTargetReadTransport,
): SessionLaunchBranchesManager {
  const reader = createSessionLaunchBranchesReader(transport)
  const commands = createCommandClient(
    { 'sessionLaunchBranches.create': sessionLaunchBranchesCommands['sessionLaunchBranches.create'] },
    {
      execute(commandId, input, options) {
        if (!options?.idempotencyKey)
          throw new CommandError('INVALID_INPUT', 'Branch creation requires a single-attempt correlation key')
        if (options.signal?.aborted) throw new CommandError('CANCELLED', 'Branch creation was not dispatched')
        return observeMutation(
          transport.call('command.execute', {
            protocol: COMMAND_PROTOCOL_VERSION,
            requestId: options.requestId ?? crypto.randomUUID(),
            commandId,
            commandVersion: options.version ?? 1,
            idempotencyKey: options.idempotencyKey,
            input,
          }),
          options.signal,
        )
      },
    },
  )

  return {
    list: reader.list,
    async create(input: SessionLaunchBranchCreateRequest, options: SessionLaunchBranchCreateOptions) {
      const request = sessionLaunchBranchCreateInputSchema.parse(input)
      let result: SessionLaunchBranchCreateResult
      try {
        result = await commands.execute('sessionLaunchBranches.create', request, options)
      } catch (error: unknown) {
        if (error instanceof HbarError && ['DISCONNECTED', 'CONNECTION_CLOSED', 'TIMEOUT'].includes(error.code))
          throw new CommandError('RESULT_UNKNOWN', 'Branch creation response was lost; verify the original ref')
        if (error instanceof CommandError && error.code === 'INVALID_OUTPUT')
          throw new CommandError('RESULT_UNKNOWN', 'Branch creation acknowledgement is invalid; verify the original ref')
        throw error
      }

      if (
        result.workspaceId !== request.workspaceId ||
        result.name !== request.name ||
        result.createdRef !== `refs/heads/${request.name}` ||
        result.baseRef !== request.baseRef ||
        result.baseOid.toLowerCase() !== request.expectedBaseOid.toLowerCase() ||
        result.createdOid.toLowerCase() !== request.expectedBaseOid.toLowerCase()
      )
        throw new CommandError('RESULT_UNKNOWN', 'Branch creation acknowledgement does not match; verify the original ref')
      return result
    },
  }
}
