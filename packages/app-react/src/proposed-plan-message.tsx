import { Fragment, useMemo } from 'react'
import { parseProposedPlan, type PlanProposalDocument } from '@hbar/app-runtime'
import { LumenFrame, LumenText } from '@lumen/app-ui'
import { HbarMessageBlocks, MessageMarkdown, type HbarMessageBlocksProps } from './session-message'
import { HbarProposedPlan, type HbarProposedPlanProps } from './proposed-plan'
import { planTextSegments } from './session-message-text'
export { planTextSegments } from './session-message-text'

function codeContext(message: HbarMessageBlocksProps, segmentId: string) {
  return {
    sessionId: message.sessionId,
    messageId: message.messageId,
    segmentId,
    labels: message.labels.codeBlock,
    owner: message.copyOwner,
    clipboard: message.clipboard,
  }
}

/** Older complete documents remain readable; they never acquire a synthetic executable target. */
export function HbarHistoricalPlanMessage({
  readOnlyLabel,
  ...message
}: HbarMessageBlocksProps & {
  readonly readOnlyLabel: string
}) {
  const document = useMemo(
    () =>
      parseProposedPlan(message.blocks.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n\n')),
    [message.blocks],
  )
  const segments = useMemo(
    () => (document.kind === 'complete' ? planTextSegments(message.blocks, document) : null),
    [message.blocks, document],
  )
  if (document.kind !== 'complete' || !segments) return <HbarMessageBlocks {...message} />
  return (
    <HbarMessageBlocks
      {...message}
      renderText={(row) => {
        const segment = segments.get(row.id)
        if (!segment)
          return <MessageMarkdown text={row.text} findSegmentId={row.id} code={codeContext(message, row.id)} />
        return (
          <Fragment>
            {segment.before.trim() && (
              <MessageMarkdown
                text={segment.before}
                findSegmentId={`${row.id}:before`}
                code={codeContext(message, `${row.id}:before`)}
              />
            )}
            {segment.insertPlan && (
              <LumenFrame className="hbar-proposed-plan" as="section" aria-label={readOnlyLabel}>
                <LumenText as="strong">{readOnlyLabel}</LumenText>
                <LumenFrame className="hbar-proposed-plan-document" tabIndex={0} data-session-find-segment="proposal">
                  <MessageMarkdown text={document.markdown} code={codeContext(message, 'proposal')} />
                </LumenFrame>
              </LumenFrame>
            )}
            {segment.after.trim() && (
              <MessageMarkdown
                text={segment.after}
                findSegmentId={`${row.id}:after`}
                code={codeContext(message, `${row.id}:after`)}
              />
            )}
          </Fragment>
        )
      }}
    />
  )
}

export function HbarProposedPlanMessage({
  document,
  plan,
  ...message
}: HbarMessageBlocksProps & {
  readonly document: PlanProposalDocument
  readonly plan: Omit<HbarProposedPlanProps, 'target' | 'markdown'>
}) {
  const segments = useMemo(() => planTextSegments(message.blocks, document), [message.blocks, document])
  return (
    <HbarMessageBlocks
      {...message}
      renderText={(row) => {
        const segment = segments.get(row.id)
        if (!segment)
          return <MessageMarkdown text={row.text} findSegmentId={row.id} code={codeContext(message, row.id)} />
        return (
          <Fragment>
            {segment.before.trim() && (
              <MessageMarkdown
                text={segment.before}
                findSegmentId={`${row.id}:before`}
                code={codeContext(message, `${row.id}:before`)}
              />
            )}
            {segment.insertPlan && (
              <HbarProposedPlan
                {...plan}
                target={document.target}
                markdown={document.markdown}
                findSegmentId="proposal"
                code={codeContext(message, 'proposal')}
              />
            )}
            {segment.after.trim() && (
              <MessageMarkdown
                text={segment.after}
                findSegmentId={`${row.id}:after`}
                code={codeContext(message, `${row.id}:after`)}
              />
            )}
          </Fragment>
        )
      }}
    />
  )
}
