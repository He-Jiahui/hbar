import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry } from '@hbar/commands'
import type { SessionLaunchTarget, SessionLaunchTargetReader } from '@hbar/contracts/commands/session-launch-target'
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

function launchTarget(sessionId: string, workspaceId = first.id, revision = 7): SessionLaunchTarget {
  return {
    sessionId,
    workspaceId,
    revision,
    selection: { mode: 'shared-current' },
    locked: false,
    resolution: { status: 'idle' },
    updatedAt: 1,
  }
}

const reader: SessionLaunchTargetReader = {
  async read(sessionId) {
    return launchTarget(sessionId, sessionId === 'session-b' ? second.id : first.id)
  },
}

async function until(predicate: () => boolean) {
  for (let index = 0; index < 20 && !predicate(); index++) await Promise.resolve()
  expect(predicate()).toBeTrue()
}

function fixture(
  git?: { execute(name: string, input: unknown): Promise<unknown> },
  targets: SessionLaunchTargetReader | null = reader,
) {
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
    targets ?? undefined,
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

test('the selected session reads its Host target revision without a client cwd, and an absent branch is not fabricated', async () => {
  const inputs: unknown[] = []
  const testbed = fixture({
    async execute(name, input) {
      expect(name).toBe('sessionGit.info')
      inputs.push(input)
      return { sha: null, branch: null, originUrl: null }
    },
  })
  try {
    await testbed.local.execute('sessionGitContext.refresh', { sessionId: 'session-a', workspaceId: first.id })
    expect(inputs).toEqual([{ workspaceId: first.id, sessionId: 'session-a', expectedRevision: 7 }])
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
    await until(() => waits.length === 1)
    testbed.navigation.replace({ workspaceId: second.id, sessionId: 'session-b', status: 'idle', error: null })
    const current = testbed.local.execute('sessionGitContext.refresh', {
      sessionId: 'session-b',
      workspaceId: second.id,
    })
    await until(() => waits.length === 2)
    waits[0]?.resolve({ sha: null, branch: 'old', originUrl: null })
    await old
    expect(testbed.context.reader.getSnapshot()).toMatchObject({
      sessionId: 'session-b',
      status: 'loading',
      branch: null,
    })
    waits[1]?.resolve({ sha: null, branch: 'new', originUrl: null })
    await current
    expect(inputs).toEqual([
      { workspaceId: first.id, sessionId: 'session-a', expectedRevision: 7 },
      { workspaceId: second.id, sessionId: 'session-b', expectedRevision: 7 },
    ])
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
    await until(() => calls === 2)
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
    await until(() => calls === 1)
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
    await until(() => calls === 2)
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

test('a missing target reader never falls back to the project Git directory', async () => {
  let calls = 0
  const testbed = fixture(
    {
      async execute() {
        calls++
        return { sha: null, branch: 'must not show', originUrl: null }
      },
    },
    null,
  )
  try {
    await expect(
      testbed.local.execute('sessionGitContext.refresh', { sessionId: 'session-a', workspaceId: first.id }),
    ).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' })
    expect(calls).toBe(0)
    expect(testbed.context.reader.getSnapshot()).toMatchObject({
      status: 'error',
      branch: null,
      error: 'CAPABILITY_UNAVAILABLE',
    })
  } finally {
    testbed.dispose()
  }
})

test('a synchronous launch-target reader failure releases the single-flight slot for retry', async () => {
  let reads = 0
  const targets: SessionLaunchTargetReader = {
    read(sessionId) {
      reads++
      if (reads === 1) throw new CommandError('DISCONNECTED', 'Fixture synchronous transport failure')
      return Promise.resolve(launchTarget(sessionId))
    },
  }
  const testbed = fixture(
    {
      async execute() {
        return { sha: null, branch: 'recovered', originUrl: null }
      },
    },
    targets,
  )
  try {
    const input = { sessionId: 'session-a', workspaceId: first.id }
    await expect(testbed.local.execute('sessionGitContext.refresh', input)).rejects.toMatchObject({
      code: 'DISCONNECTED',
    })
    await testbed.local.execute('sessionGitContext.refresh', input)
    expect(reads).toBe(2)
    expect(testbed.context.reader.getSnapshot()).toMatchObject({ status: 'ready', branch: 'recovered', error: null })
  } finally {
    testbed.dispose()
  }
})

test('wrong workspace and malformed target responses cannot supply a branch', async () => {
  const responses: SessionLaunchTarget[] = [
    launchTarget('session-a', second.id),
    launchTarget('session-b'),
    launchTarget('session-a', first.id, -1),
  ]
  let calls = 0
  const targets: SessionLaunchTargetReader = {
    async read() {
      const response = responses.shift()
      if (!response) throw new Error('Fixture launch-target responses exhausted')
      return response
    },
  }
  const testbed = fixture(
    {
      async execute() {
        calls++
        return { sha: null, branch: 'must not show', originUrl: null }
      },
    },
    targets,
  )
  try {
    for (let index = 0; index < 3; index++)
      await expect(
        testbed.local.execute('sessionGitContext.refresh', { sessionId: 'session-a', workspaceId: first.id }),
      ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
    expect(calls).toBe(0)
    expect(testbed.context.reader.getSnapshot()).toMatchObject({ status: 'error', branch: null })
  } finally {
    testbed.dispose()
  }
})

test('switching sessions in the same workspace cannot relabel a pending old branch', async () => {
  const waits: Array<ReturnType<typeof Promise.withResolvers<unknown>>> = []
  const requests: unknown[] = []
  const targets: SessionLaunchTargetReader = {
    async read(sessionId) {
      return launchTarget(sessionId, first.id, sessionId === 'session-a' ? 7 : 13)
    },
  }
  const testbed = fixture(
    {
      execute(_name, input) {
        requests.push(input)
        const wait = Promise.withResolvers<unknown>()
        waits.push(wait)
        return wait.promise
      },
    },
    targets,
  )
  try {
    const old = testbed.local.execute('sessionGitContext.refresh', { sessionId: 'session-a', workspaceId: first.id })
    await until(() => waits.length === 1)
    testbed.navigation.replace({ workspaceId: first.id, sessionId: 'session-b', status: 'idle', error: null })
    const current = testbed.local.execute('sessionGitContext.refresh', {
      sessionId: 'session-b',
      workspaceId: first.id,
    })
    await until(() => waits.length === 2)
    waits[1]!.resolve({ sha: null, branch: 'isolated-b', originUrl: null })
    await current
    waits[0]!.resolve({ sha: null, branch: 'isolated-a', originUrl: null })
    await old
    expect(requests).toEqual([
      { workspaceId: first.id, sessionId: 'session-a', expectedRevision: 7 },
      { workspaceId: first.id, sessionId: 'session-b', expectedRevision: 13 },
    ])
    expect(testbed.context.reader.getSnapshot()).toMatchObject({
      sessionId: 'session-b',
      status: 'ready',
      branch: 'isolated-b',
    })
  } finally {
    testbed.dispose()
  }
})

test('a late launch-target read is discarded before querying Git for the departed session', async () => {
  const wait = Promise.withResolvers<SessionLaunchTarget>()
  let reads = 0
  const requests: unknown[] = []
  const targets: SessionLaunchTargetReader = {
    read(sessionId) {
      reads++
      return reads === 1 ? wait.promise : Promise.resolve(launchTarget(sessionId, first.id, 13))
    },
  }
  const testbed = fixture(
    {
      async execute(_name, input) {
        requests.push(input)
        return { sha: null, branch: 'current-b', originUrl: null }
      },
    },
    targets,
  )
  try {
    const old = testbed.local
      .execute('sessionGitContext.refresh', { sessionId: 'session-a', workspaceId: first.id })
      .then(
        () => null,
        (error: unknown) => error,
      )
    await until(() => reads === 1)
    testbed.navigation.replace({ workspaceId: first.id, sessionId: 'session-b', status: 'idle', error: null })
    await testbed.local.execute('sessionGitContext.refresh', { sessionId: 'session-b', workspaceId: first.id })
    wait.resolve(launchTarget('session-a', first.id, 7))
    expect(await old).toMatchObject({ code: 'STALE_TARGET' })
    expect(requests).toEqual([{ workspaceId: first.id, sessionId: 'session-b', expectedRevision: 13 }])
    expect(testbed.context.reader.getSnapshot()).toMatchObject({ sessionId: 'session-b', branch: 'current-b' })
  } finally {
    testbed.dispose()
  }
})

test('invalidation fetches a new Host revision and a late previous-version branch cannot win', async () => {
  const waits: Array<ReturnType<typeof Promise.withResolvers<unknown>>> = []
  const requests: unknown[] = []
  let revision = 7
  const targets: SessionLaunchTargetReader = {
    async read(sessionId) {
      return launchTarget(sessionId, first.id, revision)
    },
  }
  const testbed = fixture(
    {
      execute(_name, input) {
        requests.push(input)
        const wait = Promise.withResolvers<unknown>()
        waits.push(wait)
        return wait.promise
      },
    },
    targets,
  )
  try {
    const input = { sessionId: 'session-a', workspaceId: first.id }
    const old = testbed.local.execute('sessionGitContext.refresh', input)
    await until(() => waits.length === 1)
    revision = 8
    await testbed.local.execute('sessionGitContext.invalidate', input)
    const current = testbed.local.execute('sessionGitContext.refresh', input)
    await until(() => waits.length === 2)
    waits[1]!.resolve({ sha: null, branch: 'revision-eight', originUrl: null })
    await current
    waits[0]!.resolve({ sha: null, branch: 'revision-seven', originUrl: null })
    await old
    expect(requests).toEqual([
      { workspaceId: first.id, sessionId: 'session-a', expectedRevision: 7 },
      { workspaceId: first.id, sessionId: 'session-a', expectedRevision: 8 },
    ])
    expect(testbed.context.reader.getSnapshot()).toMatchObject({ status: 'ready', branch: 'revision-eight' })
  } finally {
    testbed.dispose()
  }
})

test('unbound isolated target errors stay local and do not trigger a project fallback', async () => {
  const commands: string[] = []
  const testbed = fixture({
    async execute(name) {
      commands.push(name)
      throw new CommandError('SESSION_LAUNCH_TARGET_UNRESOLVED', 'Fixture target is not bound')
    },
  })
  try {
    await expect(
      testbed.local.execute('sessionGitContext.refresh', { sessionId: 'session-a', workspaceId: first.id }),
    ).rejects.toMatchObject({ code: 'SESSION_LAUNCH_TARGET_UNRESOLVED' })
    expect(commands).toEqual(['sessionGit.info'])
    expect(testbed.context.reader.getSnapshot()).toMatchObject({
      status: 'error',
      branch: null,
      error: 'SESSION_LAUNCH_TARGET_UNRESOLVED',
    })
  } finally {
    testbed.dispose()
  }
})

test('a joining refresh may cancel without cancelling its owner or hiding its result', async () => {
  const wait = Promise.withResolvers<unknown>()
  let calls = 0
  const testbed = fixture({
    execute() {
      calls++
      return wait.promise
    },
  })
  try {
    const input = { sessionId: 'session-a', workspaceId: first.id }
    const owner = testbed.local.execute('sessionGitContext.refresh', input)
    await until(() => calls === 1)
    const controller = new AbortController()
    const joining = testbed.local.execute('sessionGitContext.refresh', input, { signal: controller.signal }).then(
      () => null,
      (error: unknown) => error,
    )
    await Promise.resolve()
    controller.abort()
    expect(await joining).toMatchObject({ code: 'CANCELLED' })
    expect(testbed.context.reader.getSnapshot()).toMatchObject({ status: 'loading', error: null })
    expect(calls).toBe(1)
    wait.resolve({ sha: null, branch: 'owner-completed', originUrl: null })
    await owner
    expect(testbed.context.reader.getSnapshot()).toMatchObject({
      status: 'ready',
      branch: 'owner-completed',
      error: null,
    })
  } finally {
    testbed.dispose()
  }
})
