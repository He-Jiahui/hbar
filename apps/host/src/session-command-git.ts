import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import type { ExecutionOwnership } from '@hbar/contracts/runtime'
import { SESSION_COMMAND_GIT_IDS } from '@hbar/kernel/session-command-port'

const gitId = z.enum(SESSION_COMMAND_GIT_IDS)
const rules = {
  'git.info': { alias: 'git_info', mutation: false },
  'git.status': { alias: 'git_status', mutation: false },
  'git.diff': { alias: 'git_diff', mutation: false },
  'git.log': { alias: 'git_log', mutation: false },
  'git.stats': { alias: 'git_stats', mutation: false },
  'git.diffToRemote': { alias: 'git_diff_to_remote', mutation: false },
  'git.commit': { alias: 'git_commit', mutation: true },
  'git.branch': { alias: 'git_branch', mutation: true },
  'git.worktree': { alias: 'git_worktree', mutation: true },
} satisfies Record<(typeof SESSION_COMMAND_GIT_IDS)[number], { alias: string; mutation: boolean }>

export function sessionGitCommand(commandId: string, input: Record<string, unknown>) {
  const parsed = gitId.safeParse(commandId)
  if (!parsed.success) return undefined
  const rule = rules[parsed.data]
  return {
    alias: rule.alias,
    method: parsed.data,
    mutation: rule.mutation,
    write: rule.mutation && (parsed.data === 'git.commit' || input.operation !== 'list'),
  }
}

/** Execution cwd and commit attribution come from the captured Run, never model arguments. */
export function bindSessionGitInput(source: ExecutionOwnership, commandId: string, input: Record<string, unknown>) {
  if (input.cwd !== undefined)
    throw new HbarError(
      'COMMAND_SOURCE_WORKSPACE_MISMATCH',
      'Session Git commands use the admitted execution workspace',
    )
  if (commandId !== 'git.commit') return input
  if (
    (input.sessionId !== undefined && input.sessionId !== source.sessionId) ||
    (input.runId !== undefined && input.runId !== source.runId)
  )
    throw new HbarError('COMMAND_SOURCE_MISMATCH', 'Git commit attribution belongs to the source Session and Run')
  return { ...input, sessionId: source.sessionId, runId: source.runId }
}
