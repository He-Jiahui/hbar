import { Fragment, useMemo } from 'react'
import { parseProposedPlan, type PlanProposalDocument } from '@hbar/app-runtime'
import { LumenFrame, LumenText } from '@lumen/app-ui'
import { HbarMessageBlocks, MessageMarkdown, type HbarMessageBlocksProps } from './session-message'
import { HbarProposedPlan, type HbarProposedPlanProps } from './proposed-plan'
import type { SessionMessageBlock } from './session-message-model'

/** Offsets use the same normalized text join as the runtime parser, without moving tool/attachment blocks. */
export function planTextSegments(
  blocks: readonly SessionMessageBlock[],
  document: Pick<PlanProposalDocument, 'before' | 'after'>,
) {
  const source = blocks
    .flatMap((block) => (block.type === 'text' ? [block.text.replace(/\r\n?/g, '\n')] : []))
    .join('\n\n')
  const start = document.before.length
  const end = source.length - document.after.length
  const result = new Map<string, { before: string; after: string; insertPlan: boolean }>()
  let offset = 0
  let inserted = false
  for (const [index, block] of blocks.entries()) {
    if (block.type !== 'text') continue
    const text = block.text.replace(/\r\n?/g, '\n')
    const insertPlan = !inserted && Boolean(text.trim()) && offset + text.length > start && offset < end
    result.set(`text:${index}`, {
      before: text.slice(0, Math.max(0, Math.min(text.length, start - offset))),
      after: text.slice(Math.max(0, Math.min(text.length, end - offset))),
      insertPlan,
    })
    if (insertPlan) inserted = true
    offset += text.length + 2
  }
  return result
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
        if (!segment) return <MessageMarkdown text={row.text} />
        return (
          <Fragment>
            {segment.before.trim() && <MessageMarkdown text={segment.before} />}
            {segment.insertPlan && (
              <LumenFrame className="hbar-proposed-plan" as="section" aria-label={readOnlyLabel}>
                <LumenText as="strong">{readOnlyLabel}</LumenText>
                <LumenFrame className="hbar-proposed-plan-document" tabIndex={0}>
                  <MessageMarkdown text={document.markdown} />
                </LumenFrame>
              </LumenFrame>
            )}
            {segment.after.trim() && <MessageMarkdown text={segment.after} />}
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
        if (!segment) return <MessageMarkdown text={row.text} />
        return (
          <Fragment>
            {segment.before.trim() && <MessageMarkdown text={segment.before} />}
            {segment.insertPlan && <HbarProposedPlan {...plan} target={document.target} markdown={document.markdown} />}
            {segment.after.trim() && <MessageMarkdown text={segment.after} />}
          </Fragment>
        )
      }}
    />
  )
}
