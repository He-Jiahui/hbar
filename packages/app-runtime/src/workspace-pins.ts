import { CommandError, type CommandExecutor, type CommandRegistry } from '@hbar/commands'
import { defineCommand } from '@hbar/commands/protocol'
import { workspaceSchema, type Workspace } from '@hbar/contracts/directory'
import { z } from 'zod'
import { createState, type StateReader } from './state'
import type { ClientPreferencesState, DirectoryState } from './types'

export const MAX_PINNED_WORKSPACES = 20
const KEY = 'pinnedWorkspaceIds'
const idSchema = z.string().min(1).max(160)
const savedSchema = z.strictObject({
  version: z.literal(1),
  ids: z.array(idSchema).max(MAX_PINNED_WORKSPACES),
})
const metadata = (name: string) => ({
  id: name,
  version: 1,
  owner: 'hbar.workspace-pins',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  category: 'workspace.navigation',
  scope: 'client' as const,
  visibility: 'internal' as const,
  titleKey: `commands.${name}.title`,
  descriptionKey: `commands.${name}.description`,
  surfaces: ['api'] as ('api' | 'palette' | 'cli' | 'tui')[],
})

export const workspacePinCommands = {
  'workspacePins.toggle': defineCommand(
    metadata('workspacePins.toggle'),
    z.strictObject({ workspaceId: idSchema, expectedPinned: z.boolean() }),
    z.strictObject({ workspaceId: idSchema, pinned: z.boolean(), persisted: z.boolean() }),
  ),
  'workspacePins.refresh': defineCommand(
    metadata('workspacePins.refresh'),
    z.strictObject({}),
    z.strictObject({ status: z.enum(['ready', 'error']), error: z.string().nullable() }),
  ),
  'workspacePins.reconcile': defineCommand(
    metadata('workspacePins.reconcile'),
    z.strictObject({ workspaceId: idSchema }),
    z.strictObject({ pinned: z.boolean(), persisted: z.boolean() }),
  ),
}

export interface WorkspacePinAction {
  readonly workspaceId: string | null
  readonly desiredPinned: boolean | null
  readonly status: 'idle' | 'submitting' | 'succeeded' | 'failed' | 'unknown'
  readonly error: string | null
  readonly persisted: boolean
}

export interface WorkspacePinsState {
  readonly ids: readonly string[]
  readonly resolved: Readonly<Record<string, Readonly<Workspace>>>
  readonly missing: readonly string[]
  readonly status: 'loading' | 'ready' | 'error'
  readonly error: string | null
  readonly action: WorkspacePinAction
}

function code(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'PERSISTENCE_FAILED'
}

function pinnedIds(preferences: ClientPreferencesState): readonly string[] {
  const value = preferences.values[KEY]
  if (value === undefined) return []
  const parsed = savedSchema.safeParse(value)
  if (!parsed.success || new Set(parsed.data.ids).size !== parsed.data.ids.length)
    throw new CommandError('INVALID_PERSISTED_STATE', 'Saved workspace pins are invalid')
  return parsed.data.ids
}

/** Pins are a bounded device preference. Host Workspace records are queried, never persisted in the preference. */
export function sortPinnedWorkspaces(
  directory: DirectoryState,
  pins: WorkspacePinsState,
): readonly Readonly<Workspace>[] {
  const byId = new Map(Object.entries(pins.resolved).filter(([id]) => pins.ids.includes(id)))
  for (const workspace of Object.values(directory.workspaces)) byId.set(workspace.id, workspace)
  for (const id of pins.missing) byId.delete(id)
  const pinned = new Set(pins.ids)
  return [...byId.values()].sort((left, right) => {
    const a = pinned.has(left.id)
    const b = pinned.has(right.id)
    if (a !== b) return a ? -1 : 1
    return left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
  })
}

export function createWorkspacePins(
  local: CommandRegistry,
  options: {
    readonly preferences: StateReader<ClientPreferencesState>
    readonly preferencesReady: Promise<void>
    readonly preferenceCommands: CommandExecutor
    readonly refreshPreferences: () => Promise<ClientPreferencesState>
    readonly directory: StateReader<DirectoryState>
    readonly queries: CommandExecutor
    readonly onSubscriberError: (reason: unknown) => void
    readonly isDisposed: () => boolean
  },
) {
  const initialAction: WorkspacePinAction = {
    workspaceId: null,
    desiredPinned: null,
    status: 'idle',
    error: null,
    persisted: false,
  }
  const state = createState<WorkspacePinsState>(
    { ids: [], resolved: {}, missing: [], status: 'loading', error: null, action: initialAction },
    options.onSubscriberError,
  )
  let disposed = false
  let initialized = false
  let generation = 0
  let hydrateController: AbortController | null = null
  const current = () => state.reader.getSnapshot()
  const replace = (next: WorkspacePinsState) => {
    if (!disposed && !options.isDisposed()) state.replace(next)
  }

  async function hydrate(force = false): Promise<void> {
    const previous = current()
    const preferences = options.preferences.getSnapshot()
    if (preferences.restoreError) {
      replace({ ...previous, status: 'error', error: preferences.restoreError })
      return
    }
    let ids: readonly string[]
    try {
      ids = pinnedIds(preferences)
    } catch (reason) {
      replace({ ...previous, status: 'error', error: code(reason) })
      return
    }
    if (!force && previous.status === 'ready' && ids.join('\0') === previous.ids.join('\0')) return
    hydrateController?.abort()
    const controller = new AbortController()
    hydrateController = controller
    const token = ++generation
    const resolved: Record<string, Workspace> = {}
    const missing: string[] = []
    let error: string | null = null
    replace({ ...previous, ids, resolved: {}, missing: [], status: 'loading', error: null })
    const directory = options.directory.getSnapshot().workspaces
    const absent = ids.filter((id) => !directory[id])
    for (let offset = 0; offset < absent.length; offset += 4) {
      const page = await Promise.allSettled(
        absent.slice(offset, offset + 4).map(async (id) => {
          const response = await options.queries.execute(
            'workspace.get',
            { workspaceId: id },
            { signal: controller.signal },
          )
          const workspace = workspaceSchema.nullable().parse(response)
          if (workspace && workspace.id !== id) throw new CommandError('INVALID_OUTPUT', 'Pinned Workspace ID changed')
          return { id, workspace }
        }),
      )
      if (disposed || options.isDisposed() || token !== generation || controller.signal.aborted) return
      for (const result of page) {
        if (result.status === 'rejected') error ??= code(result.reason)
        else if (result.value.workspace) resolved[result.value.id] = result.value.workspace
        else missing.push(result.value.id)
      }
    }
    if (disposed || options.isDisposed() || token !== generation || controller.signal.aborted) return
    replace({ ...current(), ids, resolved, missing, status: error ? 'error' : 'ready', error })
  }

  const unsubscribe = options.preferences.subscribe(() => {
    if (initialized && !disposed) void hydrate()
  })
  const ready = options.preferencesReady
    .then(() => {
      initialized = true
      return hydrate(true)
    })
    .catch((reason: unknown) => {
      replace({ ...current(), status: 'error', error: code(reason) })
    })

  local.register(workspacePinCommands['workspacePins.toggle'], async ({ workspaceId, expectedPinned }) => {
    if (disposed || options.isDisposed()) throw new CommandError('DISPOSED', 'Workspace pins are disposed')
    const action = current().action
    if (action.status === 'submitting' || action.status === 'unknown')
      throw new CommandError('BUSY', 'A workspace pin preference needs confirmation')
    if (current().status !== 'ready')
      throw new CommandError('PIN_STATE_UNAVAILABLE', 'Read Workspace pins before changing them')
    if (options.preferences.getSnapshot().restoreError)
      throw new CommandError('INVALID_PERSISTED_STATE', 'Restore device preferences before changing pins')
    if (
      !options.directory.getSnapshot().workspaces[workspaceId] &&
      !(expectedPinned && current().resolved[workspaceId] && !current().missing.includes(workspaceId))
    )
      throw new CommandError('WORKSPACE_NOT_FOUND', 'The Workspace row changed')
    if (current().ids.includes(workspaceId) !== expectedPinned)
      throw new CommandError('VERSION_CONFLICT', 'The Workspace pin changed before this action')
    const desiredPinned = !expectedPinned
    replace({
      ...current(),
      action: { workspaceId, desiredPinned, status: 'submitting', error: null, persisted: false },
    })
    try {
      let result: ClientPreferencesState | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        const preference = options.preferences.getSnapshot()
        const ids = pinnedIds(preference)
        if (ids.includes(workspaceId) !== expectedPinned)
          throw new CommandError('VERSION_CONFLICT', 'The Workspace pin changed before this action')
        const valid = ids.filter((id) => !current().missing.includes(id))
        const next = desiredPinned ? [...valid, workspaceId] : valid.filter((id) => id !== workspaceId)
        if (next.length > MAX_PINNED_WORKSPACES) throw new CommandError('PIN_LIMIT', 'Too many workspaces are pinned')
        try {
          await options.preferenceCommands.execute('preferences.set', {
            key: KEY,
            value: { version: 1, ids: next },
            expectedRevision: preference.revision,
          })
          result = options.preferences.getSnapshot()
          break
        } catch (reason) {
          if (code(reason) !== 'COMMAND_CONFLICT' || attempt === 2) throw reason
        }
      }
      if (!result) throw new CommandError('RESULT_UNKNOWN', 'Workspace pin preference was not confirmed')
      const ids = pinnedIds(result)
      if (ids.includes(workspaceId) !== desiredPinned)
        throw new CommandError('RESULT_UNKNOWN', 'Workspace pin preference did not match its requested result')
      replace({
        ...current(),
        ids,
        action: { workspaceId, desiredPinned, status: 'succeeded', error: null, persisted: result.persisted },
      })
      return { workspaceId, pinned: desiredPinned, persisted: result.persisted }
    } catch (reason) {
      const error = code(reason)
      const knownNotWritten = ['COMMAND_CONFLICT', 'VERSION_CONFLICT', 'PIN_LIMIT', 'INVALID_PERSISTED_STATE'].includes(
        error,
      )
      replace({
        ...current(),
        action: {
          workspaceId,
          desiredPinned,
          status: knownNotWritten ? 'failed' : 'unknown',
          error,
          persisted: false,
        },
      })
      throw reason
    }
  })

  local.register(workspacePinCommands['workspacePins.refresh'], async () => {
    try {
      await options.refreshPreferences()
      await hydrate(true)
    } catch (reason) {
      replace({ ...current(), status: 'error', error: code(reason) })
    }
    const result = current()
    return { status: result.status === 'loading' ? 'error' : result.status, error: result.error }
  })
  local.register(workspacePinCommands['workspacePins.reconcile'], async ({ workspaceId }) => {
    const action = current().action
    if (action.status !== 'unknown' || action.workspaceId !== workspaceId || action.desiredPinned === null)
      throw new CommandError('NOT_REQUIRED', 'There is no uncertain pin action for this Workspace')
    const preference = await options.refreshPreferences()
    const ids = pinnedIds(preference)
    const pinned = ids.includes(workspaceId)
    replace({
      ...current(),
      ids,
      action: {
        workspaceId,
        desiredPinned: action.desiredPinned,
        status: pinned === action.desiredPinned ? 'succeeded' : 'failed',
        error: pinned === action.desiredPinned ? null : 'NOT_APPLIED',
        persisted: preference.persisted,
      },
    })
    return { pinned, persisted: preference.persisted }
  })

  return {
    reader: state.reader,
    ready,
    dispose: () => {
      disposed = true
      generation++
      hydrateController?.abort()
      unsubscribe()
      state.dispose()
    },
  }
}
