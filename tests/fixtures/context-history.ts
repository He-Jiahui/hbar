import type { ContextCompactionRecord, ContextHistoryPage, ContextWindowStats } from '@hbar/contracts/context-history'

export function contextWindowStats(): ContextWindowStats {
  return {
    fromSeq: 0,
    throughSeq: 10,
    startedAt: 1000,
    endedAt: 6000,
    wallDurationMs: 5000,
    executionMs: 3000,
    turns: 2,
    runs: 2,
    usage: { input: 2000, output: 500, cacheRead: 1000, cacheWrite: 0, cost: 0, requests: 2, recorded: 2 },
    tools: {
      total: 5,
      succeeded: 3,
      failed: 1,
      denied: 0,
      cancelled: 1,
      interrupted: 0,
      unknown: 0,
      pending: 0,
      successRate: 0.75,
    },
    files: { reads: 2, writes: 1, readPaths: 1, writtenPaths: 1 },
  }
}
export function contextRecord(override: Partial<ContextCompactionRecord> = {}): ContextCompactionRecord {
  return {
    id: 'compaction-1',
    sessionId: 'session-one',
    runId: 'run',
    seq: 11,
    window: 1,
    modelId: 'fixture/model',
    status: 'completed',
    startedAt: 6000,
    endedAt: 6250,
    durationMs: 250,
    estimated: true,
    contextWindow: 10000,
    beforeTokens: 8000,
    afterTokens: 1000,
    summaryTokens: 100,
    retainedMessages: 3,
    chunks: 1,
    errorCode: null,
    stats: contextWindowStats(),
    compactionUsage: { input: 100, output: 10, cacheRead: 0, cacheWrite: 0, cost: 0, requests: 1, recorded: 1 },
    ...override,
  }
}
export function contextHistoryPage(records: ContextCompactionRecord[] = []): ContextHistoryPage {
  return {
    sessionId: 'session-one',
    records,
    current: contextWindowStats(),
    before: records.at(-1)?.seq ?? null,
    hasOlder: false,
  }
}
