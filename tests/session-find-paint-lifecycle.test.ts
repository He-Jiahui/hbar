import { expect, test } from 'bun:test'
import type { ConversationFindState } from '@hbar/app-runtime'
import { currentSessionFindPaint, type FindPaintSnapshot } from '../packages/app-react/src/session-find-highlights'
import type { SessionFindSourceProjection } from '../packages/app-react/src/session-find-source'

const projection: SessionFindSourceProjection = {
  source: { scopeId: 'session-a', rows: [], history: 'complete' },
  rows: new Map(),
}

function state(
  status: ConversationFindState['status'],
  query = 'History message 121',
  scopeId: string | null = 'session-a',
): ConversationFindState {
  return {
    status,
    scopeId,
    query,
    matches: status === 'ready' ? [{ rowId: 'history-121', segmentId: 'text:0', start: 0, end: query.length }] : [],
    activeIndex: status === 'ready' ? 0 : -1,
    navigationRevision: 1,
    truncated: false,
    history: 'complete',
    error: null,
  }
}

function snapshot(
  status: ConversationFindState['status'],
  query = 'History message 121',
  scopeId = 'session-a',
): FindPaintSnapshot {
  return {
    state: state(status, query, scopeId),
    projection,
    scopeId,
    requestId: 'find-request-1',
  }
}

test('a stream refresh keeps the same ready selection paintable while results are recomputed', () => {
  const prior = snapshot('ready')
  const current = { ...snapshot('searching'), requestId: 'find-request-1' }

  expect(currentSessionFindPaint(current, prior)).toEqual(prior)
})

test('a new query, scope or navigation intent never reuses the previous paint', () => {
  const prior = snapshot('ready')
  expect(currentSessionFindPaint(snapshot('searching', 'different query'), prior)?.state.query).toBe('different query')
  expect(currentSessionFindPaint(snapshot('searching', 'History message 121', 'session-b'), prior)?.scopeId).toBe(
    'session-b',
  )

  const navigated: FindPaintSnapshot = {
    ...snapshot('searching'),
    state: { ...state('searching'), navigationRevision: 2 },
  }
  expect(currentSessionFindPaint(navigated, prior)).toBe(navigated)
})
