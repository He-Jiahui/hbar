import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { CommandError } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import { fileCommands, type SessionFileTarget } from '@hbar/contracts/commands/files'
import { gitCommands } from '@hbar/contracts/commands/git'
import type { SessionLaunchTarget } from '@hbar/contracts/commands/session-launch-target'

const sha = (text: string) => createHash('sha256').update(text).digest('hex')

function launchTarget(sessionId: string, revision: number): SessionLaunchTarget {
  return {
    sessionId,
    workspaceId: 'w',
    revision,
    selection: { mode: 'shared-current' },
    locked: true,
    resolution: { status: 'ready', branch: null },
    updatedAt: revision,
  }
}

test('Files isolate same-path caches by Host session revision and bind every document operation to its captured target', async () => {
  const targets = new Map([
    ['session-a', launchTarget('session-a', 3)],
    ['session-b', launchTarget('session-b', 8)],
  ])
  const files = new Map<string, string>()
  const calls: { name: string; sessionTarget?: SessionFileTarget }[] = []
  const gitCalls: string[] = []
  let unknownWrite = false
  const runtime = createAppRuntime({
    instanceId: 'session-file-target',
    hostId: 'fixture',
    directory: {
      async execute(name, raw) {
        if (name === 'workspace.get') {
          const input = { workspaceId: 'w', ...(raw as Record<string, unknown>) }
          return { id: input.workspaceId, path: 'C:/shared', name: 'w', createdAt: 1 }
        }
        throw new Error(`Unexpected ${name}`)
      },
    },
    surfaces: { canRender: (id) => id === 'files' },
    sessionLaunchTargets: {
      async read(sessionId, options) {
        options?.signal?.throwIfAborted()
        const target = targets.get(sessionId)
        if (!target) throw new CommandError('SESSION_NOT_FOUND', 'Missing test target')
        return target
      },
    },
    files: {
      async execute(name, raw) {
        if (name === 'file.list') {
          const input = fileCommands['file.list'].input.parse(raw)
          calls.push({ name, ...(input.sessionTarget ? { sessionTarget: input.sessionTarget } : {}) })
          return { items: [{ name: 'source.txt', path: 'source.txt', directory: false }] }
        }
        if (name === 'file.read') {
          const input = fileCommands['file.read'].input.parse(raw)
          calls.push({ name, ...(input.sessionTarget ? { sessionTarget: input.sessionTarget } : {}) })
          const suffix = input.sessionTarget
            ? `${input.sessionTarget.sessionId}:${input.sessionTarget.expectedRevision}`
            : 'project'
          const key = `${input.workspaceId}:${suffix}:${input.path}`
          const text = files.get(key) ?? `baseline ${suffix}`
          return { ...input, text, size: text.length, sha256: sha(text) }
        }
        if (name === 'file.write') {
          const input = fileCommands['file.write'].input.parse(raw)
          calls.push({ name, ...(input.sessionTarget ? { sessionTarget: input.sessionTarget } : {}) })
          const suffix = input.sessionTarget
            ? `${input.sessionTarget.sessionId}:${input.sessionTarget.expectedRevision}`
            : 'project'
          const key = `${input.workspaceId}:${suffix}:${input.path}`
          const before = files.get(key) ?? `baseline ${suffix}`
          if (sha(before) !== input.expectedSha256) throw new CommandError('FILE_CONFLICT', 'Targeted file changed')
          files.set(key, input.text)
          if (unknownWrite) {
            unknownWrite = false
            throw new CommandError('RESULT_UNKNOWN', 'Accepted write receipt was lost')
          }
          return {
            workspaceId: input.workspaceId,
            ...(input.sessionTarget ? { sessionTarget: input.sessionTarget } : {}),
            path: input.path,
            created: false,
            beforeSha256: input.expectedSha256,
            afterSha256: sha(input.text),
            size: input.text.length,
          }
        }
        throw new Error(`Unexpected ${name}`)
      },
    },
    git: {
      async execute(name, raw) {
        if (name === 'sessionGit.status') {
          const input = gitCommands['sessionGit.status'].input.parse(raw)
          gitCalls.push(`${name}:${input.sessionId}:${input.expectedRevision}`)
          return {
            target: {
              workspaceId: input.workspaceId,
              sessionId: input.sessionId,
              expectedRevision: input.expectedRevision,
            },
            branch: 'session-target',
            head: null,
            upstream: null,
            ahead: 0,
            behind: 0,
            isRepository: true,
            dirty: true,
            repositoryDirty: true,
            entries: [{ kind: 'path' as const, path: 'changed.txt', index: 'M', worktree: 'M' }],
          }
        }
        if (name === 'sessionGit.diff') {
          const input = gitCommands['sessionGit.diff'].input.parse(raw)
          gitCalls.push(`${name}:${input.sessionId}:${input.expectedRevision}:${input.paths.join(',')}`)
          return {
            target: {
              workspaceId: input.workspaceId,
              sessionId: input.sessionId,
              expectedRevision: input.expectedRevision,
            },
            cached: input.cached,
            diff: 'scoped diff',
            truncated: false,
          }
        }
        throw new Error(`Unexpected ${name}`)
      },
    },
  })
  const execute = runtime.view.commands.execute
  const action = (instanceId: string, targetOverride?: SessionFileTarget) => {
    const panel = runtime.view.state.surfaces.getSnapshot().panels[instanceId]
    const entry = runtime.view.state.files.getSnapshot().entries[instanceId]
    return {
      sourceSessionId: panel?.sessionId ?? null,
      sessionTarget: targetOverride ?? entry?.sessionTarget ?? null,
    }
  }
  const openPanel = (instanceId: string, sessionId: string) =>
    execute('app.openPanel', {
      instanceId,
      panelId: 'files',
      workspaceId: 'w',
      sessionId,
      binding: 'pinned',
    })
  const openFile = (instanceId: string, sessionTarget?: SessionFileTarget) =>
    execute('fileWorkspace.openEntry', {
      ...action(instanceId, sessionTarget),
      instanceId,
      workspaceId: 'w',
      path: 'source.txt',
      directory: false,
    })

  try {
    await runtime.ready
    await openPanel('files-a', 'session-a')
    await execute('fileWorkspace.refresh', { instanceId: 'files-a', ...action('files-a') })
    await openFile('files-a')
    const targetA = action('files-a').sessionTarget!
    expect(runtime.view.state.files.getSnapshot().entries['files-a']?.document?.baseline).toBe('baseline session-a:3')
    await execute('fileWorkspace.setDocumentMode', {
      ...action('files-a'),
      instanceId: 'files-a',
      workspaceId: 'w',
      previewId: runtime.view.state.files.getSnapshot().entries['files-a']?.activePreviewId ?? undefined,
      path: 'source.txt',
      mode: 'edit',
    })
    await execute('fileWorkspace.setText', { ...action('files-a'), instanceId: 'files-a', text: 'draft A' })
    unknownWrite = true
    await expect(execute('fileWorkspace.save', { ...action('files-a'), instanceId: 'files-a' })).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })

    await openPanel('files-b', 'session-b')
    await execute('fileWorkspace.refresh', { instanceId: 'files-b', ...action('files-b') })
    await openFile('files-b')
    const targetB = action('files-b').sessionTarget!
    expect(runtime.view.state.files.getSnapshot().entries['files-b']?.document?.baseline).toBe('baseline session-b:8')
    await execute('fileWorkspace.setText', { ...action('files-b'), instanceId: 'files-b', text: 'draft B' })
    await execute('fileWorkspace.setBrowserMode', {
      ...action('files-b'),
      instanceId: 'files-b',
      workspaceId: 'w',
      mode: 'changed',
    })
    expect(runtime.view.state.files.getSnapshot().entries['files-b']?.changes).toMatchObject({
      status: 'ready',
      isRepository: true,
      cwd: null,
      root: null,
      items: [{ path: 'changed.txt', index: 'M', worktree: 'M' }],
    })
    await execute('fileWorkspace.openChange', {
      ...action('files-b'),
      instanceId: 'files-b',
      workspaceId: 'w',
      path: 'changed.txt',
    })
    expect(runtime.view.state.files.getSnapshot().entries['files-b']?.diff?.text).toBe('scoped diff')
    expect(gitCalls).toEqual(['sessionGit.status:session-b:8', 'sessionGit.diff:session-b:8:changed.txt'])
    await execute('fileWorkspace.reconcile', { ...action('files-a'), instanceId: 'files-a' })
    expect(runtime.view.state.files.getSnapshot().entries['files-a']?.document).toMatchObject({
      status: 'succeeded',
      baseline: 'draft A',
      draft: 'draft A',
    })
    expect(
      runtime.view.state.files.getSnapshot().entries['files-b']?.previews.find((preview) => preview.kind === 'document')
        ?.document.draft,
    ).toBe('draft B')

    targets.set('session-a', launchTarget('session-a', 4))
    await execute('fileWorkspace.refresh', { instanceId: 'files-a', ...action('files-a', targetA) })
    const targetA2 = action('files-a').sessionTarget!
    expect(targetA2).toEqual({ sessionId: 'session-a', expectedRevision: 4 })
    expect(targetA2).not.toEqual(targetA)
    expect(runtime.view.state.files.getSnapshot().entries['files-a']?.previews).toEqual([])
    await expect(
      execute('fileWorkspace.setDocumentMode', {
        ...action('files-a', targetA),
        instanceId: 'files-a',
        workspaceId: 'w',
        previewId: crypto.randomUUID(),
        path: 'source.txt',
        mode: 'edit',
      }),
    ).rejects.toMatchObject({ code: 'TARGET_CHANGED' })
    await expect(
      execute('fileWorkspace.save', { ...action('files-a', targetA), instanceId: 'files-a' }),
    ).rejects.toMatchObject({ code: 'TARGET_CHANGED' })
    expect(runtime.view.state.files.getSnapshot().entries['files-b']?.sessionTarget).toEqual(targetB)
    expect(calls.filter((call) => call.name === 'file.list')).toEqual([
      { name: 'file.list', sessionTarget: targetA },
      { name: 'file.list', sessionTarget: targetB },
      { name: 'file.list', sessionTarget: targetA2 },
    ])
    expect(calls.filter((call) => call.name === 'file.read').every((call) => call.sessionTarget !== undefined)).toBe(
      true,
    )
    expect(calls.filter((call) => call.name === 'file.write')).toEqual([{ name: 'file.write', sessionTarget: targetA }])
  } finally {
    runtime.dispose()
  }
})

test('unresolved session Files targets fail closed for every Files/Git action without shared fallback', async () => {
  for (const scenario of [
    { key: 'missing-reader', code: 'CAPABILITY_UNAVAILABLE', reader: false },
    { key: 'unbound-selection', code: 'SESSION_LAUNCH_TARGET_UNRESOLVED', reader: true },
  ] as const) {
    const calls: string[] = []
    const runtime = createAppRuntime({
      instanceId: `unresolved-session-file-target-${scenario.key}`,
      hostId: 'fixture',
      directory: {
        async execute(name) {
          calls.push(name)
          if (name === 'workspace.get') return { id: 'w', path: 'C:/shared', name: 'w', createdAt: 1 }
          throw new Error(`Unexpected ${name}`)
        },
      },
      surfaces: { canRender: (id) => id === 'files' },
      ...(scenario.reader
        ? {
            sessionLaunchTargets: {
              async read() {
                return {
                  ...launchTarget('session-without-binding', 5),
                  selection: {
                    mode: 'isolated-worktree' as const,
                    branch: { kind: 'existing' as const, name: 'codex/unprepared-files' },
                  },
                  locked: false,
                  resolution: { status: 'idle' as const },
                }
              },
            },
          }
        : {}),
      files: {
        async execute(name) {
          calls.push(name)
          return { items: [] }
        },
      },
      git: {
        async execute(name) {
          calls.push(name)
          return {}
        },
      },
    })
    const instanceId = `files-${scenario.key}`
    const input = {
      instanceId,
      workspaceId: 'w',
      sourceSessionId: 'session-without-binding',
      sessionTarget: null,
    }
    const refreshInput = {
      instanceId,
      sourceSessionId: 'session-without-binding',
      sessionTarget: null,
    }
    try {
      await runtime.view.commands.execute('app.openPanel', {
        panelId: 'files',
        instanceId,
        workspaceId: 'w',
        sessionId: 'session-without-binding',
        binding: 'pinned',
      })
      await expect(runtime.view.commands.execute('fileWorkspace.refresh', refreshInput)).rejects.toMatchObject({
        code: scenario.code,
      })
      expect(runtime.view.state.files.getSnapshot().entries[instanceId]?.error).toBe(scenario.code)
      await expect(
        runtime.view.commands.execute('fileWorkspace.openEntry', {
          ...input,
          path: 'source.txt',
          directory: false,
        }),
      ).rejects.toMatchObject({ code: scenario.code })
      await expect(
        runtime.view.commands.execute('fileWorkspace.filterTree', { ...input, filter: 'secret' }),
      ).rejects.toMatchObject({ code: scenario.code })
      await expect(
        runtime.view.commands.execute('fileWorkspace.setBrowserMode', { ...input, mode: 'changed' }),
      ).rejects.toMatchObject({ code: scenario.code })
      await expect(runtime.view.commands.execute('fileWorkspace.refreshChanges', input)).rejects.toMatchObject({
        code: scenario.code,
      })
      expect(calls).toEqual([])
    } finally {
      runtime.dispose()
    }
  }
})

test('custom launch-target readers cannot authorize malformed or foreign session responses', async () => {
  let response: unknown = launchTarget('session-a', 2)
  let lists = 0
  const runtime = createAppRuntime({
    instanceId: 'invalid-session-file-target',
    hostId: 'fixture',
    directory: { execute: () => Promise.reject(new Error('unused')) },
    surfaces: { canRender: (id) => id === 'files' },
    sessionLaunchTargets: {
      async read() {
        return response as SessionLaunchTarget
      },
    },
    files: {
      async execute(name) {
        if (name === 'file.list') lists += 1
        throw new Error(`Unexpected ${name}`)
      },
    },
  })
  try {
    await runtime.view.commands.execute('app.openPanel', {
      panelId: 'files',
      instanceId: 'session-files',
      workspaceId: 'w',
      sessionId: 'session-a',
      binding: 'pinned',
    })
    const refresh = () =>
      runtime.view.commands.execute('fileWorkspace.refresh', {
        instanceId: 'session-files',
        sourceSessionId: 'session-a',
        sessionTarget: null,
      })
    response = launchTarget('foreign-session', 2)
    await expect(refresh()).rejects.toMatchObject({ code: 'STALE_TARGET' })
    response = { ...launchTarget('session-a', 2), workspaceId: 'foreign-workspace' }
    await expect(refresh()).rejects.toMatchObject({ code: 'STALE_TARGET' })
    response = { ...launchTarget('session-a', -1), revision: -1 }
    await expect(refresh()).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
    expect(lists).toBe(0)
  } finally {
    runtime.dispose()
  }
})

test('session Changed opens an untracked repository-root directory as Files, not as a diff', async () => {
  const sessionId = 'session-root-untracked'
  const sessionTarget = { sessionId, expectedRevision: 6 }
  const fileCalls: { name: string; path?: string; sessionTarget?: SessionFileTarget }[] = []
  const gitCalls: string[] = []
  const runtime = createAppRuntime({
    instanceId: 'session-root-untracked-files',
    hostId: 'fixture',
    directory: {
      async execute(name, raw) {
        if (name !== 'workspace.get') throw new Error(`Unexpected ${name}`)
        const input = { workspaceId: 'w', ...(raw as Record<string, unknown>) }
        return { id: input.workspaceId, path: 'C:/shared', name: 'w', createdAt: 1 }
      },
    },
    surfaces: { canRender: (id) => id === 'files' },
    sessionLaunchTargets: {
      async read(id) {
        return launchTarget(id, sessionTarget.expectedRevision)
      },
    },
    files: {
      async execute(name, raw) {
        if (name === 'file.list') {
          const input = fileCommands['file.list'].input.parse(raw)
          fileCalls.push({
            name,
            ...(input.path ? { path: input.path } : {}),
            ...(input.sessionTarget ? { sessionTarget: input.sessionTarget } : {}),
          })
          return { items: [{ name: 'untracked-child', path: 'untracked-child', directory: true }] }
        }
        fileCalls.push({ name })
        throw new Error(`Unexpected file operation ${name}`)
      },
    },
    git: {
      async execute(name, raw) {
        if (name !== 'sessionGit.status') throw new Error(`Unexpected Git operation ${name}`)
        const input = gitCommands['sessionGit.status'].input.parse(raw)
        gitCalls.push(`${name}:${input.sessionId}:${input.expectedRevision}`)
        return {
          target: {
            workspaceId: input.workspaceId,
            sessionId: input.sessionId,
            expectedRevision: input.expectedRevision,
          },
          branch: 'fixture',
          head: null,
          upstream: null,
          ahead: 0,
          behind: 0,
          isRepository: true,
          dirty: true,
          repositoryDirty: true,
          entries: [{ kind: 'path' as const, path: '.', directory: true, index: '?', worktree: '?' }],
        }
      },
    },
  })
  const execute = runtime.view.commands.execute
  const action = () => {
    const entry = runtime.view.state.files.getSnapshot().entries.files
    return {
      sourceSessionId: sessionId,
      sessionTarget: entry?.sessionTarget ?? null,
    }
  }
  try {
    await runtime.ready
    await execute('app.openPanel', {
      instanceId: 'files',
      panelId: 'files',
      workspaceId: 'w',
      sessionId,
      binding: 'pinned',
    })
    await execute('fileWorkspace.refresh', { instanceId: 'files', ...action() })
    const target = action().sessionTarget!
    await execute('fileWorkspace.setBrowserMode', {
      ...action(),
      instanceId: 'files',
      workspaceId: 'w',
      mode: 'changed',
    })
    expect(runtime.view.state.files.getSnapshot().entries.files?.changes.items).toEqual([
      { path: '.', directory: true, index: '?', worktree: '?' },
    ])

    await execute('fileWorkspace.openChange', {
      ...action(),
      instanceId: 'files',
      workspaceId: 'w',
      path: '.',
    })

    expect(runtime.view.state.files.getSnapshot().entries.files).toMatchObject({
      workspaceId: 'w',
      sourceSessionId: sessionId,
      sessionTarget: target,
      path: '.',
      view: 'browser',
    })
    expect(
      fileCalls
        .filter((call) => call.name === 'file.list')
        .every(
          (call) =>
            call.sessionTarget?.sessionId === sessionId &&
            call.sessionTarget.expectedRevision === target.expectedRevision,
        ),
    ).toBe(true)
    expect(fileCalls.some((call) => call.name === 'file.read')).toBe(false)
    expect(fileCalls.some((call) => call.name === 'file.write')).toBe(false)
    expect(gitCalls).toEqual([`sessionGit.status:${sessionId}:${target.expectedRevision}`])
  } finally {
    runtime.dispose()
  }
})

test('late list, search and Changed diff results cannot repopulate a newer session target revision', async () => {
  const sessionId = 'session-delayed-target'
  let revision = 1
  const listGate = Promise.withResolvers<void>()
  const searchGate = Promise.withResolvers<void>()
  const diffGate = Promise.withResolvers<void>()
  const requests: {
    name: string
    revision: number | undefined
    path?: string
    signal?: AbortSignal
  }[] = []
  let blockListRevision: number | null = 1
  let blockSearchRevision: number | null = null
  let blockDiffRevision: number | null = null
  const runtime = createAppRuntime({
    instanceId: 'session-delayed-file-target',
    hostId: 'fixture',
    directory: {
      async execute(name, raw) {
        if (name !== 'workspace.get') throw new Error(`Unexpected ${name}`)
        const input = { workspaceId: 'w', ...(raw as Record<string, unknown>) }
        return { id: input.workspaceId, path: 'C:/shared', name: 'w', createdAt: 1 }
      },
    },
    surfaces: { canRender: (id) => id === 'files' },
    sessionLaunchTargets: {
      async read(id, options) {
        options?.signal?.throwIfAborted()
        return launchTarget(id, revision)
      },
    },
    files: {
      async execute(name, raw, options) {
        if (name === 'file.list') {
          const input = fileCommands['file.list'].input.parse(raw)
          const expectedRevision = input.sessionTarget?.expectedRevision
          requests.push({
            name,
            revision: expectedRevision,
            ...(input.path ? { path: input.path } : {}),
            ...(options?.signal ? { signal: options.signal } : {}),
          })
          if (expectedRevision === blockListRevision) await listGate.promise
          const path = expectedRevision === 1 ? 'stale-list.txt' : `revision-${expectedRevision}-list.txt`
          return { items: [{ name: path, path, directory: false }] }
        }
        if (name === 'file.find') {
          const input = fileCommands['file.find'].input.parse(raw)
          const expectedRevision = input.sessionTarget?.expectedRevision
          requests.push({
            name,
            revision: expectedRevision,
            ...(options?.signal ? { signal: options.signal } : {}),
          })
          if (expectedRevision === blockSearchRevision) await searchGate.promise
          return {
            paths: [expectedRevision === 2 ? 'stale-search-result.txt' : `revision-${expectedRevision}-search.txt`],
            truncated: false,
            filesChecked: 1,
          }
        }
        throw new Error(`Unexpected file operation ${name}`)
      },
    },
    git: {
      async execute(name, raw, options) {
        if (name === 'sessionGit.status') {
          const input = gitCommands['sessionGit.status'].input.parse(raw)
          requests.push({
            name,
            revision: input.expectedRevision,
            ...(options?.signal ? { signal: options.signal } : {}),
          })
          return {
            target: {
              workspaceId: input.workspaceId,
              sessionId: input.sessionId,
              expectedRevision: input.expectedRevision,
            },
            branch: `revision-${input.expectedRevision}`,
            head: null,
            upstream: null,
            ahead: 0,
            behind: 0,
            isRepository: true,
            dirty: true,
            repositoryDirty: true,
            entries: [{ kind: 'path' as const, path: 'changed.txt', index: ' ', worktree: 'M' }],
          }
        }
        if (name === 'sessionGit.diff') {
          const input = gitCommands['sessionGit.diff'].input.parse(raw)
          requests.push({
            name,
            revision: input.expectedRevision,
            ...(input.paths[0] ? { path: input.paths[0] } : {}),
            ...(options?.signal ? { signal: options.signal } : {}),
          })
          if (input.expectedRevision === blockDiffRevision) await diffGate.promise
          return {
            target: {
              workspaceId: input.workspaceId,
              sessionId: input.sessionId,
              expectedRevision: input.expectedRevision,
            },
            cached: input.cached,
            diff: `stale diff for revision ${input.expectedRevision}`,
            truncated: false,
          }
        }
        throw new Error(`Unexpected Git operation ${name}`)
      },
    },
  })
  const execute = runtime.view.commands.execute
  const entry = () => runtime.view.state.files.getSnapshot().entries.files!
  const action = () => ({ sourceSessionId: sessionId, sessionTarget: entry().sessionTarget })
  const refresh = () =>
    execute('fileWorkspace.refresh', { instanceId: 'files', sourceSessionId: sessionId, sessionTarget: null })
  const waitFor = async (predicate: () => boolean) => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (predicate()) return
      await Bun.sleep(10)
    }
    throw new Error('The target-scoped request did not start')
  }
  try {
    await runtime.ready
    await execute('app.openPanel', {
      instanceId: 'files',
      panelId: 'files',
      workspaceId: 'w',
      sessionId,
      binding: 'pinned',
    })
    const firstList = refresh().catch((error: unknown) => error)
    await waitFor(() => requests.some((request) => request.name === 'file.list' && request.revision === 1))
    const oldListRequest = requests.find((request) => request.name === 'file.list' && request.revision === 1)
    expect(oldListRequest?.revision).toBe(1)
    revision = 2
    blockListRevision = null
    await refresh()
    listGate.resolve()
    await firstList
    expect(entry()).toMatchObject({
      sessionTarget: { sessionId, expectedRevision: 2 },
      items: [{ path: 'revision-2-list.txt' }],
    })
    expect(entry().items.some((item) => item.path === 'stale-list.txt')).toBe(false)

    blockSearchRevision = 2
    const oldSearch = execute('fileWorkspace.filterTree', {
      ...action(),
      instanceId: 'files',
      workspaceId: 'w',
      filter: 'revision-result',
    })
    await waitFor(() => requests.some((request) => request.name === 'file.find' && request.revision === 2))
    const oldSearchRequest = requests.find((request) => request.name === 'file.find' && request.revision === 2)
    expect(oldSearchRequest?.revision).toBe(2)
    revision = 3
    blockSearchRevision = null
    await refresh()
    searchGate.resolve()
    await oldSearch.catch(() => undefined)
    await Bun.sleep(10)
    expect(entry()).toMatchObject({ sessionTarget: { sessionId, expectedRevision: 3 } })
    expect(entry().tree.search.paths).not.toContain('stale-search-result.txt')

    await execute('fileWorkspace.setBrowserMode', {
      ...action(),
      instanceId: 'files',
      workspaceId: 'w',
      mode: 'changed',
    })
    blockDiffRevision = 3
    const oldDiff = execute('fileWorkspace.openChange', {
      ...action(),
      instanceId: 'files',
      workspaceId: 'w',
      path: 'changed.txt',
    }).catch((error: unknown) => error)
    await waitFor(() => requests.some((request) => request.name === 'sessionGit.diff' && request.revision === 3))
    const oldDiffRequest = requests.find((request) => request.name === 'sessionGit.diff' && request.revision === 3)
    expect(oldDiffRequest?.revision).toBe(3)
    revision = 4
    blockDiffRevision = null
    await refresh()
    diffGate.resolve()
    await oldDiff
    expect(entry()).toMatchObject({ sessionTarget: { sessionId, expectedRevision: 4 }, view: 'browser' })
    expect(entry().previews).toEqual([])
    expect(entry().diff).toBeNull()
  } finally {
    listGate.resolve()
    searchGate.resolve()
    diffGate.resolve()
    runtime.dispose()
  }
})
