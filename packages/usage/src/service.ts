import { usageSchema, type Run, type SessionEvent } from '@hbar/contracts'
import {
  USAGE_ACCOUNTING_VERSION,
  usageAttemptDescriptorSchema,
  usageAttemptMarkerSchema,
  usageRecordedDataSchema,
  type UsageAttemptDescriptor,
  type UsageRecordedData,
} from '@hbar/contracts/usage'
import {
  usageExportResultSchema,
  usageQueryResultSchema,
  type UsageAttemptExport,
  type UsageExportInput,
  type UsageExportResult,
  type UsageMetric,
  type UsageQueryInput,
  type UsageQueryResult,
  type UsageScope,
} from '@hbar/contracts/commands/usage'

export const USAGE_EVENT_TYPES = [
  'request.started',
  'compaction.request',
  'attempt.providerStarted',
  'attempt.firstThinking',
  'attempt.firstText',
  'usage.recorded',
] as const

export interface UsageReadRow {
  readonly event: SessionEvent
  readonly workspaceId: string
  readonly parentSessionId: string | null
  readonly run: Run | null
}

export interface UsageReadInput {
  readonly scope: UsageScope
  readonly from: number
  readonly to: number
  readonly after?: { readonly time: number; readonly eventId: string } | undefined
  readonly limit: number
}

export interface UsageReadPage {
  readonly items: readonly UsageReadRow[]
  readonly hasMore: boolean
  readonly next?: { readonly time: number; readonly eventId: string } | undefined
}

export interface UsageEventReader {
  read(input: UsageReadInput): Promise<UsageReadPage>
}

export class UsageServiceError extends Error {
  readonly code = 'INVALID_INPUT'
}

interface AttemptState {
  descriptor?: UsageAttemptDescriptor | undefined
  startedAt?: number | undefined
  firstProviderEventAt?: number | undefined
  firstThinkingAt?: number | undefined
  firstTextAt?: number | undefined
  sessionId?: string | undefined
  workspaceId?: string | undefined
  run?: Run | null | undefined
}

interface NormalizedAttempt {
  item: UsageAttemptExport
  cacheEligibleInput: number | null
}

function descriptor(data: unknown): UsageAttemptDescriptor | null {
  if (!data || typeof data !== 'object') return null
  const value = data as Record<string, unknown>
  const parsed = usageAttemptDescriptorSchema.safeParse({
    attemptId: value.attemptId,
    source: value.source,
    providerId: value.providerId,
    modelId: value.modelId,
    modelSelectionId: value.modelSelectionId,
    pricing: value.pricing,
  })
  return parsed.success ? parsed.data : null
}

function emptyMetric(unit: UsageMetric['unit'], source: string): UsageMetric {
  return {
    value: 0,
    unit,
    availability: 'empty',
    reason: null,
    source,
    estimated: false,
    sampleCount: 0,
  }
}

function unavailableMetric(
  unit: UsageMetric['unit'],
  reason: string,
  source: string,
  sampleCount: number,
): UsageMetric {
  return {
    value: null,
    unit,
    availability: 'unavailable',
    reason,
    source,
    estimated: false,
    sampleCount,
  }
}

function costMetric(fact: UsageRecordedData | null, legacyCost: number): UsageMetric {
  if (!fact) {
    if (legacyCost > 0)
      return {
        value: legacyCost,
        unit: 'USD',
        availability: 'available',
        reason: null,
        source: 'legacy-recorded',
        estimated: true,
        sampleCount: 1,
      }
    return unavailableMetric('USD', 'PRICE_METADATA_MISSING', 'legacy', 0)
  }
  if (!fact.pricing.available) return unavailableMetric('USD', 'PRICE_UNAVAILABLE', fact.pricing.source, 0)
  if (
    (fact.cacheRead > 0 && fact.pricing.cacheReadPerMillion === null) ||
    (fact.cacheWrite > 0 && fact.pricing.cacheWritePerMillion === null)
  )
    return unavailableMetric('USD', 'CACHE_PRICE_UNAVAILABLE', fact.pricing.source, 0)
  return {
    value: fact.cost,
    unit: 'USD',
    availability: 'available',
    reason: null,
    source: fact.pricing.source,
    estimated: fact.costEstimated,
    sampleCount: 1,
  }
}

function legacyDescriptor(row: UsageReadRow, attemptId: string, attempt?: AttemptState): UsageAttemptDescriptor {
  if (attempt?.descriptor) return attempt.descriptor
  const selection = row.run?.modelId ?? 'unknown'
  const slash = selection.indexOf('/')
  const providerId = slash > 0 ? selection.slice(0, slash) : selection
  const modelId = slash > 0 ? selection.slice(slash + 1) : selection
  return {
    attemptId,
    source: 'model',
    providerId,
    modelId,
    modelSelectionId: selection,
    pricing: {
      available: false,
      currency: 'USD',
      inputPerMillion: 0,
      outputPerMillion: 0,
      cacheReadPerMillion: null,
      cacheWritePerMillion: null,
      source: 'provider-config',
      version: 'legacy-unavailable',
      effectiveAt: null,
    },
  }
}

function normalize(rows: readonly UsageReadRow[]): NormalizedAttempt[] {
  const attempts = new Map<string, AttemptState>()
  const facts: { row: UsageReadRow; fact: UsageRecordedData | null; attemptId: string }[] = []
  for (const row of rows) {
    const event = row.event
    if (event.type === 'request.started' || event.type === 'compaction.request') {
      const found = descriptor(event.data)
      const attemptId = found?.attemptId ?? event.stepId ?? event.eventId
      const current = attempts.get(attemptId) ?? {}
      attempts.set(attemptId, {
        ...current,
        ...(found ? { descriptor: found } : {}),
        startedAt: current.startedAt ?? event.time,
        sessionId: event.sessionId,
        workspaceId: row.workspaceId,
        run: row.run,
      })
      continue
    }
    if (
      event.type === 'attempt.providerStarted' ||
      event.type === 'attempt.firstThinking' ||
      event.type === 'attempt.firstText'
    ) {
      const marker = usageAttemptMarkerSchema.safeParse(event.data)
      if (!marker.success) continue
      const current = attempts.get(marker.data.attemptId) ?? {}
      if (event.type === 'attempt.providerStarted') current.firstProviderEventAt ??= event.time
      else if (event.type === 'attempt.firstThinking') current.firstThinkingAt ??= event.time
      else current.firstTextAt ??= event.time
      attempts.set(marker.data.attemptId, current)
      continue
    }
    if (event.type !== 'usage.recorded') continue
    const current = usageRecordedDataSchema.safeParse(event.data)
    const legacy = usageSchema.safeParse(event.data)
    if (!current.success && !legacy.success) continue
    const attemptId = current.success ? current.data.attemptId : (event.stepId ?? event.eventId)
    facts.push({ row, fact: current.success ? current.data : null, attemptId })
  }

  const seen = new Set<string>()
  const output: NormalizedAttempt[] = []
  for (const { row, fact, attemptId } of facts) {
    const raw = fact ?? usageSchema.parse(row.event.data)
    const attempt = attempts.get(attemptId)
    const info = fact ?? legacyDescriptor(row, attemptId, attempt)
    const usageId = fact?.usageId ?? row.event.eventId
    if (seen.has(usageId)) continue
    seen.add(usageId)
    const cost = costMetric(fact, raw.cost)
    output.push({
      item: {
        usageId,
        attemptId,
        sessionId: row.event.sessionId,
        workspaceId: row.workspaceId,
        runId: row.event.runId,
        source: info.source,
        providerId: info.providerId,
        modelId: info.modelId,
        modelSelectionId: info.modelSelectionId,
        startedAt: attempt?.startedAt ?? row.run?.startedAt ?? null,
        firstProviderEventAt: attempt?.firstProviderEventAt ?? null,
        firstThinkingAt: attempt?.firstThinkingAt ?? null,
        firstTextAt: attempt?.firstTextAt ?? null,
        endedAt: row.event.time,
        runStatus: row.run?.status ?? null,
        input: raw.input,
        output: raw.output,
        cacheRead: raw.cacheRead,
        cacheWrite: raw.cacheWrite,
        billableTokens: Math.max(0, raw.input - raw.cacheRead) + raw.output,
        cost,
        pricingVersion: fact?.pricing.version ?? null,
        accountingVersion: fact?.accountingVersion ?? 1,
      },
      cacheEligibleInput: fact?.cacheEligibleInput ?? null,
    })
  }
  return output.sort(
    (left, right) => left.item.endedAt - right.item.endedAt || left.item.usageId.localeCompare(right.item.usageId),
  )
}

function total(items: readonly UsageAttemptExport[]) {
  return {
    attempts: items.length,
    runs: new Set(items.flatMap((item) => (item.runId ? [item.runId] : []))).size,
    input: items.reduce((sum, item) => sum + item.input, 0),
    output: items.reduce((sum, item) => sum + item.output, 0),
    cacheRead: items.reduce((sum, item) => sum + item.cacheRead, 0),
    cacheWrite: items.reduce((sum, item) => sum + item.cacheWrite, 0),
    billableTokens: items.reduce((sum, item) => sum + item.billableTokens, 0),
  }
}

function aggregateCost(items: readonly UsageAttemptExport[]): UsageMetric {
  if (!items.length) return emptyMetric('USD', 'usage-ledger')
  const available = items.filter((item) => item.cost.availability === 'available')
  if (available.length !== items.length)
    return unavailableMetric('USD', 'PRICE_COVERAGE_INCOMPLETE', 'usage-ledger', available.length)
  return {
    value: available.reduce((sum, item) => sum + (item.cost.value ?? 0), 0),
    unit: 'USD',
    availability: 'available',
    reason: null,
    source: new Set(available.map((item) => item.cost.source)).size === 1 ? available[0]!.cost.source : 'mixed',
    estimated: available.some((item) => item.cost.estimated),
    sampleCount: available.length,
  }
}

function percentile(values: readonly number[], percentileValue: number) {
  if (!values.length) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(percentileValue * sorted.length) - 1)]!
}

function latency(items: readonly UsageAttemptExport[], select: (item: UsageAttemptExport) => number | null) {
  const values = items.flatMap((item) => {
    const value = select(item)
    return value === null || item.startedAt === null ? [] : [Math.max(0, value - item.startedAt)]
  })
  return {
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    unit: 'milliseconds' as const,
    availability:
      items.length === 0 ? ('empty' as const) : values.length ? ('available' as const) : ('unavailable' as const),
    reason: items.length > 0 && values.length === 0 ? 'TIMING_NOT_RECORDED' : null,
    sampleCount: values.length,
  }
}

function tokenRate(value: number, seconds: number, attempts: number): UsageMetric {
  if (!attempts) return emptyMetric('tokens_per_second', 'settled-window')
  return {
    value: value / seconds,
    unit: 'tokens_per_second',
    availability: 'available',
    reason: null,
    source: 'settled-window',
    estimated: false,
    sampleCount: attempts,
  }
}

function matches(item: UsageAttemptExport, filters: UsageQueryInput['filters']): boolean {
  return (
    (!filters.providerId || item.providerId === filters.providerId) &&
    (!filters.modelId || item.modelId === filters.modelId || item.modelSelectionId === filters.modelId) &&
    (!filters.source || item.source === filters.source)
  )
}

function cursor(item: UsageAttemptExport) {
  return `${item.endedAt}:${item.usageId}`
}

function parseCursor(value: string | undefined): { time: number; usageId: string } | null {
  if (!value) return null
  const separator = value.indexOf(':')
  if (separator < 1) return null
  const time = Number(value.slice(0, separator))
  const usageId = value.slice(separator + 1)
  return Number.isSafeInteger(time) && time >= 0 && usageId ? { time, usageId } : null
}

export class UsageService {
  constructor(
    private readonly reader: UsageEventReader,
    private readonly now: () => number = Date.now,
  ) {}

  private window(input: { from?: number | undefined; to?: number | undefined }) {
    const observedAt = this.now()
    const to = input.to ?? observedAt + 1
    const from = input.from ?? Math.max(0, to - 3_600_000)
    if (from >= to) throw new UsageServiceError('Usage window requires from < to')
    return { from, to, observedAt }
  }

  private async collect(scope: UsageScope, from: number, to: number, maxEvents: number) {
    const rows: UsageReadRow[] = []
    let after: UsageReadInput['after']
    let gap = false
    while (rows.length < maxEvents) {
      const page = await this.reader.read({ scope, from, to, after, limit: Math.min(2_000, maxEvents - rows.length) })
      rows.push(...page.items)
      if (!page.hasMore) return { rows, gap }
      if (!page.next || (after && page.next.time === after.time && page.next.eventId === after.eventId)) {
        gap = true
        break
      }
      after = page.next
    }
    if (rows.length >= maxEvents) gap = true
    return { rows, gap }
  }

  async query(input: UsageQueryInput): Promise<UsageQueryResult> {
    const { from, to, observedAt } = this.window(input)
    const collected = await this.collect(input.scope, from, to, Math.min(60_000, input.maxSamples * 8 + 32))
    const normalized = normalize(collected.rows).filter(({ item }) => matches(item, input.filters))
    const limited = normalized.slice(0, input.maxSamples)
    const gap = collected.gap || normalized.length > limited.length
    const items = limited.map(({ item }) => item)
    const totals = total(items)
    const seconds = Math.max(0.001, (to - from) / 1_000)
    const eligible = limited.filter((item) => item.cacheEligibleInput !== null)
    const eligibleInput = eligible.reduce((sum, item) => sum + (item.cacheEligibleInput ?? 0), 0)
    const cacheHitRate: UsageMetric = !items.length
      ? emptyMetric('ratio', 'provider-usage')
      : !eligible.length || eligibleInput <= 0
        ? unavailableMetric('ratio', 'CACHE_ELIGIBLE_INPUT_UNAVAILABLE', 'provider-usage', eligible.length)
        : {
            value: eligible.reduce((sum, item) => sum + item.item.cacheRead, 0) / eligibleInput,
            unit: 'ratio',
            availability: 'available',
            reason: null,
            source: 'provider-usage',
            estimated: false,
            sampleCount: eligible.length,
          }
    const modelGroups = new Map<string, UsageAttemptExport[]>()
    for (const item of items) {
      const key = `${item.providerId}\u0000${item.modelId}\u0000${item.modelSelectionId}`
      const group = modelGroups.get(key) ?? []
      group.push(item)
      modelGroups.set(key, group)
    }
    const duration = to - from
    const bucketMs = Math.max(input.bucketMs, Math.ceil(duration / input.maxBuckets))
    const bucketCount = Math.min(input.maxBuckets, Math.max(1, Math.ceil(duration / bucketMs)))
    const buckets = Array.from({ length: bucketCount }, (_, index) => {
      const start = from + index * bucketMs
      const end = Math.min(to, start + bucketMs)
      const bucketItems = items.filter((item) => item.endedAt >= start && item.endedAt < end)
      return { start, end, ...total(bucketItems), cost: aggregateCost(bucketItems) }
    })
    return usageQueryResultSchema.parse({
      accountingVersion: USAGE_ACCOUNTING_VERSION,
      scope: input.scope,
      window: { from, to, bucketMs },
      observedAt,
      gap,
      totals,
      cost: aggregateCost(items),
      cacheHitRate,
      rates: {
        input: tokenRate(Math.max(0, totals.input - totals.cacheRead), seconds, totals.attempts),
        output: tokenRate(totals.output, seconds, totals.attempts),
        total: tokenRate(totals.billableTokens, seconds, totals.attempts),
      },
      latency: {
        firstProviderEvent: latency(items, (item) => item.firstProviderEventAt),
        firstThinking: latency(items, (item) => item.firstThinkingAt),
        firstText: latency(items, (item) => item.firstTextAt),
        response: latency(items, (item) => item.endedAt),
      },
      models: [...modelGroups.values()]
        .map((group) => ({
          providerId: group[0]!.providerId,
          modelId: group[0]!.modelId,
          modelSelectionId: group[0]!.modelSelectionId,
          ...total(group),
          cost: aggregateCost(group),
        }))
        .sort(
          (left, right) =>
            right.billableTokens - left.billableTokens || left.modelSelectionId.localeCompare(right.modelSelectionId),
        ),
      series: buckets,
    })
  }

  async export(input: UsageExportInput): Promise<UsageExportResult> {
    const { from, to, observedAt } = this.window(input)
    const collected = await this.collect(input.scope, from, to, 60_000)
    const after = parseCursor(input.after)
    if (input.after && !after) throw new UsageServiceError('Invalid usage export cursor')
    const matched = normalize(collected.rows)
      .map(({ item }) => item)
      .filter((item) => matches(item, input.filters))
      .filter(
        (item) => !after || item.endedAt > after.time || (item.endedAt === after.time && item.usageId > after.usageId),
      )
    const items = matched.slice(0, input.limit)
    return usageExportResultSchema.parse({
      accountingVersion: USAGE_ACCOUNTING_VERSION,
      scope: input.scope,
      observedAt,
      gap: collected.gap,
      items,
      ...(matched.length > items.length && items.length ? { nextCursor: cursor(items.at(-1)!) } : {}),
    })
  }
}
