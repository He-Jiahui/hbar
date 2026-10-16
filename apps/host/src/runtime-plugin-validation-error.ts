import { z } from 'zod'

// Only schema vocabulary may cross this boundary. Zod messages, input values and
// arbitrary record keys can contain user data or credentials.
const publicFields = new Set([
  'itemId',
  'scope',
  'readPaths',
  'writePaths',
  'tools',
  'reason',
  'expectedRevision',
  'expectedFocusRevision',
  'expectedPlanRevision',
  'path',
  'text',
  'command',
  'name',
  'action',
  'summary',
  'outcome',
])

export function runtimePluginValidationError(error: unknown, toolName: string): string | null {
  if (!(error instanceof z.ZodError)) return null
  const issues = error.issues.slice(0, 8).map((issue) => {
    const path =
      issue.path
        .slice(0, 6)
        .map((segment) =>
          typeof segment === 'number' && Number.isSafeInteger(segment) && segment >= 0
            ? String(segment)
            : typeof segment === 'string' && publicFields.has(segment)
              ? segment
              : 'field',
        )
        .join('.') || 'input'
    return `${issue.code} at ${path}`
  })
  const revisionHelp =
    toolName === 'workflow_expand_scope'
      ? ' Provide both expectedFocusRevision and expectedPlanRevision from the current workflow state; do not supply expectedRevision. Refresh stale workflow state before retrying. Scope paths must be workspace-relative prefixes without globs or parent traversal.'
      : ''
  return `Invalid tool arguments: ${issues.join('; ')}.${revisionHelp}`.slice(0, 1_600)
}
