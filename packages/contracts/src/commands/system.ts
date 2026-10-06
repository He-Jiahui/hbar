import { z } from 'zod'
import { defineCommand, type CommandMetadataInput } from '@hbar/commands/protocol'
import { idSchema, PAIRING_CODE_LENGTH } from '../index'
import { pluginInfoSchema } from './extensions'
import { storageLocationApplySchema, storageLocationSnapshotSchema } from './storage-locations'

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
const diagnoseSchema = z.strictObject({
  host: hostInfoSchema,
  database: z.record(z.string(), z.number()),
  recoveredRuns: z.number().int().nonnegative(),
  plugins: z.array(pluginInfoSchema).max(4_096),
  tools: z.array(z.string().min(1).max(256)).max(4_096),
  streams: z.number().int().nonnegative(),
})
export type SystemDiagnosis = z.infer<typeof diagnoseSchema>

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
  'system.storage.get': defineCommand(
    metadata('system.storage.get', 'query', 'none'),
    z.strictObject({}),
    storageLocationSnapshotSchema,
  ),
  'system.storage.apply': defineCommand(
    metadata('system.storage.apply', 'command', 'persistent'),
    storageLocationApplySchema,
    storageLocationSnapshotSchema,
  ),
  'system.diagnose': defineCommand(metadata('system.diagnose', 'query', 'none'), z.strictObject({}), diagnoseSchema),
  'system.paths.get': defineCommand(
    metadata('system.paths.get', 'query', 'none'),
    z.strictObject({}),
    systemPathsSchema,
  ),
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
  'device.list': defineCommand(
    metadata('device.list', 'query', 'none'),
    z.strictObject({}),
    z.array(deviceSchema).max(10_000),
  ),
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
