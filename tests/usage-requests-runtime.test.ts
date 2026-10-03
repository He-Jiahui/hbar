import { describe, expect, test } from 'bun:test'
import { createUsageRequests } from '../packages/app-runtime/src/usage-requests'
import { usageExportInputSchema, usageScopeSchema } from '@hbar/contracts/commands/usage'

const attempt = (id: string, endedAt = 10) => ({
  usageId: id,
  attemptId: `attempt-${id}`,
  sessionId: 'session-1',
  workspaceId: 'workspace-1',
  runId: 'run-1',
  source: 'model' as const,
  providerId: 'provider-1',
  modelId: 'model-1',
  modelSelectionId: 'selection-1',
  startedAt: 0,
  firstProviderEventAt: 1,
  firstThinkingAt: null,
  firstTextAt: 2,
  endedAt,
  runStatus: 'completed' as const,
  input: 3,
  output: 4,
  cacheRead: 0,
  cacheWrite: 0,
  billableTokens: 7,
  cost: {
    value: null,
    unit: 'USD' as const,
    availability: 'unavailable' as const,
    reason: 'PRICE_COVERAGE_INCOMPLETE',
    source: 'usage-ledger',
    estimated: false,
    sampleCount: 1,
  },
  pricingVersion: null,
  accountingVersion: 1,
})
function result(items: ReturnType<typeof attempt>[], nextCursor?: string) {
  return {
    accountingVersion: 1 as const,
    scope: { kind: 'global' as const },
    observedAt: 20,
    gap: false,
    items,
    ...(nextCursor ? { nextCursor } : {}),
  }
}

describe('usage request projection', () => {
  test('loads bounded rows and preserves unavailable cost', async () => {
    const runtime = createUsageRequests({ usage: { execute: async () => result([attempt('u1')]) } })
    await runtime.refresh()
    expect(runtime.reader.getSnapshot().items[0]?.id).toBe('u1')
    expect(runtime.reader.getSnapshot().items[0]?.cost.availability).toBe('unavailable')
    runtime.dispose()
  })
  test('paginates and deduplicates ids', async () => {
    let page = 0
    const runtime = createUsageRequests({
      usage: {
        execute: async () =>
          page++ === 0 ? result([attempt('u1')], 'cursor') : result([attempt('u1'), attempt('u2')]),
      },
    })
    await runtime.refresh()
    await runtime.loadMore()
    expect(runtime.reader.getSnapshot().items.map((item) => item.id)).toEqual(['u1', 'u2'])
    runtime.dispose()
  })
  test('drops a late response after scope changes', async () => {
    let resolve: ((value: unknown) => void) | undefined
    let calls = 0
    const runtime = createUsageRequests({
      usage: {
        execute: async (_name, raw) =>
          calls++ === 0
            ? await new Promise((done) => {
                resolve = done
              })
            : { ...result([]), scope: usageExportInputSchema.parse(raw).scope },
      },
    })
    const pending = runtime.refresh()
    await runtime.setScope({ kind: 'workspace', workspaceId: 'workspace-2' })
    resolve?.(result([attempt('stale')]))
    await pending
    expect(runtime.reader.getSnapshot().items).toEqual([])
    expect(runtime.reader.getSnapshot().scope).toEqual({ kind: 'workspace', workspaceId: 'workspace-2' })
    expect(runtime.reader.getSnapshot().status).toBe('ready')
    runtime.dispose()
  })
  test('stops at the 400 item and 100 page bounds', async () => {
    let page = 0
    const runtime = createUsageRequests({
      usage: {
        execute: async () => {
          page += 1
          return result(
            Array.from({ length: 50 }, (_, index) => attempt(`u-${(page - 1) * 50 + index}`)),
            page < 9 ? `cursor-${page}` : undefined,
          )
        },
      },
    })
    await runtime.refresh()
    while (runtime.reader.getSnapshot().hasMore) await runtime.loadMore()
    expect(runtime.reader.getSnapshot().items).toHaveLength(400)
    expect(page).toBe(8)
    runtime.dispose()
  })
  test('dispose fences a late response without publishing an error', async () => {
    let resolve: ((value: unknown) => void) | undefined
    const runtime = createUsageRequests({
      usage: {
        execute: async () =>
          await new Promise((done) => {
            resolve = done
          }),
      },
    })
    const pending = runtime.refresh()
    runtime.dispose()
    resolve?.(result([attempt('late')]))
    await pending
    expect(runtime.reader.getSnapshot().items).toEqual([])
  })
  test('refresh and loadMore reject after dispose without querying Host', async () => {
    let calls = 0
    const runtime = createUsageRequests({
      usage: {
        execute: async () => {
          calls += 1
          return result([])
        },
      },
    })
    runtime.dispose()
    await expect(runtime.refresh()).rejects.toMatchObject({ code: 'DISPOSED' })
    await expect(runtime.loadMore()).resolves.toBeUndefined()
    expect(calls).toBe(0)
  })

  test('source filters and the actual time window remain bound through pagination and range changes', async () => {
    const inputs: Array<ReturnType<typeof usageExportInputSchema.parse>> = []
    const runtime = createUsageRequests({
      usage: {
        execute: async (_name, raw) => {
          const input = usageExportInputSchema.parse(raw)
          inputs.push(input)
          return {
            ...result([attempt(input.after ? 'second' : 'first')], input.after ? undefined : 'next-page'),
            scope: input.scope,
          }
        },
      },
    })
    const scope = usageScopeSchema.parse({ kind: 'session', sessionId: 'session-1' })
    await runtime.setScope(scope, { source: 'model', providerId: 'provider-1' }, { from: 5, to: 15 })
    await runtime.loadMore()
    expect(inputs[0]).toEqual({
      scope,
      filters: { source: 'model', providerId: 'provider-1' },
      from: 5,
      to: 15,
      limit: 50,
    })
    const firstInput = inputs[0]
    if (!firstInput) throw new Error('The first usage request was not recorded')
    expect(inputs[1]).toEqual({ ...firstInput, after: 'next-page' })
    await runtime.setScope(scope, { source: 'model' }, { from: 15, to: 25 })
    expect(inputs[2]).toEqual({
      scope,
      filters: { source: 'model' },
      from: 15,
      to: 25,
      limit: 50,
    })
    expect(runtime.reader.getSnapshot().items.map((item) => item.id)).toEqual(['first'])
    runtime.dispose()
  })
})
