import { HbarError } from '@hbar/contracts'
import type { SessionFileTarget } from '@hbar/contracts/commands/files'
import type { StoragePort } from '@hbar/storage'

export interface SessionWorkspaceInput {
  readonly workspaceId: string
  readonly sessionTarget?: SessionFileTarget | undefined
}

export interface SessionWorkspaceResolver {
  readonly resolveSessionPath: (sessionId: string, workspacePath: string, signal: AbortSignal) => Promise<string>
  readonly resolveWorkspacePath?:
    ((workspaceId: string, path: string, signal: AbortSignal) => Promise<string>) | undefined
}

/** Files and Git reads share the same Host-owned session context checks. */
export function createSessionWorkspaceContext(storage: StoragePort, resolver?: SessionWorkspaceResolver) {
  const assertCurrent = async (input: SessionWorkspaceInput) => {
    if (!input.sessionTarget) return
    const session = await storage.call('session', input.sessionTarget.sessionId)
    if (session.workspaceId !== input.workspaceId)
      throw new HbarError('STALE_TARGET', 'The session context belongs to another workspace')
    const target = await storage.call('sessionLaunchTarget', session.id)
    if (target.revision !== input.sessionTarget.expectedRevision)
      throw new HbarError('COMMAND_CONFLICT', 'The session context changed; refresh before retrying')
  }
  return {
    assertCurrent,
    async resolve(input: SessionWorkspaceInput, signal: AbortSignal) {
      signal.throwIfAborted()
      const target = await storage.call('workspace', input.workspaceId)
      if (!input.sessionTarget) {
        if (!resolver?.resolveWorkspacePath) return target
        return { ...target, path: await resolver.resolveWorkspacePath(input.workspaceId, target.path, signal) }
      }
      await assertCurrent(input)
      if (!resolver) throw new HbarError('CAPABILITY_UNAVAILABLE', 'Session workspace contexts are unavailable')
      const checkoutPath = await resolver.resolveSessionPath(input.sessionTarget.sessionId, target.path, signal)
      const path = resolver.resolveWorkspacePath
        ? await resolver.resolveWorkspacePath(input.workspaceId, checkoutPath, signal)
        : checkoutPath
      signal.throwIfAborted()
      await assertCurrent(input)
      return { ...target, path }
    },
  }
}
