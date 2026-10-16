import { HbarError } from '@hbar/contracts'
import type { ToolDefinition } from '@hbar/plugin-sdk'
import type { StoragePort } from '@hbar/storage'
import {
  delegatedInputToolInboxSchema,
  delegatedInputToolReplySchema,
  delegatedInputEnvelopeSchema,
} from '@hbar/contracts/delegated-user-input'
import type { SessionEvent } from '@hbar/contracts'
export const DELEGATED_INPUT_TOOL_NAMES = ['hbar_decisions_inbox', 'hbar_decision_reply'] as const

/** Narrow reporting capabilities: no workspace operation or source authorization can be executed through these tools. */
export function createDelegatedInputTools(
  storage: StoragePort,
  publish: (event: SessionEvent) => void,
): readonly ToolDefinition[] {
  return [
    {
      name: 'hbar_decisions_inbox',
      effect: 'read',
      workspaceAccess: { kind: 'none' },
      timeoutMs: 15_000,
      description:
        'Read a bounded page of live decision grants delivered to this Session Run. Use each original sessionId, requestId, delegationId and revision with hbar_decision_reply. Restart pagination when checking for newly delivered grants. These grants only allow a structured answer; they do not allow execution or approval of source actions.',
      inputSchema: delegatedInputToolInboxSchema,
      async execute(args, context) {
        const query = delegatedInputToolInboxSchema.parse(args)
        const page = await storage.call('delegatedInputInbox', {
          ...query,
          sessionId: context.session.id,
          runId: context.run.id,
          deliveredOnly: true,
        })
        const result = {
          items: page.items
            .filter((state) => state.status === 'delivered' && state.targetRunId === context.run.id)
            .map((state) =>
              delegatedInputEnvelopeSchema.parse({
                sessionId: state.sessionId,
                requestId: state.requestId,
                delegationId: state.delegationId,
                revision: state.revision,
                expiresAt: state.expiresAt,
                request: state.request,
                ...(state.approval ? { approval: state.approval } : {}),
              }),
            ),
          ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
        }
        context.signal.throwIfAborted()
        return { text: JSON.stringify(result) }
      },
    },
    {
      name: 'hbar_decision_reply',
      effect: 'read',
      workspaceAccess: { kind: 'none' },
      timeoutMs: 15_000,
      description:
        'Report one structured answer to an existing grant from hbar_decisions_inbox, or return human with missing_information or target_declined. Answer every original question using its declared choices when required. The Host binds your actual Session, Run and call; this tool cannot execute source actions, change source permissions or replace your current task. Reuse the exact original grant revision. Ordinary chat text is not a decision receipt.',
      inputSchema: delegatedInputToolReplySchema,
      async execute(args, context) {
        const input = delegatedInputToolReplySchema.parse(args)
        context.signal.throwIfAborted()
        const value = {
          ...input,
          targetSessionId: context.session.id,
          targetRunId: context.run.id,
          targetCallId: context.callId,
        }
        const result = await storage.call('delegatedInputComplete', value).catch(async (error: unknown) => {
          const known = await storage.call('delegatedInputRead', {
            sessionId: input.sessionId,
            requestId: input.requestId,
          })
          if (
            !known ||
            known.delegationId !== input.delegationId ||
            known.targetSessionId !== context.session.id ||
            known.repliedBy?.runId !== context.run.id ||
            known.repliedBy.callId !== context.callId ||
            JSON.stringify(known.reply) !== JSON.stringify(input.reply)
          )
            throw error
          return { state: known, events: [] }
        })
        for (const event of result.events) publish(event)
        if (result.state.repliedBy?.runId !== context.run.id)
          throw new HbarError('DELEGATION_RECEIPT_INVALID', 'The reply belongs to another actual Run')
        return {
          text: JSON.stringify({
            accepted: true,
            delegationId: result.state.delegationId,
            revision: result.state.revision,
            status: result.state.status,
          }),
        }
      },
    },
  ]
}
