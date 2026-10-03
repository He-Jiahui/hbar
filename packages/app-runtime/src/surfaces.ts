import { CommandError, type CommandRegistry } from '@hbar/commands'
import { surfaceCommands } from '@hbar/contracts/commands'
import type { createState, StateReader } from './state'
import type { createSessionTools } from './session-tools'
import type {
  NavigationState,
  PanelSurface,
  PresentationState,
  RuntimeOptions,
  SurfaceState,
  WindowSurface,
} from './types'

const toolPanelIds = new Set([
  'files',
  'activity',
  'monitoring',
  'agents',
  'goals',
  'run-board',
  'schedules',
  'prompt-templates',
  'notifications',
  'onboarding',
])
const modalPanelIds = new Set(['commands', 'chat-search', 'settings-editor'])

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

function presentationSummary(state: PresentationState) {
  return {
    page: state.page.kind,
    pageInstanceId: state.page.kind === 'session' ? null : state.page.instanceId,
    toolInstanceId: state.toolInstanceId,
    modalInstanceId: state.modalInstanceId,
    sidebarOpen: state.sidebarOpen,
  }
}

function focusedPresentationInstance(state: PresentationState): string | null {
  return state.modalInstanceId ?? state.toolInstanceId ?? (state.page.kind === 'session' ? null : state.page.instanceId)
}

export function registerSurfaceCommands(
  local: CommandRegistry,
  platform: CommandRegistry,
  options: RuntimeOptions,
  navigation: StateReader<NavigationState>,
  surfaces: ReturnType<typeof createState<SurfaceState>>,
  presentation: ReturnType<typeof createState<PresentationState>>,
  sessionTools: Pick<ReturnType<typeof createSessionTools>, 'hide' | 'navigationTool'>,
): () => void {
  const windowTails = new Map<string, Promise<void>>()
  let lastGlobalSettingsGroup: string | null = options.initialGlobalSettings?.section ?? null
  try {
    const stored = options.settingsLanding?.readLastGlobalGroup?.() ?? null
    if (!lastGlobalSettingsGroup && stored && (options.settingsLanding?.isKnownGlobalGroup?.(stored) ?? true))
      lastGlobalSettingsGroup = stored
  } catch {
    // An unavailable device preference must not block the Settings entry.
  }
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
    // An explicit workspace without a session is a workspace-scoped target,
    // even when it happens to be the selected workspace. Do not borrow a
    // session from the active conversation to identify this panel.
    const sessionId = input.sessionId ?? (input.workspaceId === undefined ? active.sessionId : null)
    if (input.binding === 'pinned' && !workspaceId && !sessionId)
      throw new CommandError('INVALID_INPUT', 'Pinned panels require an explicit or selected target')
    const instanceId =
      input.instanceId ??
      (input.binding === 'followActive' ? panelId : `${panelId}:${workspaceId ?? 'global'}:${sessionId ?? 'none'}`)
    const current = surfaces.reader.getSnapshot()
    const existing = current.panels[instanceId]
    if (existing?.sessionTool)
      throw new CommandError('COMMAND_CONFLICT', 'Session tool targets are owned by their source session')
    if (existing && existing.panelId !== panelId)
      throw new CommandError('COMMAND_CONFLICT', 'Panel instance is already bound to another kind')
    const panel: PanelSurface = { instanceId, panelId, workspaceId, sessionId, binding: input.binding, params }
    surfaces.replace({ ...current, panels: { ...current.panels, [instanceId]: panel }, focusedPanelId: instanceId })
    const currentPresentation = presentation.reader.getSnapshot()
    if (toolPanelIds.has(panelId)) {
      presentation.replace({
        ...currentPresentation,
        page: { kind: 'session' },
        toolInstanceId: instanceId,
        modalInstanceId: null,
        returnContext: null,
      })
    } else if (modalPanelIds.has(panelId)) {
      presentation.replace({ ...currentPresentation, modalInstanceId: instanceId })
    } else if (panelId === 'settings' || panelId === 'status') {
      const returnContext =
        currentPresentation.returnContext ??
        (currentPresentation.page.kind === 'session'
          ? {
              workspaceId: active.workspaceId,
              sessionId: active.sessionId,
              toolInstanceId: currentPresentation.toolInstanceId,
            }
          : null)
      presentation.replace({
        ...currentPresentation,
        page: { kind: panelId, instanceId },
        toolInstanceId: null,
        modalInstanceId: null,
        returnContext,
      })
    }
    return summary(panel, true)
  }

  function closePanel(instanceId: string) {
    const owned = sessionTools.hide(instanceId)
    if (owned) return owned
    const current = surfaces.reader.getSnapshot()
    if (!current.panels[instanceId]) return { instanceId, closed: false }
    const panels = Object.fromEntries(Object.entries(current.panels).filter(([id]) => id !== instanceId))
    const currentPresentation = presentation.reader.getSnapshot()
    let nextPresentation = currentPresentation
    if (currentPresentation.modalInstanceId === instanceId)
      nextPresentation = { ...currentPresentation, modalInstanceId: null }
    if (currentPresentation.toolInstanceId === instanceId)
      nextPresentation = { ...nextPresentation, toolInstanceId: null }
    if (currentPresentation.page.kind !== 'session' && currentPresentation.page.instanceId === instanceId) {
      const restoredToolId = currentPresentation.returnContext?.toolInstanceId
      nextPresentation = {
        ...nextPresentation,
        page: { kind: 'session' },
        toolInstanceId: restoredToolId && panels[restoredToolId] ? restoredToolId : null,
        modalInstanceId: null,
        returnContext: null,
      }
    } else if (currentPresentation.returnContext?.toolInstanceId === instanceId) {
      nextPresentation = {
        ...nextPresentation,
        returnContext: { ...currentPresentation.returnContext, toolInstanceId: null },
      }
    }
    presentation.replace(nextPresentation)
    surfaces.replace({
      ...current,
      panels,
      focusedPanelId:
        current.focusedPanelId === instanceId ? focusedPresentationInstance(nextPresentation) : current.focusedPanelId,
    })
    return { instanceId, closed: true }
  }

  local.register(surfaceCommands['app.openPanel'], (input) =>
    input.panelId === 'extensions'
      ? openPanel('settings', input, { scope: 'global', section: 'extensions' })
      : openPanel(input.panelId, input, input.params ?? {}),
  )
  local.register(surfaceCommands['app.closePanel'], ({ instanceId }) => closePanel(instanceId))
  local.register(surfaceCommands['app.back'], () => {
    const current = presentation.reader.getSnapshot()
    const target =
      current.modalInstanceId ?? (current.page.kind === 'session' ? current.toolInstanceId : current.page.instanceId)
    if (target) closePanel(target)
    return presentationSummary(presentation.reader.getSnapshot())
  })
  local.register(surfaceCommands['app.setSidebarVisible'], ({ visible }) => {
    const current = presentation.reader.getSnapshot()
    presentation.replace({ ...current, sidebarOpen: visible })
    return presentationSummary(presentation.reader.getSnapshot())
  })
  local.register(surfaceCommands['app.openSettings'], (input) => {
    const landing = options.settingsLanding
    const section =
      input.scope === 'global' && landing
        ? (input.section ?? lastGlobalSettingsGroup ?? landing.globalGroupId)
        : input.section
    const opened = openPanel('settings', input, { scope: input.scope, targetId: input.targetId, section })
    if (input.scope === 'global' && landing && section && (landing.isKnownGlobalGroup?.(section) ?? true)) {
      lastGlobalSettingsGroup = section
      if (input.section) {
        try {
          landing.saveLastGlobalGroup?.(section)
        } catch {
          // Keep this runtime's selection even if the device cannot persist it.
        }
      }
    }
    return opened
  })
  local.register(surfaceCommands['app.openStatus'], (input) => openPanel('status', input, { section: input.section }))
  local.register(surfaceCommands['app.openSettingsEditor'], (input) =>
    openPanel('settings-editor', input, {
      scope: input.scope,
      targetId: input.targetId,
      path: input.path,
      entryId: input.entryId,
    }),
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
    const currentPresentation = presentation.reader.getSnapshot()
    const navigationSettled = target.status === 'idle'
    const nextPresentation: PresentationState = navigationSettled
      ? {
          ...currentPresentation,
          page: { kind: 'session' },
          toolInstanceId: sessionTools.navigationTool(target, currentPresentation),
          modalInstanceId: null,
          returnContext: null,
        }
      : currentPresentation
    if (navigationSettled && nextPresentation !== currentPresentation) presentation.replace(nextPresentation)
    const focusedPanelId = navigationSettled ? focusedPresentationInstance(nextPresentation) : current.focusedPanelId
    if (changed || focusedPanelId !== current.focusedPanelId) surfaces.replace({ ...current, panels, focusedPanelId })
  })
}
