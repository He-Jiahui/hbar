import { HbarError, type SessionEvent } from '@hbar/contracts'
import type { ExecutionProvider } from '@hbar/plugin-sdk'
import type { StoragePort } from '@hbar/storage'
import { createSessionWorkspaceContext, type SessionWorkspaceResolver } from './session-workspace-context'

export interface RunFileChangeUndoPort {
  undo(sessionId: string, runId: string, signal: AbortSignal): Promise<void>
}
/** Kernel admission surrounds this use case, including checks and the durable receipt. */
export async function undoRunFileChanges(
  storage: StoragePort,
  execution: ExecutionProvider,
  resolver: SessionWorkspaceResolver,
  sessionId: string,
  runId: string,
  signal: AbortSignal,
): Promise<SessionEvent | null> {
  const run = await storage.call('run', runId)
  if (run.sessionId !== sessionId) throw new HbarError('STALE_TARGET', 'Run belongs to another session')
  if (['queued', 'running', 'waiting_approval'].includes(run.status))
    throw new HbarError('BUSY', 'Wait for the Run to finish')
  if (run.fileChanges?.undoneAt !== null && run.fileChanges?.undoneAt !== undefined) return null
  if (!run.fileChanges?.canUndo)
    throw new HbarError('UNDO_UNAVAILABLE', 'The recorded changes cannot be safely restored')
  if (!execution.restoreFiles)
    throw new HbarError('CAPABILITY_UNAVAILABLE', 'This execution provider cannot restore files')
  const session = await storage.call('session', sessionId)
  const target = await storage.call('sessionLaunchTarget', sessionId)
  const input = { workspaceId: session.workspaceId, sessionTarget: { sessionId, expectedRevision: target.revision } }
  const context = createSessionWorkspaceContext(storage, resolver)
  const workspace = await context.resolve(input, signal)
  const files = await storage.call('runFileChangeVersions', sessionId, runId)
  if (!files.length || files.some((file) => file.root !== workspace.path || !file.consistent))
    throw new HbarError('STALE_TARGET', 'The Run execution root is no longer selected')
  await context.assertCurrent(input)
  signal.throwIfAborted()
  await execution.restoreFiles(
    workspace.path,
    files.map(({ path, before, after }) => ({ path, before, after })),
    signal,
  )
  return storage.call('undoRunFileChanges', sessionId, runId)
}
