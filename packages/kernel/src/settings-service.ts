import { createHash, randomUUID } from 'node:crypto'
import { HbarError } from '@hbar/contracts'
import {
  applySettingsChanges,
  resolveSettings,
  SettingsError,
  type SettingDefinition,
  type SettingsChange,
  type SettingsResolution,
} from '@hbar/settings-core'
import type { SchemaPath } from '@hbar/schema-core'
import type { SettingsCommitReceipt, StoredSettingsLayer, StoragePort } from '@hbar/storage'

export const HBAR_SETTINGS_SCHEMA_VERSION = 1
const path = (name: string): SchemaPath => [{ kind: 'field', name }]
export const HBAR_SETTINGS_DEFINITIONS: readonly SettingDefinition[] = [
  {
    path: path('provider.model'),
    allowedLayers: ['global', 'workspace', 'session'],
    schema: { kind: 'string', nullable: true },
    defaultValue: null,
    applyMode: 'nextRun',
  },
  {
    path: path('provider.thinkingLevel'),
    allowedLayers: ['global', 'workspace', 'session'],
    schema: { kind: 'string', nullable: true, enum: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] },
    defaultValue: null,
    applyMode: 'nextRun',
  },
  {
    path: path('session.defaultBudget'),
    allowedLayers: ['global', 'workspace'],
    schema: { kind: 'integer', nullable: true, minimum: 1 },
    defaultValue: null,
    applyMode: 'nextRun',
  },
]

export type SettingsScope =
  | { readonly kind: 'global' }
  | { readonly kind: 'workspace'; readonly targetId: string }
  | { readonly kind: 'session'; readonly targetId: string }
export interface SettingsSnapshot {
  readonly schemaVersion: number
  readonly scope: SettingsScope
  readonly revisions: Readonly<Record<string, number>>
  readonly resolution: SettingsResolution
}
export interface ApplySettingsInput {
  readonly schemaVersion: number
  readonly scope: SettingsScope
  readonly changes: readonly SettingsChange[]
  readonly baselineRevisions: Readonly<Record<string, number>>
  readonly actorId: string
  readonly idempotencyKey: string
}
export interface ApplySettingsReceipt extends Omit<SettingsCommitReceipt, 'resolution'> {
  readonly resolution: SettingsResolution
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']'
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>
    return (
      '{' +
      Object.keys(object)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + stable(object[key]))
        .join(',') +
      '}'
    )
  }
  return JSON.stringify(value)
}
function translate(error: unknown): never {
  if (error instanceof SettingsError) throw new HbarError(error.code, error.message)
  throw error
}

export class SettingsService {
  constructor(private readonly storage: StoragePort) {}

  private async chain(scope: SettingsScope) {
    if (scope.kind === 'global') return [{ id: 'settings:global', kind: 'global', targetId: null }]
    if (scope.kind === 'workspace') {
      await this.storage.call('workspace', scope.targetId)
      return [
        { id: 'settings:global', kind: 'global', targetId: null },
        { id: `settings:workspace:${scope.targetId}`, kind: 'workspace', targetId: scope.targetId },
      ]
    }
    const session = await this.storage.call('session', scope.targetId)
    return [
      { id: 'settings:global', kind: 'global', targetId: null },
      { id: `settings:workspace:${session.workspaceId}`, kind: 'workspace', targetId: session.workspaceId },
      { id: `settings:session:${scope.targetId}`, kind: 'session', targetId: scope.targetId },
    ]
  }

  private async layers(scope: SettingsScope) {
    const chain = await this.chain(scope)
    const stored = await this.storage.call(
      'settingsLayers',
      chain.map((layer) => layer.id),
    )
    const byId = new Map(stored.map((layer) => [layer.id, layer]))
    const layers: StoredSettingsLayer[] = chain.map((layer) => {
      const current = byId.get(layer.id)
      if (current && current.schemaVersion !== HBAR_SETTINGS_SCHEMA_VERSION)
        throw new HbarError('VERSION_MISMATCH', `Settings layer requires migration: ${layer.id}`)
      return current ?? { ...layer, schemaVersion: HBAR_SETTINGS_SCHEMA_VERSION, revision: 0, values: {} }
    })
    return layers
  }

  async get(scope: SettingsScope): Promise<SettingsSnapshot> {
    const layers = await this.layers(scope)
    try {
      return {
        schemaVersion: HBAR_SETTINGS_SCHEMA_VERSION,
        scope,
        revisions: Object.fromEntries(layers.map((layer) => [layer.id, layer.revision])),
        resolution: resolveSettings(HBAR_SETTINGS_DEFINITIONS, layers),
      }
    } catch (error) {
      translate(error)
    }
  }

  async apply(input: ApplySettingsInput): Promise<ApplySettingsReceipt> {
    if (input.schemaVersion !== HBAR_SETTINGS_SCHEMA_VERSION)
      throw new HbarError('VERSION_MISMATCH', 'Settings schema version does not match the Host')
    if (!input.actorId || !input.idempotencyKey)
      throw new HbarError('INVALID_INPUT', 'Actor and idempotency key are required')
    const payloadHash = createHash('sha256').update(stable(input)).digest('hex')
    const prior = await this.storage.call('settingsReceipt', input.actorId, input.idempotencyKey)
    if (prior) {
      if (prior.payloadHash !== payloadHash)
        throw new HbarError('IDEMPOTENCY_CONFLICT', 'Settings idempotency key was already used')
      return prior.receipt as ApplySettingsReceipt
    }
    const layers = await this.layers(input.scope)
    const expectedIds = layers.map((layer) => layer.id).sort()
    if (
      Object.keys(input.baselineRevisions).sort().join('\0') !== expectedIds.join('\0') ||
      expectedIds.some((id) => !Number.isSafeInteger(input.baselineRevisions[id]) || input.baselineRevisions[id]! < 0)
    )
      throw new HbarError('INVALID_INPUT', 'Baseline revisions must cover the exact settings chain')
    const target = layers.at(-1)!
    let values: Readonly<Record<string, unknown>>
    let resolution: SettingsResolution
    try {
      values = applySettingsChanges(HBAR_SETTINGS_DEFINITIONS, target.kind, target.values, input.changes)
      resolution = resolveSettings(
        HBAR_SETTINGS_DEFINITIONS,
        layers.map((layer) => (layer.id === target.id ? { ...layer, revision: layer.revision + 1, values } : layer)),
      )
    } catch (error) {
      translate(error)
    }
    const receipt = await this.storage.call('commitSettings', {
      actorId: input.actorId,
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      layer: {
        id: target.id,
        kind: target.kind,
        targetId: target.targetId,
        schemaVersion: HBAR_SETTINGS_SCHEMA_VERSION,
        values: values as Record<string, unknown>,
      },
      expectedRevisions: { ...input.baselineRevisions },
      receipt: {
        commitId: randomUUID(),
        layerId: target.id,
        schemaVersion: HBAR_SETTINGS_SCHEMA_VERSION,
        resolution,
      },
    })
    return receipt as ApplySettingsReceipt
  }
}
