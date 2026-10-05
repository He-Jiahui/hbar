import type { Database } from 'bun:sqlite'
import { HbarError, type Session } from '@hbar/contracts'
import {
  sessionSchema,
  workspaceSchema,
  sessionAgentChildrenInputSchema,
  sessionAgentChildrenPageSchema,
  sessionAgentAncestorsSchema,
  type SessionAgentChildrenInput,
  type SessionActivityExecution,
} from '@hbar/contracts/sidebar-directory'
import { z } from 'zod'

/** Only Host-created Agent records form navigation links. Public parentId also belongs to ordinary forks. */
export function agentMembershipSql(alias: 's' | 'child' | 'sessions'): string {
  return `${alias}.parentId IS NOT NULL AND ${alias}.parentId<>${alias}.id
    AND EXISTS (SELECT 1 FROM events e WHERE e.sessionId=${alias}.id AND e.type='agent.created' AND json_extract(e.data,'$.parentSessionId')=${alias}.parentId)
    AND NOT EXISTS (SELECT 1 FROM events e WHERE e.sessionId=${alias}.id AND e.type='session.forked')`
}
export const agentChildCountSql = (parent: 's' | 'sessions') =>
  `(SELECT COUNT(*) FROM sessions child WHERE child.parentId=${parent}.id AND child.archived=0 AND ${agentMembershipSql('child')})`
const record = z.record(z.string(), z.unknown())
const sessionFromRow = (row: Record<string, unknown>) =>
  sessionSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    parentId: row.parentId,
    archived: Boolean(row.archived),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    seq: row.seq,
  })
export function createSessionAgentDirectory(
  db: Database,
  executions: (ids: readonly string[]) => ReadonlyMap<string, SessionActivityExecution>,
) {
  const count = (parentSessionId: string) =>
    z
      .object({ count: z.number().int().nonnegative().safe() })
      .parse(
        db
          .query(
            `SELECT COUNT(*) AS count FROM sessions s WHERE s.parentId=? AND s.archived=0 AND ${agentMembershipSql('s')}`,
          )
          .get(parentSessionId),
      ).count
  const childRow = (row: Record<string, unknown>, summaries: ReadonlyMap<string, SessionActivityExecution>) => {
    const session = sessionFromRow(row)
    const execution = summaries.get(session.id)
    if (!execution) throw new HbarError('INVALID_STATE', 'Agent execution summary is unavailable')
    return {
      session,
      execution,
      agentChildCount: z.number().int().nonnegative().safe().parse(row.agentChildCount),
      lastResponseAt: z.number().int().nonnegative().safe().nullable().parse(row.lastResponseAt),
    }
  }
  return {
    children(value: SessionAgentChildrenInput) {
      const parsed = sessionAgentChildrenInputSchema.safeParse(value)
      if (!parsed.success) throw new HbarError('INVALID_INPUT', 'Invalid Agent child query')
      const input = parsed.data
      return db.transaction(() => {
        if (!db.query('SELECT id FROM sessions WHERE id=?').get(input.parentSessionId))
          throw new HbarError('NOT_FOUND', 'Parent Session not found')
        const revision = z
          .object({ revision: z.number().int().nonnegative().safe() })
          .parse(db.query('SELECT revision FROM directory_activity_revision WHERE id=1').get()).revision
        if (
          input.cursor &&
          (input.cursor.parentSessionId !== input.parentSessionId || input.cursor.revision !== revision)
        )
          throw new HbarError('STALE_CURSOR', 'Agent child activity changed; restart the listing')
        const select = `SELECT s.*, ${agentChildCountSql('s')} AS agentChildCount,
          (SELECT MAX(m.createdAt) FROM messages m WHERE m.sessionId=s.id AND m.role='assistant') AS lastResponseAt
          FROM sessions s WHERE s.parentId=? AND s.archived=0 AND ${agentMembershipSql('s')}`
        const rows = z.array(record).parse(
          db
            .query(
              `WITH children AS (${select}) SELECT * FROM children
          WHERE (? IS NULL OR COALESCE(lastResponseAt,0)<? OR (COALESCE(lastResponseAt,0)=? AND (createdAt<? OR (createdAt=? AND id COLLATE BINARY>?))))
          ORDER BY COALESCE(lastResponseAt,0) DESC,createdAt DESC,id COLLATE BINARY ASC LIMIT ?`,
            )
            .all(
              input.parentSessionId,
              input.cursor?.responseAt ?? null,
              input.cursor?.responseAt ?? null,
              input.cursor?.responseAt ?? null,
              input.cursor?.createdAt ?? null,
              input.cursor?.createdAt ?? null,
              input.cursor?.sessionId ?? null,
              input.limit + 1,
            ),
        )
        const pageRows = rows.slice(0, input.limit)
        const includedRow =
          input.includeSessionId && !pageRows.some((item) => item.id === input.includeSessionId)
            ? db.query(`${select} AND s.id=?`).get(input.parentSessionId, input.includeSessionId)
            : null
        const included = includedRow ? record.parse(includedRow) : null
        const summaries = executions(
          [...pageRows, ...(included ? [included] : [])].map((row) => sessionFromRow(row).id),
        )
        const items = pageRows.map((row) => childRow(row, summaries))
        const last = items.at(-1)
        return sessionAgentChildrenPageSchema.parse({
          parentSessionId: input.parentSessionId,
          revision,
          totalCount: count(input.parentSessionId),
          items,
          includedItem: included ? childRow(included, summaries) : null,
          nextCursor:
            rows.length > input.limit && last
              ? {
                  parentSessionId: input.parentSessionId,
                  revision,
                  responseAt: last.lastResponseAt ?? 0,
                  createdAt: last.session.createdAt,
                  sessionId: last.session.id,
                }
              : null,
        })
      })()
    },
    ancestors(sessionId: string) {
      return db.transaction(() => {
        const items: { session: Session; agentChildCount: number }[] = []
        const visited = new Set<string>()
        let currentId: string | null = sessionId
        while (currentId) {
          if (visited.has(currentId)) throw new HbarError('INVALID_AGENT_TREE', 'Agent ancestry contains a cycle')
          if (items.length >= 32) throw new HbarError('AGENT_DEPTH_LIMIT', 'Agent ancestry exceeds 32 Sessions')
          visited.add(currentId)
          const raw = db
            .query(
              `SELECT s.*, ${agentChildCountSql('s')} AS agentChildCount, CASE WHEN ${agentMembershipSql('s')} THEN 1 ELSE 0 END AS agent FROM sessions s WHERE s.id=?`,
            )
            .get(currentId)
          if (!raw) throw new HbarError('NOT_FOUND', 'Agent ancestor Session is unavailable')
          const row = record.parse(raw)
          const session = sessionFromRow(row)
          items.unshift({ session, agentChildCount: z.number().int().nonnegative().safe().parse(row.agentChildCount) })
          currentId = row.agent === 1 ? session.parentId : null
        }
        const root = items[0]
        if (!root) throw new HbarError('NOT_FOUND', 'Agent root is unavailable')
        return sessionAgentAncestorsSchema.parse({
          sessionId,
          items,
          workspace: workspaceSchema.parse(
            db.query('SELECT * FROM workspaces WHERE id=?').get(root.session.workspaceId),
          ),
        })
      })()
    },
  }
}
