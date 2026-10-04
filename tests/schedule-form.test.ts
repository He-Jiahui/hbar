import { expect, test } from 'bun:test'
import { editScheduleForm, newScheduleForm, scheduleFormInput, zonedScheduleDate } from '../apps/web/src/schedule-form'
import { scheduleCopy } from '../apps/web/src/schedule-copy'

const base = {
  ...newScheduleForm('America/Los_Angeles'),
  name: '夜间校验',
  prompt: '核对工作区测试结果',
  modelId: 'configured-model',
}

test('schedule form preserves midnight, selected weekdays and explicit original target', () => {
  const daily = scheduleFormInput({ ...base, time: '00:00' }, 'workspace-original')
  expect(daily.spec).toEqual({ kind: 'daily', hour: 0, minute: 0 })
  expect(daily.target).toEqual({ mode: 'new-session' })
  const weekly = scheduleFormInput(
    {
      ...base,
      kind: 'weekly',
      weekdays: [1, 5],
      time: '09:30',
      target: 'existing-session',
      sessionId: 'session-original',
    },
    'workspace-original',
  )
  expect(weekly.spec).toEqual({ kind: 'weekly', weekdays: [1, 5], hour: 9, minute: 30 })
  expect(weekly.target).toEqual({ mode: 'existing-session', sessionId: 'session-original' })
  expect(weekly.workspaceId).toBe('workspace-original')
})

test('once dates use the explicitly saved IANA zone and reject the DST spring gap', () => {
  expect(zonedScheduleDate('2027-01-18T09:30', 'America/Los_Angeles')).toBe(Date.parse('2027-01-18T17:30:00Z'))
  expect(zonedScheduleDate('2027-07-18T09:30', 'America/Los_Angeles')).toBe(Date.parse('2027-07-18T16:30:00Z'))
  expect(() => zonedScheduleDate('2027-03-14T02:30', 'America/Los_Angeles')).toThrow('INVALID_TIME')
  expect(() => zonedScheduleDate('', 'UTC')).toThrow('INVALID_TIME')
})

test('editing roundtrips persisted schedule IDs and revisions without inventing a prompt or model', () => {
  const input = scheduleFormInput({ ...base, kind: 'once', date: '2027-01-18T09:30' }, 'workspace-original')
  const draft = editScheduleForm({
    ...input,
    id: 'schedule-original',
    revision: 7,
    enabled: true,
    createdAt: 1,
    updatedAt: 2,
  })
  expect(draft.id).toBe('schedule-original')
  expect(draft.expectedRevision).toBe(7)
  expect(scheduleFormInput(draft, 'workspace-original')).toEqual(input)
  expect(() => scheduleFormInput({ ...base, prompt: '' }, 'workspace-original')).toThrow('EMPTY_INPUT')
  expect(() => scheduleFormInput({ ...base, modelId: '' }, 'workspace-original')).toThrow()
  expect(() => scheduleFormInput({ ...base, kind: 'weekly', weekdays: [] }, 'workspace-original')).toThrow()
})

test('schedule copy provides translated kinds, status, targets and timezone-aware preview dates', () => {
  const copy = scheduleCopy('zh-CN')
  expect(copy.kinds.weekly).toBe('每周')
  expect(copy.newSession).toBe('每次新建会话')
  expect(copy.occurrenceStatus.unknown).toBe('结果未知')
  expect(copy.formatDate(Date.parse('2027-01-18T17:30:00Z'), 'America/Los_Angeles')).toContain('09:30')
})
