import { z } from 'zod'
import { defineCommand, type CommandMetadataInput } from '@hbar/commands/protocol'
import { idSchema, terminalContributionSchema } from '../index'

export const pluginInfoSchema = z.object({
  id: idSchema,
  packageName: z.string().optional(),
  name: z.string(),
  version: z.string(),
  required: z.boolean(),
  status: z.enum(['active', 'disabled', 'failed']),
  provides: z.array(z.string()),
  requires: z.array(z.string()),
  description: z.string(),
  config: z.record(z.string(), z.unknown()),
  installScope: z.enum(['global', 'project']).optional(),
  runtimeScope: z.enum(['host', 'workspace', 'session', 'run', 'client']).optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  peerDependencies: z.record(z.string(), z.string()).optional(),
  optionalDependencies: z.record(z.string(), z.string()).optional(),
  activationEvents: z.array(z.string()).optional(),
  contributes: z
    .strictObject({
      commands: z.array(terminalContributionSchema),
      panels: z.array(z.record(z.string(), z.unknown())),
      renderers: z.array(z.record(z.string(), z.unknown())),
    })
    .optional(),
  terminalCommands: z.array(terminalContributionSchema).optional(),
  path: z.string().optional(),
  projectId: z.string().optional(),
  error: z.string().optional(),
  clientEntry: z.string().optional(),
})
const pluginsSchema = z.array(pluginInfoSchema).max(4_096)
const graphSchema = z.strictObject({
  nodes: z.array(z.strictObject({ id: idSchema, version: z.string(), enabled: z.boolean() })).max(4_096),
  edges: z
    .array(
      z.strictObject({
        from: idSchema,
        to: idSchema,
        kind: z.string().min(1).max(64),
        range: z.string(),
      }),
    )
    .max(32_768),
})
const resolveSchema = z.strictObject({ order: z.array(idSchema).max(4_096), enabled: z.array(idSchema).max(4_096) })
const doctorSchema = z.strictObject({
  ok: z.boolean(),
  errors: z.array(z.string().max(4_000)).max(4_096),
  order: z.array(idSchema).max(4_096).optional(),
})
const lockSchema = z.strictObject({ version: z.literal(1), plugins: z.record(z.string(), z.unknown()) })
const skillSchema = z.strictObject({
  id: idSchema,
  path: z.string().min(1).max(4_000),
  scope: z.literal('global'),
})

function metadata(id: string, kind: 'command' | 'query', effect: 'none' | 'external'): CommandMetadataInput {
  return {
    id,
    version: 1,
    owner: 'hbar.extensions',
    kind,
    execution: 'host',
    stateEffect: effect,
    category: 'system.extensions',
    scope: 'global',
    titleKey: `commands.${id}.title`,
    descriptionKey: `commands.${id}.description`,
    surfaces: ['cli', 'tui', 'api', 'palette'],
  }
}

const idArgument = { field: 'id', type: 'string' as const, position: 0 }
export const extensionCommands = {
  'plugin.list': defineCommand(metadata('plugin.list', 'query', 'none'), z.strictObject({}), pluginsSchema),
  'plugin.inspect': defineCommand(
    { ...metadata('plugin.inspect', 'query', 'none'), cli: { arguments: [idArgument] } },
    z.strictObject({ id: idSchema }),
    pluginInfoSchema.nullable(),
  ),
  'plugin.set': defineCommand(
    metadata('plugin.set', 'command', 'external'),
    z.strictObject({
      id: idSchema,
      enabled: z.boolean(),
      config: z.record(z.string(), z.unknown()).optional(),
    }),
    pluginsSchema,
  ),
  'plugin.install': defineCommand(
    {
      ...metadata('plugin.install', 'command', 'external'),
      cli: {
        arguments: [
          { field: 'path', type: 'string', position: 0 },
          { field: 'projectId', type: 'string', flag: 'workspace' },
        ],
      },
    },
    z.strictObject({ path: z.string().min(1).max(4_000), projectId: idSchema.optional() }),
    pluginsSchema,
  ),
  'plugin.scan': defineCommand(metadata('plugin.scan', 'query', 'none'), z.strictObject({}), pluginsSchema),
  'plugin.remove': defineCommand(
    { ...metadata('plugin.remove', 'command', 'external'), cli: { arguments: [idArgument] } },
    z.strictObject({ id: idSchema }),
    pluginsSchema,
  ),
  'plugin.enable': defineCommand(
    { ...metadata('plugin.enable', 'command', 'external'), cli: { arguments: [idArgument] } },
    z.strictObject({ id: idSchema }),
    pluginsSchema,
  ),
  'plugin.disable': defineCommand(
    { ...metadata('plugin.disable', 'command', 'external'), cli: { arguments: [idArgument] } },
    z.strictObject({ id: idSchema }),
    pluginsSchema,
  ),
  'plugin.resolve': defineCommand(
    { ...metadata('plugin.resolve', 'query', 'none'), cli: { arguments: [idArgument] } },
    z.strictObject({ id: idSchema.optional() }),
    resolveSchema,
  ),
  'plugin.graph': defineCommand(metadata('plugin.graph', 'query', 'none'), z.strictObject({}), graphSchema),
  'plugin.lock': defineCommand(metadata('plugin.lock', 'query', 'none'), z.strictObject({}), lockSchema),
  'plugin.doctor': defineCommand(metadata('plugin.doctor', 'query', 'none'), z.strictObject({}), doctorSchema),
  'skill.list': defineCommand(
    metadata('skill.list', 'query', 'none'),
    z.strictObject({}),
    z.array(skillSchema).max(10_000),
  ),
}

export type SkillDescriptor = z.output<typeof skillSchema>
