import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { CommandError } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import { fileCommands } from '@hbar/contracts/commands/files'

const sha = (text: string) => createHash('sha256').update(text).digest('hex')
function fixture() {
  const calls: { workspaceId: string; path: string; after?: string; limit: number; signal?: AbortSignal }[] = []
  let failure: string | null = null
  let gate: Promise<void> | null = null
  let large = false
  let largeRoot = false
  let manyFolders = false
  const runtime = createAppRuntime({
    instanceId: 'files-tree-test',
    hostId: 'host',
    surfaces: { canRender: (id) => id === 'files' },
    directory: { execute: () => Promise.reject(new Error('unused')) },
    files: {
      async execute(name, raw, options) {
        if (name === 'file.list') {
          const input = fileCommands['file.list'].input.parse(raw)
          calls.push({
            workspaceId: input.workspaceId,
            path: input.path,
            limit: input.limit,
            ...(input.after ? { after: input.after } : {}),
            ...(options?.signal ? { signal: options.signal } : {}),
          })
          if (input.path === 'docs' && gate) await gate
          if (input.path === 'docs' && failure) throw new CommandError(failure, 'Folder read failed')
          const items =
            input.path === '.'
              ? manyFolders
                ? Array.from({ length: 65 }, (_, index) => ({
                    name: `folder-${String(index).padStart(2, '0')}`,
                    path: `folder-${String(index).padStart(2, '0')}`,
                    directory: true,
                  }))
                : largeRoot
                  ? Array.from({ length: 501 }, (_, index) => ({
                      name: `root-${String(index).padStart(4, '0')}.txt`,
                      path: `root-${String(index).padStart(4, '0')}.txt`,
                      directory: false,
                    }))
                  : [
                      { name: 'docs', path: 'docs', directory: true },
                      { name: 'root.txt', path: 'root.txt', directory: false },
                    ]
              : input.path.startsWith('folder-')
                ? []
                : input.path === 'docs' && large
                  ? Array.from({ length: 501 }, (_, index) => ({
                      name: `file-${String(index).padStart(4, '0')}.txt`,
                      path: `docs/file-${String(index).padStart(4, '0')}.txt`,
                      directory: false,
                    }))
                  : input.path === 'docs'
                    ? [
                        { name: 'nested', path: 'docs/nested', directory: true },
                        { name: 'hello.txt', path: 'docs/hello.txt', directory: false },
                      ]
                    : [{ name: 'leaf.md', path: 'docs/nested/leaf.md', directory: false }]
          const start = input.after ? items.findIndex((item) => item.path === input.after) + 1 : 0
          const page = items.slice(start, start + input.limit)
          return { items: page, ...(start + page.length < items.length ? { nextCursor: page.at(-1)!.path } : {}) }
        }
        if (name === 'file.read') {
          const input = fileCommands['file.read'].input.parse(raw)
          return { ...input, text: 'source', size: 6, sha256: sha('source') }
        }
        if (name === 'file.write') throw new CommandError('RESULT_UNKNOWN', 'Write outcome unknown')
        throw new Error(`Unexpected ${name}`)
      },
    },
  })
  const execute = runtime.view.commands.execute
  const bind = async (workspaceId = 'w') => {
    await execute('app.openPanel', { instanceId: 'files', panelId: 'files', workspaceId, binding: 'pinned' })
    await execute('fileWorkspace.refresh', { instanceId: 'files' })
  }
  const tree = () => runtime.view.state.files.getSnapshot().entries.files!
  const toggle = (path: string, workspaceId = 'w') =>
    execute('fileWorkspace.toggleTree', { instanceId: 'files', workspaceId, path })
  return {
    runtime,
    execute,
    bind,
    tree,
    toggle,
    calls,
    fail: (code: string | null) => {
      failure = code
    },
    gate: (next: Promise<void> | null) => {
      gate = next
    },
    large: () => {
      large = true
    },
    largeRoot: () => {
      largeRoot = true
    },
    manyFolders: () => {
      manyFolders = true
    },
  }
}

test('All tree loads folders on demand, keeps loaded ancestors and original document draft, and collapses without deleting document', async () => {
  const f = fixture()
  try {
    await f.bind()
    expect(f.calls).toHaveLength(1)
    await f.toggle('docs')
    expect(f.calls.at(-1)).toMatchObject({ workspaceId: 'w', path: 'docs', limit: 200 })
    await f.toggle('docs/nested')
    expect(f.tree().tree.nodes['docs/nested']).toMatchObject({
      status: 'ready',
      expanded: true,
      items: [{ path: 'docs/nested/leaf.md' }],
    })
    await f.execute('fileWorkspace.filterTree', { instanceId: 'files', workspaceId: 'w', filter: 'leaf' })
    await f.execute('fileWorkspace.openEntry', {
      instanceId: 'files',
      workspaceId: 'w',
      path: 'docs/nested/leaf.md',
      directory: false,
    })
    await f.execute('fileWorkspace.setText', { instanceId: 'files', text: 'draft' })
    await f.execute('fileWorkspace.showBrowser', { instanceId: 'files' })
    expect(f.tree()).toMatchObject({
      view: 'browser',
      tree: { filter: 'leaf', nodes: { docs: { expanded: true } } },
      document: { path: 'docs/nested/leaf.md', draft: 'draft' },
    })
    await f.toggle('docs')
    expect(f.tree().tree.nodes).toEqual({})
    expect(f.tree().document?.draft).toBe('draft')
    await expect(f.toggle('elsewhere')).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    await expect(f.toggle('docs', 'other')).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
  } finally {
    f.runtime.dispose()
  }
})

test('folder load failure preserves an error and a retry reads only its original workspace/path', async () => {
  const f = fixture()
  try {
    await f.bind()
    f.fail('DISCONNECTED')
    await expect(f.toggle('docs')).rejects.toMatchObject({ code: 'DISCONNECTED' })
    expect(f.tree().tree.nodes.docs).toMatchObject({ status: 'error', error: 'DISCONNECTED', items: [] })
    f.fail(null)
    await f.execute('fileWorkspace.refreshTree', { instanceId: 'files', workspaceId: 'w', path: 'docs' })
    expect(f.tree().tree.nodes.docs).toMatchObject({ status: 'ready', error: null })
    expect(f.tree().tree.nodes.docs?.items.map((item) => item.path)).toEqual(['docs/nested', 'docs/hello.txt'])
    await expect(
      f.execute('fileWorkspace.refreshTree', { instanceId: 'files', workspaceId: 'other', path: 'docs' }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
  } finally {
    f.runtime.dispose()
  }
})

test('folder pagination is bounded, explicitly reports cap, and cannot silently duplicate pages', async () => {
  const f = fixture()
  try {
    f.large()
    await f.bind()
    await f.toggle('docs')
    expect(f.tree().tree.nodes.docs?.items).toHaveLength(200)
    await f.execute('fileWorkspace.loadMoreTree', { instanceId: 'files', workspaceId: 'w', path: 'docs' })
    expect(f.tree().tree.nodes.docs?.items).toHaveLength(400)
    await f.execute('fileWorkspace.loadMoreTree', { instanceId: 'files', workspaceId: 'w', path: 'docs' })
    expect(f.tree().tree.nodes.docs).toMatchObject({ status: 'ready', nextCursor: 'docs/file-0499.txt' })
    expect(f.tree().tree.nodes.docs?.items).toHaveLength(500)
    expect(f.calls.at(-1)?.limit).toBe(100)
    await expect(
      f.execute('fileWorkspace.loadMoreTree', { instanceId: 'files', workspaceId: 'w', path: 'docs' }),
    ).rejects.toMatchObject({ code: 'BUSY' })
    expect(f.tree().tree.nodes.docs).toMatchObject({ status: 'error', error: 'BUSY' })
    expect(f.tree().tree.nodes.docs?.items).toHaveLength(500)
  } finally {
    f.runtime.dispose()
  }
})

test('root pagination reports the 501st entry even when the final Host page has no cursor', async () => {
  const f = fixture()
  try {
    f.largeRoot()
    await f.bind()
    await f.execute('fileWorkspace.loadMore', { instanceId: 'files' })
    await f.execute('fileWorkspace.loadMore', { instanceId: 'files' })
    expect(f.tree().items).toHaveLength(500)
    expect(f.tree()).toMatchObject({ nextCursor: null, rootLimitReached: true })
  } finally {
    f.runtime.dispose()
  }
})

test('tree directory capacity reports BUSY and collapsing an unrelated folder permits retry', async () => {
  const f = fixture()
  try {
    f.manyFolders()
    await f.bind()
    for (let index = 0; index < 64; index += 1) await f.toggle(`folder-${String(index).padStart(2, '0')}`)
    expect(Object.keys(f.tree().tree.nodes)).toHaveLength(64)
    await expect(f.toggle('folder-64')).rejects.toMatchObject({ code: 'BUSY' })
    expect(f.tree().tree.error).toBe('BUSY')
    expect(Object.keys(f.tree().tree.nodes)).toHaveLength(64)
    await f.toggle('folder-00')
    expect(f.tree().tree.error).toBeNull()
    await f.toggle('folder-64')
    expect(f.tree().tree.nodes['folder-64']).toMatchObject({ expanded: true, status: 'ready' })
  } finally {
    f.runtime.dispose()
  }
})

test('close or target switch aborts a pending folder read; old completion cannot repopulate a reused panel', async () => {
  const f = fixture()
  try {
    await f.bind()
    const waiting = Promise.withResolvers<void>()
    f.gate(waiting.promise)
    const opening = f.toggle('docs').catch((error: unknown) => error)
    await Bun.sleep(0)
    const request = f.calls.at(-1)
    expect(f.tree().tree.nodes.docs?.status).toBe('loading')
    await f.execute('app.closePanel', { instanceId: 'files' })
    expect(request?.signal?.aborted).toBe(true)
    f.gate(null)
    await f.bind('other')
    waiting.resolve()
    expect(await opening).toMatchObject({ code: 'CANCELLED' })
    expect(f.tree()).toMatchObject({ workspaceId: 'other', tree: { nodes: {} }, status: 'ready' })
  } finally {
    f.runtime.dispose()
  }
})
