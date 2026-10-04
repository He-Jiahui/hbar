import type { createAppRuntime } from '@hbar/app-runtime'

type Runtime = ReturnType<typeof createAppRuntime>
type CommandId = Parameters<Runtime['view']['commands']['execute']>[0]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Test adapter mirroring the View's captured Files target without widening the typed command client. */
export function fileWorkspaceCommandSnapshots(runtime: Runtime): Runtime['view']['commands'] {
  const execute = runtime.view.commands.execute
  return {
    execute<Key extends CommandId>(
      name: Key,
      raw: Parameters<typeof execute<Key>>[1],
      options?: Parameters<typeof execute<Key>>[2],
    ) {
      if (!name.startsWith('fileWorkspace.') || !isRecord(raw)) return execute(name, raw, options)
      const record: Record<string, unknown> = raw
      const instanceId = typeof record.instanceId === 'string' ? record.instanceId : ''
      const panel = runtime.view.state.surfaces.getSnapshot().panels[instanceId]
      const workbench = runtime.view.state.workspaceTabs
        .getSnapshot()
        .items.find((item) => item.kind === 'workbench' && item.panelInstanceId === instanceId)
      const sourceSessionId = workbench?.kind === 'workbench' ? workbench.sourceSessionId : (panel?.sessionId ?? null)
      const entry = runtime.view.state.files.getSnapshot().entries[instanceId]
      return execute(
        name,
        {
          ...raw,
          sourceSessionId: Object.hasOwn(record, 'sourceSessionId') ? record.sourceSessionId : sourceSessionId,
          sessionTarget: Object.hasOwn(record, 'sessionTarget')
            ? record.sessionTarget
            : entry?.sourceSessionId === sourceSessionId
              ? entry.sessionTarget
              : null,
        },
        options,
      )
    },
  }
}
