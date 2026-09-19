import { CommandError, createCommandClient, type CommandRegistry } from '@hbar/commands'
import { metricsCommands } from '@hbar/contracts/commands/metrics'
import { statusWorkspaceCommands } from '@hbar/contracts/commands/status-workspace'
import { usageCommands } from '@hbar/contracts/commands/usage'
import { createState, type StateReader } from './state'
import type { RuntimeOptions, StatusWorkspaceEntryState, StatusWorkspaceState, SurfaceState } from './types'

const MAX_PANELS = 4

function code(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

function failure(reason: unknown): CommandError {
  if (reason instanceof CommandError) return reason
  return new CommandError(code(reason), reason instanceof Error ? reason.message : 'Status query failed')
}

export function createStatusWorkspace(
  local: CommandRegistry,
  options: RuntimeOptions,
  surfaces: StateReader<SurfaceState>,
  onSubscriberError: (error: unknown) => void,
  isDisposed: () => boolean,
) {
  const state = createState<StatusWorkspaceState>({ entries: {} }, onSubscriberError)
  const metrics = options.metrics ? createCommandClient(metricsCommands, options.metrics) : null
  const usage = options.usage ? createCommandClient(usageCommands, options.usage) : null
  const generations = new Map<string, number>()

  const panel = (instanceId: string) => {
    const value = surfaces.getSnapshot().panels[instanceId]
    if (!value || value.panelId !== 'status') throw new CommandError('COMMAND_NOT_FOUND', 'Status panel is not open')
    const raw = value.params.section
    const section: StatusWorkspaceEntryState['section'] = raw === 'usage' || raw === 'git' ? raw : 'dashboard'
    return { ...value, section }
  }
  const replace = (entry: StatusWorkspaceEntryState) => {
    const current = state.reader.getSnapshot()
    const entries = { ...current.entries, [entry.instanceId]: entry }
    const ids = Object.keys(entries)
    if (ids.length > MAX_PANELS)
      for (const id of ids) {
        if (id !== entry.instanceId && !surfaces.getSnapshot().panels[id]) {
          delete entries[id]
          break
        }
      }
    state.replace({ entries })
  }
  const summary = (entry: StatusWorkspaceEntryState) => ({
    instanceId: entry.instanceId,
    section: entry.section,
    status: entry.status,
    error: entry.error,
  })
  const load = async (instanceId: string) => {
    const target = panel(instanceId)
    const previous = state.reader.getSnapshot().entries[instanceId]
    const generation = (generations.get(instanceId) ?? 0) + 1
    generations.set(instanceId, generation)
    const loading: StatusWorkspaceEntryState = {
      instanceId,
      section: target.section,
      status: 'loading',
      performance: previous?.performance ?? null,
      usage: previous?.usage ?? null,
      error: null,
    }
    replace(loading)
    try {
      let performance = loading.performance
      let usageReport = loading.usage
      if (target.section === 'dashboard') {
        if (!metrics) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Performance metrics are unavailable')
        performance = await metrics.execute('metrics.query', { bucketMs: 1_000, maxPoints: 120 })
      } else if (target.section === 'usage') {
        if (!usage) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Usage metrics are unavailable')
        usageReport = await usage.execute('usage.query', {
          scope: { kind: 'global' },
          bucketMs: 60_000,
          maxBuckets: 120,
          maxSamples: 10_000,
          filters: {},
        })
      } else throw new CommandError('CAPABILITY_UNAVAILABLE', 'Git status is not implemented yet')
      if (isDisposed() || generations.get(instanceId) !== generation)
        throw new CommandError('RESULT_UNKNOWN', 'Status refresh was superseded')
      const ready: StatusWorkspaceEntryState = {
        instanceId,
        section: target.section,
        status: 'ready',
        performance,
        usage: usageReport,
        error: null,
      }
      replace(ready)
      return summary(ready)
    } catch (reason) {
      if (isDisposed() || generations.get(instanceId) !== generation) throw reason
      const failed = { ...loading, status: 'error' as const, error: code(reason) }
      replace(failed)
      throw failure(reason)
    }
  }

  local.register(statusWorkspaceCommands['statusWorkspace.refresh'], ({ instanceId }) => load(instanceId))
  return {
    reader: state.reader,
    dispose() {
      generations.clear()
      state.dispose()
    },
  }
}
