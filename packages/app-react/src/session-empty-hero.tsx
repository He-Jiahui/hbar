import type { SessionDraftState, SessionTimelineState } from '@hbar/app-runtime'
import { LumenFrame, LumenText } from '@lumen/app-ui'

export interface HbarSessionEmptyHeroLabels {
  readonly markUrl: string
  readonly title: string
  readonly description: string
}

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

export function HbarSessionEmptyHero({ labels }: { readonly labels: HbarSessionEmptyHeroLabels }) {
  return (
    <LumenFrame className="hbar-app-react-session-empty-hero">
      <LumenFrame
        className="hbar-app-react-session-empty-mark"
        style={{ backgroundImage: `url(${labels.markUrl})` }}
        aria-hidden="true"
      />
      <LumenText as="h2" className="hbar-app-react-session-empty-title">
        {labels.title}
      </LumenText>
      <LumenText as="p" className="hbar-app-react-session-empty-description">
        {labels.description}
      </LumenText>
    </LumenFrame>
  )
}
