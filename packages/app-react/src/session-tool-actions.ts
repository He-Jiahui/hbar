import { useCallback, useState } from 'react'
import { useHbarRuntime, useHbarRuntimeSelector, useHbarRuntimeState } from './runtime'
export function useSessionToolActions() {
  const runtime = useHbarRuntime()
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const sessionId = navigation.sessionId
  const sourceTabInstanceKey = useHbarRuntimeSelector(
    runtime.state.workspaceTabs,
    (state) => state.items.find((item) => item.kind === 'session' && item.sessionId === sessionId)?.instanceKey ?? null,
  )
  const [toolFailure, setToolFailure] = useState<{
    sessionId: string
    workspaceId: string
    sourceTabInstanceKey: string | null
    code: string
  } | null>(null)
  const toggleTool = useCallback(
    (
      panelId: 'files' | 'activity' | 'monitoring' | 'agents' | 'goals',
      command: 'sessionTools.toggle' | 'sessionTools.open' = 'sessionTools.toggle',
    ) => {
      if (!sessionId || !navigation.workspaceId) return
      const target = {
        panelId,
        workspaceId: navigation.workspaceId,
        sessionId,
        sourceTabInstanceKey,
      }
      setToolFailure(null)
      void runtime.commands.execute(command, target).catch((reason: unknown) => {
        const current = runtime.state.navigation.getSnapshot()
        const currentTab = runtime.state.workspaceTabs
          .getSnapshot()
          .items.find((item) => item.kind === 'session' && item.sessionId === target.sessionId)
        if (
          current.workspaceId !== target.workspaceId ||
          current.sessionId !== target.sessionId ||
          (currentTab?.instanceKey ?? null) !== target.sourceTabInstanceKey
        )
          return
        setToolFailure({
          ...target,
          code:
            reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
              ? reason.code
              : 'EXECUTION_FAILED',
        })
      })
    },
    [navigation.workspaceId, runtime, sessionId, sourceTabInstanceKey],
  )
  return { toggleTool, toolFailure, sourceTabInstanceKey }
}
