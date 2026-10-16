import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import {
  commandCatalogQuerySchema,
  commandCatalogPageSchema,
  commandDescriptionQuerySchema,
  commandDescriptorSchema,
} from '@hbar/commands'
import type { ToolContext, ToolDefinition } from '@hbar/plugin-sdk'
import type { SessionCommandContext, SessionCommandDiscoveryPort } from './session-command-port'
import {
  sessionCommandCallSchema,
  SESSION_COMMAND_DIRECTORY_QUERY_IDS,
  SESSION_COMMAND_FILE_IDS,
  SESSION_COMMAND_DECISION_READ_IDS,
  SESSION_COMMAND_GIT_IDS,
  SESSION_COMMAND_BROWSER_IDS,
  SESSION_COMMAND_COMPUTER_IDS,
  SESSION_COMMAND_CLIENT_IDS,
} from './session-command-port'
import { clientCommandDirectoryQuerySchema, clientCommandDirectorySchema } from '@hbar/contracts/client-commands'

export const SESSION_COMMAND_LIST_BYTES = 32_768
const listInput = commandCatalogQuerySchema.extend({ limit: z.number().int().min(1).max(50).default(30) })
const identity = (context: ToolContext): SessionCommandContext => ({
  sessionId: context.session.id,
  runId: context.run.id,
  callId: context.callId,
  signal: context.signal,
})

/** Core tools remain available without a UI; each call still passes normal selected-tool and Run gates. */
export function createSessionCommandTools(port: SessionCommandDiscoveryPort): readonly ToolDefinition[] {
  return [
    {
      name: 'hbar_command_clients',
      effect: 'read',
      workspaceAccess: { kind: 'none' },
      timeoutMs: 20_000,
      description:
        'List connected command clients authorized for this Run, with their explicit clientId, current numeric generation and published command IDs. Returns a bounded page and cursor. Select a target from this directory before executing a client or platform command; a disconnected client is unavailable.',
      inputSchema: clientCommandDirectoryQuerySchema,
      async execute(args, context) {
        if (!port.clients)
          throw new HbarError('COMMAND_TARGET_UNAVAILABLE', 'This Host has no client command directory')
        const query = clientCommandDirectoryQuerySchema.parse(args)
        const page = clientCommandDirectorySchema.parse(await port.clients(query, identity(context)))
        context.signal.throwIfAborted()
        if (
          page.items.length > query.limit ||
          page.items.some((item, index) => item.clientId <= (page.items[index - 1]?.clientId ?? query.after ?? '')) ||
          (page.nextCursor !== undefined && page.nextCursor !== page.items.at(-1)?.clientId)
        )
          throw new HbarError('COMMAND_DIRECTORY_INVALID', 'The client directory cursor did not advance in order')
        return { text: JSON.stringify(page) }
      },
    },
    {
      name: 'hbar_command_execute',
      effect: 'write',
      workspaceAccess: { kind: 'none' },
      timeoutMs: 120_000,
      description: `Execute one hbar command after hbar_command_describe supplies its exact version and input schema. Currently admitted commands: ${[...SESSION_COMMAND_DIRECTORY_QUERY_IDS, ...SESSION_COMMAND_FILE_IDS, ...SESSION_COMMAND_DECISION_READ_IDS, ...SESSION_COMMAND_GIT_IDS, ...SESSION_COMMAND_BROWSER_IDS, ...SESSION_COMMAND_COMPUTER_IDS, ...SESSION_COMMAND_CLIENT_IDS].join(', ')}. File and Git commands use the current Session execution workspace; omit Git cwd. File workspaceId must match it and sessionTarget is Host-bound. Browser commands are network operations; computer commands require process permission except computer.status. They use the current Session and preserve native policy. Git reads require process permission; mutations also require write permission, including branch/worktree operations other than list. Decision queries inspect an authorized Session; decision.resolve requires a human or an explicit delegation grant and is not admitted here yet. Supply a stable operationKey for the intended operation and reuse it when checking an uncertain result; a new key is a new operation. The Host binds the current Session, Run, actor, permissions and durable receipt. Returns JSON with operationKey, commandId, revision, logical status, physical status, acknowledgment, and result or error/reference. Unknown outcomes require reconciliation before replay. Application client/platform commands require process permission and an explicit connected clientId and numeric generation from hbar_command_clients in target. Their client must support the admitted execution constraints. Unsupported admission rules are rejected before execution.`,
      inputSchema: sessionCommandCallSchema,
      execute() {
        throw new HbarError(
          'COMMAND_PREPARATION_REQUIRED',
          'This Host must prepare and admit the concrete command before execution',
        )
      },
    },
    {
      name: 'hbar_commands_list',
      effect: 'read',
      workspaceAccess: { kind: 'none' },
      timeoutMs: 20_000,
      description:
        'Discover hbar command IDs across Host, client and platform domains. Returns bounded summaries and a cursor. Use hbar_command_describe for exact input/output schemas. Client/platform execution requires an explicitly selected connected client and generation.',
      inputSchema: listInput,
      async execute(args, context) {
        const query = listInput.parse(args)
        const page = commandCatalogPageSchema.parse(await port.list(query, identity(context)))
        context.signal.throwIfAborted()
        const items = []
        let bytes = 512
        for (const descriptor of page.items.slice(0, query.limit)) {
          const { id, version, kind, execution, stateEffect, scope, category } = descriptor.metadata
          const summary = { id, version, kind, execution, stateEffect, scope, category }
          const size = new TextEncoder().encode(JSON.stringify(summary)).byteLength + 1
          if (bytes + size > SESSION_COMMAND_LIST_BYTES) break
          bytes += size
          items.push(summary)
        }
        const last = items.at(-1)
        const more = items.length < page.items.length || page.nextCursor !== undefined
        if (more && !last)
          throw new HbarError('COMMAND_CATALOG_TOO_LARGE', 'The next command exceeds the model catalog capacity')
        return {
          text: JSON.stringify({ revision: page.revision, items, ...(more && last ? { nextCursor: last.id } : {}) }),
        }
      },
    },
    {
      name: 'hbar_command_describe',
      effect: 'read',
      workspaceAccess: { kind: 'none' },
      timeoutMs: 20_000,
      description:
        'Read one hbar command definition, including its version, execution domain, input/output JSON schemas, defaults and argument constraints. Discovery does not execute the command or grant permissions.',
      inputSchema: commandDescriptionQuerySchema,
      async execute(args, context) {
        const { commandId } = commandDescriptionQuerySchema.parse(args)
        const descriptor = commandDescriptorSchema.parse(await port.describe(commandId, identity(context)))
        context.signal.throwIfAborted()
        if (descriptor.metadata.id !== commandId)
          throw new HbarError('COMMAND_DESCRIPTOR_MISMATCH', 'The command description belongs to another ID')
        const text = JSON.stringify(descriptor)
        if (new TextEncoder().encode(text).byteLength > 128_000)
          throw new HbarError('COMMAND_DESCRIPTOR_TOO_LARGE', 'The command description exceeds the model tool capacity')
        return { text }
      },
    },
  ]
}
