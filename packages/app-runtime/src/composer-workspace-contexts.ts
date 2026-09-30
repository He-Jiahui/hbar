import { CommandError } from '@hbar/commands'
import {
  MAX_PROMPT_WORKSPACE_CONTEXTS,
  MAX_PROMPT_WORKSPACE_CONTEXT_SERIALIZED_LENGTH,
  type PromptMention,
  type PromptWorkspaceContext,
} from '@hbar/contracts/commands/draft'
import { isWorkspaceRelativePath, serializeMentions } from './composer-mentions'

function noteFor(context: PromptWorkspaceContext): string | undefined {
  return context.kind === 'source-comment' || context.kind === 'diff-comment' ? context.note : undefined
}

export function workspaceContextSemanticKey(context: PromptWorkspaceContext): string {
  switch (context.kind) {
    case 'source-selection':
      return JSON.stringify([
        context.kind,
        context.workspaceId,
        context.path,
        context.sha256,
        context.lineStart,
        context.lineEnd,
        context.quote,
      ])
    case 'source-comment':
      return JSON.stringify([
        context.kind,
        context.workspaceId,
        context.path,
        context.sha256,
        context.lineStart,
        context.lineEnd,
        context.quote,
        context.note,
      ])
    case 'diff-comment':
      return JSON.stringify([
        context.kind,
        context.workspaceId,
        context.path,
        context.cached,
        context.diffSide,
        context.hunkId,
        context.lineStart,
        context.lineEnd,
        context.quote,
        context.note,
      ])
  }
}

export function validateWorkspaceContexts(contexts: readonly PromptWorkspaceContext[]): void {
  if (contexts.length > MAX_PROMPT_WORKSPACE_CONTEXTS)
    throw new CommandError('BUSY', 'The composer has reached its workspace context limit')
  const ids = new Set<string>()
  const semanticKeys = new Set<string>()
  for (const context of contexts) {
    if (!isWorkspaceRelativePath(context.path))
      throw new CommandError('INVALID_INPUT', 'Workspace context requires a relative path')
    const semanticKey = workspaceContextSemanticKey(context)
    if (ids.has(context.id) || semanticKeys.has(semanticKey))
      throw new CommandError('INVALID_INPUT', 'Workspace contexts must be unique')
    ids.add(context.id)
    semanticKeys.add(semanticKey)
  }
}

function safeFence(quote: string): string {
  const longest = (quote.match(/`+/g) ?? []).reduce((length, run) => Math.max(length, run.length), 0)
  return '`'.repeat(Math.max(3, longest + 1))
}

function location(context: PromptWorkspaceContext): string {
  const path = context.path.replaceAll('"', '\\"')
  const side = context.kind === 'diff-comment' ? `:${context.diffSide}` : ''
  const end = context.lineEnd === context.lineStart ? '' : `-L${context.lineEnd}`
  return `@"${path}${side}:L${context.lineStart}${end}"`
}

export function serializeWorkspaceContexts(contexts: readonly PromptWorkspaceContext[]): string {
  if (contexts.length === 0) return ''
  validateWorkspaceContexts(contexts)
  const blocks = contexts.map((context) => {
    const parts = [`${location(context)}:`]
    const note = noteFor(context)
    if (note) parts.push(`Comment: ${note.trim()}`)
    const fence = safeFence(context.quote)
    parts.push(`${fence}\n${context.quote.trim()}\n${fence}`)
    return parts.join('\n')
  })
  return ['Referenced workspace context:', ...blocks].join('\n')
}

export function serializeComposerModelText(
  text: string,
  mentions: readonly PromptMention[],
  contexts: readonly PromptWorkspaceContext[],
  workspaceId?: string,
): string {
  const serializedText = serializeMentions(text, mentions, workspaceId)
  const serializedContexts = serializeWorkspaceContexts(contexts)
  const result = [serializedText, serializedContexts].filter(Boolean).join('\n\n')
  if (result.length > MAX_PROMPT_WORKSPACE_CONTEXT_SERIALIZED_LENGTH)
    throw new CommandError('INPUT_TOO_LARGE', 'Serialized composer text and workspace context exceed the input limit')
  return result
}
