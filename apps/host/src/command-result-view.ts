import { HbarError } from '@hbar/contracts'
import { workspacePageSchema } from '@hbar/contracts/directory'
import { CommandError, commandPhysicalSettlementSchema } from '@hbar/commands'
import { commandJobLogicalResultSchema } from '@hbar/commands/jobs'
import type { CommandReceiptPayload } from '@hbar/contracts/command-execution'
import type { CommandResultPayloads } from './command-result-payloads'

/** Preserve the existing historical-directory rule: any forbidden item or cursor makes the payload unavailable. */
export async function restrictDirectoryReceiptPayload(
  payload: CommandReceiptPayload,
  channel: 'logical' | 'physical',
  allowed: ReadonlySet<string>,
  payloads: Pick<CommandResultPayloads, 'read'>,
  signal?: AbortSignal,
): Promise<CommandReceiptPayload> {
  if (payload.kind === 'unavailable') return payload
  try {
    const data = await payloads.read(payload, signal)
    const outcome =
      channel === 'logical' ? commandJobLogicalResultSchema.parse(data) : commandPhysicalSettlementSchema.parse(data)
    if (!('result' in outcome)) return payload
    const result = workspacePageSchema.parse(outcome.result)
    if (
      result.items.every((item) => allowed.has(item.id)) &&
      (result.nextCursor === null || allowed.has(result.nextCursor))
    )
      return payload
    return {
      kind: 'unavailable',
      error: {
        code: 'COMMAND_RECEIPT_ACCESS_CHANGED',
        message: 'The saved directory result exceeds the device current workspace access',
      },
    }
  } catch (error) {
    return {
      kind: 'unavailable',
      error: {
        code:
          error instanceof HbarError || error instanceof CommandError
            ? error.code.slice(0, 128) || 'EXECUTION_FAILED'
            : 'EXECUTION_FAILED',
        message:
          error instanceof HbarError || error instanceof CommandError
            ? error.message.slice(0, 8_192) || 'Command execution failed'
            : 'Command execution failed',
      },
    }
  }
}
