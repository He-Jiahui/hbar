import { useMemo } from 'react'
import type { ReferenceProductionContext } from './reference/adapters/reference-adapters'
import { useCatalog, useSessions, useWorkbench } from '../stores'
import { useSessionCapabilities } from '../session-capabilities'

/**
 * View-model bridge for production ReactBits compositions.  It only projects
 * already-loaded Zustand facts; loading and mutation remain owned by the
 * feature view-models and the Client SDK.
 */
export function useReferenceProductionContext(sessionId?: string): ReferenceProductionContext {
  const activeSession = useWorkbench((state) => state.activeSession)
  const resolvedSessionId = sessionId ?? activeSession
  const bootstrap = useCatalog((state) => state.data)
  const snapshot = useSessions((state) => (resolvedSessionId ? state.snapshots[resolvedSessionId] : undefined))
  const capabilities = useSessionCapabilities((state) =>
    resolvedSessionId ? state.sessions[resolvedSessionId] : undefined,
  )

  return useMemo(
    () => ({
      bootstrap,
      snapshot: snapshot ?? null,
      plan: capabilities?.plan ?? null,
      budget: capabilities?.budget ?? null,
    }),
    [bootstrap, snapshot, capabilities?.plan, capabilities?.budget],
  )
}
