import { expect, test } from 'bun:test'
import { CommandRegistry } from '@hbar/commands'
import { createSessionGitContext, sessionGitContextCommands } from '../packages/app-runtime/src/session-git-context'
import { createState } from '../packages/app-runtime/src/state'
import type { DirectoryState, NavigationState } from '@hbar/app-runtime'

const first = { id: 'workspace-a', name: 'Project A', path: 'D:/projects/a', createdAt: 1 }
const second = { id: 'workspace-b', name: 'Project B', path: 'D:/projects/b', createdAt: 2 }
const initialNavigation: NavigationState = {
  workspaceId: first.id,
  sessionId: 'session-a',
  status: 'idle',
  error: null,
}

test('Git context commands are bounded internal reads/invalidation, never Git mutations', () => {
  const refresh = sessionGitContextCommands['sessionGitContext.refresh'].metadata
  const invalidate = sessionGitContextCommands['sessionGitContext.invalidate'].metadata
  expect(refresh).toMatchObject({
    execution: 'client',
    kind: 'query',
    stateEffect: 'none',
    visibility: 'internal',
    maxConcurrent: 8,
  })
  expect(invalidate).toMatchObject({
    execution: 'client',
    kind: 'command',
    stateEffect: 'application',
    visibility: 'internal',
  })
})

function fixture(git?: { execute(name: string, input: unknown): Promise<unknown> }) {
  const local = new CommandRegistry({ execution: 'client' })
  const navigation = createState(initialNavigation, (reason) => {
    throw reason
  })
  const directory = createState<DirectoryState>(
    { workspaces: { [first.id]: first, [second.id]: second }, sessions: {} },
    (reason) => {
      throw reason
    },
  )
  const context = createSessionGitContext(
    local,
    git,
    navigation.reader,
    directory.reader,
    (reason) => {
      throw reason
    },
    () => false,
  )
  return {
    local,
    navigation,
    directory,
    context,
    dispose() {
      context.dispose()
      local.dispose()
      navigation.dispose()
      directory.dispose()
    },
  }
}

test('the selected session reads its own workspace path, and an absent branch is not fabricated', async () => {
  const inputs: unknown[] = []
  const testbed = fixture({
    async execute(name, input) {
      expect(name).toBe('git.info')
      inputs.push(input)
      return { sha: null, branch: null, originUrl: null }
    },
  })
  try {
    await testbed.local.execute('sessionGitContext.refresh', { sessionId: 'session-a', workspaceId: first.id })
    expect(inputs).toEqual([{ cwd: first.path }])
    expect(testbed.context.reader.getSnapshot()).toMatchObject({
      sessionId: 'session-a',
      workspaceId: first.id,
      status: 'ready',
      branch: null,
      error: null,
    })
    await expect(
      testbed.local.execute('sessionGitContext.refresh', { sessionId: 'session-a', workspaceId: second.id }),
    ).rejects.toMatchObject({ code: 'STALE_TARGET' })
  } finally {
    testbed.dispose()
  }
})

test('navigation and directory changes invalidate old Git responses before they can label another session', async () => {
  const waits: Array<ReturnType<typeof Promise.withResolvers<unknown>>> = []
  const inputs: unknown[] = []
  const testbed = fixture({
    execute(_name, input) {
      inputs.push(input)
      const wait = Promise.withResolvers<unknown>()
      waits.push(wait)
      return wait.promise
    },
  })
  try {
    const old = testbed.local.execute('sessionGitContext.refresh', { sessionId: 'session-a', workspaceId: first.id })
    await Promise.resolve()
    testbed.navigation.replace({ workspaceId: second.id, sessionId: 'session-b', status: 'idle', error: null })
    const current = testbed.local.execute('sessionGitContext.refresh', {
      sessionId: 'session-b',
      workspaceId: second.id,
    })
    await Promise.resolve()
    waits[0]?.resolve({ sha: null, branch: 'old', originUrl: null })
    await old
    expect(testbed.context.reader.getSnapshot()).toMatchObject({
      sessionId: 'session-b',
      status: 'loading',
      branch: null,
    })
    waits[1]?.resolve({ sha: null, branch: 'new', originUrl: null })
    await current
    expect(inputs).toEqual([{ cwd: first.path }, { cwd: second.path }])
    expect(testbed.context.reader.getSnapshot()).toMatchObject({
      sessionId: 'session-b',
      workspaceId: second.id,
      status: 'ready',
      branch: 'new',
    })
    testbed.directory.replace({
      ...testbed.directory.reader.getSnapshot(),
      workspaces: { [first.id]: first, [second.id]: { ...second, path: 'D:/moved/b' } },
    })
    expect(testbed.context.reader.getSnapshot()).toMatchObject({ status: 'idle', branch: null })
  } finally {
    testbed.dispose()
  }
})

test('refresh is single-flight, failures hide the last branch, and safe reads may retry', async () => {
  const wait = Promise.withResolvers<unknown>()
  let calls = 0
  const testbed = fixture({
    async execute() {
      calls++
      if (calls === 1) return { sha: null, branch: 'main', originUrl: null }
      if (calls === 2) return wait.promise
      return { sha: null, branch: 'fixed', originUrl: null }
    },
  })
  try {
    const target = { sessionId: 'session-a', workspaceId: first.id }
    await testbed.local.execute('sessionGitContext.refresh', target)
    const one = testbed.local.execute('sessionGitContext.refresh', target)
    const two = testbed.local.execute('sessionGitContext.refresh', target)
    await Promise.resolve()
    expect(calls).toBe(2)
    expect(testbed.context.reader.getSnapshot()).toMatchObject({ status: 'loading', branch: null })
    wait.reject({ code: 'DISCONNECTED' })
    const results = await Promise.allSettled([one, two])
    expect(results).toMatchObject([
      { status: 'rejected', reason: { code: 'DISCONNECTED' } },
      { status: 'rejected', reason: { code: 'DISCONNECTED' } },
    ])
    expect(testbed.context.reader.getSnapshot()).toMatchObject({ status: 'error', branch: null, error: 'DISCONNECTED' })
    await testbed.local.execute('sessionGitContext.refresh', target)
    expect(testbed.context.reader.getSnapshot()).toMatchObject({ status: 'ready', branch: 'fixed', error: null })
  } finally {
    testbed.dispose()
  }
})

test('an interrupted read discards a late Host response and permits a new generation', async () => {
  const wait = Promise.withResolvers<unknown>()
  let calls = 0
  const testbed = fixture({
    execute() {
      calls++
      return calls === 1 ? wait.promise : Promise.resolve({ sha: null, branch: 'after reconnect', originUrl: null })
    },
  })
  try {
    const target = { sessionId: 'session-a', workspaceId: first.id }
    const controller = new AbortController()
    const old = testbed.local.execute('sessionGitContext.refresh', target, { signal: controller.signal })
    await Promise.resolve()
    controller.abort()
    expect(testbed.context.reader.getSnapshot()).toMatchObject({ status: 'error', branch: null, error: 'CANCELLED' })
    await testbed.local.execute('sessionGitContext.refresh', target)
    wait.resolve({ sha: null, branch: 'before reconnect', originUrl: null })
    await old.catch(() => undefined)
    expect(testbed.context.reader.getSnapshot()).toMatchObject({ status: 'ready', branch: 'after reconnect' })
  } finally {
    testbed.dispose()
  }
})

test('disconnect invalidates an already confirmed branch and ignores a late read from the old connection', async () => {
  const wait = Promise.withResolvers<unknown>()
  let calls = 0
  const testbed = fixture({
    execute() {
      calls++
      return calls === 1
        ? Promise.resolve({ sha: null, branch: 'main', originUrl: null })
        : calls === 2
          ? wait.promise
          : Promise.resolve({ sha: null, branch: 'reconnected', originUrl: null })
    },
  })
  try {
    const target = { sessionId: 'session-a', workspaceId: first.id }
    await testbed.local.execute('sessionGitContext.refresh', target)
    expect(testbed.context.reader.getSnapshot().branch).toBe('main')
    const old = testbed.local.execute('sessionGitContext.refresh', target)
    await Promise.resolve()
    await testbed.local.execute('sessionGitContext.invalidate', target)
    expect(testbed.context.reader.getSnapshot()).toMatchObject({ status: 'idle', branch: null, error: null })
    const reconnected = testbed.local.execute('sessionGitContext.refresh', target)
    await reconnected
    wait.resolve({ sha: null, branch: 'old-connection', originUrl: null })
    await old.catch(() => undefined)
    expect(testbed.context.reader.getSnapshot()).toMatchObject({ status: 'ready', branch: 'reconnected' })
  } finally {
    testbed.dispose()
  }
})
