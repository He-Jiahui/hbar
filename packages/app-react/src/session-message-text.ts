import { parseProposedPlan, type PlanProposalDocument } from '@hbar/app-runtime'
import type { SessionMessageBlock } from './session-message-model'

/** Offsets match the runtime's normalized join without moving tool/attachment blocks. */
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

export interface SessionMessageTextSegment {
  readonly id: string
  readonly markdown: string
}

/** Exactly the Markdown roots displayed by normal/historical/proposal message views. */
export function sessionMessageTextSegments(
  blocks: readonly SessionMessageBlock[],
  proposals: boolean,
): readonly SessionMessageTextSegment[] {
  const document = proposals
    ? parseProposedPlan(blocks.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n\n'))
    : null
  const plan = document?.kind === 'complete' ? planTextSegments(blocks, document) : null
  return blocks.flatMap((block, index): SessionMessageTextSegment[] => {
    if (block.type !== 'text' || !block.text.trim()) return []
    const id = `text:${index}`
    const parts = plan?.get(id)
    if (!parts || document?.kind !== 'complete') return [{ id, markdown: block.text }]
    return [
      ...(parts.before.trim() ? [{ id: `${id}:before`, markdown: parts.before }] : []),
      ...(parts.insertPlan ? [{ id: 'proposal', markdown: document.markdown }] : []),
      ...(parts.after.trim() ? [{ id: `${id}:after`, markdown: parts.after }] : []),
    ]
  })
}
