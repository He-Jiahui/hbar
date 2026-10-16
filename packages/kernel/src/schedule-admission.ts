import { HbarError } from '@hbar/contracts'
import type { StoragePort } from '@hbar/storage'
import type { SchedulePrepareInput, ScheduleSubmitInput } from './schedule-runner'

/** Current device access and the frozen management receipt jointly authorize scheduled work. */
export function createScheduleAdmission(storage: StoragePort, changed: () => void) {
  async function authorized(occurrenceId: string, actorId: string) {
    const execution = await storage.call('scheduleExecution', occurrenceId)
    if (!execution)
      throw new HbarError('SCHEDULE_AUTHORIZATION_REQUIRED', 'The original schedule authorization is unavailable')
    if (execution.authorization.actorId !== actorId)
      throw new HbarError('FORBIDDEN', 'The occurrence cannot borrow another schedule actor')
    const device = await storage.call('deviceById', actorId)
    if (
      !device ||
      device.role === 'observer' ||
      (device.workspaceIds != null && !device.workspaceIds.includes(execution.schedule.workspaceId))
    )
      throw new HbarError('FORBIDDEN', 'The schedule authorizer no longer has access to its workspace')
    const occurrence = await storage.call('scheduleOccurrence', occurrenceId)
    if (
      !occurrence ||
      occurrence.scheduleId !== execution.schedule.id ||
      !['pending', 'running'].includes(occurrence.status) ||
      occurrence.runId
    )
      throw new HbarError('SCHEDULE_EXECUTION_CONFLICT', 'This occurrence cannot admit another Run')
    return { ...execution, occurrence }
  }
  async function session(sessionId: string, workspaceId: string) {
    const value = await storage.call('session', sessionId)
    if (value.workspaceId !== workspaceId || value.archived)
      throw new HbarError('COMMAND_CONFLICT', 'The original scheduled target session is unavailable')
    return value
  }
  return {
    async prepare(input: SchedulePrepareInput) {
      const { schedule, occurrence } = await authorized(input.occurrenceId, input.actorId)
      if (
        input.scheduleId !== schedule.id ||
        input.workspaceId !== schedule.workspaceId ||
        input.target !== schedule.target.mode
      )
        throw new HbarError('SCHEDULE_EXECUTION_CONFLICT', 'Preparation must use the frozen schedule revision')
      if (input.sessionId || schedule.target.mode === 'existing-session') {
        const id =
          input.sessionId ?? (schedule.target.mode === 'existing-session' ? schedule.target.sessionId : undefined)
        if (!id || (schedule.target.mode === 'existing-session' && id !== schedule.target.sessionId))
          throw new HbarError('SCHEDULE_EXECUTION_CONFLICT', 'The target differs from the original schedule')
        if (schedule.target.mode === 'new-session' && id !== occurrence.sessionId)
          throw new HbarError('SCHEDULE_EXECUTION_CONFLICT', 'The occurrence has not prepared this session')
        return { sessionId: (await session(id, schedule.workspaceId)).id }
      }
      const created = await storage.call('createSessionCommand', {
        actorId: input.actorId,
        idempotencyKey: `schedule-session:${input.occurrenceId}`,
        workspaceId: schedule.workspaceId,
        title: schedule.name,
      })
      changed()
      return { sessionId: created.id }
    },
    async authorizeSubmission(input: ScheduleSubmitInput): Promise<void> {
      const { schedule, occurrence } = await authorized(input.occurrenceId, input.actorId)
      if (
        input.input !== schedule.input ||
        input.modelId !== schedule.modelId ||
        input.sessionId !== occurrence.sessionId ||
        input.idempotencyKey !== occurrence.idempotencyKey ||
        (schedule.target.mode === 'existing-session' && input.sessionId !== schedule.target.sessionId)
      )
        throw new HbarError('SCHEDULE_EXECUTION_CONFLICT', 'Submission must use the original authorized parameters')
      await session(input.sessionId, schedule.workspaceId)
    },
  }
}
