import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenFileManager } from '@lumen/app-ui/catalog'
import { createFileManagerPreviewStore } from '../apps/hbar-app-ui-preview/src/fileManagerPreviewModel'
import {
  createFileManagerPreviewSeed,
  projectFileManagerPreview,
} from '../apps/hbar-app-ui-preview/src/fileManagerPreviewProjection'
import { createFileManagerPreviewReferenceContent } from '../apps/hbar-app-ui-preview/src/fileManagerPreviewReferenceFixtures'

function setup(variant: number, mode = 'default') {
  const input = createFileManagerPreviewReferenceContent(variant, mode)
  const store = createFileManagerPreviewStore(
    createFileManagerPreviewSeed(input, variant, `file-manager-${variant}-${mode}`, mode),
  )
  const reports: { readonly actionId: string; readonly value?: string | undefined }[] = []
  const project = () => {
    const content = projectFileManagerPreview(input, store, (event) => reports.push(event)).reference
    if (!content) throw new Error('Expected file reference')
    return content
  }
  const render = () =>
    renderToStaticMarkup(
      createElement(LumenFileManager, {
        variant,
        variantId: `file-manager-${variant}`,
        content: { reference: project() },
      }),
    )
  return { input, store, project, render, reports }
}
test('four file structures retain actual source records and controlled default selection', () => {
  const owners = [1, 2, 3, 4].map((variant) => setup(variant))
  expect(owners.map(({ project }) => project().kind)).toEqual(['drive', 'assets', 'detail', 'upload'])
  owners.forEach((owner, index) => {
    expect(owner.render()).toContain(`data-reference-kind="${owner.project().kind}"`)
    expect(owner.render()).toContain(`data-lumen-variant="${index + 1}"`)
  })
  const assets = owners[1]?.project()
  if (assets?.kind !== 'assets') throw new Error('Expected assets')
  expect(assets.selectedIds).toEqual(['hero-a', 'teaser'])
  expect(assets.content.assets.map(({ name }) => name)).toContain('storyboard-v4.pdf')
  expect(assets.content.assets.find(({ id }) => id === 'hero-b')?.size).toBe('3.9 MB')
  const detail = owners[2]?.project()
  if (detail?.kind !== 'detail') throw new Error('Expected detail')
  expect(detail.content.items.find(({ id }) => id === 'packaging-detail')?.size).toBe('9.8 MB')
})
test('drive search, current star state and size sorting derive visible rows and selections', () => {
  const owner = setup(1)
  owner.project().onChange('query', 'northwind')
  let content = owner.project()
  if (content.kind !== 'drive') throw new Error('Expected drive')
  expect(content.content.rows).toHaveLength(1)
  content.onAction('select-all')
  expect(owner.store.getState().selectedIds).toEqual(['northwind-key-visual'])
  content.onAction('star', 'northwind-key-visual')
  owner.project().onChange('query', '')
  owner.project().onChange('location', 'starred')
  content = owner.project()
  if (content.kind !== 'drive') throw new Error('Expected drive')
  expect(content.content.rows).toHaveLength(4)
  content.onChange('sort', 'size')
  content = owner.project()
  if (content.kind !== 'drive') throw new Error('Expected drive')
  expect(content.content.rows.map(({ id }) => id)[0]).toBe('studio-plan')
  content.onChange('view', 'grid')
  expect(owner.render()).toContain('is-grid')
  content.onAction('expand', 'client')
  expect(owner.store.getState().expandedIds).not.toContain('client')
  content.onAction('folder', 'client')
  expect(owner.project().available).toBe(false)
  owner.project().onAction('folder', 'my-drive')
  expect(owner.project().available).toBe(true)
})
test('assets filter and reversed sort preserve hidden selections and report exact batch IDs', () => {
  const owner = setup(2)
  owner.project().onChange('filter', 'images')
  let content = owner.project()
  if (content.kind !== 'assets') throw new Error('Expected assets')
  expect(content.content.assets).toHaveLength(3)
  expect(content.selectedIds).toEqual(['hero-a', 'teaser'])
  content.onAction('share')
  expect(owner.reports).toEqual([{ actionId: 'share', value: '["hero-a","teaser"]' }])
  expect(content.content.assets[0]?.id).toBe('billboard')
  owner.project().onChange('sort', 'name')
  content = owner.project()
  if (content.kind !== 'assets') throw new Error('Expected assets')
  expect(content.content.assets[0]?.id).toBe('hero-b')
  const stale = content
  content.onChange('filter', 'documents')
  stale.onAction('select', 'hero-b')
  expect(owner.store.getState().selectedIds).toEqual(['hero-a', 'teaser'])
  owner.project().onAction('clear-selection')
  expect(owner.render()).not.toContain('lumen-file-manager-reference-selection-footer')
  owner.project().onAction('folder', 'key-art')
  content = owner.project()
  if (content.kind !== 'assets') throw new Error('Expected assets')
  expect(content.content.assets.map(({ id }) => id)).toEqual(['hero-b', 'hero-a', 'brief'])
  expect(content.selectedIds).toEqual([])
  content.onAction('breadcrumb', 'assets')
  content = owner.project()
  if (content.kind !== 'assets') throw new Error('Expected assets')
  expect(content.content.assets).toHaveLength(8)
})
test('detail selection never reuses original metadata and rejects stale active request targets', () => {
  const owner = setup(3)
  const stale = owner.project()
  stale.onAction('focus', 'guidelines')
  const current = owner.project()
  if (current.kind !== 'detail') throw new Error('Expected detail')
  expect(current.content.activeItemId).toBe('guidelines')
  expect(current.detailAvailable).toBe(false)
  expect(owner.render()).not.toContain('4000 × 2500')
  stale.onAction('download', 'northwind-visual')
  expect(owner.reports).toEqual([])
  current.onAction('download', 'guidelines')
  expect(owner.reports).toEqual([{ actionId: 'download', value: 'guidelines' }])
  current.onAction('focus', 'northwind-visual')
  expect(owner.render()).toContain('4000 × 2500')
})
test('upload pause/start/retry and clear/cancel recompute local statuses and finite totals', () => {
  const owner = setup(4)
  owner.project().onAction('pause', 'sizzle')
  let content = owner.project()
  if (content.kind !== 'upload') throw new Error('Expected upload')
  expect(content.items.find(({ id }) => id === 'sizzle')?.state).toBe('paused')
  content.onAction('start', 'press-kit')
  content.onAction('retry', 'billboard-upload')
  owner.store.getState().advance(owner.store.getState().ownerId)
  content = owner.project()
  if (content.kind !== 'upload') throw new Error('Expected upload')
  expect(content.items.find(({ id }) => id === 'press-kit')?.progress).toBeGreaterThan(0)
  expect(content.items.find(({ id }) => id === 'billboard-upload')?.state).toBe('uploading')
  expect(content.items.find(({ id }) => id === 'billboard-upload')?.statusDetail).toBeUndefined()
  expect(content.content.labels.summary).toContain('2 of 5')
  content.onAction('clear-completed')
  content = owner.project()
  if (content.kind !== 'upload') throw new Error('Expected upload')
  expect(content.items).toHaveLength(3)
  expect(content.content.labels.summary).toContain('0 of 3')
  content.onAction('cancel-all')
  content = owner.project()
  if (content.kind !== 'upload') throw new Error('Expected upload')
  expect(content.items.every(({ state }) => state === 'cancelled')).toBe(true)
  content.onAction('dismiss')
  expect(owner.render()).toContain('Reopen uploader')
  owner.project().onAction('reopen')
  expect(owner.render()).toContain('Upload to Spring Campaign')
})
test('native file metadata enqueue stays local, validates capacity and can recover after failure', () => {
  const owner = setup(4)
  let content = owner.project()
  if (content.kind !== 'upload') throw new Error('Expected upload')
  content.onFiles([{ name: 'new-art.png', size: 10000, type: 'image/png' }])
  content = owner.project()
  if (content.kind !== 'upload') throw new Error('Expected upload')
  expect(content.items).toHaveLength(6)
  expect(content.items.at(-1)?.state).toBe('queued')
  content.onFiles([{ name: 'too-large.zip', size: 2100000000, type: 'application/zip' }])
  expect(owner.store.getState().uploadError).toBe('invalid-file')
  content.onFiles([{ name: 'recovery.pdf', size: 1000, type: 'application/pdf' }])
  expect(owner.store.getState().uploadError).toBe('')
  expect(owner.reports).toEqual([])
})
test('all four host capacity fixtures keep empty, one, boundary and overflow data visible', () => {
  for (const variant of [1, 2, 3, 4]) {
    for (const [mode, count] of [
      ['empty', 0],
      ['one', 1],
      ['boundary', 80],
      ['overflow', 81],
    ] as const) {
      const reference = setup(variant, mode).project()
      const rows =
        reference.kind === 'drive'
          ? reference.content.rows
          : reference.kind === 'assets'
            ? reference.content.assets
            : reference.kind === 'detail'
              ? reference.content.items
              : reference.items
      expect(rows).toHaveLength(count)
    }
    expect(setup(variant, 'localized').render()).toContain('较长项目名称下的浏览、选择和本地队列')
  }
})
