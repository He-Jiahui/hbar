import {
  CommandRegistry,
  CommandError,
  createCommandClient,
  validationError,
  type ExecuteOptions,
} from '@hbar/commands'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { directoryCommands } from '@hbar/contracts/commands'
import { sessionSchema, workspaceSchema, sessionPageSchema, workspacePageSchema } from '@hbar/contracts/directory'
import type { Session, Workspace } from '@hbar/contracts/directory'
import { createState, type StateReader } from './state'
import type { DirectoryState, NavigationState, RuntimeOptions } from './types'
function decode<Schema extends z.ZodType>(schema: Schema, value: unknown): z.output<Schema> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw validationError('INVALID_OUTPUT', parsed.error)
  return parsed.data
}

export function createDirectoryModule(
  options: RuntimeOptions,
  navigation: StateReader<NavigationState>,
  onSessionUnavailable: (id: string) => void,
  onSubscriberError: (error: unknown) => void,
) {
  const directory = createState<DirectoryState>({ workspaces: {}, sessions: {} }, onSubscriberError)
  const remote = new CommandRegistry({ execution: 'host' })
  let disposed = false
  const requests = new Map<string, number>()
  let sequence = 0
  function mergeSessions(items: readonly Session[]): void {
    if (new Set(items.map((item) => item.id)).size !== items.length)
      throw new CommandError('INVALID_OUTPUT', 'Duplicate Session IDs')
    const current = directory.reader.getSnapshot()
    const entries = new Map(Object.entries(current.sessions))
    for (const item of items) {
      const prior = entries.get(item.id)
      if (!prior || item.seq > prior.seq || (item.seq === prior.seq && item.updatedAt >= prior.updatedAt))
        entries.set(item.id, item)
    }
    const selected = navigation.getSnapshot().sessionId
    while (entries.size > 1000) {
      const candidate = [...entries.keys()].find((id) => id !== selected)
      if (candidate === undefined) break
      entries.delete(candidate)
    }
    directory.replace({ ...current, sessions: Object.fromEntries(entries) })
  }
  function mergeWorkspaces(items: readonly Workspace[]): void {
    if (new Set(items.map((item) => item.id)).size !== items.length)
      throw new CommandError('INVALID_OUTPUT', 'Duplicate Workspace IDs')
    const current = directory.reader.getSnapshot()
    const entries = new Map(Object.entries(current.workspaces))
    for (const item of items) entries.set(item.id, item)
    const selected = navigation.getSnapshot().workspaceId
    while (entries.size > 200) {
      const candidate = [...entries.keys()].find((id) => id !== selected)
      if (candidate === undefined) break
      entries.delete(candidate)
    }
    directory.replace({ ...current, workspaces: Object.fromEntries(entries) })
  }
  async function read(
    name: string,
    input: unknown,
    execution: ExecuteOptions,
  ): Promise<{ value: unknown; latest: boolean }> {
    const key = `${name}:${JSON.stringify(input)}`
    const current = ++sequence
    requests.set(key, current)
    try {
      const result = await options.directory.execute(name, input, execution)
      if (disposed || execution.signal?.aborted)
        throw new CommandError('QUERY_SUPERSEDED', 'Query no longer belongs to this runtime generation')
      return { value: result, latest: requests.get(key) === current }
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    } finally {
      if (requests.get(key) === current) requests.delete(key)
    }
  }

  remote.register(directoryCommands['workspace.list'], async (input, context) => {
    const response = await read('workspace.list', input, context)
    const page = decode(workspacePageSchema, response.value)
    if (response.latest) mergeWorkspaces(page.items)
    return page
  })
  remote.register(directoryCommands['workspace.get'], async (input, context) => {
    const response = await read('workspace.get', input, context)
    const item = decode(workspaceSchema.nullable(), response.value)
    if (item && item.id !== input.workspaceId) throw new CommandError('INVALID_OUTPUT', 'Workspace target mismatch')
    if (item && response.latest) mergeWorkspaces([item])
    return item
  })
  remote.register(directoryCommands['session.list'], async (input, context) => {
    const response = await read('session.list', input, context)
    const page = decode(sessionPageSchema, response.value)
    if (
      page.items.some(
        (item) =>
          item.workspaceId !== input.workspaceId ||
          (!input.includeArchived && item.archived) ||
          (input.title !== undefined && item.title !== input.title),
      )
    )
      throw new CommandError('INVALID_OUTPUT', 'Session page does not match its query')
    if (response.latest) mergeSessions(page.items)
    return page
  })
  remote.register(directoryCommands['session.get'], async (input, context) => {
    const response = await read('session.get', input, context)
    const item = decode(sessionSchema.nullable(), response.value)
    if (item && item.id !== input.sessionId) throw new CommandError('INVALID_OUTPUT', 'Session target mismatch')
    if (item && response.latest) mergeSessions([item])
    if ((!item || item.archived) && response.latest) onSessionUnavailable(input.sessionId)
    if (!item && response.latest) {
      const current = directory.reader.getSnapshot()
      directory.replace({
        ...current,
        sessions: Object.fromEntries(Object.entries(current.sessions).filter(([id]) => id !== input.sessionId)),
      })
    }
    return item
  })
  const queries = createCommandClient(directoryCommands, remote)

  return {
    queries,
    async openWorkspace(path: string, execution: ExecuteOptions): Promise<Workspace> {
      if (!options.workspaces)
        throw new CommandError('CAPABILITY_UNAVAILABLE', 'This runtime cannot register Host workspaces')
      const value = await options.workspaces.execute('workspace.create', { path }, execution)
      const workspace = decode(workspaceSchema, value)
      if (!disposed && !execution.signal?.aborted) mergeWorkspaces([workspace])
      return workspace
    },
    registry: remote,
    reader: directory.reader,
    dispose() {
      disposed = true
      remote.dispose()
      directory.dispose()
      requests.clear()
    },
  }
}
export type DirectoryQueries = ReturnType<typeof createDirectoryModule>['queries']
