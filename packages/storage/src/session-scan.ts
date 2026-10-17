import type { Database } from 'bun:sqlite'
import { sessionSchema } from '@hbar/contracts'
import {
  sessionScanInputSchema,
  sessionScanPageSchema,
  type SessionScanInput,
  type SessionScanPage,
} from '@hbar/contracts/session-scan'

/** Primary-key keyset reads do not depend on mutable activity timestamps or retain a transaction between pages. */
export function createSessionScanner(db: Database): (raw: SessionScanInput) => SessionScanPage {
  return (raw: SessionScanInput) => {
    const input = sessionScanInputSchema.parse(raw)
    return db.transaction(() => {
      let through = input.through
      if (through === undefined) {
        const ceiling = db.prepare<{ id: string }, []>('SELECT id FROM sessions ORDER BY id DESC LIMIT 1')
        try {
          through = ceiling.get()?.id
        } finally {
          ceiling.finalize()
        }
      }
      if (through === undefined) return { items: [], through: null, nextCursor: null }
      const statement = db.prepare<
        {
          id: string
          workspaceId: string
          title: string
          archived: number
          parentId: string | null
          createdAt: number
          updatedAt: number
          seq: number
        },
        [string, string, number]
      >(
        `SELECT id,workspaceId,title,archived,parentId,createdAt,updatedAt,seq
         FROM sessions WHERE id>? AND id<=? ORDER BY id LIMIT ?`,
      )
      try {
        const rows = statement.all(input.after ?? '', through, input.limit + 1)
        const items = rows
          .slice(0, input.limit)
          .map((row) => sessionSchema.parse({ ...row, archived: row.archived !== 0 }))
        return sessionScanPageSchema.parse({
          items,
          through,
          nextCursor: rows.length > input.limit ? items.at(-1)?.id : null,
        })
      } finally {
        statement.finalize()
      }
    })()
  }
}
