import { expect, test } from 'bun:test'
import { normalizeShellLayout, shellLayout, shellLayoutModule } from '../apps/web/src/shell-layout'

test('Web shell layout v2 describes one ordered module per workbench outlet', () => {
  expect(shellLayout.schemaVersion).toBe(2)
  expect(shellLayout.modules.map((module) => [module.moduleId, module.outlet, module.region, module.order])).toEqual([
    ['projects', 'sidebar', 'left', 0],
    ['workspace', 'page', 'center', 1],
    ['session-tool', 'tool', 'right', 2],
  ])
  expect(shellLayoutModule(shellLayout, 'projects').size).toEqual({ minRem: 12, preferredRem: 17, maxRem: 24 })
  expect(shellLayoutModule(shellLayout, 'session-tool').size).toEqual({ minRem: 20, preferredRem: 24, maxRem: 36 })
})

test('Web shell layout migrates sidebar v1 without inventing saved tool state', () => {
  const migrated = normalizeShellLayout({
    schemaVersion: 1,
    id: 'app',
    type: 'app-shell',
    sidebar: { id: 'projects', region: 'left', visible: false, widthRem: 20 },
  })
  expect(migrated.schemaVersion).toBe(2)
  expect(shellLayoutModule(migrated, 'projects')).toMatchObject({
    visible: false,
    size: { minRem: 12, preferredRem: 20, maxRem: 24 },
  })
  expect(shellLayoutModule(migrated, 'session-tool')).toEqual(shellLayoutModule(shellLayout, 'session-tool'))
})

test('Web shell layout rejects unknown, duplicate, missing, and out-of-range modules', () => {
  const unknown = structuredClone(shellLayout) as unknown as { modules: { moduleId: string }[] }
  unknown.modules[0]!.moduleId = 'unknown'
  expect(() => normalizeShellLayout(unknown as never)).toThrow()

  const duplicate = structuredClone(shellLayout)
  duplicate.modules[1] = structuredClone(duplicate.modules[0]!) as (typeof duplicate.modules)[number]
  expect(() => normalizeShellLayout(duplicate)).toThrow()

  const missing = structuredClone(shellLayout)
  missing.modules.pop()
  expect(() => normalizeShellLayout(missing)).toThrow()

  const oversized = structuredClone(shellLayout)
  const tool = oversized.modules.find((module) => module.moduleId === 'session-tool')!
  if ('preferredRem' in tool.size) tool.size.preferredRem = 80
  expect(() => normalizeShellLayout(oversized)).toThrow()
})
