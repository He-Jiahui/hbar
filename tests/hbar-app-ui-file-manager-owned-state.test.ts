import { describe, expect, test } from 'bun:test'
import {
  createFileManagerPreviewStore,
  type FileManagerPreviewItemSeed,
  type FileManagerPreviewSeed,
} from '../apps/hbar-app-ui-preview/src/fileManagerPreviewModel'

function createSeed(overrides: Partial<FileManagerPreviewSeed> = {}): FileManagerPreviewSeed {
  return {
    ownerId: 'owner-a',
    variant: 1,
    fixtureId: 'fixture-a',
    items: [
      {
        id: 'image-a',
        name: 'Image A',
        kind: 'image',
        starred: true,
        selectedByDefault: true,
        upload: { state: 'uploading', progress: 97, sizeBytes: 1_000, remaining: 'soon' },
      },
      { id: 'file-b', name: 'File B', kind: 'document', upload: { state: 'queued', progress: 0, sizeBytes: 2_000 } },
      {
        id: 'failed-c',
        name: 'Failed C',
        kind: 'archive',
        upload: { state: 'failed', progress: 10, sizeBytes: 3_000 },
      },
      { id: 'folder-row', name: 'Folder row', kind: 'folder' },
      { id: 'image-a', name: 'Duplicate image', kind: 'video', starred: false },
      { id: '', name: 'Blank ID', kind: 'file' },
    ],
    folders: [
      { id: 'folder-root', expandable: true, expandedByDefault: true },
      { id: 'folder-child', parentId: 'folder-root', expandable: true },
      { id: 'folder-child', parentId: 'other' },
      { id: '', expandable: true },
    ],
    initialFolderId: 'folder-root',
    initialFocusedId: 'image-a',
    requestActions: [
      { actionId: 'open', value: 'image-a' },
      { actionId: 'share' },
      { actionId: 'share' },
      { actionId: 'open', value: 'image-a' },
      { actionId: '' },
    ],
    ...overrides,
  }
}

function uploadItem(id: string, sizeBytes = 100): FileManagerPreviewItemSeed {
  return { id, name: id, kind: 'image', upload: { state: 'queued', progress: 0, sizeBytes } }
}

describe('file-manager preview owned state', () => {
  test('normalizes source IDs first-wins and keeps state isolated by owner', () => {
    const store = createFileManagerPreviewStore(createSeed())
    const state = store.getState()

    expect(state.items.map(({ id }) => id)).toEqual(['image-a', 'file-b', 'failed-c', 'folder-row'])
    expect(state.items[0]).toMatchObject({ id: 'image-a', kind: 'image', starred: true })
    expect(state.folders.map(({ id }) => id)).toEqual(['folder-root', 'folder-child'])
    expect(state.requestActions).toEqual([{ actionId: 'open', value: 'image-a' }, { actionId: 'share' }])
    expect(state.folderId).toBe('folder-root')
    expect(state.focusedId).toBe('image-a')
    expect(state.selectedIds).toEqual(['image-a'])
    expect(state.expandedIds).toEqual(['folder-root'])
    expect(state.starredIds).toEqual(['image-a'])
    expect(state.uploadsById['image-a']).toMatchObject({ state: 'uploading', progress: 97 })

    const second = createFileManagerPreviewStore({ ...createSeed(), ownerId: 'owner-b', fixtureId: 'fixture-b' })
    expect(store.getState().setQuery('owner-b', 'wrong')).toBe(false)
    expect(store.getState().toggleSelection('owner-b', 'file-b')).toBe(false)
    expect(second.getState().setQuery('owner-b', 'owned')).toBe(true)
    expect(store.getState().query).toBe('')
    expect(second.getState().query).toBe('owned')
  })

  test('guards and owns browser controls, selection, focus, folders and requests', () => {
    const store = createFileManagerPreviewStore(createSeed())
    const state = store.getState()

    expect(state.setQuery('owner-a', 'brief')).toBe(true)
    expect(state.setLocation('owner-a', 'starred')).toBe(true)
    expect(state.setLocation('owner-a', 'unknown')).toBe(false)
    expect(state.setView('owner-a', 'grid')).toBe(true)
    expect(state.setSort('owner-a', 'size', true)).toBe(true)
    expect(state.setFilter('owner-a', 'images')).toBe(true)
    expect(state.toggleSelection('owner-a', 'file-b')).toBe(true)
    expect(state.selectVisible('owner-a', ['file-b', 'folder-row'], true)).toBe(true)
    expect(state.selectVisible('owner-a', ['missing'], true)).toBe(false)
    expect(state.clearSelection('owner-a')).toBe(true)
    expect(state.focus('owner-a', 'file-b')).toBe(true)
    expect(state.focus('owner-a', 'missing')).toBe(false)
    expect(state.toggleExpanded('owner-a', 'folder-child')).toBe(true)
    expect(state.toggleExpanded('owner-a', 'missing')).toBe(false)
    expect(state.toggleStar('owner-a', 'file-b')).toBe(true)
    expect(state.setMenu('owner-a', 'file-b')).toBe(true)
    expect(state.setMenu('owner-a', '')).toBe(true)
    expect(state.setOpen('owner-a', true)).toBe(true)
    expect(state.request('owner-a', { actionId: 'share' })).toBe(true)
    expect(store.getState().lastRequest).toEqual({ actionId: 'share' })
    expect(state.setQuery('owner-a', 'new brief')).toBe(true)
    expect(store.getState().lastRequest).toBeUndefined()
    expect(state.request('owner-a', { actionId: 'open', value: 'missing' })).toBe(false)
  })

  test('refreshes only the matching identity and preserves eligible local values', () => {
    const store = createFileManagerPreviewStore(createSeed())
    const state = store.getState()
    state.setQuery('owner-a', 'keep')
    state.setLocation('owner-a', 'recent')
    state.setView('owner-a', 'grid')
    state.setSort('owner-a', 'modified', true)
    state.setFilter('owner-a', 'documents')
    state.toggleSelection('owner-a', 'file-b')
    state.focus('owner-a', 'file-b')
    state.toggleExpanded('owner-a', 'folder-child')
    state.toggleExpanded('owner-a', 'folder-root')
    state.toggleStar('owner-a', 'file-b')
    state.setMenu('owner-a', 'file-b')
    state.request('owner-a', { actionId: 'share' })

    const sameIdentity: FileManagerPreviewSeed = {
      ...createSeed(),
      items: [
        { id: 'image-a', name: 'Image A refreshed', kind: 'image', starred: false, selectedByDefault: false },
        { id: 'file-b', name: 'File B refreshed', kind: 'document' },
        { id: 'new-d', name: 'New D', kind: 'document', starred: true, selectedByDefault: true },
      ],
      folders: [{ id: 'folder-root', expandable: true, expandedByDefault: false }],
      initialFolderId: 'folder-root',
      initialFocusedId: undefined,
      requestActions: [{ actionId: 'share' }],
    }
    expect(state.refresh(sameIdentity)).toBe(true)
    expect(store.getState().query).toBe('keep')
    expect(store.getState().locationId).toBe('recent')
    expect(store.getState().viewId).toBe('grid')
    expect(store.getState().sortId).toBe('modified')
    expect(store.getState().descending).toBe(true)
    expect(store.getState().filterId).toBe('documents')
    expect(store.getState().selectedIds).toEqual(['image-a', 'file-b', 'new-d'])
    expect(store.getState().focusedId).toBe('file-b')
    expect(store.getState().starredIds).toEqual(['image-a', 'file-b', 'new-d'])
    expect(store.getState().menuId).toBe('file-b')
    expect(store.getState().expandedIds).toEqual([])
    expect(store.getState().lastRequest).toBeUndefined()
    expect(store.getState().items.find((item) => item.id === 'image-a')?.name).toBe('Image A refreshed')

    const stale = {
      ...sameIdentity,
      items: [{ id: 'image-a', name: 'Only A', kind: 'image' }],
      folders: [],
      requestActions: [],
      initialFolderId: undefined,
      initialFocusedId: undefined,
    }
    expect(state.refresh(stale)).toBe(true)
    expect(store.getState().selectedIds).toEqual(['image-a'])
    expect(store.getState().focusedId).toBe('image-a')
    expect(store.getState().starredIds).toEqual(['image-a'])
    expect(store.getState().menuId).toBe('')
    expect(store.getState().expandedIds).toEqual([])
    expect(store.getState().folderId).toBe('root')
    expect(store.getState().lastRequest).toBeUndefined()

    const beforeMismatch = store.getState()
    expect(state.refresh({ ...stale, fixtureId: 'other-fixture' })).toBe(false)
    expect(store.getState().items).toEqual(beforeMismatch.items)
    expect(store.getState().query).toBe(beforeMismatch.query)
  })

  test('preserves an explicit empty root and focus fallback semantics', () => {
    const store = createFileManagerPreviewStore({
      ...createSeed(),
      initialFolderId: '',
      initialFocusedId: '',
    })
    expect(store.getState().folderId).toBe('')
    expect(store.getState().focusedId).toBe('')
    expect(store.getState().selectFolder('owner-a', '')).toBe(true)
    expect(store.getState().refresh({ ...createSeed(), initialFolderId: '', initialFocusedId: '' })).toBe(true)
    expect(store.getState().folderId).toBe('')
    expect(store.getState().focusedId).toBe('')
  })

  test('runs bounded local upload transitions and clears completed rows', () => {
    const store = createFileManagerPreviewStore({ ...createSeed(), variant: 4 })
    const state = store.getState()
    expect(state.open).toBe(true)
    expect(state.uploadAction('owner-a', 'image-a', 'pause')).toBe(true)
    expect(store.getState().uploadsById['image-a']?.state).toBe('paused')
    expect(state.advance('owner-a')).toBe(true)
    expect(store.getState().uploadsById['image-a']?.progress).toBe(97)
    expect(state.uploadAction('owner-a', 'image-a', 'start')).toBe(true)
    expect(state.advance('owner-a')).toBe(true)
    expect(store.getState().uploadsById['image-a']).toEqual({ state: 'uploaded', progress: 100, sizeBytes: 1_000 })
    expect(store.getState().uploadsById['file-b']?.state).toBe('queued')
    expect(state.uploadAction('owner-a', 'failed-c', 'retry')).toBe(true)
    expect(store.getState().uploadsById['failed-c']).toMatchObject({ state: 'uploading', progress: 0 })
    expect(state.advance('owner-a')).toBe(true)
    expect(store.getState().uploadsById['failed-c']?.progress).toBe(3)
    expect(state.cancelAll('owner-a')).toBe(true)
    expect(store.getState().uploadsById['file-b']?.state).toBe('cancelled')
    expect(store.getState().uploadsById['failed-c']?.state).toBe('cancelled')
    expect(store.getState().uploadsById['image-a']?.state).toBe('uploaded')
    expect(state.clearCompleted('owner-a')).toBe(true)
    expect(store.getState().removedIds).toContain('image-a')
    expect(state.uploadAction('owner-a', 'image-a', 'remove')).toBe(false)
    expect(state.uploadAction('owner-a', 'failed-c', 'remove')).toBe(true)
    expect(store.getState().removedIds).toEqual(['image-a', 'failed-c'])
  })

  test('accepts valid file metadata and rejects invalid picker batches without silent truncation', () => {
    const store = createFileManagerPreviewStore(createSeed())
    const state = store.getState()
    expect(state.addUploads('owner-a', [uploadItem('local-file')])).toBe(true)
    expect(store.getState().items.map(({ id }) => id)).toContain('local-file')
    expect(store.getState().uploadError).toBe('')
    expect(state.addUploads('owner-a', [uploadItem('local-file')])).toBe(false)
    expect(store.getState().uploadError).toBe('invalid-file')
    expect(state.addUploads('owner-a', [uploadItem('zero', 0)])).toBe(false)
    expect(state.addUploads('owner-a', [uploadItem('large', 2_000_000_001)])).toBe(false)
    expect(state.addUploads('owner-a', [{ ...uploadItem('blank-name'), name: ' ' }])).toBe(false)
    expect(
      state.addUploads(
        'owner-a',
        Array.from({ length: 81 }, (_, index) => uploadItem(`batch-${index}`)),
      ),
    ).toBe(false)
    expect(store.getState().items.some(({ id }) => id.startsWith('batch-'))).toBe(false)
  })

  test('accepts only exact request pairs, suppresses duplicates and invalidates on refresh or mutation', () => {
    const store = createFileManagerPreviewStore(createSeed())
    const state = store.getState()
    expect(state.request('owner-a', { actionId: 'open', value: 'image-a' })).toBe(true)
    expect(state.request('owner-a', { actionId: 'open', value: 'image-a' })).toBe(false)
    expect(state.request('owner-a', { actionId: 'open' })).toBe(false)
    expect(state.request('owner-a', { actionId: 'open', value: 'file-b' })).toBe(false)
    expect(state.request('owner-b', { actionId: 'share' })).toBe(false)
    expect(state.setOpen('owner-a', true)).toBe(true)
    expect(store.getState().lastRequest).toBeUndefined()
    expect(state.request('owner-a', { actionId: 'share' })).toBe(true)
    expect(
      state.refresh({
        ...createSeed(),
        requestActions: [{ actionId: 'open', value: 'image-a' }],
      }),
    ).toBe(true)
    expect(store.getState().lastRequest).toBeUndefined()

    const targetStore = createFileManagerPreviewStore(createSeed())
    expect(targetStore.getState().request('owner-a', { actionId: 'open', value: 'image-a' })).toBe(true)
    expect(
      targetStore.getState().refresh({
        ...createSeed(),
        items: createSeed().items.filter((item) => item.id !== 'image-a'),
        requestActions: [{ actionId: 'open', value: 'image-a' }],
      }),
    ).toBe(true)
    expect(targetStore.getState().lastRequest).toBeUndefined()
    const batchStore = createFileManagerPreviewStore(createSeed())
    expect(batchStore.getState().request('owner-a', { actionId: 'share' })).toBe(true)
    expect(
      batchStore
        .getState()
        .refresh({ ...createSeed(), items: createSeed().items.filter(({ id }) => id !== 'image-a') }),
    ).toBe(true)
    expect(batchStore.getState().lastRequest).toBeUndefined()
  })
})
