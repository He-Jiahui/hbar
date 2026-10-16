import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { emptyUsage } from '@hbar/contracts'
import { usageExportInputSchema, usageQueryInputSchema } from '@hbar/contracts/commands/usage'
import { usageRecordedDataSchema } from '@hbar/contracts/usage'
import { Storage } from '@hbar/storage'
import { UsageService, USAGE_EVENT_TYPES, type UsageReadRow } from '@hbar/usage'

async function fixture(
  body: (
    storage: Storage,
    sessionId: string,
    diagnostics: () => readonly { event: string; method: string | undefined; errorCode: string | undefined }[],
  ) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'hbar-usage-parity-'))
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('hbar-usage-parity-'))
    throw new Error('UNOWNED_USAGE_PARITY_FIXTURE')
  const diagnosticTail: {
    event: string
    phase: string | undefined
    method: string | undefined
    storageRequestId: number | undefined
    errorCode: string | undefined
    durationMs: number | undefined
    bytesOut: number | undefined
  }[] = []
  const storage = new Storage(join(root, 'fixture.sqlite'), undefined, {
    diagnosticsEnabled: true,
    diagnosticsFullCoverage: true,
    diagnostics: {
      emit(event) {
        diagnosticTail.push({
          event: event.event,
          phase: event.phase,
          method: event.method,
          storageRequestId: event.storageRequestId,
          errorCode: event.errorCode,
          durationMs: event.durationMs,
          bytesOut: event.bytesOut,
        })
        if (diagnosticTail.length > 64) diagnosticTail.shift()
      },
    },
  })
  const failures: unknown[] = []
  try {
    await storage.call('ready')
    const workspace = await storage.call('createWorkspace', root, 'parity')
    const session = await storage.call('createSession', workspace.id)
    await body(storage, session.id, () => diagnosticTail)
  } catch (error) {
    failures.push(error)
  }
  try {
    await storage.close()
  } catch (error) {
    failures.push(error)
  }
  try {
    await rm(root, { recursive: true, force: true })
  } catch (error) {
    failures.push(error)
  }
  if (failures.length) console.error(JSON.stringify({ usageParitySafeDiagnosticTail: diagnosticTail }))
  if (failures.length)
    throw new AggregateError(failures, 'Usage parity fixture or cleanup failed', { cause: failures[0] })
}

const pricing = {
  available: true,
  currency: 'USD',
  inputPerMillion: 10,
  outputPerMillion: 20,
  cacheReadPerMillion: 1,
  cacheWritePerMillion: 2,
  source: 'fixture',
  version: 'parity-v1',
  effectiveAt: null,
} as const
const descriptor = {
  attemptId: 'priced',
  source: 'model',
  providerId: 'fixture',
  modelId: 'model',
  modelSelectionId: 'fixture/model',
  pricing,
} as const

test('real Storage projection preserves versioned/cache/legacy accounting and tool outcomes; strict invalid marker stays ignored', async () => {
  await fixture(async (storage, sessionId) => {
    const session = await storage.call('session', sessionId)
    const run = await storage.call(
      'enqueue',
      sessionId,
      'parity-run',
      { text: 'not-accounting', images: [] },
      'fixture/model',
    )
    await storage.call('append', sessionId, 'request.started', { ...descriptor, messages: 'irrelevant prompt' }, run.id)
    await storage.call(
      'append',
      sessionId,
      'attempt.providerStarted',
      { attemptId: descriptor.attemptId, unexpected: 'strict-invalid' },
      run.id,
    )
    await storage.call('append', sessionId, 'attempt.firstThinking', { attemptId: descriptor.attemptId }, run.id)
    const fact = usageRecordedDataSchema.parse({
      ...emptyUsage(),
      ...descriptor,
      accountingVersion: 1,
      usageId: 'priced-usage',
      input: 100,
      output: 20,
      cacheRead: 30,
      cacheWrite: 10,
      cost: 0.004,
      cacheEligibleInput: 80,
      costEstimated: false,
    })
    await storage.call('append', sessionId, 'usage.recorded', fact, run.id)
    await storage.call(
      'append',
      sessionId,
      'usage.recorded',
      { ...emptyUsage(), input: 7, output: 3 },
      run.id,
      'legacy',
    )
    await storage.call('append', sessionId, 'usage.recorded', { broken: true }, run.id)
    for (const callId of ['failed', 'unknown', 'missing'])
      await storage.call('append', sessionId, 'tool.started', { callId, args: 'ignored tool args' }, run.id)
    await storage.call(
      'append',
      sessionId,
      'tool.settled',
      { callId: 'failed', failed: true, result: 'ignored result' },
      run.id,
    )
    await storage.call(
      'append',
      sessionId,
      'tool.unknown',
      { callId: 'unknown', details: 'ignored unknown detail' },
      run.id,
    )
    const events = (await storage.call('events', sessionId, 0)).filter((event) =>
      USAGE_EVENT_TYPES.some((type) => type === event.type),
    )
    const rows: UsageReadRow[] = events.map((event) => ({
      event,
      workspaceId: session.workspaceId,
      parentSessionId: session.parentId,
      run,
    }))
    const now = Date.now() + 1
    const raw = new UsageService(
      {
        async read() {
          return { items: rows, hasMore: false }
        },
      },
      () => now,
    )
    const projected = new UsageService({ read: (input) => storage.call('usageEvents', input) }, () => now)
    const scope = { kind: 'session', sessionId, includeDescendants: false } as const
    for (const filters of [{}, { providerId: 'fixture', modelId: 'model' }]) {
      const query = usageQueryInputSchema.parse({ scope, from: 0, to: now, filters, maxSamples: 1000, maxBuckets: 1 })
      const expected = await raw.query(query)
      const actual = await projected.query(query)
      expect(actual).toEqual(expected)
      expect(actual.totals).toMatchObject({ attempts: 2, input: 107, output: 23, cacheRead: 30, cacheWrite: 10 })
      expect(actual.execution?.toolCalls).toEqual({ total: 3, succeeded: 0, failed: 1, unknown: 2 })
    }
    const input = usageExportInputSchema.parse({ scope, from: 0, to: now, limit: 100 })
    const expectedExport = await raw.export(input)
    const actualExport = await projected.export(input)
    expect(actualExport).toEqual(expectedExport)
    const priced = actualExport.items.find((item) => item.usageId === fact.usageId)
    expect(priced?.firstProviderEventAt).toBeNull()
    expect(priced?.firstThinkingAt).not.toBeNull()
    expect(priced).toMatchObject({
      input: 100,
      output: 20,
      cacheRead: 30,
      cacheWrite: 10,
      pricingVersion: 'parity-v1',
      cost: { value: 0.004, availability: 'available' },
    })
  })
})

test('real Worker Unicode byte paging preserves every key, then explicit single oversize refuses without cursor skipping', async () => {
  await fixture(async (storage, sessionId, diagnostics) => {
    const callIds = Array.from({ length: 7 }, (_, index) => `${index}:${'界'.repeat(45000)}`)
    for (const callId of callIds) await storage.call('append', sessionId, 'tool.started', { callId })
    const scope = { kind: 'session', sessionId, includeDescendants: false } as const
    const to = Date.now() + 1
    const expected = (await storage.call('events', sessionId, 0))
      .filter((event) => event.type === 'tool.started')
      .sort((a, b) => a.time - b.time || (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0))
    let after: { time: number; eventId: string } | undefined
    const ids: string[] = []
    let pages = 0
    for (let bound = 0; bound < 10; bound++) {
      const page = await storage.call('usageEvents', { scope, from: 0, to, limit: 2000, after })
      pages++
      expect(page.items.length).toBeGreaterThan(0)
      expect(page.items.length).toBeLessThan(7)
      const bytes = page.items.reduce((sum, item) => sum + Buffer.byteLength(JSON.stringify(item), 'utf8') + 1, 0)
      expect(bytes).toBeLessThanOrEqual(512 * 1024)
      ids.push(...page.items.map((item) => item.event.eventId))
      if (!page.hasMore) break
      const last = page.items.at(-1)
      if (last === undefined || page.next === undefined) throw new Error('USAGE_CURSOR_MISSING')
      expect(page.next).toEqual({ time: last.event.time, eventId: last.event.eventId })
      after = page.next
    }
    expect(pages).toBeGreaterThan(1)
    expect(ids).toEqual(expected.map((event) => event.eventId))
    expect(new Set(ids).size).toBe(7)
    const ownerSession = await storage.call('session', sessionId)
    const isolated = await storage.call('createSession', ownerSession.workspaceId)
    await storage.call('append', isolated.id, 'tool.started', { callId: '界'.repeat(180000) })
    const onlyOversized = {
      scope: { kind: 'session', sessionId: isolated.id, includeDescendants: false } as const,
      from: 0,
      to: Date.now() + 1,
      limit: 2000,
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      let rejected = false
      let rejection: unknown
      try {
        await storage.call('usageEvents', onlyOversized)
      } catch (error: unknown) {
        rejected = true
        rejection = error
      }
      expect(rejected).toBe(true)
      expect(rejection).toMatchObject({ code: 'USAGE_PAGE_ITEM_TOO_LARGE' })
      for (const event of ['sqlite.request_error_caught', 'sqlite.request_failed']) {
        const retained = diagnostics().filter(
          (item) =>
            item.event === event && item.method === 'usageEvents' && item.errorCode === 'USAGE_PAGE_ITEM_TOO_LARGE',
        )
        expect(retained).toHaveLength(attempt + 1)
      }
    } // A failed read did not remove old facts or poison Worker.
    expect((await storage.call('events', sessionId, 0)).filter((event) => event.type === 'tool.started')).toHaveLength(
      7,
    )
  })
})

test('public UsageService consumes bounded same-time keyset pages without deduping distinct accounting IDs', async () => {
  await fixture(async (storage, sessionId) => {
    const session = await storage.call('session', sessionId)
    const events = []
    for (let index = 0; index < 5; index++)
      events.push(await storage.call('append', sessionId, 'usage.recorded', { ...emptyUsage(), input: index + 1 }))
    // Explicit reader fixture controls only timestamps/page boundaries; all normalization is public UsageService.
    const rows: UsageReadRow[] = events
      .map((event) => ({
        event: { ...event, time: 1000 },
        workspaceId: session.workspaceId,
        parentSessionId: session.parentId,
        run: null,
      }))
      .sort((a, b) => (a.event.eventId < b.event.eventId ? -1 : a.event.eventId > b.event.eventId ? 1 : 0))
    const cursors: string[] = []
    const service = new UsageService(
      {
        async read(input) {
          const offset =
            input.after === undefined ? 0 : rows.findIndex((row) => row.event.eventId === input.after?.eventId) + 1
          const items = rows.slice(offset, offset + 2)
          const last = items.at(-1)
          const hasMore = offset + items.length < rows.length
          if (input.after !== undefined) cursors.push(input.after.eventId)
          return {
            items,
            hasMore,
            ...(hasMore && last !== undefined ? { next: { time: last.event.time, eventId: last.event.eventId } } : {}),
          }
        },
      },
      () => 2000,
    )
    const result = await service.query(
      usageQueryInputSchema.parse({
        scope: { kind: 'session', sessionId, includeDescendants: false },
        from: 0,
        to: 2000,
        maxSamples: 100,
        maxBuckets: 1,
      }),
    )
    expect(result.totals).toMatchObject({ attempts: 5, input: 15 })
    expect(result.gap).toBe(false)
    expect(cursors).toHaveLength(2)
    expect(new Set(cursors).size).toBe(2)
  })
})
