import { expect, test } from 'bun:test'
import { createSessionRosterRefreshScheduler } from '../packages/app-react/src/session-roster-refresh'

test('foreground focus/visibility/timer requests join one bounded batch and have a per-project cooldown', async () => {
  let now = 10_000
  const wait = Promise.withResolvers<void>()
  const calls: Array<{ id: string; mode: string }> = []
  const scheduler = createSessionRosterRefreshScheduler({
    targets: () => ['a', 'b'],
    canRefresh: () => true,
    now: () => now,
    refresh: async (id, mode) => {
      calls.push({ id, mode })
      await wait.promise
    },
  })
  try {
    const first = scheduler.automatic()
    const second = scheduler.automatic()
    expect(first).toBe(second)
    expect(calls).toEqual([
      { id: 'a', mode: 'automatic' },
      { id: 'b', mode: 'automatic' },
    ])
    wait.resolve()
    await first
    await scheduler.automatic()
    expect(calls).toHaveLength(2)
    now += 5000
    await scheduler.automatic()
    expect(calls).toHaveLength(4)
  } finally {
    scheduler.dispose()
  }
})

test('hidden/disconnected sidebar performs no reads; manual is original-project bound and never selects a session', async () => {
  let enabled = false
  let targets = ['a']
  const calls: string[] = []
  const scheduler = createSessionRosterRefreshScheduler({
    targets: () => targets,
    canRefresh: () => enabled,
    now: Date.now,
    refresh: async (id) => {
      calls.push(id)
    },
  })
  try {
    await scheduler.automatic()
    await scheduler.manual('a')
    expect(calls).toEqual([])
    enabled = true
    await scheduler.manual('b')
    expect(calls).toEqual(['b'])
    targets = ['a', 'c']
    await scheduler.manual()
    expect(calls).toEqual(['b', 'a', 'c'])
  } finally {
    scheduler.dispose()
  }
})

test('refresh batch uses two project workers, skips targets collapsed before dispatch, and continues after local error', async () => {
  const wait = Promise.withResolvers<void>()
  let targets = ['a', 'b', 'c', 'd']
  const calls: string[] = []
  const scheduler = createSessionRosterRefreshScheduler({
    targets: () => targets,
    canRefresh: () => true,
    now: Date.now,
    refresh: async (id) => {
      calls.push(id)
      await wait.promise
      if (id === 'a') throw new Error('local failure')
    },
  })
  try {
    const pending = scheduler.manual()
    expect(calls).toEqual(['a', 'b'])
    targets = ['a', 'b', 'd']
    wait.resolve()
    await pending
    expect(calls).toEqual(['a', 'b', 'd'])
  } finally {
    scheduler.dispose()
  }
})

test('disconnect invalidation or disposal discards queued work and reconnect clears cooldown', async () => {
  const wait = Promise.withResolvers<void>()
  const calls: string[] = []
  const scheduler = createSessionRosterRefreshScheduler({
    targets: () => ['a', 'b', 'c'],
    canRefresh: () => true,
    now: () => 1000,
    refresh: async (id) => {
      calls.push(id)
      await wait.promise
    },
  })
  const first = scheduler.automatic()
  scheduler.invalidate()
  wait.resolve()
  await first
  expect(calls).toEqual(['a', 'b'])
  await scheduler.automatic()
  expect(calls).toEqual(['a', 'b', 'a', 'b', 'c'])
  scheduler.dispose()
  await scheduler.manual()
  expect(calls).toHaveLength(5)
})

test('empty, duplicate and over-capacity target sets keep project requests bounded to200 unique IDs', async () => {
  const calls: string[] = []
  let targets: string[] = []
  const scheduler = createSessionRosterRefreshScheduler({
    targets: () => targets,
    canRefresh: () => true,
    now: Date.now,
    refresh: async (id) => {
      calls.push(id)
    },
  })
  try {
    await scheduler.manual()
    expect(calls).toEqual([])
    targets = ['a', 'a', ...Array.from({ length: 201 }, (_, index) => `project-${index}`)]
    await scheduler.manual()
    expect(calls).toHaveLength(200)
    expect(new Set(calls).size).toBe(200)
  } finally {
    scheduler.dispose()
  }
})
