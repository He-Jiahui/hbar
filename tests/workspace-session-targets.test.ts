import { expect, test } from 'bun:test'
import { createWorkspaceSessionTargets } from '../apps/web/src/workspace-session-targets'

const session = (id: string, workspaceId = 'workspace', archived = false) => ({
  id,
  workspaceId,
  title: `Session ${id}`,
  archived,
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  seq: 1,
})

test('target catalog paginates seeded sessions without sidebar cache, deduplicates, excludes archived and bounds 400', async () => {
  const inputs: unknown[] = []
  let page = 0
  const catalog = createWorkspaceSessionTargets({
    list: async (input) => {
      inputs.push(input)
      const items = Array.from({ length: 100 }, (_, index) => session(`${page * 100 + index}`))
      if (page === 0) items[2] = session('0')
      if (page === 0) items[3] = session('archived', 'workspace', true)
      page++
      return { items, nextCursor: `cursor-${page}` }
    },
  })
  await catalog.refresh('workspace')
  expect(inputs).toHaveLength(4)
  expect(inputs[1]).toMatchObject({ after: 'cursor-1', workspaceId: 'workspace', limit: 100 })
  expect(catalog.reader.getSnapshot().sessionIds).toHaveLength(398)
  expect(catalog.reader.getSnapshot().sessionIds).not.toContain('archived')
  expect(catalog.reader.getSnapshot().capacityReached).toBe(true)
  catalog.dispose()
})

test('new workspace catalog fences a stale reply and preserves original scope', async () => {
  let resolve: ((value: unknown) => void) | undefined
  const catalog = createWorkspaceSessionTargets({
    list: async (input) =>
      input.workspaceId === 'old'
        ? await new Promise((done) => {
            resolve = done
          })
        : { items: [session('new-session', 'new')], nextCursor: null },
  })
  const first = catalog.refresh('old')
  await catalog.refresh('new')
  resolve?.({ items: [session('old-session', 'old')], nextCursor: null })
  await first
  expect(catalog.reader.getSnapshot()).toMatchObject({
    workspaceId: 'new',
    status: 'ready',
    sessionIds: ['new-session'],
  })
  catalog.dispose()
})

test('query failure, wrong workspace and repeated cursor are visible and recover by explicit refresh', async () => {
  let mode: 'failed' | 'wrong' | 'loop' | 'ready' = 'failed'
  const catalog = createWorkspaceSessionTargets({
    list: async () => {
      if (mode === 'failed') throw new Error('unavailable')
      return {
        items: [session('s', mode === 'wrong' ? 'other' : 'workspace')],
        nextCursor: mode === 'loop' ? 'same' : null,
      }
    },
  })
  await catalog.refresh('workspace')
  expect(catalog.reader.getSnapshot()).toMatchObject({ status: 'error', error: 'QUERY_FAILED', sessionIds: [] })
  mode = 'wrong'
  await catalog.refresh('workspace')
  expect(catalog.reader.getSnapshot().error).toBe('INVALID_OUTPUT')
  mode = 'loop'
  await catalog.refresh('workspace')
  expect(catalog.reader.getSnapshot().error).toBe('INVALID_OUTPUT')
  mode = 'ready'
  await catalog.refresh('workspace')
  expect(catalog.reader.getSnapshot()).toMatchObject({ status: 'ready', sessionIds: ['s'], error: null })
  catalog.dispose()
})

test('dispose aborts an ignored query and releases subscriptions without a late publish', async () => {
  let signal: AbortSignal | undefined
  let updates = 0
  const catalog = createWorkspaceSessionTargets({
    list: async (_input, nextSignal) => {
      signal = nextSignal
      return await new Promise(() => undefined)
    },
  })
  catalog.reader.subscribe(() => updates++)
  const pending = catalog.refresh('workspace')
  expect(updates).toBe(1)
  catalog.dispose()
  await pending
  expect(signal?.aborted).toBe(true)
  await expect(catalog.refresh('workspace')).rejects.toMatchObject({ code: 'DISPOSED' })
  expect(updates).toBe(1)
})

test('StrictMode release and immediate retain keeps the same query owner', async () => {
  const catalog = createWorkspaceSessionTargets({ list: async () => ({ items: [], nextCursor: null }) })
  const firstRelease = catalog.retain()
  firstRelease()
  const lastRelease = catalog.retain()
  await Promise.resolve()
  await catalog.refresh('workspace')
  expect(catalog.reader.getSnapshot().status).toBe('ready')
  lastRelease()
  await Promise.resolve()
  await expect(catalog.refresh('workspace')).rejects.toMatchObject({ code: 'DISPOSED' })
})
