import { Fragment, useMemo } from 'react'
import { parseProposedPlan, type PlanProposalDocument } from '@hbar/app-runtime'
import { LumenContentText, LumenFrame } from '@lumen/app-ui'
import { createMessageScope } from './messages'
import type { HbarCodeBlockLabels } from './code-block-copy-action'
import { HbarMessageBlocks, MessageMarkdown, type HbarMessageBlocksProps } from './session-message'
import { HbarProposedPlan, type HbarProposedPlanProps } from './proposed-plan'
import { planTextSegments } from './session-message-text'
export { planTextSegments } from './session-message-text'

const { Provider: ProposedPlanMessageMessagesProvider, useMessages: useProposedPlanMessageMessages } =
  createMessageScope<{ readonly codeBlock: HbarCodeBlockLabels; readonly readOnlyLabel: string }>()

function codeContext(message: HbarMessageBlocksProps, segmentId: string, codeBlock: HbarCodeBlockLabels) {
  return {
    sessionId: message.sessionId,
    messageId: message.messageId,
    segmentId,
    labels: codeBlock,
    streaming: message.streaming,
    owner: message.copyOwner,
    clipboard: message.clipboard,
  }
}

/** Older complete documents remain readable; they never acquire a synthetic executable target. */
function HistoricalPlanMessageView({
  readOnlyLabel,
  ...message
}: HbarMessageBlocksProps & {
  readonly readOnlyLabel: string
}) {
  const { t } = useProposedPlanMessageMessages()
  const codeBlock = t('codeBlock')
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
          return (
            <MessageMarkdown
              text={row.text}
              findSegmentId={row.id}
              code={codeContext(message, row.id, codeBlock)}
              fileReferences={message.fileReferences}
            />
          )
        return (
          <Fragment>
            {segment.before.trim() && (
              <MessageMarkdown
                text={segment.before}
                findSegmentId={`${row.id}:before`}
                code={codeContext(message, `${row.id}:before`, codeBlock)}
                fileReferences={message.fileReferences}
              />
            )}
            {segment.insertPlan && (
              <LumenFrame className="hbar-proposed-plan" as="section" aria-label={readOnlyLabel}>
                <LumenContentText context="record.title">{readOnlyLabel}</LumenContentText>
                <LumenFrame className="hbar-proposed-plan-document" tabIndex={0} data-session-find-segment="proposal">
                  <MessageMarkdown
                    text={document.markdown}
                    code={codeContext(message, 'proposal', codeBlock)}
                    fileReferences={message.fileReferences}
                  />
                </LumenFrame>
              </LumenFrame>
            )}
            {segment.after.trim() && (
              <MessageMarkdown
                text={segment.after}
                findSegmentId={`${row.id}:after`}
                code={codeContext(message, `${row.id}:after`, codeBlock)}
                fileReferences={message.fileReferences}
              />
            )}
          </Fragment>
        )
      }}
    />
  )
}

/** The legacy labels prop remains the host adapter for existing SDK callers. */
export function HbarHistoricalPlanMessage(props: HbarMessageBlocksProps & { readonly readOnlyLabel: string }) {
  return (
    <ProposedPlanMessageMessagesProvider
      messages={{ codeBlock: props.labels.codeBlock, readOnlyLabel: props.readOnlyLabel }}
    >
      <HistoricalPlanMessageView {...props} />
    </ProposedPlanMessageMessagesProvider>
  )
}

function ProposedPlanMessageView({
  document,
  plan,
  ...message
}: HbarMessageBlocksProps & {
  readonly document: PlanProposalDocument
  readonly plan: Omit<HbarProposedPlanProps, 'target' | 'markdown'>
}) {
  const { t } = useProposedPlanMessageMessages()
  const codeBlock = t('codeBlock')
  const segments = useMemo(() => planTextSegments(message.blocks, document), [message.blocks, document])
  return (
    <HbarMessageBlocks
      {...message}
      renderText={(row) => {
        const segment = segments.get(row.id)
        if (!segment)
          return (
            <MessageMarkdown
              text={row.text}
              findSegmentId={row.id}
              code={codeContext(message, row.id, codeBlock)}
              fileReferences={message.fileReferences}
            />
          )
        return (
          <Fragment>
            {segment.before.trim() && (
              <MessageMarkdown
                text={segment.before}
                findSegmentId={`${row.id}:before`}
                code={codeContext(message, `${row.id}:before`, codeBlock)}
                fileReferences={message.fileReferences}
              />
            )}
            {segment.insertPlan && (
              <HbarProposedPlan
                {...plan}
                target={document.target}
                markdown={document.markdown}
                findSegmentId="proposal"
                code={codeContext(message, 'proposal', codeBlock)}
                fileReferences={message.fileReferences}
              />
            )}
            {segment.after.trim() && (
              <MessageMarkdown
                text={segment.after}
                findSegmentId={`${row.id}:after`}
                code={codeContext(message, `${row.id}:after`, codeBlock)}
                fileReferences={message.fileReferences}
              />
            )}
          </Fragment>
        )
      }}
    />
  )
}

/** The legacy labels prop remains the host adapter for existing SDK callers. */
export function HbarProposedPlanMessage(props: HbarMessageBlocksProps & {
  readonly document: PlanProposalDocument
  readonly plan: Omit<HbarProposedPlanProps, 'target' | 'markdown'>
}) {
  return (
    <ProposedPlanMessageMessagesProvider messages={{ codeBlock: props.labels.codeBlock, readOnlyLabel: '' }}>
      <ProposedPlanMessageView {...props} />
    </ProposedPlanMessageMessagesProvider>
  )
}
