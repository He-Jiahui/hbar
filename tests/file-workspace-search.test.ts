import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { CommandError } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import { fileCommands } from '@hbar/contracts/commands/files'

const sha = (text: string) => createHash('sha256').update(text).digest('hex')
const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function until(predicate: () => boolean) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (predicate()) return
    await pause(20)
  }
  throw new Error('Search state did not settle')
}

function fixture() {
  const requests: { workspaceId: string; query: string; signal?: AbortSignal }[] = []
  const gates = new Map<string, Promise<void>>()
  let failure: string | null = null
  let truncated = false
  const runtime = createAppRuntime({
    instanceId: 'file-search-test',
    hostId: 'host',
    surfaces: { canRender: (id) => id === 'files' },
    directory: { execute: () => Promise.reject(new Error('unused')) },
    files: {
      async execute(name, raw, options) {
        if (name === 'file.list') {
          const input = fileCommands['file.list'].input.parse(raw)
          return {
            items: input.path === '.' ? [{ name: 'src', path: 'src', directory: true }] : [],
          }
        }
        if (name === 'file.find') {
          const input = fileCommands['file.find'].input.parse(raw)
          requests.push({
            workspaceId: input.workspaceId,
            query: input.query,
            ...(options?.signal ? { signal: options.signal } : {}),
          })
          await gates.get(input.query)
          if (failure) throw new CommandError(failure, 'Search unavailable')
          return {
            paths: input.query === 'missing' ? [] : ['src/deep/alpha.ts', 'test/deep/alpha.ts'],
            truncated,
            filesChecked: 2,
          }
        }
        if (name === 'file.read') {
          const input = fileCommands['file.read'].input.parse(raw)
          return { ...input, text: 'source', size: 6, sha256: sha('source') }
        }
        throw new Error(`Unexpected ${name}`)
      },
    },
  })
  const execute = runtime.view.commands.execute
  const entry = () => runtime.view.state.files.getSnapshot().entries.files!
  const bind = async (workspaceId = 'w') => {
    await execute('app.openPanel', { instanceId: 'files', panelId: 'files', workspaceId, binding: 'pinned' })
    await execute('fileWorkspace.refresh', { instanceId: 'files' })
  }
  const filter = (value: string, workspaceId = 'w') =>
    execute('fileWorkspace.filterTree', { instanceId: 'files', workspaceId, filter: value })
  return {
    runtime,
    execute,
    entry,
    bind,
    filter,
    requests,
    gate: (query: string, promise: Promise<void>) => gates.set(query, promise),
    fail: (code: string | null) => {
      failure = code
    },
    truncate: () => {
      truncated = true
    },
  }
}

test('All-files search finds unopened paths, opens a document, and preserves query on return', async () => {
  const f = fixture()
  try {
    await f.bind()
    await f.filter('alpha')
    expect(f.entry().tree.search.status).toBe('loading')
    await until(() => f.entry().tree.search.status === 'ready')
    expect(f.requests.map(({ workspaceId, query }) => ({ workspaceId, query }))).toEqual([
      { workspaceId: 'w', query: 'alpha' },
    ])
    expect(f.requests[0]?.signal).toBeInstanceOf(AbortSignal)
    expect(f.entry().tree.nodes).toEqual({})
    expect(f.entry().tree.search.paths).toEqual(['src/deep/alpha.ts', 'test/deep/alpha.ts'])
    await f.execute('fileWorkspace.openEntry', {
      instanceId: 'files',
      workspaceId: 'w',
      path: 'src/deep/alpha.ts',
      directory: false,
    })
    await f.execute('fileWorkspace.setText', { instanceId: 'files', text: 'unsaved' })
    await f.execute('fileWorkspace.showBrowser', { instanceId: 'files' })
    expect(f.entry()).toMatchObject({
      view: 'browser',
      tree: { filter: 'alpha', search: { status: 'ready' } },
      activePreviewId: null,
      document: null,
      previews: [{ kind: 'document', document: { path: 'src/deep/alpha.ts', draft: 'unsaved' } }],
    })
    await f.filter('')
    expect(f.entry().tree.search).toMatchObject({ status: 'idle', paths: [] })
    expect(f.entry().items).toEqual([{ name: 'src', path: 'src', directory: true }])
  } finally {
    f.runtime.dispose()
  }
})

test('search ignores superseded responses and separates no match, failure, retry and truncation', async () => {
  const f = fixture()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  try {
    await f.bind()
    f.gate('alpha', gate)
    await f.filter('alpha')
    await until(() => f.requests.length === 1)
    await f.filter('missing')
    await until(() => f.entry().tree.search.status === 'ready')
    expect(f.entry().tree.search.paths).toEqual([])
    expect(f.requests[0]?.signal?.aborted).toBe(true)
    release()
    await pause(30)
    expect(f.entry().tree.filter).toBe('missing')
    expect(f.entry().tree.search.paths).toEqual([])
    f.fail('DISCONNECTED')
    await f.filter('alpha')
    await until(() => f.entry().tree.search.status === 'error')
    expect(f.entry().tree.search.error).toBe('DISCONNECTED')
    f.fail(null)
    f.truncate()
    await f.filter('alpha')
    await until(() => f.entry().tree.search.status === 'ready')
    expect(f.entry().tree.search.truncated).toBe(true)
  } finally {
    release()
    f.runtime.dispose()
  }
})

test('closing and rebinding the panel aborts a search and rejects a late old-workspace result', async () => {
  const f = fixture()
  const waiting = Promise.withResolvers<void>()
  try {
    await f.bind()
    f.gate('alpha', waiting.promise)
    await f.filter('alpha')
    await until(() => f.requests.length === 1)
    const old = f.requests[0]!
    await f.execute('app.closePanel', { instanceId: 'files' })
    expect(old.signal?.aborted).toBe(true)
    await f.bind('other')
    waiting.resolve()
    await pause(30)
    expect(f.entry()).toMatchObject({ workspaceId: 'other', tree: { search: { status: 'idle', paths: [] } } })
  } finally {
    waiting.resolve()
    f.runtime.dispose()
  }
})
