import {
  scheduleCreateInputSchema,
  type ScheduleCreateInput,
  type ScheduleDefinition,
} from '@hbar/contracts/commands/schedules'

export interface ScheduleFormDraft {
  readonly id: string | null
  readonly expectedRevision: number | null
  readonly name: string
  readonly prompt: string
  readonly modelId: string
  readonly timezone: string
  readonly kind: ScheduleDefinition['spec']['kind']
  readonly date: string
  readonly time: string
  readonly weekdays: readonly number[]
  readonly expression: string
  readonly target: 'new-session' | 'existing-session'
  readonly sessionId: string
}

export function newScheduleForm(timezone: string): ScheduleFormDraft {
  return {
    id: null,
    expectedRevision: null,
    name: '',
    prompt: '',
    modelId: '',
    timezone,
    kind: 'daily',
    date: '',
    time: '09:00',
    weekdays: [1],
    expression: '',
    target: 'new-session',
    sessionId: '',
  }
}

export function editScheduleForm(schedule: ScheduleDefinition): ScheduleFormDraft {
  const spec = schedule.spec
  const formatted =
    spec.kind === 'once'
      ? new Intl.DateTimeFormat('sv-SE', {
          timeZone: schedule.timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        })
          .format(spec.at)
          .replace(' ', 'T')
      : ''
  return {
    id: schedule.id,
    expectedRevision: schedule.revision,
    name: schedule.name,
    prompt: schedule.input,
    modelId: schedule.modelId,
    timezone: schedule.timezone,
    kind: spec.kind,
    date: formatted,
    time:
      spec.kind === 'daily' || spec.kind === 'weekly'
        ? `${String(spec.hour).padStart(2, '0')}:${String(spec.minute).padStart(2, '0')}`
        : '09:00',
    weekdays: spec.kind === 'weekly' ? spec.weekdays : [1],
    expression: spec.kind === 'cron' ? spec.expression : '',
    target: schedule.target.mode,
    sessionId: schedule.target.mode === 'existing-session' ? schedule.target.sessionId : '',
  }
}

/** Convert a wall clock date in the saved zone and reject nonexistent DST times. */
export function zonedScheduleDate(value: string, timezone: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('INVALID_TIME')
  const desired = Date.parse(`${value}:00Z`)
  if (!Number.isFinite(desired)) throw new Error('INVALID_TIME')
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  let candidate = desired
  for (let attempt = 0; attempt < 4; attempt++) {
    const wall = formatter.format(candidate).replace(' ', 'T')
    if (wall === value) return candidate
    candidate += desired - Date.parse(`${wall}:00Z`)
  }
  throw new Error('INVALID_TIME')
}

export function scheduleFormInput(draft: ScheduleFormDraft, workspaceId: string): ScheduleCreateInput {
  const [hour, minute] = draft.time.split(':').map(Number)
  const spec =
    draft.kind === 'once'
      ? { kind: draft.kind, at: zonedScheduleDate(draft.date, draft.timezone) }
      : draft.kind === 'cron'
        ? { kind: draft.kind, expression: draft.expression }
        : draft.kind === 'weekly'
          ? { kind: draft.kind, hour, minute, weekdays: [...draft.weekdays] }
          : { kind: draft.kind, hour, minute }
  if (!draft.prompt.trim()) throw new Error('EMPTY_INPUT')
  return scheduleCreateInputSchema.parse({
    workspaceId,
    name: draft.name.trim(),
    input: draft.prompt,
    modelId: draft.modelId,
    timezone: draft.timezone,
    target:
      draft.target === 'new-session' ? { mode: draft.target } : { mode: draft.target, sessionId: draft.sessionId },
    spec,
  })
}
