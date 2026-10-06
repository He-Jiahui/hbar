import type { ContentBlock } from '@hbar/contracts'
import type { SessionSearchSource } from '@hbar/contracts/commands/session-search'

export interface SearchDocumentSource {
  readonly source: Exclude<SessionSearchSource, 'title'>
  readonly body: string
  readonly blockIndex: number
  readonly callId: string | null
}

function field(value: unknown, name: string): unknown {
  return value !== null && typeof value === 'object' && Object.hasOwn(value, name) ? Reflect.get(value, name) : null
}

/** Search only authored conversation and declared tool semantics, never arbitrary args, thinking or credentials. */
export function sessionSearchDocuments(
  role: string,
  content: readonly ContentBlock[],
): readonly SearchDocumentSource[] {
  const documents: SearchDocumentSource[] = []
  const dialogue = content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n')
  if ((role === 'user' || role === 'assistant') && dialogue.trim()) {
    documents.push({ source: 'conversation', body: dialogue, blockIndex: 0, callId: null })
  }
  for (const [blockIndex, block] of content.entries()) {
    if (block.type === 'tool_call') {
      const command =
        block.presentation?.kind === 'command'
          ? field(block.args, block.presentation.commandField)
          : block.name === 'shell'
            ? field(block.args, 'command')
            : null
      documents.push({
        source: 'tool',
        body: typeof command === 'string' ? `${block.name}\n${command}` : block.name,
        blockIndex,
        callId: block.callId,
      })
    } else if (block.type === 'tool_result' && !block.isError) {
      const path = field(block.details, 'path')
      const before = field(block.details, 'before')
      const after = field(block.details, 'after')
      if (typeof path !== 'string' || typeof before !== 'string' || typeof after !== 'string') continue
      if (before === after) continue
      documents.push({ source: 'file', body: path, blockIndex, callId: block.callId })
      let start = 0
      const common = Math.min(before.length, after.length)
      while (start < common && before[start] === after[start]) start++
      let end = 0
      while (end < common - start && before[before.length - end - 1] === after[after.length - end - 1]) end++
      // Retain whole changed lines, including patch context; bound work to two linear passes.
      const lineStart = before.lastIndexOf('\n', start - 1) + 1
      const beforeEnd = before.indexOf('\n', before.length - end)
      const afterEnd = after.indexOf('\n', after.length - end)
      const removed = before.slice(lineStart, beforeEnd < 0 ? before.length : beforeEnd)
      const added = after.slice(lineStart, afterEnd < 0 ? after.length : afterEnd)
      documents.push({ source: 'patch', body: `${removed}\n${added}`, blockIndex, callId: block.callId })
    }
  }
  return documents
}
