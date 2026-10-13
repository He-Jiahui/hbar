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
    workspaceNodeId: (workspaceId) => (workspaceId === 'W' ? 'node-one' : null),
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
    setRemote(count = 1) {
      const workspace = {
        id: 'W',
        name: 'docs',
        path: 'hbar-node://node-one/docs',
        createdAt: 1,
        location: { kind: 'node' as const, nodeId: 'node-one', rootId: 'docs', nodePath: '/b/docs' },
      }
      const folders = Array.from({ length: count }, (_, index) => ({
        id: index === 0 ? 'primary' : `folder-${index}`,
        alias: index === 0 ? 'docs' : `folder-${index}`,
        path: index === 0 ? workspace.path : `hbar-node://node-one/root-${index}`,
      }))
      saved = { workspace, snapshot: { schemaVersion: 1, workspaceId: 'W', revision: 4, folders } }
    },
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

test('node root selection binds to the workspace node and saves through the original revisioned receipt flow', async () => {
  const f = fixture()
  f.setRemote()
  await f.commands.execute('workspaceFolders.open', { workspaceId: 'W' })
  await f.commands.execute('workspaceFolders.addNodeRoot', {
    ...f.target(),
    nodeId: 'node-one',
    rootId: 'source',
    name: 'Source packages',
  })
  expect(f.current().folders[0]).toEqual({ id: 'primary', alias: 'docs', path: 'hbar-node://node-one/docs' })
  expect(f.current().folders[1]).toMatchObject({ alias: 'Source-packages', path: 'hbar-node://node-one/source' })
  expect(f.current().folders[1]?.id.length).toBeGreaterThan(0)
  await f.commands.execute('workspaceFolders.save', f.target())
  const save = f.calls.find((call) => call.name === 'workspace.folders.save')
  expect(save?.input).toMatchObject({ workspaceId: 'W', expectedRevision: 4 })
  expect(f.current().snapshot?.revision).toBe(5)
  expect(f.current().status).toBe('saved')
})

test('node root selection rejects another node and duplicate roots without changing the folder draft', async () => {
  const f = fixture()
  f.setRemote()
  await f.commands.execute('workspaceFolders.open', { workspaceId: 'W' })
  await f.commands.execute('workspaceFolders.addNodeRoot', {
    ...f.target(),
    nodeId: 'other-node',
    rootId: 'source',
    name: 'Source',
  })
  expect(f.current().error).toBe('WORKSPACE_NODE_MISMATCH')
  expect(f.current().folders).toHaveLength(1)
  await f.commands.execute('workspaceFolders.addNodeRoot', {
    ...f.target(),
    nodeId: 'node-one',
    rootId: 'docs',
    name: 'Docs',
  })
  expect(f.current().error).toBe('DUPLICATE_FOLDER')
  expect(f.current().folders).toHaveLength(1)
  expect(f.calls.some((call) => call.name === 'workspace.folders.save')).toBe(false)
})

test('node root selection stops at the shared workspace folder capacity', async () => {
  const f = fixture()
  f.setRemote(32)
  await f.commands.execute('workspaceFolders.open', { workspaceId: 'W' })
  await f.commands.execute('workspaceFolders.addNodeRoot', {
    ...f.target(),
    nodeId: 'node-one',
    rootId: 'source',
    name: 'Source',
  })
  expect(f.current().folders).toHaveLength(32)
  expect(f.current().validation).toBe('capacity')
  expect(f.current().folders.some((folder) => folder.path === 'hbar-node://node-one/source')).toBe(false)
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
