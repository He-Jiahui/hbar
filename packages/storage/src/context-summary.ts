import type { Database } from 'bun:sqlite'
import {
  CONTEXT_SUMMARY_EXCERPT_CHARACTERS,
  contextSummaryExcerptSchema,
  type ContextSummaryExcerpt,
} from '@hbar/contracts/delegated-context'

/** Read one indexed, bounded summary; no conversation messages cross the Worker boundary. */
export function createContextSummaryReader(db: Database) {
  const read = db.query<{ eventSeq: number; throughSeq: number; text: string; bytes: number }, [number, string]>(
    'SELECT eventSeq,throughSeq,substr(summary,1,?) AS text,length(CAST(summary AS BLOB)) AS bytes FROM compactions WHERE sessionId=? ORDER BY eventSeq DESC LIMIT 1',
  )
  return (sessionId: string): ContextSummaryExcerpt | null => {
    const value = read.get(CONTEXT_SUMMARY_EXCERPT_CHARACTERS, sessionId)
    return value
      ? contextSummaryExcerptSchema.parse({
          sessionId,
          eventSeq: value.eventSeq,
          throughSeq: value.throughSeq,
          text: value.text,
          truncated: value.bytes > new TextEncoder().encode(value.text).byteLength,
        })
      : null
  }
}
