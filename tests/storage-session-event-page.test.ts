import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { sessionEventPageInputSchema } from '@hbar/contracts'
import type { DiagnosticEvent, SessionEventPage, SessionEventPageInput } from '@hbar/contracts'
import { readSessionEventPages } from '@hbar/plugin-sdk'
import { Storage, createPathLayout, ensurePathLayout } from '@hbar/storage'

const fixtures: Array<{ root: string; storage: Storage }> = []

afterEach(async () => {
  for (const fixture of fixtures.splice(0).reverse()) {
    await fixture.storage.close()
    const target = await realpath(fixture.root)
    const temporary = await realpath(tmpdir())
    if (
      dirname(target).toLowerCase() !== temporary.toLowerCase() ||
      !basename(target).startsWith('hbar-session-event-page-')
    )
      throw new Error(`Refusing to clean an unowned session-event-page fixture: ${target}`)
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

async function fixture(diagnosticsFullCoverage = true) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-session-event-page-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'paths.json'))
  await ensurePathLayout(layout)
  const diagnostics: DiagnosticEvent[] = []
  const storage = new Storage(layout.database, layout, {
    diagnostics: { emit: (event) => diagnostics.push(event) },
    diagnosticsFullCoverage,
    requestTimeoutMs: 3_000,
    closeTimeoutMs: 1_000,
  })
  fixtures.push({ root, storage })
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', root, 'event page workspace')
  const session = await storage.call('createSession', workspace.id, 'event page session')
  return { root, storage, session, diagnostics }
}

test('event pages type-filter before payload transfer and pin an append-safe horizon', async () => {
  const { storage, session, diagnostics } = await fixture()
  await storage.call('append', session.id, 'request.started', { large: 'x'.repeat(128_000) })
  await storage.call('append', session.id, 'goal.updated', { goalId: 'goal-a', revision: 1 })
  const first = await storage.call('readEventPage', {
    sessionId: session.id,
    afterSeq: 0,
    types: ['request.started', 'goal.updated'],
    headerOnlyTypes: ['request.started'],
    limit: 1,
    maxReplyBytes: 1_024,
  })
  expect(first.totalEventCount).toBeGreaterThan(2)
  expect(first.remainingEventCount).toBe(first.totalEventCount)
  expect(first.matchingEventCount).toBe(2)
  expect(first.hasMore).toBe(true)
  expect(first.items).toHaveLength(1)
  expect(first.items[0]).toMatchObject({ kind: 'header', event: { type: 'request.started' } })
  if (first.items[0]?.kind !== 'header') throw new Error('Header-only event unexpectedly included a payload')
  expect('data' in first.items[0].event).toBe(false)
  const decode = diagnostics.find(
    (event) =>
      event.method === 'readEventPage' &&
      event.event === 'sqlite.read_phase_completed' &&
      event.phase === 'event-page-decode' &&
      event.cursorSeq === 0,
  )
  expect(decode).toMatchObject({ recordsIn: 0, recordsOut: 1, bytesIn: 0 })
  expect(JSON.stringify(diagnostics)).not.toContain('x'.repeat(1_000))

  await storage.call('append', session.id, 'goal.updated', { goalId: 'goal-b', revision: 1 })
  const second = await storage.call('readEventPage', {
    sessionId: session.id,
    afterSeq: first.nextAfterSeq,
    throughSeq: first.throughSeq,
    types: ['request.started', 'goal.updated'],
    headerOnlyTypes: ['request.started'],
    limit: 1,
    maxReplyBytes: 1_024,
  })
  expect(second.totalEventCount).toBe(first.totalEventCount)
  expect(second.throughSeq).toBe(first.throughSeq)
  expect(second.remainingEventCount).toBeLessThan(first.remainingEventCount)
  expect(second.matchingEventCount).toBe(1)
  expect(second.items).toMatchObject([{ kind: 'event', event: { type: 'goal.updated', data: { goalId: 'goal-a' } } }])
  expect(second.hasMore).toBe(false)
  expect(second.nextAfterSeq).toBe(first.throughSeq)
})

test('event pages reject a required payload that cannot fit and invalid filter/cursor shapes', async () => {
  const { storage, session, diagnostics } = await fixture()
  await storage.call('append', session.id, 'goal.updated', { text: 'x'.repeat(8_000) })
  expect((await storage.call('ready')).version).toBeGreaterThan(0)
  expect(await storage.call('events', session.id, 0, 1)).toHaveLength(1)
  let failure: unknown
  try {
    await storage.call('readEventPage', {
      sessionId: session.id,
      afterSeq: 0,
      types: ['goal.updated'],
      limit: 10,
      maxReplyBytes: 1_024,
    })
  } catch (error) {
    failure = error
  }
  expect(failure).toMatchObject({ code: 'EVENT_PAGE_ITEM_TOO_LARGE' })
  expect(
    diagnostics.some(
      (event) =>
        event.method === 'readEventPage' &&
        event.event === 'sqlite.read_phase_started' &&
        event.phase === 'event-page-selection',
    ),
  ).toBe(true)
  expect(
    diagnostics.some(
      (event) =>
        event.method === 'readEventPage' &&
        event.event === 'storage.request_failed' &&
        event.errorCode === 'EVENT_PAGE_ITEM_TOO_LARGE',
    ),
  ).toBe(true)
  expect(
    diagnostics.some(
      (event) =>
        event.method === 'readEventPage' &&
        event.event === 'sqlite.read_phase_started' &&
        event.phase === 'event-page-decode',
    ),
  ).toBe(false)
  expect(
    sessionEventPageInputSchema.safeParse({
      sessionId: session.id,
      afterSeq: 0,
      types: [],
      limit: 10,
      maxReplyBytes: 1_024,
    }).success,
  ).toBe(false)
  expect(
    sessionEventPageInputSchema.safeParse({
      sessionId: session.id,
      afterSeq: 5,
      throughSeq: 4,
      types: ['goal.updated'],
      headerOnlyTypes: ['request.started'],
      limit: 10,
      maxReplyBytes: 1_024,
    }).success,
  ).toBe(false)
})

test('event pages keep large mixed header/full pages within their UTF-8 byte budget', async () => {
  const { storage, session } = await fixture()
  for (let index = 0; index < 96; index++)
    await storage.call(
      'append',
      session.id,
      index % 2 === 0 ? 'request.started' : 'goal.updated',
      index % 2 === 0 ? { prompt: 'h'.repeat(4_000) } : { revision: index, title: `step-${index}` },
    )
  const pages = []
  for await (const page of readSessionEventPages(
    { readEventPage: (input) => storage.call('readEventPage', input) },
    {
      sessionId: session.id,
      types: ['request.started', 'goal.updated'],
      headerOnlyTypes: ['request.started'],
      limit: 96,
      maxReplyBytes: 4_096,
    },
  )) {
    expect(new TextEncoder().encode(JSON.stringify(page)).byteLength).toBeLessThanOrEqual(4_096)
    pages.push(page)
  }
  expect(pages.length).toBeGreaterThan(1)
  expect(pages.reduce((count, page) => count + page.items.length, 0)).toBe(96)
  expect(pages.flatMap((page) => page.items).filter((item) => item.kind === 'header')).toHaveLength(48)
})

test('event pages reserve the full reply envelope near the minimum byte budget', async () => {
  const { storage, session } = await fixture()
  for (let index = 0; index < 20; index++)
    await storage.call('append', session.id, 'goal.updated', { revision: index, title: `s${index}` })
  const pages = readSessionEventPages(
    { readEventPage: (input) => storage.call('readEventPage', input) },
    { sessionId: session.id, types: ['goal.updated'], limit: 100, maxReplyBytes: 1_024 },
  )
  const first = await pages.next()
  if (first.done) throw new Error('Expected an event page')
  const firstBytes = new TextEncoder().encode(JSON.stringify(first.value)).byteLength
  expect(firstBytes).toBeGreaterThan(800)
  expect(firstBytes).toBeLessThanOrEqual(1_024)
  let count = first.value.items.length
  for await (const page of pages) {
    expect(new TextEncoder().encode(JSON.stringify(page)).byteLength).toBeLessThanOrEqual(1_024)
    count += page.items.length
  }
  expect(count).toBe(20)
})

test('oversized event failure is preserved when full phase diagnostics are disabled', async () => {
  const { storage, session, diagnostics } = await fixture(false)
  await storage.call('append', session.id, 'goal.updated', { text: 'x'.repeat(8_000) })
  let failure: unknown
  try {
    await storage.call('readEventPage', {
      sessionId: session.id,
      afterSeq: 0,
      types: ['goal.updated'],
      limit: 10,
      maxReplyBytes: 1_024,
    })
  } catch (error) {
    failure = error
  }
  expect(failure).toMatchObject({ code: 'EVENT_PAGE_ITEM_TOO_LARGE' })
  expect(
    diagnostics.some(
      (event) => event.event === 'storage.request_failed' && event.errorCode === 'EVENT_PAGE_ITEM_TOO_LARGE',
    ),
  ).toBe(true)
})

test('event page reader rejects a non-advancing adapter cursor', async () => {
  const sessionId = 'session-cursor-check'
  const pages = readSessionEventPages(
    {
      readEventPage: async (input: SessionEventPageInput): Promise<SessionEventPage> => ({
        sessionId,
        afterSeq: input.afterSeq,
        throughSeq: 4,
        totalEventCount: 4,
        remainingEventCount: 4,
        matchingEventCount: 1,
        items: [
          {
            kind: 'event',
            event: {
              eventId: 'event-one',
              sessionId,
              seq: 1,
              runId: null,
              stepId: null,
              type: 'goal.updated',
              data: {},
              time: 1,
              version: 1,
            },
          },
        ],
        nextAfterSeq: input.afterSeq,
        hasMore: true,
      }),
    },
    { sessionId, types: ['goal.updated'], limit: 1, maxReplyBytes: 1_024 },
  )
  const iterator = pages[Symbol.asyncIterator]()
  await expect(iterator.next()).rejects.toMatchObject({ code: 'EVENT_PAGE_CURSOR' })
})

test('event page reader rejects adapters that exceed the requested item limit', async () => {
  const sessionId = 'session-adapter-limit-check'
  const pages = readSessionEventPages(
    {
      readEventPage: async (input: SessionEventPageInput): Promise<SessionEventPage> => ({
        sessionId,
        afterSeq: input.afterSeq,
        throughSeq: 3,
        totalEventCount: 3,
        remainingEventCount: 3,
        matchingEventCount: 3,
        items: [1, 2].map((seq) => ({
          kind: 'event' as const,
          event: {
            eventId: `event-${seq}`,
            sessionId,
            seq,
            runId: null,
            stepId: null,
            type: 'goal.updated',
            data: {},
            time: seq,
            version: 1 as const,
          },
        })),
        nextAfterSeq: 2,
        hasMore: true,
      }),
    },
    { sessionId, types: ['goal.updated'], limit: 1 },
  )
  await expect(pages.next()).rejects.toMatchObject({ code: 'EVENT_PAGE_LIMIT' })
})

test('event page reader rejects adapters that exceed the requested reply byte limit', async () => {
  const sessionId = 'session-adapter-byte-check'
  const pages = readSessionEventPages(
    {
      readEventPage: async (input: SessionEventPageInput): Promise<SessionEventPage> => ({
        sessionId,
        afterSeq: input.afterSeq,
        throughSeq: 3,
        totalEventCount: 3,
        remainingEventCount: 1,
        matchingEventCount: 1,
        items: [
          {
            kind: 'event',
            event: {
              eventId: 'event-too-large',
              sessionId,
              seq: 3,
              runId: null,
              stepId: null,
              type: 'goal.updated',
              data: { text: 'x'.repeat(2_048) },
              time: 3,
              version: 1,
            },
          },
        ],
        nextAfterSeq: 3,
        hasMore: false,
      }),
    },
    { sessionId, afterSeq: 2, types: ['goal.updated'], limit: 1, maxReplyBytes: 1_024 },
  )
  await expect(pages.next()).rejects.toMatchObject({ code: 'EVENT_PAGE_REPLY_TOO_LARGE' })
})

test('event page reader rejects a matching-count drop that skips selected history', async () => {
  const sessionId = 'session-skipped-match-check'
  let calls = 0
  const pages = readSessionEventPages(
    {
      readEventPage: async (input: SessionEventPageInput): Promise<SessionEventPage> => {
        calls += 1
        return calls === 1
          ? {
              sessionId,
              afterSeq: input.afterSeq,
              throughSeq: 2,
              totalEventCount: 2,
              remainingEventCount: 2,
              matchingEventCount: 2,
              items: [
                {
                  kind: 'event',
                  event: {
                    eventId: 'event-first-match',
                    sessionId,
                    seq: 1,
                    runId: null,
                    stepId: null,
                    type: 'goal.updated',
                    data: {},
                    time: 1,
                    version: 1,
                  },
                },
              ],
              nextAfterSeq: 1,
              hasMore: true,
            }
          : {
              sessionId,
              afterSeq: input.afterSeq,
              throughSeq: 2,
              totalEventCount: 2,
              remainingEventCount: 1,
              matchingEventCount: 0,
              items: [],
              nextAfterSeq: 2,
              hasMore: false,
            }
      },
    },
    { sessionId, types: ['goal.updated'], limit: 1 },
  )
  const iterator = pages[Symbol.asyncIterator]()
  await expect(iterator.next()).resolves.toMatchObject({ done: false })
  await expect(iterator.next()).rejects.toMatchObject({ code: 'EVENT_PAGE_COUNT' })
})

test('event page reader fails explicitly when cumulative selected data exceeds its total cap', async () => {
  const sessionId = 'session-total-byte-check'
  const pages = readSessionEventPages(
    {
      readEventPage: async (input: SessionEventPageInput): Promise<SessionEventPage> => ({
        sessionId,
        afterSeq: input.afterSeq,
        throughSeq: 1,
        totalEventCount: 1,
        remainingEventCount: 1,
        matchingEventCount: 1,
        items: [
          {
            kind: 'event',
            event: {
              eventId: 'event-total-byte-check',
              sessionId,
              seq: 1,
              runId: null,
              stepId: null,
              type: 'goal.updated',
              data: { text: 'x'.repeat(512) },
              time: 1,
              version: 1,
            },
          },
        ],
        nextAfterSeq: 1,
        hasMore: false,
      }),
    },
    { sessionId, types: ['goal.updated'], limit: 1, maxReplyBytes: 1_024, maxTotalBytes: 256 },
  )
  await expect(pages.next()).rejects.toMatchObject({ code: 'EVENT_PAGE_TOTAL_TOO_LARGE' })
  for (const maxTotalBytes of [Number.NaN, Number.POSITIVE_INFINITY, 0, Number.MAX_SAFE_INTEGER + 1]) {
    const invalidCapRead = readSessionEventPages(
      {
        readEventPage: async () => {
          throw new Error('Invalid cap reached the adapter')
        },
      },
      { sessionId, types: ['goal.updated'], maxTotalBytes },
    )
    await expect(invalidCapRead.next()).rejects.toMatchObject({ code: 'EVENT_PAGE_TOTAL_LIMIT' })
  }
})
