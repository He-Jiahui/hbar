import { CommandError, createCommandClient, type CommandExecutor, type ExecuteOptions } from '@hbar/commands'
import type {
  ScheduleDefinition,
  ScheduleOccurrence,
  ScheduleCreateInput,
  ScheduleUpdateInput,
  ScheduleListInput,
  ScheduleOccurrenceListInput,
  SchedulePreviewInput,
} from '@hbar/contracts/commands/schedules'
import { scheduleCommands, scheduleDefinitionSchema } from '@hbar/contracts/commands/schedules'
import { createState, type StateReader } from './state'

export interface ScheduleRuntimeState {
  readonly workspaceId: string | null
  readonly schedules: readonly ScheduleDefinition[]
  readonly next: string | null
  readonly capacityReached: boolean
  readonly occurrences: Readonly<Record<string, readonly ScheduleOccurrence[]>>
  readonly occurrenceNext: Readonly<Record<string, string | null>>
  readonly selectedId: string | null
  readonly draft: unknown | null
  readonly status: 'idle' | 'loading' | 'ready' | 'error' | 'unknown'
  readonly mutation: 'idle' | 'submitting' | 'succeeded' | 'failed' | 'unknown'
  readonly pendingWorkspaceId: string | null
  readonly error: string | null
}
export type ScheduleCommandPort = CommandExecutor
function requireOriginalSchedulePage<T extends { readonly id: string }>(
  items: readonly T[],
  matches: (item: T) => boolean,
): void {
  const ids = new Set<string>()
  for (const item of items) {
    if (!matches(item) || ids.has(item.id))
      throw new CommandError('INVALID_OUTPUT', 'Schedule page contains a duplicate or foreign target')
    ids.add(item.id)
  }
}
type ScheduleCommandOptions = ExecuteOptions
type PendingWrite =
  | {
      readonly commandId: 'schedule.create'
      readonly input: ScheduleCreateInput
      readonly key: string
      readonly workspaceId: string
    }
  | {
      readonly commandId: 'schedule.update'
      readonly input: ScheduleUpdateInput
      readonly key: string
      readonly workspaceId: string
    }
  | {
      readonly commandId: 'schedule.delete'
      readonly input: { scheduleId: string; expectedRevision: number }
      readonly key: string
      readonly workspaceId: string | null
    }
export interface ScheduleRuntime {
  readonly reader: StateReader<ScheduleRuntimeState>
  get(scheduleId: string): Promise<ScheduleDefinition | null>
  refresh(workspaceId: string): Promise<void>
  loadMore(): Promise<void>
  refreshOccurrences(scheduleId: string): Promise<void>
  loadMoreOccurrences(scheduleId: string): Promise<void>
  create(input: ScheduleCreateInput, options: ScheduleCommandOptions): Promise<ScheduleDefinition>
  update(input: ScheduleUpdateInput, options: ScheduleCommandOptions): Promise<ScheduleDefinition>
  remove(
    input: { scheduleId: string; expectedRevision: number },
    options: ScheduleCommandOptions,
  ): Promise<{ scheduleId: string; revision: number }>
  preview(
    input: SchedulePreviewInput,
    options?: ScheduleCommandOptions,
  ): Promise<{ occurrences: number[]; timezone: string }>
  reconcile(): Promise<void>
  dispose(): void
}
export function createScheduleRuntime(
  port: ScheduleCommandPort,
  onSubscriberError: (error: unknown) => void = () => {},
): ScheduleRuntime {
  const commands = createCommandClient(scheduleCommands, port)
  const client = {
    ...commands,
    list: (input: ScheduleListInput, options?: ExecuteOptions) => commands.execute('schedule.list', input, options),
    occurrences: (input: ScheduleOccurrenceListInput, options?: ExecuteOptions) =>
      commands.execute('schedule.occurrences', input, options),
    create: (input: ScheduleCreateInput, options: ExecuteOptions) =>
      commands.execute('schedule.create', input, options),
    update: (input: ScheduleUpdateInput, options: ExecuteOptions) =>
      commands.execute('schedule.update', input, options),
    delete: (input: { scheduleId: string; expectedRevision: number }, options: ExecuteOptions) =>
      commands.execute('schedule.delete', input, options),
    preview: (input: SchedulePreviewInput, options?: ExecuteOptions) =>
      commands.execute('schedule.preview', input, options),
  }
  const state = createState<ScheduleRuntimeState>(
    {
      workspaceId: null,
      schedules: [],
      next: null,
      capacityReached: false,
      occurrences: {},
      occurrenceNext: {},
      selectedId: null,
      draft: null,
      status: 'idle',
      mutation: 'idle',
      pendingWorkspaceId: null,
      error: null,
    },
    onSubscriberError,
  )
  const read = () => state.reader.getSnapshot()
  let generation = 0
  let disposed = false
  let readController: AbortController | undefined
  let pending: PendingWrite | null = null
  let writing = false
  let loadingMore = false
  const occurrenceRequests = new Map<string, AbortController>()
  const assertActive = () => {
    if (disposed) throw new CommandError('DISPOSED', 'Scheduling runtime is disposed')
  }
  const fail = (error: unknown) => {
    if (!disposed)
      state.replace({
        ...read(),
        status: read().mutation === 'unknown' ? 'unknown' : 'error',
        error: error instanceof Error ? error.message : String(error),
      })
  }
  const refresh = async (workspaceId: string) => {
    if (disposed) return
    readController?.abort()
    const currentGeneration = ++generation
    const request = new AbortController()
    readController = request
    const changed = read().workspaceId !== workspaceId
    if (changed) {
      for (const active of occurrenceRequests.values()) active.abort()
      occurrenceRequests.clear()
    }
    state.replace({
      ...read(),
      workspaceId,
      ...(changed ? { schedules: [], next: null, capacityReached: false, occurrences: {}, occurrenceNext: {} } : {}),
      status: 'loading',
      error: null,
    })
    try {
      const page = await client.list({ workspaceId, limit: 100 }, { signal: request.signal })
      requireOriginalSchedulePage(page.items, (item) => item.workspaceId === workspaceId)
      if (!disposed && currentGeneration === generation)
        state.replace({
          ...read(),
          schedules: page.items,
          next: page.next,
          capacityReached: false,
          status: read().mutation === 'unknown' ? 'unknown' : 'ready',
          error: null,
        })
    } catch (error) {
      if (!request.signal.aborted && currentGeneration === generation) fail(error)
    }
  }
  async function occurrencePage(scheduleId: string, append: boolean) {
    if (disposed || !read().schedules.some((item) => item.id === scheduleId)) return
    const cursor = append ? read().occurrenceNext[scheduleId] : null
    if (
      append &&
      (!cursor || (read().occurrences[scheduleId]?.length ?? 0) >= 400 || occurrenceRequests.has(scheduleId))
    )
      return
    occurrenceRequests.get(scheduleId)?.abort()
    const request = new AbortController()
    occurrenceRequests.set(scheduleId, request)
    const currentGeneration = generation
    try {
      const page = await client.occurrences(
        { scheduleId, after: cursor ?? null, limit: 100 },
        { signal: request.signal },
      )
      requireOriginalSchedulePage(page.items, (item) => item.scheduleId === scheduleId)
      if (disposed || request.signal.aborted || currentGeneration !== generation) return
      const previous = append ? (read().occurrences[scheduleId] ?? []) : []
      const byId = new Map(previous.map((item) => [item.id, item]))
      for (const item of page.items) byId.set(item.id, item)
      const items = [...byId.values()].slice(0, 400)
      state.replace({
        ...read(),
        occurrences: { ...read().occurrences, [scheduleId]: items },
        occurrenceNext: { ...read().occurrenceNext, [scheduleId]: items.length >= 400 ? null : page.next },
        error: null,
      })
    } catch (error) {
      if (!request.signal.aborted && currentGeneration === generation) fail(error)
    } finally {
      if (occurrenceRequests.get(scheduleId) === request) occurrenceRequests.delete(scheduleId)
    }
  }
  function accept(write: PendingWrite, value: unknown) {
    if (write.commandId === 'schedule.delete') {
      const result = scheduleCommands['schedule.delete'].output.parse(value)
      if (result.scheduleId !== write.input.scheduleId)
        throw new CommandError('INVALID_OUTPUT', 'Schedule deletion receipt target changed')
      if (read().workspaceId === write.workspaceId)
        state.replace({ ...read(), schedules: read().schedules.filter((item) => item.id !== result.scheduleId) })
      return result
    }
    const saved = scheduleDefinitionSchema.parse(value)
    if (
      saved.workspaceId !== write.workspaceId ||
      (write.commandId === 'schedule.update' && saved.id !== write.input.scheduleId)
    )
      throw new CommandError('INVALID_OUTPUT', 'Schedule receipt target changed')
    if (read().workspaceId === write.workspaceId) {
      const byId = new Map(read().schedules.map((item) => [item.id, item]))
      byId.set(saved.id, saved)
      state.replace({ ...read(), schedules: [...byId.values()].slice(0, 400) })
    }
    return saved
  }
  async function mutate<T>(write: PendingWrite, action: () => Promise<T>): Promise<T> {
    assertActive()
    if (writing || pending)
      throw new CommandError('BUSY', 'Reconcile the pending schedule write before submitting another')
    writing = true
    pending = write
    state.replace({ ...read(), mutation: 'submitting', pendingWorkspaceId: write.workspaceId, error: null })
    try {
      const value = await action()
      if (!disposed) {
        accept(write, value)
        pending = null
        state.replace({ ...read(), status: 'ready', mutation: 'succeeded', pendingWorkspaceId: null, error: null })
      }
      return value
    } catch (error) {
      if (!disposed) {
        const uncertain =
          (error instanceof CommandError &&
            ['RESULT_UNKNOWN', 'TIMEOUT', 'DISCONNECTED', 'INVALID_OUTPUT'].includes(error.code)) ||
          (error instanceof Error && /unknown|timed?\s*out|disconnect|invalid.output/i.test(error.message))
        if (!uncertain) pending = null
        state.replace({
          ...read(),
          status: uncertain ? 'unknown' : 'error',
          mutation: uncertain ? 'unknown' : 'failed',
          pendingWorkspaceId: uncertain ? write.workspaceId : null,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      throw error
    } finally {
      writing = false
    }
  }
  function key(options: ScheduleCommandOptions): string {
    if (!options.idempotencyKey) throw new CommandError('INVALID_INPUT', 'Schedule writes require an idempotency key')
    return options.idempotencyKey
  }
  return {
    reader: state.reader,
    get: (scheduleId) => {
      assertActive()
      return client.execute('schedule.get', { scheduleId })
    },
    refresh,
    async loadMore() {
      const current = read()
      if (disposed || loadingMore || !current.workspaceId || !current.next || current.schedules.length >= 400) return
      loadingMore = true
      const currentGeneration = generation
      try {
        const page = await client.list({ workspaceId: current.workspaceId, after: current.next, limit: 100 })
        requireOriginalSchedulePage(page.items, (item) => item.workspaceId === current.workspaceId)
        if (disposed || currentGeneration !== generation) return
        const byId = new Map(read().schedules.map((item) => [item.id, item]))
        for (const item of page.items) byId.set(item.id, item)
        const items = [...byId.values()].slice(0, 400)
        state.replace({
          ...read(),
          schedules: items,
          next: items.length >= 400 ? null : page.next,
          capacityReached: items.length >= 400 && (page.next !== null || byId.size > 400),
          status: read().mutation === 'unknown' ? 'unknown' : 'ready',
          error: null,
        })
      } catch (error) {
        if (currentGeneration === generation) fail(error)
      } finally {
        loadingMore = false
      }
    },
    refreshOccurrences: (id) => occurrencePage(id, false),
    loadMoreOccurrences: (id) => occurrencePage(id, true),
    create: (input, options) =>
      mutate({ commandId: 'schedule.create', input, key: key(options), workspaceId: input.workspaceId }, () =>
        client.create(input, options),
      ),
    update: (input, options) =>
      mutate({ commandId: 'schedule.update', input, key: key(options), workspaceId: input.workspaceId }, () =>
        client.update(input, options),
      ),
    remove: (input, options) =>
      mutate(
        {
          commandId: 'schedule.delete',
          input,
          key: key(options),
          workspaceId: read().schedules.find((item) => item.id === input.scheduleId)?.workspaceId ?? null,
        },
        () => client.delete(input, options),
      ),
    preview: (input, options) => {
      assertActive()
      return client.preview(input, options)
    },
    async reconcile() {
      assertActive()
      const write = pending
      if (!write || writing) throw new CommandError('BUSY', 'No uncertain schedule write is ready to check')
      writing = true
      try {
        const value = await client.execute('schedule.receipt', {
          commandId: write.commandId,
          input: write.input,
          idempotencyKey: write.key,
        })
        if (disposed) return
        if (value === null)
          throw new CommandError('RESULT_UNKNOWN', 'Schedule receipt is unavailable; the write remains uncertain')
        accept(write, value)
        pending = null
        state.replace({ ...read(), status: 'ready', mutation: 'succeeded', pendingWorkspaceId: null, error: null })
      } catch (error) {
        if (!disposed)
          state.replace({
            ...read(),
            status: 'unknown',
            mutation: 'unknown',
            error: error instanceof Error ? error.message : String(error),
          })
        throw error
      } finally {
        writing = false
      }
    },
    dispose() {
      disposed = true
      generation++
      readController?.abort()
      for (const request of occurrenceRequests.values()) request.abort()
      occurrenceRequests.clear()
      state.dispose()
    },
  }
}
