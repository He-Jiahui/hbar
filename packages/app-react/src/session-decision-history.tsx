import { Fragment, useState, type ReactNode } from 'react'
import { LumenContentText, LumenFrame, LumenButton } from '@lumen/app-ui'
import { HbarLumenDisclosure } from './lumen-disclosure'
import type { SessionDecision } from '@hbar/app-runtime'
import './session-decision-history.css'
import { createMessageScope } from './messages'

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
const { Provider: DecisionHistoryMessagesProvider, useMessages: useDecisionHistoryMessages } =
  createMessageScope<HbarSessionDecisionHistoryLabels>()

function DecisionHistoryContent({ decisions, renderDecision }: Omit<HbarSessionDecisionHistoryProps, 'labels'>) {
  const { t } = useDecisionHistoryMessages()
  const pageSize = 10
  const [visibleCount, setVisibleCount] = useState(pageSize)
  if (decisions.length === 0) return null
  const visible = decisions.slice(0, visibleCount)
  return (
    <HbarLumenDisclosure className="hbar-session-decision-history-disclosure" label={t('title')}>
      <LumenFrame className="hbar-session-decision-history" data-visible-count={visible.length}>
        <LumenContentText context="section.description">{t('count')(decisions.length)}</LumenContentText>
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
            {t('loadMore')}
          </LumenButton>
        ) : null}
      </LumenFrame>
    </HbarLumenDisclosure>
  )
}

/** Collapsed by default so settled decisions remain available without flooding the activity area. */
export function HbarSessionDecisionHistory({ decisions, labels, renderDecision }: HbarSessionDecisionHistoryProps) {
  return (
    <DecisionHistoryMessagesProvider messages={labels}>
      <DecisionHistoryContent decisions={decisions} renderDecision={renderDecision} />
    </DecisionHistoryMessagesProvider>
  )
}
