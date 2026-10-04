import { expect, test } from 'bun:test'
import { createAppRuntime, type RuntimeOptions } from '@hbar/app-runtime'

function options(): RuntimeOptions {
  return {
    instanceId: 'startup-settings',
    hostId: 'confirmed-host',
    directory: { execute: () => Promise.resolve({ items: [], nextCursor: null }) },
    surfaces: { canRender: (id) => id === 'settings' },
    settingsLanding: {
      globalGroupId: 'providers',
      isKnownGlobalGroup: (id) => ['general', 'appearance', 'providers'].includes(id),
    },
  }
}

test('initial global Settings is present synchronously with no copied entity, tool, modal or return context', async () => {
  const runtime = createAppRuntime({
    ...options(),
    initialGlobalSettings: { instanceId: 'settings-original', section: 'appearance', sidebarOpen: false },
  })
  try {
    expect(runtime.view.state.presentation.getSnapshot()).toEqual({
      page: { kind: 'settings', instanceId: 'settings-original' },
      toolInstanceId: null,
      modalInstanceId: null,
      returnContext: null,
      sidebarOpen: false,
    })
    expect(runtime.view.state.surfaces.getSnapshot()).toEqual({
      focusedPanelId: 'settings-original',
      focusedWindowId: null,
      windows: {},
      panels: {
        'settings-original': {
          instanceId: 'settings-original',
          panelId: 'settings',
          workspaceId: null,
          sessionId: null,
          binding: 'followActive',
          params: { scope: 'global', section: 'appearance' },
        },
      },
    })
    expect(runtime.view.state.navigation.getSnapshot()).toEqual({
      workspaceId: null,
      sessionId: null,
      status: 'idle',
      error: null,
    })
    await runtime.view.commands.execute('app.back', {})
    expect(runtime.view.state.presentation.getSnapshot().page).toEqual({ kind: 'session' })
    expect(runtime.view.state.surfaces.getSnapshot().panels).toEqual({})
  } finally {
    runtime.dispose()
  }
})

test('missing startup Settings leaves normal runtime defaults unchanged', () => {
  const runtime = createAppRuntime(options())
  try {
    expect(runtime.view.state.presentation.getSnapshot().page).toEqual({ kind: 'session' })
    expect(runtime.view.state.surfaces.getSnapshot().focusedPanelId).toBeNull()
  } finally {
    runtime.dispose()
  }
})

test('explicit startup category remains the last category when saved navigation is older or unavailable', async () => {
  for (const unavailable of [false, true]) {
    const runtime = createAppRuntime({
      ...options(),
      settingsLanding: {
        globalGroupId: 'providers',
        isKnownGlobalGroup: (id) => ['providers', 'appearance'].includes(id),
        readLastGlobalGroup: () => {
          if (unavailable) throw new Error('Device storage blocked')
          return 'providers'
        },
      },
      initialGlobalSettings: { instanceId: 'original-settings', section: 'appearance', sidebarOpen: false },
    })
    try {
      await runtime.view.commands.execute('app.back', {})
      const reopened = await runtime.view.commands.execute('app.openSettings', { scope: 'global' })
      expect(runtime.view.state.surfaces.getSnapshot().panels[reopened.instanceId]?.params.section).toBe('appearance')
    } finally {
      runtime.dispose()
    }
  }
})

test('startup category and capability are validated before persistence or query work', () => {
  let touched = false
  const base = {
    ...options(),
    persistence: {
      remove: () => {
        touched = true
        return Promise.resolve()
      },
      read: () => {
        touched = true
        return Promise.resolve(null)
      },
      write: () => {
        touched = true
        return Promise.resolve()
      },
    },
  }
  expect(() =>
    createAppRuntime({
      ...base,
      initialGlobalSettings: { instanceId: 'settings', section: 'invented', sidebarOpen: true },
    }),
  ).toThrow('Initial Settings category')
  expect(() =>
    createAppRuntime({
      ...base,
      surfaces: { canRender: () => false },
      initialGlobalSettings: { instanceId: 'settings', sidebarOpen: true },
    }),
  ).toThrow('cannot render Settings')
  expect(() => createAppRuntime({ ...base, initialGlobalSettings: { instanceId: '', sidebarOpen: true } })).toThrow(
    'Invalid initial',
  )
  expect(() =>
    createAppRuntime({ ...base, initialGlobalSettings: { instanceId: 'x'.repeat(161), sidebarOpen: true } }),
  ).toThrow('Invalid initial')
  expect(touched).toBe(false)
})

test('runtime schema rejects extra startup fields rather than copying arbitrary state', () => {
  const invalid = { instanceId: 'settings', sidebarOpen: true, sessionId: 'foreign-session' }
  expect(() => createAppRuntime({ ...options(), initialGlobalSettings: invalid })).toThrow('Invalid initial')
})
