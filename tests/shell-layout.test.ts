import { expect, test } from 'bun:test'
import type { HbarFlexLayoutGeometry } from '@hbar/app-react'
import {
  flexModelToShellLayout,
  normalizeShellLayout,
  shellLayout,
  shellLayoutModule,
  shellLayoutToFlexModel,
  withToolPaneWidth,
} from '../apps/web/src/shell-layout'

const desktopGeometry: HbarFlexLayoutGeometry = { widthPx: 1598, remPx: 16, splitterSizePx: 8 }

test('converts a desktop resize to exact rem widths after subtracting the splitter space', () => {
  const model = shellLayoutToFlexModel(shellLayout, { geometry: desktopGeometry, toolVisible: true })
  const children = model.layout.children ?? []
  expect(children.map((child) => child.id)).toEqual(['projects', 'workspace', 'session-tool'])
  const changed = flexModelToShellLayout(
    shellLayout,
    {
      ...model,
      layout: {
        ...model.layout,
        children: children.map((child) =>
          child.id === 'session-tool'
            ? { ...child, weight: 31 }
            : child.id === 'workspace'
              ? { ...child, weight: (child.weight ?? 0) - 7 }
              : child,
        ),
      },
    },
    desktopGeometry,
  )
  expect(shellLayoutModule(changed, 'session-tool').size.preferredRem).toBeCloseTo(31, 10)
  expect(shellLayoutModule(changed, 'workspace').size.minRem).toBe(32)
})

test('malformed or incomplete rows cannot overwrite saved pane widths', () => {
  const model = shellLayoutToFlexModel(shellLayout, { geometry: desktopGeometry })
  const children = model.layout.children ?? []
  const recovered = flexModelToShellLayout(
    shellLayout,
    {
      ...model,
      layout: {
        ...model.layout,
        children: [
          ...(children[2] ? [{ ...children[2], weight: Number.NaN }] : []),
          ...(children[0] ? [{ ...children[0], weight: 19 }] : []),
        ],
      },
    },
    desktopGeometry,
  )
  expect(shellLayoutModule(recovered, 'projects').size.preferredRem).toBe(17)
  expect(shellLayoutModule(recovered, 'session-tool').size.preferredRem).toBe(24)
  expect(shellLayoutModule(recovered, 'workspace').size.minRem).toBe(32)
})

test('desktop projection applies the descriptor bounds in CSS pixels to all three panes', () => {
  for (const remPx of [16, 20]) {
    const model = shellLayoutToFlexModel(shellLayout, { geometry: { ...desktopGeometry, remPx }, toolVisible: true })
    expect(model.layout.children?.find((child) => child.id === 'projects')).toMatchObject({
      weight: 17,
      minWidth: 12 * remPx,
      maxWidth: 24 * remPx,
    })
    expect(model.layout.children?.find((child) => child.id === 'workspace')).toMatchObject({ minWidth: 32 * remPx })
    expect(model.layout.children?.find((child) => child.id === 'session-tool')).toMatchObject({
      weight: 24,
      minWidth: 20 * remPx,
      maxWidth: 36 * remPx,
    })
  }
})

test('desktop widths round-trip at both bounds, different rem sizes and pane visibility without drift', () => {
  for (const remPx of [16, 20]) {
    for (const sidebarVisible of [false, true]) {
      for (const toolVisible of [false, true]) {
        for (const sidebar of [12, 17, 24]) {
          for (const tool of [20, 24, 36]) {
            const layout = normalizeShellLayout({
              ...shellLayout,
              modules: shellLayout.modules.map((module) =>
                module.moduleId === 'projects'
                  ? { ...module, size: { ...module.size, preferredRem: sidebar } }
                  : module.moduleId === 'session-tool'
                    ? { ...module, size: { ...module.size, preferredRem: tool } }
                    : module,
              ),
            })
            const geometry = { widthPx: 2000, remPx, splitterSizePx: 8 }
            const model = shellLayoutToFlexModel(layout, { geometry, sidebarVisible, toolVisible })
            // Vendor resize weights are normalized percentages, never rem values.
            const children = model.layout.children ?? []
            const sum = children.reduce((total, child) => total + (child.weight ?? 0), 0)
            const resized = {
              ...model,
              layout: {
                ...model.layout,
                children: [...children]
                  .reverse()
                  .map((child) => ({ ...child, weight: ((child.weight ?? 0) * 100) / sum })),
              },
            }
            const next = flexModelToShellLayout(layout, resized, geometry)
            expect(shellLayoutModule(next, 'projects').size.preferredRem).toBeCloseTo(sidebar, 10)
            expect(shellLayoutModule(next, 'session-tool').size.preferredRem).toBeCloseTo(tool, 10)
          }
        }
      }
    }
  }
})

test('desktop projection reserves workspace capacity when preferred panes do not fit', () => {
  const layout = withToolPaneWidth(shellLayout, 36)
  const geometry = { widthPx: 1200, remPx: 16, splitterSizePx: 8 }
  const model = shellLayoutToFlexModel(layout, { geometry, toolVisible: true })
  const weights = (model.layout.children ?? []).map((child) => child.weight ?? 0)
  expect(weights.reduce((total, weight) => total + weight, 0) * geometry.remPx + 16).toBeCloseTo(1200)
  expect(weights[1]).toBeGreaterThanOrEqual(32)
  expect(weights[2]).toBeGreaterThanOrEqual(20)
  expect(shellLayoutModule(layout, 'session-tool').size.preferredRem).toBe(36)
})

test('invalid desktop measurements and weights retain the saved descriptor', () => {
  const model = shellLayoutToFlexModel(shellLayout, { geometry: desktopGeometry })
  for (const geometry of [
    { ...desktopGeometry, widthPx: Number.NaN },
    { ...desktopGeometry, remPx: 0 },
    { ...desktopGeometry, splitterSizePx: -1 },
  ])
    expect(flexModelToShellLayout(shellLayout, model, geometry)).toEqual(shellLayout)
  for (const weight of [Number.NaN, Number.POSITIVE_INFINITY, 0, -3]) {
    const malformed = {
      ...model,
      layout: {
        ...model.layout,
        children: (model.layout.children ?? []).map((child) =>
          child.id === 'workspace' ? { ...child, weight } : child,
        ),
      },
    }
    expect(flexModelToShellLayout(shellLayout, malformed, desktopGeometry)).toEqual(shellLayout)
  }
})

test('resizing one pane preserves the other saved preference when its visible width was constrained', () => {
  const layout = withToolPaneWidth(shellLayout, 36)
  const geometry = { widthPx: 1200, remPx: 16, splitterSizePx: 8 }
  const model = shellLayoutToFlexModel(layout, { geometry, toolVisible: true })
  const resized = {
    ...model,
    layout: {
      ...model.layout,
      children: (model.layout.children ?? []).map((child) =>
        child.id === 'projects'
          ? { ...child, weight: (child.weight ?? 0) - 1 }
          : child.id === 'workspace'
            ? { ...child, weight: (child.weight ?? 0) + 1 }
            : child,
      ),
    },
  }
  const next = flexModelToShellLayout(layout, resized, geometry)
  expect(shellLayoutModule(next, 'projects').size.preferredRem).toBeCloseTo(16, 10)
  expect(shellLayoutModule(next, 'session-tool').size.preferredRem).toBe(36)
})

test('Web shell layout v4 prioritizes reading and describes a constrained drawer', () => {
  expect(shellLayout.schemaVersion).toBe(4)
  expect(shellLayoutModule(shellLayout, 'session-tool').visible).toBe(false)
  expect(shellLayout.modules.map((module) => [module.moduleId, module.outlet, module.region, module.order])).toEqual([
    ['projects', 'sidebar', 'left', 0],
    ['workspace', 'page', 'center', 1],
    ['session-tool', 'tool', 'right', 2],
  ])
  expect(shellLayoutModule(shellLayout, 'projects').size).toEqual({
    minRem: 12,
    preferredRem: 17,
    maxRem: 24,
    collapsedRem: 4.5,
  })
  expect(shellLayoutModule(shellLayout, 'session-tool').size).toEqual({ minRem: 20, preferredRem: 24, maxRem: 36 })
  expect(shellLayoutModule(shellLayout, 'session-tool').config).toEqual({
    constrainedPresentation: 'drawer',
    resizable: true,
  })
  expect(shellLayoutModule(shellLayout, 'workspace').config.tabs).toEqual({
    visible: true,
    placement: 'before-content',
    maxOpen: 32,
  })
})

test('existing v3 layouts receive the semantic collapsed rail width without changing expanded preferences', () => {
  const legacy = {
    ...structuredClone(shellLayout),
    modules: shellLayout.modules.map((module) =>
      module.moduleId === 'projects'
        ? { ...module, visible: false, size: { minRem: 12, preferredRem: 19, maxRem: 24 } }
        : module,
    ),
  }
  const migrated = normalizeShellLayout(legacy)
  expect(shellLayoutModule(migrated, 'projects')).toMatchObject({
    visible: false,
    size: { preferredRem: 19, collapsedRem: 4.5 },
  })
  const invalid = {
    ...legacy,
    modules: legacy.modules.map((module) =>
      module.moduleId === 'projects' ? { ...module, size: { ...module.size, collapsedRem: 40 } } : module,
    ),
  }
  expect(() => normalizeShellLayout(invalid)).toThrow()
})

test('Web shell layout migrates sidebar v1 without inventing saved tool state', () => {
  const migrated = normalizeShellLayout({
    schemaVersion: 1,
    id: 'app',
    type: 'app-shell',
    sidebar: { id: 'projects', region: 'left', visible: false, widthRem: 20 },
  })
  expect(migrated.schemaVersion).toBe(4)
  expect(shellLayoutModule(migrated, 'projects')).toMatchObject({
    visible: false,
    size: { minRem: 12, preferredRem: 20, maxRem: 24 },
  })
  expect(shellLayoutModule(migrated, 'session-tool')).toEqual(shellLayoutModule(shellLayout, 'session-tool'))
  expect(shellLayoutModule(migrated, 'workspace').config.tabs).toEqual(
    shellLayoutModule(shellLayout, 'workspace').config.tabs,
  )
})

test('existing layouts fill the tabs region config without accepting arbitrary placement', () => {
  const existing = structuredClone(shellLayout)
  const module = existing.modules.find((item) => item.moduleId === 'workspace')!
  if (module.moduleId !== 'workspace') throw new Error('Expected workspace module')
  const old = { ...module, config: { narrowPresentation: 'page' } }
  existing.modules[1] = old as (typeof existing.modules)[number]
  expect(shellLayoutModule(normalizeShellLayout(existing), 'workspace').config.tabs).toEqual(
    shellLayoutModule(shellLayout, 'workspace').config.tabs,
  )

  const invalid = structuredClone(shellLayout)
  const invalidModule = invalid.modules.find((item) => item.moduleId === 'workspace')!
  if (invalidModule.moduleId !== 'workspace') throw new Error('Expected workspace module')
  invalidModule.config.tabs.placement = 'absolute' as 'before-content'
  expect(() => normalizeShellLayout(invalid)).toThrow()
})

test('legacy v2 drawer preference migrates without losing widths or visibility', () => {
  const legacy = {
    ...structuredClone(shellLayout),
    schemaVersion: 2,
    modules: shellLayout.modules.map((module) =>
      module.moduleId === 'session-tool'
        ? {
            ...module,
            size: { ...module.size, preferredRem: 31 },
            config: { mediumPresentation: 'drawer', narrowPresentation: 'page' },
          }
        : module.moduleId === 'projects'
          ? { ...module, visible: false, size: { ...module.size, preferredRem: 19 } }
          : { ...module, size: { ...module.size, minRem: 20 } },
    ),
  }
  const migrated = normalizeShellLayout(legacy)
  expect(migrated.schemaVersion).toBe(4)
  expect(shellLayoutModule(migrated, 'session-tool')).toMatchObject({
    size: { preferredRem: 31 },
    config: { constrainedPresentation: 'drawer', resizable: true },
  })
  expect(shellLayoutModule(migrated, 'projects')).toMatchObject({ visible: false, size: { preferredRem: 19 } })
  expect(legacy.schemaVersion).toBe(2)
  expect(() => normalizeShellLayout({ ...legacy, schemaVersion: 4 })).toThrow()
})

test('v3 migration preserves an open tool, resized widths and input descriptor without mutation', () => {
  const legacy = {
    ...structuredClone(shellLayout),
    schemaVersion: 3,
    modules: shellLayout.modules.map((module) =>
      module.moduleId === 'workspace'
        ? { ...module, size: { ...module.size, minRem: 20 } }
        : module.moduleId === 'session-tool'
          ? {
              ...module,
              visible: true,
              size: { ...module.size, preferredRem: 29 },
              config: { constrainedPresentation: 'page', resizable: false },
            }
          : module,
    ),
  }
  const migrated = normalizeShellLayout(legacy)
  expect(migrated.schemaVersion).toBe(4)
  expect(shellLayoutModule(migrated, 'session-tool')).toMatchObject({
    visible: true,
    size: { preferredRem: 29 },
    config: { constrainedPresentation: 'drawer', resizable: false },
  })
  expect(legacy.schemaVersion).toBe(3)
  expect(shellLayoutModule(migrated, 'workspace').size.minRem).toBe(32)
})

test('preferred tool width edits keep other layout choices and reject invalid capacity', () => {
  const original = structuredClone(shellLayout)
  for (const width of [20, 24, 35.5, 36]) {
    const next = withToolPaneWidth(original, width)
    expect(shellLayoutModule(next, 'session-tool').size.preferredRem).toBe(width)
    expect(shellLayoutModule(next, 'projects')).toEqual(shellLayoutModule(original, 'projects'))
    expect(shellLayoutModule(next, 'workspace')).toEqual(shellLayoutModule(original, 'workspace'))
  }
  for (const width of [19.99, 36.01, Number.NaN, Number.POSITIVE_INFINITY])
    expect(() => withToolPaneWidth(original, width)).toThrow()
  expect(original).toEqual(shellLayout)
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
