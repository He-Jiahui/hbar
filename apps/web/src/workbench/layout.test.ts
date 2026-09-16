import { Model } from 'flexlayout-react'
import { expect, test } from 'bun:test'
import { defaultLayout, restoreLayout, versionedLayout } from './layout'
import { navigationLayout, normalizeSidebarWidth } from './navigation-layout'

test('default layout is a valid, versioned workbench model', () => {
  const layout = defaultLayout()
  const model = Model.fromJson(layout)

  expect(model.getNodeById('main')).toBeDefined()
  expect(model.getNodeById('welcome')).toBeDefined()
  expect(model.getNodeById('border_right')).toBeDefined()
  expect(model.getNodeById('border_bottom')).toBeDefined()
  expect(model.getNodeById('browser')).toBeDefined()
  expect(model.getNodeById('activity')).toBeDefined()
  expect(model.getNodeById('diagnose')).toBeDefined()
  expect(model.getNodeById('terminal')).toBeDefined()
})

test('malformed persisted layout falls back without creating an empty workbench', () => {
  const layout = restoreLayout({ schemaVersion: 999, layout: { type: 'row', children: [] } })

  expect(layout.layout.type).toBe('row')
  expect(layout.layout.children?.length).toBeGreaterThan(0)
  expect(layout.layout.children?.[0]?.id).toBe('main')
})

test('valid persisted layout remains restorable', () => {
  const persisted = defaultLayout()
  const restored = restoreLayout(persisted)

  expect(restored.layout.id).toBe('root')
  expect(restored.layout.children?.map((child) => child.id)).toEqual(['main'])
})

test('legacy generated tool dock migrates to the explicit on-demand tool border', () => {
  const legacy = {
    schemaVersion: 1,
    global: { tabSetMinWidth: 230, tabSetMinHeight: 180 },
    layout: {
      type: 'row',
      id: 'root',
      children: [
        {
          type: 'tabset',
          id: 'main',
          children: [{ type: 'tab', id: 'welcome', name: '新会话', component: 'conversation' }],
        },
        {
          type: 'tabset',
          id: 'tools',
          children: [{ type: 'tab', id: 'activity', name: '运行', component: 'activity' }],
        },
      ],
    },
  }

  const restored = restoreLayout(legacy)

  expect(restored.layout.children?.map((child) => child.id)).toEqual(['main'])
  expect(restored.borders?.map((border) => border.location)).toEqual(['bottom', 'right'])
  expect(restored.borders?.every((border) => border.show === false)).toBe(true)
  expect(Model.fromJson(restored).getNodeById('welcome')).toBeDefined()
})

test('layout snapshots retain the current descriptor version when persisted', () => {
  const snapshot = versionedLayout(defaultLayout())

  expect(snapshot.schemaVersion).toBe(2)
  expect(restoreLayout(snapshot).layout.id).toBe('root')
})

test('unknown module types and incomplete file/plugin targets restore the default instead of rendering a broken pane', () => {
  for (const tab of [
    { type: 'tab', id: 'unsafe', component: 'arbitrary-module' },
    { type: 'tab', id: 'unsafe', component: 'file', config: { path: 'README.md' } },
    { type: 'tab', id: 'unsafe', component: 'plugin', config: {} },
  ]) {
    const restored = restoreLayout({
      schemaVersion: 2,
      layout: { type: 'row', id: 'root', children: [{ type: 'tabset', id: 'broken', children: [tab] }] },
    })
    expect(Model.fromJson(restored).getNodeById('welcome')).toBeDefined()
    expect(Model.fromJson(restored).getNodeById('unsafe')).toBeUndefined()
  }
})

test('duplicate IDs, invalid pane sizes and empty roots cannot restore an empty or invalid workbench', () => {
  const invalid = [
    { layout: { type: 'row', children: [] } },
    { layout: { type: 'row', id: 'same', children: [{ type: 'tabset', id: 'same', children: [] }] } },
    { layout: { type: 'row', children: [{ type: 'tabset', weight: -1, children: [] }] } },
    { layout: { type: 'row', children: [{ type: 'tabset', size: Number.NaN, children: [] }] } },
  ]
  for (const value of invalid) expect(Model.fromJson(restoreLayout(value)).getNodeById('welcome')).toBeDefined()
})

test('sidebar range and keyboard sizing use the same validated descriptor', () => {
  expect(normalizeSidebarWidth(undefined)).toBe(navigationLayout.sidebar.initial)
  expect(normalizeSidebarWidth(Number.NaN)).toBe(navigationLayout.sidebar.initial)
  expect(normalizeSidebarWidth(-1)).toBe(navigationLayout.sidebar.minimum)
  expect(normalizeSidebarWidth(Number.MAX_SAFE_INTEGER)).toBe(navigationLayout.sidebar.maximum)
})
