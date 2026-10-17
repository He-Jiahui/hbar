import { expect, test } from 'bun:test'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GitRuntime, gitConfigSchema } from '../plugins/git/src/index'
import { removeOwnedTestDirectory } from './owned-temp-directory'

test('Run-scoped Git rejects cwd, commit attribution and configured worktree-root escapes before execution', async () => {
  const prefix = 'hbar-git-run-scope-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const workspace = join(root, 'workspace')
  const external = join(root, 'external')
  await Promise.all([mkdir(workspace), mkdir(external)])
  try {
    const runtime = new GitRuntime(root, gitConfigSchema.parse({ worktreeRoot: external }))
    const context = {
      workspacePath: workspace,
      sessionId: 'source-session',
      runId: 'source-run',
      callId: 'source-call',
    }
    const failures: Array<{ method: 'status' | 'commit' | 'worktree'; input: Record<string, string>; code: string }> = [
      { method: 'status', input: { cwd: external }, code: 'COMMAND_SOURCE_WORKSPACE_MISMATCH' },
      { method: 'commit', input: { message: 'Commit', sessionId: 'borrowed' }, code: 'COMMAND_SOURCE_MISMATCH' },
      { method: 'worktree', input: { operation: 'add', path: 'outside' }, code: 'COMMAND_SOURCE_WORKTREE_ROOT_DENIED' },
    ]
    for (const item of failures) {
      let failure: unknown
      try {
        await runtime.forRun({ method: item.method, input: item.input }, context)
      } catch (error) {
        failure = error
      }
      expect(failure).toMatchObject({ code: item.code })
    }
  } finally {
    await removeOwnedTestDirectory(root, prefix)
  }
})
