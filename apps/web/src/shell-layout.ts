import { z } from 'zod'
import type { ClientJsonObject } from '@hbar/app-runtime'
import type { HbarFlexLayoutGeometry } from '@hbar/app-react'
import type { IJsonModel } from 'flexlayout-react'
import description from './shell-layout.json'

const projectsModuleSchema = z.strictObject({
  moduleId: z.literal('projects'),
  outlet: z.literal('sidebar'),
  region: z.literal('left'),
  order: z.literal(0),
  visible: z.boolean(),
  size: z.strictObject({
    minRem: z.literal(12),
    preferredRem: z.number().min(12).max(24),
    maxRem: z.literal(24),
    collapsedRem: z.literal(4.5).default(4.5),
  }),
  config: z.strictObject({ narrowPresentation: z.literal('drawer') }),
})

const workspaceModuleSchema = z.strictObject({
  moduleId: z.literal('workspace'),
  outlet: z.literal('page'),
  region: z.literal('center'),
  order: z.literal(1),
  visible: z.boolean(),
  size: z.strictObject({ minRem: z.literal(20), grow: z.literal(1) }),
  config: z.strictObject({
    narrowPresentation: z.literal('page'),
    tabs: z
      .strictObject({
        visible: z.literal(true),
        placement: z.literal('before-content'),
        maxOpen: z.literal(32),
      })
      .default({ visible: true, placement: 'before-content', maxOpen: 32 }),
  }),
})

const toolModuleSchema = z.strictObject({
  moduleId: z.literal('session-tool'),
  outlet: z.literal('tool'),
  region: z.literal('right'),
  order: z.literal(2),
  visible: z.boolean(),
  size: z.strictObject({
    minRem: z.literal(20),
    preferredRem: z.number().min(20).max(36),
    maxRem: z.literal(36),
  }),
  config: z.strictObject({
    mediumPresentation: z.literal('drawer'),
    narrowPresentation: z.literal('page'),
  }),
})

const moduleSchema = z.discriminatedUnion('moduleId', [projectsModuleSchema, workspaceModuleSchema, toolModuleSchema])

const shellLayoutV2Schema = z
  .strictObject({
    schemaVersion: z.literal(2),
    id: z.literal('app'),
    type: z.literal('app-shell'),
    modules: z.array(moduleSchema).length(3),
  })
  .superRefine((value, context) => {
    for (const id of ['projects', 'workspace', 'session-tool'] as const)
      if (value.modules.filter((module) => module.moduleId === id).length !== 1)
        context.addIssue({ code: 'custom', path: ['modules'], message: `Expected one ${id} module` })
  })

const adaptiveToolModuleSchema = toolModuleSchema.extend({
  config: z.strictObject({ constrainedPresentation: z.literal('page'), resizable: z.boolean() }),
})
const shellLayoutV3Schema = z
  .strictObject({
    schemaVersion: z.literal(3),
    id: z.literal('app'),
    type: z.literal('app-shell'),
    modules: z
      .array(z.discriminatedUnion('moduleId', [projectsModuleSchema, workspaceModuleSchema, adaptiveToolModuleSchema]))
      .length(3),
  })
  .superRefine((value, context) => {
    for (const id of ['projects', 'workspace', 'session-tool'] as const)
      if (value.modules.filter((module) => module.moduleId === id).length !== 1)
        context.addIssue({ code: 'custom', path: ['modules'], message: `Expected one ${id} module` })
  })

const shellLayoutV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  id: z.literal('app'),
  type: z.literal('app-shell'),
  sidebar: z.strictObject({
    id: z.literal('projects'),
    region: z.literal('left'),
    visible: z.boolean(),
    widthRem: z.number().min(12).max(24),
  }),
})

export type ShellLayoutDescription = z.output<typeof shellLayoutV3Schema>
export type ShellLayoutModule = ShellLayoutDescription['modules'][number]
export type ShellLayoutModuleId = ShellLayoutModule['moduleId']

function migrateV1(value: z.output<typeof shellLayoutV1Schema>): ShellLayoutDescription {
  const next = structuredClone(shellLayoutV3Schema.parse(description))
  const projects = next.modules.find((module) => module.moduleId === 'projects')!
  projects.visible = value.sidebar.visible
  projects.size.preferredRem = value.sidebar.widthRem
  return next
}

export function normalizeShellLayout(value: ClientJsonObject): ShellLayoutDescription {
  if (value.schemaVersion === 1) return migrateV1(shellLayoutV1Schema.parse(value))
  if (value.schemaVersion === 2) {
    const old = shellLayoutV2Schema.parse(value)
    return shellLayoutV3Schema.parse({
      ...old,
      schemaVersion: 3,
      modules: old.modules.map((module) =>
        module.moduleId === 'session-tool'
          ? { ...module, config: { constrainedPresentation: 'page', resizable: true } }
          : module,
      ),
    })
  }
  return shellLayoutV3Schema.parse(value)
}

/** Change only this device's preferred tool width, preserving every other module choice. */
export function withToolPaneWidth(layout: ShellLayoutDescription, widthRem: number): ShellLayoutDescription {
  return withPaneWidth(layout, 'session-tool', widthRem)
}

/** The project/session sidebar shares the same versioned descriptor, not another preference key. */
export function withSidebarWidth(layout: ShellLayoutDescription, widthRem: number): ShellLayoutDescription {
  return withPaneWidth(layout, 'projects', widthRem)
}

function withPaneWidth(
  layout: ShellLayoutDescription,
  moduleId: 'projects' | 'session-tool',
  widthRem: number,
): ShellLayoutDescription {
  return shellLayoutV3Schema.parse({
    ...layout,
    modules: layout.modules.map((module) =>
      module.moduleId === moduleId ? { ...module, size: { ...module.size, preferredRem: widthRem } } : module,
    ),
  })
}

export function shellLayoutModule<ModuleId extends ShellLayoutModuleId>(
  layout: ShellLayoutDescription,
  moduleId: ModuleId,
): Extract<ShellLayoutModule, { moduleId: ModuleId }> {
  const module = layout.modules.find((candidate) => candidate.moduleId === moduleId)
  if (!module) throw new Error(`Missing shell layout module: ${moduleId}`)
  return module as Extract<ShellLayoutModule, { moduleId: ModuleId }>
}

export const shellLayout = shellLayoutV3Schema.parse(description)

/** Project the canonical descriptor into FlexLayout's model without creating a second source of truth. */
export function shellLayoutToFlexModel(
  layout: ShellLayoutDescription,
  projection: { geometry?: HbarFlexLayoutGeometry; sidebarVisible?: boolean; toolVisible?: boolean } = {},
): IJsonModel {
  const projects = shellLayoutModule(layout, 'projects')
  const workspace = shellLayoutModule(layout, 'workspace')
  const tool = shellLayoutModule(layout, 'session-tool')
  const sidebarVisible = projection.sidebarVisible ?? projects.visible
  const toolVisible = projection.toolVisible ?? tool.visible
  const { widthPx, remPx, splitterSizePx } = projection.geometry ?? {
    widthPx: (100 + projects.size.preferredRem + tool.size.preferredRem) * 16,
    remPx: 16,
    splitterSizePx: 8,
  }
  const splitterCount = Number(sidebarVisible) + Number(toolVisible)
  const widthRem = Math.max(workspace.size.minRem, (widthPx - splitterCount * splitterSizePx) / remPx)
  const sidebarWeight = sidebarVisible
    ? Math.min(
        projects.size.preferredRem,
        Math.max(projects.size.minRem, widthRem - workspace.size.minRem - (toolVisible ? tool.size.minRem : 0)),
      )
    : 0
  const toolWeight = toolVisible
    ? Math.min(tool.size.preferredRem, Math.max(tool.size.minRem, widthRem - workspace.size.minRem - sidebarWeight))
    : 0
  const mainWeight = Math.max(1, widthRem - sidebarWeight - toolWeight)
  return {
    global: {
      tabEnableClose: false,
      tabEnableDrag: false,
      tabEnableRename: false,
      tabSetEnableDrop: false,
      tabSetEnableDrag: false,
      tabSetEnableDivide: false,
      tabSetEnableTabStrip: false,
      tabSetEnableMaximize: false,
    },
    borders: [],
    layout: {
      type: 'row',
      weight: 100,
      children: [
        ...(sidebarVisible
          ? [
              {
                type: 'tabset' as const,
                id: projects.moduleId,
                weight: sidebarWeight,
                minWidth: projects.size.minRem * remPx,
                maxWidth: projects.size.maxRem * remPx,
                children: [
                  { type: 'tab' as const, id: 'projects-pane', name: projects.moduleId, component: projects.outlet },
                ],
              },
            ]
          : []),
        {
          type: 'tabset',
          id: workspace.moduleId,
          weight: mainWeight,
          minWidth: workspace.size.minRem * remPx,
          children: [{ type: 'tab', id: 'workspace-pane', name: workspace.moduleId, component: workspace.outlet }],
        },
        ...(toolVisible
          ? [
              {
                type: 'tabset' as const,
                id: tool.moduleId,
                weight: toolWeight,
                minWidth: tool.size.minRem * remPx,
                maxWidth: tool.size.maxRem * remPx,
                children: [
                  { type: 'tab' as const, id: 'session-tool-pane', name: tool.moduleId, component: tool.outlet },
                ],
              },
            ]
          : []),
      ],
    },
  }
}

/** Convert resize weights using the same content width that FlexLayout actually distributes. */
export function flexModelToShellLayout(
  layout: ShellLayoutDescription,
  model: IJsonModel,
  geometry: HbarFlexLayoutGeometry,
): ShellLayoutDescription {
  const children = model.layout?.type === 'row' ? model.layout.children : undefined
  if (
    !children?.length ||
    !children.some((node) => node.id === 'workspace') ||
    new Set(children.map((node) => node.id)).size !== children.length ||
    children.some(
      (node) =>
        node.type !== 'tabset' ||
        !layout.modules.some((module) => module.moduleId === node.id) ||
        typeof node.weight !== 'number' ||
        !Number.isFinite(node.weight) ||
        node.weight <= 0,
    ) ||
    ![geometry.widthPx, geometry.remPx, geometry.splitterSizePx].every(Number.isFinite) ||
    geometry.widthPx <= 0 ||
    geometry.remPx <= 0 ||
    geometry.splitterSizePx < 0
  )
    return layout
  const totalWeight = children.reduce((total, node) => total + (node.weight ?? 0), 0)
  const widthRem = (geometry.widthPx - (children.length - 1) * geometry.splitterSizePx) / geometry.remPx
  if (!Number.isFinite(totalWeight) || !Number.isFinite(widthRem) || widthRem <= 0) return layout
  const before =
    shellLayoutToFlexModel(layout, {
      geometry,
      sidebarVisible: children.some((node) => node.id === 'projects'),
      toolVisible: children.some((node) => node.id === 'session-tool'),
    }).layout.children ?? []
  const beforeTotal = before.reduce((total, node) => total + (node.weight ?? 0), 0)
  const weight = (id: ShellLayoutModuleId, fallback: number) => {
    const node = children?.find((child) => child.type === 'tabset' && child.id === id)
    if (
      typeof node?.weight !== 'number' ||
      !Number.isFinite(node.weight) ||
      node.weight <= 0 ||
      !Number.isFinite(widthRem) ||
      widthRem <= 0 ||
      totalWeight <= 0
    )
      return fallback
    const resizedWidth = (node.weight / totalWeight) * widthRem
    const beforeWeight = before.find((child) => child.id === id)?.weight
    // Preserve the other pane's preference, including a temporarily constrained width.
    if (
      beforeWeight !== undefined &&
      Math.abs(resizedWidth - (beforeWeight / beforeTotal) * widthRem) * geometry.remPx < 0.5
    )
      return fallback
    return resizedWidth
  }
  return shellLayoutV3Schema.parse({
    ...layout,
    modules: layout.modules.map((module) =>
      module.moduleId === 'projects' || module.moduleId === 'session-tool'
        ? {
            ...module,
            size: {
              ...module.size,
              preferredRem: Math.min(
                module.size.maxRem,
                Math.max(module.size.minRem, weight(module.moduleId, module.size.preferredRem)),
              ),
            },
          }
        : module,
    ),
  })
}
