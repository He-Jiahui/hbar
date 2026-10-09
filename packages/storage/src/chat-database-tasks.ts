import type { Database } from 'bun:sqlite'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { settingsScopeSchema } from '@hbar/contracts/commands/settings'
import { type ChatDatabaseScope } from '@hbar/contracts/commands/chat-database'

const time = z.number().int().nonnegative().safe()
const runtimeSchema = z.strictObject({
  scope: settingsScopeSchema,
  policyToken: z.string().max(4000),
  baselineAt: time,
  lastDueAt: time.nullable(),
  pendingDueAt: time.nullable(),
  lastCapacityAt: time.nullable(),
  lastCapacitySignature: z.string().max(400).nullable(),
  lastCapacityPolicyToken: z.string().max(4000).nullable().default(null),
  lastOperationId: z.string().min(1).max(200).nullable(),
  lastRunAt: time.nullable(),
  error: z.string().max(160).nullable(),
})
export type ChatDatabaseTaskRuntime = z.output<typeof runtimeSchema>
export const chatDatabaseScopeKey = (scope: ChatDatabaseScope) =>
  scope.kind === 'global' ? 'global' : `${scope.kind}:${scope.targetId}`

export function createChatDatabaseTaskStorage(db: Database) {
  function scopes(after: string | null, limit = 50) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new HbarError('INVALID_INPUT', 'Task page size is invalid')
    const rows = db
      .query<
        { key: string; kind: string; targetId: string | null; updatedAt: number },
        [string | null, string | null, number]
      >(
        `
      WITH taskScopes AS (
        SELECT 'global' AS key,'global' AS kind,NULL AS targetId,COALESCE((SELECT updatedAt FROM settings_layers WHERE kind='global'),0) AS updatedAt
        UNION ALL SELECT layer.kind||':'||layer.targetId,layer.kind,layer.targetId,
        MAX(layer.updatedAt,COALESCE((SELECT MAX(parent.updatedAt) FROM settings_layers parent
          WHERE parent.kind='global' OR (layer.kind='session' AND parent.kind='workspace' AND parent.targetId=(SELECT workspaceId FROM sessions WHERE id=layer.targetId))),0))
        FROM settings_layers layer
        WHERE layer.kind IN ('workspace','session') AND EXISTS(SELECT 1 FROM json_each(layer.valuesJson) WHERE key LIKE 'f:chatDatabase.%')
        AND CASE layer.kind WHEN 'workspace' THEN EXISTS(SELECT 1 FROM workspaces WHERE id=layer.targetId) ELSE EXISTS(SELECT 1 FROM sessions WHERE id=layer.targetId) END)
      SELECT * FROM taskScopes WHERE (? IS NULL OR key>?) ORDER BY key LIMIT ?
    `,
      )
      .all(after, after, limit + 1)
    const selected = rows.slice(0, limit)
    return {
      items: selected.map((row) => ({
        key: row.key,
        scope: settingsScopeSchema.parse({ kind: row.kind, ...(row.targetId ? { targetId: row.targetId } : {}) }),
        updatedAt: row.updatedAt,
      })),
      next: rows.length > limit ? (selected.at(-1)?.key ?? null) : null,
    }
  }
  function get(scope: ChatDatabaseScope): ChatDatabaseTaskRuntime | null {
    const row = db
      .query<{ lastResultJson: string | null }, [string]>(
        'SELECT lastResultJson FROM chat_database_schedule_runtime WHERE scopeKey=?',
      )
      .get(chatDatabaseScopeKey(scope))
    return row?.lastResultJson ? runtimeSchema.parse(JSON.parse(row.lastResultJson)) : null
  }
  function save(input: ChatDatabaseTaskRuntime): ChatDatabaseTaskRuntime {
    const state = runtimeSchema.parse(input)
    db.query(
      `INSERT INTO chat_database_schedule_runtime VALUES(?,?,?,?,?,?,?,?,?)
      ON CONFLICT(scopeKey) DO UPDATE SET policyRevisionsJson=excluded.policyRevisionsJson,lastDueAt=excluded.lastDueAt,
      pendingDueAt=excluded.pendingDueAt,lastCapacityAt=excluded.lastCapacityAt,lastOperationId=excluded.lastOperationId,
      lastResultJson=excluded.lastResultJson,updatedAt=excluded.updatedAt`,
    ).run(
      chatDatabaseScopeKey(state.scope),
      JSON.stringify(state.scope),
      '{}',
      state.lastDueAt,
      state.pendingDueAt,
      state.lastCapacityAt,
      state.lastOperationId,
      JSON.stringify(state),
      Date.now(),
    )
    return state
  }
  return { scopes, get, save }
}
