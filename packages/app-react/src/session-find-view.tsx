import type { RefObject } from 'react'
import { ArrowDown, ArrowUp, Search, X } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenInput, LumenText } from '@lumen/app-ui'
import { CONVERSATION_FIND_LIMITS, type ConversationFindState } from '@hbar/app-runtime'
import './session-find.css'

export interface HbarSessionFindLabels {
  readonly entry: string
  readonly title: string
  readonly input: string
  readonly placeholder: string
  readonly previous: string
  readonly next: string
  readonly close: string
  readonly searching: string
  readonly scope: string
  readonly older: string
  readonly historyFailed: string
  readonly limited: string
  readonly queryLimit: string
  readonly invalidSource: string
  readonly highlightUnavailable: string
  readonly targetUnavailable: string
  readonly count: (position: number, total: number, truncated: boolean) => string
}

/** A bounded non-modal find strip. Its host owns query, result identity and viewport navigation. */
export function HbarSessionFindBar({
  state,
  labels,
  inputRef,
  descriptionId,
  feedback,
  onQuery,
  onStep,
  onClose,
}: {
  readonly state: ConversationFindState
  readonly labels: HbarSessionFindLabels
  readonly inputRef: RefObject<HTMLInputElement | null>
  readonly descriptionId: string
  readonly feedback: 'highlight' | 'target' | null
  readonly onQuery: (query: string) => void
  readonly onStep: (direction: 1 | -1) => void
  readonly onClose: () => void
}) {
  if (state.status === 'closed') return null
  const ready = state.status === 'ready' && state.matches.length > 0
  const notice =
    state.error === 'QUERY_LIMIT'
      ? labels.queryLimit
      : state.error === 'INVALID_SOURCE'
        ? labels.invalidSource
        : feedback === 'highlight'
          ? labels.highlightUnavailable
          : feedback === 'target'
            ? labels.targetUnavailable
            : state.truncated || state.history === 'limit'
              ? labels.limited
              : state.history === 'failed'
                ? labels.historyFailed
                : state.history === 'older'
                  ? labels.older
                  : null
  return (
    <LumenFrame className="hbar-session-find-bar" data-session-find-bar role="search" aria-label={labels.title}>
      <LumenFrame className="hbar-session-find-row">
        <LumenIcon icon={Search} tier="sm" />
        <LumenInput
          ref={inputRef}
          type="search"
          variant="plain"
          value={state.query}
          maxLength={CONVERSATION_FIND_LIMITS.query + 1}
          aria-label={labels.input}
          aria-description={labels.scope}
          aria-describedby={notice ? descriptionId : undefined}
          aria-invalid={state.error === 'QUERY_LIMIT' || undefined}
          placeholder={labels.placeholder}
          onChange={(event) => onQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
            if (event.key === 'Enter') {
              event.preventDefault()
              event.stopPropagation()
              if (!event.altKey && !event.ctrlKey && !event.metaKey) onStep(event.shiftKey ? -1 : 1)
            }
          }}
        />
        <LumenText as="span" className="hbar-session-find-count" role="status" aria-live="polite" aria-atomic="true">
          {state.status === 'searching'
            ? labels.searching
            : state.query.trim()
              ? labels.count(state.activeIndex + 1, state.matches.length, state.truncated)
              : null}
        </LumenText>
        <LumenButton
          type="button"
          size="s"
          variant="text"
          indicator="none"
          aria-label={labels.previous}
          title={labels.previous}
          disabled={!ready}
          onClick={() => onStep(-1)}
        >
          <LumenIcon icon={ArrowUp} tier="sm" />
        </LumenButton>
        <LumenButton
          type="button"
          size="s"
          variant="text"
          indicator="none"
          aria-label={labels.next}
          title={labels.next}
          disabled={!ready}
          onClick={() => onStep(1)}
        >
          <LumenIcon icon={ArrowDown} tier="sm" />
        </LumenButton>
        <LumenButton
          type="button"
          size="s"
          variant="text"
          indicator="none"
          aria-label={labels.close}
          title={labels.close}
          onClick={onClose}
        >
          <LumenIcon icon={X} tier="sm" />
        </LumenButton>
      </LumenFrame>
      {notice && (
        <LumenText
          as="p"
          id={descriptionId}
          className="hbar-session-find-notice"
          role={state.error || feedback ? 'alert' : undefined}
        >
          {notice}
        </LumenText>
      )}
    </LumenFrame>
  )
}
