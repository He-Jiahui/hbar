import type { CommandCatalogPage, CommandCatalogQuery, CommandDescriptor } from '@hbar/commands'
import { commandIdSchema, commandDescriptorSchema, invocationSchema } from '@hbar/commands'
import { z } from 'zod'
import { toolCallAdmissionSchema } from './tool-call-binding'

export const SESSION_COMMAND_DIRECTORY_QUERY_IDS = [
  'workspace.list',
  'workspace.get',
  'session.list',
  'session.get',
] as const
export const SESSION_COMMAND_FILE_IDS = ['file.find', 'file.list', 'file.read', 'file.write'] as const
export const SESSION_COMMAND_DECISION_READ_IDS = ['decision.list', 'decision.get'] as const
export const SESSION_COMMAND_GIT_IDS = [
  'git.info',
  'git.status',
  'git.diff',
  'git.log',
  'git.stats',
  'git.commit',
  'git.branch',
  'git.worktree',
  'git.diffToRemote',
] as const
export const SESSION_COMMAND_BROWSER_IDS = [
  'browser.status',
  'browser.navigate',
  'browser.snapshot',
  'browser.click',
  'browser.type',
  'browser.press',
  'browser.screenshot',
  'browser.evaluate',
  'browser.close',
  'browser.history',
] as const
export const SESSION_COMMAND_COMPUTER_IDS = [
  'computer.status',
  'computer.screenshot',
  'computer.click',
  'computer.doubleClick',
  'computer.type',
  'computer.key',
  'computer.scroll',
  'computer.move',
  'computer.wait',
  'computer.launch',
] as const

export const sessionCommandSourceSchema = z.strictObject({
  prefix: z.string().regex(/^kernel\.command\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
  sessionId: z.string().min(1).max(160),
  runId: z.string().min(1).max(160),
  callId: z.string().min(1).max(160),
})

export const sessionCommandCallSchema = z.strictObject({
  commandId: commandIdSchema,
  commandVersion: z.number().int().positive(),
  operationKey: z.string().min(1).max(128).regex(/\S/),
  input: z.record(z.string().max(256), z.json()),
  target: z
    .strictObject({ clientId: z.string().min(1).max(160), generation: z.number().int().positive().safe() })
    .optional(),
})
export type SessionCommandCall = z.output<typeof sessionCommandCallSchema>

/** Host-signed, source-bound preparation. It is not a model parameter or a permission grant. */
export const sessionCommandPreparationSchema = z.strictObject({
  signature: z.string().regex(/^[a-f0-9]{64}$/),
  descriptor: commandDescriptorSchema,
  invocation: invocationSchema,
  admission: toolCallAdmissionSchema,
  arguments: sessionCommandCallSchema,
  sourceMethods: z.array(z.string().min(1).max(128)).max(32).default([]),
})
export type SessionCommandPreparation = z.output<typeof sessionCommandPreparationSchema>
export const sessionCommandToolResultSchema = z.strictObject({ text: z.string().max(131_072), isError: z.boolean() })
export type SessionCommandToolResult = z.output<typeof sessionCommandToolResultSchema>

/** Execution identity comes from the tool gateway; it is absent from model-facing parameters. */
export interface SessionCommandContext {
  readonly sessionId: string
  readonly runId: string
  readonly callId: string
  readonly signal: AbortSignal
}

/** Stable Host discovery. No command handler or permission grant is exposed by these reads. */
export interface SessionCommandDiscoveryPort {
  list(query: CommandCatalogQuery, context: SessionCommandContext): Promise<CommandCatalogPage>
  describe(commandId: string, context: SessionCommandContext): Promise<CommandDescriptor>
}
