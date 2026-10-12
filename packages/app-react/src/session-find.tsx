import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Search } from 'lucide-react'
import {
  LumenButton,
  LumenIcon,
  type LumenConversationScrollTarget,
  type LumenConversationScrollTargetResult,
} from '@lumen/app-ui'
import { createConversationFind, type ConversationFindState, type SessionTimelineState } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { createSessionFindProjector, type SessionFindSourceProjection } from './session-find-source'
import { createSessionFindHighlights } from './session-find-highlights'
import {
  sameSessionFindTarget,
  shouldOpenSessionFind,
  shouldCloseSessionFind,
  shouldCancelSessionFindReveal,
  type SessionFindTarget,
  type SessionFindTargetScope,
} from './session-find-keyboard'
import { HbarSessionFindBar, type HbarSessionFindLabels } from './session-find-view'

const closedState: ConversationFindState = {
  status: 'closed',
  scopeId: null,
  query: '',
  matches: [],
  activeIndex: -1,
  navigationRevision: 0,
  truncated: false,
  history: 'complete',
  error: null,
}
const subscribeNothing = () => () => {}
const readClosed = () => closedState

function usable(element: HTMLElement | null): element is HTMLElement {
  return (
    !!element &&
    element.isConnected &&
    !element.closest('[hidden],[inert]') &&
    !element.matches(':disabled') &&
    element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== 'hidden'
  )
}

function scopeOf(target: EventTarget | null, root: HTMLElement): SessionFindTargetScope {
  if (target === document.body) return 'body'
  if (!(target instanceof HTMLElement) || !root.contains(target)) return 'outside'
  if (target.closest('[data-session-find-bar]')) return 'find'
  if (target.closest("[data-lumen-part~=\"composer.root\"],.hbar-app-react-session-footer")) return 'composer'
  if (target.closest("[data-lumen-part~=\"page-header.root\"]")) return 'header'
  if (target.matches('input,textarea,select,[contenteditable="true"]')) return 'other-editable'
  return 'conversation'
}

function otherOverlayOpen() {
  return (
    Boolean(
      document.querySelector('dialog:modal, [popover]:popover-open, [data-hbar-mobile-header-menu][data-open="true"]'),
    ) || [...document.querySelectorAll<HTMLElement>('[role="menu"],[role="listbox"]')].some(usable)
  )
}

/** Local query owner. Canonical timeline stays in runtime; no transport or execution commands are available here. */
export function useSessionFind(timeline: SessionTimelineState, labels: HbarSessionFindLabels) {
  const runtime = useHbarRuntime()
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const tabs = useHbarRuntimeState(runtime.state.workspaceTabs)
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const descriptionId = useId()
  const [model, setModel] = useState<ReturnType<typeof createConversationFind> | null>(null)
  const modelRef = useRef<ReturnType<typeof createConversationFind> | null>(null)
  const painter = useRef<ReturnType<typeof createSessionFindHighlights> | null>(null)
  const focusReturn = useRef<{ target: SessionFindTarget; node: HTMLElement | null } | null>(null)
  const focusFrame = useRef<number | null>(null)
  const [feedback, setFeedback] = useState<'highlight' | 'target' | null>(null)
  const state = useSyncExternalStore(
    model?.reader.subscribe ?? subscribeNothing,
    model?.reader.getSnapshot ?? readClosed,
    readClosed,
  )
  const projector = useMemo(() => createSessionFindProjector(), [])
  const activeTab = tabs.items.find((tab) => tab.id === tabs.activeId)
  const target: SessionFindTarget | null =
    navigation.sessionId &&
    navigation.workspaceId &&
    presentation.page.kind === 'session' &&
    ((!activeTab && tabs.activeId === null) ||
      (activeTab?.kind === 'session' &&
        activeTab.sessionId === navigation.sessionId &&
        activeTab.workspaceId === navigation.workspaceId))
      ? {
          hostId: runtime.hostId,
          runtimeId: runtime.instanceId,
          workspaceId: navigation.workspaceId,
          sessionId: navigation.sessionId,
          tabId: activeTab?.id ?? 'retained-session',
          tabInstanceKey: activeTab?.instanceKey ?? `retained:${navigation.sessionId}`,
        }
      : null
  const scopeId = target ? JSON.stringify(target) : null
  const open = state.status !== 'closed' && state.scopeId === scopeId
  const projection = useMemo<SessionFindSourceProjection | null>(() => {
    if (!scopeId || !navigation.sessionId) return null
    if (!open) return { source: { scopeId, rows: [], history: 'complete' }, rows: new Map() }
    return (
      projector.project(timeline, scopeId, navigation.sessionId) ?? {
        source: { scopeId, rows: [], history: 'older' },
        rows: new Map(),
      }
    )
  }, [scopeId, navigation.sessionId, open, projector, timeline])
  const chosen = state.status === 'ready' && state.scopeId === scopeId ? state.matches[state.activeIndex] : undefined
  const readyTarget = useMemo<LumenConversationScrollTarget | null>(
    () =>
      chosen && scopeId && navigation.sessionId
        ? {
            requestId: JSON.stringify([
              scopeId,
              state.navigationRevision,
              chosen.rowId,
              chosen.segmentId,
              chosen.start,
              chosen.end,
            ]),
            scrollKey: navigation.sessionId,
            messageId: chosen.rowId,
            align: 'start',
          }
        : null,
    [chosen, scopeId, state.navigationRevision, navigation.sessionId],
  )
  const [heldTarget, setHeldTarget] = useState<{
    readonly scopeId: string
    readonly query: string
    readonly target: LumenConversationScrollTarget
  } | null>(null)
  // Refreshing live content temporarily clears actionable matches. Keep the
  // already-issued viewport request only for the same query/scope, so its
  // return to ready is not mistaken for another explicit navigation intent.
  const scrollTarget =
    readyTarget ??
    (state.status === 'searching' && heldTarget?.scopeId === scopeId && heldTarget.query === state.query
      ? heldTarget.target
      : null)
  useLayoutEffect(() => {
    if (readyTarget && scopeId)
      setHeldTarget((previous) =>
        previous?.target.requestId === readyTarget.requestId
          ? previous
          : { scopeId, query: state.query, target: readyTarget },
      )
    else if (state.status !== 'searching' || heldTarget?.scopeId !== scopeId || heldTarget.query !== state.query)
      setHeldTarget(null)
  }, [readyTarget, scopeId, state.query, state.status, heldTarget])
  const currentPaint = useRef<{
    state: ConversationFindState
    projection: SessionFindSourceProjection
    scopeId: string
    requestId: string | null
  } | null>(null)

  useLayoutEffect(() => {
    const owner = createConversationFind()
    modelRef.current = owner
    setModel(owner)
    return () => {
      if (modelRef.current === owner) modelRef.current = null
      owner.dispose()
      focusReturn.current = null
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current)
      projector.clear()
    }
  }, [runtime, projector])
  useLayoutEffect(() => {
    model?.setSource(projection?.source ?? null)
  }, [model, projection])
  useLayoutEffect(() => {
    focusReturn.current = null
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current)
    focusFrame.current = null
    setFeedback(null)
    painter.current?.cancelReveal()
  }, [scopeId])
  useLayoutEffect(() => {
    currentPaint.current =
      projection && scopeId ? { state, projection, scopeId, requestId: scrollTarget?.requestId ?? null } : null
    painter.current?.update()
  }, [projection, state, scopeId, scrollTarget])
  useLayoutEffect(() => {
    const root = workspaceRef.current
    if (!root) return
    const owner = createSessionFindHighlights({
      root,
      read: () => currentPaint.current,
      onFeedback: (value) => setFeedback((previous) => value ?? (previous === 'highlight' ? null : previous)),
    })
    painter.current = owner
    owner.update()
    const cancel = () => owner.cancelReveal()
    const cancelKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null
      if (
        shouldCancelSessionFindReveal({
          key: event.key,
          defaultPrevented: event.defaultPrevented,
          isComposing: event.isComposing,
          keyCode: event.keyCode,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          insideViewport: Boolean(target?.closest("[data-lumen-part~=\"conversation.messages\"]")),
          editing: Boolean(target?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')),
          activationControl: Boolean(target?.closest('button,a[href],[role="button"],[role="menu"],[role="listbox"]')),
        })
      )
        owner.cancelReveal()
    }
    root.addEventListener('wheel', cancel, { passive: true })
    root.addEventListener('touchstart', cancel, { passive: true })
    root.addEventListener('pointerdown', cancel, { passive: true })
    root.addEventListener('keydown', cancelKey)
    return () => {
      root.removeEventListener('wheel', cancel)
      root.removeEventListener('touchstart', cancel)
      root.removeEventListener('pointerdown', cancel)
      root.removeEventListener('keydown', cancelKey)
      owner.dispose()
      if (painter.current === owner) painter.current = null
    }
  }, [runtime])

  const currentTarget = () => {
    const currentNavigation = runtime.state.navigation.getSnapshot()
    const currentTabs = runtime.state.workspaceTabs.getSnapshot()
    const current = currentTabs.items.find((tab) => tab.id === currentTabs.activeId)
    if (
      !target ||
      runtime.state.presentation.getSnapshot().page.kind !== 'session' ||
      currentNavigation.sessionId !== target.sessionId ||
      currentNavigation.workspaceId !== target.workspaceId
    )
      return null
    if (current)
      return current.kind === 'session' && current.id === target.tabId && current.instanceKey === target.tabInstanceKey
        ? target
        : null
    return target.tabId === 'retained-session' && currentTabs.activeId === null ? target : null
  }
  const focusFind = () => {
    const owner = modelRef.current
    if (!owner || !scopeId || !target || !currentTarget() || !usable(workspaceRef.current) || otherOverlayOpen()) return
    const prior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    // Refocusing an already-open bar must not replace its original return
    // point with an intervening Load earlier / header action in this scope.
    if (
      !prior?.closest('[data-session-find-bar]') &&
      !sameSessionFindTarget(focusReturn.current?.target ?? null, target)
    )
      focusReturn.current = { target, node: prior }
    if (!owner.open(scopeId)) return
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current)
    focusFrame.current = requestAnimationFrame(() => {
      focusFrame.current = null
      if (
        modelRef.current !== owner ||
        !currentTarget() ||
        owner.reader.getSnapshot().scopeId !== scopeId ||
        otherOverlayOpen()
      )
        return
      if (
        document.activeElement !== prior &&
        document.activeElement !== document.body &&
        !inputRef.current?.closest('[data-session-find-bar]')?.contains(document.activeElement)
      )
        return
      inputRef.current?.focus({ preventScroll: true })
      inputRef.current?.select()
    })
  }
  const close = () => {
    const active = document.activeElement
    const mayReturn =
      active === document.body || (active instanceof HTMLElement && Boolean(active.closest('[data-session-find-bar]')))
    const captured = focusReturn.current
    modelRef.current?.close()
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current)
    focusFrame.current = null
    painter.current?.cancelReveal()
    setFeedback(null)
    if (mayReturn && currentTarget() && !otherOverlayOpen()) {
      const mobileMenuTrigger = document.querySelector<HTMLElement>(
        '[data-hbar-mobile-header-menu] .hbar-mobile-header-menu-trigger',
      )
      if (
        captured &&
        sameSessionFindTarget(captured.target, target) &&
        usable(captured.node) &&
        (workspaceRef.current?.contains(captured.node) || captured.node.matches('.hbar-mobile-header-menu-trigger'))
      )
        captured.node.focus({ preventScroll: true })
      else if (usable(triggerRef.current)) triggerRef.current.focus({ preventScroll: true })
      else if (usable(mobileMenuTrigger)) mobileMenuTrigger.focus({ preventScroll: true })
    }
    focusReturn.current = null
  }
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const root = workspaceRef.current
      if (!root) return
      const snapshot = {
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        defaultPrevented: event.defaultPrevented,
        isComposing: event.isComposing,
        keyCode: event.keyCode,
        repeat: event.repeat,
        page: presentation.page.kind,
        tabKind: activeTab?.kind ?? (target?.tabId === 'retained-session' ? 'retained-session' : 'none'),
        conversationVisible: usable(root),
        activeTargetScope: scopeOf(event.target, root),
        otherOverlayOpen: otherOverlayOpen(),
        hasSession: currentTarget() !== null,
        findOpen: open,
      } as const
      if (shouldOpenSessionFind(snapshot)) {
        event.preventDefault()
        event.stopPropagation()
        focusFind()
      } else if (shouldCloseSessionFind(snapshot)) {
        event.preventDefault()
        event.stopPropagation()
        close()
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })
  const onScrollTargetResult = (result: LumenConversationScrollTargetResult) => {
    if (result.target.requestId !== currentPaint.current?.requestId || !currentTarget()) return
    if (result.status === 'unavailable') setFeedback('target')
    else {
      setFeedback(null)
      painter.current?.reveal(result.target.requestId, result.viewport, result.row)
    }
  }
  return {
    workspaceRef,
    open,
    disabled: !target || !model,
    close,
    activate: focusFind,
    scrollTarget,
    onScrollTargetResult,
    trigger: (
      <LumenButton
        ref={triggerRef}
        className="hbar-app-react-session-tool"
        type="button"
        size="s"
        variant="text"
        indicator="none"
        disabled={!target || !model}
        aria-label={labels.entry}
        title={labels.entry}
        aria-expanded={open}
        onClick={focusFind}
      >
        <LumenIcon icon={Search} tier="sm" />
      </LumenButton>
    ),
    bar: (
      <HbarSessionFindBar
        state={state.scopeId === scopeId ? state : closedState}
        labels={labels}
        inputRef={inputRef}
        descriptionId={descriptionId}
        feedback={feedback}
        onQuery={(query) => {
          if (scopeId && currentTarget()) {
            setFeedback(null)
            modelRef.current?.setQuery(scopeId, query)
          }
        }}
        onStep={(direction) => {
          if (scopeId && currentTarget()) {
            setFeedback(null)
            modelRef.current?.step(scopeId, direction)
          }
        }}
        onClose={close}
      />
    ),
  }
}
