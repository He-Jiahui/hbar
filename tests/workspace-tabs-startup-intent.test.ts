import { expect, test } from 'bun:test'
import { CommandError, type CommandExecutor, type ExecuteOptions } from '@hbar/commands'
import { createAppRuntime, type ClientPersistencePort } from '@hbar/app-runtime'
import { directoryCommands } from '@hbar/contracts/commands'
import type { Session, Workspace } from '@hbar/contracts/directory'

const workspace: Workspace = { id: 'w', name: 'Original workspace', path: 'D:/fixture/w', createdAt: 1 }
const session: Session = {
  id: 'a',
  workspaceId: 'w',
  title: 'Saved session',
  archived: false,
  parentId: null,
  seq: 1,
  createdAt: 1,
  updatedAt: 1,
}
const savedTabs = {
  version: 1,
  activeId: 'a',
  items: [{ kind: 'session', id: 'a', sessionId: 'a', workspaceId: 'w' }],
}

function fixture(options: { initialSettings?: boolean; detached?: boolean; delayPreferences?: boolean } = {}) {
  const preferenceReady = Promise.withResolvers<void>()
  if (!options.delayPreferences) preferenceReady.resolve()
  const values = new Map<string, unknown>([
    [
      'hbar:startup-tabs:preferences',
      {
        version: 1,
        revision: 1,
        value: {
          workspaceTabs: options.detached
            ? { version: 1, activeId: null, activeWorkspaceId: 'w', items: [] }
            : savedTabs,
        },
      },
    ],
  ])
  const counts = new Map<string, number>()
  type Gate = {
    readonly entered: ReturnType<typeof Promise.withResolvers<void>>
    readonly response: ReturnType<typeof Promise.withResolvers<unknown>>
    signal: AbortSignal | undefined
  }
  const gates = new Map<string, Gate>()
  const failures = new Map<string, string>()
  const persistence: ClientPersistencePort = {
    async read(key) {
      await preferenceReady.promise
      return values.get(key) ?? null
    },
    write(key, value) {
      values.set(key, value)
      return Promise.resolve()
    },
    remove(key) {
      values.delete(key)
      return Promise.resolve()
    },
  }
  const directory: CommandExecutor = {
    execute(name, input, execution?: ExecuteOptions) {
      const count = (counts.get(name) ?? 0) + 1
      counts.set(name, count)
      const key = `${name}:${count}`
      const gate = gates.get(key)
      if (gate) {
        gate.signal = execution?.signal
        gate.entered.resolve()
        return gate.response.promise
      }
      const failure = failures.get(key)
      if (failure) return Promise.reject(new CommandError(failure, 'Fixture read failed'))
      if (name === 'session.get') {
        const target = directoryCommands['session.get'].input.parse(input)
        return Promise.resolve(target.sessionId === session.id ? session : null)
      }
      if (name === 'workspace.get') {
        const target = directoryCommands['workspace.get'].input.parse(input)
        return Promise.resolve(target.workspaceId === workspace.id ? workspace : null)
      }
      throw new Error(`Unexpected read ${name}`)
    },
  }
  const runtime = createAppRuntime({
    instanceId: crypto.randomUUID(),
    hostId: 'startup-tabs',
    directory,
    persistence,
    surfaces: { canRender: (id) => id === 'settings' },
    ...(options.initialSettings ? { initialGlobalSettings: { instanceId: 'settings', sidebarOpen: true } } : {}),
  })
  return {
    runtime,
    releasePreferences: () => preferenceReady.resolve(),
    count: (name: string) => counts.get(name) ?? 0,
    failRead(name: string, count: number, code: string) {
      failures.set(`${name}:${count}`, code)
    },
    delayRead(name: string, count: number) {
      const gate: Gate = {
        entered: Promise.withResolvers<void>(),
        response: Promise.withResolvers<unknown>(),
        signal: undefined,
      }
      gates.set(`${name}:${count}`, gate)
      return gate
    },
    settings: () => runtime.view.commands.execute('app.openSettings', { instanceId: 'settings', scope: 'global' }),
    closeSettings: () => runtime.view.commands.execute('app.closePanel', { instanceId: 'settings' }),
    select: () => runtime.view.commands.execute('workspaceTabs.select', { id: session.id }),
    tabs: () => runtime.view.state.workspaceTabs.getSnapshot(),
    navigation: () => runtime.view.state.navigation.getSnapshot(),
    page: () => runtime.view.state.presentation.getSnapshot().page.kind,
    dispose() {
      preferenceReady.resolve()
      for (const gate of gates.values()) gate.response.resolve(null)
      runtime.dispose()
    },
  }
}

const settleLateReads = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

for (const close of [false, true])
  test(`pending preferences preserve ${close ? 'open then close' : 'open'} Settings intent while restoring tab references`, async () => {
    const f = fixture({ delayPreferences: true })
    try {
      await f.settings()
      if (close) await f.closeSettings()
      f.releasePreferences()
      await f.runtime.ready
      expect(f.tabs()).toMatchObject({ activeId: null, restoreStatus: 'ready', restoreError: null })
      expect(f.tabs().items.map((item) => item.id)).toEqual(['a'])
      expect(f.navigation()).toMatchObject({ workspaceId: null, sessionId: null, status: 'idle' })
      expect(f.page()).toBe(close ? 'session' : 'settings')
      expect(f.count('session.get')).toBe(1)
    } finally {
      f.dispose()
    }
  })

test('Settings during reference validation still permits bounded restoration but not automatic selection', async () => {
  const f = fixture()
  const read = f.delayRead('session.get', 1)
  try {
    await read.entered.promise
    await f.settings()
    read.response.resolve(session)
    await f.runtime.ready
    expect(f.tabs().items.map((item) => item.id)).toEqual(['a'])
    expect(f.tabs().activeId).toBeNull()
    expect(f.page()).toBe('settings')
    expect(f.count('session.get')).toBe(1)
  } finally {
    f.dispose()
  }
})

for (const phase of ['session.get', 'workspace.get'])
  test(`surface intent cancels the final ${phase} selection, settles navigation, and never closes Settings on a late reply`, async () => {
    const f = fixture()
    const read = f.delayRead(phase, 2)
    try {
      await read.entered.promise
      expect(f.navigation().status).toBe('loading')
      expect(read.signal?.aborted).toBe(false)
      await f.settings()
      await f.runtime.ready
      expect(read.signal?.aborted).toBe(true)
      expect(f.tabs()).toMatchObject({ activeId: null, restoreStatus: 'ready', restoreError: null })
      expect(f.navigation().status).not.toBe('loading')
      expect(f.navigation().sessionId).toBeNull()
      expect(f.page()).toBe('settings')
      read.response.resolve(phase === 'session.get' ? session : workspace)
      await settleLateReads()
      expect(f.navigation().sessionId).toBeNull()
      expect(f.page()).toBe('settings')
      // Cancelling background restore must not leave navigation unusable for a later explicit tab choice.
      await f.select()
      expect(f.navigation()).toMatchObject({ sessionId: 'a', workspaceId: 'w', status: 'idle', error: null })
      expect(f.page()).toBe('session')
    } finally {
      f.dispose()
    }
  })

test('open then close Settings cancels a selection already in progress and does not later reopen the saved session', async () => {
  const f = fixture()
  const read = f.delayRead('session.get', 2)
  try {
    await read.entered.promise
    await f.settings()
    await f.closeSettings()
    await f.runtime.ready
    read.response.resolve(session)
    await settleLateReads()
    expect(read.signal?.aborted).toBe(true)
    expect(f.navigation().sessionId).toBeNull()
    expect(f.navigation().status).not.toBe('loading')
    expect(f.page()).toBe('session')
    expect(f.tabs().activeId).toBeNull()
  } finally {
    f.dispose()
  }
})

test('detached activeWorkspace lookup rechecks sticky surface intent before committing local navigation', async () => {
  const f = fixture({ detached: true })
  const read = f.delayRead('workspace.get', 1)
  try {
    await read.entered.promise
    await f.settings()
    await f.closeSettings()
    read.response.resolve(workspace)
    await f.runtime.ready
    expect(f.navigation()).toMatchObject({ workspaceId: null, sessionId: null, status: 'idle' })
    expect(f.tabs()).toMatchObject({ activeId: null, restoreStatus: 'ready', restoreError: null })
    expect(f.page()).toBe('session')
  } finally {
    f.dispose()
  }
})

test('retrySelection cannot reclaim the foreground after a Settings intent, and explicit tab selection still works', async () => {
  const f = fixture()
  f.failRead('session.get', 2, 'DISCONNECTED')
  try {
    await f.runtime.ready
    expect(f.tabs()).toMatchObject({ restoreStatus: 'error', restoreError: 'DISCONNECTED' })
    await f.settings()
    expect(await f.runtime.view.commands.execute('workspaceTabs.retryRestore', {})).toEqual({
      status: 'ready',
      error: null,
    })
    expect(f.count('session.get')).toBe(2)
    expect(f.page()).toBe('settings')
    expect(f.navigation().sessionId).toBeNull()
    await f.select()
    expect(f.navigation().sessionId).toBe('a')
    expect(f.page()).toBe('session')
  } finally {
    f.dispose()
  }
})

test('a surface opened while retrySelection is already awaiting Host selection cancels only that retry', async () => {
  const f = fixture()
  f.failRead('session.get', 2, 'DISCONNECTED')
  const read = f.delayRead('session.get', 3)
  try {
    await f.runtime.ready
    const retry = f.runtime.view.commands.execute('workspaceTabs.retryRestore', {})
    await read.entered.promise
    await f.settings()
    expect(await retry).toEqual({ status: 'ready', error: null })
    expect(read.signal?.aborted).toBe(true)
    expect(f.navigation().status).not.toBe('loading')
    read.response.resolve(session)
    await settleLateReads()
    expect(f.navigation().sessionId).toBeNull()
    expect(f.page()).toBe('settings')
    await f.select()
    expect(f.navigation().sessionId).toBe('a')
  } finally {
    f.dispose()
  }
})

test('an initial Settings surface suppresses automatic selection but never blocks an explicitly selected tab', async () => {
  const f = fixture({ initialSettings: true })
  try {
    await f.runtime.ready
    expect(f.tabs().items.map((item) => item.id)).toEqual(['a'])
    expect(f.tabs().activeId).toBeNull()
    expect(f.page()).toBe('settings')
    expect(f.count('session.get')).toBe(1)
    await f.select()
    expect(f.navigation()).toMatchObject({ sessionId: 'a', workspaceId: 'w', status: 'idle' })
    expect(f.page()).toBe('session')
  } finally {
    f.dispose()
  }
})

test('dispose aborts a final background selection and its late result cannot change the disposed navigation', async () => {
  const f = fixture()
  const read = f.delayRead('session.get', 2)
  try {
    await read.entered.promise
    f.runtime.dispose()
    await f.runtime.ready
    expect(read.signal?.aborted).toBe(true)
    const before = f.navigation()
    read.response.resolve(session)
    await settleLateReads()
    expect(f.navigation()).toBe(before)
    expect(f.navigation().sessionId).toBeNull()
  } finally {
    f.dispose()
  }
})
