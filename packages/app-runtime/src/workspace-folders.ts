import { z } from 'zod'
import { CommandError, defineCommand, type CommandExecutor, type CommandRegistry } from '@hbar/commands'
import {
  WORKSPACE_FOLDER_LIMIT,
  workspaceDirectoryPageSchema,
  workspaceFolderAlias,
  workspaceFolderMutationSchema,
  workspaceFolderReceiptSchema,
  workspaceFolderResultSchema,
  workspaceFolderSnapshotSchema,
  workspaceFoldersSchema,
  type WorkspaceDirectoryPage,
  type WorkspaceFolder,
  type WorkspaceFolderMutation,
  type WorkspaceFolderResult,
  type WorkspaceFolderSnapshot,
} from '@hbar/contracts/commands/workspace-folders'
import { createState } from './state'

const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.workspace-folders',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  scope: 'client' as const,
  category: 'workspace.organization',
  visibility: 'internal' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as 'api'[],
})
const target = z.strictObject({ token: z.number().int().nonnegative() })
const output = z.strictObject({ status: z.string(), error: z.string().nullable() })
export const workspaceFoldersClientCommands = {
  'workspaceFolders.open': defineCommand(
    metadata('workspaceFolders.open'),
    z.strictObject({
      workspaceId: z.string().min(1).optional(),
      path: z.string().max(4000).optional(),
      draftId: z.string().min(1).optional(),
      draftRevision: z.number().int().nonnegative().optional(),
      createSession: z.boolean().optional(),
      browse: z.boolean().optional(),
    }),
    output,
  ),
  'workspaceFolders.close': defineCommand(metadata('workspaceFolders.close'), target, output),
  'workspaceFolders.path': defineCommand(
    metadata('workspaceFolders.path'),
    target.extend({ value: z.string().max(4000) }),
    output,
  ),
  'workspaceFolders.addPath': defineCommand(metadata('workspaceFolders.addPath'), target, output),
  'workspaceFolders.edit': defineCommand(
    metadata('workspaceFolders.edit'),
    target.extend({
      id: z.string(),
      field: z.enum(['alias', 'path']),
      value: z.string().max(4000),
    }),
    output,
  ),
  'workspaceFolders.remove': defineCommand(
    metadata('workspaceFolders.remove'),
    target.extend({ id: z.string() }),
    output,
  ),
  'workspaceFolders.move': defineCommand(
    metadata('workspaceFolders.move'),
    target.extend({ id: z.string(), direction: z.enum(['up', 'down']) }),
    output,
  ),
  'workspaceFolders.browse': defineCommand(
    metadata('workspaceFolders.browse'),
    target.extend({ path: z.string().max(4000).optional(), more: z.boolean().optional() }),
    output,
  ),
  'workspaceFolders.toggle': defineCommand(
    metadata('workspaceFolders.toggle'),
    target.extend({ path: z.string().min(1).max(4000) }),
    output,
  ),
  'workspaceFolders.addSelected': defineCommand(metadata('workspaceFolders.addSelected'), target, output),
  'workspaceFolders.back': defineCommand(metadata('workspaceFolders.back'), target, output),
  'workspaceFolders.refresh': defineCommand(metadata('workspaceFolders.refresh'), target, output),
  'workspaceFolders.save': defineCommand(metadata('workspaceFolders.save'), target, output),
  'workspaceFolders.reconcile': defineCommand(metadata('workspaceFolders.reconcile'), target, output),
  'workspaceFolders.retry': defineCommand(metadata('workspaceFolders.retry'), target, output),
}

export interface WorkspaceFoldersState {
  readonly open: boolean
  readonly token: number
  readonly workspaceId: string | null
  readonly phase: 'editing' | 'browsing'
  readonly status: 'ready' | 'loading' | 'saving' | 'unknown' | 'checking' | 'saved' | 'error'
  readonly folders: readonly Readonly<WorkspaceFolder>[]
  readonly snapshot: Readonly<WorkspaceFolderSnapshot> | null
  readonly path: string
  readonly page: Readonly<WorkspaceDirectoryPage> | null
  readonly selected: readonly string[]
  readonly error: string | null
  readonly validation: 'required' | 'invalid' | 'capacity' | null
  readonly request: Readonly<WorkspaceFolderMutation> | null
  readonly key: string | null
  readonly requestInFlight: boolean
  readonly result: Readonly<WorkspaceFolderResult> | null
}
interface Options {
  readonly host?: CommandExecutor | undefined
  readonly onSubscriberError: (error: unknown) => void
  readonly onCreated: (
    result: WorkspaceFolderResult,
    entry: { draftId?: string; draftRevision?: number; createSession?: boolean },
  ) => Promise<void>
}
const initial: WorkspaceFoldersState = {
  open: false,
  token: 0,
  workspaceId: null,
  phase: 'editing',
  status: 'ready',
  folders: [],
  snapshot: null,
  path: '',
  page: null,
  selected: [],
  error: null,
  validation: null,
  request: null,
  key: null,
  requestInFlight: false,
  result: null,
}
const rejected = new Set([
  'COMMAND_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'INVALID_INPUT',
  'NOT_FOUND',
  'INVALID_WORKSPACE',
  'WORKSPACE_EXISTS',
  'DUPLICATE_FOLDER',
  'DIRECTORY_UNAVAILABLE',
  'PATH_DENIED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'BUSY',
  'INVALID_STATE',
  'CAPACITY_EXCEEDED',
])
const safe = new Set([
  ...rejected,
  'DISCONNECTED',
  'TIMEOUT',
  'RESULT_UNKNOWN',
  'INVALID_OUTPUT',
  'CANCELLED',
  'EXECUTION_FAILED',
])
function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && safe.has(error.code)
    ? error.code
    : 'EXECUTION_FAILED'
}
const pathKey = (path: string) => {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  return /^(?:[a-z]:|\/\/)/i.test(normalized) ? normalized.toLowerCase() : normalized
}

/** Host-owned configuration; Zustand owns the only draft and unresolved mutation. */
export function createWorkspaceFolders(local: CommandRegistry, options: Options) {
  const state = createState<WorkspaceFoldersState>(initial, options.onSubscriberError)
  let disposed = false
  let token = 0
  let readEpoch = 0
  let readTail = Promise.resolve()
  let writeTask: Promise<void> | null = null
  let entry: { draftId?: string; draftRevision?: number; createSession?: boolean } = {}
  const current = () => state.reader.getSnapshot()
  const publish = (patch: Partial<WorkspaceFoldersState>) => {
    if (!disposed) state.replace({ ...current(), ...patch })
  }
  const summary = () => ({ status: current().status, error: current().error })
  const locked = () => current().requestInFlight || ['saving', 'unknown', 'checking'].includes(current().status)
  const check = (captured: number, editable = true) => {
    if (disposed) throw new CommandError('DISPOSED', 'Workspace folder owner was disposed')
    if (!current().open || current().token !== captured)
      throw new CommandError('COMMAND_CONFLICT', 'The original folder editor is not open')
    if (editable && locked()) throw new CommandError('BUSY', 'Inspect the original folder request first')
    if (!options.host) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Workspace folder commands are unavailable')
  }
  function addPaths(paths: readonly string[]) {
    const folders = [...current().folders]
    for (const path of paths) {
      if (folders.some((folder) => pathKey(folder.path) === pathKey(path))) continue
      if (folders.length === WORKSPACE_FOLDER_LIMIT) {
        publish({ validation: 'capacity' })
        return
      }
      const base = workspaceFolderAlias(
        path
          .replace(/[\\/]+$/, '')
          .split(/[\\/]/)
          .at(-1) ?? '',
      )
      let alias = base
      let suffix = 2
      while (folders.some((folder) => folder.alias.toLowerCase() === alias.toLowerCase()))
        alias = `${base.slice(0, 58)}-${suffix++}`
      folders.push({ id: crypto.randomUUID(), alias, path: path.trim() })
    }
    publish({ folders, path: '', selected: [], validation: null, error: null, status: 'ready', phase: 'editing' })
  }
  // One physical read and one latest queued intent. Late pages never restore closed/other editors.
  function read(captured: number, operation: 'get' | 'browse', path?: string, more = false): Promise<void> {
    const epoch = ++readEpoch
    const previous = current().page
    publish({ status: 'loading', error: null, ...(operation === 'browse' ? { phase: 'browsing' as const } : {}) })
    const run = async () => {
      if (disposed || epoch !== readEpoch || captured !== current().token || !current().open) return
      const host = options.host
      if (!host) return
      const controller = new AbortController()
      let expired = false
      const timer = setTimeout(() => {
        expired = true
        controller.abort()
        if (epoch === readEpoch && captured === current().token) publish({ status: 'error', error: 'TIMEOUT' })
      }, 30_000)
      try {
        const value =
          operation === 'get'
            ? await host.execute(
                'workspace.folders.get',
                { workspaceId: current().workspaceId },
                { signal: controller.signal },
              )
            : await host.execute(
                'workspace.folders.browse',
                {
                  ...(path ? { path } : {}),
                  ...(more && previous?.nextCursor ? { after: previous.nextCursor } : {}),
                },
                { signal: controller.signal },
              )
        if (disposed || expired || epoch !== readEpoch || captured !== current().token || !current().open) return
        if (operation === 'get') {
          const snapshot = workspaceFolderSnapshotSchema.parse(value)
          if (snapshot.workspaceId !== current().workspaceId)
            throw new CommandError('INVALID_OUTPUT', 'Folder snapshot target differs')
          publish({ snapshot, folders: snapshot.folders, status: 'ready', validation: null, error: null })
        } else {
          const page = workspaceDirectoryPageSchema.parse(value)
          if (more && (!previous || page.path !== previous.path))
            throw new CommandError('INVALID_OUTPUT', 'Directory page target differs')
          // Pagination grows only to the Host scan bound, never an unbounded directory cache.
          const items =
            more && previous
              ? [...previous.items, ...page.items]
                  .filter((item, index, all) => all.findIndex((candidate) => candidate.path === item.path) === index)
                  .slice(0, 5000)
              : page.items
          publish({ page: { ...page, items }, path: page.path, status: 'ready', error: null })
        }
      } catch (error) {
        if (!disposed && !expired && epoch === readEpoch && captured === current().token && current().open)
          publish({ status: 'error', error: error instanceof z.ZodError ? 'INVALID_OUTPUT' : errorCode(error) })
      } finally {
        clearTimeout(timer)
      }
    }
    readTail = readTail.then(run, run)
    return readTail
  }
  function validResult(value: unknown, request: WorkspaceFolderMutation): WorkspaceFolderResult {
    const result = workspaceFolderResultSchema.parse(value)
    const { snapshot, workspace } = result
    if (
      snapshot.workspaceId !== workspace.id ||
      snapshot.folders.length !== request.input.folders.length ||
      snapshot.folders.some(
        (folder, index) =>
          folder.id !== request.input.folders[index]?.id || folder.alias !== request.input.folders[index]?.alias,
      ) ||
      (request.operation === 'save' &&
        (workspace.id !== request.input.workspaceId || snapshot.revision !== request.input.expectedRevision + 1))
    )
      throw new CommandError('INVALID_OUTPUT', 'Folder mutation confirmation differs from the original request')
    return result
  }
  async function perform(request: WorkspaceFolderMutation, key: string, receipt: boolean) {
    if (writeTask) throw new CommandError('BUSY', 'The original folder write is still physically in flight')
    const captured = current().token
    const capturedEntry = entry
    const host = options.host
    if (!host) return
    publish({ request, key, status: receipt ? 'checking' : 'saving', error: null, requestInFlight: true })
    let expired = false
    const controller = new AbortController()
    const timer = setTimeout(() => {
      expired = true
      controller.abort()
      publish({ status: 'unknown', error: 'TIMEOUT' })
    }, 30_000)
    const task = (async () => {
      try {
        const value = receipt
          ? await host.execute(
              'workspace.folders.receipt',
              { idempotencyKey: key, request },
              { signal: controller.signal },
            )
          : await host.execute(`workspace.folders.${request.operation}`, request.input, {
              idempotencyKey: key,
              signal: controller.signal,
            })
        if (disposed || expired) return
        let result: WorkspaceFolderResult
        if (receipt) {
          const confirmation = workspaceFolderReceiptSchema.nullable().parse(value)
          if (!confirmation) {
            publish({ status: 'unknown', error: 'RESULT_UNKNOWN' })
            return
          }
          if (JSON.stringify(confirmation.request) !== JSON.stringify(request))
            throw new CommandError('INVALID_OUTPUT', 'Folder receipt request differs')
          result = validResult(confirmation.result, request)
        } else result = validResult(value, request)
        publish({
          result,
          snapshot: result.snapshot,
          folders: result.snapshot.folders,
          workspaceId: result.workspace.id,
          request: null,
          key: null,
          status: 'saved',
          error: null,
        })
        // A confirmed mutation remains confirmed even if its optional navigation subsequently fails.
        if (request.operation === 'create' && current().open && captured === current().token) {
          try {
            await options.onCreated(result, capturedEntry)
          } catch {
            publish({ error: 'NAVIGATION_FAILED' })
          }
        }
      } catch (error) {
        if (disposed || expired) return
        const code = error instanceof z.ZodError ? 'INVALID_OUTPUT' : errorCode(error)
        publish({
          status: !receipt && rejected.has(code) ? 'error' : 'unknown',
          error: code,
          ...(!receipt && rejected.has(code) ? { request: null, key: null } : {}),
        })
      } finally {
        clearTimeout(timer)
        writeTask = null
        publish({ requestInFlight: false })
      }
    })()
    writeTask = task
    await task
  }
  const off = [
    local.register(workspaceFoldersClientCommands['workspaceFolders.open'], async (input) => {
      if (disposed) throw new CommandError('DISPOSED', 'Folder owner was disposed')
      if (!options.host) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Workspace folder commands are unavailable')
      if (locked()) {
        publish({ open: true })
        return summary()
      }
      readEpoch++
      entry = {
        ...(input.draftId ? { draftId: input.draftId } : {}),
        ...(input.draftRevision !== undefined ? { draftRevision: input.draftRevision } : {}),
        ...(input.createSession ? { createSession: true } : {}),
      }
      state.replace({
        ...initial,
        open: true,
        token: ++token,
        workspaceId: input.workspaceId ?? null,
        path: input.path ?? '',
      })
      const captured = token
      if (input.workspaceId) await read(captured, 'get')
      else if (input.path?.trim() && !input.browse) addPaths([input.path.trim()])
      if (input.browse && current().open && current().token === captured)
        await read(captured, 'browse', input.path?.trim() || undefined)
      return summary()
    }),
    local.register(workspaceFoldersClientCommands['workspaceFolders.close'], ({ token: captured }) => {
      check(captured, false)
      readEpoch++
      publish({ open: false })
      return summary()
    }),
    local.register(workspaceFoldersClientCommands['workspaceFolders.path'], ({ token: captured, value }) => {
      check(captured)
      publish({ path: value })
      return summary()
    }),
    local.register(workspaceFoldersClientCommands['workspaceFolders.addPath'], ({ token: captured }) => {
      check(captured)
      if (current().path.trim()) addPaths([current().path.trim()])
      else publish({ validation: 'required' })
      return summary()
    }),
    local.register(workspaceFoldersClientCommands['workspaceFolders.edit'], ({ token: captured, id, field, value }) => {
      check(captured)
      if (current().status === 'loading') throw new CommandError('BUSY', 'Folder snapshot is loading')
      if (!current().folders.some((folder) => folder.id === id))
        throw new CommandError('NOT_FOUND', 'Original folder was removed')
      publish({
        folders: current().folders.map((folder) => (folder.id === id ? { ...folder, [field]: value } : folder)),
        validation: null,
        error: null,
        status: 'ready',
      })
      return summary()
    }),
    local.register(workspaceFoldersClientCommands['workspaceFolders.remove'], ({ token: captured, id }) => {
      check(captured)
      publish({
        folders: current().folders.filter((folder) => folder.id !== id),
        validation: null,
        error: null,
        status: 'ready',
      })
      return summary()
    }),
    local.register(workspaceFoldersClientCommands['workspaceFolders.move'], ({ token: captured, id, direction }) => {
      check(captured)
      const folders = [...current().folders]
      const index = folders.findIndex((folder) => folder.id === id)
      const other = index + (direction === 'up' ? -1 : 1)
      if (index < 0) throw new CommandError('NOT_FOUND', 'Original folder was removed')
      if (other >= 0 && other < folders.length) [folders[index], folders[other]] = [folders[other]!, folders[index]!]
      publish({ folders, validation: null, error: null, status: 'ready' })
      return summary()
    }),
    local.register(
      workspaceFoldersClientCommands['workspaceFolders.browse'],
      async ({ token: captured, path, more }) => {
        check(captured)
        await read(captured, 'browse', path || current().path || undefined, more)
        return summary()
      },
    ),
    local.register(workspaceFoldersClientCommands['workspaceFolders.toggle'], ({ token: captured, path }) => {
      check(captured)
      const selected = current().selected
      if (!selected.includes(path) && selected.length + current().folders.length >= WORKSPACE_FOLDER_LIMIT)
        publish({ validation: 'capacity' })
      else
        publish({
          selected: selected.includes(path) ? selected.filter((item) => item !== path) : [...selected, path],
          validation: null,
        })
      return summary()
    }),
    local.register(workspaceFoldersClientCommands['workspaceFolders.addSelected'], ({ token: captured }) => {
      check(captured)
      readEpoch++
      addPaths(current().selected)
      return summary()
    }),
    local.register(workspaceFoldersClientCommands['workspaceFolders.back'], ({ token: captured }) => {
      check(captured)
      readEpoch++
      publish({ phase: 'editing', path: '', status: 'ready', error: null })
      return summary()
    }),
    local.register(workspaceFoldersClientCommands['workspaceFolders.refresh'], async ({ token: captured }) => {
      check(captured)
      if (current().workspaceId) await read(captured, 'get')
      return summary()
    }),
    local.register(workspaceFoldersClientCommands['workspaceFolders.save'], async ({ token: captured }) => {
      check(captured)
      if (current().status === 'loading') throw new CommandError('BUSY', 'Folder snapshot is loading')
      const parsed = workspaceFoldersSchema.safeParse(current().folders)
      if (!parsed.success) {
        publish({ validation: current().folders.length ? 'invalid' : 'required' })
        return summary()
      }
      const owner = current().workspaceId
      if (owner && !current().snapshot) throw new CommandError('BUSY', 'Load the original folder snapshot first')
      const request = workspaceFolderMutationSchema.parse(
        owner
          ? {
              operation: 'save',
              input: { workspaceId: owner, expectedRevision: current().snapshot!.revision, folders: parsed.data },
            }
          : { operation: 'create', input: { folders: parsed.data } },
      )
      await perform(request, crypto.randomUUID(), false)
      return summary()
    }),
    ...(['reconcile', 'retry'] as const).map((action) =>
      local.register(workspaceFoldersClientCommands[`workspaceFolders.${action}`], async ({ token: captured }) => {
        check(captured, false)
        const { request, key, status } = current()
        if (status !== 'unknown' || !request || !key)
          throw new CommandError('COMMAND_CONFLICT', 'No unresolved original request')
        await perform(workspaceFolderMutationSchema.parse(request), key, action === 'reconcile')
        return summary()
      }),
    ),
  ]
  return {
    reader: state.reader,
    dispose() {
      disposed = true
      readEpoch++
      for (const stop of off) stop()
      state.dispose()
    },
  }
}
