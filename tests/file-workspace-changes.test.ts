import { expect, test } from 'bun:test'
import { CommandError } from '@hbar/commands'
import { createAppRuntime, filteredFileChanges } from '@hbar/app-runtime'
import { directoryCommands } from '@hbar/contracts/commands'
import { fileCommands } from '@hbar/contracts/commands/files'
import { gitCommands } from '@hbar/contracts/commands/git'
import type { GitStatus } from '@hbar/contracts'
import { createHash } from 'node:crypto'
import { workspaceChanges } from '../packages/app-runtime/src/file-workspace-changes'

const initialStatus = (): GitStatus => ({
  cwd: '/repo/app',
  root: '/repo',
  branch: 'main',
  head: null,
  upstream: null,
  ahead: 0,
  behind: 0,
  dirty: true,
  originUrl: null,
  entries: [
    { path: 'app/src/main.ts', index: 'M', worktree: 'M' },
    { path: 'outside.md', index: ' ', worktree: 'M' },
    { path: 'app/new.md', index: '?', worktree: '?' },
  ],
})
function fixture() {
  let status = initialStatus()
  let failure: string | null = null
  let gate: Promise<void> | null = null
  const calls: { name: string; input: unknown; signal?: AbortSignal }[] = []
  const runtime = createAppRuntime({
    instanceId: 'changes-test',
    hostId: 'host',
    surfaces: { canRender: (id) => id === 'files' },
    directory: {
      async execute(name, raw) {
        if (name !== 'workspace.get') throw new Error(`Unexpected ${name}`)
        const { workspaceId } = directoryCommands['workspace.get'].input.parse(raw)
        return { id: workspaceId, path: workspaceId === 'w' ? '/repo/app' : '/other', name: workspaceId, createdAt: 1 }
      },
    },
    files: {
      async execute(name, raw) {
        calls.push({ name, input: raw })
        if (name === 'file.list') return { items: [{ name: 'main.ts', path: 'src/main.ts', directory: false }] }
        if (name === 'file.read') {
          const input = fileCommands['file.read'].input.parse(raw)
          return { ...input, text: 'source', size: 6, sha256: createHash('sha256').update('source').digest('hex') }
        }
        if (name === 'file.write') throw new CommandError('RESULT_UNKNOWN', 'Lost write response')
        throw new Error(`Unexpected ${name}`)
      },
    },
    git: {
      async execute(name, raw, options) {
        calls.push({ name, input: raw, ...(options?.signal ? { signal: options.signal } : {}) })
        const snapshot = status
        if (gate) await gate
        if (failure) throw new CommandError(failure, 'Git failure')
        if (name === 'git.status') return snapshot
        if (name === 'git.diff') {
          const input = gitCommands['git.diff'].input.parse(raw)
          return {
            cwd: input.cwd!,
            cached: input.cached,
            truncated: false,
            diff: `@@ -1 +1 @@\n-source\n+${input.cached ? 'staged' : 'working'}`,
          }
        }
        throw new Error(`Unexpected ${name}`)
      },
    },
  })
  const execute = runtime.view.commands.execute
  const bind = async (workspaceId = 'w') => {
    await execute('app.openPanel', { instanceId: 'files', panelId: 'files', workspaceId, binding: 'pinned' })
    await execute('fileWorkspace.refresh', { instanceId: 'files' })
  }
  const changes = () =>
    execute('fileWorkspace.setBrowserMode', { instanceId: 'files', workspaceId: 'w', mode: 'changed' })
  const open = (path = 'src/main.ts', cached?: boolean) =>
    execute('fileWorkspace.openChange', {
      instanceId: 'files',
      workspaceId: 'w',
      path,
      ...(cached === undefined ? {} : { cached }),
    })
  const entry = () => runtime.view.state.files.getSnapshot().entries.files!
  return {
    runtime,
    execute,
    bind,
    changes,
    open,
    entry,
    calls,
    setStatus: (next: GitStatus) => {
      status = next
    },
    fail: (next: string | null) => {
      failure = next
    },
    gate: (next: Promise<void> | null) => {
      gate = next
    },
  }
}

test('changed files map repository paths into the selected workspace and read the exact real diff mode', async () => {
  const f = fixture()
  try {
    await f.bind()
    await f.changes()
    expect(f.entry().changes.items.map((item) => item.path)).toEqual(['new.md', 'src/main.ts'])
    await f.open()
    expect(f.calls.at(-1)?.input).toEqual({ cwd: '/repo/app', cached: false, paths: ['src/main.ts'] })
    expect(f.entry().diff?.text).toContain('+working')
    await f.open('src/main.ts', true)
    expect(f.entry().diff).toMatchObject({ cached: true, status: 'ready', text: '@@ -1 +1 @@\n-source\n+staged' })
    await f.execute('fileWorkspace.showBrowser', { instanceId: 'files' })
    expect(f.entry()).toMatchObject({ view: 'browser', browserMode: 'changed' })
    await f.open('new.md')
    expect(f.entry()).toMatchObject({ view: 'document', documentMode: 'preview', document: { path: 'new.md' } })
    expect(f.calls.at(-1)).toMatchObject({ name: 'file.read', input: { workspaceId: 'w', path: 'new.md' } })
    await expect(f.open('outside.md')).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
  } finally {
    f.runtime.dispose()
  }
})

test('path projection handles Windows roots, renames, malformed roots and escaped paths', () => {
  expect(
    workspaceChanges(
      {
        ...initialStatus(),
        root: 'D:\\Repo',
        entries: [
          { path: 'APP/new.ts', originalPath: 'APP/old.ts', index: 'R', worktree: ' ' },
          { path: 'APP2/no.ts', index: 'M', worktree: ' ' },
        ],
      },
      'd:/repo/app',
    ),
  ).toEqual([{ path: 'new.ts', originalPath: 'old.ts', index: 'R', worktree: ' ' }])
  expect(() => workspaceChanges(initialStatus(), '/elsewhere')).toThrow('does not own')
  expect(
    workspaceChanges(
      { ...initialStatus(), root: 'D:\\', entries: [{ path: 'App/src/file.ts', index: 'M', worktree: ' ' }] },
      'd:/app',
    ),
  ).toEqual([{ path: 'src/file.ts', index: 'M', worktree: ' ' }])
  expect(() =>
    workspaceChanges({ ...initialStatus(), entries: [{ path: '../outside', index: 'M', worktree: ' ' }] }, '/repo'),
  ).toThrow()
})

test('Changed paging and filtering are bounded, preserve long paths and mark the Host cap', async () => {
  const f = fixture()
  try {
    f.setStatus({
      ...initialStatus(),
      entries: Array.from({ length: 5000 }, (_, index) => ({
        path: `app/目录/long-${String(index).padStart(4, '0')}.txt`,
        index: ' ',
        worktree: 'M',
      })),
    })
    await f.bind()
    await f.changes()
    expect(f.entry().changes.limitReached).toBe(true)
    await f.execute('fileWorkspace.pageChanges', { instanceId: 'files', workspaceId: 'w', page: 49 })
    expect(f.entry().changes.page).toBe(49)
    await f.execute('fileWorkspace.filterChanges', { instanceId: 'files', workspaceId: 'w', filter: '4999' })
    expect(f.entry().changes.page).toBe(0)
    expect(filteredFileChanges(f.entry().changes).map((item) => item.path)).toEqual(['目录/long-4999.txt'])
    await f.execute('fileWorkspace.pageChanges', { instanceId: 'files', workspaceId: 'w', page: 49 })
    expect(f.entry().changes.page).toBe(0)
  } finally {
    f.runtime.dispose()
  }
})

test('non-repository, failed status and failed diff are distinct from a clean workspace', async () => {
  const f = fixture()
  try {
    f.setStatus({ ...initialStatus(), root: null, entries: [], dirty: false })
    await f.bind()
    await f.changes()
    expect(f.entry().changes).toMatchObject({ status: 'ready', root: null, error: null })
    f.fail('DISCONNECTED')
    await expect(f.changes()).rejects.toMatchObject({ code: 'DISCONNECTED' })
    expect(f.entry().changes).toMatchObject({ status: 'error', error: 'DISCONNECTED' })
    f.fail(null)
    f.setStatus(initialStatus())
    await f.changes()
    f.fail('EXECUTION_FAILED')
    await expect(f.open()).rejects.toMatchObject({ code: 'EXECUTION_FAILED' })
    expect(f.entry().diff).toMatchObject({ status: 'error', error: 'EXECUTION_FAILED', text: '' })
  } finally {
    f.runtime.dispose()
  }
})

test('closed or retargeted panels reject late responses and stale commands even after same-id reopening', async () => {
  const f = fixture()
  try {
    await f.bind()
    await f.changes()
    const gate = Promise.withResolvers<void>()
    f.gate(gate.promise)
    const opening = f.open()
    const rejected = opening.catch((error: unknown) => error)
    await Bun.sleep(0)
    const request = f.calls.at(-1)
    await f.execute('app.closePanel', { instanceId: 'files' })
    expect(request?.signal?.aborted).toBe(true)
    f.gate(null)
    await f.bind()
    gate.resolve()
    expect(await rejected).toMatchObject({ code: 'CANCELLED' })
    expect(f.entry().view).toBe('browser')
    expect(f.entry().diff).toBeNull()
    expect(f.entry().changes.status).toBe('idle')
    await f.bind('other')
    await expect(f.open()).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    await expect(
      f.execute('fileWorkspace.openEntry', {
        instanceId: 'files',
        workspaceId: 'w',
        path: 'src/main.ts',
        directory: false,
      }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
  } finally {
    f.runtime.dispose()
  }
})

test('the reading navigator preserves unknown saves, current view, filters and exact diff selection', async () => {
  const f = fixture()
  try {
    await f.bind()
    await f.execute('fileWorkspace.openEntry', {
      instanceId: 'files',
      workspaceId: 'w',
      path: 'src/main.ts',
      directory: false,
    })
    await f.execute('fileWorkspace.setDocumentMode', {
      instanceId: 'files',
      workspaceId: 'w',
      path: 'src/main.ts',
      mode: 'edit',
    })
    await f.execute('fileWorkspace.setText', { instanceId: 'files', text: 'protected draft' })
    await expect(f.execute('fileWorkspace.save', { instanceId: 'files' })).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    const document = f.entry().document
    await f.execute('fileWorkspace.setBrowserMode', {
      instanceId: 'files',
      workspaceId: 'w',
      mode: 'changed',
      preservePreview: true,
    })
    expect(f.entry()).toMatchObject({
      view: 'document',
      documentMode: 'edit',
      document: { status: 'unknown', draft: 'protected draft' },
    })
    expect(f.entry().document).toBe(document)
    await f.execute('fileWorkspace.filterChanges', { instanceId: 'files', workspaceId: 'w', filter: 'main' })
    await f.execute('fileWorkspace.refreshChanges', { instanceId: 'files', workspaceId: 'w', preservePreview: true })
    expect(f.entry()).toMatchObject({ view: 'document', changes: { filter: 'main' } })
    await f.open('src/main.ts', true)
    const diff = f.entry().diff
    await f.execute('fileWorkspace.setBrowserMode', {
      instanceId: 'files',
      workspaceId: 'w',
      mode: 'all',
      preservePreview: true,
    })
    await f.execute('fileWorkspace.refresh', { instanceId: 'files', preservePreview: true })
    expect(f.entry()).toMatchObject({ view: 'diff', browserMode: 'all' })
    expect(f.entry().diff).toBe(diff)
    await f.execute('fileWorkspace.setBrowserMode', {
      instanceId: 'files',
      workspaceId: 'w',
      mode: 'changed',
      preservePreview: true,
    })
    expect(f.entry().diff).toBe(diff)
    // The legacy fields describe only the active diff; the original canonical document remains in its tab.
    expect(f.entry().document).toBeNull()
    const retained = f
      .entry()
      .previews.find((preview) => preview.kind === 'document' && preview.path === document?.path)
    expect(retained?.kind === 'document' ? retained.document : null).toBe(document)
    await f.execute('fileWorkspace.openEntry', {
      instanceId: 'files',
      workspaceId: 'w',
      path: 'src/main.ts',
      directory: false,
    })
    expect(f.entry().document).toBe(document)
    expect(f.calls.filter((call) => call.name === 'file.write')).toHaveLength(1)
    expect(f.calls.filter((call) => call.name === 'file.read')).toHaveLength(1)
  } finally {
    f.runtime.dispose()
  }
})

test('changing navigator mode leaves an independent preview read alive without changing its identity', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<void>()
  try {
    await f.bind()
    await f.changes()
    f.gate(gate.promise)
    const pending = f.open().catch((error: unknown) => error)
    await Bun.sleep(0)
    const request = f.calls.at(-1)
    const previewId = f.entry().activePreviewId
    await f.execute('fileWorkspace.setBrowserMode', {
      instanceId: 'files',
      workspaceId: 'w',
      mode: 'all',
      preservePreview: true,
    })
    expect(request?.signal?.aborted).toBe(false)
    expect(f.entry()).toMatchObject({
      view: 'diff',
      browserMode: 'all',
      activePreviewId: previewId,
      diff: { status: 'loading' },
    })
    gate.resolve()
    expect(await pending).toMatchObject({ status: 'ready' })
    expect(f.entry().diff?.status).toBe('ready')
    expect(f.entry().activePreviewId).toBe(previewId)
  } finally {
    gate.resolve()
    f.runtime.dispose()
  }
})

test('navigator changes refresh keeps a valid later page and clamps it when files disappear', async () => {
  const f = fixture()
  try {
    await f.bind()
    f.setStatus({
      ...initialStatus(),
      entries: Array.from({ length: 251 }, (_, index) => ({ path: `app/file-${index}.ts`, index: ' ', worktree: 'M' })),
    })
    await f.changes()
    await f.execute('fileWorkspace.pageChanges', { instanceId: 'files', workspaceId: 'w', page: 2 })
    await f.open('file-1.ts')
    await f.execute('fileWorkspace.refreshChanges', { instanceId: 'files', workspaceId: 'w', preservePreview: true })
    expect(f.entry()).toMatchObject({ view: 'diff', changes: { page: 2 } })
    f.setStatus(initialStatus())
    await f.execute('fileWorkspace.refreshChanges', { instanceId: 'files', workspaceId: 'w', preservePreview: true })
    expect(f.entry()).toMatchObject({ view: 'diff', changes: { page: 0 } })
    expect(f.entry().diff?.path).toBe('file-1.ts')
  } finally {
    f.runtime.dispose()
  }
})

test('preview/edit and Changed navigation retain the exact unknown-save document without replay', async () => {
  const f = fixture()
  try {
    await f.bind()
    await f.execute('fileWorkspace.openEntry', {
      instanceId: 'files',
      workspaceId: 'w',
      path: 'src/main.ts',
      directory: false,
    })
    await f.execute('fileWorkspace.setDocumentMode', {
      instanceId: 'files',
      workspaceId: 'w',
      path: 'src/main.ts',
      mode: 'edit',
    })
    await f.execute('fileWorkspace.setText', { instanceId: 'files', text: 'unsaved draft' })
    await expect(f.execute('fileWorkspace.save', { instanceId: 'files' })).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    const document = f.entry().document
    await f.changes()
    await f.open()
    expect(f.entry().document).toBeNull()
    const retained = f
      .entry()
      .previews.find((preview) => preview.kind === 'document' && preview.path === document?.path)
    expect(retained?.kind === 'document' ? retained.document : null).toBe(document)
    await f.execute('fileWorkspace.openEntry', {
      instanceId: 'files',
      workspaceId: 'w',
      path: 'src/main.ts',
      directory: false,
    })
    expect(f.entry()).toMatchObject({
      documentMode: 'edit',
      document: { baseline: 'source', draft: 'unsaved draft', status: 'unknown' },
    })
    expect(f.entry().document?.pendingText).toBe(document?.pendingText)
    expect(f.calls.filter((call) => call.name === 'file.write')).toHaveLength(1)
    await expect(
      f.execute('fileWorkspace.setDocumentMode', {
        instanceId: 'files',
        workspaceId: 'w',
        path: 'other.txt',
        mode: 'edit',
      }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
  } finally {
    f.runtime.dispose()
  }
})
