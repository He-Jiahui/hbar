import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  LumenAppSidebarWorkflows,
  selectLumenAppSidebarItem,
  uniqueLumenAppSidebarItems,
  type LumenAppSidebarContent,
} from '@lumen/app-ui'
import {
  appSidebarFixtureParameter,
  appSidebarPreviewRequestActions,
  createAppSidebarPreviewContent,
  createAppSidebarPreviewSeed,
} from '../apps/hbar-app-ui-preview/src/appSidebarPreviewFixtures'
import { createAppSidebarPreviewCopy } from '../apps/hbar-app-ui-preview/src/appSidebarPreviewCopy'
import { createAppSidebarPreviewStore } from '../apps/hbar-app-ui-preview/src/appSidebarPreviewStore'
import { HBAR_APP_UI_APP_SIDEBAR_FIXTURES } from './fixtures/hbar-app-ui-app-sidebar-fixtures'

const render = (variant: number, content: LumenAppSidebarContent) =>
  renderToStaticMarkup(
    createElement(LumenAppSidebarWorkflows, { variant, variantId: `hbar-app-ui-app-sidebar-${variant}`, content }),
  )

describe('practical App Sidebar preview boundaries', () => {
  test('adds opt-in Host notice without changing default pane markup or destinations', () => {
    const content = createAppSidebarPreviewContent(HBAR_APP_UI_APP_SIDEBAR_FIXTURES, 7, null)
    const legacy = render(7, content)
    expect(legacy).not.toContain('lumen-app-sidebar-preview')
    expect(legacy).not.toContain('role="status"')
    const notice = createAppSidebarPreviewCopy(true).requestNotice
    const owned = render(7, { ...content, presentation: { ownerId: 'full-owner', notice } })
    expect(owned).toContain('class="lumen-app-sidebar-preview"')
    expect(owned).toContain('role="status"')
    expect(owned).toContain(notice)
    expect(owned).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(content.fullPreview?.groups.map((group) => group.items.length)).toEqual([2, 5, 3, 3])
    expect(content.fullPreview?.groups[0]?.items[0]?.href).toBe('#nav')
  })

  test('keeps public first-wins IDs exact while excluding blank selections', () => {
    const items = [
      { id: ' ', label: 'Invalid' },
      { id: ' exact ', label: 'First' },
      { id: ' exact ', label: 'Duplicate' },
    ]
    expect(uniqueLumenAppSidebarItems(items)).toEqual([items[1]!])
    expect(selectLumenAppSidebarItem(items, 'missing')).toBe(items[1])
    expect(selectLumenAppSidebarItem(items, ' exact ')).toBe(items[1])
    expect(selectLumenAppSidebarItem([items[0]!], ' ')).toBeUndefined()
  })

  test('retains all seven fixture keys and exposes only current variant request targets', () => {
    const fields = [
      'primary',
      'railPreview',
      'workspacePreview',
      'dualPreview',
      'treePreview',
      'drawerPreview',
      'fullPreview',
    ] as const
    const keys = [
      'appSidebarFixture',
      'appSidebarRailFixture',
      'appSidebarWorkspaceFixture',
      'appSidebarDualFixture',
      'appSidebarTreeFixture',
      'appSidebarDrawerFixture',
      'appSidebarFullFixture',
    ]
    for (let variant = 1; variant <= 7; variant += 1) {
      expect(appSidebarFixtureParameter(variant)).toBe(keys[variant - 1])
      const content = createAppSidebarPreviewContent(HBAR_APP_UI_APP_SIDEBAR_FIXTURES, variant, null)
      expect(fields.filter((field) => content[field] !== undefined)).toEqual([fields[variant - 1]!])
      const seed = createAppSidebarPreviewSeed(content, variant, `owner-${variant}`)
      expect(seed.requestTargets.length).toBeGreaterThan(0)
      expect(
        seed.requestTargets.every((target) => appSidebarPreviewRequestActions(variant).includes(target.actionId)),
      ).toBe(true)
      expect(seed.workspaceIds.length > 0).toBe(variant === 3)
      expect(seed.sectionIds.length > 0).toBe(variant === 4)
    }
    expect(appSidebarFixtureParameter(0)).toBeUndefined()
    expect(appSidebarPreviewRequestActions(8)).toEqual([])
  })

  test('section changes invalidate stale page requests without inventing navigation or services', () => {
    const first = createAppSidebarPreviewContent(HBAR_APP_UI_APP_SIDEBAR_FIXTURES, 4, null)
    const store = createAppSidebarPreviewStore(createAppSidebarPreviewSeed(first, 4, 'dual-owner'))
    const stalePage = first.dualPreview!.sections[0]!.groups[0]!.items[0]!.id
    expect(store.getState().request('dual-owner', 'page', stalePage)).toBe(true)
    expect(store.getState().selectSection('dual-owner', 'projects')).toBe(true)
    const next = createAppSidebarPreviewContent(
      HBAR_APP_UI_APP_SIDEBAR_FIXTURES,
      4,
      null,
      null,
      store.getState().sectionId,
    )
    store.getState().reconcile(createAppSidebarPreviewSeed(next, 4, 'dual-owner'))
    expect(store.getState().intent).toBeNull()
    expect(store.getState().request('dual-owner', 'page', stalePage)).toBe(false)
    expect(store.getState().request('dual-owner', 'new', 'automations')).toBe(false)
    expect(store.getState().request('dual-owner', 'new', 'projects')).toBe(true)
    expect(next.dualPreview?.selectedSectionId).toBe('projects')
  })

  test('localized copy leaves exact targets intact, and tree mutation requests do not change documents', () => {
    const base = createAppSidebarPreviewContent(HBAR_APP_UI_APP_SIDEBAR_FIXTURES, 5, null)
    const localized = createAppSidebarPreviewContent(HBAR_APP_UI_APP_SIDEBAR_FIXTURES, 5, 'localized')
    const seed = createAppSidebarPreviewSeed(localized, 5, 'tree-owner')
    expect(seed.requestTargets).toEqual(createAppSidebarPreviewSeed(base, 5, 'tree-owner').requestTargets)
    const store = createAppSidebarPreviewStore(seed)
    const folder = localized.treePreview!.folders[0]!
    const documents = folder.documents
    expect(store.getState().request('tree-owner', 'duplicate', folder.id)).toBe(true)
    expect(folder.documents).toBe(documents)
    expect(store.getState().intent?.value).toBe(folder.id)
    expect(createAppSidebarPreviewCopy(true).requestNotice).not.toContain('Preview request')
    expect(createAppSidebarPreviewCopy(false).requestNotice).toContain('no external navigation')
    expect(seed.requestTargets.some((target) => ['search', 'folder'].includes(target.actionId))).toBe(false)
  })
})
