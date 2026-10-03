import { CommandError, type CommandExecutor } from '@hbar/commands'
import type { NotificationTarget } from '@hbar/contracts/commands/notifications'
import type { ScheduleDefinition } from '@hbar/contracts/commands/schedules'

export interface NotificationNavigationPort {
  readonly commands: CommandExecutor
  readonly getSchedule: (id: string) => Promise<Pick<ScheduleDefinition, 'id' | 'workspaceId'> | null>
  readonly sourceInstanceId?: string
}

export async function navigateNotification(
  target: NotificationTarget,
  port: NotificationNavigationPort,
): Promise<void> {
  if (target.kind === 'schedule') {
    const schedule = await port.getSchedule(target.scheduleId)
    if (!schedule || schedule.id !== target.scheduleId)
      throw new CommandError('NOT_FOUND', 'The notification schedule is no longer available')
    await port.commands.execute('app.openPanel', {
      panelId: 'schedules',
      workspaceId: schedule.workspaceId,
      binding: 'pinned',
      params: { scheduleId: schedule.id, ...(target.occurrenceId ? { occurrenceId: target.occurrenceId } : {}) },
    })
    if (port.sourceInstanceId) await port.commands.execute('app.closePanel', { instanceId: port.sourceInstanceId })
    return
  }
  await port.commands.execute('app.setSession', { workspaceId: target.workspaceId, sessionId: target.sessionId })
  if (port.sourceInstanceId) await port.commands.execute('app.closePanel', { instanceId: port.sourceInstanceId })
}
