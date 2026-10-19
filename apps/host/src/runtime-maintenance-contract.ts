import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  invocationSchema,
  commandExecutionExpectationSchema,
  type CommandDescriptor,
  type CommandRoute,
} from '@hbar/commands'
import { chatDatabaseCommands } from '@hbar/contracts/commands/chat-database'
import { chatDatabaseVacuumRecordSchema } from '@hbar/storage'
import { commandJobStartSchema } from '@hbar/commands/jobs'
import { RUNTIME_COMMAND_JOB_SCHEMAS } from './runtime-command-job-contract'
import {
  maintenanceInspectionAckSchema,
  maintenanceInspectionManifestSchema,
  maintenanceInspectionLifecycleGuardSchema,
  maintenanceInspectionWakeReplySchema,
} from './runtime-maintenance-inspection-contract'

export const runtimeMaintenanceDispatchSchema = z.strictObject({
  invocation: invocationSchema,
  actorId: z.string().min(1).max(160),
  expectation: commandExecutionExpectationSchema.optional(),
})
export const runtimeMaintenanceConfigurationSchema = z.strictObject({
  dataRoot: z.string().min(1).max(4_000),
  cacheRoot: z.string().min(1).max(4_000),
  pointerFile: z.string().min(1).max(4_000),
  settingsRoot: z.string().min(1).max(4_000),
  sessionsRoot: z.string().min(1).max(4_000),
  skillsRoot: z.string().min(1).max(4_000),
  identityRoot: z.string().min(1).max(4_000),
  workerPath: z.string().min(1).max(4_000),
})
export const MAINTENANCE_RUNTIME_FINGERPRINT = createHash('sha256')
  .update(
    JSON.stringify([
      'hbar.maintenance.v4.tracked-command-dispatch.inspection-idle',
      z.toJSONSchema(commandJobStartSchema, { unrepresentable: 'any' }),
      RUNTIME_COMMAND_JOB_SCHEMAS.map((schema) => z.toJSONSchema(schema)),
      z.toJSONSchema(runtimeMaintenanceDispatchSchema, { unrepresentable: 'any' }),
      z.toJSONSchema(chatDatabaseVacuumRecordSchema),
      Object.values(chatDatabaseCommands).map((definition) => [
        definition.metadata,
        z.toJSONSchema(definition.input),
        z.toJSONSchema(definition.output),
      ]),
      [
        'inspection-transfer.v1',
        z.toJSONSchema(maintenanceInspectionAckSchema),
        z.toJSONSchema(maintenanceInspectionManifestSchema),
        z.toJSONSchema(maintenanceInspectionWakeReplySchema),
        z.toJSONSchema(maintenanceInspectionLifecycleGuardSchema),
      ],
    ]),
  )
  .digest('hex')
export const RUNTIME_MAINTENANCE_CONTROL_METHODS = [
  'maintenance.control',
  'maintenance.command.start',
  'maintenance.job.started',
  'maintenance.job.finished',
  'maintenance.writer.begin',
  'maintenance.writer.end',
  'maintenance.resume',
  'maintenance.verifyWriter',
  'maintenance.inspection.preview',
  'maintenance.inspection.quiesce',
  'maintenance.inspection.commit',
  'maintenance.inspection.abort',
  'maintenance.inspection.restore',
  'maintenance.inspection.pause',
  'maintenance.inspection.resume',
]
export interface RuntimeMaintenancePort {
  dispatch(value: unknown, actorId: string): Promise<unknown>
  readonly dispatchPrepared?: NonNullable<CommandRoute['dispatchPrepared']>
  readonly dispatchPreparedTracked?: NonNullable<CommandRoute['dispatchPreparedTracked']>
  describe(id: string): CommandDescriptor
  list(): { revision: number; items: readonly CommandDescriptor[] }
  dispose(): void | Promise<void>
}
