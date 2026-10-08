import {
  CommandError,
  commandMetadataSchema,
  commandParameterInput,
  compileCommandParameterForm,
  createCommandParameterDraft,
  describeCommand,
  setCommandParameter,
  unsetCommandParameter,
  type CommandDescriptor,
  type CommandParameterDraft,
  type CommandParameterDraftValue,
  type CommandParameterForm,
  type CommandRegistry,
  type ExecuteOptions,
} from '@hbar/commands'
import { applicationCommands } from '@hbar/contracts/commands'
import { commandPaletteCommands, type CommandPaletteSummary } from '@hbar/contracts/commands/command-palette'
import type { StateReader } from './state'
import { createState } from './state'
import type {
  CommandPaletteDraftState,
  CommandPaletteItem,
  CommandPaletteState,
  CommandTextPort,
  DirectoryState,
  NavigationState,
  RuntimeOptions,
} from './types'

const CATALOG_PAGE_SIZE = 200
const MAX_CATALOG_ITEMS = 1_000
const MAX_RESULT_LENGTH = 16_384

interface ApplicationExecutor {
  execute(name: string, input: unknown, execution?: ExecuteOptions): Promise<unknown>
}

function errorCode(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

function publicDraft(form: CommandParameterForm, draft: CommandParameterDraft): CommandPaletteDraftState {
  const sensitive = new Set(form.fields.filter((field) => field.sensitive).map((field) => field.name))
  return Object.freeze({
    commandId: draft.commandId,
    commandVersion: draft.commandVersion,
    values: Object.freeze(Object.fromEntries(Object.entries(draft.values).filter(([field]) => !sensitive.has(field)))),
    sensitiveFields: Object.freeze([...sensitive].filter((field) => Object.hasOwn(draft.values, field))),
    issues: draft.issues,
    revision: draft.revision,
  })
}

function resultText(result: unknown): string {
  let text: string
  try {
    text = JSON.stringify(result, null, 2) ?? String(result)
  } catch {
    text = String(result)
  }
  return text.length <= MAX_RESULT_LENGTH ? text : `${text.slice(0, MAX_RESULT_LENGTH)}…`
}

function validateDescriptor(value: CommandDescriptor): CommandDescriptor {
  const parsed = commandMetadataSchema.safeParse(value.metadata)
  if (!parsed.success || value.inputSchema.type !== 'object' || value.inputSchema.additionalProperties !== false)
    throw new CommandError('INVALID_OUTPUT', 'Command catalog returned an invalid descriptor')
  return value
}

function localDescriptors(): CommandDescriptor[] {
  return Object.values(applicationCommands)
    .filter(
      (definition) =>
        definition.metadata.execution !== 'host' &&
        definition.metadata.visibility !== 'internal' &&
        definition.metadata.surfaces.includes('palette'),
    )
    .map(describeCommand)
}

function searchableText(descriptor: CommandDescriptor, text: CommandTextPort | undefined): string {
  const metadata = descriptor.metadata
  const keys = [
    metadata.id,
    metadata.category,
    metadata.titleKey,
    metadata.descriptionKey,
    ...metadata.aliases,
    ...metadata.keywords,
  ]
  if (text)
    keys.push(
      text.resolve(metadata.titleKey),
      text.resolve(metadata.descriptionKey),
      text.resolve(`commands.categories.${metadata.category}`),
    )
  return keys.join('\n').toLocaleLowerCase()
}

function commandContext(
  navigation: StateReader<NavigationState>,
  directory: StateReader<DirectoryState>,
): Readonly<Record<string, unknown>> {
  const current = navigation.getSnapshot()
  const workspaces = Object.keys(directory.getSnapshot().workspaces)
  const workspaceId = current.workspaceId ?? (workspaces.length === 1 ? workspaces[0] : undefined)
  return {
    ...(workspaceId ? { workspaceId } : {}),
    ...(current.sessionId ? { sessionId: current.sessionId } : {}),
  }
}

export function createCommandPalette(
  local: CommandRegistry,
  options: RuntimeOptions,
  navigation: StateReader<NavigationState>,
  directory: StateReader<DirectoryState>,
  executor: ApplicationExecutor,
  onSubscriberError: (error: unknown) => void,
  isDisposed: () => boolean,
) {
  const state = createState<CommandPaletteState>(
    {
      status: 'idle',
      view: 'search',
      revision: null,
      query: '',
      categories: [],
      items: {},
      visibleIds: [],
      selectedId: null,
      selectionLost: false,
      draft: null,
      execution: { status: 'idle', commandId: null, result: null, error: null },
      sensitiveResetRevision: 0,
      truncated: false,
      error: null,
    },
    onSubscriberError,
  )
  let generation = 0
  let fullDraft: CommandParameterDraft | null = null

  const itemFor = (descriptor: CommandDescriptor): CommandPaletteItem => {
    const platformUnavailable = descriptor.metadata.execution === 'platform' && !options.platform
    const hostUnavailable = descriptor.metadata.execution === 'host' && !options.commandCatalog
    return Object.freeze({
      descriptor,
      form: compileCommandParameterForm(descriptor),
      available: !platformUnavailable && !hostUnavailable,
      unavailableReason: platformUnavailable ? 'PLATFORM_UNAVAILABLE' : hostUnavailable ? 'HOST_UNAVAILABLE' : null,
    })
  }

  const visible = (items: Readonly<Record<string, Readonly<CommandPaletteItem>>>, query: string): string[] => {
    const normalized = query.trim().toLocaleLowerCase()
    return Object.values(items)
      .filter((item) => !normalized || searchableText(item.descriptor, options.commandText).includes(normalized))
      .sort(
        (left, right) =>
          left.descriptor.metadata.category.localeCompare(right.descriptor.metadata.category) ||
          left.descriptor.metadata.id.localeCompare(right.descriptor.metadata.id),
      )
      .map((item) => item.descriptor.metadata.id)
  }

  const categories = (items: Readonly<Record<string, Readonly<CommandPaletteItem>>>, visibleIds: readonly string[]) => {
    const counts = new Map<string, number>()
    for (const id of visibleIds) {
      const category = items[id]?.descriptor.metadata.category
      if (category) counts.set(category, (counts.get(category) ?? 0) + 1)
    }
    return [...counts].map(([id, count]) => Object.freeze({ id, count }))
  }

  const textUnsubscribe = options.commandText?.subscribe?.(() => {
    if (isDisposed()) return
    const current = state.reader.getSnapshot()
    const ids = visible(current.items, current.query)
    if (ids.length === current.visibleIds.length && ids.every((id, index) => id === current.visibleIds[index])) return
    // Copy changes are not navigation or catalog changes. In particular, never clear an
    // edited parameter draft, in-flight/unknown execution or result to update a search index.
    state.replace({ ...current, visibleIds: ids, categories: categories(current.items, ids) })
  })

  const selectDraft = (item: Readonly<CommandPaletteItem> | undefined): void => {
    fullDraft = item ? createCommandParameterDraft(item.form, commandContext(navigation, directory)) : null
  }

  const replaceSelection = (
    current: CommandPaletteState,
    items: Readonly<Record<string, Readonly<CommandPaletteItem>>>,
    visibleIds: readonly string[],
    preferred: string | null,
    selectionLost: boolean,
  ): CommandPaletteState => {
    const selectedId = preferred && visibleIds.includes(preferred) ? preferred : (visibleIds[0] ?? null)
    const selected = selectedId ? items[selectedId] : undefined
    if (
      selectedId !== current.selectedId ||
      fullDraft?.commandId !== selectedId ||
      (selected && fullDraft.commandVersion !== selected.form.commandVersion)
    )
      selectDraft(selectedId ? items[selectedId] : undefined)
    return {
      ...current,
      items,
      visibleIds,
      categories: categories(items, visibleIds),
      selectedId,
      selectionLost,
      draft: fullDraft && selectedId ? publicDraft(items[selectedId]!.form, fullDraft) : null,
    }
  }

  const summary = (): CommandPaletteSummary => {
    const current = state.reader.getSnapshot()
    return {
      status: current.status,
      view: current.view,
      query: current.query,
      selectedId: current.selectedId,
      itemCount: current.visibleIds.length,
      selectionLost: current.selectionLost,
      executionStatus: current.execution.status,
      error: current.error ?? current.execution.error,
    }
  }

  const refresh = async (): Promise<CommandPaletteSummary> => {
    const request = ++generation
    const before = state.reader.getSnapshot()
    state.replace({ ...before, status: 'loading', error: null })
    const descriptors = localDescriptors()
    const localRevision = descriptors.length
    let revision = localRevision
    let truncated = false
    let failure: string | null = null
    if (options.commandCatalog) {
      try {
        let after: string | undefined
        const cursors = new Set<string>()
        do {
          const page = await options.commandCatalog.list({ ...(after ? { after } : {}), limit: CATALOG_PAGE_SIZE })
          if (request !== generation || isDisposed())
            throw new CommandError('RESULT_UNKNOWN', 'Catalog refresh superseded')
          if (!Number.isSafeInteger(page.revision) || page.revision < 0 || page.items.length > CATALOG_PAGE_SIZE)
            throw new CommandError('INVALID_OUTPUT', 'Command catalog returned an invalid page')
          revision = page.revision + localRevision
          const validated = page.items.map(validateDescriptor)
          const remaining = Math.max(0, MAX_CATALOG_ITEMS - descriptors.length)
          descriptors.push(...validated.slice(0, remaining))
          after = page.nextCursor
          if (after && cursors.has(after))
            throw new CommandError('INVALID_OUTPUT', 'Command catalog cursor did not advance')
          if (after) cursors.add(after)
          if (validated.length > remaining || (after && descriptors.length >= MAX_CATALOG_ITEMS)) {
            truncated = true
            break
          }
        } while (after)
      } catch (reason) {
        if (request !== generation || isDisposed()) throw reason
        failure = errorCode(reason)
      }
    }
    if (request !== generation || isDisposed()) throw new CommandError('RESULT_UNKNOWN', 'Catalog refresh superseded')
    const byId: Record<string, CommandPaletteItem> = {}
    for (const descriptor of descriptors) {
      if (descriptor.metadata.visibility === 'internal' || !descriptor.metadata.surfaces.includes('palette')) continue
      const existing = byId[descriptor.metadata.id]
      if (existing && JSON.stringify(existing.descriptor) !== JSON.stringify(descriptor))
        throw new CommandError('COMMAND_CONFLICT', `Conflicting command descriptor: ${descriptor.metadata.id}`)
      byId[descriptor.metadata.id] = itemFor(descriptor)
    }
    const current = state.reader.getSnapshot()
    const ids = visible(byId, current.query)
    const selectionLost = current.selectedId !== null && !ids.includes(current.selectedId)
    state.replace({
      ...replaceSelection(current, Object.freeze(byId), ids, current.selectedId, selectionLost),
      status: failure ? 'error' : 'ready',
      revision,
      truncated,
      error: failure,
    })
    return summary()
  }

  const setQuery = (query: string): CommandPaletteSummary => {
    const current = state.reader.getSnapshot()
    const ids = visible(current.items, query)
    const next = replaceSelection({ ...current, query }, current.items, ids, null, false)
    state.replace({
      ...next,
      query,
      view: 'search',
      execution:
        current.execution.status === 'unknown' && next.selectedId === current.execution.commandId
          ? current.execution
          : { status: 'idle', commandId: null, result: null, error: null },
    })
    return summary()
  }

  const select = (commandId: string): CommandPaletteSummary => {
    const current = state.reader.getSnapshot()
    if (!current.visibleIds.includes(commandId)) throw new CommandError('COMMAND_NOT_FOUND', 'Command is not visible')
    if (current.selectedId !== commandId) selectDraft(current.items[commandId])
    state.replace({
      ...current,
      selectedId: commandId,
      selectionLost: false,
      draft: fullDraft ? publicDraft(current.items[commandId]!.form, fullDraft) : null,
      execution:
        current.execution.status === 'unknown' && commandId === current.execution.commandId
          ? current.execution
          : { status: 'idle', commandId: null, result: null, error: null },
    })
    return summary()
  }

  const move = (direction: -1 | 1): CommandPaletteSummary => {
    const current = state.reader.getSnapshot()
    if (!current.visibleIds.length) return summary()
    const index = current.selectedId ? current.visibleIds.indexOf(current.selectedId) : -1
    const next = Math.min(current.visibleIds.length - 1, Math.max(0, index + direction))
    return select(current.visibleIds[next]!)
  }

  const openCommand = (commandId: string): CommandPaletteSummary => {
    select(commandId)
    const current = state.reader.getSnapshot()
    state.replace({ ...current, view: 'parameters' })
    return summary()
  }

  const back = (): CommandPaletteSummary => {
    const current = state.reader.getSnapshot()
    if (current.view === 'search') return summary()
    state.replace({
      ...current,
      view: current.view === 'result' ? 'parameters' : 'search',
      execution:
        current.execution.status === 'unknown'
          ? current.execution
          : { status: 'idle', commandId: null, result: null, error: null },
    })
    return summary()
  }

  const updateParameter = (field: string, value: CommandParameterDraftValue | undefined): CommandPaletteSummary => {
    const current = state.reader.getSnapshot()
    const item = current.selectedId ? current.items[current.selectedId] : undefined
    if (!item || !fullDraft) throw new CommandError('COMMAND_NOT_FOUND', 'Select a command before editing parameters')
    fullDraft =
      value === undefined
        ? unsetCommandParameter(item.form, fullDraft, field)
        : setCommandParameter(item.form, fullDraft, field, value)
    state.replace({
      ...current,
      draft: publicDraft(item.form, fullDraft),
      execution: { status: 'idle', commandId: null, result: null, error: null },
    })
    return summary()
  }

  const resetParameters = (): CommandPaletteSummary => {
    const current = state.reader.getSnapshot()
    const item = current.selectedId ? current.items[current.selectedId] : undefined
    if (!item) throw new CommandError('COMMAND_NOT_FOUND', 'Select a command before resetting parameters')
    selectDraft(item)
    state.replace({
      ...current,
      draft: fullDraft ? publicDraft(item.form, fullDraft) : null,
      sensitiveResetRevision: current.sensitiveResetRevision + 1,
      execution: { status: 'idle', commandId: null, result: null, error: null },
    })
    return summary()
  }

  const execute = async (): Promise<CommandPaletteSummary> => {
    const current = state.reader.getSnapshot()
    if (current.execution.status === 'submitting')
      throw new CommandError('BUSY', 'A command palette execution is already pending')
    if (current.execution.status === 'unknown')
      throw new CommandError('RESULT_UNKNOWN', 'Resolve or change the unknown command before retrying')
    const item = current.selectedId ? current.items[current.selectedId] : undefined
    if (!item || !fullDraft) throw new CommandError('COMMAND_NOT_FOUND', 'Select a command before execution')
    if (!item.available)
      throw new CommandError('CAPABILITY_UNAVAILABLE', item.unavailableReason ?? 'Command is unavailable')
    const submittedDraft = fullDraft
    const input = commandParameterInput(item.form, submittedDraft)
    const commandId = item.descriptor.metadata.id
    state.replace({
      ...current,
      execution: { status: 'submitting', commandId, result: null, error: null },
    })
    const requestId = crypto.randomUUID()
    try {
      const execution = {
        requestId,
        version: item.descriptor.metadata.version,
        ...(item.descriptor.metadata.idempotency === 'required' ? { idempotencyKey: crypto.randomUUID() } : {}),
      }
      const result =
        item.descriptor.metadata.execution === 'host'
          ? await options.commandCatalog!.execute(item.descriptor, input, execution)
          : await executor.execute(commandId, input, execution)
      if (isDisposed()) throw new CommandError('RESULT_UNKNOWN', 'Runtime disposed before command result')
      const latest = state.reader.getSnapshot()
      if (latest.execution.commandId !== commandId || latest.execution.status !== 'submitting')
        throw new CommandError('RESULT_UNKNOWN', 'Command execution was superseded')
      fullDraft = submittedDraft
      for (const field of item.form.fields)
        if (field.sensitive && Object.hasOwn(fullDraft.values, field.name))
          fullDraft = unsetCommandParameter(item.form, fullDraft, field.name)
      state.replace({
        ...latest,
        view: 'result',
        draft: fullDraft ? publicDraft(item.form, fullDraft) : null,
        execution: { status: 'succeeded', commandId, result: resultText(result), error: null },
        sensitiveResetRevision: latest.sensitiveResetRevision + 1,
      })
      return summary()
    } catch (reason) {
      if (isDisposed()) throw reason
      const latest = state.reader.getSnapshot()
      const code = errorCode(reason)
      state.replace({
        ...latest,
        view: 'result',
        execution: {
          status: code === 'RESULT_UNKNOWN' || code === 'TIMEOUT' || code === 'DISCONNECTED' ? 'unknown' : 'failed',
          commandId,
          result: null,
          error: code,
        },
      })
      throw reason
    }
  }

  local.register(commandPaletteCommands['commandPalette.refresh'], refresh)
  local.register(commandPaletteCommands['commandPalette.setQuery'], ({ query }) => setQuery(query))
  local.register(commandPaletteCommands['commandPalette.select'], ({ commandId }) => select(commandId))
  local.register(commandPaletteCommands['commandPalette.openCommand'], ({ commandId }) => openCommand(commandId))
  local.register(commandPaletteCommands['commandPalette.back'], back)
  local.register(commandPaletteCommands['commandPalette.move'], ({ direction }) => move(direction))
  local.register(commandPaletteCommands['commandPalette.setParameter'], ({ field, value }) =>
    updateParameter(field, value),
  )
  local.register(commandPaletteCommands['commandPalette.unsetParameter'], ({ field }) =>
    updateParameter(field, undefined),
  )
  local.register(commandPaletteCommands['commandPalette.resetParameters'], resetParameters)
  local.register(commandPaletteCommands['commandPalette.execute'], execute)

  return {
    reader: state.reader,
    dispose() {
      textUnsubscribe?.()
      generation++
      fullDraft = null
      state.dispose()
    },
  }
}
