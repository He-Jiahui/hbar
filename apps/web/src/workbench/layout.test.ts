import { Model } from 'flexlayout-react'
import { expect, test } from 'bun:test'
import { defaultLayout, restoreLayout, versionedLayout } from './layout'

test('default layout is a valid, versioned workbench model', () => {
  const layout = defaultLayout()
  const model = Model.fromJson(layout)

  expect(model.getNodeById('main')).toBeDefined()
  expect(model.getNodeById('welcome')).toBeDefined()
  expect(model.getNodeById('border_right')).toBeDefined()
  expect(model.getNodeById('border_bottom')).toBeDefined()
  expect(model.getNodeById('browser')).toBeDefined()
  expect(model.getNodeById('activity')).toBeDefined()
  expect(model.getNodeById('diagnose-right')).toBeDefined()
  expect(model.getNodeById('terminal')).toBeUndefined()
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

test('version 2 command dock migrates into the conversation view', () => {
  const persisted = {
    ...versionedLayout(defaultLayout()),
    schemaVersion: 2,
    borders: [
      ...(defaultLayout().borders ?? []),
      {
        type: 'border' as const,
        location: 'bottom' as const,
        children: [
          { type: 'tab' as const, id: 'terminal', name: '终端', component: 'terminal' },
          { type: 'tab' as const, id: 'diagnose', name: '诊断', component: 'diagnose' },
        ],
      },
    ],
  }

  const restored = Model.fromJson(restoreLayout(persisted))

  expect(restored.getNodeById('terminal')).toBeUndefined()
  expect(restored.getNodeById('diagnose')).toBeUndefined()
  expect(restored.getNodeById('diagnose-right')).toBeDefined()
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
  expect(restored.borders?.map((border) => border.location)).toEqual(['right', 'bottom'])
  expect(restored.borders?.every((border) => border.show === false)).toBe(true)
  expect(Model.fromJson(restored).getNodeById('welcome')).toBeDefined()
})

test('layout snapshots retain the current descriptor version when persisted', () => {
  const snapshot = versionedLayout(defaultLayout())

  expect(snapshot.schemaVersion).toBe(3)
  expect(restoreLayout(snapshot).layout.id).toBe('root')
})
