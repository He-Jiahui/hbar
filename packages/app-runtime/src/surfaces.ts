import { CommandError, type CommandRegistry } from '@hbar/commands'
import { surfaceCommands } from '@hbar/contracts/commands'
import type { createState, StateReader } from './state'
import type { NavigationState, PanelSurface, RuntimeOptions, SurfaceState, WindowSurface } from './types'

function summary(panel: PanelSurface, focused: boolean) {
  return {
    instanceId: panel.instanceId,
    panelId: panel.panelId,
    workspaceId: panel.workspaceId,
    sessionId: panel.sessionId,
    binding: panel.binding,
    focused,
  }
}

export function registerSurfaceCommands(
  local: CommandRegistry,
  platform: CommandRegistry,
  options: RuntimeOptions,
  navigation: StateReader<NavigationState>,
  surfaces: ReturnType<typeof createState<SurfaceState>>,
): () => void {
  const windowTails = new Map<string, Promise<void>>()
  async function serializeWindow<Value>(windowId: string, operation: () => Promise<Value>): Promise<Value> {
    const previous = windowTails.get(windowId) ?? Promise.resolve()
    const result = previous.catch(() => undefined).then(operation)
    const tail = result.then(
      () => undefined,
      () => undefined,
    )
    windowTails.set(windowId, tail)
    try {
      return await result
    } finally {
      if (windowTails.get(windowId) === tail) windowTails.delete(windowId)
    }
  }
  function openPanel(
    panelId: string,
    input: {
      instanceId?: string | undefined
      workspaceId?: string | undefined
      sessionId?: string | undefined
      binding: 'followActive' | 'pinned'
    },
    params: Readonly<Record<string, unknown>> = {},
  ) {
    if (!options.surfaces?.canRender(panelId))
      throw new CommandError('CAPABILITY_UNAVAILABLE', `This runtime cannot render panel: ${panelId}`)
    const active = navigation.getSnapshot()
    const workspaceId = input.workspaceId ?? active.workspaceId
    const sessionId = input.sessionId ?? active.sessionId
    if (input.binding === 'pinned' && !workspaceId && !sessionId)
      throw new CommandError('INVALID_INPUT', 'Pinned panels require an explicit or selected target')
    const instanceId =
      input.instanceId ??
      (input.binding === 'followActive' ? panelId : `${panelId}:${workspaceId ?? 'global'}:${sessionId ?? 'none'}`)
    const current = surfaces.reader.getSnapshot()
    const existing = current.panels[instanceId]
    if (existing && existing.panelId !== panelId)
      throw new CommandError('COMMAND_CONFLICT', 'Panel instance is already bound to another kind')
    const panel: PanelSurface = { instanceId, panelId, workspaceId, sessionId, binding: input.binding, params }
    surfaces.replace({ ...current, panels: { ...current.panels, [instanceId]: panel }, focusedPanelId: instanceId })
    return summary(panel, true)
  }

  local.register(surfaceCommands['app.openPanel'], (input) => openPanel(input.panelId, input))
  local.register(surfaceCommands['app.closePanel'], ({ instanceId }) => {
    const current = surfaces.reader.getSnapshot()
    if (!current.panels[instanceId]) return { instanceId, closed: false }
    const panels = Object.fromEntries(Object.entries(current.panels).filter(([id]) => id !== instanceId))
    surfaces.replace({
      ...current,
      panels,
      focusedPanelId: current.focusedPanelId === instanceId ? null : current.focusedPanelId,
    })
    return { instanceId, closed: true }
  })
  local.register(surfaceCommands['app.openSettings'], (input) =>
    openPanel('settings', input, { scope: input.scope, targetId: input.targetId, section: input.section }),
  )
  local.register(surfaceCommands['app.openStatus'], (input) => openPanel('status', input, { section: input.section }))
  local.register(surfaceCommands['app.openSettingsEditor'], (input) =>
    openPanel('settings-editor', input, { scope: input.scope, targetId: input.targetId, path: input.path }),
  )
  platform.register(surfaceCommands['app.openWindow'], ({ windowId, page }) =>
    serializeWindow(windowId, async () => {
      if (!options.platform)
        throw new CommandError('CAPABILITY_UNAVAILABLE', 'This runtime cannot create native or browser windows')
      const window: WindowSurface = { windowId, page }
      await options.platform.openWindow(window)
      const current = surfaces.reader.getSnapshot()
      surfaces.replace({ ...current, windows: { ...current.windows, [windowId]: window }, focusedWindowId: windowId })
      return { ...window, focused: true }
    }),
  )
  platform.register(surfaceCommands['app.closeWindow'], ({ windowId }) =>
    serializeWindow(windowId, async () => {
      const current = surfaces.reader.getSnapshot()
      if (!current.windows[windowId]) return { windowId, closed: false }
      if (!options.platform)
        throw new CommandError('CAPABILITY_UNAVAILABLE', 'This runtime cannot close native or browser windows')
      await options.platform.closeWindow(windowId)
      const latest = surfaces.reader.getSnapshot()
      const windows = Object.fromEntries(Object.entries(latest.windows).filter(([id]) => id !== windowId))
      surfaces.replace({
        ...latest,
        windows,
        focusedWindowId: latest.focusedWindowId === windowId ? null : latest.focusedWindowId,
      })
      return { windowId, closed: true }
    }),
  )
  return navigation.subscribe(() => {
    const target = navigation.getSnapshot()
    const current = surfaces.reader.getSnapshot()
    let changed = false
    const panels = Object.fromEntries(
      Object.entries(current.panels).map(([id, panel]) => {
        if (
          panel.binding !== 'followActive' ||
          (panel.workspaceId === target.workspaceId && panel.sessionId === target.sessionId)
        )
          return [id, panel]
        changed = true
        return [id, { ...panel, workspaceId: target.workspaceId, sessionId: target.sessionId }]
      }),
    )
    if (changed) surfaces.replace({ ...current, panels })
  })
}
