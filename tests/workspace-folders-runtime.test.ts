import { afterEach, expect, test } from 'bun:test'
import {
  CommandError,
  CommandRegistry,
  createCommandClient,
  type CommandExecutor,
  type ExecuteOptions,
} from '@hbar/commands'
import {
  workspaceFolderMutationSchema,
  type WorkspaceDirectoryPage,
  type WorkspaceFolderMutation,
  type WorkspaceFolderResult,
} from '@hbar/contracts/commands/workspace-folders'
import { createWorkspaceFolders, workspaceFoldersClientCommands } from '../packages/app-runtime/src/workspace-folders'

const owners: ReturnType<typeof createWorkspaceFolders>[] = []
afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose()
})
function deferred<Value>() {
  let resolve!: (value: Value) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<Value>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const page = (path = '/server', names = ['frontend', 'backend']): WorkspaceDirectoryPage => ({
  path,
  parent: path === '/server' ? null : '/server',
  roots: [{ name: 'server', path: '/server' }],
  items: names.map((name) => ({ name, path: `${path}/${name}` })),
  nextCursor: null,
  scanTruncated: false,
})
function fixture() {
  const calls: { name: string; input: unknown; key?: string }[] = []
  const confirmations = new Map<string, { request: WorkspaceFolderMutation; result: WorkspaceFolderResult }>()
  const replies = new Map<string, (input: unknown, options?: ExecuteOptions) => unknown | Promise<unknown>>()
  const folder = { id: 'folder', alias: 'main', path: '/server/main' }
  let saved: WorkspaceFolderResult = {
    workspace: { id: 'W', name: 'main', path: '/server/main', createdAt: 1 },
    snapshot: { schemaVersion: 1, workspaceId: 'W', revision: 0, folders: [folder] },
  }
  const navigations: WorkspaceFolderResult[] = []
  const host: CommandExecutor = {
    async execute(name, input, options) {
      calls.push({
        name,
        input: structuredClone(input),
        ...(options?.idempotencyKey ? { key: options.idempotencyKey } : {}),
      })
      const reply = replies.get(name)
      if (reply) return reply(input, options)
      if (name === 'workspace.folders.get') return saved.snapshot
      if (name === 'workspace.folders.browse') return page()
      if (name === 'workspace.folders.receipt') {
        const lookup = input as { idempotencyKey: string }
        return confirmations.get(lookup.idempotencyKey) ?? null
      }
      const operation = name === 'workspace.folders.create' ? 'create' : 'save'
      const request = workspaceFolderMutationSchema.parse({ operation, input })
      const key = options?.idempotencyKey ?? ''
      const previous = confirmations.get(key)
      if (previous) return previous.result
      saved = {
        workspace: saved.workspace,
        snapshot: {
          schemaVersion: 1,
          workspaceId: 'W',
          revision: request.operation === 'save' ? request.input.expectedRevision + 1 : 1,
          folders: request.input.folders,
        },
      }
      confirmations.set(key, { request, result: saved })
      return saved
    },
  }
  const local = new CommandRegistry()
  const owner = createWorkspaceFolders(local, {
    host,
    onSubscriberError: (error) => {
      throw error
    },
    onCreated: async (result) => {
      navigations.push(result)
    },
  })
  owners.push(owner)
  const commands = createCommandClient(workspaceFoldersClientCommands, local)
  return {
    owner,
    commands,
    calls,
    confirmations,
    replies,
    navigations,
    current: () => owner.reader.getSnapshot(),
    target: () => ({ token: owner.reader.getSnapshot().token }),
  }
}

test('multi-selection across directory pages becomes one ordered workspace with editable aliases', async () => {
  const f = fixture()
  await f.commands.execute('workspaceFolders.open', { browse: true })
  expect(f.current().phase).toBe('browsing')
  await f.commands.execute('workspaceFolders.toggle', { ...f.target(), path: '/server/frontend' })
  f.replies.set('workspace.folders.browse', () => page('/other', ['frontend']))
  await f.commands.execute('workspaceFolders.browse', { ...f.target(), path: '/other' })
  await f.commands.execute('workspaceFolders.toggle', { ...f.target(), path: '/other/frontend' })
  await f.commands.execute('workspaceFolders.addSelected', f.target())
  expect(f.current().folders.map((folder) => folder.alias)).toEqual(['frontend', 'frontend-2'])
  const second = f.current().folders[1]!
  await f.commands.execute('workspaceFolders.edit', { ...f.target(), id: second.id, field: 'alias', value: 'backend' })
  await f.commands.execute('workspaceFolders.move', { ...f.target(), id: second.id, direction: 'up' })
  await f.commands.execute('workspaceFolders.save', f.target())
  expect(f.current().status).toBe('saved')
  expect(f.current().snapshot?.folders.map((folder) => folder.alias)).toEqual(['backend', 'frontend'])
  expect(f.navigations).toHaveLength(1)
  expect(f.calls.filter((call) => call.name === 'workspace.folders.create')).toHaveLength(1)
})

test('zero roots cannot save; invalid or case-insensitive duplicate aliases cannot save', async () => {
  const f = fixture()
  await f.commands.execute('workspaceFolders.open', {})
  await f.commands.execute('workspaceFolders.save', f.target())
  expect(f.current().validation).toBe('required')
  for (const path of ['/first/root', '/second/root']) {
    await f.commands.execute('workspaceFolders.path', { ...f.target(), value: path })
    await f.commands.execute('workspaceFolders.addPath', f.target())
  }
  const second = f.current().folders[1]!
  await f.commands.execute('workspaceFolders.edit', { ...f.target(), id: second.id, field: 'alias', value: 'ROOT' })
  await f.commands.execute('workspaceFolders.save', f.target())
  expect(f.current().validation).toBe('invalid')
  await f.commands.execute('workspaceFolders.edit', {
    ...f.target(),
    id: second.id,
    field: 'alias',
    value: '../escape',
  })
  await f.commands.execute('workspaceFolders.save', f.target())
  expect(f.current().validation).toBe('invalid')
  expect(f.calls.some((call) => call.name === 'workspace.folders.create')).toBe(false)
})

test('folder capacity is bounded at 32 and a duplicate path does not consume another slot', async () => {
  const f = fixture()
  await f.commands.execute('workspaceFolders.open', {})
  for (let index = 0; index < 32; index++) {
    await f.commands.execute('workspaceFolders.path', { ...f.target(), value: `/server/folder-${index}` })
    await f.commands.execute('workspaceFolders.addPath', f.target())
  }
  await f.commands.execute('workspaceFolders.path', { ...f.target(), value: '/server/folder-0/' })
  await f.commands.execute('workspaceFolders.addPath', f.target())
  expect(f.current().folders).toHaveLength(32)
  await f.commands.execute('workspaceFolders.path', { ...f.target(), value: '/server/overflow' })
  await f.commands.execute('workspaceFolders.addPath', f.target())
  expect(f.current().validation).toBe('capacity')
  expect(f.current().folders).toHaveLength(32)
  await f.commands.execute('workspaceFolders.save', f.target())
  expect(f.current().snapshot?.folders).toHaveLength(32)
})

test('remove is an unsaved reference edit, never a Host file deletion, and stale row intents fail', async () => {
  const f = fixture()
  await f.commands.execute('workspaceFolders.open', { workspaceId: 'W' })
  const folder = f.current().folders[0]!
  await f.commands.execute('workspaceFolders.remove', { ...f.target(), id: folder.id })
  expect(f.current().folders).toHaveLength(0)
  await expect(
    f.commands.execute('workspaceFolders.edit', { ...f.target(), id: folder.id, field: 'path', value: '/other' }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  expect(f.calls.map((call) => call.name)).toEqual(['workspace.folders.get'])
  await f.commands.execute('workspaceFolders.refresh', f.target())
  expect(f.current().folders).toHaveLength(1)
})

test('closed/replaced editor ignores a late browse page and old target callbacks', async () => {
  const f = fixture()
  await f.commands.execute('workspaceFolders.open', {})
  const old = f.target()
  const wait = deferred<WorkspaceDirectoryPage>()
  f.replies.set('workspace.folders.browse', () => wait.promise)
  const browsing = f.commands.execute('workspaceFolders.browse', old)
  await Bun.sleep(1)
  await f.commands.execute('workspaceFolders.close', old)
  await f.commands.execute('workspaceFolders.open', { path: '/new/root' })
  wait.resolve(page('/late'))
  await browsing
  expect(f.current().page).toBeNull()
  expect(f.current().folders[0]?.path).toBe('/new/root')
  await expect(
    f.commands.execute('workspaceFolders.remove', { ...old, id: f.current().folders[0]!.id }),
  ).rejects.toMatchObject({ code: 'COMMAND_CONFLICT' })
})

test('unknown writes retain exact request/key across close and receipt reconciliation', async () => {
  const f = fixture()
  await f.commands.execute('workspaceFolders.open', { path: '/server/main' })
  f.replies.set('workspace.folders.create', (input, options) => {
    const request = workspaceFolderMutationSchema.parse({ operation: 'create', input })
    f.confirmations.set(options!.idempotencyKey!, {
      request,
      result: {
        workspace: { id: 'W', name: 'main', path: '/server/main', createdAt: 1 },
        snapshot: { schemaVersion: 1, workspaceId: 'W', revision: 1, folders: request.input.folders },
      },
    })
    throw new CommandError('RESULT_UNKNOWN', 'Response lost')
  })
  await f.commands.execute('workspaceFolders.save', f.target())
  expect(f.current().status).toBe('unknown')
  const original = f.target()
  const key = f.current().key
  await f.commands.execute('workspaceFolders.close', original)
  await f.commands.execute('workspaceFolders.open', { path: '/different' })
  expect(f.target()).toEqual(original)
  expect(f.current().key).toBe(key)
  await expect(
    f.commands.execute('workspaceFolders.edit', {
      ...f.target(),
      id: f.current().folders[0]!.id,
      field: 'alias',
      value: 'changed',
    }),
  ).rejects.toMatchObject({ code: 'BUSY' })
  await f.commands.execute('workspaceFolders.reconcile', f.target())
  expect(f.current().status).toBe('saved')
  expect(f.navigations).toHaveLength(1)
})

test('absent receipt permits only retrying the same idempotency key', async () => {
  const f = fixture()
  await f.commands.execute('workspaceFolders.open', { path: '/server/main' })
  f.replies.set('workspace.folders.create', () => {
    throw new CommandError('RESULT_UNKNOWN', 'Unknown')
  })
  await f.commands.execute('workspaceFolders.save', f.target())
  const key = f.current().key
  await f.commands.execute('workspaceFolders.reconcile', f.target())
  expect(f.current().status).toBe('unknown')
  f.replies.delete('workspace.folders.create')
  await f.commands.execute('workspaceFolders.retry', f.target())
  expect(f.calls.filter((call) => call.name === 'workspace.folders.create').map((call) => call.key)).toEqual([
    key!,
    key!,
  ])
  expect(f.current().status).toBe('saved')
})

test('wrong-target confirmations are unknown; known revision conflicts retain editable draft', async () => {
  const f = fixture()
  await f.commands.execute('workspaceFolders.open', { workspaceId: 'W' })
  f.replies.set('workspace.folders.save', () => {
    throw new CommandError('COMMAND_CONFLICT', 'Other window')
  })
  await f.commands.execute('workspaceFolders.save', f.target())
  expect(f.current().status).toBe('error')
  expect(f.current().request).toBeNull()
  expect(f.current().folders[0]?.alias).toBe('main')
  f.replies.set('workspace.folders.save', (input) => {
    const request = workspaceFolderMutationSchema.parse({ operation: 'save', input })
    return {
      workspace: { id: 'OTHER', name: 'wrong', path: '/wrong', createdAt: 1 },
      snapshot: { schemaVersion: 1, workspaceId: 'OTHER', revision: 1, folders: request.input.folders },
    }
  })
  await f.commands.execute('workspaceFolders.save', f.target())
  expect(f.current().status).toBe('unknown')
  expect(f.current().error).toBe('INVALID_OUTPUT')
})

test('one physical mutation survives closing the editor without late navigation', async () => {
  const f = fixture()
  await f.commands.execute('workspaceFolders.open', { path: '/server/main' })
  const wait = deferred<unknown>()
  f.replies.set('workspace.folders.create', () => wait.promise)
  const saving = f.commands.execute('workspaceFolders.save', f.target())
  await Bun.sleep(1)
  await expect(f.commands.execute('workspaceFolders.save', f.target())).rejects.toMatchObject({ code: 'BUSY' })
  await f.commands.execute('workspaceFolders.close', f.target())
  const request = f.current().request!
  wait.resolve({
    workspace: { id: 'W', name: 'main', path: '/server/main', createdAt: 1 },
    snapshot: { schemaVersion: 1, workspaceId: 'W', revision: 1, folders: request.input.folders },
  })
  await saving
  expect(f.current().open).toBe(false)
  expect(f.current().status).toBe('saved')
  expect(f.navigations).toHaveLength(0)
})
