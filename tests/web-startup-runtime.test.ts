import { expect, test } from 'bun:test'
import { CommandError } from '@hbar/commands'
import {
  createAppRuntime,
  type ClientJsonValue,
  type ClientPreferencesState,
  type GlobalSettingsStartup,
} from '@hbar/app-runtime'
import { createWebStartupRuntime } from '../apps/web/src/startup-runtime'
import { hostPersistenceId } from '../apps/web/src/host-identity'
import type { AppearanceEditorPort } from '../apps/web/src/appearance-editor'
import { resetWebAppearancePreferences, saveWebAppearancePreferences } from '../apps/web/src/appearance'

type Runtime = ReturnType<typeof createAppRuntime>

interface Observation {
  readonly hostId: string | null
  readonly initialSettings: GlobalSettingsStartup | undefined
  readonly runtime: Runtime
  readonly callbacks: (() => void)[]
  subscriptions: number
  releases: number
  disposals: number
}

/** Actual runtime and public preference commands; only storage and observer accounting are test adapters. */
function fixture(bootstrapValues: ClientPreferencesState['values'] = {}) {
  const values = new Map<string, unknown>()
  const writes: { readonly key: string; readonly value: ClientJsonValue }[] = []
  const observations: Observation[] = []
  let connectionDisposals = 0
  let readFailure = false
  let writeFailure = false
  let delayedWrite = false
  let delayedHost: string | null = null
  let resolveRead: ((value: unknown) => void) | undefined
  let rejectWrite: ((reason: Error) => void) | undefined
  const owner = createWebStartupRuntime({
    endpointId: 'fixture-origin',
    isKnownSettingsGroup: (id) => ['providers', 'appearance', 'general'].includes(id),
    bootstrap: () => ({ status: 'ready', revision: 0, persisted: false, restoreError: null, values: bootstrapValues }),
    createRuntime(hostId, initialSettings, initialDrafts) {
      const actual = createAppRuntime({
        instanceId: `startup-runtime-${observations.length}`,
        hostId: hostId ?? 'pending:identity',
        directory: { execute: () => Promise.resolve({ items: [], nextCursor: null }) },
        surfaces: { canRender: (id) => id === 'settings' || id === 'files' },
        settingsLanding: {
          globalGroupId: 'providers',
          isKnownGlobalGroup: (id) => ['providers', 'appearance', 'general'].includes(id),
        },
        ...(initialSettings ? { initialGlobalSettings: initialSettings } : {}),
        ...(initialDrafts ? { initialDrafts } : {}),
        ...(hostId === null
          ? {}
          : {
              persistence: {
                read(key: string) {
                  if (key.endsWith(':preferences') && readFailure)
                    return Promise.reject(new CommandError('PERSISTENCE_FAILED', 'Fixture read failure'))
                  if (key === `hbar:${delayedHost}:preferences`)
                    return new Promise<unknown>((resolve) => {
                      resolveRead = resolve
                    })
                  return Promise.resolve(values.get(key) ?? null)
                },
                write(key: string, value: ClientJsonValue) {
                  values.set(key, value)
                  writes.push({ key, value })
                  if (writeFailure) return Promise.reject(new Error('Fixture write result lost'))
                  if (delayedWrite)
                    return new Promise<void>((_resolve, reject) => {
                      rejectWrite = reject
                    })
                  return Promise.resolve()
                },
                remove(key: string) {
                  values.delete(key)
                  return Promise.resolve()
                },
              },
            }),
      })
      const observation: Observation = {
        hostId,
        initialSettings,
        runtime: actual,
        callbacks: [],
        subscriptions: 0,
        releases: 0,
        disposals: 0,
      }
      const runtime: Runtime = {
        ...actual,
        view: {
          ...actual.view,
          state: {
            ...actual.view.state,
            preferences: {
              getSnapshot: actual.view.state.preferences.getSnapshot,
              subscribe(listener) {
                observation.subscriptions++
                observation.callbacks.push(listener)
                const off = actual.view.state.preferences.subscribe(listener)
                let released = false
                return () => {
                  if (released) return
                  released = true
                  observation.releases++
                  off()
                }
              },
            },
          },
        },
        dispose() {
          observation.disposals++
          actual.dispose()
        },
      }
      observations.push(observation)
      return runtime
    },
    appearancePort(runtime): AppearanceEditorPort {
      const mutations = {
        set: (input: { key: string; value: string; expectedRevision: number }) =>
          runtime.view.commands.execute('preferences.set', input),
        unset: (input: { key: string; expectedRevision: number }) =>
          runtime.view.commands.execute('preferences.unset', input),
      }
      return {
        save: (target, revision) =>
          saveWebAppearancePreferences(
            mutations,
            runtime.view.state.preferences.getSnapshot().values,
            target,
            revision,
          ),
        reset: (revision) =>
          resetWebAppearancePreferences(mutations, runtime.view.state.preferences.getSnapshot().values, revision),
        refresh: runtime.clientPreferences.refresh,
      }
    },
    disposeConnection: () => {
      connectionDisposals++
    },
  })
  return {
    owner,
    values,
    writes,
    observations,
    get connectionDisposals() {
      return connectionDisposals
    },
    failReads(value: boolean) {
      readFailure = value
    },
    failWrites(value: boolean) {
      writeFailure = value
    },
    delayWrite() {
      delayedWrite = true
    },
    async loseDelayedWrite() {
      for (let tick = 0; tick < 20 && !rejectWrite; tick++) await Promise.resolve()
      if (!rejectWrite) throw new Error('Expected an in-flight original preference write')
      const reject = rejectWrite
      rejectWrite = undefined
      delayedWrite = false
      reject(new Error('Fixture write result lost'))
    },
    delayRead(hostId: string) {
      delayedHost = hostId
    },
    async completeDelayedRead(value: unknown) {
      // Startup persistence reads are asynchronous, but the actual runtime starts them without caller intervention.
      for (let tick = 0; tick < 20 && !resolveRead; tick++) await Promise.resolve()
      if (!resolveRead) throw new Error('Expected the actual runtime preference read to be in flight')
      const resolve = resolveRead
      resolveRead = undefined
      delayedHost = null
      resolve(value)
    },
  }
}

for (const section of ['general', 'providers', 'appearance']) {
  test(`first confirmed Host keeps the exact global Settings surface and Appearance owner: ${section}`, async () => {
    const f = fixture()
    try {
      const pending = f.owner.store.getState()
      await pending.runtime.view.commands.execute('app.openSettings', {
        scope: 'global',
        section,
        instanceId: 'original-settings-instance',
      })
      await pending.runtime.view.commands.execute('app.setSidebarVisible', { visible: false })
      pending.appearanceEditor.change('theme', 'dark')
      pending.appearanceEditor.change('textSize', 'l')
      const editorStore = pending.appearanceEditor.store
      expect(f.owner.confirmHost('confirmed')).toBe(true)
      const confirmed = f.owner.store.getState()
      expect(confirmed.runtime).not.toBe(pending.runtime)
      expect(confirmed.appearanceEditor).toBe(pending.appearanceEditor)
      expect(confirmed.appearanceEditor.store).toBe(editorStore)
      expect(confirmed.binding).toEqual({ endpointId: 'fixture-origin', generation: 1, hostId: 'confirmed' })
      expect(confirmed.runtime.view.state.presentation.getSnapshot()).toEqual({
        page: { kind: 'settings', instanceId: 'original-settings-instance' },
        toolInstanceId: null,
        modalInstanceId: null,
        returnContext: null,
        sidebarOpen: false,
      })
      expect(confirmed.runtime.view.state.surfaces.getSnapshot().panels['original-settings-instance']).toEqual({
        instanceId: 'original-settings-instance',
        panelId: 'settings',
        binding: 'followActive',
        workspaceId: null,
        sessionId: null,
        params: { scope: 'global', section },
      })
      await confirmed.runtime.ready
      expect(confirmed.appearanceEditor.store.getState()).toMatchObject({
        draft: { theme: 'dark', textSize: 'l' },
        editable: true,
        writable: true,
        status: 'idle',
      })
      expect(f.observations[0]).toMatchObject({ disposals: 1, subscriptions: 1, releases: 1 })
      expect(f.writes).toEqual([])
    } finally {
      f.owner.dispose()
    }
  })
}

test('pending bootstrap and local draft are never overwritten by the pending runtime fallback or written as saved', async () => {
  const f = fixture({ theme: 'light', 'appearance.controlSize': 's' })
  try {
    const pending = f.owner.store.getState()
    await pending.runtime.ready
    expect(pending.runtime.view.state.preferences.getSnapshot().values).toEqual({})
    expect(pending.appearanceEditor.store.getState()).toMatchObject({
      baseline: { theme: 'light', controlSize: 's' },
      available: false,
      editable: true,
      writable: false,
      persisted: false,
    })
    pending.appearanceEditor.change('theme', 'dark')
    await pending.runtime.view.commands.execute('preferences.set', { key: 'theme', value: 'system' })
    await pending.appearanceEditor.save()
    await pending.appearanceEditor.reset()
    await pending.appearanceEditor.check()
    expect(pending.appearanceEditor.store.getState()).toMatchObject({
      baseline: { theme: 'light', controlSize: 's' },
      draft: { theme: 'dark', controlSize: 's' },
      writable: false,
      status: 'idle',
    })
    f.owner.setConnection('connected')
    expect(f.owner.store.getState().connection).toBe('connecting')
    expect(f.values.size).toBe(0)
    expect(f.writes).toEqual([])
  } finally {
    f.owner.dispose()
  }
})

test('same confirmed Host reconnect keeps runtime, subscriptions, revision and unsaved draft', async () => {
  const f = fixture()
  try {
    const firstProcess = { instanceId: 'same-process-a', dataRootId: 'same-data-root' }
    const restartedProcess = { instanceId: 'same-process-b', dataRootId: 'same-data-root' }
    f.owner.confirmHost(hostPersistenceId(firstProcess))
    const confirmed = f.owner.store.getState()
    await confirmed.runtime.ready
    await confirmed.runtime.view.commands.execute('app.openSettings', { scope: 'global', section: 'appearance' })
    await confirmed.runtime.view.commands.execute('draft.setText', {
      sessionId: 'source-session',
      text: 'original draft',
    })
    confirmed.appearanceEditor.change('theme', 'dark')
    f.owner.setConnection('connected')
    f.owner.setConnection('disconnected')
    expect(f.owner.confirmHost(hostPersistenceId(restartedProcess))).toBe(true)
    f.owner.setConnection('connected')
    const reconnected = f.owner.store.getState()
    expect(reconnected.runtime).toBe(confirmed.runtime)
    expect(reconnected.appearanceEditor).toBe(confirmed.appearanceEditor)
    expect(reconnected.runtime.view.state.drafts.getSnapshot()['source-session']?.text).toBe('original draft')
    expect(reconnected.appearanceEditor.store.getState().draft.theme).toBe('dark')
    expect(f.observations).toHaveLength(2)
    expect(f.observations[1]).toMatchObject({ subscriptions: 1, releases: 0, disposals: 0 })
  } finally {
    f.owner.dispose()
  }
})

test('Host identity bounce restores only the previous Host draft snapshot', async () => {
  const f = fixture()
  try {
    f.owner.confirmHost('host-a')
    const first = f.owner.store.getState().runtime
    await first.ready
    await first.view.commands.execute('draft.setText', { sessionId: 'session-a', text: 'draft on host a' })
    expect(f.owner.confirmHost('host-b')).toBe(true)
    const second = f.owner.store.getState().runtime
    await second.ready
    expect(second.view.state.drafts.getSnapshot()['session-a']).toBeUndefined()
    await second.view.commands.execute('draft.setText', { sessionId: 'session-b', text: 'draft on host b' })
    expect(f.owner.confirmHost('host-a')).toBe(true)
    const restored = f.owner.store.getState().runtime
    await restored.ready
    expect(restored.view.state.drafts.getSnapshot()['session-a']?.text).toBe('draft on host a')
    expect(restored.view.state.drafts.getSnapshot()['session-b']).toBeUndefined()
  } finally {
    f.owner.dispose()
  }
})

test('same Host reconnect and socket errors keep unknown Appearance action and reconcile only the original result', async () => {
  const f = fixture()
  try {
    f.owner.confirmHost('same-host')
    const original = f.owner.store.getState()
    await original.runtime.ready
    await original.runtime.view.commands.execute('app.openSettings', { scope: 'global', section: 'appearance' })
    original.appearanceEditor.change('theme', 'dark')
    f.failWrites(true)
    await original.appearanceEditor.save()
    const unknown = original.appearanceEditor.store.getState()
    expect(unknown).toMatchObject({ status: 'unknown', action: { kind: 'save' }, draft: { theme: 'dark' } })
    f.owner.setConnection('disconnected')
    expect(f.owner.confirmHost('same-host')).toBe(true)
    f.owner.setConnection('connected')
    expect(f.owner.store.getState().runtime).toBe(original.runtime)
    expect(f.owner.store.getState().appearanceEditor.store.getState()).toBe(unknown)
    expect(original.runtime.view.state.presentation.getSnapshot().page.kind).toBe('settings')
    await original.appearanceEditor.save()
    expect(f.writes).toHaveLength(1)
    await original.appearanceEditor.check()
    expect(original.appearanceEditor.store.getState()).toMatchObject({ status: 'saved', action: null, revision: 1 })
    expect(f.writes).toHaveLength(1)
  } finally {
    f.owner.dispose()
  }
})

test('changing Host during a pending write cannot transfer its saving or late unknown action to the new owner', async () => {
  const f = fixture()
  try {
    f.owner.confirmHost('writing-host')
    const original = f.owner.store.getState()
    await original.runtime.ready
    original.appearanceEditor.change('theme', 'dark')
    f.delayWrite()
    const saving = original.appearanceEditor.save()
    expect(original.appearanceEditor.store.getState().status).toBe('saving')
    expect(f.owner.confirmHost('another-host')).toBe(true)
    const other = f.owner.store.getState()
    await other.runtime.ready
    await f.loseDelayedWrite()
    await saving
    expect(original.appearanceEditor.store.getState()).toMatchObject({
      status: 'unknown',
      action: { kind: 'save' },
      binding: { hostId: 'writing-host' },
    })
    expect(other.appearanceEditor.store.getState()).toMatchObject({
      status: 'idle',
      action: null,
      binding: { hostId: 'another-host', generation: 2 },
      draft: { theme: 'system' },
    })
    expect(f.writes.map((write) => write.key)).toEqual(['hbar:writing-host:preferences'])
  } finally {
    f.owner.dispose()
  }
})

test('an unknown public Settings section keeps the Settings instance but cannot obstruct first Host binding', async () => {
  const f = fixture()
  try {
    const initial = f.owner.store.getState()
    await initial.runtime.view.commands.execute('app.openSettings', {
      scope: 'global',
      instanceId: 'public-settings',
      section: 'unregistered-section',
    })
    initial.appearanceEditor.change('theme', 'dark')
    expect(f.owner.confirmHost('confirmed')).toBe(true)
    const current = f.owner.store.getState()
    await current.runtime.ready
    expect(current.binding.hostId).toBe('confirmed')
    expect(current.runtime.view.state.presentation.getSnapshot().page).toEqual({
      kind: 'settings',
      instanceId: 'public-settings',
    })
    expect(current.runtime.view.state.surfaces.getSnapshot().panels['public-settings']?.params).toEqual({
      scope: 'global',
    })
    expect(current.appearanceEditor).toBe(initial.appearanceEditor)
    expect(current.appearanceEditor.store.getState().draft.theme).toBe('dark')
  } finally {
    f.owner.dispose()
  }
})

test('different confirmed Host creates a fresh generation without Settings, session, drafts or Appearance action migration', async () => {
  const f = fixture()
  try {
    f.owner.confirmHost('original-host')
    const first = f.owner.store.getState()
    await first.runtime.ready
    await first.runtime.view.commands.execute('app.openSettings', { scope: 'global', section: 'appearance' })
    await first.runtime.view.commands.execute('draft.setText', {
      sessionId: 'same-session-id',
      text: 'private original',
    })
    first.appearanceEditor.change('theme', 'dark')
    expect(f.owner.confirmHost('different-host')).toBe(true)
    const other = f.owner.store.getState()
    await other.runtime.ready
    expect(other.binding).toEqual({ endpointId: 'fixture-origin', generation: 2, hostId: 'different-host' })
    expect(other.runtime).not.toBe(first.runtime)
    expect(other.appearanceEditor).not.toBe(first.appearanceEditor)
    expect(other.runtime.view.state.presentation.getSnapshot().page).toEqual({ kind: 'session' })
    expect(other.runtime.view.state.surfaces.getSnapshot().panels).toEqual({})
    expect(other.runtime.view.state.drafts.getSnapshot()).toEqual({})
    expect(other.appearanceEditor.store.getState()).toMatchObject({ draft: { theme: 'system' }, action: null })
    expect(f.observations[2]?.initialSettings).toBeUndefined()
    expect(f.observations[1]).toMatchObject({ subscriptions: 1, releases: 1, disposals: 1 })
    for (const lateCallback of f.observations[1]?.callbacks ?? []) lateCallback()
    expect(other.appearanceEditor.store.getState().draft.theme).toBe('system')
    expect(f.writes).toEqual([])
  } finally {
    f.owner.dispose()
  }
})

test('initial persisted revision is adopted before any explicit save, and only the confirmed namespace is written', async () => {
  const f = fixture({ theme: 'light' })
  try {
    f.values.set('hbar:real-host:preferences', { version: 1, revision: 7, value: { theme: 'light' } })
    const editor = f.owner.store.getState().appearanceEditor
    editor.change('theme', 'dark')
    expect(f.owner.confirmHost('real-host')).toBe(true)
    await f.owner.store.getState().runtime.ready
    expect(editor.store.getState()).toMatchObject({
      baseline: { theme: 'light' },
      draft: { theme: 'dark' },
      revision: 7,
    })
    expect(f.writes).toEqual([])
    await editor.save()
    expect(editor.store.getState()).toMatchObject({ status: 'saved', revision: 8, writable: true })
    expect(f.writes.map((write) => write.key)).toEqual(['hbar:real-host:preferences'])
    expect(f.values.get('hbar:real-host:preferences')).toMatchObject({
      version: 1,
      revision: 8,
      value: { theme: 'dark' },
    })
  } finally {
    f.owner.dispose()
  }
})

test('failed confirmed restore keeps the startup draft and requires a real read before enabling writes', async () => {
  const f = fixture()
  try {
    const editor = f.owner.store.getState().appearanceEditor
    editor.change('theme', 'dark')
    f.failReads(true)
    f.owner.confirmHost('restore-host')
    await f.owner.store.getState().runtime.ready
    expect(editor.store.getState()).toMatchObject({
      draft: { theme: 'dark' },
      writable: false,
      status: 'restore-error',
      restoreError: 'PERSISTENCE_FAILED',
    })
    await editor.save()
    expect(f.writes).toEqual([])
    f.failReads(false)
    await editor.check()
    expect(editor.store.getState()).toMatchObject({
      draft: { theme: 'dark' },
      writable: true,
      revision: 0,
      status: 'idle',
    })
    expect(f.writes).toEqual([])
  } finally {
    f.owner.dispose()
  }
})

test('a replaced Host late persistence response cannot populate the new Host editor or restore its Settings page', async () => {
  const f = fixture()
  try {
    f.delayRead('old-host')
    const pending = f.owner.store.getState()
    await pending.runtime.view.commands.execute('app.openSettings', { scope: 'global', section: 'appearance' })
    pending.appearanceEditor.change('theme', 'dark')
    f.owner.confirmHost('old-host')
    const old = f.owner.store.getState()
    expect(old.appearanceEditor.store.getState().writable).toBe(false)
    f.owner.confirmHost('new-host')
    const current = f.owner.store.getState()
    await current.runtime.ready
    await f.completeDelayedRead({ version: 1, revision: 99, value: { theme: 'light' } })
    await old.runtime.ready
    for (const lateCallback of f.observations[1]?.callbacks ?? []) lateCallback()
    expect(current.appearanceEditor.store.getState()).toMatchObject({
      binding: { hostId: 'new-host', generation: 2 },
      draft: { theme: 'system' },
      revision: 0,
    })
    expect(current.runtime.view.state.presentation.getSnapshot().page).toEqual({ kind: 'session' })
    expect(f.writes).toEqual([])
  } finally {
    f.owner.dispose()
  }
})

test('StrictMode cleanup followed by immediate retain keeps the owner; final release disposes exactly once', async () => {
  const f = fixture()
  const firstRelease = f.owner.retain()
  const runtime = f.owner.store.getState().runtime
  firstRelease()
  firstRelease()
  const secondRelease = f.owner.retain()
  await Promise.resolve()
  expect(f.owner.store.getState().runtime).toBe(runtime)
  expect(f.observations[0]?.disposals).toBe(0)
  expect(f.connectionDisposals).toBe(0)
  secondRelease()
  await Promise.resolve()
  expect(f.observations[0]).toMatchObject({ disposals: 1, subscriptions: 1, releases: 1 })
  expect(f.connectionDisposals).toBe(1)
  expect(f.owner.confirmHost('late-host')).toBe(false)
  f.owner.setConnection('connected')
  expect(f.observations).toHaveLength(1)
  expect(() => f.owner.retain()).toThrow('disposed')
  expect(() => f.owner.store).toThrow('disposed')
  f.owner.dispose()
  expect(f.observations[0]?.disposals).toBe(1)
  expect(f.connectionDisposals).toBe(1)
})

test('overlapping leases release in any order without premature disposal or duplicate preference subscription', async () => {
  const f = fixture()
  const firstRelease = f.owner.retain()
  const secondRelease = f.owner.retain()
  secondRelease()
  await Promise.resolve()
  expect(f.observations[0]?.disposals).toBe(0)
  expect(f.observations[0]?.subscriptions).toBe(1)
  firstRelease()
  await Promise.resolve()
  expect(f.observations[0]).toMatchObject({ disposals: 1, subscriptions: 1, releases: 1 })
  expect(f.connectionDisposals).toBe(1)
})

test('disposed uninitialized owners reject late identity confirmation without constructing a runtime', () => {
  const f = fixture()
  f.owner.dispose()
  expect(f.owner.confirmHost('late-host')).toBe(false)
  expect(f.observations).toEqual([])
  expect(f.connectionDisposals).toBe(1)
})
