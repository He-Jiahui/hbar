import { CommandError, createCommandClient, type CommandRegistry } from '@hbar/commands'
import { clientPersistenceCommands } from '@hbar/contracts/commands/client-persistence'
import { createState } from './state'
import type {
  ClientJsonObject,
  ClientJsonValue,
  ClientLayoutState,
  ClientPreferencesState,
  RuntimeOptions,
} from './types'

const PERSISTENCE_VERSION = 1
const MAX_SERIALIZED_BYTES = 256 * 1024

interface PersistedEnvelope {
  readonly version: 1
  readonly revision: number
  readonly value: ClientJsonObject
}

function errorCode(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'PERSISTENCE_FAILED'
}

function cloneJson(value: unknown, label: string): ClientJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new CommandError('INVALID_INPUT', `${label} contains a non-finite number`)
    return value
  }
  if (Array.isArray(value)) return value.map((item) => cloneJson(item, label))
  if (typeof value === 'object') {
    const object: Record<string, ClientJsonValue> = {}
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) throw new CommandError('INVALID_INPUT', `${label} contains undefined`)
      object[key] = cloneJson(item, label)
    }
    return object
  }
  throw new CommandError('INVALID_INPUT', `${label} must contain JSON values only`)
}

function isJsonObject(value: ClientJsonValue): value is ClientJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function cloneObject(value: unknown, label: string): ClientJsonObject {
  const cloned = cloneJson(value, label)
  if (!isJsonObject(cloned)) throw new CommandError('INVALID_INPUT', `${label} must be an object`)
  const bytes = new TextEncoder().encode(JSON.stringify(cloned)).byteLength
  if (bytes > MAX_SERIALIZED_BYTES) throw new CommandError('INVALID_INPUT', `${label} exceeds 256 KiB`)
  return cloned
}

function normalizeLayout(
  options: RuntimeOptions,
  value: unknown,
  code: 'INVALID_INPUT' | 'INVALID_PERSISTED_STATE',
): ClientJsonObject {
  const description = cloneObject(value, code === 'INVALID_INPUT' ? 'Layout description' : 'Persisted layout')
  if (!options.layoutDescription) return description
  try {
    return cloneObject(options.layoutDescription.normalize(description), 'Normalized layout description')
  } catch (reason) {
    if (reason instanceof CommandError) throw reason
    throw new CommandError(
      code,
      code === 'INVALID_INPUT' ? 'Layout description is invalid' : 'Persisted layout is invalid',
    )
  }
}

function envelope(value: unknown): PersistedEnvelope {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new CommandError('INVALID_PERSISTED_STATE', 'Persisted client state is not an object')
  const record = value as Record<string, unknown>
  if (record.version !== PERSISTENCE_VERSION)
    throw new CommandError('UNSUPPORTED_PERSISTED_VERSION', 'Persisted client state uses an unsupported version')
  if (!Number.isSafeInteger(record.revision) || (record.revision as number) < 0)
    throw new CommandError('INVALID_PERSISTED_STATE', 'Persisted client state has an invalid revision')
  return { version: 1, revision: record.revision as number, value: cloneObject(record.value, 'Persisted client state') }
}

function assertRevision(actual: number, expected: number | undefined): void {
  if (expected !== undefined && expected !== actual)
    throw new CommandError('COMMAND_CONFLICT', `Expected revision ${expected}, received ${actual}`)
}

export function createClientPersistence(
  local: CommandRegistry,
  options: RuntimeOptions,
  onSubscriberError: (error: unknown) => void,
  isDisposed: () => boolean,
) {
  const defaultLayout = normalizeLayout(options, options.defaultLayout ?? {}, 'INVALID_INPUT')
  const layout = createState<ClientLayoutState>(
    {
      status: options.persistence ? 'loading' : 'ready',
      revision: 0,
      source: 'default',
      persisted: false,
      description: defaultLayout,
      restoreError: null,
    },
    onSubscriberError,
  )
  const preferences = createState<ClientPreferencesState>(
    {
      status: options.persistence ? 'loading' : 'ready',
      revision: 0,
      persisted: false,
      values: {},
      restoreError: null,
    },
    onSubscriberError,
  )
  const prefix = `hbar:${options.hostId}`
  const layoutKey = `${prefix}:layout`
  const preferencesKey = `${prefix}:preferences`
  let tail = Promise.resolve()

  function serialize<Value>(operation: () => Promise<Value>): Promise<Value> {
    const result = tail.catch(() => undefined).then(operation)
    tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  async function read(key: string): Promise<PersistedEnvelope | null> {
    if (!options.persistence) return null
    const value = await options.persistence.read(key)
    return value === null || value === undefined ? null : envelope(value)
  }

  async function write(key: string, revision: number, value: ClientJsonObject): Promise<boolean> {
    if (!options.persistence) return false
    await options.persistence.write(key, { version: PERSISTENCE_VERSION, revision, value })
    return true
  }

  function layoutResult(state: ClientLayoutState) {
    return {
      revision: state.revision,
      source: state.source,
      persisted: state.persisted,
      description: state.description,
    }
  }
  function preferencesResult(state: ClientPreferencesState) {
    return { revision: state.revision, persisted: state.persisted, values: state.values }
  }

  async function restoreLayout(source: 'saved' | 'default'): Promise<ClientLayoutState> {
    const current = layout.reader.getSnapshot()
    if (source === 'default') {
      if (options.persistence) await options.persistence.remove(layoutKey)
      return {
        status: 'ready',
        revision: current.revision + 1,
        source: 'default',
        persisted: false,
        description: defaultLayout,
        restoreError: null,
      }
    }
    const saved = await read(layoutKey)
    return saved
      ? {
          status: 'ready',
          revision: saved.revision,
          source: 'saved',
          persisted: true,
          description: normalizeLayout(options, saved.value, 'INVALID_PERSISTED_STATE'),
          restoreError: null,
        }
      : {
          status: 'ready',
          revision: current.revision,
          source: 'default',
          persisted: false,
          description: defaultLayout,
          restoreError: null,
        }
  }

  local.register(clientPersistenceCommands['layout.commit'], (input) =>
    serialize(async () => {
      const current = layout.reader.getSnapshot()
      assertRevision(current.revision, input.expectedRevision)
      const description = normalizeLayout(options, input.description, 'INVALID_INPUT')
      const revision = current.revision + 1
      const persisted = await write(layoutKey, revision, description)
      const next: ClientLayoutState = {
        status: 'ready',
        revision,
        source: 'current',
        persisted,
        description,
        restoreError: null,
      }
      if (!isDisposed()) layout.replace(next)
      return layoutResult(next)
    }),
  )
  local.register(clientPersistenceCommands['layout.restore'], ({ source }) =>
    serialize(async () => {
      const next = await restoreLayout(source)
      if (!isDisposed()) layout.replace(next)
      return layoutResult(next)
    }),
  )
  local.register(clientPersistenceCommands['preferences.set'], (input) =>
    serialize(async () => {
      const current = preferences.reader.getSnapshot()
      if (current.restoreError)
        throw new CommandError('PERSISTENCE_RESTORE_FAILED', 'Read saved preferences before changing them')
      assertRevision(current.revision, input.expectedRevision)
      const values = cloneObject({ ...current.values, [input.key]: input.value }, 'Preferences')
      const revision = current.revision + 1
      const persisted = await write(preferencesKey, revision, values)
      const next: ClientPreferencesState = {
        status: 'ready',
        revision,
        persisted,
        values,
        restoreError: null,
      }
      if (!isDisposed()) preferences.replace(next)
      return preferencesResult(next)
    }),
  )
  local.register(clientPersistenceCommands['preferences.unset'], (input) =>
    serialize(async () => {
      const current = preferences.reader.getSnapshot()
      if (current.restoreError)
        throw new CommandError('PERSISTENCE_RESTORE_FAILED', 'Read saved preferences before changing them')
      assertRevision(current.revision, input.expectedRevision)
      const { [input.key]: _removed, ...remaining } = current.values
      const values = cloneObject(remaining, 'Preferences')
      const revision = current.revision + 1
      const persisted = await write(preferencesKey, revision, values)
      const next: ClientPreferencesState = {
        status: 'ready',
        revision,
        persisted,
        values,
        restoreError: null,
      }
      if (!isDisposed()) preferences.replace(next)
      return preferencesResult(next)
    }),
  )

  const ready = serialize(async () => {
    if (!options.persistence) return
    try {
      const restored = await restoreLayout('saved')
      if (!isDisposed()) layout.replace(restored)
    } catch (reason) {
      if (!isDisposed())
        layout.replace({
          status: 'ready',
          revision: 0,
          source: 'default',
          persisted: false,
          description: defaultLayout,
          restoreError: errorCode(reason),
        })
    }
    try {
      const saved = await read(preferencesKey)
      if (!isDisposed())
        preferences.replace(
          saved
            ? {
                status: 'ready',
                revision: saved.revision,
                persisted: true,
                values: saved.value,
                restoreError: null,
              }
            : {
                status: 'ready',
                revision: 0,
                persisted: false,
                values: {},
                restoreError: null,
              },
        )
    } catch (reason) {
      if (!isDisposed())
        preferences.replace({
          status: 'ready',
          revision: 0,
          persisted: false,
          values: {},
          restoreError: errorCode(reason),
        })
    }
  })

  return {
    layout: layout.reader,
    preferences: preferences.reader,
    ready,
    retryPreferencesRestore: () =>
      serialize(async () => {
        const current = preferences.reader.getSnapshot()
        if (!current.restoreError) return current
        try {
          const saved = await read(preferencesKey)
          const next: ClientPreferencesState = saved
            ? { status: 'ready', revision: saved.revision, persisted: true, values: saved.value, restoreError: null }
            : { status: 'ready', revision: 0, persisted: false, values: {}, restoreError: null }
          if (!isDisposed()) preferences.replace(next)
          return next
        } catch (reason) {
          const next = { ...current, restoreError: errorCode(reason) }
          if (!isDisposed()) preferences.replace(next)
          return next
        }
      }),
    /** Re-read after an uncertain local write; serializing behind writes prevents a stale disk snapshot. */
    refreshPreferences: () =>
      serialize(async () => {
        if (!options.persistence) return preferences.reader.getSnapshot()
        const saved = await read(preferencesKey)
        const current = preferences.reader.getSnapshot()
        const next: ClientPreferencesState = saved
          ? { status: 'ready', revision: saved.revision, persisted: true, values: saved.value, restoreError: null }
          : { status: 'ready', revision: current.revision, persisted: false, values: {}, restoreError: null }
        if (!isDisposed()) preferences.replace(next)
        return next
      }),
    commands: createCommandClient(clientPersistenceCommands, local),
    dispose() {
      layout.dispose()
      preferences.dispose()
    },
  }
}
