import { CommandError, type CommandRegistry } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import {
  workspaceDisplayNamesCommands,
  workspaceDisplayNamesReceiptSchema,
  workspaceDisplayNamesRequestsEqual,
} from '@hbar/contracts/commands/workspace-display-names'
import type { StoragePort } from '@hbar/storage'

const rejectedBeforeCommit = new Set([
  'COMMAND_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'INVALID_INPUT',
  'NOT_FOUND',
  'INPUT_TOO_LARGE',
  'VERSION_MISMATCH',
  'INVALID_STATE',
])

export function registerWorkspaceDisplayNamesCommands(
  registry: CommandRegistry,
  storage: StoragePort,
  changed: () => void,
): void {
  const read = async <Value>(operation: () => Promise<Value>): Promise<Value> => {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  }
  registry.register(workspaceDisplayNamesCommands['workspaceDisplayNames.get'], (_input, context) => {
    if (!context.actorId) throw new CommandError('INVALID_INPUT', 'Authenticated actor is required')
    return read(() => storage.call('workspaceDisplayNames'))
  })
  registry.register(
    workspaceDisplayNamesCommands['workspaceDisplayNames.apply'],
    async (request, context) => {
      const { actorId, idempotencyKey } = context
      if (!actorId || !idempotencyKey)
        throw new CommandError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
      try {
        const result = await storage.call('applyWorkspaceDisplayNames', { actorId, idempotencyKey, request })
        const parsed = workspaceDisplayNamesReceiptSchema.safeParse(result)
        if (!parsed.success || !workspaceDisplayNamesRequestsEqual(parsed.data.request, request))
          throw new CommandError('RESULT_UNKNOWN', 'Workspace display name acknowledgement does not match the request')
        if (parsed.data.changed) changed()
        return parsed.data
      } catch (error) {
        if (error instanceof HbarError && rejectedBeforeCommit.has(error.code))
          throw new CommandError(error.code, error.message)
        throw new CommandError('RESULT_UNKNOWN', 'Workspace display name acknowledgement was lost; inspect its receipt')
      }
    },
    { durable: true },
  )
  registry.register(workspaceDisplayNamesCommands['workspaceDisplayNames.receipt'], (input, context) => {
    const { actorId } = context
    if (!actorId) throw new CommandError('INVALID_INPUT', 'Authenticated actor is required')
    return read(async () => {
      const result = await storage.call('workspaceDisplayNamesReceipt', { actorId, ...input })
      const parsed = workspaceDisplayNamesReceiptSchema.nullable().safeParse(result)
      if (!parsed.success || (parsed.data && !workspaceDisplayNamesRequestsEqual(parsed.data.request, input.request)))
        throw new CommandError('INVALID_OUTPUT', 'Workspace display name receipt does not match the request')
      return parsed.data
    })
  })
}
