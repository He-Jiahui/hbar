import {
  CommandError,
  createCommandClient,
  defineCommand,
  type CommandExecutor,
  type CommandRegistry,
} from '@hbar/commands'
import { systemCommands, type SystemDiagnosis } from '@hbar/contracts/commands/system'
import { z } from 'zod'
import { createState, type StateReader } from './state'
import type { SurfaceState } from './types'

const MAX_ENTRIES = 4
const READ_TIMEOUT_MS = 12_000
export const systemDiagnosticsCommands = {
  'systemDiagnostics.refresh': defineCommand(
    {
      id: 'systemDiagnostics.refresh',
      version: 1,
      owner: 'hbar.system-diagnostics',
      kind: 'command',
      execution: 'client',
      stateEffect: 'application',
      scope: 'client',
      category: 'system.extensions',
      visibility: 'internal',
      titleKey: 'commands.systemDiagnostics.refresh.title',
      descriptionKey: 'commands.systemDiagnostics.refresh.description',
      surfaces: ['api'],
    },
    z.strictObject({ instanceId: z.string().min(1).max(160) }),
    z.strictObject({ status: z.enum(['ready', 'error']), error: z.string().nullable() }),
  ),
}

export interface SystemDiagnosticsEntry {
  readonly instanceId: string
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly report: Readonly<SystemDiagnosis> | null
  readonly error: string | null
}
export interface SystemDiagnosticsState {
  readonly entries: Readonly<Record<string, Readonly<SystemDiagnosticsEntry>>>
}

function errorCode(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

export function createSystemDiagnostics(
  local: CommandRegistry,
  system: CommandExecutor | undefined,
  surfaces: StateReader<SurfaceState>,
  onSubscriberError: (reason: unknown) => void,
  isDisposed: () => boolean,
) {
  const state = createState<SystemDiagnosticsState>({ entries: {} }, onSubscriberError)
  const client = system ? createCommandClient(systemCommands, system) : null
  const generations = new Map<string, number>()
  const active = new Map<
    string,
    { readonly panel: SurfaceState['panels'][string]; readonly controller: AbortController }
  >()
  let disposed = false

  function panel(instanceId: string) {
    const value = surfaces.getSnapshot().panels[instanceId]
    if (!value || value.panelId !== 'settings' || value.params.section !== 'diagnostics')
      throw new CommandError('COMMAND_NOT_FOUND', 'Diagnostics settings panel is not open')
    return value
  }
  function replace(entry: SystemDiagnosticsEntry) {
    const entries = { ...state.reader.getSnapshot().entries, [entry.instanceId]: entry }
    for (const id of Object.keys(entries))
      if (id !== entry.instanceId && !surfaces.getSnapshot().panels[id]) delete entries[id]
    const ids = Object.keys(entries)
    if (ids.length > MAX_ENTRIES) delete entries[ids.find((id) => id !== entry.instanceId)!]
    state.replace({ entries })
  }
  const unsubscribe = surfaces.subscribe(() => {
    for (const [id, request] of active)
      if (surfaces.getSnapshot().panels[id] !== request.panel) {
        active.delete(id)
        generations.set(id, (generations.get(id) ?? 0) + 1)
        request.controller.abort()
      }
  })
  local.register(systemDiagnosticsCommands['systemDiagnostics.refresh'], async ({ instanceId }) => {
    if (disposed || isDisposed()) throw new CommandError('DISPOSED', 'Diagnostics runtime is disposed')
    const target = panel(instanceId)
    if (active.has(instanceId)) throw new CommandError('BUSY', 'Diagnostics read is already pending')
    const generation = (generations.get(instanceId) ?? 0) + 1
    generations.set(instanceId, generation)
    const controller = new AbortController()
    active.set(instanceId, { panel: target, controller })
    const previous = state.reader.getSnapshot().entries[instanceId]
    replace({ instanceId, status: 'loading', report: previous?.report ?? null, error: null })
    let timer: ReturnType<typeof setTimeout> | undefined
    let removeAbort = () => {}
    try {
      if (!client) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Host diagnostics are unavailable')
      const interrupted = new Promise<never>((_resolve, reject) => {
        const onAbort = () => reject(new CommandError('TIMEOUT', 'Diagnostics read was interrupted'))
        controller.signal.addEventListener('abort', onAbort, { once: true })
        removeAbort = () => controller.signal.removeEventListener('abort', onAbort)
      })
      timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS)
      const report = await Promise.race([
        client.execute('system.diagnose', {}, { signal: controller.signal }),
        interrupted,
      ])
      if (
        disposed ||
        isDisposed() ||
        generations.get(instanceId) !== generation ||
        surfaces.getSnapshot().panels[instanceId] !== target
      )
        throw new CommandError('RESULT_SUPERSEDED', 'Diagnostics panel changed during the read')
      replace({ instanceId, status: 'ready', report, error: null })
      return { status: 'ready' as const, error: null }
    } catch (reason) {
      if (
        !disposed &&
        !isDisposed() &&
        generations.get(instanceId) === generation &&
        surfaces.getSnapshot().panels[instanceId] === target
      )
        replace({ instanceId, status: 'error', report: previous?.report ?? null, error: errorCode(reason) })
      return { status: 'error' as const, error: errorCode(reason) }
    } finally {
      if (timer) clearTimeout(timer)
      removeAbort()
      if (active.get(instanceId)?.controller === controller) active.delete(instanceId)
    }
  })
  return {
    reader: state.reader,
    dispose() {
      disposed = true
      unsubscribe()
      for (const request of active.values()) request.controller.abort()
      active.clear()
      state.dispose()
    },
  }
}
