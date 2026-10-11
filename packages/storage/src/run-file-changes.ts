import type { Database } from 'bun:sqlite'
import { HbarError, type SessionEvent } from '@hbar/contracts'
import {
  toolFileChangesSchema,
  toolFileChangeSchema,
  runFileChangesSummarySchema,
  runChangedFileSchema,
  MAX_RUN_CHANGED_FILES,
  MAX_RUN_CHANGE_BYTES,
  MAX_FILE_CHANGE_TEXT,
  RUN_CHANGE_PREVIEW_FILES,
  type RunFileChangesSummary,
  type RunChangedFile,
  type ToolFileChange,
} from '@hbar/contracts/run-file-changes'
import { countFileChanges, fileChangeDiffPage } from './run-file-change-diff'

export const RUN_FILE_CHANGES_SQL = `
  CREATE TABLE IF NOT EXISTS run_file_change_state (
    runId TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE, incomplete INTEGER NOT NULL DEFAULT 0,
    summary TEXT
  );
  CREATE TABLE IF NOT EXISTS run_file_changes (
    runId TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, path TEXT NOT NULL,
    root TEXT NOT NULL, versions TEXT NOT NULL, consistent INTEGER NOT NULL, seq INTEGER NOT NULL,
    bytes INTEGER NOT NULL, metadata TEXT, PRIMARY KEY(runId,path)
  );
`
export interface RunFileChangeVersion extends ToolFileChange {
  readonly root: string
  readonly consistent: boolean
}
interface ChangeRow {
  path: string
  root: string
  versions: string
  consistent: number
  seq: number
  metadata: string | null
}
const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null
function version(row: ChangeRow): RunFileChangeVersion {
  return {
    ...toolFileChangeSchema.parse(JSON.parse(row.versions) as unknown),
    root: row.root,
    consistent: row.consistent === 1,
  }
}
function metadata(file: ToolFileChange): RunChangedFile {
  return {
    path: file.path,
    kind: file.before === null ? 'created' : file.after === null ? 'deleted' : 'modified',
    ...countFileChanges(file.before, file.after),
  }
}
function rows(db: Database, runId: string) {
  return db
    .query<ChangeRow, [string, number]>('SELECT * FROM run_file_changes WHERE runId=? ORDER BY path LIMIT ?')
    .all(runId, MAX_RUN_CHANGED_FILES)
}
export function readRunFileChangesSummary(db: Database, runId: string): RunFileChangesSummary | undefined {
  const row = db
    .query<{ summary: string | null }, [string]>('SELECT summary FROM run_file_change_state WHERE runId=?')
    .get(runId)
  return row?.summary ? runFileChangesSummarySchema.parse(JSON.parse(row.summary) as unknown) : undefined
}
/** Projection of committed write receipts. Replay is idempotent and never repeats filesystem operations. */
export function projectRunFileChanges(db: Database, event: SessionEvent): void {
  if (!event.runId) return
  const data = object(event.data)
  if (event.type === 'run.filesUndone') {
    const summary = runFileChangesSummarySchema.safeParse(object(data?.run)?.fileChanges)
    if (summary.success)
      db.query('UPDATE run_file_change_state SET summary=? WHERE runId=?').run(
        JSON.stringify(summary.data),
        event.runId,
      )
    return
  }
  if (event.type !== 'message.committed' && event.type !== 'tool.sequence_result') return
  if (!Array.isArray(data?.content)) return
  for (const candidate of data.content) {
    const block = object(candidate)
    if (block?.type !== 'tool_result') continue
    const parsed = toolFileChangesSchema.safeParse(block.fileChanges)
    if (!parsed.success) continue
    db.query('INSERT OR IGNORE INTO run_file_change_state(runId) VALUES(?)').run(event.runId)
    for (const file of parsed.data.files) {
      const previous = db
        .query<ChangeRow, [string, string]>('SELECT * FROM run_file_changes WHERE runId=? AND path=?')
        .get(event.runId, file.path)
      if (previous && previous.seq >= event.seq) continue
      const prior = previous ? version(previous) : null
      const merged = { path: file.path, before: prior ? prior.before : file.before, after: file.after }
      const bytes = Buffer.byteLength(merged.before ?? '') + Buffer.byteLength(merged.after ?? '')
      const usage = db
        .query<{ files: number; bytes: number }, [string]>(
          'SELECT COUNT(*) AS files,COALESCE(SUM(bytes),0) AS bytes FROM run_file_changes WHERE runId=?',
        )
        .get(event.runId)
      if (
        Buffer.byteLength(file.before ?? '') > MAX_FILE_CHANGE_TEXT ||
        Buffer.byteLength(file.after ?? '') > MAX_FILE_CHANGE_TEXT ||
        (!previous && (usage?.files ?? 0) >= MAX_RUN_CHANGED_FILES) ||
        (usage?.bytes ?? 0) +
          bytes -
          (previous ? Buffer.byteLength(prior?.before ?? '') + Buffer.byteLength(prior?.after ?? '') : 0) >
          MAX_RUN_CHANGE_BYTES
      ) {
        db.query('UPDATE run_file_change_state SET incomplete=1 WHERE runId=?').run(event.runId)
        continue
      }
      const consistent = !prior || (prior.consistent && prior.after === file.before && prior.root === parsed.data.root)
      db.query(
        `INSERT INTO run_file_changes(runId,path,root,versions,consistent,seq,bytes) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(runId,path) DO UPDATE SET versions=excluded.versions,consistent=excluded.consistent,seq=excluded.seq,bytes=excluded.bytes`,
      ).run(event.runId, file.path, parsed.data.root, JSON.stringify(merged), Number(consistent), event.seq, bytes)
    }
  }
}
export function finishRunFileChanges(db: Database, runId: string, seq: number): void {
  const files = rows(db, runId)
    .map((row) => ({ row, file: version(row) }))
    .filter(({ file }) => file.before !== file.after)
  const state = db
    .query<{ incomplete: number }, [string]>('SELECT incomplete FROM run_file_change_state WHERE runId=?')
    .get(runId)
  if (!state) return
  const items = files.map(({ file }) => metadata(file))
  for (const item of items)
    db.query('UPDATE run_file_changes SET metadata=? WHERE runId=? AND path=?').run(
      JSON.stringify(item),
      runId,
      item.path,
    )
  const summary: RunFileChangesSummary = {
    seq,
    totalFiles: files.length,
    addedLines: items.some((item) => item.addedLines === null)
      ? null
      : items.reduce((sum, item) => sum + (item.addedLines ?? 0), 0),
    removedLines: items.some((item) => item.removedLines === null)
      ? null
      : items.reduce((sum, item) => sum + (item.removedLines ?? 0), 0),
    preview: items.slice(0, RUN_CHANGE_PREVIEW_FILES),
    canUndo: files.length > 0 && state.incomplete === 0 && files.every(({ file }) => file.consistent),
    incomplete: state.incomplete === 1,
    undoneAt: null,
  }
  db.query('UPDATE run_file_change_state SET summary=? WHERE runId=?').run(JSON.stringify(summary), runId)
}
export function readRunFileChangeVersions(db: Database, runId: string): RunFileChangeVersion[] {
  return rows(db, runId)
    .map(version)
    .filter((file) => file.before !== file.after)
}
export function readRunFileChangePage(db: Database, runId: string, after: string | undefined, limit: number) {
  const items = db
    .query<{ metadata: string }, [string, string | null, string | null, number]>(
      'SELECT metadata FROM run_file_changes WHERE runId=? AND metadata IS NOT NULL AND (? IS NULL OR path>?) ORDER BY path LIMIT ?',
    )
    .all(runId, after ?? null, after ?? null, limit + 1)
    .map((row) => runChangedFileSchema.parse(JSON.parse(row.metadata) as unknown))
  return {
    summary: readRunFileChangesSummary(db, runId) ?? null,
    items: items.slice(0, limit),
    nextCursor: items.length > limit ? (items[limit - 1]?.path ?? null) : null,
  }
}
export function readRunFileChangeDiff(db: Database, runId: string, path: string, offset: number) {
  const row = db
    .query<ChangeRow, [string, string]>(
      'SELECT * FROM run_file_changes WHERE runId=? AND path=? AND metadata IS NOT NULL',
    )
    .get(runId, path)
  if (!row) throw new HbarError('NOT_FOUND', 'This Run did not change the requested file')
  const file = version(row)
  return fileChangeDiffPage(file.before, file.after, offset)
}
