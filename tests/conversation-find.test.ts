import { expect, test } from 'bun:test'
import { createConversationFind, CONVERSATION_FIND_LIMITS, type ConversationFindSource } from '@hbar/app-runtime'

function fixture() {
  const tasks: { run(): void; delay: number; cancelled: boolean }[] = []
  const model = createConversationFind({
    schedule(run, delay) {
      const task = { run, delay, cancelled: false }
      tasks.push(task)
      return () => {
        task.cancelled = true
      }
    },
  })
  return {
    model,
    state: model.reader.getSnapshot,
    tasks,
    flush() {
      const queued = tasks.splice(0)
      for (const task of queued) if (!task.cancelled) task.run()
    },
    pending: () => tasks.filter((task) => !task.cancelled).length,
  }
}
const source = (text: string, scopeId = 'host/session-a'): ConversationFindSource => ({
  scopeId,
  rows: [{ id: 'message-a', segments: [{ id: 'text:0', text }] }],
  history: 'complete',
})
function search(text: string, query: string) {
  const f = fixture()
  f.model.setSource(source(text))
  expect(f.model.open('host/session-a')).toBe(true)
  f.model.setQuery('host/session-a', query)
  f.flush()
  return f
}

test('find is closed until explicitly opened, resets on close, and empty queries do not schedule scans', () => {
  const f = fixture()
  expect(f.model.open('missing')).toBe(false)
  f.model.setSource(source('alpha'))
  expect(f.state().status).toBe('closed')
  expect(f.pending()).toBe(0)
  expect(f.model.open('host/session-a')).toBe(true)
  expect(f.state().status).toBe('idle')
  f.model.setQuery('host/session-a', '   ')
  expect(f.pending()).toBe(0)
  expect(f.state().matches).toEqual([])
  f.model.setQuery('host/session-a', 'alpha')
  expect(f.state().status).toBe('searching')
  expect(f.tasks.at(-1)?.delay).toBe(250)
  f.flush()
  expect(f.state().activeIndex).toBe(0)
  f.model.close()
  expect(f.state().status).toBe('closed')
  expect(f.state().query).toBe('')
  expect(f.state().matches).toEqual([])
  f.model.open('host/session-a')
  expect(f.state().status).toBe('idle')
  f.model.dispose()
})

test('literal case-insensitive find preserves original UTF-16 offsets and does not interpret regex syntax', () => {
  const f = search('İ Αλφα 𐐀 (a.*[b]) αΛΦΑ 𐐨', 'αλφα')
  expect(f.state().matches.map(({ start, end }) => [start, end])).toEqual([
    [2, 6],
    [19, 23],
  ])
  f.model.setQuery('host/session-a', '𐐨')
  f.flush()
  expect(f.state().matches.map(({ start, end }) => [start, end])).toEqual([
    [7, 9],
    [24, 26],
  ])
  f.model.setQuery('host/session-a', '(a.*[b])')
  f.flush()
  expect(f.state().matches.map(({ start, end }) => [start, end])).toEqual([[10, 18]])
  f.model.dispose()
})

test('non-overlapping matches wrap both ways and an absent match has no navigation target', () => {
  const f = search('aaaa', 'aa')
  expect(f.state().matches).toHaveLength(2)
  expect(f.model.step('host/session-a', -1)).toBe(true)
  expect(f.state().activeIndex).toBe(1)
  f.model.step('host/session-a', 1)
  expect(f.state().activeIndex).toBe(0)
  f.model.setQuery('host/session-a', 'absent')
  expect(f.model.step('host/session-a', 1)).toBe(false)
  f.flush()
  expect(f.state().status).toBe('ready')
  expect(f.state().matches).toEqual([])
  expect(f.state().activeIndex).toBe(-1)
  expect(f.model.step('host/session-a', -1)).toBe(false)
  f.model.dispose()
})

test('rapid typing, stale scheduled callbacks, close and dispose cannot publish old results', () => {
  const f = search('alpha beta', 'alpha')
  f.model.setQuery('host/session-a', 'beta')
  const stale = f.tasks.at(-1)
  f.model.setQuery('host/session-a', 'alpha')
  stale?.run()
  expect(f.state().status).toBe('searching')
  f.flush()
  expect(f.state().matches[0]?.start).toBe(0)
  f.model.setQuery('host/session-a', 'beta')
  const closed = f.tasks.at(-1)
  f.model.close()
  closed?.run()
  expect(f.state().status).toBe('closed')
  f.model.open('host/session-a')
  f.model.setQuery('host/session-a', 'beta')
  const disposed = f.tasks.at(-1)
  f.model.dispose()
  const final = f.state()
  disposed?.run()
  f.model.setSource(source('beta', 'another'))
  expect(f.model.setQuery('another', 'beta')).toBe(false)
  expect(f.model.open('another')).toBe(false)
  expect(f.state()).toBe(final)
})

test('switching session preserves the query but resets the result and rejects the previous session actions', () => {
  const f = search('alpha alpha', 'alpha')
  f.model.step('host/session-a', 1)
  f.model.setSource(source('other alpha', 'host/session-b'))
  expect(f.state().query).toBe('alpha')
  expect(f.state().activeIndex).toBe(-1)
  expect(f.model.step('host/session-a', 1)).toBe(false)
  expect(f.model.setQuery('host/session-a', 'late')).toBe(false)
  f.flush()
  expect(f.state().activeIndex).toBe(0)
  expect(f.state().matches[0]?.start).toBe(6)
  f.model.setSource(null)
  expect(f.state().status).toBe('closed')
  expect(f.state().query).toBe('')
  expect(f.state().scopeId).toBeNull()
  f.model.dispose()
})

test('content refresh is coalesced, cannot starve under streaming, and retains the same selected occurrence', () => {
  const f = search('alpha alpha', 'alpha')
  f.model.step('host/session-a', 1)
  const navigation = f.state().navigationRevision
  for (let index = 0; index < 100; index++) f.model.setSource(source(`alpha alpha ${index}`))
  expect(f.pending()).toBe(1)
  expect(f.tasks.filter((task) => !task.cancelled)[0]?.delay).toBe(80)
  f.flush()
  expect(f.state().activeIndex).toBe(1)
  expect(f.state().navigationRevision).toBe(navigation)
  f.model.setSource({
    ...source('alpha alpha'),
    rows: [{ id: 'older', segments: [{ id: 'text:0', text: 'alpha' }] }, ...source('alpha alpha').rows],
  })
  f.flush()
  expect(f.state().activeIndex).toBe(2)
  expect(f.state().matches[2]?.rowId).toBe('message-a')
  expect(f.state().navigationRevision).toBe(navigation)
  f.model.setSource(source('alpha'))
  f.flush()
  expect(f.state().activeIndex).toBe(0)
  expect(f.state().navigationRevision).toBe(navigation + 1)
  f.model.dispose()
})

test('source input is captured, duplicate or stale identities cannot create ambiguous targets', () => {
  const f = fixture()
  const input = {
    scopeId: 's',
    history: 'older' as const,
    rows: [{ id: 'm', segments: [{ id: 'text', text: 'alpha' }] }],
  }
  f.model.setSource(input)
  input.rows[0]!.segments[0]!.text = 'beta'
  f.model.open('s')
  f.model.setQuery('s', 'alpha')
  f.flush()
  expect(f.state().matches).toHaveLength(1)
  expect(f.state().history).toBe('older')
  f.model.setSource({ ...input, rows: [...input.rows, ...input.rows] })
  expect(f.state().status).toBe('failed')
  expect(f.state().error).toBe('INVALID_SOURCE')
  expect(f.state().matches).toEqual([])
  f.model.setSource({
    ...input,
    rows: [
      {
        id: 'm',
        segments: [
          { id: 'same', text: 'a' },
          { id: 'same', text: 'b' },
        ],
      },
    ],
  })
  expect(f.state().error).toBe('INVALID_SOURCE')
  f.model.setSource(source('alpha', 's'))
  f.flush()
  expect(f.state().matches).toHaveLength(1)
  f.model.dispose()
})

test('query capacity is explicit, and correcting it recovers without a source write or reopen', () => {
  const f = search('a'.repeat(CONVERSATION_FIND_LIMITS.query), 'a'.repeat(CONVERSATION_FIND_LIMITS.query))
  expect(f.state().matches).toHaveLength(1)
  f.model.setQuery('host/session-a', 'a'.repeat(CONVERSATION_FIND_LIMITS.query + 1))
  expect(f.state().error).toBe('QUERY_LIMIT')
  expect(f.state().status).toBe('failed')
  expect(f.pending()).toBe(0)
  f.model.setQuery('host/session-a', 'a')
  f.flush()
  expect(f.state().matches).toHaveLength(CONVERSATION_FIND_LIMITS.query)
  expect(f.state().error).toBeNull()
  f.model.dispose()
})

test('exact match boundary is complete, one over is explicitly truncated and remains navigable', () => {
  const f = search('a '.repeat(CONVERSATION_FIND_LIMITS.matches), 'a')
  expect(f.state().matches).toHaveLength(CONVERSATION_FIND_LIMITS.matches)
  expect(f.state().truncated).toBe(false)
  f.model.setSource(source('a '.repeat(CONVERSATION_FIND_LIMITS.matches + 1)))
  f.flush()
  expect(f.state().matches).toHaveLength(CONVERSATION_FIND_LIMITS.matches)
  expect(f.state().truncated).toBe(true)
  f.model.step('host/session-a', -1)
  expect(f.state().activeIndex).toBe(CONVERSATION_FIND_LIMITS.matches - 1)
  f.model.dispose()
})

test('row, segment and character budgets each report incomplete search without inventing absent matches', () => {
  const f = fixture()
  const run = (rows: ConversationFindSource['rows']) => {
    f.model.setSource({ scopeId: 's', history: 'limit', rows })
    f.model.open('s')
    f.model.setQuery('s', 'target')
    f.flush()
    expect(f.state().matches).toEqual([])
    expect(f.state().truncated).toBe(true)
    expect(f.state().history).toBe('limit')
  }
  run(
    Array.from({ length: CONVERSATION_FIND_LIMITS.rows + 1 }, (_, index) => ({
      id: `m${index}`,
      segments: [{ id: 'text', text: index === CONVERSATION_FIND_LIMITS.rows ? 'target' : '' }],
    })),
  )
  run([
    {
      id: 'm',
      segments: Array.from({ length: CONVERSATION_FIND_LIMITS.segments + 1 }, (_, index) => ({
        id: `t${index}`,
        text: index === CONVERSATION_FIND_LIMITS.segments ? 'target' : '',
      })),
    },
  ])
  run([{ id: 'm', segments: [{ id: 'text', text: 'x'.repeat(CONVERSATION_FIND_LIMITS.characters) + 'target' }] }])
  f.model.dispose()
})

test('searching cannot cross independent text segments and empty history remains an honest empty result', () => {
  const f = fixture()
  f.model.setSource({
    scopeId: 's',
    history: 'failed',
    rows: [
      {
        id: 'm',
        segments: [
          { id: 'a', text: 'alpha' },
          { id: 'b', text: 'beta' },
        ],
      },
    ],
  })
  f.model.open('s')
  f.model.setQuery('s', 'alphabeta')
  f.flush()
  expect(f.state().matches).toEqual([])
  expect(f.state().history).toBe('failed')
  f.model.setSource({ scopeId: 's', history: 'complete', rows: [] })
  f.flush()
  expect(f.state().status).toBe('ready')
  expect(f.state().activeIndex).toBe(-1)
  expect(f.state().truncated).toBe(false)
  f.model.dispose()
})

test('a subscriber that closes during pending publication cannot leave a timer or resurrect results', () => {
  const f = fixture()
  f.model.setSource(source('alpha'))
  f.model.open('host/session-a')
  const off = f.model.reader.subscribe(() => {
    if (f.state().status === 'searching') f.model.close()
  })
  f.model.setQuery('host/session-a', 'alpha')
  expect(f.state().status).toBe('closed')
  expect(f.pending()).toBe(0)
  f.flush()
  expect(f.state().matches).toEqual([])
  off()
  f.model.dispose()
})

test('subscribers never observe a new query or source with old ready matches, and disposal cannot be reopened', () => {
  const f = search('alpha beta', 'alpha')
  const snapshots: Array<ReturnType<typeof f.state>> = []
  const off = f.model.reader.subscribe(() => snapshots.push(f.state()))
  f.model.setQuery('host/session-a', 'beta')
  expect(snapshots.every((value) => value.query !== 'beta' || value.status !== 'ready')).toBe(true)
  expect(snapshots.every((value) => value.matches.length === 0)).toBe(true)
  f.flush()
  snapshots.length = 0
  f.model.setSource(source('no longer contains it'))
  expect(snapshots.every((value) => value.matches.length === 0)).toBe(true)
  f.flush()
  off()
  const reopened: boolean[] = []
  const unsubscribe = f.model.reader.subscribe(() => {
    if (f.state().status === 'closed') reopened.push(f.model.open('host/session-a'))
  })
  f.model.dispose()
  expect(reopened).toEqual([false])
  expect(f.state().status).toBe('closed')
  unsubscribe()
})

test('oversized query retention is bounded, source refresh cannot retain a replaced callback, and snapshots are stable', () => {
  const f = search('alpha', 'alpha')
  expect(f.state()).toBe(f.state())
  expect(Object.isFrozen(f.state().matches[0])).toBe(true)
  f.model.setQuery('host/session-a', 'x'.repeat(1_000_000))
  expect(f.state().query.length).toBe(CONVERSATION_FIND_LIMITS.query + 1)
  expect(f.state().error).toBe('QUERY_LIMIT')
  f.model.setQuery('host/session-a', 'alpha')
  f.flush()
  f.model.setSource(source('alpha beta'))
  const old = f.tasks.at(-1)
  f.flush()
  const ready = f.state()
  old?.run()
  expect(f.state()).toBe(ready)
  f.model.dispose()
})
