import { HbarConversationSelection, type HbarConversationSelectionProps } from './conversation-selection'
import { useHbarRuntime, useHbarRuntimeSelector } from './runtime'

/** Only mounted authored-message controls observe draft revisions; the history view observes submission status. */
export function SessionConversationSelection(props: Omit<HbarConversationSelectionProps, 'expectedRevision'>) {
  const runtime = useHbarRuntime()
  const expectedRevision = useHbarRuntimeSelector(runtime.state.drafts, (state) =>
    props.enabled ? (state[props.sessionId]?.revision ?? 0) : 0,
  )
  return <HbarConversationSelection {...props} expectedRevision={expectedRevision} />
}
