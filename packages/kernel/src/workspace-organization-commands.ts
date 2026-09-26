import { CommandError, type CommandRegistry } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import {
  workspaceOrganizationCommands,
  workspaceOrganizationReceiptSchema,
  workspaceOrganizationRequestsEqual,
} from '@hbar/contracts/commands/workspace-organization'
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

/** Registers presentation-only workspace operations; session, run and directory state stay untouched. */
export function registerWorkspaceOrganizationCommands(
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
  registry.register(workspaceOrganizationCommands['workspaceOrganization.get'], (_input, context) => {
    if (!context.actorId) throw new CommandError('INVALID_INPUT', 'Authenticated actor is required')
    return read(() => storage.call('workspaceOrganization'))
  })
  registry.register(
    workspaceOrganizationCommands['workspaceOrganization.apply'],
    async (request, context) => {
      const { actorId, idempotencyKey } = context
      if (!actorId || !idempotencyKey)
        throw new CommandError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
      try {
        const result = await storage.call('applyWorkspaceOrganization', { actorId, idempotencyKey, request })
        const parsed = workspaceOrganizationReceiptSchema.safeParse(result)
        if (!parsed.success || !workspaceOrganizationRequestsEqual(parsed.data.request, request))
          throw new CommandError('RESULT_UNKNOWN', 'Workspace organization acknowledgement does not match the request')
        const receipt = parsed.data
        // The transaction has committed before notification. Readers obtain the latest revision, not this receipt.
        if (receipt.changed) changed()
        return receipt
      } catch (error) {
        if (error instanceof HbarError && rejectedBeforeCommit.has(error.code))
          throw new CommandError(error.code, error.message)
        throw new CommandError('RESULT_UNKNOWN', 'Workspace organization acknowledgement was lost; inspect its receipt')
      }
    },
    { durable: true },
  )
  registry.register(workspaceOrganizationCommands['workspaceOrganization.receipt'], (input, context) => {
    const { actorId } = context
    if (!actorId) throw new CommandError('INVALID_INPUT', 'Authenticated actor is required')
    return read(async () => {
      const result = await storage.call('workspaceOrganizationReceipt', { actorId, ...input })
      const parsed = workspaceOrganizationReceiptSchema.nullable().safeParse(result)
      if (!parsed.success || (parsed.data && !workspaceOrganizationRequestsEqual(parsed.data.request, input.request)))
        throw new CommandError('INVALID_OUTPUT', 'Workspace organization receipt does not match the request')
      return parsed.data
    })
  })
}
