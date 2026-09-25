import type { HbarRuntimeView } from './runtime'

export type WorkspaceNavigationAction =
  | { readonly kind: 'create-session'; readonly workspaceId: string }
  | { readonly kind: 'select-workspace'; readonly workspaceId: string }
  | { readonly kind: 'open-workspace'; readonly path: string; readonly createSession: boolean }

export interface WorkspaceNavigationActionState {
  readonly status: 'idle' | 'submitting' | 'unknown' | 'failed'
  readonly action: WorkspaceNavigationAction | null
  readonly error: string | null
}

export interface WorkspaceNavigationSelection {
  readonly workspaceId: string
  readonly sessionId: string | null
}

type WorkspaceEntries = ReturnType<HbarRuntimeView['state']['directory']['getSnapshot']>['workspaces']

const uncertainCodes = new Set([
  'RESULT_UNKNOWN',
  'DISCONNECTED',
  'CONNECTION_CLOSED',
  'EXECUTION_FAILED',
  'TIMEOUT',
  'TIMED_OUT',
  'CANCELLED',
  'NAVIGATION_SUPERSEDED',
  'INVALID_OUTPUT',
])

function errorCode(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

/** Only a current, discovered workspace is a default; list order never implies user intent. */
export function defaultSessionWorkspace(workspaceId: string | null, workspaces: WorkspaceEntries): string | null {
  return workspaceId !== null && Object.hasOwn(workspaces, workspaceId) ? workspaceId : null
}

/**
 * Private UI task bookkeeping, not a second directory/navigation store. Runtime
 * commands own confirmed facts and the durable session-creation idempotency key.
 * One unsettled intent blocks all replacement intents, including clicks from a
 * different project row; reconciliation always uses the captured original target.
 */
export function createWorkspaceNavigationActions(
  runtime: HbarRuntimeView,
  onChange: (state: WorkspaceNavigationActionState) => void,
) {
  let state: WorkspaceNavigationActionState = { status: 'idle', action: null, error: null }
  let disposed = false
  let controller: AbortController | null = null

  function update(next: WorkspaceNavigationActionState): void {
    state = next
    if (!disposed) onChange(next)
  }

  async function execute(action: WorkspaceNavigationAction): Promise<WorkspaceNavigationSelection | null> {
    const request = new AbortController()
    controller = request
    let current = action
    update({ status: 'submitting', action: current, error: null })
    try {
      const options = { signal: request.signal }
      let selection: WorkspaceNavigationSelection
      if (current.kind === 'open-workspace') {
        const workspace = await runtime.commands.execute('workspace.open', { path: current.path }, options)
        if (disposed) return null
        if (current.createSession) {
          // Opening succeeded: a later uncertain creation is reconciled without
          // repeating registration or resolving a new global project selection.
          current = { kind: 'create-session', workspaceId: workspace.id }
          update({ status: 'submitting', action: current, error: null })
          const session = await runtime.commands.execute('app.createSession', { workspaceId: workspace.id }, options)
          selection = { workspaceId: session.workspaceId, sessionId: session.id }
        } else {
          selection = { workspaceId: workspace.id, sessionId: null }
        }
      } else if (current.kind === 'create-session') {
        const session = await runtime.commands.execute(
          'app.createSession',
          { workspaceId: current.workspaceId },
          options,
        )
        selection = { workspaceId: session.workspaceId, sessionId: session.id }
      } else {
        await runtime.commands.execute('app.setWorkspace', { workspaceId: current.workspaceId }, options)
        selection = { workspaceId: current.workspaceId, sessionId: null }
      }
      if (disposed) return null
      update({ status: 'idle', action: null, error: null })
      const active = runtime.state.navigation.getSnapshot()
      return active.workspaceId === selection.workspaceId && active.sessionId === selection.sessionId ? selection : null
    } catch (reason: unknown) {
      if (disposed) return null
      const code = errorCode(reason)
      update({
        status: current.kind !== 'select-workspace' && uncertainCodes.has(code) ? 'unknown' : 'failed',
        action: current,
        error: code,
      })
      return null
    } finally {
      if (controller === request) controller = null
    }
  }

  return {
    getSnapshot: () => state,
    run(action: WorkspaceNavigationAction): Promise<WorkspaceNavigationSelection | null> {
      if (disposed || state.status === 'submitting' || state.status === 'unknown') return Promise.resolve(null)
      // Freeze a fresh DTO so a caller cannot retarget an in-flight request.
      return execute(Object.freeze({ ...action }))
    },
    reconcile(): Promise<WorkspaceNavigationSelection | null> {
      if (disposed || state.status !== 'unknown' || !state.action) return Promise.resolve(null)
      return execute(state.action)
    },
    dispose(): void {
      disposed = true
      controller?.abort()
    },
  }
}
