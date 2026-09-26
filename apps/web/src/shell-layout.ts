import { z } from 'zod'
import type { ClientJsonObject } from '@hbar/app-runtime'
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
