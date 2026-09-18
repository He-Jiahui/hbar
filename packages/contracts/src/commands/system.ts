import { z } from 'zod'
import { defineCommand, type CommandMetadataInput } from '@hbar/commands/protocol'
import { idSchema, PAIRING_CODE_LENGTH } from '../index'

export const hostInfoSchema = z.strictObject({
  version: z.string().min(1).max(64),
  protocol: z.number().int().positive(),
  instanceId: idSchema,
  platform: z.string().min(1).max(64),
  addresses: z.array(z.string().min(1).max(4_000)).max(256),
  activeRuns: z.number().int().nonnegative(),
  demo: z.boolean(),
})
export const systemPathsSchema = z.strictObject({
  dataRoot: z.string().min(1).max(4_000),
  cacheRoot: z.string().min(1).max(4_000),
  database: z.string().min(1).max(4_000),
  sessions: z.string().min(1).max(4_000),
  skills: z.string().min(1).max(4_000),
  plugins: z.string().min(1).max(4_000),
  diagnostics: z.string().min(1).max(4_000),
  settings: z.string().min(1).max(4_000),
  artifacts: z.string().min(1).max(4_000),
  pointerFile: z.string().min(1).max(4_000),
  cacheBytes: z.number().int().nonnegative(),
  restartRequired: z.boolean(),
})
const rootsSchema = z.strictObject({
  dataRoot: z.string().min(1).max(4_000),
  cacheRoot: z.string().min(1).max(4_000),
})
const validatedRootsSchema = rootsSchema.extend({ valid: z.literal(true) })
const deviceSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1).max(160),
  createdAt: z.number().int().nonnegative(),
  lastSeenAt: z.number().int().nonnegative(),
})
const pluginInfoSchema = z.object({
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
  contributes: z.unknown().optional(),
  terminalCommands: z.array(z.unknown()).optional(),
  path: z.string().optional(),
  projectId: z.string().optional(),
  error: z.string().optional(),
  clientEntry: z.string().optional(),
})
const diagnoseSchema = z.strictObject({
  host: hostInfoSchema,
  database: z.record(z.string(), z.number()),
  recoveredRuns: z.number().int().nonnegative(),
  plugins: z.array(pluginInfoSchema).max(4_096),
  tools: z.array(z.string().min(1).max(256)).max(4_096),
  streams: z.number().int().nonnegative(),
})

function metadata(
  id: string,
  kind: 'command' | 'query',
  effect: 'none' | 'application' | 'persistent',
): CommandMetadataInput {
  return {
    id,
    version: 1,
    owner: 'hbar.system',
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

const rootsCli = {
  arguments: [
    { field: 'dataRoot', type: 'string' as const, position: 0 },
    { field: 'cacheRoot', type: 'string' as const, position: 1 },
  ],
}

export const systemCommands = {
  'system.diagnose': defineCommand(metadata('system.diagnose', 'query', 'none'), z.strictObject({}), diagnoseSchema),
  'system.paths.get': defineCommand(metadata('system.paths.get', 'query', 'none'), z.strictObject({}), systemPathsSchema),
  'system.paths.validate': defineCommand(
    { ...metadata('system.paths.validate', 'command', 'persistent'), cli: rootsCli },
    rootsSchema,
    validatedRootsSchema,
  ),
  'system.paths.set': defineCommand(
    { ...metadata('system.paths.set', 'command', 'persistent'), cli: rootsCli },
    rootsSchema,
    systemPathsSchema,
  ),
  'system.restart': defineCommand(
    { ...metadata('system.restart', 'command', 'application'), visibility: 'advanced' },
    z.strictObject({}),
    z.strictObject({ accepted: z.boolean(), restartRequired: z.boolean() }),
  ),
  'device.list': defineCommand(metadata('device.list', 'query', 'none'), z.strictObject({}), z.array(deviceSchema).max(10_000)),
  'device.revoke': defineCommand(
    {
      ...metadata('device.revoke', 'command', 'persistent'),
      cli: { arguments: [{ field: 'id', type: 'string', position: 0 }] },
    },
    z.strictObject({ id: idSchema }),
    z.strictObject({ revoked: z.boolean() }),
  ),
  'pairing.create': defineCommand(
    metadata('pairing.create', 'command', 'persistent'),
    z.strictObject({}),
    z.strictObject({
      code: z.string().length(PAIRING_CODE_LENGTH).regex(/^\d+$/),
      expiresAt: z.number().int().positive(),
    }),
  ),
}
