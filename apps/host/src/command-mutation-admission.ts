import { HbarError } from '@hbar/contracts'
import {
  commandExecutionPendingSchema,
  type CommandExecutionIdentity,
  type CommandExecutionPending,
} from '@hbar/contracts/command-execution'
import type { StoragePort } from '@hbar/storage'

export type PendingCommandMutation = CommandExecutionPending['items'][number]
/** Stable Host composition only. This state can exempt an original, still-followed call; it cannot start one. */
export interface CommandMutationState {
  isKnownPending(item: PendingCommandMutation, runId: string): boolean
}

export class CommandMutationAdmission {
  constructor(
    private readonly storage: StoragePort,
    private readonly known: (item: PendingCommandMutation, runId: string) => boolean = () => false,
  ) {}

  async assertAllowed(
    context: { readonly sessionId: string; readonly runId: string; readonly signal?: AbortSignal },
    own?: CommandExecutionIdentity,
  ): Promise<void> {
    context.signal?.throwIfAborted()
    const pending = commandExecutionPendingSchema.parse(
      await this.storage.call('commandExecutionPending', context.sessionId),
    )
    context.signal?.throwIfAborted()
    if (pending.sessionId !== context.sessionId)
      throw new HbarError('COMMAND_RECEIPT_MISMATCH', 'Mutation admission returned a different Session')
    for (const item of pending.items) {
      if (
        own &&
        item.sessionId === own.sessionId &&
        item.actorId === own.actorId &&
        item.operationKey === own.operationKey
      )
        continue
      if (this.known(item, context.runId)) continue
      throw new HbarError(
        'COMMAND_RESULT_UNCONFIRMED',
        'An earlier command in this session requires result reconciliation before new mutations',
      )
    }
    if (pending.hasMore)
      throw new HbarError(
        'COMMAND_RESULT_UNCONFIRMED',
        'Additional unconfirmed commands require reconciliation before new mutations',
      )
  }
}
