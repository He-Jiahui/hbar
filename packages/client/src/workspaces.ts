import { CommandError, createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { directoryCommands } from '@hbar/contracts/commands'
import {
  workspaceSessionCommands,
  workspaceCreateInputSchema,
  type WorkspaceCreateInput,
} from '@hbar/contracts/commands/workspaces'
import {
  workspaceOrganizationApplyInputSchema,
  workspaceOrganizationReceiptInputSchema,
  workspaceOrganizationReceiptSchema,
  workspaceOrganizationRequestsEqual,
} from '@hbar/contracts/commands/workspace-organization'
import {
  workspaceDisplayNamesApplyInputSchema,
  workspaceDisplayNamesReceiptInputSchema,
  workspaceDisplayNamesReceiptSchema,
  workspaceDisplayNamesRequestsEqual,
} from '@hbar/contracts/commands/workspace-display-names'
import type { SessionEvent } from '@hbar/contracts'
import type { ClientTransport } from './transport'

export const allWorkspaceSessionCommands = { ...directoryCommands, ...workspaceSessionCommands }
const writes = new Set(
  Object.entries(workspaceSessionCommands)
    .filter(([, definition]) => definition.metadata.kind === 'command')
    .map(([id]) => id),
)
const requiresIdempotency = new Set(
  Object.entries(workspaceSessionCommands)
    .filter(([, definition]) => definition.metadata.idempotency === 'required')
    .map(([id]) => id),
)

export function createWorkspaceSessionCommandClient(client: ClientTransport) {
  return createCommandClient(allWorkspaceSessionCommands, {
    async execute(commandId, input, options) {
      if (
        (commandId.startsWith('workspaceOrganization.') || commandId.startsWith('workspaceDisplayNames.')) &&
        options?.signal?.aborted
      )
        throw new CommandError('CANCELLED', 'Workspace presentation request cancelled before dispatch')
      if (requiresIdempotency.has(commandId) && !options?.idempotencyKey)
        throw new CommandError('INVALID_INPUT', 'An idempotency key is required for this command')
      try {
        const result = await client.call('command.execute', {
          protocol: COMMAND_PROTOCOL_VERSION,
          requestId: options?.requestId ?? crypto.randomUUID(),
          commandId,
          commandVersion: options?.version ?? 1,
          ...(options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
          input,
        })
        if (commandId === 'workspaceOrganization.apply') {
          const request = workspaceOrganizationApplyInputSchema.parse(input)
          const parsed = workspaceOrganizationReceiptSchema.safeParse(result)
          if (!parsed.success || !workspaceOrganizationRequestsEqual(parsed.data.request, request))
            throw new CommandError(
              'RESULT_UNKNOWN',
              'Workspace organization acknowledgement does not match the request',
            )
        }
        if (commandId === 'workspaceOrganization.receipt') {
          const { request } = workspaceOrganizationReceiptInputSchema.parse(input)
          const parsed = workspaceOrganizationReceiptSchema.nullable().safeParse(result)
          if (!parsed.success || (parsed.data && !workspaceOrganizationRequestsEqual(parsed.data.request, request)))
            throw new CommandError('INVALID_OUTPUT', 'Workspace organization receipt does not match the request')
        }
        if (commandId === 'workspaceDisplayNames.apply') {
          const request = workspaceDisplayNamesApplyInputSchema.parse(input)
          const parsed = workspaceDisplayNamesReceiptSchema.safeParse(result)
          if (!parsed.success || !workspaceDisplayNamesRequestsEqual(parsed.data.request, request))
            throw new CommandError(
              'RESULT_UNKNOWN',
              'Workspace display name acknowledgement does not match the request',
            )
        }
        if (commandId === 'workspaceDisplayNames.receipt') {
          const { request } = workspaceDisplayNamesReceiptInputSchema.parse(input)
          const parsed = workspaceDisplayNamesReceiptSchema.nullable().safeParse(result)
          if (!parsed.success || (parsed.data && !workspaceDisplayNamesRequestsEqual(parsed.data.request, request)))
            throw new CommandError('INVALID_OUTPUT', 'Workspace display name receipt does not match the request')
        }
        return result
      } catch (error) {
        if (
          (commandId === 'workspaceOrganization.apply' || commandId === 'workspaceDisplayNames.apply') &&
          error instanceof HbarError &&
          error.code === 'INVALID_OUTPUT'
        )
          throw new CommandError('RESULT_UNKNOWN', 'Workspace presentation acknowledgement could not be validated')
        if (writes.has(commandId) && error instanceof HbarError && ['DISCONNECTED', 'TIMEOUT'].includes(error.code))
          throw new CommandError('RESULT_UNKNOWN', 'Workspace command response was lost; inspect its receipt or state')
        throw error
      }
    },
  })
}

/** Create a local workspace by path or a remote workspace by node selector and shared root ID. */
export function createWorkspace(client: ClientTransport, input: WorkspaceCreateInput) {
  return createWorkspaceSessionCommandClient(client).execute(
    'workspace.create',
    workspaceCreateInputSchema.parse(input),
  )
}

export async function exportSessionEvents(client: ClientTransport, sessionId: string): Promise<SessionEvent[]> {
  const commands = createWorkspaceSessionCommandClient(client)
  const events: SessionEvent[] = []
  let after = 0
  for (;;) {
    const page = await commands.execute('session.export', { sessionId, after, limit: 500 })
    events.push(...page.events)
    if (events.length > 100_000) throw new CommandError('INPUT_TOO_LARGE', 'Session export exceeds 100000 events')
    if (page.nextCursor === null) return events
    if (page.nextCursor <= after) throw new CommandError('INVALID_OUTPUT', 'Session export cursor did not advance')
    after = page.nextCursor
  }
}
