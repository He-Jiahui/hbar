'use client'

import * as React from 'react'
import { LumenButton, LumenIconButton } from './primitives'
import type { LumenPlanEditorLabels, LumenPlanEditorProps } from './plan-editor'
import './plan-review.css'

export interface LumenPlanReviewContent extends LumenPlanEditorProps {
  readonly listStrategy: { readonly kind: 'pane-scroll'; readonly expectedMaximum: number }
  readonly planId: string
  readonly running: boolean
  readonly announcement?: string | undefined
  readonly onStop: () => void
  readonly labels: LumenPlanEditorLabels & {
    readonly summaryCounts: (included: number, skipped: number) => string
    readonly skippedSuffix: string
    readonly stop: string
    readonly runningReview: string
    readonly moved: (title: string, position: number, total: number) => string
    readonly added: (title: string) => string
  }
}

function ReviewGlyph({ name }: { readonly name: 'add' | 'up' | 'down' | 'skip' | 'restore' | 'play' | 'stop' }) {
  return (
    <svg className="lumen-plan-review-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {name === 'add' ? <path d="M12 5v14M5 12h14" /> : null}
      {name === 'up' ? <path d="m5 12 7-7 7 7M12 19V5" /> : null}
      {name === 'down' ? <path d="M12 5v14m7-7-7 7-7-7" /> : null}
      {name === 'skip' ? <path d="M18 6 6 18M6 6l12 12" /> : null}
      {name === 'restore' ? <path d="m9 14-5-5 5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /> : null}
      {name === 'play' ? <path d="m8 4 13 8-13 8Z" /> : null}
      {name === 'stop' ? <rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" /> : null}
    </svg>
  )
}

/** Public review presentation; all data mutations and run state belong to its host. */
export function LumenPlanReview({ content }: { readonly content: LumenPlanReviewContent }) {
  const { labels, busy, running } = content
  const steps = React.useMemo(() => {
    const seen = new Set<string>()
    return content.steps.filter((step) => {
      if (seen.has(step.id)) return false
      seen.add(step.id)
      return true
    })
  }, [content.steps])
  const included = steps.filter((step) => step.state !== 'skipped').length
  const locked = busy || running
  const canAdd = content.canAdd && !locked && content.draft.trim().length > 0
  const scroll = React.useRef<HTMLDivElement>(null)
  const [edges, setEdges] = React.useState({ top: false, bottom: false })
  React.useEffect(() => {
    const pane = scroll.current
    if (!pane) return undefined
    const update = () => {
      const next = {
        top: pane.scrollTop > 1,
        bottom: pane.scrollHeight - pane.clientHeight - pane.scrollTop > 1,
      }
      setEdges((previous) => (previous.top === next.top && previous.bottom === next.bottom ? previous : next))
    }
    const observer = new ResizeObserver(update)
    observer.observe(pane)
    pane.addEventListener('scroll', update, { passive: true })
    return () => {
      observer.disconnect()
      pane.removeEventListener('scroll', update)
    }
  }, [])
  return (
    <div className="lumen-plan-review" aria-busy={busy || undefined} data-running={running}>
      <header role="banner">
        <h2>{labels.title}</h2>
        <span>{labels.summaryCounts(included, steps.length - included)}</span>
      </header>
      <p className="lumen-plan-review-announcement" aria-live="polite">
        {content.announcement}
      </p>
      {content.before}
      <div
        className="lumen-plan-review-card"
        data-hbar-app-ui-list-strategy={content.listStrategy.kind}
        data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
      >
        <div className="lumen-plan-review-frame">
          <div className="lumen-plan-review-scroll" ref={scroll}>
            {steps.length ? (
              <ol>
                {steps.map((step, index) => (
                  <li key={step.id} data-step-id={step.id} data-skipped={step.state === 'skipped'}>
                    <span className="lumen-plan-review-number">{index + 1}</span>
                    <span className="lumen-plan-review-title">
                      {step.title}
                      {step.state === 'skipped' ? (
                        <span className="lumen-plan-review-skipped-hint">{labels.skippedSuffix}</span>
                      ) : null}
                    </span>
                    <div className="lumen-plan-review-row-actions">
                      <LumenIconButton
                        label={labels.moveUp(step.title)}
                        disabled={locked || index === 0}
                        onClick={() => content.onMove(step.id, -1)}
                      >
                        <ReviewGlyph name="up" />
                      </LumenIconButton>
                      <LumenIconButton
                        label={labels.moveDown(step.title)}
                        disabled={locked || index === steps.length - 1}
                        onClick={() => content.onMove(step.id, 1)}
                      >
                        <ReviewGlyph name="down" />
                      </LumenIconButton>
                      <LumenIconButton
                        label={step.state === 'skipped' ? labels.restore(step.title) : labels.skip(step.title)}
                        disabled={locked}
                        onClick={() => content.onRemove(step.id)}
                      >
                        <ReviewGlyph name={step.state === 'skipped' ? 'restore' : 'skip'} />
                      </LumenIconButton>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="lumen-plan-review-empty">{labels.empty}</p>
            )}
          </div>
          <div aria-hidden="true" className="lumen-plan-review-edge-overlay is-top" data-visible={edges.top} />
          <div aria-hidden="true" className="lumen-plan-review-edge-overlay is-bottom" data-visible={edges.bottom} />
        </div>
      </div>
      <div className="lumen-plan-review-add">
        <input
          aria-label={labels.addPlaceholder}
          placeholder={labels.addPlaceholder}
          value={content.draft}
          disabled={locked || !content.canAdd}
          onChange={(event) => content.onDraftChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault()
              if (canAdd) content.onAdd()
            }
          }}
        />
        <LumenButton disabled={!canAdd} onClick={content.onAdd}>
          <ReviewGlyph name="add" />
          {labels.add}
        </LumenButton>
      </div>
      {content.after}
      {content.error ? (
        <p className="lumen-plan-review-error" role="alert">
          {content.error}
        </p>
      ) : null}
      <footer role="contentinfo">
        <p>{running ? labels.runningReview : labels.review}</p>
        {content.actions}
        <LumenButton
          disabled={busy || (!running && (!content.canSubmit || included === 0))}
          onClick={running ? content.onStop : content.onSubmit}
        >
          <ReviewGlyph name={running ? 'stop' : 'play'} />
          {running ? labels.stop : labels.start(included)}
        </LumenButton>
      </footer>
    </div>
  )
}
