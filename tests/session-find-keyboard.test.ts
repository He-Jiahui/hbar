import { describe, expect, test } from 'bun:test'
import {
  sameSessionFindTarget,
  shouldCloseSessionFind,
  shouldOpenSessionFind,
  shouldCancelSessionFindReveal,
  type SessionFindKeyboardSnapshot,
  type SessionFindTarget,
  type SessionFindTargetScope,
} from '../packages/app-react/src/session-find-keyboard'

const keyboard: SessionFindKeyboardSnapshot = {
  key: 'f',
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  defaultPrevented: false,
  isComposing: false,
  keyCode: 70,
  repeat: false,
  page: 'session',
  tabKind: 'session',
  conversationVisible: true,
  activeTargetScope: 'conversation',
  otherOverlayOpen: false,
  hasSession: true,
  findOpen: false,
}

const escape: SessionFindKeyboardSnapshot = {
  ...keyboard,
  key: 'Escape',
  ctrlKey: false,
  keyCode: 27,
  findOpen: true,
}

const target: SessionFindTarget = {
  hostId: 'host-a',
  runtimeId: 'runtime-a',
  workspaceId: 'workspace-a',
  sessionId: 'session-a',
  tabId: 'tab-a',
  tabInstanceKey: 'instance-a',
}

const allowedScopes: readonly SessionFindTargetScope[] = ['conversation', 'composer', 'find', 'header', 'body']
const excludedScopes: readonly SessionFindTargetScope[] = ['tool', 'sidebar', 'other-editable', 'outside']

describe('pending Find reveal yields to owned keyboard scrolling', () => {
  const scroll = {
    key: 'PageDown',
    defaultPrevented: false,
    isComposing: false,
    keyCode: 34,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    insideViewport: true,
    editing: false,
    activationControl: false,
  }
  test.each(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' '])(
    'cancels for %s without consuming the event',
    (key) => {
      const snapshot = Object.freeze({ ...scroll, key })
      expect(shouldCancelSessionFindReveal(snapshot)).toBe(true)
      expect(snapshot.defaultPrevented).toBe(false)
    },
  )
  test('supports Ctrl+Home/End but excludes command chords and Find navigation', () => {
    expect(shouldCancelSessionFindReveal({ ...scroll, ctrlKey: true, key: 'Home' })).toBe(true)
    expect(shouldCancelSessionFindReveal({ ...scroll, ctrlKey: true, key: 'End' })).toBe(true)
    for (const key of ['Enter', 'Escape', 'f', 'Tab'])
      expect(shouldCancelSessionFindReveal({ ...scroll, key })).toBe(false)
    expect(shouldCancelSessionFindReveal({ ...scroll, ctrlKey: true })).toBe(false)
  })
  test('does not cancel for editors, controls, other panes or composing/consumed events', () => {
    const patches = [
      { insideViewport: false },
      { editing: true },
      { activationControl: true },
      { defaultPrevented: true },
      { isComposing: true },
      { keyCode: 229 },
      { altKey: true },
      { metaKey: true },
    ]
    for (const patch of patches) expect(shouldCancelSessionFindReveal({ ...scroll, ...patch })).toBe(false)
  })
})

describe('session Find keyboard ownership', () => {
  test.each([...allowedScopes])('accepts current visible conversation scope %s', (activeTargetScope) => {
    expect(shouldOpenSessionFind({ ...keyboard, activeTargetScope })).toBe(true)
    expect(shouldCloseSessionFind({ ...escape, activeTargetScope })).toBe(true)
  })

  test.each([...excludedScopes])('does not consume another surface keyboard in %s', (activeTargetScope) => {
    expect(shouldOpenSessionFind({ ...keyboard, activeTargetScope })).toBe(false)
    expect(shouldCloseSessionFind({ ...escape, activeTargetScope })).toBe(false)
  })

  const excludedContexts: readonly [string, Partial<SessionFindKeyboardSnapshot>][] = [
    ['an earlier child handler consumed the event', { defaultPrevented: true }],
    ['composition is active', { isComposing: true }],
    ['legacy composition keyCode is active', { keyCode: 229 }],
    ['the shortcut is held down', { repeat: true }],
    ['Settings owns the page', { page: 'settings' }],
    ['Status owns the page', { page: 'status' }],
    ['an expanded workbench owns the tab', { tabKind: 'workbench' }],
    ['there is no session tab', { tabKind: 'none' }],
    ['the conversation is hidden or inert behind a tool page', { conversationVisible: false }],
    ['the selected session and navigation do not agree', { hasSession: false }],
    ['a native dialog, menu, combobox or another overlay owns input', { otherOverlayOpen: true }],
  ]

  test.each(excludedContexts)('leaves the event untouched when %s', (_reason, patch) => {
    expect(shouldOpenSessionFind({ ...keyboard, ...patch })).toBe(false)
    expect(shouldCloseSessionFind({ ...escape, ...patch })).toBe(false)
  })

  test('supports Ctrl+F and Cmd+F with an uppercase key from Caps Lock', () => {
    expect(shouldOpenSessionFind(keyboard)).toBe(true)
    expect(shouldOpenSessionFind({ ...keyboard, ctrlKey: false, metaKey: true })).toBe(true)
    expect(shouldOpenSessionFind({ ...keyboard, key: 'F' })).toBe(true)
    expect(shouldOpenSessionFind({ ...keyboard, key: 'F', ctrlKey: false, metaKey: true })).toBe(true)
  })

  test('allows a second deliberate shortcut to refocus Find without using close as a toggle', () => {
    expect(shouldOpenSessionFind({ ...keyboard, findOpen: true, activeTargetScope: 'find' })).toBe(true)
    expect(shouldCloseSessionFind({ ...keyboard, findOpen: true, activeTargetScope: 'find' })).toBe(false)
    expect(shouldOpenSessionFind({ ...keyboard, findOpen: true, repeat: true })).toBe(false)
  })

  const wrongOpenKeys: readonly [string, Partial<SessionFindKeyboardSnapshot>][] = [
    ['plain F', { ctrlKey: false }],
    ['Ctrl+Cmd+F', { metaKey: true }],
    ['Alt+Ctrl+F', { altKey: true }],
    ['Shift+Ctrl+F', { shiftKey: true }],
    ['Ctrl+K', { key: 'k' }],
    ['an IME unidentified key', { key: 'Unidentified' }],
    ['an empty key', { key: '' }],
  ]

  test.each(wrongOpenKeys)('does not open for %s', (_reason, patch) => {
    expect(shouldOpenSessionFind({ ...keyboard, ...patch })).toBe(false)
  })

  const wrongCloseKeys: readonly [string, Partial<SessionFindKeyboardSnapshot>][] = [
    ['Find is already closed', { findOpen: false }],
    ['Ctrl+Escape', { ctrlKey: true }],
    ['Cmd+Escape', { metaKey: true }],
    ['Alt+Escape', { altKey: true }],
    ['Shift+Escape', { shiftKey: true }],
    ['Enter belongs to result navigation', { key: 'Enter' }],
    ['an empty key', { key: '' }],
  ]

  test.each(wrongCloseKeys)('does not close when %s', (_reason, patch) => {
    expect(shouldCloseSessionFind({ ...escape, ...patch })).toBe(false)
  })

  test('has no connection or execution-preparation gate for known read-only conversation content', () => {
    // The DOM adapter, not an execution guard, establishes the visible target.
    expect(shouldOpenSessionFind(keyboard)).toBe(true)
    expect(shouldCloseSessionFind(escape)).toBe(true)
    expect(shouldOpenSessionFind({ ...keyboard, tabKind: 'retained-session' })).toBe(true)
    expect(shouldCloseSessionFind({ ...escape, tabKind: 'retained-session' })).toBe(true)
  })

  test('a retained archived session still requires exact ownership and actual conversation visibility', () => {
    expect(shouldOpenSessionFind({ ...keyboard, tabKind: 'retained-session', hasSession: false })).toBe(false)
    expect(shouldCloseSessionFind({ ...escape, tabKind: 'retained-session', hasSession: false })).toBe(false)
    expect(shouldOpenSessionFind({ ...keyboard, tabKind: 'retained-session', conversationVisible: false })).toBe(false)
    expect(shouldCloseSessionFind({ ...escape, tabKind: 'retained-session', page: 'settings' })).toBe(false)
    expect(shouldOpenSessionFind({ ...keyboard, tabKind: 'none' })).toBe(false)
  })

  test('does not mutate the event snapshot', () => {
    const before = { ...keyboard }
    const frozen = Object.freeze({ ...keyboard })
    expect(shouldOpenSessionFind(frozen)).toBe(true)
    expect(shouldCloseSessionFind(frozen)).toBe(false)
    expect(frozen).toEqual(before)
  })
})

describe('session Find deferred focus identity', () => {
  test('accepts equal nonempty IDs without requiring the same object reference', () => {
    expect(sameSessionFindTarget(target, { ...target })).toBe(true)
    expect(sameSessionFindTarget(target, target)).toBe(true)
  })

  const identityFields: readonly (keyof SessionFindTarget)[] = [
    'hostId',
    'runtimeId',
    'workspaceId',
    'sessionId',
    'tabId',
    'tabInstanceKey',
  ]

  test.each([...identityFields])('rejects a different %s in either direction', (field) => {
    const different = { ...target, [field]: `${target[field]}-new` }
    expect(sameSessionFindTarget(target, different)).toBe(false)
    expect(sameSessionFindTarget(different, target)).toBe(false)
  })

  test.each([...identityFields])('rejects absent or whitespace-only %s even when both objects match', (field) => {
    const empty = { ...target, [field]: '' }
    const blank = { ...target, [field]: ' \t\n' }
    expect(sameSessionFindTarget(empty, { ...empty })).toBe(false)
    expect(sameSessionFindTarget(blank, { ...blank })).toBe(false)
  })

  test('does not normalize host, session or tab identity', () => {
    expect(sameSessionFindTarget(target, { ...target, hostId: 'HOST-A' })).toBe(false)
    expect(sameSessionFindTarget(target, { ...target, sessionId: ` ${target.sessionId}` })).toBe(false)
    expect(sameSessionFindTarget(target, { ...target, tabId: `${target.tabId} ` })).toBe(false)
  })

  test('rejects missing owner and an A→B→new A tab lifetime', () => {
    expect(sameSessionFindTarget(null, null)).toBe(false)
    expect(sameSessionFindTarget(target, null)).toBe(false)
    expect(sameSessionFindTarget(null, target)).toBe(false)
    const afterNavigation = { ...target, sessionId: 'session-b', tabId: 'tab-b', tabInstanceKey: 'instance-b' }
    expect(sameSessionFindTarget(target, afterNavigation)).toBe(false)
    expect(sameSessionFindTarget(target, { ...target, tabInstanceKey: 'instance-a-reopened' })).toBe(false)
    expect(sameSessionFindTarget(target, { ...target, runtimeId: 'runtime-a-recreated' })).toBe(false)
  })
})
