import { expect, test } from 'bun:test'
import { createAppRuntime } from '@hbar/app-runtime'
import { directoryCommands } from '@hbar/contracts/commands'
import type { Session, Workspace, SessionPage } from '@hbar/contracts/directory'
import type { CommandExecutor } from '@hbar/commands'

function fixture() {
  const workspaces: Workspace[] = [
    { id: 'w1', name: 'one', path: 'D:/one', createdAt: 1 },
    { id: 'w2', name: 'two', path: 'D:/two', createdAt: 1 },
  ]
  const sessions: Session[] = [
    { id: 's1', workspaceId: 'w1', title: '审查', archived: false, parentId: null, createdAt: 1, updatedAt: 1, seq: 1 },
    { id: 's2', workspaceId: 'w1', title: '编辑', archived: false, parentId: null, createdAt: 1, updatedAt: 1, seq: 1 },
    {
      id: 's3',
      workspaceId: 'w2',
      title: '另一个工程',
      archived: false,
      parentId: null,
      createdAt: 1,
      updatedAt: 1,
      seq: 1,
    },
  ]
  const directory: CommandExecutor = {
    execute(name, value) {
      switch (name) {
        case 'workspace.list': {
          const input = directoryCommands[name].input.parse(value)
          const matches = workspaces.filter((item) => !input.after || item.id > input.after)
          return Promise.resolve({
            items: matches.slice(0, input.limit),
            nextCursor: matches.length > input.limit ? (matches[input.limit - 1]?.id ?? null) : null,
          })
        }
        case 'workspace.get':
          return Promise.resolve(
            workspaces.find((item) => item.id === directoryCommands[name].input.parse(value).workspaceId) ?? null,
          )
        case 'session.get':
          return Promise.resolve(
            sessions.find((item) => item.id === directoryCommands[name].input.parse(value).sessionId) ?? null,
          )
        case 'session.list': {
          const input = directoryCommands[name].input.parse(value)
          const matches = sessions.filter(
            (item) =>
              item.workspaceId === input.workspaceId &&
              (!item.archived || input.includeArchived) &&
              (!input.after || item.id > input.after) &&
              (input.title === undefined || item.title === input.title),
          )
          return Promise.resolve({
            items: matches.slice(0, input.limit),
            nextCursor: matches.length > input.limit ? (matches[input.limit - 1]?.id ?? null) : null,
          })
        }
        default:
          return Promise.reject(new Error('Unexpected query'))
      }
    },
  }
  return { directory, sessions, workspaces }
}

test('two headless runtimes share directory facts but keep selection and subscriptions private', async () => {
  const { directory } = fixture()
  const first = createAppRuntime({ instanceId: 'one', hostId: 'host', directory })
  const second = createAppRuntime({ instanceId: 'two', hostId: 'host', directory })
  await first.view.commands.execute('app.setWorkspace', { workspaceId: 'w1' })
  await first.view.executeText('app.setSession "审查"')
  await second.view.commands.execute('app.setSession', { sessionId: 's2' })
  expect(first.view.state.navigation.getSnapshot()).toMatchObject({
    workspaceId: 'w1',
    sessionId: 's1',
    status: 'idle',
  })
  expect(second.view.state.navigation.getSnapshot()).toMatchObject({ workspaceId: 'w1', sessionId: 's2' })
  const page = await first.view.commands.execute('session.list', { workspaceId: 'w1', limit: 1 })
  expect(page.items.map((item) => item.id)).toEqual(['s1'])
  expect(page.nextCursor).toBe('s1')
  expect(
    (await first.view.commands.execute('session.list', { workspaceId: 'w1', after: 's1' })).items.map(
      (item) => item.id,
    ),
  ).toEqual(['s2'])
  expect(Object.keys(first.view.state.navigation).sort()).toEqual(['getSnapshot', 'subscribe'])
  expect('dispose' in first.view).toBe(false)
  const snapshot = first.view.state.directory.getSnapshot()
  const session = snapshot.sessions.s1
  if (!session) throw new Error('Expected projected session')
  expect(Reflect.set(session, 'title', 'corrupt')).toBe(false)
  expect(first.view.state.directory.getSnapshot().sessions.s1?.title).toBe('审查')
  expect(first.view.state.directory.getSnapshot()).toBe(snapshot)
  first.dispose()
  second.dispose()
})

test('ambiguous, archived, missing and cross-workspace selections never silently select another session', async () => {
  const { directory, sessions } = fixture()
  sessions.push({
    id: 's4',
    workspaceId: 'w1',
    title: '审查',
    archived: false,
    parentId: null,
    createdAt: 1,
    updatedAt: 1,
    seq: 1,
  })
  sessions.push({
    id: 's5',
    workspaceId: 'w1',
    title: '归档',
    archived: true,
    parentId: null,
    createdAt: 1,
    updatedAt: 1,
    seq: 1,
  })
  const runtime = createAppRuntime({ instanceId: 'one', hostId: 'host', directory })
  await runtime.view.commands.execute('app.setSession', { sessionId: 's2' })
  await expect(runtime.view.executeText('app.setSession 审查')).rejects.toMatchObject({
    code: 'SESSION_AMBIGUOUS',
    candidates: ['s1', 's4'],
  })
  expect(runtime.view.state.navigation.getSnapshot()).toMatchObject({
    sessionId: 's2',
    error: { code: 'SESSION_AMBIGUOUS', candidates: ['s1', 's4'] },
  })
  await expect(runtime.view.commands.execute('app.setSession', { sessionName: '归档' })).rejects.toMatchObject({
    code: 'SESSION_ARCHIVED',
  })
  await expect(runtime.view.commands.execute('app.setSession', { sessionId: 'missing' })).rejects.toMatchObject({
    code: 'SESSION_NOT_FOUND',
  })
  await expect(runtime.view.commands.execute('app.setSession', { sessionId: 's3' })).rejects.toMatchObject({
    code: 'SESSION_WORKSPACE_MISMATCH',
  })
  expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe('s2')
  await runtime.view.commands.execute('app.setSession', { sessionId: 's3', workspaceId: 'w2' })
  expect(runtime.view.state.navigation.getSnapshot()).toMatchObject({ sessionId: 's3', workspaceId: 'w2' })
  runtime.dispose()
})

test('a late selection cannot replace a newer intent, and disposal rejects late callbacks', async () => {
  const data = fixture()
  const delayed = Promise.withResolvers<unknown>()
  const directory: CommandExecutor = {
    execute(name, input, options) {
      if (name === 'session.get' && directoryCommands[name].input.parse(input).sessionId === 's1')
        return delayed.promise
      return data.directory.execute(name, input, options)
    },
  }
  const runtime = createAppRuntime({ instanceId: 'one', hostId: 'host', directory })
  const first = runtime.view.commands.execute('app.setSession', { sessionId: 's1' })
  await runtime.view.commands.execute('app.setSession', { sessionId: 's2' })
  delayed.resolve(data.sessions[0])
  await expect(first).rejects.toMatchObject({ code: 'NAVIGATION_SUPERSEDED' })
  expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe('s2')
  runtime.dispose()

  const late = Promise.withResolvers<unknown>()
  const closed = createAppRuntime({ instanceId: 'closed', hostId: 'host', directory: { execute: () => late.promise } })
  const pending = closed.view.commands.execute('app.setSession', { sessionId: 's1' })
  const before = closed.view.state.directory.getSnapshot()
  closed.dispose()
  late.resolve(data.sessions[0])
  await expect(pending).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
  await Bun.sleep(0)
  expect(closed.view.state.directory.getSnapshot()).toBe(before)
  await expect(closed.view.commands.execute('app.setWorkspace', { workspaceId: 'w1' })).rejects.toMatchObject({
    code: 'DISPOSED',
  })
})

test('directory refresh clears a vanished selection and isolates failing observers', async () => {
  const data = fixture()
  const errors: unknown[] = []
  const runtime = createAppRuntime({
    instanceId: 'one',
    hostId: 'host',
    directory: data.directory,
    onSubscriberError: (error) => errors.push(error),
  })
  let notifications = 0
  const unsubscribe = runtime.view.state.navigation.subscribe(() => {
    throw new Error('observer')
  })
  runtime.view.state.navigation.subscribe(() => {
    notifications++
  })
  await runtime.view.commands.execute('app.setSession', { sessionId: 's1' })
  expect(notifications).toBe(2)
  expect(errors).toHaveLength(2)
  unsubscribe()
  data.sessions.splice(0, 1)
  expect(await runtime.view.commands.execute('session.get', { sessionId: 's1' })).toBeNull()
  expect(runtime.view.state.navigation.getSnapshot().sessionId).toBeNull()
  expect(runtime.view.state.directory.getSnapshot().sessions.s1).toBeUndefined()
  expect(errors).toHaveLength(2)
  runtime.dispose()
})

test('invalid server pages never contaminate the directory projection', async () => {
  const data = fixture()
  const runtime = createAppRuntime({
    instanceId: 'one',
    hostId: 'host',
    directory: { execute: () => Promise.resolve({ items: [data.sessions[0], data.sessions[0]], nextCursor: null }) },
  })
  await expect(runtime.view.commands.execute('session.list', { workspaceId: 'w1' })).rejects.toMatchObject({
    code: 'INVALID_OUTPUT',
  })
  expect(runtime.view.state.directory.getSnapshot().sessions).toEqual({})
  runtime.dispose()
})

test('independent consumers can finish the same query without an old result reverting the projection', async () => {
  const data = fixture()
  const first = Promise.withResolvers<unknown>()
  const second = Promise.withResolvers<unknown>()
  let call = 0
  const runtime = createAppRuntime({
    instanceId: 'one',
    hostId: 'host',
    directory: { execute: () => (++call === 1 ? first.promise : second.promise) },
  })
  const older = runtime.view.commands.execute('session.get', { sessionId: 's1' })
  const newer = runtime.view.commands.execute('session.get', { sessionId: 's1' })
  second.resolve({ ...data.sessions[0], title: 'new title', seq: 2 })
  expect((await newer)?.title).toBe('new title')
  first.resolve(data.sessions[0])
  expect((await older)?.title).toBe('审查')
  expect(runtime.view.state.directory.getSnapshot().sessions.s1?.title).toBe('new title')
  runtime.dispose()
})

test('directory cache stays bounded across pages while retaining the selected session', async () => {
  const data = fixture()
  data.sessions.splice(0)
  for (let index = 0; index < 1001; index++)
    data.sessions.push({
      id: `s${String(index).padStart(4, '0')}`,
      workspaceId: 'w1',
      title: `Session ${index}`,
      archived: false,
      parentId: null,
      createdAt: 1,
      updatedAt: 1,
      seq: 1,
    })
  const runtime = createAppRuntime({ instanceId: 'one', hostId: 'host', directory: data.directory })
  await runtime.view.commands.execute('app.setSession', { sessionId: 's0000' })
  let after: string | null = null
  let count = 0
  do {
    const page: SessionPage = await runtime.view.commands.execute('session.list', {
      workspaceId: 'w1',
      limit: 200,
      ...(after ? { after } : {}),
    })
    count += page.items.length
    after = page.nextCursor
  } while (after)
  expect(count).toBe(1001)
  expect(Object.keys(runtime.view.state.directory.getSnapshot().sessions)).toHaveLength(1000)
  expect(runtime.view.state.directory.getSnapshot().sessions.s0000?.id).toBe('s0000')
  runtime.dispose()
})

test('runtime bundle contains vanilla state but no React, DOM renderer, transport or Host implementation', async () => {
  const paths: string[] = []
  const result = await Bun.build({
    entrypoints: ['packages/app-runtime/src/index.ts'],
    target: 'browser',
    plugins: [
      {
        name: 'runtime-imports',
        setup(build) {
          build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, ({ path }) => {
            paths.push(path.replaceAll('\\', '/'))
            return undefined
          })
        },
      },
    ],
  })
  expect(result.success).toBe(true)
  expect(paths.some((path) => /\/zustand\/(?:esm\/)?vanilla\.[mc]?js$/.test(path))).toBe(true)
  expect(
    paths.filter(
      (path) =>
        /\/(?:react|react-dom|@tauri-apps)\//.test(path) ||
        /\/packages\/(?:client|kernel|storage|hbar-app-ui)\//.test(path) ||
        /\/apps\//.test(path),
    ),
  ).toEqual([])
})
