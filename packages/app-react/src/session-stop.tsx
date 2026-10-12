import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { LumenContentText, LumenButton, LumenFrame, type LumenToolPresentation } from '@lumen/app-ui'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { canFocusWorkspaceElement } from './workspace-tool-focus'
import {
  sameSessionStopScope,
  sessionStopCanCancel,
  sessionStopFeedback,
  sessionStopScope,
  sessionStopTarget,
  sessionStopToolMatches,
  shouldStopSessionKey,
  type SessionStopSnapshot,
  type SessionStopTarget,
} from './session-stop-model'
import './session-stop.css'
import { HbarComposerFeedback } from './composer-feedback'

export interface SessionStopLabels {
  readonly sending: string
  readonly requested: string
  readonly unknown: string
  readonly checking: string
  readonly cancelled: string
  readonly completed: string
  readonly runFailed: string
  readonly interrupted: string
  readonly guided: string
  readonly failure: (code: string) => string
  readonly check: string
  readonly dismiss: string
  readonly retry: string
  readonly offline: string
}

const terminalKinds = new Set(['cancelled', 'completed', 'run-failed', 'interrupted', 'guided'])
const SessionStopContext = createContext<{
  readonly cancel: (operationId: string) => void
  readonly notice: ReactNode
  readonly region: 'main' | 'tool'
} | null>(null)

/** Pointer and keyboard entries share the public Run action owner. */
export function useSessionStopAction() {
  return useContext(SessionStopContext)?.cancel
}

export function HbarSessionStopNotice({ region }: { readonly region: 'main' | 'tool' }) {
  const value = useContext(SessionStopContext)
  return value?.region === region ? (
    region === 'main' && value.notice ? (
      <HbarComposerFeedback>{value.notice}</HbarComposerFeedback>
    ) : (
      value.notice
    )
  ) : null
}

function overlayOpen(ownedTool: HTMLElement | null, ownedFeedback: HTMLElement | null = null) {
  const toolModal = ownedTool?.closest<HTMLElement>(
    "[data-lumen-floating-mode=\"modal\"][data-lumen-floating-open=\"true\"][aria-modal=\"true\"],dialog[data-lumen-part~=\"shell.tool-drawer\"]:modal",
  )
  const modalRoot = toolModal?.closest<HTMLElement>('[data-lumen-floating-root="true"]')
  const toolLayer =
    modalRoot && modalRoot.dataset.lumenFloatingId === toolModal?.dataset.lumenFloatingId ? modalRoot : null
  const feedbackSurface = ownedFeedback?.closest<HTMLElement>(
    '.hbar-composer-feedback-surface[data-lumen-floating-surface="true"][data-lumen-floating-open="true"]',
  )
  const feedbackParentId = feedbackSurface?.dataset.lumenFloatingParent
  const feedbackToolbar = feedbackParentId
    ? [...document.querySelectorAll<HTMLElement>("[data-lumen-part~=\"toolbar.overflow\"][data-lumen-floating-open=\"true\"]")].find(
        (element) => element.dataset.lumenFloatingId === feedbackParentId,
      )
    : undefined
  return [
    ...document.querySelectorAll<HTMLElement>(
      'dialog:modal,[popover]:popover-open,[role="menu"],[role="listbox"],[aria-modal="true"]',
    ),
  ].some(
    // The tool modal is a workspace. Explicit recovery can use its exact notice
    // and toolbar owner; keyboard cancellation never supplies that notice.
    // Every other visible overlay retains ownership.
    (element) =>
      element !== toolModal &&
      element !== toolLayer &&
      element !== feedbackSurface &&
      element !== feedbackToolbar &&
      canFocusWorkspaceElement(element) &&
      element.checkVisibility(),
  )
}

/** Only selection of a nearby notice is local; cancellation facts stay in runtime. */
export function HbarSessionStopProvider({
  children,
  labels,
  connected,
  mainRef,
  toolRef,
  toolPresentation,
}: {
  readonly children: ReactNode
  readonly labels: SessionStopLabels
  readonly connected: boolean
  readonly mainRef: RefObject<HTMLElement | null>
  readonly toolRef: RefObject<HTMLElement | null>
  readonly toolPresentation: LumenToolPresentation
}) {
  const runtime = useHbarRuntime()
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const tabs = useHbarRuntimeState(runtime.state.workspaceTabs)
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const timeline = useHbarRuntimeState(runtime.state.timeline)
  const actions = useHbarRuntimeState(runtime.state.runActions)
  const snapshot: SessionStopSnapshot = {
    hostId: runtime.hostId,
    runtimeId: runtime.instanceId,
    connected,
    navigation,
    tabs,
    presentation,
    surfaces,
    timeline,
    actions,
  }
  const scope = sessionStopScope(snapshot)
  const scopeKey = scope ? JSON.stringify(scope) : null
  const [selected, setSelected] = useState<{ owner: typeof runtime; target: SessionStopTarget } | null>(null)
  const committed = useRef({ runtime, connected, toolPresentation })
  const activeOwner = useRef<typeof runtime | null>(null)
  const noticeRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    activeOwner.current = runtime
    return () => {
      if (activeOwner.current === runtime) activeOwner.current = null
    }
  }, [runtime])
  useLayoutEffect(() => {
    committed.current = { runtime, connected, toolPresentation }
  }, [runtime, connected, toolPresentation])
  useLayoutEffect(() => {
    setSelected(null)
  }, [runtime, scopeKey])

  const read = useCallback(
    (): SessionStopSnapshot => ({
      hostId: runtime.hostId,
      runtimeId: runtime.instanceId,
      connected:
        activeOwner.current === runtime && committed.current.runtime === runtime && committed.current.connected,
      navigation: runtime.state.navigation.getSnapshot(),
      tabs: runtime.state.workspaceTabs.getSnapshot(),
      presentation: runtime.state.presentation.getSnapshot(),
      surfaces: runtime.state.surfaces.getSnapshot(),
      timeline: runtime.state.timeline.getSnapshot(),
      actions: runtime.state.runActions.getSnapshot(),
    }),
    [runtime],
  )
  const blockingOverlay = useCallback(
    (current: SessionStopSnapshot, recoveryOperationId?: string) =>
      overlayOpen(
        committed.current.toolPresentation === 'drawer' && sessionStopToolMatches(current) ? toolRef.current : null,
        recoveryOperationId && noticeRef.current?.dataset.operationId === recoveryOperationId
          ? noticeRef.current
          : null,
      ),
    [toolRef],
  )
  const cancel = (operationId: string, fromNotice = false) => {
    const current = read()
    const currentScope = sessionStopScope(current)
    if (
      !currentScope ||
      current.navigation !== navigation ||
      !sameSessionStopScope(scope, currentScope) ||
      !sessionStopCanCancel(current, operationId) ||
      blockingOverlay(current, fromNotice ? operationId : undefined)
    )
      return
    setSelected({ owner: runtime, target: { ...currentScope, operationId } })
    // No completion callback: an old request cannot navigate, focus or publish a new notice.
    void runtime.commands.execute('operation.cancel', { operationId }).catch(() => undefined)
  }
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = read()
      const main = mainRef.current
      const tool = toolRef.current
      const node = event.target
      const mainVisible = Boolean(main && canFocusWorkspaceElement(main))
      const toolVisible = Boolean(
        tool && committed.current.toolPresentation !== 'none' && canFocusWorkspaceElement(tool),
      )
      const region =
        node === document.body
          ? 'body'
          : node instanceof Node && main?.contains(node)
            ? 'main'
            : node instanceof Node && tool?.contains(node)
              ? 'tool'
              : 'outside'
      if (
        !shouldStopSessionKey(
          event,
          { scope: region, mainVisible, toolVisible, overlayOpen: blockingOverlay(current) },
          current,
        )
      )
        return
      const target = sessionStopTarget(current)
      if (!target) return
      event.preventDefault()
      setSelected({ owner: runtime, target })
      void runtime.commands.execute('operation.cancel', { operationId: target.operationId }).catch(() => undefined)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [runtime, read, mainRef, toolRef, blockingOverlay])

  // On returning to a session, unresolved canonical actions remain recoverable.
  // Old terminal completions are never resurrected after a tab/owner lifetime change.
  const retainedTarget =
    selected?.owner === runtime && sameSessionStopScope(selected.target, scope) ? selected.target : null
  const target =
    retainedTarget ??
    (scope
      ? (timeline.runs
          .map((run) => ({ ...scope, operationId: run.id }))
          .find((candidate) => {
            const feedback = sessionStopFeedback(snapshot, candidate)
            return feedback && !terminalKinds.has(feedback.kind)
          }) ?? null)
      : null)
  const feedback = target ? sessionStopFeedback(snapshot, target) : null
  const check = () => {
    const currentSnapshot = read()
    if (
      !target ||
      currentSnapshot.navigation !== navigation ||
      !sameSessionStopScope(target, sessionStopScope(currentSnapshot)) ||
      blockingOverlay(currentSnapshot, target.operationId)
    )
      return
    const current = sessionStopFeedback(currentSnapshot, target)
    if (!current?.canCheck) return
    setSelected({ owner: runtime, target })
    void runtime.commands
      .execute('runAction.reconcileCancellation', { sessionId: target.sessionId, operationId: target.operationId })
      .catch(() => undefined)
  }
  const terminal = feedback && terminalKinds.has(feedback.kind)
  const text = feedback
    ? feedback.kind === 'run-failed'
      ? labels.runFailed
      : feedback.kind === 'failed'
        ? labels.failure(feedback.error ?? 'EXECUTION_FAILED')
        : labels[feedback.kind]
    : null
  const notice =
    connected && target && feedback ? (
      <LumenFrame
        ref={noticeRef}
        className="hbar-app-react-session-stop"
        data-session-stop=""
        data-operation-id={target.operationId}
        data-stop-state={feedback.kind}
      >
        <LumenFrame className="hbar-app-react-session-stop-message" role="status" aria-live="polite" aria-atomic="true">
          <LumenContentText context="section.description">{text}</LumenContentText>
          {feedback.error && feedback.error !== 'RESULT_UNKNOWN' && feedback.kind !== 'failed' && !terminal && (
            <LumenContentText context="record.description">{labels.failure(feedback.error)}</LumenContentText>
          )}
          {!connected && !terminal && (
            <LumenContentText context="record.description">{labels.offline}</LumenContentText>
          )}
        </LumenFrame>
        <LumenFrame className="hbar-app-react-session-stop-actions">
          <LumenButton
            size="s"
            variant="text"
            // A native disabled attribute blurs the focused Check button.
            // Keep its focus while the public owner rejects repeated actions.
            aria-disabled={!terminal && !(feedback.kind === 'failed' ? feedback.canRetry : feedback.canCheck)}
            aria-busy={feedback.kind === 'checking' || feedback.kind === 'sending' || undefined}
            indicatorState={
              !terminal && !(feedback.kind === 'failed' ? feedback.canRetry : feedback.canCheck)
                ? 'disabled'
                : undefined
            }
            onClick={() => {
              const current = read()
              if (current.navigation !== navigation || !sameSessionStopScope(target, sessionStopScope(current))) return
              if (terminal) setSelected(null)
              else if (feedback.kind === 'failed') cancel(target.operationId, true)
              else check()
            }}
          >
            {terminal
              ? labels.dismiss
              : feedback.kind === 'failed'
                ? labels.retry
                : feedback.kind === 'sending'
                  ? labels.sending
                  : feedback.kind === 'checking'
                    ? labels.checking
                    : labels.check}
          </LumenButton>
        </LumenFrame>
      </LumenFrame>
    ) : null
  const region = toolPresentation !== 'none' && sessionStopToolMatches(snapshot) ? 'tool' : 'main'
  return <SessionStopContext.Provider value={{ cancel, notice, region }}>{children}</SessionStopContext.Provider>
}
