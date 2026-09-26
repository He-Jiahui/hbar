import { CommandError } from '@hbar/commands'
import { sessionSchema } from '@hbar/contracts/directory'
import type { DirectoryState } from './types'
import type { StateReader } from './state'
import type { SessionExecutionAccessOwner, SessionExecutionTarget } from './session-execution-access'

/** Capture once, then recheck that exact target immediately before each new write. */
export interface SessionExecutionPreparationPort {
  readonly capture: (sessionId: string, signal?: AbortSignal) => Promise<SessionExecutionTarget>
  readonly assertCanPrepare: (target: SessionExecutionTarget) => void
}

export function createSessionExecutionPreparation(options: {
  readonly access: SessionExecutionAccessOwner
  readonly directory: StateReader<DirectoryState>
  readonly readSession: (sessionId: string, signal?: AbortSignal) => Promise<unknown>
  readonly isDisposed: () => boolean
}): SessionExecutionPreparationPort {
  return {
    async capture(sessionId, signal) {
      if (options.isDisposed()) throw new CommandError('DISPOSED', 'Execution preparation is disposed')
      signal?.throwIfAborted()
      let session = options.directory.getSnapshot().sessions[sessionId]
      // A programmatic command can target an unopened Session. Validate it through the
      // same bounded Directory query path rather than inferring archive from cache absence.
      if (!session) {
        const raw = await options.readSession(sessionId, signal).catch(() => {
          throw new CommandError(
            'SESSION_UNVERIFIED',
            'The captured Session could not be read; no new execution was prepared',
          )
        })
        const parsed = sessionSchema.safeParse(raw)
        if (!parsed.success || parsed.data.id !== sessionId)
          throw new CommandError('SESSION_UNVERIFIED', 'The captured Session cannot be verified')
        session = parsed.data
      }
      signal?.throwIfAborted()
      const target = Object.freeze({ sessionId, workspaceId: session.workspaceId })
      options.access.assertCanPrepare(target)
      return target
    },
    assertCanPrepare: (target) => {
      options.access.assertCanPrepare(target)
    },
  }
}
