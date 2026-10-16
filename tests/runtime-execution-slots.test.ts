import { expect, test } from 'bun:test'
import { ExecutionSlots } from '@hbar/runtime'

test('four active Sessions park independently and allow a fifth decision target to run', () => {
  const slots = new ExecutionSlots()
  const sources = Array.from({ length: 4 }, (_, index) =>
    slots.reserve({ executionId: `source-${index}`, activityId: 'question' }),
  )
  const target = slots.reserve({ executionId: 'decision-target', activityId: 'model' })
  expect(target.state).toBe('queued')
  expect(slots.snapshot().activeExecutions).toBe(4)
  const first = sources[0]
  if (!first) throw new Error('Missing source')
  slots.suspend(first.executionId, first.id)
  expect(slots.get(target.executionId, target.id)?.state).toBe('active')
  expect(slots.snapshot()).toMatchObject({ activeExecutions: 4, suspendedExecutions: 1 })
  expect(slots.resume(first.executionId, first.id).state).toBe('queued')
  slots.release(target.executionId, target.id)
  expect(slots.get(first.executionId, first.id)?.state).toBe('active')
})

test('one parked tool cannot release capacity held by another physical activity of its Run', () => {
  const slots = new ExecutionSlots({ capacity: 1 })
  const question = slots.reserve({ executionId: 'source', activityId: 'question' })
  const physicalTool = slots.reserve({ executionId: 'source', activityId: 'physical-tool' })
  const other = slots.reserve({ executionId: 'other', activityId: 'model' })
  slots.suspend(question.executionId, question.id)
  expect(slots.get(other.executionId, other.id)?.state).toBe('queued')
  expect(slots.snapshot()).toMatchObject({ activeExecutions: 1, activeActivities: 1, suspendedActivities: 1 })
  slots.release(physicalTool.executionId, physicalTool.id)
  expect(slots.get(other.executionId, other.id)?.state).toBe('active')
})

test('resuming waits join the FIFO after existing queued Runs and preserve grouped activities', () => {
  const slots = new ExecutionSlots({ capacity: 1 })
  const first = slots.reserve({ executionId: 'first', activityId: 'model' })
  const second = slots.reserve({ executionId: 'second', activityId: 'model' })
  const secondTool = slots.reserve({ executionId: 'second', activityId: 'tool' })
  const third = slots.reserve({ executionId: 'third', activityId: 'model' })
  slots.suspend(first.executionId, first.id)
  expect(slots.get(second.executionId, second.id)?.state).toBe('active')
  expect(slots.get(secondTool.executionId, secondTool.id)?.state).toBe('active')
  slots.resume(first.executionId, first.id)
  slots.release(second.executionId, second.id)
  expect(slots.get(third.executionId, third.id)?.state).toBe('queued')
  slots.release(secondTool.executionId, secondTool.id)
  expect(slots.get(third.executionId, third.id)?.state).toBe('active')
  slots.release(third.executionId, third.id)
  expect(slots.get(first.executionId, first.id)?.state).toBe('active')
})

test('lowering capacity retains actual work and prevents new grants until it settles', () => {
  const slots = new ExecutionSlots({ capacity: 3 })
  const running = ['a', 'b', 'c'].map((executionId) => slots.reserve({ executionId, activityId: 'model' }))
  const next = slots.reserve({ executionId: 'next', activityId: 'model' })
  slots.setCapacity(1)
  expect(slots.snapshot()).toMatchObject({ capacity: 1, activeExecutions: 3, queuedExecutions: 1 })
  for (const activity of running) {
    expect(slots.get(next.executionId, next.id)?.state).toBe('queued')
    slots.release(activity.executionId, activity.id)
  }
  expect(slots.get(next.executionId, next.id)?.state).toBe('active')
})

test('bounded, idempotent reservations and detached receipts preserve owner isolation', () => {
  const slots = new ExecutionSlots({ capacity: 1, maxExecutions: 2, maxActivities: 2, maxPerExecution: 1 })
  const first = slots.reserve({ executionId: 'a', activityId: 'model' })
  const revision = slots.snapshot().revision
  expect(slots.reserve({ executionId: 'a', activityId: 'model' })).toEqual(first)
  expect(slots.snapshot().revision).toBe(revision)
  expect(() => slots.reserve({ executionId: 'a', activityId: 'another' })).toThrow('capacity')
  slots.reserve({ executionId: 'b', activityId: 'model' })
  expect(() => slots.reserve({ executionId: 'c', activityId: 'model' })).toThrow('capacity')
  expect(() => slots.get('b', first.id)).toThrow('another execution')
  expect(() => slots.release('b', first.id)).toThrow('another execution')
  expect(() => slots.suspend('b', first.id)).toThrow('another execution')
  expect(() => slots.resume('b', first.id)).toThrow('another execution')
  const receipt = { ...first }
  receipt.state = 'suspended'
  expect(slots.get(first.executionId, first.id)?.state).toBe('active')
  expect(slots.release(first.executionId, first.id)).toBe(true)
  expect(slots.release(first.executionId, first.id)).toBe(false)
  expect(() => slots.resume(first.executionId, first.id)).toThrow('already settled')
  slots.reserve({ executionId: 'c', activityId: 'model' })
  expect(slots.snapshot()).toMatchObject({ activeExecutions: 1, queuedExecutions: 1 })
})

test('notifications are bounded hints and physical owner cleanup grants queued work', () => {
  const slots = new ExecutionSlots({ capacity: 1 })
  const source = slots.reserve({ executionId: 'source', activityId: 'model' })
  slots.reserve({ executionId: 'source', activityId: 'tool' })
  const target = slots.reserve({ executionId: 'target', activityId: 'model' })
  expect(slots.takeReady()).toEqual(['source'])
  expect(slots.takeReady()).toEqual([])
  expect(slots.releaseExecution(source.executionId)).toBe(true)
  expect(slots.releaseExecution(source.executionId)).toBe(false)
  expect(slots.get(target.executionId, target.id)?.state).toBe('active')
  expect(slots.takeReady()).toEqual(['target'])
  slots.releaseExecution(target.executionId)
  expect(slots.snapshot()).toMatchObject({
    activeExecutions: 0,
    queuedExecutions: 0,
    suspendedExecutions: 0,
    activeActivities: 0,
    queuedActivities: 0,
    suspendedActivities: 0,
  })
})

test('one thousand queued Sessions drain fairly while parked Sessions rejoin without starvation', () => {
  const slots = new ExecutionSlots()
  const work = Array.from({ length: 1_000 }, (_, index) =>
    slots.reserve({ executionId: `run-${index}`, activityId: 'work' }),
  )
  const parked = work.slice(0, 4)
  for (const item of parked) slots.suspend(item.executionId, item.id)
  for (const item of parked) slots.resume(item.executionId, item.id)
  for (const item of [...work.slice(4), ...parked]) {
    expect(slots.snapshot().activeExecutions).toBeLessThanOrEqual(4)
    expect(slots.get(item.executionId, item.id)?.state).toBe('active')
    slots.release(item.executionId, item.id)
  }
  expect(slots.snapshot().activeExecutions).toBe(0)
  expect(slots.snapshot().queuedExecutions).toBe(0)
})
