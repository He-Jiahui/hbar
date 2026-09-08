import { Model } from 'flexlayout-react'
import { expect, test } from 'bun:test'
import { defaultLayout, restoreLayout } from './layout'

test('default layout is a valid, versioned workbench model', () => {
  const layout = defaultLayout()
  const model = Model.fromJson(layout)

  expect(model.getNodeById('main')).toBeDefined()
  expect(model.getNodeById('tools')).toBeDefined()
  expect(model.getNodeById('welcome')).toBeDefined()
  expect(model.getNodeById('activity')).toBeDefined()
  expect(model.getNodeById('diagnose')).toBeDefined()
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
  expect(restored.layout.children?.map((child) => child.id)).toEqual(['main', 'tools'])
})
