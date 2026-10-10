import { HbarError, type SessionEvent } from '@hbar/contracts'
import { contextCompactionRecordSchema, type ContextCompactionRecord } from '@hbar/contracts/context-history'
import type { StoragePort } from '@hbar/storage'

/** The summary and its terminal telemetry commit together; failed acknowledgements cannot overwrite success. */
export function createContextCompactionJournal(
  storage: StoragePort,
  publish: (event: SessionEvent) => void,
  sessionId: string,
  runId?: string,
) {
  let record: ContextCompactionRecord | undefined
  let started = 0
  return {
    async start(modelId: string, contextWindow: number, beforeTokens: number) {
      started = performance.now()
      const event = await storage.call('compactionStart', {
        id: crypto.randomUUID(),
        sessionId,
        runId: runId ?? null,
        modelId,
        contextWindow,
        beforeTokens,
      })
      record = contextCompactionRecordSchema.parse((event.data as { compaction: unknown }).compaction)
      publish(event)
    },
    async complete(
      throughSeq: number,
      summary: string,
      modelId: string,
      afterTokens: number,
      retainedMessages: number,
      chunks: number,
    ) {
      const event = await storage.call(
        'compact',
        sessionId,
        throughSeq,
        summary,
        modelId,
        record
          ? {
              record,
              durationMs: Math.max(0, performance.now() - started),
              afterTokens,
              summaryTokens: Math.ceil(summary.length / 3),
              retainedMessages,
              chunks,
            }
          : undefined,
      )
      publish(event)
    },
    chunkCompleted() {
      if (record) record = { ...record, chunks: record.chunks + 1 }
    },
    async fail(error: unknown, cancelled: boolean) {
      if (!record) return
      const event = await storage.call('compactionFinish', record, {
        status: cancelled ? 'cancelled' : 'failed',
        durationMs: Math.max(0, performance.now() - started),
        afterTokens: null,
        summaryTokens: null,
        retainedMessages: null,
        chunks: record.chunks,
        errorCode: error instanceof HbarError ? error.code : cancelled ? 'CANCELLED' : 'COMPACTION_FAILED',
      })
      if (event) publish(event)
    },
  }
}
