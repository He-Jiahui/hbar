import { expect, test } from 'bun:test'
import {
  createWebChatSearchController,
  WEB_CHAT_SEARCH_LIMITS,
  type WebChatSearchPage,
  type WebChatSearchPort,
} from '../apps/web/src/chat-search-controller'
import type { HbarChatSearchRow } from '@hbar/app-react'
import type { SessionSearchScope } from '@hbar/contracts/commands/session-search'

function row(index: number): HbarChatSearchRow {
  return {
    sessionId: `session-${index}`,
    workspaceId: `workspace-${index % 2}`,
    title: `Session ${index}`,
    workspaceName: `Workspace ${index % 2}`,
    updatedAt: 1000 - index,
    matchCount: 1,
    snippets: [
      { messageId: `message-${index}`, role: 'user', text: `hit ${index}`, highlights: [{ start: 0, end: 3 }] },
    ],
  }
}

function deferred<Value>() {
  let resolve!: (value: Value) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<Value>((accept, refuse) => {
    resolve = accept
    reject = refuse
  })
  return { promise, resolve, reject }
}

const page = (
  rows: readonly HbarChatSearchRow[],
  incompleteReason: WebChatSearchPage['incompleteReason'] = null,
): WebChatSearchPage => ({
  rows,
  truncated: incompleteReason === 'scan_cap',
  incompleteReason,
})

function fixture() {
  const recent = deferred<WebChatSearchPage>()
  const searches: Array<{
    query: string
    signal: AbortSignal
    source: SessionSearchScope
    result: ReturnType<typeof deferred<WebChatSearchPage>>
  }> = []
  const port: WebChatSearchPort = {
    recent: () => recent.promise,
    search: (query, signal, source = 'all') => {
      const result = deferred<WebChatSearchPage>()
      searches.push({ query, signal, source, result })
      return result.promise
    },
  }
  const scheduled: Array<{ callback: () => void; cancelled: boolean }> = []
  const owner = createWebChatSearchController(port, (callback) => {
    const task = { callback, cancelled: false }
    scheduled.push(task)
    return () => {
      task.cancelled = true
    }
  })
  const flush = () => {
    for (const task of scheduled.splice(0)) if (!task.cancelled) task.callback()
  }
  return { owner, recent, searches, scheduled, flush }
}

async function settle() {
  await Bun.sleep(0)
  await Bun.sleep(0)
}

test('opens Host-global recent eight, clamps keyboard selection, and clears on close', async () => {
  const data = fixture()
  data.owner.bind('host-a', true)
  data.owner.open()
  expect(data.owner.store.getState()).toMatchObject({ open: true, status: 'loading', query: '' })
  data.recent.resolve(page(Array.from({ length: WEB_CHAT_SEARCH_LIMITS.recent }, (_, index) => row(index))))
  await settle()
  expect(data.owner.store.getState()).toMatchObject({ status: 'recent', selectedResultId: 'session-0' })
  for (let index = 0; index < 60; index++) data.owner.move('down')
  expect(data.owner.store.getState().selectedResultId).toBe('session-7')
  data.owner.move('up')
  expect(data.owner.store.getState().selectedResultId).toBe('session-6')
  data.owner.close()
  expect(data.owner.store.getState()).toMatchObject({ open: false, status: 'closed', rows: [], query: '' })
})

test('typing debounces, composition holds Enter-target data, and stale results cannot repopulate a newer query', async () => {
  const data = fixture()
  data.owner.bind('host-a', true)
  data.owner.open()
  data.recent.resolve(page([row(1)]))
  await settle()
  data.owner.setQuery('old')
  expect(data.owner.store.getState()).toMatchObject({ status: 'loading', rows: [], selectedResultId: null })
  data.flush()
  await settle()
  expect(data.searches.map((item) => item.query)).toEqual(['old'])
  data.owner.compositionStart()
  data.owner.setQuery('中')
  data.flush()
  await settle()
  expect(data.searches).toHaveLength(1)
  expect(data.searches[0]?.signal.aborted).toBe(true)
  data.owner.compositionEnd('中文')
  data.flush()
  await settle()
  expect(data.searches.map((item) => item.query)).toEqual(['old', '中文'])
  data.searches[0]?.result.resolve(page([row(9)]))
  await settle()
  expect(data.owner.store.getState()).toMatchObject({ status: 'loading', rows: [] })
  data.searches[1]?.result.resolve(page([row(2)]))
  await settle()
  expect(data.owner.store.getState()).toMatchObject({ status: 'ready', selectedResultId: 'session-2' })
})

test('two physical reads bound a burst and queue only the latest query', async () => {
  const data = fixture()
  data.owner.bind('host-a', true)
  data.owner.open()
  data.recent.resolve(page([]))
  await settle()
  for (const query of ['one', 'two', 'three', 'four']) {
    data.owner.setQuery(query)
    data.flush()
    await settle()
  }
  expect(data.searches.map((item) => item.query)).toEqual(['one', 'two'])
  data.searches[0]?.result.resolve(page([row(1)]))
  await settle()
  expect(data.searches.map((item) => item.query)).toEqual(['one', 'two', 'four'])
  data.searches[2]?.result.resolve(page([row(4)]))
  await settle()
  expect(data.owner.store.getState()).toMatchObject({ query: 'four', selectedResultId: 'session-4' })
  data.searches[1]?.result.resolve(page([row(2)]))
  await settle()
  expect(data.owner.store.getState().selectedResultId).toBe('session-4')
})

test('indexing and short-query scan cap never masquerade as complete empty results', async () => {
  const data = fixture()
  data.owner.bind('host-a', true)
  data.owner.open()
  data.recent.resolve(page([]))
  await settle()
  data.owner.setQuery('needle')
  data.flush()
  await settle()
  data.searches[0]?.result.resolve(page([], 'indexing'))
  await settle()
  expect(data.owner.store.getState()).toMatchObject({ status: 'indexing', rows: [], truncated: false })
  data.owner.retry()
  await settle()
  data.searches[1]?.result.resolve(page([], 'scan_cap'))
  await settle()
  expect(data.owner.store.getState()).toMatchObject({ status: 'ready', rows: [], truncated: true })
  data.owner.retry()
  await settle()
  data.searches[2]?.result.resolve(page([]))
  await settle()
  expect(data.owner.store.getState()).toMatchObject({ status: 'empty', rows: [], truncated: false })
})

test('indexing automatically advances the same query with bounded backoff and stops on close', async () => {
  const data = fixture()
  data.owner.bind('host-a', true)
  data.owner.open()
  data.recent.resolve(page([]))
  await settle()
  data.owner.setQuery('needle')
  data.flush()
  await settle()
  data.searches[0]?.result.resolve(page([], 'indexing'))
  await settle()
  expect(data.owner.store.getState().status).toBe('indexing')
  expect(data.scheduled).toHaveLength(1)
  data.flush()
  await settle()
  expect(data.searches.map((item) => item.query)).toEqual(['needle', 'needle'])
  data.searches[1]?.result.resolve(page([row(7)]))
  await settle()
  expect(data.owner.store.getState()).toMatchObject({ status: 'ready', selectedResultId: 'session-7' })
  expect(data.scheduled).toHaveLength(0)
  data.owner.setQuery('other')
  data.flush()
  await settle()
  data.searches[2]?.result.resolve(page([], 'indexing'))
  await settle()
  data.owner.close()
  data.flush()
  await settle()
  expect(data.searches).toHaveLength(3)
  expect(data.owner.store.getState().status).toBe('closed')
})

test('invalid over-capacity, duplicate and long-query responses fail explicitly without silent slicing', async () => {
  const data = fixture()
  data.owner.bind('host-a', true)
  data.owner.open()
  data.recent.resolve(page([row(1), row(1)]))
  await settle()
  expect(data.owner.store.getState()).toMatchObject({ status: 'error', error: 'INVALID_OUTPUT', rows: [] })
  data.owner.setQuery('x'.repeat(WEB_CHAT_SEARCH_LIMITS.query + 1))
  expect(data.owner.store.getState()).toMatchObject({ status: 'error', error: 'QUERY_LIMIT' })
  expect(data.scheduled).toHaveLength(0)
  data.owner.setQuery('find')
  data.flush()
  await settle()
  data.searches[0]?.result.resolve(
    page(Array.from({ length: WEB_CHAT_SEARCH_LIMITS.results + 1 }, (_, index) => row(index))),
  )
  await settle()
  expect(data.owner.store.getState()).toMatchObject({ status: 'error', error: 'INVALID_OUTPUT', rows: [] })
})

test('row navigation captures original IDs, keeps local failure, and never retargets a changed Host', async () => {
  const data = fixture()
  data.owner.bind('host-a', true)
  data.owner.open()
  data.recent.resolve(page([row(1), row(2)]))
  await settle()
  const target = row(2)
  const failed = await data.owner.openRow(target.sessionId, target.workspaceId, async (captured) => {
    expect(captured).toEqual(target)
    throw { code: 'SESSION_ARCHIVED' }
  })
  expect(failed).toBe(false)
  expect(data.owner.store.getState().openError).toEqual({ sessionId: target.sessionId, message: 'SESSION_ARCHIVED' })
  const pending = deferred<void>()
  const navigating = data.owner.openRow(target.sessionId, target.workspaceId, async (captured) => {
    expect(captured).toEqual(target)
    await pending.promise
  })
  data.owner.bind('host-b', true)
  pending.resolve()
  expect(await navigating).toBe(false)
  expect(data.owner.store.getState().openError).toBeNull()
})

test('a query change does not strand navigation busy after the old navigation succeeds or fails', async () => {
  for (const outcome of ['success', 'failure'] as const) {
    const data = fixture()
    data.owner.bind('host-a', true)
    data.owner.open()
    data.recent.resolve(page([row(1)]))
    await settle()

    const target = row(1)
    const navigation = deferred<void>()
    const opening = data.owner.openRow(target.sessionId, target.workspaceId, async () => navigation.promise)
    data.owner.setQuery('needle')
    data.flush()
    await settle()
    data.owner.retry()
    await settle()
    expect(data.searches).toHaveLength(2)
    data.searches[1]?.result.resolve(page([row(2)]))
    await settle()
    expect(data.owner.store.getState()).toMatchObject({ query: 'needle', openingResultId: target.sessionId })

    if (outcome === 'success') navigation.resolve()
    else navigation.reject({ code: 'SESSION_ARCHIVED' })
    expect(await opening).toBe(false)
    expect(data.owner.store.getState()).toMatchObject({ openingResultId: null, openError: null })

    const reopened = await data.owner.openRow(row(2).sessionId, row(2).workspaceId, async () => undefined)
    expect(reopened).toBe(true)
  }
})

test('a stale navigation cannot clear a new owner after Host rebinding or close and reopen', async () => {
  const data = fixture()
  data.owner.bind('host-a', true)
  data.owner.open()
  data.recent.resolve(page([row(1), row(2)]))
  await settle()

  const oldNavigation = deferred<void>()
  const oldOpening = data.owner.openRow(row(1).sessionId, row(1).workspaceId, async () => oldNavigation.promise)
  data.owner.bind('host-b', true)
  await settle()
  const reboundNavigation = deferred<void>()
  const reboundOpening = data.owner.openRow(row(1).sessionId, row(1).workspaceId, async () => reboundNavigation.promise)
  oldNavigation.reject({ code: 'SESSION_ARCHIVED' })
  expect(await oldOpening).toBe(false)
  expect(data.owner.store.getState().openingResultId).toBe(row(1).sessionId)
  expect(data.owner.store.getState().openError).toBeNull()
  reboundNavigation.resolve()
  expect(await reboundOpening).toBe(true)
  expect(data.owner.store.getState().openingResultId).toBeNull()

  const staleNavigation = deferred<void>()
  const staleOpening = data.owner.openRow(row(1).sessionId, row(1).workspaceId, async () => staleNavigation.promise)
  data.owner.close()
  data.owner.open()
  await settle()
  const reopenedNavigation = deferred<void>()
  const reopenedOpening = data.owner.openRow(
    row(1).sessionId,
    row(1).workspaceId,
    async () => reopenedNavigation.promise,
  )
  staleNavigation.resolve()
  expect(await staleOpening).toBe(false)
  expect(data.owner.store.getState().openingResultId).toBe(row(1).sessionId)
  reopenedNavigation.resolve()
  expect(await reopenedOpening).toBe(true)
  expect(data.owner.store.getState().openingResultId).toBeNull()
})

test('disconnect clears stale search results and reconnect searches the same visible query', async () => {
  const data = fixture()
  data.owner.bind('host-a', true)
  data.owner.open()
  data.recent.resolve(page([]))
  await settle()
  data.owner.setQuery('needle')
  data.flush()
  await settle()
  data.searches[0]?.result.resolve(page([row(3)]))
  await settle()
  data.owner.bind('host-a', false)
  expect(data.owner.store.getState()).toMatchObject({ status: 'disconnected', rows: [], selectedResultId: null })
  data.owner.bind('host-a', true)
  await settle()
  expect(data.searches.map((item) => item.query)).toEqual(['needle', 'needle'])
})

test('source changes cancel the previous category and retain independent hits from the same session', async () => {
  const data = fixture()
  data.owner.bind('host-a', true)
  data.owner.open()
  data.recent.resolve(page([]))
  await settle()
  data.owner.setQuery('needle')
  data.flush()
  await settle()
  data.owner.setSource('patch')
  await settle()
  expect(data.searches.map(({ source }) => source)).toEqual(['all', 'patch'])
  expect(data.searches[0]?.signal.aborted).toBe(true)
  const hits: HbarChatSearchRow[] = ['first', 'second'].map((id) => ({
    ...row(1),
    resultId: id,
    source: 'patch',
    target: { messageId: `message-${id}`, blockIndex: 1, callId: `call-${id}` },
  }))
  data.searches[1]?.result.resolve(page(hits))
  await settle()
  data.searches[0]?.result.resolve(page([row(9)]))
  await settle()
  expect(data.owner.store.getState()).toMatchObject({ source: 'patch', selectedResultId: 'first', rows: hits })
  data.owner.move('down')
  expect(data.owner.store.getState().selectedResultId).toBe('second')
  const selected: HbarChatSearchRow[] = []
  expect(
    await data.owner.openRow('second', row(1).workspaceId, async (hit) => {
      selected.push(hit)
    }),
  ).toBe(true)
  expect(selected).toEqual([hits[1]!])
  expect(await data.owner.openRow(row(1).sessionId, row(1).workspaceId, async () => {})).toBe(false)
  data.owner.dispose()
})

test('an empty non-title category asks for a query and reopening resets the scope', async () => {
  const data = fixture()
  data.owner.bind('host-a', true)
  data.owner.open()
  data.recent.resolve(page([row(1)]))
  await settle()
  data.owner.setSource('tool')
  await settle()
  expect(data.owner.store.getState()).toMatchObject({ source: 'tool', status: 'recent', rows: [] })
  expect(data.searches).toHaveLength(0)
  data.owner.close()
  data.owner.open()
  await settle()
  expect(data.owner.store.getState()).toMatchObject({ source: 'all', status: 'recent', rows: [row(1)] })
  data.owner.dispose()
})
