import { expect, test } from 'bun:test'
import type {
  NavigationState,
  PanelSurface,
  PresentationState,
  SurfaceState,
  WorkspaceTabsState,
} from '@hbar/app-runtime'
import {
  createWorkspaceToolFocusOwner,
  getWorkspaceToolFocusSnapshot,
  shouldCollapseWorkspaceSidebar,
  shouldDismissWorkspaceTool,
  type WorkspaceToolEscapeContext,
  type WorkspaceToolFocusSnapshot,
  type WorkspaceToolFocusTarget,
} from '../packages/app-react/src/workspace-tool-focus'

const target = (contextKey = 'a', instanceId = 'files', version = '1'): WorkspaceToolFocusTarget => ({
  contextKey,
  instanceId,
  key: `${contextKey}:${instanceId}:${version}`,
})

function fixture(close?: (captured: WorkspaceToolFocusTarget) => Promise<void>) {
  let snapshot: WorkspaceToolFocusSnapshot = { page: 'session', contextKey: 'a', target: null, presentation: 'none' }
  let active: string | null = 'source'
  let modal = false
  let mainVisible = true
  let toolVisible = true
  const invisible = new Set<string>()
  const focus: string[] = []
  const requests: WorkspaceToolFocusTarget[] = []
  const errors: { target: WorkspaceToolFocusTarget; code: string }[] = []
  const inMain = (node: string) => ['main', 'source', 'composer', 'selected-tab', 'modal-confirm'].includes(node)
  const inTool = (node: string) => ['tool', 'close', 'file-input', 'separator'].includes(node)
  let owner: ReturnType<typeof createWorkspaceToolFocusOwner<string>> | undefined
  owner = createWorkspaceToolFocusOwner<string>({
    read: () => snapshot,
    active: () => active,
    usable: (node) => !invisible.has(node) && (!inMain(node) || mainVisible) && (!inTool(node) || toolVisible),
    inMain,
    inTool,
    main: () => 'main',
    tool: () => 'tool',
    selectedTab: () => 'selected-tab',
    sidebar: () => 'sidebar-hide',
    modalOpen: () => modal,
    focus: (node) => {
      active = node
      focus.push(node)
      owner?.remember(node)
      return true
    },
    close: async (captured) => {
      requests.push(captured)
      if (close) return close(captured)
      snapshot = { ...snapshot, target: null, presentation: 'none' }
      mainVisible = true
      active = null
    },
    onError: (captured, code) => errors.push({ target: captured, code }),
  })
  owner.remember('source')
  const controller = owner
  return {
    owner: controller,
    focus,
    requests,
    errors,
    invisible,
    active: () => active,
    move(node: string | null) {
      active = node
      if (node) controller.remember(node)
    },
    update(patch: Partial<WorkspaceToolFocusSnapshot>) {
      snapshot = { ...snapshot, ...patch }
      controller.update()
    },
    modal(value: boolean) {
      modal = value
    },
    mainVisible(value: boolean) {
      mainVisible = value
    },
    toolVisible(value: boolean) {
      toolVisible = value
    },
  }
}

test('opening a tool focuses its named aside and explicit close restores its original visible source', async () => {
  const view = fixture()
  view.update({ target: target(), presentation: 'split' })
  expect(view.active()).toBe('tool')
  view.move('close')
  expect(await view.owner.dismiss()).toBe(true)
  expect(view.requests).toEqual([target()])
  expect(view.active()).toBe('source')
  expect(view.focus).toEqual(['tool', 'source'])
})

test('removed or disabled source falls back to named main, then current selected tab', async () => {
  for (const hidden of [['source'], ['source', 'main']]) {
    const view = fixture()
    view.update({ target: target(), presentation: 'page' })
    hidden.forEach((node) => view.invisible.add(node))
    view.move('close')
    await view.owner.dismiss()
    expect(view.active()).toBe(hidden.length === 1 ? 'main' : 'selected-tab')
  }
})

test('split to page moves inactive main focus, but leaves a deliberate sidebar focus alone', () => {
  const view = fixture()
  view.update({ target: target(), presentation: 'split' })
  view.move('composer')
  view.mainVisible(false)
  view.update({ presentation: 'page' })
  expect(view.active()).toBe('tool')
  view.mainVisible(true)
  view.update({ presentation: 'split' })
  view.move('sidebar')
  view.mainVisible(false)
  view.update({ presentation: 'page' })
  expect(view.active()).toBe('sidebar')
})

test('a collapsed main that blurred to body is repaired from remembered focus', () => {
  const view = fixture()
  view.update({ target: target(), presentation: 'split' })
  view.move('composer')
  view.mainVisible(false)
  view.move(null)
  view.update({ presentation: 'page' })
  expect(view.active()).toBe('tool')
})

test('the resize separator belongs to the exact tool and moves focus when page hides it', async () => {
  for (const blurred of [false, true]) {
    const view = fixture()
    view.update({ target: target(), presentation: 'split' })
    view.move('separator')
    view.invisible.add('separator')
    if (blurred) view.move(null)
    view.update({ presentation: 'page' })
    expect(view.active()).toBe('tool')
    view.update({ presentation: 'split' })
    view.invisible.delete('separator')
    view.move('separator')
    expect(await view.owner.dismiss()).toBe(true)
    expect(view.requests).toEqual([target()])
    expect(view.active()).toBe('source')
  }
})

test('hidden narrow-sidebar frame delays entry until it becomes usable', () => {
  const view = fixture()
  view.toolVisible(false)
  view.update({ target: target(), presentation: 'page' })
  expect(view.focus).toEqual([])
  view.toolVisible(true)
  view.owner.update()
  expect(view.focus).toEqual(['tool'])
})

test('a later deliberate selection cancels delayed entry, rather than stealing focus', () => {
  const view = fixture()
  view.toolVisible(false)
  view.update({ target: target(), presentation: 'page' })
  view.move('other-sidebar-choice')
  view.toolVisible(true)
  view.owner.update()
  expect(view.active()).toBe('other-sidebar-choice')
  expect(view.focus).toEqual([])
})

test('native modal closes after split to page without another layout change', () => {
  const view = fixture()
  view.update({ target: target(), presentation: 'split' })
  view.move('modal-confirm')
  view.modal(true)
  view.mainVisible(false)
  view.update({ presentation: 'page' })
  expect(view.active()).toBe('modal-confirm')
  view.modal(false)
  view.move(null)
  // The DOM adapter calls flush from its dialog open-attribute observer.
  view.owner.flush()
  expect(view.active()).toBe('tool')
})

test('native palette unmount without resize restores its exact original managed editor focus', () => {
  const view = fixture()
  view.update({ target: target(), presentation: 'split' })
  view.move('file-input')
  view.modal(true)
  view.move('palette-input')
  view.owner.flush()
  expect(view.active()).toBe('palette-input')
  view.modal(false)
  view.move(null)
  view.owner.flush()
  expect(view.active()).toBe('file-input')
  expect(view.requests).toEqual([])
})

test('modal recovery yields to valid deliberate outside focus and any remaining native modal', () => {
  const view = fixture()
  view.update({ target: target(), presentation: 'split' })
  view.move('file-input')
  view.modal(true)
  view.move('palette-input')
  view.move('second-modal-input')
  view.owner.flush()
  expect(view.active()).toBe('second-modal-input')
  view.modal(false)
  view.move('sidebar')
  view.owner.flush()
  expect(view.active()).toBe('sidebar')
})

test('modal return is discarded across a changed target, retired tab context or Settings page', () => {
  for (const patch of [
    { contextKey: 'b', target: target('b') },
    { target: target('a', 'files', 'rebound') },
    { page: 'settings', target: null },
  ] satisfies readonly Partial<WorkspaceToolFocusSnapshot>[]) {
    const view = fixture()
    view.update({ target: target(), presentation: 'split' })
    view.move('file-input')
    view.modal(true)
    view.move('palette-input')
    view.update(patch)
    view.focus.length = 0
    view.modal(false)
    view.move(null)
    view.owner.flush()
    expect(view.focus).toEqual([])
    expect(view.active()).toBeNull()
  }
})

test('removed pre-modal editor falls back to the same named tool rather than a disconnected element', () => {
  const view = fixture()
  view.update({ target: target(), presentation: 'split' })
  view.move('file-input')
  view.modal(true)
  view.move('palette-input')
  view.invisible.add('file-input')
  view.modal(false)
  view.move(null)
  view.owner.flush()
  expect(view.active()).toBe('tool')
})

test('modal cancel with a hidden narrow frame falls back to sidebar, then resumes the same tool', () => {
  const view = fixture()
  view.update({ target: target(), presentation: 'split' })
  view.move('modal-confirm')
  view.modal(true)
  view.mainVisible(false)
  view.toolVisible(false)
  view.update({ presentation: 'page' })
  view.modal(false)
  view.move(null)
  view.owner.flush()
  expect(view.active()).toBe('sidebar-hide')
  view.toolVisible(true)
  view.owner.update()
  expect(view.active()).toBe('tool')
  expect(view.requests).toEqual([])
})

test('actual native modal priority blocks entry, close and resize focus until dismissal', async () => {
  const view = fixture()
  view.modal(true)
  view.update({ target: target(), presentation: 'page' })
  expect(view.focus).toEqual([])
  view.move('close')
  expect(await view.owner.dismiss()).toBe(false)
  expect(view.requests).toEqual([])
  view.modal(false)
  view.owner.flush()
  expect(view.active()).toBe('tool')
})

test('Settings and Status page boundaries do not get a tool-close restoration', () => {
  for (const page of ['settings', 'status'] as const) {
    const view = fixture()
    view.update({ target: target(), presentation: 'split' })
    view.move('close')
    view.update({ page, target: null, presentation: 'none' })
    expect(view.focus).toEqual(['tool'])
    view.move('page-boundary')
    view.update({ page: 'session', target: target(), presentation: 'split' })
    expect(view.active()).toBe('page-boundary')
    expect(view.focus).toEqual(['tool'])
  }
})

test('Settings return into an inactive main is repaired, not left unreachable', () => {
  const view = fixture()
  view.update({ target: target(), presentation: 'split' })
  view.update({ page: 'settings', target: null, presentation: 'none' })
  view.move('composer')
  view.mainVisible(false)
  view.update({ page: 'session', target: target(), presentation: 'page' })
  expect(view.active()).toBe('tool')
})

test('context changes do not restore an A source into B when a late close settles', async () => {
  let resolve: (() => void) | undefined
  const pending = new Promise<void>((done) => {
    resolve = done
  })
  const view = fixture(() => pending)
  view.update({ target: target(), presentation: 'split' })
  view.move('close')
  const action = view.owner.dismiss()
  expect(await view.owner.dismiss()).toBe(false)
  view.move('sidebar-b')
  view.update({ contextKey: 'b', target: target('b'), presentation: 'split' })
  view.focus.length = 0
  resolve?.()
  expect(await action).toBe(true)
  expect(view.requests).toEqual([target()])
  expect(view.focus).toEqual([])
  expect(view.active()).toBe('sidebar-b')
})

test('late A failure cannot render on B; matching errors expose safe code, not raw private text', async () => {
  let reject: ((reason: Error) => void) | undefined
  const pending = new Promise<void>((_resolve, fail) => {
    reject = fail
  })
  const view = fixture(() => pending)
  view.update({ target: target(), presentation: 'split' })
  const action = view.owner.dismiss()
  view.move('sidebar-b')
  view.update({ contextKey: 'b', target: target('b') })
  reject?.(new Error('Private file contents'))
  expect(await action).toBe(false)
  expect(view.errors).toEqual([])
  const failed = fixture(() => Promise.reject({ code: 'TAB_NOT_FOUND', message: 'Private path' }))
  failed.update({ target: target(), presentation: 'split' })
  expect(await failed.owner.dismiss()).toBe(false)
  expect(failed.errors).toEqual([{ target: target(), code: 'TAB_NOT_FOUND' }])
  const malformed = fixture(() => Promise.reject({ code: 'Private path: D:/secret', message: 'Secret' }))
  malformed.update({ target: target(), presentation: 'split' })
  await malformed.owner.dismiss()
  expect(malformed.errors[0]?.code).toBe('EXECUTION_FAILED')
})

test('dispose cancels late effects, and a fresh StrictMode owner preserves valid tool focus', async () => {
  let resolve: (() => void) | undefined
  const pending = new Promise<void>((done) => {
    resolve = done
  })
  const view = fixture(() => pending)
  view.update({ target: target(), presentation: 'split' })
  const action = view.owner.dismiss()
  view.owner.dispose()
  view.focus.length = 0
  resolve?.()
  await action
  view.owner.update()
  view.owner.flush()
  expect(view.focus).toEqual([])
  expect(await view.owner.dismiss()).toBe(false)
  const fresh = fixture()
  fresh.move('file-input')
  fresh.update({ target: target(), presentation: 'split' })
  expect(fresh.focus).toEqual([])
  expect(fresh.active()).toBe('file-input')
})

test('Escape from main is not a command to close a different tool', async () => {
  const view = fixture()
  view.update({ target: target(), presentation: 'split' })
  view.move('composer')
  expect(await view.owner.dismiss()).toBe(false)
  expect(view.requests).toEqual([])
})

const escape: WorkspaceToolEscapeContext = {
  key: 'Escape',
  defaultPrevented: false,
  isComposing: false,
  keyCode: 27,
  repeat: false,
  modified: false,
  inTool: true,
  modalOpen: false,
  menuOpen: false,
  inCombobox: false,
  inOpenDetails: false,
}

test('narrow resize uses live sidebar state and preserves a native modal interaction', () => {
  expect(shouldCollapseWorkspaceSidebar(true, true, false)).toBe(true)
  expect(shouldCollapseWorkspaceSidebar(true, true, true)).toBe(false)
  expect(shouldCollapseWorkspaceSidebar(true, false, false)).toBe(false)
  expect(shouldCollapseWorkspaceSidebar(false, true, false)).toBe(false)
})

test('Escape yields to inner controls, IME, modifiers, native dialogs and popovers', () => {
  expect(shouldDismissWorkspaceTool(escape)).toBe(true)
  const blocked: readonly Partial<WorkspaceToolEscapeContext>[] = [
    { key: 'Enter' },
    { defaultPrevented: true },
    { isComposing: true },
    { keyCode: 229 },
    { repeat: true },
    { modified: true },
    { inTool: false },
    { modalOpen: true },
    { menuOpen: true },
    { inCombobox: true },
    { inOpenDetails: true },
  ]
  for (const patch of blocked) expect(shouldDismissWorkspaceTool({ ...escape, ...patch })).toBe(false)
})

test('identity includes exact pinned target and tab instance, not just a follow-active panel ID', () => {
  const navigation: NavigationState = { workspaceId: 'wa', sessionId: 'a', status: 'idle', error: null }
  const presentation: PresentationState = {
    page: { kind: 'session' },
    toolInstanceId: 'files',
    modalInstanceId: null,
    returnContext: null,
    sidebarOpen: false,
  }
  const panel: PanelSurface = {
    instanceId: 'files',
    panelId: 'files',
    workspaceId: 'wa',
    sessionId: 'a',
    binding: 'followActive',
    params: {},
  }
  const surfaces: SurfaceState = {
    panels: { files: panel },
    windows: {},
    focusedPanelId: 'files',
    focusedWindowId: null,
  }
  const tabs: WorkspaceTabsState = {
    items: [{ id: 'a', kind: 'session', sessionId: 'a', workspaceId: 'wa', instanceKey: 'first' }],
    activeId: 'a',
    revision: 0,
    restoreStatus: 'ready',
    restoreError: null,
    persistError: null,
  }
  const read = (nav = navigation, surface = surfaces, items = tabs) =>
    getWorkspaceToolFocusSnapshot(nav, presentation, surface, items, true, 'split')
  const original = read()
  expect(original.target?.instanceId).toBe('files')
  expect(
    read(navigation, {
      ...surfaces,
      panels: { files: { ...panel, workspaceId: 'wb', sessionId: null, binding: 'pinned' } },
    }).target?.key,
  ).not.toBe(original.target?.key)
  const first = tabs.items[0]
  if (!first) throw new Error('Fixture session tab missing')
  expect(read(navigation, surfaces, { ...tabs, items: [{ ...first, instanceKey: 'reopened' }] }).target?.key).not.toBe(
    original.target?.key,
  )
  expect(read({ ...navigation, sessionId: 'b' }).target?.key).not.toBe(original.target?.key)
  expect(read({ ...navigation, status: 'loading' }).target).toBeNull()
  expect(read(navigation, surfaces, { ...tabs, items: [] }).target).toBeNull()
  expect(
    getWorkspaceToolFocusSnapshot(
      navigation,
      { ...presentation, page: { kind: 'settings', instanceId: 'settings' } },
      surfaces,
      tabs,
      true,
      'none',
    ).target,
  ).toBeNull()
  expect(getWorkspaceToolFocusSnapshot(navigation, presentation, surfaces, tabs, false, 'none').target).toBeNull()
})
