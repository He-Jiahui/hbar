import { COMMAND_PROTOCOL_VERSION, CommandError, createCommandClient, type ExecuteOptions } from '@hbar/commands'
import { scheduleCommands } from '@hbar/contracts/commands/schedules'
import type {
  ScheduleCreateInput,
  SchedulePreviewInput,
  ScheduleUpdateInput,
  ScheduleListInput,
  ScheduleGetInput,
  ScheduleOccurrenceListInput,
} from '@hbar/contracts/commands/schedules'
import type { ClientTransport } from './transport'
export type ScheduleCommandOptions = ExecuteOptions
export function createScheduleCommandClient(client: ClientTransport) {
  const commands = createCommandClient(scheduleCommands, {
    execute(id, input, options) {
      if (['schedule.create', 'schedule.update', 'schedule.delete'].includes(id) && !options?.idempotencyKey)
        throw new CommandError('INVALID_INPUT', `An idempotency key is required for ${id}`)
      return client.call('command.execute', {
        protocol: COMMAND_PROTOCOL_VERSION,
        requestId: options?.requestId ?? crypto.randomUUID(),
        commandId: id,
        commandVersion: options?.version ?? 1,
        ...(options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
        input,
      })
    },
  })
  return {
    ...commands,
    list(input: ScheduleListInput, options?: ScheduleCommandOptions) {
      return commands.execute('schedule.list', input, options)
    },
    get(input: ScheduleGetInput, options?: ScheduleCommandOptions) {
      return commands.execute('schedule.get', input, options)
    },
    occurrences(input: ScheduleOccurrenceListInput, options?: ScheduleCommandOptions) {
      return commands.execute('schedule.occurrences', input, options)
    },
    create(input: ScheduleCreateInput, options: ScheduleCommandOptions) {
      return commands.execute('schedule.create', input, options)
    },
    update(input: ScheduleUpdateInput, options: ScheduleCommandOptions) {
      return commands.execute('schedule.update', input, options)
    },
    delete(input: { scheduleId: string; expectedRevision: number }, options: ScheduleCommandOptions) {
      return commands.execute('schedule.delete', input, options)
    },
    preview(input: SchedulePreviewInput, options?: ScheduleCommandOptions) {
      return commands.execute('schedule.preview', input, options)
    },
  }
}
