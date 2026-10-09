import { createHash, randomUUID } from 'node:crypto'
import { HbarError } from '@hbar/contracts'
import { DEFAULT_SANDBOX_PROFILE_ID } from '@hbar/contracts/sandbox'
import { chatDatabaseSettingsFields } from '@hbar/contracts/commands/chat-database'
import { resolveChatDatabasePolicy } from './chat-database-policy'
import {
  COMPACTION_PERCENT_SETTING,
  DEFAULT_COMPACTION_PERCENT,
  MIN_COMPACTION_PERCENT,
  MAX_COMPACTION_PERCENT,
} from '@hbar/contracts/commands/models'
import {
  settingsDescriptionSchema,
  settingsReceiptSchema,
  type SettingsDescription,
  type SettingsFieldDescription,
} from '@hbar/contracts/commands/settings'
import {
  applySettingsChanges,
  resolveSettings,
  SettingsError,
  type SettingDefinition,
  type SettingsChange,
  type SettingsResolution,
  type ValueSchema,
} from '@hbar/settings-core'
import type { SchemaPath } from '@hbar/schema-core'
import type { SettingsCommitReceipt, StoredSettingsLayer, StoragePort } from '@hbar/storage'

export const HBAR_SETTINGS_SCHEMA_VERSION = 1
const path = (name: string): SchemaPath => [{ kind: 'field', name }]
/** A missing local value inherits the legacy Host-wide permission.mode default. */
export const SESSION_APPROVAL_SETTING_PATH: SchemaPath = path('session.approval')
/** Profile resolved when a Run is admitted with `approval: 'sandbox'`. */
export const SESSION_SANDBOX_PROFILE_SETTING_PATH: SchemaPath = path('session.sandboxProfile')
function freeze<Value>(value: Value): Value {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

export const HBAR_SETTINGS_DESCRIPTION: SettingsDescription = freeze(
  settingsDescriptionSchema.parse({
    id: 'hbar.settings',
    schemaVersion: HBAR_SETTINGS_SCHEMA_VERSION,
    groups: [
      { id: 'general', labelKey: 'i18n:settings.groups.general', order: 15 },
      { id: 'model', labelKey: 'i18n:settings.groups.model', order: 10 },
      { id: 'session', labelKey: 'i18n:settings.groups.session', order: 20 },
      { id: 'providers', labelKey: 'i18n:settings.groups.providers', order: 30 },
      { id: 'extensions', labelKey: 'i18n:settings.groups.extensions', order: 40 },
      { id: 'chatDatabase', labelKey: 'i18n:settings.groups.chatDatabase', order: 38 },
    ],
    fields: [
      ...(['web', 'file'] as const).map((kind) => ({
        path: path(`client.resource${kind === 'web' ? 'Web' : 'File'}OpenMode`),
        type: 'string' as const,
        nullable: false,
        defaultValue: 'internal',
        choices: ['internal', 'system'],
        allowedScopes: ['global' as const],
        applyMode: 'immediate' as const,
        labelKey: `i18n:settings.client.resource${kind === 'web' ? 'Web' : 'File'}OpenMode.label`,
        helpKey: 'i18n:settings.client.resourceOpenMode.help',
        group: 'general',
        order: kind === 'web' ? 20 : 30,
        component: 'PopupSelect',
        multiple: false,
      })),
      {
        path: path('client.chatSendBehavior'),
        type: 'string',
        nullable: false,
        defaultValue: 'enter',
        choices: ['enter', 'modifierEnter'],
        allowedScopes: ['global'],
        applyMode: 'immediate',
        labelKey: 'i18n:settings.client.chatSendBehavior.label',
        helpKey: 'i18n:settings.client.chatSendBehavior.help',
        group: 'general',
        order: 10,
        component: 'PopupSelect',
        multiple: false,
      },
      {
        path: path('provider.model'),
        type: 'string',
        nullable: true,
        defaultValue: null,
        allowedScopes: ['global', 'workspace', 'session'],
        applyMode: 'nextRun',
        labelKey: 'i18n:settings.provider.model.label',
        helpKey: 'i18n:settings.provider.model.help',
        group: 'model',
        order: 10,
        component: 'ComboBox',
        multiple: false,
        content: {
          kind: 'options',
          callbackId: 'settings.getModels',
          callbackVersion: 1,
          dependsOn: [],
        },
      },
      {
        path: path('provider.thinkingLevel'),
        type: 'string',
        nullable: true,
        defaultValue: null,
        choices: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
        allowedScopes: ['global', 'workspace', 'session'],
        applyMode: 'nextRun',
        labelKey: 'i18n:settings.provider.thinkingLevel.label',
        helpKey: 'i18n:settings.provider.thinkingLevel.help',
        group: 'model',
        order: 20,
        component: 'ToggleGroup',
        multiple: false,
        content: {
          kind: 'options',
          callbackId: 'settings.getThinkingLevels',
          callbackVersion: 1,
          dependsOn: [path('provider.model')],
        },
      },
      {
        path: path('session.defaultBudget'),
        type: 'integer',
        nullable: true,
        defaultValue: null,
        minimum: 1,
        allowedScopes: ['global', 'workspace'],
        applyMode: 'nextRun',
        labelKey: 'i18n:settings.session.defaultBudget.label',
        helpKey: 'i18n:settings.session.defaultBudget.help',
        group: 'session',
        order: 10,
        component: 'NumberField',
        multiple: false,
      },
      {
        path: path(COMPACTION_PERCENT_SETTING),
        type: 'integer',
        nullable: false,
        defaultValue: DEFAULT_COMPACTION_PERCENT,
        minimum: MIN_COMPACTION_PERCENT,
        maximum: MAX_COMPACTION_PERCENT,
        allowedScopes: ['global', 'workspace', 'session'],
        applyMode: 'immediate',
        labelKey: 'i18n:settings.context.compactionPercent.label',
        helpKey: 'i18n:settings.context.compactionPercent.help',
        group: 'model',
        order: 30,
        component: 'NumberField',
        multiple: false,
      },
      {
        path: SESSION_APPROVAL_SETTING_PATH,
        type: 'string',
        nullable: true,
        defaultValue: null,
        choices: ['ask', 'deny', 'allow', 'sandbox'],
        allowedScopes: ['session'],
        applyMode: 'nextRun',
        labelKey: 'i18n:settings.session.approval.label',
        helpKey: 'i18n:settings.session.approval.help',
        group: 'session',
        order: 20,
        component: 'PopupSelect',
        multiple: false,
      },
      {
        path: SESSION_SANDBOX_PROFILE_SETTING_PATH,
        type: 'string',
        nullable: false,
        defaultValue: DEFAULT_SANDBOX_PROFILE_ID,
        allowedScopes: ['global', 'workspace', 'session'],
        applyMode: 'nextRun',
        labelKey: 'i18n:settings.session.sandboxProfile.label',
        helpKey: 'i18n:settings.session.sandboxProfile.help',
        group: 'session',
        order: 30,
        component: 'ComboBox',
        multiple: false,
        content: {
          kind: 'options',
          callbackId: 'settings.getSandboxProfiles',
          callbackVersion: 1,
          dependsOn: [],
        },
      },
      ...chatDatabaseSettingsFields,
    ],
  }),
)

function definition(field: SettingsFieldDescription): SettingDefinition {
  const common = { nullable: field.nullable }
  const item: ValueSchema =
    field.type === 'string'
      ? {
          ...(field.multiple ? {} : common),
          kind: 'string' as const,
          ...(field.choices ? { enum: field.choices as readonly string[] } : {}),
        }
      : field.type === 'boolean'
        ? { ...(field.multiple ? {} : common), kind: 'boolean' as const }
        : {
            ...(field.multiple ? {} : common),
            kind: field.type,
            ...(field.minimum !== undefined ? { minimum: field.minimum } : {}),
            ...(field.maximum !== undefined ? { maximum: field.maximum } : {}),
          }
  const schema: ValueSchema = field.multiple ? { ...common, kind: 'array', items: item } : item
  return {
    path: field.path,
    allowedLayers: field.allowedScopes,
    schema,
    defaultValue: field.defaultValue,
    applyMode: field.applyMode,
  }
}

export const HBAR_SETTINGS_DEFINITIONS: readonly SettingDefinition[] = Object.freeze([
  ...HBAR_SETTINGS_DESCRIPTION.fields.map((field) => Object.freeze(definition(field))),
  // Structured settings have their own typed command/editor contract rather than a raw JSON text field.
  Object.freeze({
    path: path('agent.dispatchCandidates'),
    allowedLayers: ['global', 'workspace', 'session'],
    applyMode: 'nextRun' as const,
    defaultValue: [],
    schema: {
      kind: 'array' as const,
      items: {
        kind: 'object' as const,
        required: ['difficulty', 'modelId', 'thinkingLevel', 'weight'],
        properties: {
          difficulty: { kind: 'string' as const, enum: ['simple', 'medium', 'complex'] },
          modelId: { kind: 'string' as const },
          thinkingLevel: { kind: 'string' as const, enum: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] },
          weight: { kind: 'integer' as const, minimum: 1, maximum: 1_000 },
        },
      },
    },
  }),
])

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
export interface SettingsCandidate {
  readonly scope: SettingsScope
  readonly changes: readonly SettingsChange[]
  readonly resolution: SettingsResolution
}
export type SettingsCandidateValidator = (candidate: SettingsCandidate) => void | Promise<void>

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
  constructor(
    private readonly storage: StoragePort,
    private readonly validateCandidate?: SettingsCandidateValidator,
    private readonly onCommitted?: (scope: SettingsScope) => void,
  ) {}

  describe(): SettingsDescription {
    return HBAR_SETTINGS_DESCRIPTION
  }

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

  /** Reads only the original actor/key journal and exact scope; never creates a layer or applies a patch. */
  async getReceipt(
    scope: SettingsScope,
    actorId: string,
    idempotencyKey: string,
    originalRequest?: Omit<ApplySettingsInput, 'actorId' | 'idempotencyKey'>,
  ): Promise<ApplySettingsReceipt | null> {
    if (!actorId || !idempotencyKey) throw new HbarError('INVALID_INPUT', 'Actor and idempotency key are required')
    const chain = await this.chain(scope)
    const stored = await this.storage.call('settingsReceipt', actorId, idempotencyKey)
    if (!stored) return null
    const parsed = settingsReceiptSchema.safeParse(stored.receipt)
    if (!parsed.success) throw new HbarError('INVALID_OUTPUT', 'Stored settings receipt is invalid')
    const receipt = parsed.data
    if (receipt.layerId !== chain.at(-1)?.id) return null
    if (
      originalRequest &&
      (stable(originalRequest.scope) !== stable(scope) ||
        stored.payloadHash !==
          createHash('sha256')
            .update(stable({ ...originalRequest, actorId, idempotencyKey }))
            .digest('hex'))
    )
      throw new HbarError('IDEMPOTENCY_CONFLICT', 'Settings receipt does not match the original request')
    if (receipt.schemaVersion !== HBAR_SETTINGS_SCHEMA_VERSION)
      throw new HbarError('VERSION_MISMATCH', 'Stored settings receipt requires migration')
    const layers = receipt.resolution.layers
    if (
      layers.length !== chain.length ||
      layers.some((layer, index) => layer.id !== chain[index]?.id || layer.kind !== chain[index]?.kind) ||
      layers.at(-1)?.revision !== receipt.revision
    )
      throw new HbarError('INVALID_OUTPUT', 'Stored settings receipt does not match its scope chain')
    return receipt
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
    resolveChatDatabasePolicy(resolution)
    await this.validateCandidate?.({ scope: input.scope, changes: input.changes, resolution })
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
    // The receipt is authoritative. Notification is a best-effort invalidation hint;
    // readers recover by querying the selected scope after reconnect or a missed hint.
    try {
      this.onCommitted?.(input.scope)
    } catch (error) {
      console.error('Settings change notification failed:', error)
    }
    return receipt as ApplySettingsReceipt
  }
}
