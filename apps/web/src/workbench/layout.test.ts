import { Model, TabNode } from 'flexlayout-react'
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
  expect(model.getNodeById('diagnose')).toBeDefined()
  const terminal = model.getNodeById('terminal')
  expect(terminal).toBeInstanceOf(TabNode)
  expect((terminal as TabNode).getName()).toBe('命令控制台')
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

test('persisted command panel labels migrate without resetting the layout', () => {
  const persisted = versionedLayout(defaultLayout())
  const terminal = persisted.borders?.flatMap((border) => border.children ?? []).find((node) => node.id === 'terminal')
  if (!terminal) throw new Error('default layout does not contain the command panel')
  terminal.name = '终端'

  const restored = Model.fromJson(restoreLayout(persisted))

  expect((restored.getNodeById('terminal') as TabNode).getName()).toBe('命令控制台')
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
