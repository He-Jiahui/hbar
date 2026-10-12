import type { SessionDraftState, SessionTimelineState } from '@hbar/app-runtime'
import { LumenContentText, LumenFrame } from '@lumen/app-ui'
import { createMessageScope } from './messages'

export interface HbarSessionEmptyHeroLabels {
  readonly markUrl: string
  readonly title: string
  readonly description: string
}

const { Provider: SessionEmptyHeroMessagesProvider, useMessages: useSessionEmptyHeroMessages } =
  createMessageScope<HbarSessionEmptyHeroLabels>()

export interface SessionEmptyHeroFacts {
  readonly connected: boolean
  readonly sessionId: string | null
  readonly loadedSessionId: string | null
  readonly timelineStatus: SessionTimelineState['status']
  readonly timelineError: string | null
  readonly olderStatus: SessionTimelineState['olderStatus']
  readonly hasOlder: boolean
  readonly messageCount: number
  readonly runCount: number
  readonly streamCount: number
  readonly approvalCount: number
  readonly userInputCount: number
  readonly draftStatus: SessionDraftState['status'] | null
  readonly lastOperationId: string | null
  readonly submissionPending: boolean
}

/** A welcome state is only truthful before the first confirmed or uncertain submission. */
export function showSessionEmptyHero(facts: SessionEmptyHeroFacts): boolean {
  return Boolean(
    facts.connected &&
    facts.sessionId &&
    facts.loadedSessionId === facts.sessionId &&
    facts.timelineStatus === 'ready' &&
    !facts.timelineError &&
    facts.olderStatus === 'idle' &&
    !facts.hasOlder &&
    facts.messageCount === 0 &&
    facts.runCount === 0 &&
    facts.streamCount === 0 &&
    facts.approvalCount === 0 &&
    facts.userInputCount === 0 &&
    (facts.draftStatus === null || facts.draftStatus === 'idle') &&
    facts.lastOperationId === null &&
    !facts.submissionPending,
  )
}

function SessionEmptyHeroView({
  headingAs = 'h2',
}: {
  readonly headingAs?: 'h1' | 'h2'
}) {
  const { t } = useSessionEmptyHeroMessages()
  const labels: HbarSessionEmptyHeroLabels = {
    markUrl: t('markUrl'),
    title: t('title'),
    description: t('description'),
  }
  return (
    <LumenFrame className="hbar-app-react-session-empty-hero">
      <LumenFrame
        className="hbar-app-react-session-empty-mark"
        style={{ backgroundImage: `url(${labels.markUrl})` }}
        aria-hidden="true"
      />
      <LumenContentText
        context={headingAs === 'h1' ? 'page.title' : 'section.title'}
        className="hbar-app-react-session-empty-title"
      >
        {labels.title}
      </LumenContentText>
      <LumenContentText context="section.description" className="hbar-app-react-session-empty-description">
        {labels.description}
      </LumenContentText>
    </LumenFrame>
  )
}

/** The existing labels prop adapts both session and pre-session callers. */
export function HbarSessionEmptyHero({
  labels,
  headingAs = 'h2',
}: {
  readonly labels: HbarSessionEmptyHeroLabels
  readonly headingAs?: 'h1' | 'h2'
}) {
  return (
    <SessionEmptyHeroMessagesProvider messages={labels}>
      <SessionEmptyHeroView headingAs={headingAs} />
    </SessionEmptyHeroMessagesProvider>
  )
}
