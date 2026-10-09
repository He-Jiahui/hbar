import type { Database } from 'bun:sqlite'
import { HbarError } from '@hbar/contracts'
import { chatDatabasePreviewItemSchema } from '@hbar/contracts/commands/chat-database'
import type { createChatDatabaseJournal } from './chat-database-journal'

export const CHAT_DATABASE_AUTOMATIC_PLAN_SQL = `
CREATE TABLE IF NOT EXISTS chat_database_automatic_plans(
  previewId TEXT PRIMARY KEY REFERENCES chat_database_previews(id) ON DELETE CASCADE,
  budgetBytes INTEGER, plannedBytes INTEGER NOT NULL DEFAULT 0,
  selectedCount INTEGER NOT NULL DEFAULT 0, complete INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS chat_database_automatic_items(
  previewId TEXT NOT NULL REFERENCES chat_database_automatic_plans(previewId) ON DELETE CASCADE,
  position INTEGER NOT NULL, originalPosition INTEGER NOT NULL,
  PRIMARY KEY(previewId,position), UNIQUE(previewId,originalPosition));
`

/** Select a fixed oldest-first subset, with ready leaves before their parents. */
export function createChatDatabaseAutomaticPlan(db: Database, journal: ReturnType<typeof createChatDatabaseJournal>) {
  function read(previewId: string) {
    return db
      .query<{ budgetBytes: number | null; plannedBytes: number; selectedCount: number; complete: number }, [string]>(
        'SELECT budgetBytes,plannedBytes,selectedCount,complete FROM chat_database_automatic_plans WHERE previewId=?',
      )
      .get(previewId)
  }
  function step(previewId: string, budgetBytes: number | null) {
    if (budgetBytes !== null && (!Number.isSafeInteger(budgetBytes) || budgetBytes < 0))
      throw new HbarError('INVALID_INPUT', 'Automatic cleanup budget is invalid')
    return db
      .transaction(() => {
        db.query('INSERT OR IGNORE INTO chat_database_automatic_plans(previewId,budgetBytes) VALUES(?,?)').run(
          previewId,
          budgetBytes,
        )
        const state = read(previewId)
        if (!state || state.budgetBytes !== budgetBytes)
          throw new HbarError('INVALID_STATE', 'Automatic plan budget changed')
        let { plannedBytes, selectedCount } = state
        let complete = Boolean(state.complete)
        for (let count = 0; count < 100 && !complete; count++) {
          if (budgetBytes !== null && plannedBytes >= budgetBytes) {
            complete = true
            break
          }
          const candidate = db
            .query<{ position: number; dataJson: string }, [string, string]>(
              `
          SELECT item.position,item.dataJson FROM chat_database_preview_items item
          WHERE item.previewId=? AND json_extract(item.dataJson,'$.eligible')=1
          AND NOT EXISTS(SELECT 1 FROM chat_database_automatic_items chosen WHERE chosen.previewId=item.previewId AND chosen.originalPosition=item.position)
          AND (item.kind!='sessions' OR NOT EXISTS(
            SELECT 1 FROM sessions child WHERE child.parentId=item.targetId AND NOT EXISTS(
              SELECT 1 FROM chat_database_automatic_items chosen JOIN chat_database_preview_items fixed
              ON fixed.previewId=chosen.previewId AND fixed.position=chosen.originalPosition
              WHERE chosen.previewId=? AND fixed.kind='sessions' AND fixed.targetId=child.id)))
          ORDER BY CASE item.kind WHEN 'cache' THEN 0 WHEN 'attachments' THEN 1 ELSE 2 END,
          COALESCE(json_extract(item.dataJson,'$.lastActivityAt'),0),item.targetId,item.position LIMIT 1
        `,
            )
            .get(previewId, previewId)
          if (!candidate) {
            complete = true
            break
          }
          const item = chatDatabasePreviewItemSchema.parse(JSON.parse(candidate.dataJson))
          plannedBytes += item.estimatedBytes
          selectedCount++
          db.query('INSERT INTO chat_database_automatic_items VALUES(?,?,?)').run(
            previewId,
            selectedCount,
            candidate.position,
          )
        }
        db.query(
          'UPDATE chat_database_automatic_plans SET plannedBytes=?,selectedCount=?,complete=? WHERE previewId=?',
        ).run(plannedBytes, selectedCount, Number(complete), previewId)
        return { plannedBytes, selectedCount, complete }
      })
      .immediate()
  }
  function page(previewId: string, after: number | null, limit = 50) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new HbarError('INVALID_INPUT', 'Automatic page size is invalid')
    const rows = db
      .query<{ position: number; dataJson: string }, [string, number, number]>(
        `
      SELECT selected.position,item.dataJson FROM chat_database_automatic_items selected
      JOIN chat_database_preview_items item ON item.previewId=selected.previewId AND item.position=selected.originalPosition
      WHERE selected.previewId=? AND selected.position>? ORDER BY selected.position LIMIT ?
    `,
      )
      .all(previewId, after ?? 0, limit + 1)
    const selected = rows.slice(0, limit)
    return {
      items: selected.map((row) => chatDatabasePreviewItemSchema.parse(JSON.parse(row.dataJson))),
      positions: selected.map((row) => row.position),
      next: rows.length > limit ? (selected.at(-1)?.position ?? null) : null,
      operation: journal.read(previewId),
    }
  }
  return { step, read, page }
}
