import { CommandError } from '@hbar/commands'
import type { PromptMention } from '@hbar/contracts/commands/draft'

export function isWorkspaceRelativePath(path: string): boolean {
  return !(
    path.includes('\\') ||
    [...path].some((character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127) ||
    path.startsWith('/') ||
    /^[a-zA-Z]:/.test(path) ||
    path.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  )
}

/** Structured spans belong to exactly one workspace draft, never to matching plain text. */
export function validateMentions(text: string, mentions: readonly PromptMention[], workspaceId?: string): void {
  let end = 0
  for (const mention of mentions) {
    if (
      mention.start < end ||
      mention.end > text.length ||
      text.slice(mention.start, mention.end) !== `@${mention.label}` ||
      (workspaceId !== undefined && mention.workspaceId !== workspaceId) ||
      !isWorkspaceRelativePath(mention.path)
    )
      throw new CommandError('INVALID_INPUT', 'Composer mention span or workspace changed')
    end = mention.end
  }
}

export function serializeMentions(text: string, mentions: readonly PromptMention[], workspaceId?: string): string {
  validateMentions(text, mentions, workspaceId)
  let output = ''
  let cursor = 0
  for (const mention of mentions) {
    output += text.slice(cursor, mention.start)
    output += `@"${mention.path.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
    cursor = mention.end
  }
  return output + text.slice(cursor)
}
