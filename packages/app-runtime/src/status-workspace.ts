import { CommandError, createCommandClient, type CommandRegistry } from '@hbar/commands'
import { metricsCommands } from '@hbar/contracts/commands/metrics'
import { gitCommands } from '@hbar/contracts/commands/git'
import { statusWorkspaceCommands } from '@hbar/contracts/commands/status-workspace'
import { usageCommands, type UsageAttemptExport } from '@hbar/contracts/commands/usage'
import { createState, type StateReader } from './state'
import { serializeUsageExport } from './status-export'
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
const DEFAULT_USAGE_QUERY = {
  scope: 'global',
  includeDescendants: false,
  window: '24h',
  aggregation: 'hour',
  providerId: null,
  modelId: null,
} as const
const DEFAULT_USAGE_EXPORT = {
  status: 'idle',
  format: null,
  fileName: null,
  rowCount: 0,
  incomplete: false,
  error: null,
} as const
const USAGE_WINDOWS = { '1h': 3_600_000, '24h': 86_400_000, '7d': 604_800_000, '30d': 2_592_000_000 } as const
const USAGE_BUCKETS = { minute: 60_000, hour: 3_600_000, day: 86_400_000 } as const
const DEFAULT_GIT_QUERY = {
  workspaceId: null,
  window: '30d',
  sources: ['auto', 'manual', 'external'],
} as const
const GIT_WINDOWS = {
  '7d': { duration: 604_800_000, bucketMs: 86_400_000 },
  '30d': { duration: 2_592_000_000, bucketMs: 86_400_000 },
  '90d': { duration: 7_776_000_000, bucketMs: 86_400_000 },
  '1y': { duration: 31_536_000_000, bucketMs: 604_800_000 },
} as const

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
  const usageInput = (target: ReturnType<typeof panel>, query: StatusWorkspaceEntryState['usageQuery']) => {
    const scope =
      query.scope === 'global'
        ? { kind: 'global' as const }
        : query.scope === 'workspace'
          ? target.workspaceId
            ? { kind: 'workspace' as const, workspaceId: target.workspaceId }
            : null
          : target.sessionId
            ? {
                kind: 'session' as const,
                sessionId: target.sessionId,
                includeDescendants: query.includeDescendants,
              }
            : null
    if (!scope) throw new CommandError('INVALID_INPUT', `Usage ${query.scope} scope target is unavailable`)
    const duration = USAGE_WINDOWS[query.window]
    const to = Date.now() + 1
    return {
      scope,
      from: Math.max(0, to - duration),
      to,
      filters: {
        ...(query.providerId ? { providerId: query.providerId } : {}),
        ...(query.modelId ? { modelId: query.modelId } : {}),
      },
    }
  }
  const gitInput = (query: StatusWorkspaceEntryState['gitQuery']) => {
    const range = GIT_WINDOWS[query.window]
    const to = Date.now() + 1
    return {
      from: Math.max(0, to - range.duration),
      to,
      bucketMs: range.bucketMs,
      maxBuckets: Math.ceil(range.duration / range.bucketMs),
      sources: [...query.sources],
    }
  }
  const load = async (instanceId: string) => {
    const target = panel(instanceId)
    const previous = state.reader.getSnapshot().entries[instanceId]
    const generation = (generations.get(instanceId) ?? 0) + 1
    generations.set(instanceId, generation)
    const previousGitQuery = previous?.gitQuery ?? DEFAULT_GIT_QUERY
    const loading: StatusWorkspaceEntryState = {
      instanceId,
      section: target.section,
      status: 'loading',
      performance: previous?.performance ?? null,
      performanceQuery: previous?.performanceQuery ?? DEFAULT_PERFORMANCE_QUERY,
      usage: previous?.usage ?? null,
      usageQuery: previous?.usageQuery ?? DEFAULT_USAGE_QUERY,
      usageExport: previous?.usageExport ?? DEFAULT_USAGE_EXPORT,
      git: previous?.git ?? null,
      gitStatus: previous?.gitStatus ?? null,
      gitCommits: previous?.gitCommits ?? [],
      gitHistoryTruncated: previous?.gitHistoryTruncated ?? false,
      gitQuery:
        target.section === 'git' && !previousGitQuery.workspaceId && target.workspaceId
          ? { ...previousGitQuery, workspaceId: target.workspaceId }
          : previousGitQuery,
      gitWorkspaceId: previous?.gitWorkspaceId ?? null,
      error: null,
    }
    replace(loading)
    try {
      let performance = loading.performance
      let usageReport = loading.usage
      let gitReport = loading.git
      let gitStatus = loading.gitStatus
      let gitCommits = loading.gitCommits
      let gitHistoryTruncated = loading.gitHistoryTruncated
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
        const query = usageInput(target, loading.usageQuery)
        const duration = USAGE_WINDOWS[loading.usageQuery.window]
        const bucketMs = USAGE_BUCKETS[loading.usageQuery.aggregation]
        usageReport = await usage.execute('usage.query', {
          ...query,
          bucketMs,
          maxBuckets: Math.min(500, Math.max(1, Math.ceil(duration / bucketMs))),
          maxSamples: 10_000,
        })
      } else {
        if (!git) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Git statistics are unavailable')
        if (!loading.gitQuery.workspaceId)
          throw new CommandError('INVALID_INPUT', 'Select a workspace before opening Git status')
        const workspace = directory.getSnapshot().workspaces[loading.gitQuery.workspaceId]
        if (!workspace) throw new CommandError('COMMAND_NOT_FOUND', 'Status workspace target is unavailable')
        const query = gitInput(loading.gitQuery)
        const [stats, repositoryStatus, history] = await Promise.all([
          git.execute('git.stats', { cwd: workspace.path, ...query }),
          git.execute('git.status', { cwd: workspace.path }),
          git.execute('git.log', { cwd: workspace.path, limit: 100 }),
        ])
        const sources = new Set(loading.gitQuery.sources)
        gitReport = stats
        gitStatus = repositoryStatus
        gitCommits = history.filter((commit) => {
          const committedAt = Date.parse(commit.committedAt ?? commit.authoredAt)
          return sources.has(commit.provenance.source) && committedAt >= query.from && committedAt < query.to
        })
        gitHistoryTruncated = history.length === 100
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
        usageQuery: loading.usageQuery,
        usageExport: loading.usageExport,
        git: gitReport,
        gitStatus,
        gitCommits,
        gitHistoryTruncated,
        gitQuery: loading.gitQuery,
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
      usageQuery: DEFAULT_USAGE_QUERY,
      usageExport: DEFAULT_USAGE_EXPORT,
      git: null,
      gitStatus: null,
      gitCommits: [],
      gitHistoryTruncated: false,
      gitQuery: DEFAULT_GIT_QUERY,
      gitWorkspaceId: null,
      error: null,
    }
    replace({ ...base, section: 'dashboard', performanceQuery: { window, target }, error: null })
    return load(instanceId)
  })
  local.register(
    statusWorkspaceCommands['statusWorkspace.setUsageQuery'],
    ({ instanceId, scope, includeDescendants, window, aggregation, providerId, modelId }) => {
      const targetPanel = panel(instanceId)
      if (targetPanel.section !== 'usage')
        throw new CommandError('INVALID_INPUT', 'Usage query belongs to the usage section')
      const current = state.reader.getSnapshot().entries[instanceId]
      const query = { scope, includeDescendants, window, aggregation, providerId, modelId }
      usageInput(targetPanel, query)
      const base: StatusWorkspaceEntryState = current ?? {
        instanceId,
        section: 'usage',
        status: 'loading',
        performance: null,
        performanceQuery: DEFAULT_PERFORMANCE_QUERY,
        usage: null,
        usageQuery: DEFAULT_USAGE_QUERY,
        usageExport: DEFAULT_USAGE_EXPORT,
        git: null,
        gitStatus: null,
        gitCommits: [],
        gitHistoryTruncated: false,
        gitQuery: DEFAULT_GIT_QUERY,
        gitWorkspaceId: null,
        error: null,
      }
      replace({ ...base, section: 'usage', usageQuery: query, usageExport: DEFAULT_USAGE_EXPORT, error: null })
      return load(instanceId)
    },
  )
  local.register(statusWorkspaceCommands['statusWorkspace.exportUsage'], async ({ instanceId, format }, context) => {
    const targetPanel = panel(instanceId)
    if (targetPanel.section !== 'usage')
      throw new CommandError('INVALID_INPUT', 'Usage export belongs to the usage section')
    if (!usage) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Usage exports are unavailable')
    if (!options.exporter)
      throw new CommandError('CAPABILITY_UNAVAILABLE', 'File exports are unavailable in this client')
    const current = state.reader.getSnapshot().entries[instanceId]
    if (!current) throw new CommandError('COMMAND_NOT_FOUND', 'Usage status is not loaded')
    if (current.usageExport.status === 'exporting') throw new CommandError('BUSY', 'A usage export is already running')
    replace({
      ...current,
      usageExport: { status: 'exporting', format, fileName: null, rowCount: 0, incomplete: false, error: null },
    })
    try {
      const query = usageInput(targetPanel, current.usageQuery)
      const items: UsageAttemptExport[] = []
      const seen = new Set<string>()
      let after: string | undefined
      let gap = false
      for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
        context.signal.throwIfAborted()
        const page = await usage.execute('usage.export', { ...query, ...(after ? { after } : {}), limit: 500 }, context)
        items.push(...page.items)
        gap ||= page.gap
        if (!page.nextCursor) {
          after = undefined
          break
        }
        if (seen.has(page.nextCursor)) throw new CommandError('INVALID_OUTPUT', 'Usage export cursor did not advance')
        seen.add(page.nextCursor)
        after = page.nextCursor
      }
      const incomplete = after !== undefined
      const fileName = `hbar-usage-${Date.now()}.${format}`
      await options.exporter.save(
        {
          name: fileName,
          mime: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8',
          content: serializeUsageExport(items, format, { gap, truncated: incomplete }),
        },
        context.signal,
      )
      const latest = state.reader.getSnapshot().entries[instanceId]
      if (!latest) throw new CommandError('COMMAND_NOT_FOUND', 'Usage status was closed during export')
      const ready: StatusWorkspaceEntryState = {
        ...latest,
        usageExport: {
          status: 'succeeded',
          format,
          fileName,
          rowCount: items.length,
          incomplete,
          error: null,
        },
      }
      replace(ready)
      return summary(ready)
    } catch (reason) {
      const latest = state.reader.getSnapshot().entries[instanceId]
      if (latest)
        replace({
          ...latest,
          usageExport: {
            status: 'failed',
            format,
            fileName: null,
            rowCount: 0,
            incomplete: false,
            error: code(reason),
          },
        })
      throw failure(reason)
    }
  })
  local.register(
    statusWorkspaceCommands['statusWorkspace.setGitQuery'],
    ({ instanceId, workspaceId, window, sources }) => {
      const targetPanel = panel(instanceId)
      if (targetPanel.section !== 'git') throw new CommandError('INVALID_INPUT', 'Git query belongs to the Git section')
      if (!directory.getSnapshot().workspaces[workspaceId])
        throw new CommandError('COMMAND_NOT_FOUND', 'Git workspace target is unavailable')
      const current = state.reader.getSnapshot().entries[instanceId]
      const base: StatusWorkspaceEntryState = current ?? {
        instanceId,
        section: 'git',
        status: 'loading',
        performance: null,
        performanceQuery: DEFAULT_PERFORMANCE_QUERY,
        usage: null,
        usageQuery: DEFAULT_USAGE_QUERY,
        usageExport: DEFAULT_USAGE_EXPORT,
        git: null,
        gitStatus: null,
        gitCommits: [],
        gitHistoryTruncated: false,
        gitQuery: DEFAULT_GIT_QUERY,
        gitWorkspaceId: null,
        error: null,
      }
      replace({ ...base, section: 'git', gitQuery: { workspaceId, window, sources }, error: null })
      return load(instanceId)
    },
  )
  return {
    reader: state.reader,
    dispose() {
      generations.clear()
      state.dispose()
    },
  }
}
