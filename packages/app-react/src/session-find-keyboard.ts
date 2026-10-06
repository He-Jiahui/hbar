import type { PresentationState } from '@hbar/app-runtime'

/** A captured conversation lifetime, not merely the currently selected session ID. */
export interface SessionFindTarget {
  readonly hostId: string
  readonly runtimeId: string
  readonly workspaceId: string
  readonly sessionId: string
  readonly tabId: string
  readonly tabInstanceKey: string
}

export type SessionFindTargetScope =
  'conversation' | 'composer' | 'find' | 'header' | 'body' | 'tool' | 'sidebar' | 'other-editable' | 'outside'

/**
 * The DOM owner supplies a fresh snapshot after child handlers have run.
 * `conversationVisible` excludes hidden/inert tool-page backgrounds. `hasSession`
 * means the active session tab and navigation target agree, or a retained readable
 * session has an explicit owner lifetime; it does not mean a cached session exists.
 * `otherOverlayOpen` excludes this non-modal Find bar itself.
 */
export interface SessionFindKeyboardSnapshot {
  readonly key: string
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
  readonly defaultPrevented: boolean
  readonly isComposing: boolean
  readonly keyCode: number
  readonly repeat: boolean
  readonly page: PresentationState['page']['kind']
  readonly tabKind: 'session' | 'retained-session' | 'workbench' | 'none'
  readonly conversationVisible: boolean
  readonly activeTargetScope: SessionFindTargetScope
  readonly otherOverlayOpen: boolean
  readonly hasSession: boolean
  readonly findOpen: boolean
}

function ownsConversationKeyboard(snapshot: SessionFindKeyboardSnapshot): boolean {
  if (
    snapshot.defaultPrevented ||
    snapshot.isComposing ||
    snapshot.keyCode === 229 ||
    snapshot.repeat ||
    snapshot.page !== 'session' ||
    (snapshot.tabKind !== 'session' && snapshot.tabKind !== 'retained-session') ||
    !snapshot.conversationVisible ||
    !snapshot.hasSession ||
    snapshot.otherOverlayOpen
  ) {
    return false
  }
  switch (snapshot.activeTargetScope) {
    case 'conversation':
    case 'composer':
    case 'find':
    case 'header':
    case 'body':
      return true
    case 'tool':
    case 'sidebar':
    case 'other-editable':
    case 'outside':
      return false
  }
}

/** Repeated deliberate Ctrl/Cmd+F can refocus an open bar; held-key repeats cannot. */
export function shouldOpenSessionFind(snapshot: SessionFindKeyboardSnapshot): boolean {
  return (
    ownsConversationKeyboard(snapshot) &&
    snapshot.key.toLowerCase() === 'f' &&
    snapshot.ctrlKey !== snapshot.metaKey &&
    !snapshot.altKey &&
    !snapshot.shiftKey
  )
}

/** Only the currently owned conversation may consume Escape to close Find. */
export function shouldCloseSessionFind(snapshot: SessionFindKeyboardSnapshot): boolean {
  return (
    ownsConversationKeyboard(snapshot) &&
    snapshot.findOpen &&
    snapshot.key === 'Escape' &&
    !snapshot.ctrlKey &&
    !snapshot.metaKey &&
    !snapshot.altKey &&
    !snapshot.shiftKey
  )
}

/** Cancel pending reveal for an actual scroll intent, never an editor caret or control action. */
export function shouldCancelSessionFindReveal(snapshot: {
  readonly key: string
  readonly defaultPrevented: boolean
  readonly isComposing: boolean
  readonly keyCode: number
  readonly altKey: boolean
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly insideViewport: boolean
  readonly editing: boolean
  readonly activationControl: boolean
}): boolean {
  return (
    snapshot.insideViewport &&
    !snapshot.editing &&
    !snapshot.activationControl &&
    !snapshot.defaultPrevented &&
    !snapshot.isComposing &&
    snapshot.keyCode !== 229 &&
    !snapshot.altKey &&
    !snapshot.metaKey &&
    (!snapshot.ctrlKey || snapshot.key === 'Home' || snapshot.key === 'End') &&
    ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(snapshot.key)
  )
}

/**
 * An identity check for deferred focus work, not permission to focus a DOM node.
 * The caller must still check its runtime lifetime, visibility, current focus and
 * any higher-priority overlay. IDs are compared exactly, without normalization.
 */
export function sameSessionFindTarget(left: SessionFindTarget | null, right: SessionFindTarget | null): boolean {
  if (!left || !right) return false
  return (
    left.hostId.trim().length > 0 &&
    left.runtimeId.trim().length > 0 &&
    left.workspaceId.trim().length > 0 &&
    left.sessionId.trim().length > 0 &&
    left.tabId.trim().length > 0 &&
    left.tabInstanceKey.trim().length > 0 &&
    left.hostId === right.hostId &&
    left.runtimeId === right.runtimeId &&
    left.workspaceId === right.workspaceId &&
    left.sessionId === right.sessionId &&
    left.tabId === right.tabId &&
    left.tabInstanceKey === right.tabInstanceKey
  )
}
