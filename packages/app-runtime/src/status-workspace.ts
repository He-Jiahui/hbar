import { CommandError, createCommandClient, type CommandRegistry } from '@hbar/commands'
import { metricsCommands } from '@hbar/contracts/commands/metrics'
import { gitCommands } from '@hbar/contracts/commands/git'
import { statusWorkspaceCommands } from '@hbar/contracts/commands/status-workspace'
import { usageCommands } from '@hbar/contracts/commands/usage'
import { createState, type StateReader } from './state'
import type {
  DirectoryState,
  RuntimeOptions,
  StatusWorkspaceEntryState,
  StatusWorkspaceState,
  SurfaceState,
} from './types'

const MAX_PANELS = 4
const DEFAULT_PERFORMANCE_QUERY = { window: '1h', target: 'all' } as const
const PERFORMANCE_WINDOWS = { '2m': 120_000, '15m': 900_000, '1h': 3_600_000 } as const

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
  directory: StateReader<DirectoryState>,
  onSubscriberError: (error: unknown) => void,
  isDisposed: () => boolean,
) {
  const state = createState<StatusWorkspaceState>({ entries: {} }, onSubscriberError)
  const metrics = options.metrics ? createCommandClient(metricsCommands, options.metrics) : null
  const usage = options.usage ? createCommandClient(usageCommands, options.usage) : null
  const git = options.git ? createCommandClient(gitCommands, options.git) : null
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
      performanceQuery: previous?.performanceQuery ?? DEFAULT_PERFORMANCE_QUERY,
      usage: previous?.usage ?? null,
      git: previous?.git ?? null,
      gitWorkspaceId: previous?.gitWorkspaceId ?? null,
      error: null,
    }
    replace(loading)
    try {
      let performance = loading.performance
      let usageReport = loading.usage
      let gitReport = loading.git
      let gitWorkspaceId = loading.gitWorkspaceId
      if (target.section === 'dashboard') {
        if (!metrics) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Performance metrics are unavailable')
        const duration = PERFORMANCE_WINDOWS[loading.performanceQuery.window]
        const to = Date.now() + 1
        performance = await metrics.execute('metrics.query', {
          from: Math.max(0, to - duration),
          to,
          bucketMs: Math.max(100, Math.ceil(duration / 120)),
          maxPoints: 120,
        })
      } else if (target.section === 'usage') {
        if (!usage) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Usage metrics are unavailable')
        usageReport = await usage.execute('usage.query', {
          scope: { kind: 'global' },
          bucketMs: 60_000,
          maxBuckets: 120,
          maxSamples: 10_000,
          filters: {},
        })
      } else {
        if (!git) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Git statistics are unavailable')
        if (!target.workspaceId) throw new CommandError('INVALID_INPUT', 'Select a workspace before opening Git status')
        const workspace = directory.getSnapshot().workspaces[target.workspaceId]
        if (!workspace) throw new CommandError('COMMAND_NOT_FOUND', 'Status workspace target is unavailable')
        gitReport = await git.execute('git.stats', {
          cwd: workspace.path,
          bucketMs: 86_400_000,
          maxBuckets: 120,
          sources: ['auto', 'manual', 'external'],
        })
        gitWorkspaceId = workspace.id
      }
      if (isDisposed() || generations.get(instanceId) !== generation)
        throw new CommandError('RESULT_UNKNOWN', 'Status refresh was superseded')
      const ready: StatusWorkspaceEntryState = {
        instanceId,
        section: target.section,
        status: 'ready',
        performance,
        performanceQuery: loading.performanceQuery,
        usage: usageReport,
        git: gitReport,
        gitWorkspaceId,
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
  local.register(statusWorkspaceCommands['statusWorkspace.setPerformanceQuery'], ({ instanceId, window, target }) => {
    const targetPanel = panel(instanceId)
    if (targetPanel.section !== 'dashboard')
      throw new CommandError('INVALID_INPUT', 'Performance query belongs to the dashboard section')
    const current = state.reader.getSnapshot().entries[instanceId]
    const base: StatusWorkspaceEntryState = current ?? {
      instanceId,
      section: 'dashboard',
      status: 'loading',
      performance: null,
      performanceQuery: DEFAULT_PERFORMANCE_QUERY,
      usage: null,
      git: null,
      gitWorkspaceId: null,
      error: null,
    }
    replace({ ...base, section: 'dashboard', performanceQuery: { window, target }, error: null })
    return load(instanceId)
  })
  return {
    reader: state.reader,
    dispose() {
      generations.clear()
      state.dispose()
    },
  }
}
