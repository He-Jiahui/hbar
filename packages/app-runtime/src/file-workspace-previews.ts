import { CommandError } from '@hbar/commands'
import type { FileWorkspaceEntryState, FileWorkspacePreviewState } from './types'

export const MAX_FILE_PREVIEWS = 32
export const MAX_FILE_DIFF_CHARACTERS = 8 * 1024 * 1024

/** The legacy single-view fields are projections, never another document or diff owner. */
export function projectFileEntry(entry: FileWorkspaceEntryState): FileWorkspaceEntryState {
  const active = entry.previews.find((preview) => preview.id === entry.activePreviewId)
  return {
    ...entry,
    activePreviewId: active?.id ?? null,
    view: active?.kind ?? 'browser',
    document: active?.kind === 'document' ? active.document : null,
    documentMode: active?.kind === 'document' ? active.documentMode : 'preview',
    diff: active?.kind === 'diff' ? active.diff : null,
  }
}

export function replaceFilePreview(
  entry: FileWorkspaceEntryState,
  preview: FileWorkspacePreviewState,
  activate = false,
): FileWorkspaceEntryState {
  const exists = entry.previews.some((value) => value.id === preview.id)
  if (!exists && entry.previews.length >= MAX_FILE_PREVIEWS)
    throw new CommandError('BUSY', 'Close another file preview before opening one')
  return projectFileEntry({
    ...entry,
    previews: exists
      ? entry.previews.map((value) => (value.id === preview.id ? preview : value))
      : [...entry.previews, preview],
    activePreviewId: activate ? preview.id : entry.activePreviewId,
  })
}

export function filePreviewCloseReason(preview: FileWorkspacePreviewState): 'dirty' | 'submitting' | 'unknown' | null {
  if (preview.kind !== 'document') return null
  const document = preview.document
  if (document.status === 'submitting' || document.status === 'unknown') return document.status
  return document.draft !== document.baseline ? 'dirty' : null
}

/** The captured UUID set is atomic; a reopened path has a different UUID and is not part of it. */
export function closeFilePreviews(entry: FileWorkspaceEntryState, ids: readonly string[]) {
  const requested = new Set(ids)
  const targets = entry.previews.filter((preview) => requested.has(preview.id))
  if (targets.length === 0) return { entry, closed: [], blocked: [] }
  const blocked = targets.flatMap((preview) => {
    const reason = filePreviewCloseReason(preview)
    return reason ? [{ previewId: preview.id, reason }] : []
  })
  if (blocked.length) return { entry, closed: [], blocked }
  const closed = targets.map((preview) => preview.id)
  const previews = entry.previews.filter((preview) => !requested.has(preview.id))
  let activePreviewId = entry.activePreviewId
  if (activePreviewId && requested.has(activePreviewId)) {
    const index = entry.previews.findIndex((preview) => preview.id === activePreviewId)
    activePreviewId =
      entry.previews.slice(index + 1).find((preview) => !requested.has(preview.id))?.id ??
      entry.previews.slice(0, index).findLast((preview) => !requested.has(preview.id))?.id ??
      null
  }
  return { entry: projectFileEntry({ ...entry, previews, activePreviewId, error: null }), closed, blocked }
}

export function assertFileDiffBudget(entries: Readonly<Record<string, FileWorkspaceEntryState>>) {
  let characters = 0
  for (const entry of Object.values(entries)) {
    for (const preview of entry.previews) if (preview.kind === 'diff') characters += preview.diff.text.length
    if (characters > MAX_FILE_DIFF_CHARACTERS)
      throw new CommandError('BUSY', 'Close a diff preview before reading more diff text')
  }
}
