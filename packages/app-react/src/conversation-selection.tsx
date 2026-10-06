import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { LoaderCircle, MessageCircle } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenContentText } from '@lumen/app-ui'
import { MAX_PROMPT_WORKSPACE_CONTEXT_QUOTE_LENGTH } from '@hbar/app-runtime'
import { isSessionCodeChrome } from './session-code-block-dom'
import {
  conversationSelectionMenuPosition,
  conversationSelectionQuoteProblem,
  conversationSelectionSubmission,
  intersectConversationSelectionRects,
  isConversationSelectionKeyboardKey,
  type ConversationSelectionRect,
  type ConversationSelectionSubmission,
} from './conversation-selection-model'
import './conversation-selection.css'

export interface HbarConversationSelectionLabels {
  readonly addToChat: string
  readonly addError: (code: string) => string
}

export interface HbarConversationSelectionProps {
  readonly sessionId: string
  readonly messageId: string
  readonly sourceRole: 'user' | 'assistant'
  readonly expectedText: string
  readonly expectedRevision: number
  readonly enabled: boolean
  readonly labels: HbarConversationSelectionLabels
  readonly onAdd: (input: ConversationSelectionSubmission) => Promise<boolean>
  readonly children: ReactNode
}

interface CapturedSelection extends ConversationSelectionSubmission {
  readonly rect: ConversationSelectionRect
  readonly bounds: ConversationSelectionRect
  readonly startContainer: Node
  readonly startOffset: number
  readonly endContainer: Node
  readonly endOffset: number
  readonly sourceRole: 'user' | 'assistant'
}

interface MenuPosition {
  readonly left: number
  readonly top: number
}

type SelectionCapture =
  | {
      readonly quote: string
      readonly rect: ConversationSelectionRect
      readonly bounds: ConversationSelectionRect
      readonly startContainer: Node
      readonly startOffset: number
      readonly endContainer: Node
      readonly endOffset: number
    }
  | { readonly problem: NonNullable<ReturnType<typeof conversationSelectionQuoteProblem>> }
  | null

const forbiddenElements = [
  'button',
  'input',
  'textarea',
  'select',
  'option',
  '[role="button"]',
  '[role="menuitem"]',
  '[contenteditable="true"]',
  '[hidden]',
  '[inert]',
  '[aria-hidden="true"]',
  '[data-session-find-exclude]',
  '[data-footnote-ref]',
  '[data-footnote-backref]',
  'img',
  'picture',
  'svg',
  '.hbar-session-message-attachment',
  '.hbar-session-message-images',
  '.hbar-session-activity',
  '.hbar-session-tool-decision',
  '.hbar-session-decision',
].join(',')

const selectionCallbacks = new WeakMap<HTMLElement, () => void>()

function elementForNode(node: Node | null): Element | null {
  if (!node) return null
  return node instanceof Element ? node : node.parentElement
}

function authoredSegmentFor(node: Node | null, root: HTMLElement): Element | null {
  const element = elementForNode(node)
  const segment = element?.closest('[data-session-find-segment]') ?? null
  return segment && root.contains(segment) ? segment : null
}

function isForbiddenTextNode(node: Text, root: HTMLElement): boolean {
  let ancestor = node.parentElement
  while (ancestor && root.contains(ancestor)) {
    if (ancestor.matches(forbiddenElements) || isSessionCodeChrome(ancestor)) return true
    if (ancestor === root) break
    ancestor = ancestor.parentElement
  }
  return false
}

/**
 * Selection is constrained by rendered authored-text roots, not Markdown offsets.
 * A single Range may cross adjacent text/proposal segments; every intersected
 * text node still has to belong to such a root and the entire Range is scanned
 * for non-text barriers.
 */
function captureSelection(root: HTMLElement): SelectionCapture {
  const selection = root.ownerDocument.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0).cloneRange()
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer) ||
    !root.contains(range.commonAncestorContainer) ||
    !authoredSegmentFor(range.startContainer, root) ||
    !authoredSegmentFor(range.endContainer, root)
  )
    return null

  const common = range.commonAncestorContainer
  const traversalRoot = common instanceof Element ? common : common.parentElement
  if (!traversalRoot) return null
  let textNodes = 0
  let blocked = false
  const walker = root.ownerDocument.createTreeWalker(traversalRoot, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node instanceof Element) {
        if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT
        if (node.matches(forbiddenElements) || isSessionCodeChrome(node)) {
          blocked = true
          return NodeFilter.FILTER_REJECT
        }
        return NodeFilter.FILTER_SKIP
      }
      if (!(node instanceof Text) || !range.intersectsNode(node)) return NodeFilter.FILTER_REJECT
      if (!authoredSegmentFor(node, root) || isForbiddenTextNode(node, root)) {
        blocked = true
        return NodeFilter.FILTER_REJECT
      }
      textNodes += 1
      return NodeFilter.FILTER_ACCEPT
    },
  })
  while (walker.nextNode()) {
    // The filter validates visited text and prunes unselected subtrees.
  }
  if (blocked || textNodes === 0) return null

  const pane = root.closest<HTMLElement>('.lumen-conversation-messages')
  const view = root.ownerDocument.defaultView
  if (!pane || !view) return null
  const paneRect = pane.getBoundingClientRect()
  const paneBounds = {
    left: paneRect.left + pane.clientLeft,
    top: paneRect.top + pane.clientTop,
    right: paneRect.left + pane.clientLeft + pane.clientWidth,
    bottom: paneRect.top + pane.clientTop + pane.clientHeight,
  }
  const visibleBounds = intersectConversationSelectionRects(paneBounds, {
    left: 0,
    top: 0,
    right: view.innerWidth,
    bottom: view.innerHeight,
  })
  if (!visibleBounds) return null

  const visibleRects = Array.from(range.getClientRects())
    .map((rect) => intersectConversationSelectionRects(rect, visibleBounds))
    .filter((rect): rect is ConversationSelectionRect => rect !== null)
  const focusAtStart = selection.focusNode === range.startContainer && selection.focusOffset === range.startOffset
  const anchor = focusAtStart ? visibleRects[0] : visibleRects.at(-1)
  if (!anchor) return null

  const quote = selection.toString().trim()
  const problem = conversationSelectionQuoteProblem(quote, MAX_PROMPT_WORKSPACE_CONTEXT_QUOTE_LENGTH)
  if (problem) return { problem }
  return {
    quote,
    rect: anchor,
    bounds: visibleBounds,
    startContainer: range.startContainer,
    startOffset: range.startOffset,
    endContainer: range.endContainer,
    endOffset: range.endOffset,
  }
}

function selectionErrorCode(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

function sameSelection(selection: Selection | null, captured: CapturedSelection): boolean {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false
  const range = selection.getRangeAt(0)
  return (
    range.startContainer === captured.startContainer &&
    range.startOffset === captured.startOffset &&
    range.endContainer === captured.endContainer &&
    range.endOffset === captured.endOffset
  )
}

/** One session-level keyboard listener delegates to only the mounted message that owns the native Range. */
export function useConversationSelectionKeyboardOwner(rootRef: { readonly current: HTMLElement | null }) {
  useEffect(() => {
    const onKeyUp = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null
      if (
        !isConversationSelectionKeyboardKey({
          key: event.key,
          shiftKey: event.shiftKey,
          isComposing: event.isComposing || event.keyCode === 229,
          editing: Boolean(
            target?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),button'),
          ),
        })
      )
        return
      const selection = document.getSelection()
      const anchor = elementForNode(selection?.anchorNode ?? null)?.closest<HTMLElement>(
        '[data-hbar-conversation-selection-message]',
      )
      const focus = elementForNode(selection?.focusNode ?? null)?.closest<HTMLElement>(
        '[data-hbar-conversation-selection-message]',
      )
      if (!anchor || anchor !== focus || !rootRef.current?.contains(anchor)) return
      selectionCallbacks.get(anchor)?.()
    }
    document.addEventListener('keyup', onKeyUp, true)
    return () => document.removeEventListener('keyup', onKeyUp, true)
  }, [rootRef])
}

export function HbarConversationSelection({
  sessionId,
  messageId,
  sourceRole,
  expectedText,
  expectedRevision,
  enabled,
  labels,
  onAdd,
  children,
}: HbarConversationSelectionProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const currentProps = useRef({ sessionId, messageId, sourceRole, expectedText, expectedRevision, enabled, onAdd })
  currentProps.current = { sessionId, messageId, sourceRole, expectedText, expectedRevision, enabled, onAdd }
  const selectionFrame = useRef<number | null>(null)
  const operationId = useRef(0)
  const mounted = useRef(false)
  const [captured, setCaptured] = useState<CapturedSelection | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)
  const pointerStartedInside = useRef(false)
  const [position, setPosition] = useState<MenuPosition | null>(null)

  const clearFrame = useCallback(() => {
    if (selectionFrame.current !== null) cancelAnimationFrame(selectionFrame.current)
    selectionFrame.current = null
  }, [])
  const dismiss = useCallback(() => {
    operationId.current += 1
    pendingRef.current = false
    setPending(false)
    setCaptured(null)
    setPosition(null)
    setErrorCode(null)
  }, [])
  const updateSelection = useCallback(() => {
    clearFrame()
    const version = operationId.current
    selectionFrame.current = requestAnimationFrame(() => {
      selectionFrame.current = null
      const props = currentProps.current
      const root = rootRef.current
      if (!root || !props.enabled) {
        dismiss()
        return
      }
      const candidate = captureSelection(root)
      if (!candidate) {
        dismiss()
        return
      }
      if ('problem' in candidate) {
        if (candidate.problem === 'EMPTY_SELECTION') {
          dismiss()
          return
        }
        setCaptured(null)
        setPosition(null)
        setErrorCode(candidate.problem)
        return
      }
      const submission = conversationSelectionSubmission({
        sessionId: props.sessionId,
        messageId: props.messageId,
        expectedText: props.expectedText,
        quote: candidate.quote,
        expectedRevision: props.expectedRevision,
        maxQuoteLength: MAX_PROMPT_WORKSPACE_CONTEXT_QUOTE_LENGTH,
      })
      if (!submission) {
        dismiss()
        return
      }
      // A target/content/enable transition invalidates queued work before it can
      // attach an old selection to a replacement message.
      if (version !== operationId.current) return
      setErrorCode(null)
      setCaptured({
        ...submission,
        rect: candidate.rect,
        bounds: candidate.bounds,
        startContainer: candidate.startContainer,
        startOffset: candidate.startOffset,
        endContainer: candidate.endContainer,
        endOffset: candidate.endOffset,
        sourceRole: props.sourceRole,
      })
    })
  }, [clearFrame, dismiss])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      clearFrame()
      operationId.current += 1
    }
  }, [clearFrame])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    selectionCallbacks.set(root, updateSelection)
    return () => {
      if (selectionCallbacks.get(root) === updateSelection) selectionCallbacks.delete(root)
    }
  }, [updateSelection])

  useEffect(() => {
    if (!captured) return
    const props = currentProps.current
    const sameTarget =
      captured.sessionId === props.sessionId &&
      captured.messageId === props.messageId &&
      captured.sourceRole === props.sourceRole &&
      captured.expectedText === props.expectedText &&
      props.enabled
    if (!sameTarget || (!pendingRef.current && captured.expectedRevision !== props.expectedRevision)) dismiss()
  }, [captured, sessionId, messageId, sourceRole, expectedText, expectedRevision, enabled, dismiss])

  useLayoutEffect(() => {
    if (!captured || !menuRef.current) {
      setPosition(null)
      return
    }
    const bounds = menuRef.current.getBoundingClientRect()
    setPosition(
      conversationSelectionMenuPosition(captured.rect, captured.bounds, {
        width: bounds.width,
        height: bounds.height,
      }),
    )
  }, [captured, labels.addToChat, pending, errorCode])

  useEffect(() => {
    if (!captured) return
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) dismiss()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      dismiss()
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', escape, true)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', escape, true)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [captured, dismiss])

  const submit = async () => {
    if (!captured || pendingRef.current || !currentProps.current.enabled) return
    const id = ++operationId.current
    pendingRef.current = true
    setPending(true)
    setErrorCode(null)
    try {
      const added = await currentProps.current.onAdd({
        sessionId: captured.sessionId,
        messageId: captured.messageId,
        expectedText: captured.expectedText,
        quote: captured.quote,
        expectedRevision: captured.expectedRevision,
      })
      if (!mounted.current || operationId.current !== id) return
      if (!added) {
        setErrorCode('EXECUTION_FAILED')
        return
      }
      const selection = rootRef.current?.ownerDocument.getSelection() ?? null
      if (sameSelection(selection, captured)) selection?.removeAllRanges()
      setCaptured(null)
      setPosition(null)
      setErrorCode(null)
    } catch (reason) {
      if (mounted.current && operationId.current === id) setErrorCode(selectionErrorCode(reason))
    } finally {
      if (mounted.current && operationId.current === id) {
        pendingRef.current = false
        setPending(false)
      }
    }
  }

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const primary = event.button === 0 && !(event.pointerType === 'mouse' && event.ctrlKey)
    pointerStartedInside.current = primary && event.target instanceof Node && event.currentTarget.contains(event.target)
    if (pointerStartedInside.current && captured) dismiss()
  }
  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointerStartedInside.current) return
    pointerStartedInside.current = false
    if (event.button === 0 && !(event.pointerType === 'mouse' && event.ctrlKey)) updateSelection()
  }

  return (
    <LumenFrame
      ref={rootRef}
      className="hbar-conversation-selection-message"
      data-hbar-conversation-selection-message={sourceRole}
      onPointerDownCapture={pointerDown}
      onPointerUpCapture={pointerUp}
    >
      {children}
      {errorCode ? (
        <LumenContentText
          context="feedback.paragraph"
          className="hbar-conversation-selection-error"
          data-hbar-conversation-selection-error=""
          role="alert"
        >
          {labels.addError(errorCode)}
        </LumenContentText>
      ) : null}
      {captured && typeof document !== 'undefined'
        ? createPortal(
            <LumenFrame
              ref={menuRef}
              className="hbar-conversation-selection-menu"
              data-hbar-conversation-selection-menu=""
              style={{
                left: position?.left ?? 0,
                top: position?.top ?? 0,
                visibility: position ? 'visible' : 'hidden',
              }}
            >
              <LumenButton
                type="button"
                variant="text"
                indicator="none"
                size="m"
                data-hbar-conversation-selection-add=""
                disabled={pending || !enabled}
                loading={pending}
                aria-busy={pending || undefined}
                onPointerDown={(event) => event.preventDefault()}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void submit()}
              >
                <LumenIcon icon={pending ? LoaderCircle : MessageCircle} tier="lg" />
                {labels.addToChat}
              </LumenButton>
            </LumenFrame>,
            document.body,
          )
        : null}
    </LumenFrame>
  )
}
