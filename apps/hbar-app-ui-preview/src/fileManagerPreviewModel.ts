import { createStore, type StoreApi } from 'zustand/vanilla'

export type FileManagerPreviewLocation = 'drive' | 'shared' | 'recent' | 'starred' | 'bin'
export type FileManagerPreviewView = 'list' | 'grid'
export type FileManagerPreviewSort = 'name' | 'size' | 'modified'
export type FileManagerPreviewFilter = 'all' | 'images' | 'video' | 'documents'
export type FileManagerPreviewUploadSourceState = 'queued' | 'uploading' | 'uploaded' | 'failed'
export type FileManagerPreviewUploadState = FileManagerPreviewUploadSourceState | 'paused' | 'cancelled'
export type FileManagerPreviewUploadAction = 'pause' | 'start' | 'retry' | 'remove'
export type FileManagerPreviewUploadError = '' | 'invalid-file'

export interface FileManagerPreviewUploadSeed {
  readonly state: FileManagerPreviewUploadSourceState
  readonly progress: number
  readonly sizeBytes: number
  readonly remaining?: string | undefined
}

export interface FileManagerPreviewItemSeed {
  readonly id: string
  readonly name: string
  readonly kind: string
  readonly starred?: boolean | undefined
  readonly selectedByDefault?: boolean | undefined
  readonly upload?: FileManagerPreviewUploadSeed | undefined
}

export interface FileManagerPreviewFolderSeed {
  readonly id: string
  readonly parentId?: string | undefined
  readonly expandable?: boolean | undefined
  readonly expandedByDefault?: boolean | undefined
}

export interface FileManagerPreviewRequestAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export type FileManagerPreviewRequest = FileManagerPreviewRequestAction

export interface FileManagerPreviewSeed {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly items: readonly FileManagerPreviewItemSeed[]
  readonly folders: readonly FileManagerPreviewFolderSeed[]
  readonly initialFolderId?: string | undefined
  readonly initialFocusedId?: string | undefined
  readonly requestActions: readonly FileManagerPreviewRequestAction[]
}

export interface FileManagerPreviewUpload {
  readonly state: FileManagerPreviewUploadState
  readonly progress: number
  readonly sizeBytes: number
  readonly remaining?: string | undefined
}

export interface FileManagerPreviewModelState {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly items: readonly FileManagerPreviewItemSeed[]
  readonly folders: readonly FileManagerPreviewFolderSeed[]
  readonly requestActions: readonly FileManagerPreviewRequestAction[]
  readonly query: string
  readonly locationId: FileManagerPreviewLocation
  readonly folderId: string
  readonly viewId: FileManagerPreviewView
  readonly sortId: FileManagerPreviewSort
  readonly descending: boolean
  readonly filterId: FileManagerPreviewFilter
  readonly focusedId: string
  readonly selectedIds: readonly string[]
  readonly expandedIds: readonly string[]
  readonly starredIds: readonly string[]
  readonly menuId: string
  readonly open: boolean
  readonly removedIds: readonly string[]
  readonly uploadsById: Readonly<Record<string, FileManagerPreviewUpload>>
  readonly uploadError: FileManagerPreviewUploadError
  readonly lastRequest: FileManagerPreviewRequest | undefined
  readonly setQuery: (ownerId: string, query: string) => boolean
  readonly setLocation: (ownerId: string, locationId: string) => boolean
  readonly selectFolder: (ownerId: string, folderId: string) => boolean
  readonly setView: (ownerId: string, viewId: FileManagerPreviewView) => boolean
  readonly setSort: (ownerId: string, sortId: FileManagerPreviewSort, descending?: boolean) => boolean
  readonly toggleSelection: (ownerId: string, itemId: string) => boolean
  readonly selectVisible: (ownerId: string, itemIds: readonly string[], selected: boolean) => boolean
  readonly clearSelection: (ownerId: string) => boolean
  readonly focus: (ownerId: string, itemId: string) => boolean
  readonly toggleExpanded: (ownerId: string, folderId: string) => boolean
  readonly toggleStar: (ownerId: string, itemId: string) => boolean
  readonly setFilter: (ownerId: string, filterId: FileManagerPreviewFilter) => boolean
  readonly setMenu: (ownerId: string, itemId: string) => boolean
  readonly setOpen: (ownerId: string, open: boolean) => boolean
  readonly uploadAction: (ownerId: string, itemId: string, action: FileManagerPreviewUploadAction) => boolean
  readonly clearCompleted: (ownerId: string) => boolean
  readonly cancelAll: (ownerId: string) => boolean
  readonly advance: (ownerId: string) => boolean
  readonly addUploads: (ownerId: string, items: readonly FileManagerPreviewItemSeed[]) => boolean
  readonly refresh: (seed: FileManagerPreviewSeed) => boolean
  readonly request: (ownerId: string, request: FileManagerPreviewRequest) => boolean
}

export type FileManagerPreviewStoreApi = StoreApi<FileManagerPreviewModelState>

const MAX_UPLOAD_BYTES = 2_000_000_000
const MAX_UPLOAD_BATCH = 80
const ROOT_FOLDER_ID = 'root'
function isNonblank(value: string): boolean {
  return value.trim().length > 0
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function isSourceUploadState(value: string): value is FileManagerPreviewUploadSourceState {
  return value === 'queued' || value === 'uploading' || value === 'uploaded' || value === 'failed'
}

function isLocation(value: string): value is FileManagerPreviewLocation {
  return value === 'drive' || value === 'shared' || value === 'recent' || value === 'starred' || value === 'bin'
}

function isView(value: string): value is FileManagerPreviewView {
  return value === 'list' || value === 'grid'
}

function isSort(value: string): value is FileManagerPreviewSort {
  return value === 'name' || value === 'size' || value === 'modified'
}

function isFilter(value: string): value is FileManagerPreviewFilter {
  return value === 'all' || value === 'images' || value === 'video' || value === 'documents'
}

function validUploadSize(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= MAX_UPLOAD_BYTES
}

function normalizeRemaining(value: string | undefined): string | undefined {
  return value !== undefined && isNonblank(value) ? value : undefined
}

function normalizeUpload(upload: FileManagerPreviewUploadSeed | undefined): FileManagerPreviewUploadSeed | undefined {
  if (!upload || !isSourceUploadState(upload.state) || !validUploadSize(upload.sizeBytes)) return undefined
  const remaining = normalizeRemaining(upload.remaining)
  return {
    state: upload.state,
    progress: clampProgress(upload.progress),
    sizeBytes: upload.sizeBytes,
    ...(remaining === undefined ? {} : { remaining }),
  }
}

function normalizeItems(items: readonly FileManagerPreviewItemSeed[]): readonly FileManagerPreviewItemSeed[] {
  const seen = new Set<string>()
  const normalized: FileManagerPreviewItemSeed[] = []
  for (const item of items) {
    if (!isNonblank(item.id) || seen.has(item.id)) continue
    seen.add(item.id)
    const upload = normalizeUpload(item.upload)
    const starred = typeof item.starred === 'boolean' ? item.starred : undefined
    const selectedByDefault = typeof item.selectedByDefault === 'boolean' ? item.selectedByDefault : undefined
    normalized.push({
      id: item.id,
      name: item.name,
      kind: item.kind,
      ...(starred === undefined ? {} : { starred }),
      ...(selectedByDefault === undefined ? {} : { selectedByDefault }),
      ...(upload === undefined ? {} : { upload }),
    })
  }
  return normalized
}

function normalizeFolders(folders: readonly FileManagerPreviewFolderSeed[]): readonly FileManagerPreviewFolderSeed[] {
  const seen = new Set<string>()
  const normalized: FileManagerPreviewFolderSeed[] = []
  for (const folder of folders) {
    if (!isNonblank(folder.id) || seen.has(folder.id)) continue
    seen.add(folder.id)
    const parentId = folder.parentId !== undefined && isNonblank(folder.parentId) ? folder.parentId : undefined
    const expandable = typeof folder.expandable === 'boolean' ? folder.expandable : undefined
    const expandedByDefault = typeof folder.expandedByDefault === 'boolean' ? folder.expandedByDefault : undefined
    normalized.push({
      id: folder.id,
      ...(parentId === undefined ? {} : { parentId }),
      ...(expandable === undefined ? {} : { expandable }),
      ...(expandedByDefault === undefined ? {} : { expandedByDefault }),
    })
  }
  return normalized
}

function normalizeRequestActions(
  actions: readonly FileManagerPreviewRequestAction[],
): readonly FileManagerPreviewRequestAction[] {
  const normalized: FileManagerPreviewRequestAction[] = []
  for (const action of actions) {
    if (!isNonblank(action.actionId) || (action.value !== undefined && !isNonblank(action.value))) continue
    if (normalized.some((candidate) => candidate.actionId === action.actionId && candidate.value === action.value))
      continue
    normalized.push(
      action.value === undefined ? { actionId: action.actionId } : { actionId: action.actionId, value: action.value },
    )
  }
  return normalized
}

interface NormalizedSeed {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly items: readonly FileManagerPreviewItemSeed[]
  readonly folders: readonly FileManagerPreviewFolderSeed[]
  readonly requestActions: readonly FileManagerPreviewRequestAction[]
  readonly initialFolderId: string | undefined
  readonly initialFocusedId: string | undefined
  readonly uploadsById: Readonly<Record<string, FileManagerPreviewUpload>>
}

function normalizeSeed(seed: FileManagerPreviewSeed): NormalizedSeed {
  const items = normalizeItems(seed.items)
  const folders = normalizeFolders(seed.folders)
  const uploadsById: Record<string, FileManagerPreviewUpload> = {}
  for (const item of items) {
    if (item.upload) uploadsById[item.id] = { ...item.upload }
  }
  return {
    ownerId: seed.ownerId,
    variant: seed.variant,
    fixtureId: seed.fixtureId,
    items,
    folders,
    requestActions: normalizeRequestActions(seed.requestActions),
    initialFolderId: seed.initialFolderId,
    initialFocusedId: seed.initialFocusedId,
    uploadsById,
  }
}

function owns(state: Pick<FileManagerPreviewModelState, 'ownerId' | 'fixtureId'>, ownerId: string): boolean {
  return isNonblank(ownerId) && isNonblank(state.ownerId) && isNonblank(state.fixtureId) && ownerId === state.ownerId
}

function itemById(
  items: readonly FileManagerPreviewItemSeed[],
  itemId: string,
): FileManagerPreviewItemSeed | undefined {
  return items.find((item) => item.id === itemId)
}

function folderById(
  folders: readonly FileManagerPreviewFolderSeed[],
  folderId: string,
): FileManagerPreviewFolderSeed | undefined {
  return folders.find((folder) => folder.id === folderId)
}

function isValidFolder(folders: readonly FileManagerPreviewFolderSeed[], folderId: string): boolean {
  return folderId === '' || folderById(folders, folderId) !== undefined
}

function firstCurrentItem(items: readonly FileManagerPreviewItemSeed[], removedIds: readonly string[]): string {
  return items.find((item) => !removedIds.includes(item.id))?.id ?? ''
}

function firstFocusedId(
  seed: Pick<NormalizedSeed, 'items' | 'initialFocusedId'>,
  removedIds: readonly string[],
  preserveEmpty = true,
): string {
  const requested = seed.initialFocusedId
  if (requested === '') return ''
  if (requested !== undefined && itemById(seed.items, requested) && !removedIds.includes(requested)) return requested
  if (requested === undefined && preserveEmpty) return ''
  return firstCurrentItem(seed.items, removedIds)
}

function initialFolderId(seed: Pick<NormalizedSeed, 'folders' | 'initialFolderId'>): string {
  const requested = seed.initialFolderId
  if (requested === '') return ''
  if (requested !== undefined && isValidFolder(seed.folders, requested)) return requested
  return ROOT_FOLDER_ID
}

function initialSelectedIds(items: readonly FileManagerPreviewItemSeed[]): readonly string[] {
  return items.filter((item) => item.selectedByDefault === true).map((item) => item.id)
}

function initialStarredIds(items: readonly FileManagerPreviewItemSeed[]): readonly string[] {
  return items.filter((item) => item.starred === true).map((item) => item.id)
}

function initialExpandedIds(folders: readonly FileManagerPreviewFolderSeed[]): readonly string[] {
  return folders
    .filter((folder) => folder.expandable === true && folder.expandedByDefault === true)
    .map((folder) => folder.id)
}

function sameRequest(left: FileManagerPreviewRequest | undefined, right: FileManagerPreviewRequest): boolean {
  return left?.actionId === right.actionId && left?.value === right.value
}

function allowsRequest(
  actions: readonly FileManagerPreviewRequestAction[],
  request: FileManagerPreviewRequest,
): boolean {
  return (
    isNonblank(request.actionId) &&
    (request.value === undefined || isNonblank(request.value)) &&
    actions.some((candidate) => candidate.actionId === request.actionId && candidate.value === request.value)
  )
}

function actionFromRequest(request: FileManagerPreviewRequest): FileManagerPreviewRequestAction {
  return request.value === undefined
    ? { actionId: request.actionId }
    : { actionId: request.actionId, value: request.value }
}

function reconcileUploads(
  next: NormalizedSeed,
  previous: Readonly<Record<string, FileManagerPreviewUpload>>,
  removedIds: readonly string[],
): Readonly<Record<string, FileManagerPreviewUpload>> {
  const uploads: Record<string, FileManagerPreviewUpload> = {}
  for (const item of next.items) {
    if (removedIds.includes(item.id)) continue
    const prior = previous[item.id]
    const source = next.uploadsById[item.id]
    if (prior && source) uploads[item.id] = { ...prior }
    else if (source) uploads[item.id] = { ...source }
  }
  return uploads
}

function reconcileExpanded(
  folders: readonly FileManagerPreviewFolderSeed[],
  previous: readonly string[],
  previousFolders: readonly FileManagerPreviewFolderSeed[],
): readonly string[] {
  const ids = new Set(previous.filter((id) => folders.some((folder) => folder.id === id && folder.expandable === true)))
  const previousFolderIds = new Set(previousFolders.map((folder) => folder.id))
  for (const folder of folders) {
    if (!previousFolderIds.has(folder.id) && folder.expandable === true && folder.expandedByDefault === true)
      ids.add(folder.id)
  }
  return folders.filter((folder) => ids.has(folder.id)).map((folder) => folder.id)
}

function reconcileRequest(
  previous: FileManagerPreviewRequest | undefined,
  actions: readonly FileManagerPreviewRequestAction[],
  items: readonly FileManagerPreviewItemSeed[],
  folders: readonly FileManagerPreviewFolderSeed[],
): FileManagerPreviewRequest | undefined {
  if (!previous) return undefined
  const request = actionFromRequest(previous)
  if (!allowsRequest(actions, request)) return undefined
  if (
    request.value !== undefined &&
    [
      'open',
      'download',
      'share',
      'make-copy',
      'copy-link',
      'access',
      'focus',
      'menu',
      'folder',
      'expand',
      'select',
      'star',
    ].includes(request.actionId) &&
    !items.some((item) => item.id === request.value) &&
    !folders.some((folder) => folder.id === request.value)
  )
    return undefined
  return previous
}

function allowsCurrentRequest(
  state: Pick<FileManagerPreviewModelState, 'requestActions' | 'items' | 'folders'>,
  request: FileManagerPreviewRequest,
): boolean {
  if (!allowsRequest(state.requestActions, request)) return false
  if (
    request.value !== undefined &&
    [
      'open',
      'download',
      'share',
      'make-copy',
      'copy-link',
      'access',
      'focus',
      'menu',
      'folder',
      'expand',
      'select',
      'star',
    ].includes(request.actionId)
  )
    return (
      state.items.some((item) => item.id === request.value) ||
      state.folders.some((folder) => folder.id === request.value)
    )
  return true
}

function removeIdsFor(itemIds: readonly string[], removedIds: readonly string[]): readonly string[] {
  return removedIds.filter((id) => itemIds.includes(id))
}

function normalizeAddedUpload(item: FileManagerPreviewItemSeed): FileManagerPreviewItemSeed | undefined {
  if (!isNonblank(item.id) || !isNonblank(item.name) || !isNonblank(item.kind)) return undefined
  const upload = normalizeUpload(item.upload)
  if (!upload) return undefined
  return { ...item, upload }
}

function updateUpload(
  upload: FileManagerPreviewUpload,
  action: FileManagerPreviewUploadAction,
): FileManagerPreviewUpload | undefined {
  if (action === 'pause') {
    if (upload.state !== 'uploading' && upload.state !== 'queued') return undefined
    return { ...upload, state: 'paused', ...(upload.remaining === undefined ? {} : { remaining: upload.remaining }) }
  }
  if (action === 'start') {
    if (upload.state !== 'queued' && upload.state !== 'paused') return undefined
    return { state: 'uploading', progress: upload.progress, sizeBytes: upload.sizeBytes }
  }
  if (action === 'retry') {
    if (upload.state !== 'failed' && upload.state !== 'cancelled') return undefined
    return {
      state: 'uploading',
      sizeBytes: upload.sizeBytes,
      progress: 0,
    }
  }
  return undefined
}

/** Owns pure, local file-manager preview state. No files are uploaded or read here. */
export function createFileManagerPreviewStore(input: FileManagerPreviewSeed): FileManagerPreviewStoreApi {
  const seed = normalizeSeed(input)
  const initialFolder = initialFolderId(seed)
  const initialRemoved: readonly string[] = []
  const initialFocused = firstFocusedId(seed, initialRemoved)
  return createStore<FileManagerPreviewModelState>((set, get) => ({
    ownerId: seed.ownerId,
    variant: seed.variant,
    fixtureId: seed.fixtureId,
    items: seed.items,
    folders: seed.folders,
    requestActions: seed.requestActions,
    query: '',
    locationId: 'drive',
    folderId: initialFolder,
    viewId: 'list',
    sortId: 'name',
    descending: false,
    filterId: 'all',
    focusedId: initialFocused,
    selectedIds: initialSelectedIds(seed.items),
    expandedIds: initialExpandedIds(seed.folders),
    starredIds: initialStarredIds(seed.items),
    menuId: '',
    open: seed.variant === 4,
    removedIds: initialRemoved,
    uploadsById: seed.uploadsById,
    uploadError: '',
    lastRequest: undefined,
    setQuery(ownerId, query) {
      const state = get()
      if (!owns(state, ownerId)) return false
      if (state.query !== query) set({ query, lastRequest: undefined })
      return true
    },
    setLocation(ownerId, locationId) {
      const state = get()
      if (!owns(state, ownerId) || !isLocation(locationId)) return false
      if (state.locationId !== locationId) set({ locationId, lastRequest: undefined })
      return true
    },
    selectFolder(ownerId, folderId) {
      const state = get()
      if (!owns(state, ownerId) || !isValidFolder(state.folders, folderId)) return false
      if (state.folderId !== folderId) set({ folderId, lastRequest: undefined })
      return true
    },
    setView(ownerId, viewId) {
      const state = get()
      if (!owns(state, ownerId) || !isView(viewId)) return false
      if (state.viewId !== viewId) set({ viewId, lastRequest: undefined })
      return true
    },
    setSort(ownerId, sortId, nextDescending) {
      const state = get()
      if (!owns(state, ownerId) || !isSort(sortId)) return false
      const descending = nextDescending ?? (state.sortId === sortId ? !state.descending : false)
      if (state.sortId !== sortId || state.descending !== descending)
        set({ sortId, descending, lastRequest: undefined })
      return true
    },
    toggleSelection(ownerId, itemId) {
      const state = get()
      if (
        !owns(state, ownerId) ||
        !isNonblank(itemId) ||
        !itemById(state.items, itemId) ||
        state.removedIds.includes(itemId)
      )
        return false
      const selectedIds = state.selectedIds.includes(itemId)
        ? state.selectedIds.filter((id) => id !== itemId)
        : [...state.selectedIds, itemId]
      set({ selectedIds, lastRequest: undefined })
      return true
    },
    selectVisible(ownerId, itemIds, selected) {
      const state = get()
      if (!owns(state, ownerId)) return false
      const uniqueIds = [...new Set(itemIds)]
      if (
        uniqueIds.some(
          (itemId) => !isNonblank(itemId) || !itemById(state.items, itemId) || state.removedIds.includes(itemId),
        )
      )
        return false
      const visibleSet = new Set(uniqueIds)
      const selectedIds = selected
        ? [...state.selectedIds, ...uniqueIds.filter((id) => !state.selectedIds.includes(id))]
        : state.selectedIds.filter((id) => !visibleSet.has(id))
      if (
        selectedIds.length !== state.selectedIds.length ||
        selectedIds.some((id, index) => id !== state.selectedIds[index])
      )
        set({ selectedIds, lastRequest: undefined })
      return true
    },
    clearSelection(ownerId) {
      const state = get()
      if (!owns(state, ownerId)) return false
      if (state.selectedIds.length) set({ selectedIds: [], lastRequest: undefined })
      return true
    },
    focus(ownerId, itemId) {
      const state = get()
      if (
        !owns(state, ownerId) ||
        !isNonblank(itemId) ||
        !itemById(state.items, itemId) ||
        state.removedIds.includes(itemId)
      )
        return false
      if (state.focusedId !== itemId) set({ focusedId: itemId, lastRequest: undefined })
      return true
    },
    toggleExpanded(ownerId, folderId) {
      const state = get()
      const folder = folderById(state.folders, folderId)
      if (!owns(state, ownerId) || !isNonblank(folderId) || !folder || folder.expandable !== true) return false
      const expandedIds = state.expandedIds.includes(folderId)
        ? state.expandedIds.filter((id) => id !== folderId)
        : [...state.expandedIds, folderId]
      set({ expandedIds, lastRequest: undefined })
      return true
    },
    toggleStar(ownerId, itemId) {
      const state = get()
      if (
        !owns(state, ownerId) ||
        !isNonblank(itemId) ||
        !itemById(state.items, itemId) ||
        state.removedIds.includes(itemId)
      )
        return false
      const starredIds = state.starredIds.includes(itemId)
        ? state.starredIds.filter((id) => id !== itemId)
        : [...state.starredIds, itemId]
      set({ starredIds, lastRequest: undefined })
      return true
    },
    setFilter(ownerId, filterId) {
      const state = get()
      if (!owns(state, ownerId) || !isFilter(filterId)) return false
      if (state.filterId !== filterId) set({ filterId, lastRequest: undefined })
      return true
    },
    setMenu(ownerId, itemId) {
      const state = get()
      if (
        !owns(state, ownerId) ||
        (itemId !== '' && (!isNonblank(itemId) || !itemById(state.items, itemId) || state.removedIds.includes(itemId)))
      )
        return false
      if (state.menuId !== itemId) set({ menuId: itemId, lastRequest: undefined })
      return true
    },
    setOpen(ownerId, open) {
      const state = get()
      if (!owns(state, ownerId)) return false
      if (state.open !== open) set({ open, lastRequest: undefined })
      return true
    },
    uploadAction(ownerId, itemId, action) {
      const state = get()
      if (!owns(state, ownerId) || !isNonblank(itemId) || !state.uploadsById[itemId]) return false
      if (action === 'remove') {
        if (state.removedIds.includes(itemId)) return false
        const removedIds = [...state.removedIds, itemId]
        const selectedIds = state.selectedIds.filter((id) => id !== itemId)
        const starredIds = state.starredIds.filter((id) => id !== itemId)
        const focusedId = state.focusedId === itemId ? firstCurrentItem(state.items, removedIds) : state.focusedId
        const menuId = state.menuId === itemId ? '' : state.menuId
        set({ removedIds, selectedIds, starredIds, focusedId, menuId, lastRequest: undefined })
        return true
      }
      const current = state.uploadsById[itemId]
      if (!current) return false
      const next = updateUpload(current, action)
      if (!next) return false
      set({ uploadsById: { ...state.uploadsById, [itemId]: next }, lastRequest: undefined })
      return true
    },
    clearCompleted(ownerId) {
      const state = get()
      if (!owns(state, ownerId)) return false
      const completed = Object.entries(state.uploadsById)
        .filter(([id, upload]) => upload.state === 'uploaded' && !state.removedIds.includes(id))
        .map(([id]) => id)
      if (!completed.length) return true
      const removedIds = [...state.removedIds, ...completed]
      const selectedIds = state.selectedIds.filter((id) => !completed.includes(id))
      const starredIds = state.starredIds.filter((id) => !completed.includes(id))
      const focusedId = completed.includes(state.focusedId)
        ? firstCurrentItem(state.items, removedIds)
        : state.focusedId
      const menuId = completed.includes(state.menuId) ? '' : state.menuId
      set({ removedIds, selectedIds, starredIds, focusedId, menuId, lastRequest: undefined })
      return true
    },
    cancelAll(ownerId) {
      const state = get()
      if (!owns(state, ownerId)) return false
      let changed = false
      const uploadsById: Record<string, FileManagerPreviewUpload> = {}
      for (const [id, upload] of Object.entries(state.uploadsById)) {
        const shouldCancel = upload.state === 'uploading' || upload.state === 'queued' || upload.state === 'paused'
        const next = shouldCancel ? { ...upload, state: 'cancelled' as const } : upload
        if (next.state !== upload.state) changed = true
        uploadsById[id] = next
      }
      if (changed) set({ uploadsById, lastRequest: undefined })
      return true
    },
    advance(ownerId) {
      const state = get()
      if (!owns(state, ownerId)) return false
      let changed = false
      const uploadsById: Record<string, FileManagerPreviewUpload> = {}
      for (const [id, upload] of Object.entries(state.uploadsById)) {
        if (upload.state !== 'uploading') {
          uploadsById[id] = upload
          continue
        }
        const progress = Math.min(100, upload.progress + 3)
        const next =
          progress >= 100
            ? { state: 'uploaded' as const, progress: 100, sizeBytes: upload.sizeBytes }
            : { state: 'uploading' as const, progress, sizeBytes: upload.sizeBytes }
        uploadsById[id] = next
        if (next.state !== upload.state || next.progress !== upload.progress) changed = true
      }
      if (changed) set({ uploadsById, lastRequest: undefined })
      return true
    },
    addUploads(ownerId, inputItems) {
      const state = get()
      if (!owns(state, ownerId) || inputItems.length === 0 || inputItems.length > MAX_UPLOAD_BATCH) {
        if (owns(state, ownerId)) set({ uploadError: 'invalid-file', lastRequest: undefined })
        return false
      }
      const seen = new Set(state.items.map((item) => item.id))
      const added: FileManagerPreviewItemSeed[] = []
      const uploadsById: Record<string, FileManagerPreviewUpload> = { ...state.uploadsById }
      for (const item of inputItems) {
        const normalized = normalizeAddedUpload(item)
        if (!normalized || seen.has(normalized.id)) {
          set({ uploadError: 'invalid-file', lastRequest: undefined })
          return false
        }
        seen.add(normalized.id)
        const upload = normalized.upload
        if (!upload) {
          set({ uploadError: 'invalid-file', lastRequest: undefined })
          return false
        }
        added.push(normalized)
        uploadsById[normalized.id] = { ...upload }
      }
      const selectedIds = [
        ...state.selectedIds,
        ...added.filter((item) => item.selectedByDefault === true).map((item) => item.id),
      ]
      const starredIds = [...state.starredIds, ...added.filter((item) => item.starred === true).map((item) => item.id)]
      set({
        items: [...state.items, ...added],
        uploadsById,
        selectedIds,
        starredIds,
        uploadError: '',
        lastRequest: undefined,
      })
      return true
    },
    refresh(nextInput) {
      const state = get()
      if (
        !isNonblank(state.ownerId) ||
        nextInput.ownerId !== state.ownerId ||
        nextInput.variant !== state.variant ||
        nextInput.fixtureId !== state.fixtureId
      )
        return false
      const next = normalizeSeed(nextInput)
      const sourceIds = next.items.map((item) => item.id)
      const removedIds = removeIdsFor(sourceIds, state.removedIds)
      const selectedIds = state.selectedIds.filter((id) => sourceIds.includes(id) && !removedIds.includes(id))
      const sourceSelected = next.items.filter((item) => item.selectedByDefault === true).map((item) => item.id)
      for (const id of sourceSelected) {
        if (!state.items.some((item) => item.id === id) && !removedIds.includes(id)) selectedIds.push(id)
      }
      const dedupedSelected = [...new Set(selectedIds)]
      const nextItems = next.items
      const nextItemIds = new Set(sourceIds)
      const starredIds = state.starredIds.filter((id) => nextItemIds.has(id) && !removedIds.includes(id))
      const sourceStarred = next.items.filter((item) => item.starred === true).map((item) => item.id)
      for (const id of sourceStarred) {
        if (!state.items.some((item) => item.id === id) && !removedIds.includes(id)) starredIds.push(id)
      }
      const dedupedStarred = [...new Set(starredIds)]
      const focusedId =
        state.focusedId === ''
          ? next.initialFocusedId === undefined
            ? ''
            : firstFocusedId(next, removedIds, false)
          : sourceIds.includes(state.focusedId) && !removedIds.includes(state.focusedId)
            ? state.focusedId
            : firstFocusedId(next, removedIds, false)
      const folderId = isValidFolder(next.folders, state.folderId) ? state.folderId : initialFolderId(next)
      const expandedIds = reconcileExpanded(next.folders, state.expandedIds, state.folders)
      const menuId =
        state.menuId !== '' && sourceIds.includes(state.menuId) && !removedIds.includes(state.menuId)
          ? state.menuId
          : ''
      const uploadsById = reconcileUploads(next, state.uploadsById, removedIds)
      const requestContextChanged =
        focusedId !== state.focusedId ||
        folderId !== state.folderId ||
        dedupedSelected.length !== state.selectedIds.length ||
        dedupedSelected.some((id, index) => id !== state.selectedIds[index])
      const lastRequest = requestContextChanged
        ? undefined
        : reconcileRequest(state.lastRequest, next.requestActions, next.items, next.folders)
      set({
        ownerId: next.ownerId,
        variant: next.variant,
        fixtureId: next.fixtureId,
        items: nextItems,
        folders: next.folders,
        requestActions: next.requestActions,
        folderId,
        focusedId,
        selectedIds: dedupedSelected,
        expandedIds,
        starredIds: dedupedStarred,
        menuId,
        removedIds,
        uploadsById,
        lastRequest,
      })
      return true
    },
    request(ownerId, request) {
      const state = get()
      if (!owns(state, ownerId) || !allowsCurrentRequest(state, request) || sameRequest(state.lastRequest, request))
        return false
      set({
        lastRequest:
          request.value === undefined
            ? { actionId: request.actionId }
            : { actionId: request.actionId, value: request.value },
      })
      return true
    },
  }))
}
