import type { Database } from 'bun:sqlite'
import { HbarError } from '@hbar/contracts'
import {
  sessionSchema,
  workspaceSchema,
  sessionActivityGlobalListInputSchema,
  sessionActivityGlobalPageSchema,
  workspaceSidebarListInputSchema,
  workspaceSidebarPageSchema,
} from '@hbar/contracts/sidebar-directory'
import type {
  SessionActivityGlobalListInput,
  SessionActivityGlobalPage,
  WorkspaceSidebarListInput,
  WorkspaceSidebarPage,
} from '@hbar/contracts/sidebar-directory'
import type { WorkspaceDisplayNamesSnapshot } from '@hbar/contracts/commands/workspace-display-names'
import type { WorkspaceOrganizationSnapshot } from '@hbar/contracts/commands/workspace-organization'
import { z } from 'zod'

type DirectorySidebarRevisions = {
  readonly revision: number
  readonly displayNames: WorkspaceDisplayNamesSnapshot
  readonly organization: WorkspaceOrganizationSnapshot
}

const workspaceColumns = `
  w.id,w.path,w.name,w.createdAt,
  (SELECT s.createdAt FROM sessions s
    WHERE s.workspaceId=w.id AND s.archived=0
    ORDER BY s.createdAt DESC,s.id COLLATE BINARY ASC LIMIT 1) AS latestSessionCreatedAt,
  (SELECT s.updatedAt FROM sessions s
    WHERE s.workspaceId=w.id AND s.archived=0
    ORDER BY s.updatedAt DESC,s.id COLLATE BINARY ASC LIMIT 1) AS latestSessionUpdatedAt
`
const timestampSchema = z.number().int().nonnegative().safe()
const revisionSchema = z.number().int().nonnegative().safe()
const utf8Encoder = new TextEncoder()

export const SIDEBAR_DIRECTORY_SCHEMA_SQL = `
  CREATE INDEX IF NOT EXISTS sessions_sidebar_active_updated_id
    ON sessions(archived,updatedAt DESC,id COLLATE BINARY ASC);
  CREATE TRIGGER IF NOT EXISTS directory_activity_run_insert
    AFTER INSERT ON runs
    BEGIN UPDATE directory_activity_revision SET revision=revision+1 WHERE id=1; END;
  CREATE TRIGGER IF NOT EXISTS directory_activity_run_update
    AFTER UPDATE OF sessionId,status,startedAt,endedAt ON runs
    WHEN OLD.sessionId IS NOT NEW.sessionId OR OLD.status IS NOT NEW.status
      OR OLD.startedAt IS NOT NEW.startedAt OR OLD.endedAt IS NOT NEW.endedAt
    BEGIN UPDATE directory_activity_revision SET revision=revision+1 WHERE id=1; END;
  CREATE TRIGGER IF NOT EXISTS directory_activity_run_delete
    AFTER DELETE ON runs
    BEGIN UPDATE directory_activity_revision SET revision=revision+1 WHERE id=1; END;
`

function compareBinary(left: string, right: string): number {
  const leftBytes = utf8Encoder.encode(left)
  const rightBytes = utf8Encoder.encode(right)
  const sharedLength = Math.min(leftBytes.length, rightBytes.length)
  for (let index = 0; index < sharedLength; index++) {
    const difference = leftBytes[index]! - rightBytes[index]!
    if (difference !== 0) return difference
  }
  return leftBytes.length - rightBytes.length
}

function invalidInput(): never {
  throw new HbarError('INVALID_INPUT', 'Invalid sidebar directory query')
}

function staleCursor(): never {
  throw new HbarError('STALE_CURSOR', 'Sidebar directory changed; restart from the first page')
}

function workspaceItem(
  value: unknown,
  names: ReadonlyMap<string, string>,
): ReturnType<typeof workspaceSidebarPageSchema.parse>['items'][number] {
  const row = z.record(z.string(), z.unknown()).parse(value)
  const workspace = workspaceSchema.parse({
    id: row.id,
    path: row.path,
    name: row.name,
    createdAt: row.createdAt,
  })
  return {
    workspace,
    displayName: names.get(workspace.id) ?? workspace.name,
    latestSessionCreatedAt: timestampSchema.nullable().parse(row.latestSessionCreatedAt),
    latestSessionUpdatedAt: timestampSchema.nullable().parse(row.latestSessionUpdatedAt),
  }
}

function activityRevision(db: Database): number {
  const row = db.query<{ revision: number }, []>('SELECT revision FROM directory_activity_revision WHERE id=1').get()
  const parsed = revisionSchema.safeParse(row?.revision)
  if (!parsed.success) throw new HbarError('INVALID_STATE', 'Sidebar activity revision is unavailable')
  return parsed.data
}

function orderedProjectCompare(
  left: { readonly displayName: string; readonly workspaceId: string },
  right: { readonly displayName: string; readonly workspaceId: string },
  collator: Intl.Collator,
): number {
  return collator.compare(left.displayName, right.displayName) || compareBinary(left.workspaceId, right.workspaceId)
}

/** Maintains the smallest K rows in a bounded max-heap. The Worker scans, but never buffers, the roster. */
function retainSmallest<T>(heap: T[], value: T, capacity: number, compare: (left: T, right: T) => number): void {
  if (heap.length < capacity) {
    heap.push(value)
    let index = heap.length - 1
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (compare(heap[index]!, heap[parent]!) <= 0) break
      ;[heap[index], heap[parent]] = [heap[parent]!, heap[index]!]
      index = parent
    }
    return
  }
  if (compare(value, heap[0]!) >= 0) return
  heap[0] = value
  let index = 0
  for (;;) {
    const left = index * 2 + 1
    const right = left + 1
    let largest = index
    if (left < heap.length && compare(heap[left]!, heap[largest]!) > 0) largest = left
    if (right < heap.length && compare(heap[right]!, heap[largest]!) > 0) largest = right
    if (largest === index) return
    ;[heap[index], heap[largest]] = [heap[largest]!, heap[index]!]
    index = largest
  }
}

/** Read-only sidebar projections. Revision snapshots and each page share the same Worker transaction. */
export function createSidebarDirectoryStorage(
  db: Database,
  state: {
    readonly displayNames: () => WorkspaceDisplayNamesSnapshot
    readonly organization: () => WorkspaceOrganizationSnapshot
  },
) {
  function revisions(): DirectorySidebarRevisions {
    return {
      revision: activityRevision(db),
      displayNames: state.displayNames(),
      organization: state.organization(),
    }
  }

  function workspaceSidebarPage(value: WorkspaceSidebarListInput): WorkspaceSidebarPage {
    const parsedInput = workspaceSidebarListInputSchema.safeParse(value)
    if (!parsedInput.success) return invalidInput()
    const input = parsedInput.data
    return db.transaction(() => {
      const current = revisions()
      const { cursor, limit, includeWorkspaceIds = [] } = input
      if (
        cursor &&
        (cursor.revision !== current.revision ||
          cursor.displayNamesRevision !== current.displayNames.revision ||
          cursor.organizationRevision !== current.organization.revision)
      )
        return staleCursor()

      const names = new Map(current.displayNames.entries.map((entry) => [entry.workspaceId, entry.displayName]))
      const hiddenJson = JSON.stringify(current.organization.hiddenWorkspaceIds)
      let rows: ReturnType<typeof workspaceSidebarPageSchema.parse>['items']
      if (input.organization === 'project') {
        const collator = new Intl.Collator(input.locale)
        const compare = (
          left: { readonly displayName: string; readonly workspaceId: string },
          right: { readonly displayName: string; readonly workspaceId: string },
        ) => orderedProjectCompare(left, right, collator)
        const heap: ReturnType<typeof workspaceSidebarPageSchema.parse>['items'] = []
        const candidates = db
          .query(
            `SELECT ${workspaceColumns} FROM workspaces w
             WHERE NOT EXISTS (SELECT 1 FROM json_each(?) AS hidden WHERE hidden.value=w.id)`,
          )
          .iterate(hiddenJson) as Iterable<Record<string, unknown>>
        for (const row of candidates) {
          const item = workspaceItem(row, names)
          if (
            cursor &&
            compare(
              { displayName: item.displayName, workspaceId: item.workspace.id },
              { displayName: cursor.displayName, workspaceId: cursor.workspaceId },
            ) <= 0
          )
            continue
          retainSmallest(heap, item, limit + 1, (left, right) =>
            compare(
              { displayName: left.displayName, workspaceId: left.workspace.id },
              { displayName: right.displayName, workspaceId: right.workspace.id },
            ),
          )
        }
        rows = heap.sort((left, right) =>
          compare(
            { displayName: left.displayName, workspaceId: left.workspace.id },
            { displayName: right.displayName, workspaceId: right.workspace.id },
          ),
        )
      } else {
        const sortColumn = input.sortBy === 'createdAt' ? 'latestSessionCreatedAt' : 'latestSessionUpdatedAt'
        rows = db
          .query(
            `WITH activity AS MATERIALIZED (
               SELECT ${workspaceColumns}
               FROM workspaces w
             )
             SELECT id,path,name,createdAt,latestSessionCreatedAt,latestSessionUpdatedAt,
                    ${sortColumn} AS sortTimestamp
             FROM activity
             WHERE NOT EXISTS (SELECT 1 FROM json_each(?) AS hidden WHERE hidden.value=activity.id)
               AND (? IS NULL
                 OR ((? IS NULL AND sortTimestamp IS NULL AND id COLLATE BINARY > ?)
                     OR (? IS NOT NULL AND (sortTimestamp IS NULL OR sortTimestamp < ?
                         OR (sortTimestamp = ? AND id COLLATE BINARY > ?)))))
             ORDER BY (sortTimestamp IS NULL) ASC,sortTimestamp DESC,id COLLATE BINARY ASC
             LIMIT ?`,
          )
          .all(
            hiddenJson,
            cursor?.workspaceId ?? null,
            cursor?.timestamp ?? null,
            cursor?.workspaceId ?? null,
            cursor?.timestamp ?? null,
            cursor?.timestamp ?? null,
            cursor?.timestamp ?? null,
            cursor?.workspaceId ?? null,
            limit + 1,
          )
          .map((row) => workspaceItem(row, names))
      }

      const pageItems = rows.slice(0, limit)
      const pageIds = new Set(pageItems.map((item) => item.workspace.id))
      const requestedIds = includeWorkspaceIds.filter((id) => !pageIds.has(id))
      const includedItems =
        requestedIds.length === 0
          ? []
          : db
              .query(
                `SELECT ${workspaceColumns} FROM workspaces w
                 WHERE w.id IN (${requestedIds.map(() => '?').join(',')})
                   AND NOT EXISTS (SELECT 1 FROM json_each(?) AS hidden WHERE hidden.value=w.id)
                 ORDER BY w.id COLLATE BINARY ASC`,
              )
              .all(...requestedIds, hiddenJson)
              .map((row) => workspaceItem(row, names))
      const lastItem = pageItems.at(-1)
      const hasMore = rows.length > limit
      const nextCursor =
        hasMore && lastItem
          ? {
              organization: input.organization,
              sortBy: input.sortBy,
              locale: input.locale,
              revision: current.revision,
              displayNamesRevision: current.displayNames.revision,
              organizationRevision: current.organization.revision,
              displayName: lastItem.displayName,
              timestamp:
                input.organization === 'project'
                  ? null
                  : input.sortBy === 'createdAt'
                    ? lastItem.latestSessionCreatedAt
                    : lastItem.latestSessionUpdatedAt,
              workspaceId: lastItem.workspace.id,
            }
          : null
      return workspaceSidebarPageSchema.parse({
        revision: current.revision,
        displayNamesRevision: current.displayNames.revision,
        organizationRevision: current.organization.revision,
        items: pageItems,
        includedItems,
        nextCursor,
      })
    })()
  }

  function globalSessionActivityPage(value: SessionActivityGlobalListInput): SessionActivityGlobalPage {
    const parsedInput = sessionActivityGlobalListInputSchema.safeParse(value)
    if (!parsedInput.success) return invalidInput()
    const { cursor, limit } = parsedInput.data
    return db.transaction(() => {
      const current = revisions()
      if (
        cursor &&
        (cursor.revision !== current.revision ||
          cursor.displayNamesRevision !== current.displayNames.revision ||
          cursor.organizationRevision !== current.organization.revision)
      )
        return staleCursor()
      const names = new Map(current.displayNames.entries.map((entry) => [entry.workspaceId, entry.displayName]))
      const hiddenJson = JSON.stringify(current.organization.hiddenWorkspaceIds)
      const rows = db
        .query(
          `WITH run_activity AS (
             SELECT r.sessionId,
               SUM(CASE WHEN r.status IN ('queued','running','waiting_approval') THEN 1 ELSE 0 END) AS activeCount,
               SUM(CASE WHEN r.status='queued' THEN 1 ELSE 0 END) AS queuedCount,
               SUM(CASE WHEN r.status='running' THEN 1 ELSE 0 END) AS runningCount,
               SUM(CASE WHEN r.status='waiting_approval' THEN 1 ELSE 0 END) AS waitingCount,
               SUM(CASE WHEN EXISTS (SELECT 1 FROM events e WHERE e.runId=r.id AND e.type='run.cancelRequested')
                   THEN 1 ELSE 0 END) AS cancelRequestedCount
             FROM runs r
             WHERE r.status IN ('queued','running','waiting_approval')
             GROUP BY r.sessionId
           ), ranked AS (
             SELECT s.id AS sessionId,s.workspaceId,s.title,s.archived,s.parentId,s.createdAt,s.updatedAt,s.seq,
               w.id AS workspace_id,w.path AS workspace_path,w.name AS workspace_name,w.createdAt AS workspace_createdAt,
               COALESCE(a.activeCount,0) AS activeCount,COALESCE(a.queuedCount,0) AS queuedCount,
               COALESCE(a.runningCount,0) AS runningCount,COALESCE(a.waitingCount,0) AS waitingCount,
               COALESCE(a.cancelRequestedCount,0) AS cancelRequestedCount,
               CASE WHEN COALESCE(a.activeCount,0)>0 THEN 1 ELSE 0 END AS active
             FROM sessions s JOIN workspaces w ON w.id=s.workspaceId
             LEFT JOIN run_activity a ON a.sessionId=s.id
             WHERE s.archived=0
               AND NOT EXISTS (SELECT 1 FROM json_each(?) AS hidden WHERE hidden.value=w.id)
           )
           SELECT * FROM ranked
           WHERE (? IS NULL OR active<? OR (active=? AND
             (updatedAt<? OR (updatedAt=? AND sessionId COLLATE BINARY>?))))
           ORDER BY active DESC,updatedAt DESC,sessionId COLLATE BINARY ASC LIMIT ?`,
        )
        .all(
          hiddenJson,
          cursor ? Number(cursor.active) : null,
          cursor ? Number(cursor.active) : null,
          cursor ? Number(cursor.active) : null,
          cursor?.updatedAt ?? null,
          cursor?.updatedAt ?? null,
          cursor?.sessionId ?? null,
          limit + 1,
        )
      const pageItems = rows.slice(0, limit).map((value) => {
        const row = z.record(z.string(), z.unknown()).parse(value)
        const session = sessionSchema.parse({
          id: row.sessionId,
          workspaceId: row.workspaceId,
          title: row.title,
          archived: Boolean(row.archived),
          parentId: row.parentId,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          seq: row.seq,
        })
        const workspace = workspaceSchema.parse({
          id: row.workspace_id,
          path: row.workspace_path,
          name: row.workspace_name,
          createdAt: row.workspace_createdAt,
        })
        const activeCount = z.number().int().nonnegative().safe().parse(row.activeCount)
        const queuedCount = z.number().int().nonnegative().safe().parse(row.queuedCount)
        const runningCount = z.number().int().nonnegative().safe().parse(row.runningCount)
        const waitingCount = z.number().int().nonnegative().safe().parse(row.waitingCount)
        const cancelRequestedCount = z.number().int().nonnegative().safe().parse(row.cancelRequestedCount)
        const state =
          cancelRequestedCount > 0
            ? 'cancelRequested'
            : waitingCount > 0
              ? 'waiting_approval'
              : runningCount > 0
                ? 'running'
                : queuedCount > 0
                  ? 'queued'
                  : 'idle'
        return {
          session,
          workspace,
          displayName: names.get(workspace.id) ?? workspace.name,
          execution: { state, activeCount, queuedCount },
        }
      })
      const lastItem = pageItems.at(-1)
      const nextCursor =
        rows.length > limit && lastItem
          ? {
              revision: current.revision,
              displayNamesRevision: current.displayNames.revision,
              organizationRevision: current.organization.revision,
              active: lastItem.execution.activeCount > 0,
              updatedAt: lastItem.session.updatedAt,
              sessionId: lastItem.session.id,
            }
          : null
      return sessionActivityGlobalPageSchema.parse({
        revision: current.revision,
        displayNamesRevision: current.displayNames.revision,
        organizationRevision: current.organization.revision,
        items: pageItems,
        nextCursor,
      })
    })()
  }

  return { workspaceSidebarPage, globalSessionActivityPage }
}
