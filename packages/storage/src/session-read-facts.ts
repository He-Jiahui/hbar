import type { Database } from 'bun:sqlite'
import {
  HbarError,
  sessionReadFactsInputSchema,
  sessionReadFactsSchema,
  sessionRunFactSchema,
  type SessionReadFacts,
  type SessionReadFactsInput,
} from '@hbar/contracts'

/** Read-only projection. Filtering/truncation happens in the owning Worker before any IPC reply. */
export function readSessionFacts(db: Database, value: SessionReadFactsInput): SessionReadFacts {
  const input = sessionReadFactsInputSchema.parse(value)
  return db.transaction(() => {
    const session = db.query<{ seq: number }, [string]>('SELECT seq FROM sessions WHERE id=?').get(input.sessionId)
    if (!session) throw new HbarError('SESSION_NOT_FOUND', 'Session was not found')
    const boundary = db
      .query<{ seq: number }, [string, number]>(
        'SELECT seq FROM events WHERE sessionId=? ORDER BY seq LIMIT 1 OFFSET ?',
      )
      .get(input.sessionId, input.eventLimit - 1)
    const runs = input.includeRuns
      ? db
          .query<
            {
              id: string
              sessionId: string
              requestId: string
              modelId: string
              status: string
              createdAt: number
              startedAt: number | null
              endedAt: number | null
              error: string | null
              thinking: string | null
              approval: string | null
              sandbox: string | null
            },
            [string]
          >(
            `SELECT id,sessionId,requestId,modelId,status,createdAt,startedAt,endedAt,
              substr(error,1,4001) AS error,
              json_extract(input,'$.thinking') AS thinking,
              json_extract(input,'$.approval') AS approval,
              json_extract(input,'$.sandbox') AS sandbox
             FROM runs WHERE sessionId=? ORDER BY createdAt DESC LIMIT 40`,
          )
          .all(input.sessionId)
          .map(({ thinking, approval, sandbox, ...run }) =>
            sessionRunFactSchema.parse({
              ...run,
              error: run.error?.slice(0, 4_001) ?? null,
              input: {
                ...(thinking === null ? {} : { thinking }),
                ...(approval === null ? {} : { approval }),
                ...(sandbox === null ? {} : { sandbox: JSON.parse(sandbox) as unknown }),
              },
            }),
          )
      : []
    const run = input.requestId ? runs.find((candidate) => candidate.requestId === input.requestId) : undefined
    let resultSummary = ''
    if (run) {
      // A truncated iterator must not leave a cached statement for a later read.
      const fragments = db.prepare<{ text: string }, [string, string]>(
        `WITH recent AS MATERIALIZED (
            SELECT seq,runId,role,content FROM messages WHERE sessionId=? ORDER BY seq DESC LIMIT 60
          ) SELECT substr(json_extract(block.value,'$.text'),1,4001) AS text
            FROM recent JOIN json_each(recent.content) AS block
            WHERE recent.runId=? AND recent.role='assistant'
              AND json_extract(block.value,'$.type')='text'
            ORDER BY recent.seq,CAST(block.key AS INTEGER) LIMIT 4001`,
      )
      try {
        let first = true
        for (const fragment of fragments.iterate(input.sessionId, run.id)) {
          resultSummary = `${resultSummary}${first ? '' : '\n'}${fragment.text}`.slice(0, 4_000)
          first = false
          if (resultSummary.length === 4_000) break
        }
      } finally {
        fragments.finalize()
      }
    }
    return sessionReadFactsSchema.parse({
      sessionId: input.sessionId,
      cursor: session.seq,
      eventThroughSeq: boundary?.seq ?? session.seq,
      runs,
      resultSummary,
    })
  })()
}
