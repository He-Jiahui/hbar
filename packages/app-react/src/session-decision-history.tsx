import { Fragment, useState, type ReactNode } from 'react'
import { LumenFrame, LumenButton, LumenText } from '@lumen/app-ui'
import { HbarLumenDisclosure } from './lumen-disclosure'
import type { SessionDecision } from '@hbar/app-runtime'
import './session-decision-history.css'

export interface HbarSessionDecisionHistoryLabels {
  readonly title: string
  readonly loadMore: string
  readonly count: (count: number) => string
}

export interface HbarSessionDecisionHistoryProps {
  readonly decisions: readonly SessionDecision[]
  readonly labels: HbarSessionDecisionHistoryLabels
  readonly renderDecision: (decision: SessionDecision) => ReactNode
}

/** Collapsed by default so settled decisions remain available without flooding the activity area. */
export function HbarSessionDecisionHistory({ decisions, labels, renderDecision }: HbarSessionDecisionHistoryProps) {
  const pageSize = 10
  const [visibleCount, setVisibleCount] = useState(pageSize)
  if (decisions.length === 0) return null
  const visible = decisions.slice(0, visibleCount)
  return (
    <HbarLumenDisclosure className="hbar-session-decision-history-disclosure" label={labels.title}>
      <LumenFrame className="hbar-session-decision-history" data-visible-count={visible.length}>
        <LumenText as="p">{labels.count(decisions.length)}</LumenText>
        {visible.map((decision) => (
          <Fragment key={`${decision.kind}:${decision.id}`}>{renderDecision(decision)}</Fragment>
        ))}
        {visibleCount < decisions.length ? (
          <LumenButton
            type="button"
            variant="text"
            size="s"
            onClick={() => setVisibleCount((count) => count + pageSize)}
          >
            {labels.loadMore}
          </LumenButton>
        ) : null}
      </LumenFrame>
    </HbarLumenDisclosure>
  )
}
