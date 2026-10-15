import { createHash } from 'node:crypto'
import { z } from 'zod'
import { invocationSchema, commandExecutionExpectationSchema, type CommandDescriptor, type CommandRoute } from '@hbar/commands'
import { chatDatabaseCommands } from '@hbar/contracts/commands/chat-database'
import { chatDatabaseVacuumRecordSchema } from '@hbar/storage'

export const runtimeMaintenanceDispatchSchema = z.strictObject({ invocation: invocationSchema, actorId: z.string().min(1).max(160), expectation: commandExecutionExpectationSchema.optional() })
export const runtimeMaintenanceConfigurationSchema = z.strictObject({
  dataRoot: z.string().min(1).max(4_000), cacheRoot: z.string().min(1).max(4_000), pointerFile: z.string().min(1).max(4_000),
  settingsRoot: z.string().min(1).max(4_000), sessionsRoot: z.string().min(1).max(4_000),
  skillsRoot: z.string().min(1).max(4_000), identityRoot: z.string().min(1).max(4_000), workerPath: z.string().min(1).max(4_000),
})
export const MAINTENANCE_RUNTIME_FINGERPRINT = createHash('sha256').update(JSON.stringify([
  'hbar.maintenance.v2.guarded-command-dispatch', z.toJSONSchema(runtimeMaintenanceDispatchSchema, { unrepresentable: 'any' }), z.toJSONSchema(chatDatabaseVacuumRecordSchema),
  Object.values(chatDatabaseCommands).map(definition => [definition.metadata, z.toJSONSchema(definition.input), z.toJSONSchema(definition.output)]),
])).digest('hex')
export const RUNTIME_MAINTENANCE_CONTROL_METHODS = ['maintenance.control', 'maintenance.job.started', 'maintenance.job.finished',
  'maintenance.writer.begin', 'maintenance.writer.end', 'maintenance.resume', 'maintenance.verifyWriter']
export interface RuntimeMaintenancePort {
  dispatch(value: unknown, actorId: string): Promise<unknown>
  readonly dispatchPrepared?: NonNullable<CommandRoute['dispatchPrepared']>
  describe(id: string): CommandDescriptor
  list(): { revision: number; items: readonly CommandDescriptor[] }
  dispose(): void | Promise<void>
}
