import { expect, test } from 'bun:test'
import { createAppRuntime } from '@hbar/app-runtime'
import type { CommandExecutor } from '@hbar/commands'
import type {
  SessionLaunchBranchesRequest,
  SessionLaunchBranchesPage,
  SessionLaunchBranchesReader,
} from '@hbar/contracts/commands/session-launch-branches'

function emptyDirectory(): CommandExecutor {
  return {
    execute(name) {
      if (name === 'workspace.list') return Promise.resolve({ items: [], nextCursor: null })
      if (name === 'session.list') return Promise.resolve({ items: [], nextCursor: null })
      if (name === 'workspace.get' || name === 'session.get') return Promise.resolve(null)
      return Promise.reject(new Error(`Unexpected directory command: ${name}`))
    },
  }
}

function page(workspaceId: string, name: string, nextCursor: string | null = null): SessionLaunchBranchesPage {
  return {
    workspaceId,
    repository: {
      kind: 'repository',
      workspaceScope: 'repository-root',
      head: { kind: 'branch', ref: 'refs/heads/main', name: 'main', oid: 'a'.repeat(40) },
    },
    branches: [
      {
        name,
        ref: `refs/heads/${name}`,
        tipOid: 'b'.repeat(40),
        current: false,
        availability: {
          sharedCurrent: { state: 'available' },
          isolatedBase: { state: 'available' },
        },
      },
    ],
    nextCursor,
    incomplete: false,
  }
}

function deferred<Value>() {
  let resolve!: (value: Value) => void
  const promise = new Promise<Value>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20 && !predicate(); attempt++)
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  expect(predicate()).toBe(true)
}

test('pre-session branch discovery uses bounded cursor pages as replacement projections', async () => {
  const inputs: SessionLaunchBranchesRequest[] = []
  const reader: SessionLaunchBranchesReader = {
    async list(input) {
      inputs.push(input)
      return inputs.length === 1 ? page(input.workspaceId, 'alpha', 'next-branches') : page(input.workspaceId, 'zeta')
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'branch-pages',
    hostId: 'branch-host',
    directory: emptyDirectory(),
    sessionLaunchBranches: reader,
  })

  try {
    await runtime.ready
    const first = await runtime.view.commands.execute('preSessionLaunchBranches.load', {
      workspaceId: 'workspace-a',
      search: 'release',
    })
    expect(first.status).toBe('ready')
    expect(inputs[0]).toMatchObject({ workspaceId: 'workspace-a', search: 'release', limit: 25 })

    const second = await runtime.view.commands.execute('preSessionLaunchBranches.load', {
      workspaceId: 'workspace-a',
      search: 'release',
      cursor: 'next-branches',
    })
    expect(second.page?.branches.map((branch) => branch.name)).toEqual(['zeta'])
    expect(inputs[1]).toMatchObject({ cursor: 'next-branches', limit: 25 })
    await expect(
      runtime.view.commands.execute('preSessionLaunchBranches.load', {
        workspaceId: 'workspace-a',
        search: 'other-search',
        cursor: 'next-branches',
      }),
    ).rejects.toMatchObject({ code: 'STALE_TARGET' })
  } finally {
    runtime.dispose()
  }
})

test('a fast workspace switch aborts observation and ignores the old response before loading the latest page', async () => {
  const firstRead = deferred<SessionLaunchBranchesPage>()
  const secondRead = deferred<SessionLaunchBranchesPage>()
  const calls: Array<{ workspaceId: string; signal?: AbortSignal }> = []
  const reader: SessionLaunchBranchesReader = {
    list(input, options) {
      calls.push({ workspaceId: input.workspaceId, ...(options?.signal ? { signal: options.signal } : {}) })
      return calls.length === 1 ? firstRead.promise : secondRead.promise
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'branch-switch',
    hostId: 'branch-host',
    directory: emptyDirectory(),
    sessionLaunchBranches: reader,
  })

  try {
    await runtime.ready
    const oldLoad = runtime.view.commands.execute('preSessionLaunchBranches.load', { workspaceId: 'workspace-old' })
    await waitFor(() => calls.length === 1)
    const latest = await runtime.view.commands.execute('preSessionLaunchBranches.load', {
      workspaceId: 'workspace-new',
    })
    expect(latest).toMatchObject({ workspaceId: 'workspace-new', status: 'loading' })
    expect(calls[0]?.signal?.aborted).toBe(true)
    expect(calls).toHaveLength(1)

    firstRead.resolve(page('workspace-old', 'old-branch'))
    await expect(oldLoad).rejects.toMatchObject({ code: 'CANCELLED' })
    await waitFor(() => calls.length === 2)
    expect(calls[1]?.workspaceId).toBe('workspace-new')
    secondRead.resolve(page('workspace-new', 'new-branch'))
    await waitFor(() => runtime.view.state.preSessionLaunchBranches.getSnapshot().status === 'ready')
    expect(runtime.view.state.preSessionLaunchBranches.getSnapshot()).toMatchObject({
      workspaceId: 'workspace-new',
      page: { branches: [{ name: 'new-branch' }] },
    })
  } finally {
    runtime.dispose()
  }
})

test('runtime disposal aborts the active branch read and prevents a late page from changing state', async () => {
  const pending = deferred<SessionLaunchBranchesPage>()
  let signal: AbortSignal | undefined
  const runtime = createAppRuntime({
    instanceId: 'branch-dispose',
    hostId: 'branch-host',
    directory: emptyDirectory(),
    sessionLaunchBranches: {
      list(_input, options) {
        signal = options?.signal
        return pending.promise
      },
    },
  })

  await runtime.ready
  const loading = runtime.view.commands.execute('preSessionLaunchBranches.load', { workspaceId: 'workspace-a' })
  await waitFor(() => signal !== undefined)
  const snapshot = runtime.view.state.preSessionLaunchBranches.getSnapshot()
  runtime.dispose()
  expect(signal?.aborted).toBe(true)
  await expect(loading).rejects.toBeInstanceOf(Error)
  pending.resolve(page('workspace-a', 'late-branch'))
  await Promise.resolve()
  expect(runtime.view.state.preSessionLaunchBranches.getSnapshot()).toBe(snapshot)
})
