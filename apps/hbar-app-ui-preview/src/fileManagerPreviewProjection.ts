import type {
  LumenFileManagerContent,
  LumenFileManagerReferenceContent as Content,
  LumenFileManagerReferenceUpload,
} from '@lumen/app-ui'
import type { FileManagerPreviewSeed, FileManagerPreviewStoreApi } from './fileManagerPreviewModel'
import { fileManagerBytes, fileManagerPreviewNotice } from './fileManagerPreviewReferenceFixtures'

function unique<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter(({ id }) => {
    if (!id.trim() || seen.has(id)) return false
    seen.add(id)
    return true
  })
}
export function createFileManagerPreviewSeed(
  input: Content,
  variant: number,
  ownerId: string,
  fixtureId: string,
): FileManagerPreviewSeed {
  const items =
    input.kind === 'drive'
      ? input.content.rows
      : input.kind === 'assets'
        ? input.content.assets
        : input.kind === 'detail'
          ? input.content.items
          : input.items
  const folders = input.kind === 'drive' || input.kind === 'assets' ? input.content.folders : []
  const itemRequests =
    input.kind === 'upload'
      ? []
      : items.flatMap(({ id }) =>
          ['download', 'share', 'make-copy', 'copy-link', 'access', 'open'].map((actionId) => ({
            actionId,
            value: id,
          })),
        )
  const requestActions = [
    ...itemRequests,
    ...['new-folder', 'upload', 'share', 'delete', 'more'].map((actionId) => ({ actionId })),
    ...['drive', 'campaign'].map((value) => ({ actionId: 'breadcrumb', value })),
  ]
  const seenItems = new Set<string>()
  const normalizedItems = items.flatMap((item) => {
    if (!item.id.trim() || seenItems.has(item.id)) return []
    seenItems.add(item.id)
    return [
      {
        id: item.id,
        name: item.name,
        kind: item.kind,
        ...(input.kind === 'drive'
          ? { starred: input.content.rows.find(({ id }) => id === item.id)?.starred ?? false }
          : {}),
        ...(input.kind === 'assets' ? { selectedByDefault: input.selectedIds.includes(item.id) } : {}),
        ...(input.kind === 'upload'
          ? {
              upload: (() => {
                const row = input.items.find(({ id }) => id === item.id)
                return row
                  ? {
                      state: row.state === 'paused' || row.state === 'cancelled' ? ('queued' as const) : row.state,
                      progress: row.progress,
                      sizeBytes: fileManagerBytes(row.size),
                      ...(row.remaining ? { remaining: row.remaining } : {}),
                    }
                  : undefined
              })(),
            }
          : {}),
      },
    ]
  })
  return {
    ownerId,
    variant,
    fixtureId,
    items: normalizedItems,
    folders: unique(folders).map((folder) => ({
      id: folder.id,
      ...(folder.parentId ? { parentId: folder.parentId } : {}),
      expandable: folder.expandable ?? false,
      expandedByDefault: input.kind === 'drive' && input.expandedIds.includes(folder.id),
    })),
    ...(input.kind === 'drive' ? { initialFolderId: input.folderId, initialFocusedId: '' } : {}),
    ...(input.kind === 'assets' ? { initialFolderId: '', initialFocusedId: '' } : {}),
    ...(input.kind === 'detail' && input.content.activeItemId ? { initialFocusedId: input.content.activeItemId } : {}),
    requestActions,
  }
}
function relativeAge(value: string): number {
  if (value.startsWith('Today')) return 0
  if (value === 'Yesterday') return 1
  if (value === 'Last week') return 7
  const match = /(\d+)\s+(day|week)/.exec(value)
  return match ? Number(match[1]) * (match[2] === 'week' ? 7 : 1) : 0
}
function mb(bytes: number): string {
  return `${(bytes / 1000000).toFixed(1)} MB`
}
function fileSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  if (bytes < 1000000) return `${(bytes / 1000).toFixed(1)} KB`
  return mb(bytes)
}
function uploadRows(
  input: Extract<Content, { kind: 'upload' }>,
  store: FileManagerPreviewStoreApi,
): readonly LumenFileManagerReferenceUpload[] {
  const state = store.getState()
  const rows: LumenFileManagerReferenceUpload[] = []
  state.items.forEach((item) => {
    if (state.removedIds.includes(item.id)) return
    const transfer = state.uploadsById[item.id]
    if (!transfer) return
    const original = input.items.find(({ id }) => id === item.id)
    rows.push({
      id: item.id,
      name: item.name,
      kind:
        original?.kind ??
        (item.kind === 'image' || item.kind === 'video' || item.kind === 'document' || item.kind === 'archive'
          ? item.kind
          : 'file'),
      size: original?.size ?? fileSize(transfer.sizeBytes),
      progress: transfer.progress,
      state: transfer.state,
      ...(transfer.remaining ? { remaining: transfer.remaining } : {}),
      ...(transfer.state === 'failed' && original?.statusDetail ? { statusDetail: original.statusDetail } : {}),
    })
  })
  return rows
}
export function projectFileManagerPreview(
  input: Content,
  store: FileManagerPreviewStoreApi,
  report?: (event: { readonly actionId: string; readonly value?: string | undefined }) => void,
): LumenFileManagerContent {
  const state = store.getState()
  let projected = input
  const removed = state.removedIds
  switch (input.kind) {
    case 'drive': {
      const available =
        state.locationId === 'starred' || (state.locationId === 'drive' && state.folderId === 'my-drive')
      const rows = unique(input.content.rows)
        .filter(
          ({ id, name }) =>
            !removed.includes(id) &&
            name.toLocaleLowerCase().includes(state.query.trim().toLocaleLowerCase()) &&
            (state.locationId !== 'starred' || state.starredIds.includes(id)),
        )
        .map((row) => ({ ...row, starred: state.starredIds.includes(row.id) }))
      rows.sort(
        (a, b) =>
          (state.sortId === 'size'
            ? fileManagerBytes(a.size) - fileManagerBytes(b.size)
            : state.sortId === 'modified'
              ? relativeAge(a.modified) - relativeAge(b.modified)
              : a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })) * (state.descending ? -1 : 1),
      )
      const folderLabel =
        state.locationId === 'drive'
          ? (input.content.folders.find(({ id }) => id === state.folderId)?.name ?? input.content.labels.myDrive)
          : state.locationId === 'starred'
            ? input.content.labels.starred
            : state.locationId === 'recent'
              ? input.content.labels.recent
              : state.locationId === 'shared'
                ? input.content.labels.shared
                : input.content.labels.bin
      projected = {
        ...input,
        available,
        content: { ...input.content, rows: available ? rows : [], folders: unique(input.content.folders) },
        query: state.query,
        locationId: state.locationId,
        folderId: state.folderId,
        folderLabel,
        view: state.viewId,
        sortId: state.sortId,
        descending: state.descending,
        selectedIds: state.selectedIds,
        expandedIds: state.expandedIds,
        focusedId: state.focusedId,
        menuId: state.menuId,
      }
      break
    }
    case 'assets': {
      const folderAssets = input.folderContents.find(({ folderId }) => folderId === state.folderId)?.assets
      const available = !state.folderId || folderAssets !== undefined
      const assets = unique(folderAssets ?? input.content.assets).filter(
        ({ id, kind }) =>
          !removed.includes(id) &&
          (state.filterId === 'all' ||
            (state.filterId === 'images'
              ? kind === 'image'
              : state.filterId === 'video'
                ? kind === 'video'
                : kind === 'document')),
      )
      assets.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) * (state.descending ? -1 : 1))
      projected = {
        ...input,
        available,
        content: {
          ...input.content,
          assets: available ? assets : [],
          folders: state.folderId ? [] : unique(input.content.folders),
        },
        breadcrumbItems: state.folderId
          ? [
              ...input.breadcrumbItems,
              {
                id: state.folderId,
                label:
                  input.content.folders.find(({ id }) => id === state.folderId)?.name ?? input.content.labels.title,
              },
            ]
          : input.breadcrumbItems,
        filterId: state.filterId,
        descending: state.descending,
        selectedIds: state.selectedIds,
      }
      break
    }
    case 'detail': {
      const items = unique(input.content.items)
        .filter(({ id }) => !removed.includes(id))
        .map((item) => ({ ...item, metadata: unique(item.metadata), activity: unique(item.activity) }))
      projected = {
        ...input,
        content: { ...input.content, items, activeItemId: state.focusedId || items[0]?.id },
        detailAvailable:
          state.focusedId === 'northwind-visual' || ['one', 'boundary', 'overflow'].includes(state.fixtureId),
      }
      break
    }
    case 'upload': {
      const items = uploadRows(input, store)
      const sourceSnapshot =
        items.length === input.items.length &&
        items.every((item) =>
          input.items.some(
            (original) =>
              original.id === item.id && original.state === item.state && original.progress === item.progress,
          ),
        )
      const total = items.reduce((sum, { id }) => sum + (state.uploadsById[id]?.sizeBytes ?? 0), 0)
      const transferred = items.reduce(
        (sum, { id, progress }) => sum + ((state.uploadsById[id]?.sizeBytes ?? 0) * progress) / 100,
        0,
      )
      const complete = items.filter(({ state: status }) => status === 'uploaded').length
      projected = {
        ...input,
        items,
        open: state.open,
        content: {
          ...input.content,
          labels: {
            ...input.content.labels,
            summary: sourceSnapshot
              ? input.content.labels.summary
              : `${complete} of ${items.length} complete · ${mb(total)} total`,
            transferSummary: sourceSnapshot
              ? input.content.labels.transferSummary
              : `${mb(transferred)} of ${mb(total)} transferred`,
          },
        },
      }
      break
    }
    default:
      break
  }
  const ownerId = state.ownerId
  const visibleIds = (reference: Content) =>
    reference.kind === 'drive'
      ? reference.content.rows.map(({ id }) => id)
      : reference.kind === 'assets'
        ? reference.content.assets.map(({ id }) => id)
        : reference.kind === 'detail'
          ? reference.content.items.map(({ id }) => id)
          : reference.items.map(({ id }) => id)
  const currentReference = () => projectFileManagerPreview(input, store).reference
  const request = (actionId: string, value?: string) => {
    const result = store.getState().request(ownerId, { actionId, ...(value === undefined ? {} : { value }) })
    if (result) report?.({ actionId, ...(value === undefined ? {} : { value }) })
  }
  const notice =
    state.uploadError === 'invalid-file'
      ? 'Choose up to 80 files per batch, each smaller than or equal to 2 GB with a valid name and size.'
      : state.lastRequest
        ? fileManagerPreviewNotice(
            state.lastRequest.actionId,
            state.lastRequest.value ?? (state.selectedIds.length ? JSON.stringify(state.selectedIds) : undefined),
          )
        : undefined
  return {
    reference: {
      ...projected,
      notice,
      onChange: (fieldId, value) => {
        const current = store.getState()
        if (fieldId === 'query') current.setQuery(ownerId, value)
        else if (fieldId === 'location') current.setLocation(ownerId, value)
        else if (fieldId === 'view' && (value === 'list' || value === 'grid')) current.setView(ownerId, value)
        else if (fieldId === 'sort') {
          const [sort, direction] = value.split(':')
          if (sort === 'name' || sort === 'size' || sort === 'modified')
            current.setSort(ownerId, sort, direction === undefined ? undefined : direction === 'true')
        } else if (
          fieldId === 'filter' &&
          (value === 'all' || value === 'images' || value === 'video' || value === 'documents')
        )
          current.setFilter(ownerId, value)
      },
      onAction: (actionId, value) => {
        const current = store.getState()
        const reference = currentReference()
        if (!reference) return
        const visible = visibleIds(reference)
        if (actionId === 'folder' && value) {
          if (!current.selectFolder(ownerId, value)) return
          if (input.kind === 'assets') {
            current.clearSelection(ownerId)
            current.setFilter(ownerId, 'all')
          }
          if (input.kind === 'drive') current.setLocation(ownerId, 'drive')
        } else if (actionId === 'expand' && value) current.toggleExpanded(ownerId, value)
        else if (actionId === 'select' && value && visible.includes(value)) current.toggleSelection(ownerId, value)
        else if (actionId === 'select-all' || actionId === 'unselect-all')
          current.selectVisible(ownerId, visible, actionId === 'select-all')
        else if (actionId === 'clear-selection') current.clearSelection(ownerId)
        else if (actionId === 'star' && value && visible.includes(value)) current.toggleStar(ownerId, value)
        else if (actionId === 'focus' && value && visible.includes(value)) current.focus(ownerId, value)
        else if (actionId === 'open' && value && visible.includes(value)) {
          const row = input.kind === 'drive' ? input.content.rows.find(({ id }) => id === value) : undefined
          const folder =
            row?.kind === 'folder'
              ? input.kind === 'drive'
                ? input.content.folders.find(({ name }) => name === row.name)
                : undefined
              : undefined
          if (folder) current.selectFolder(ownerId, folder.id)
          else {
            current.focus(ownerId, value)
            request(actionId, value)
          }
        } else if (actionId === 'menu' && value && visible.includes(value))
          current.setMenu(ownerId, current.menuId === value ? '' : value)
        else if (actionId === 'menu-close') current.setMenu(ownerId, '')
        else if (input.kind === 'upload') {
          if (actionId === 'dismiss') current.setOpen(ownerId, false)
          else if (actionId === 'reopen') current.setOpen(ownerId, true)
          else if (actionId === 'cancel-all') current.cancelAll(ownerId)
          else if (actionId === 'clear-completed') current.clearCompleted(ownerId)
          else if (value && visible.includes(value) && ['pause', 'start', 'retry', 'remove'].includes(actionId)) {
            if (actionId === 'pause' || actionId === 'start' || actionId === 'retry' || actionId === 'remove')
              current.uploadAction(ownerId, value, actionId)
          }
        } else if (input.kind === 'assets' && ['share', 'delete', 'more'].includes(actionId)) {
          if (
            !current.selectedIds.length ||
            current.selectedIds.some(
              (id) => !current.items.some((item) => item.id === id) || current.removedIds.includes(id),
            )
          )
            return
          const result = current.request(ownerId, { actionId })
          if (result) report?.({ actionId, value: JSON.stringify(current.selectedIds) })
        } else if (value && visible.includes(value)) {
          if (input.kind === 'detail' && current.focusedId !== value) return
          request(actionId, value)
        } else if (actionId === 'breadcrumb' && input.kind === 'assets' && value === 'assets')
          current.selectFolder(ownerId, '')
        else if (actionId === 'breadcrumb') request(actionId, value)
        else if (!value) request(actionId)
      },
      ...(projected.kind === 'upload'
        ? {
            onFiles: (files: readonly { readonly name: string; readonly size: number; readonly type: string }[]) => {
              const current = store.getState()
              const batch = files.map((file, index) => ({
                id: `local-file-${current.items.length}-${index}-${file.name}`,
                name: file.name,
                kind: file.type.startsWith('image/')
                  ? 'image'
                  : file.type.startsWith('video/')
                    ? 'video'
                    : file.type === 'application/pdf'
                      ? 'document'
                      : 'archive',
                upload: { state: 'queued' as const, progress: 0, sizeBytes: file.size },
              }))
              current.addUploads(ownerId, batch)
            },
          }
        : {}),
    },
  }
}
