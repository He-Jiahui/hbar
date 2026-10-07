import { createRoot } from 'react-dom/client'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import { HbarRuntimeProvider, HbarStatusWorkspace, type HbarStatusWorkspaceLabels } from '@hbar/app-react'
import { metricsQueryResultSchema } from '@hbar/contracts/commands/metrics'
import {
  usageQueryResultSchema,
  usageExportResultSchema,
  usageQueryInputSchema,
  usageExportInputSchema,
} from '@hbar/contracts/commands/usage'
import { gitCommands } from '@hbar/contracts/commands/git'
import { gitStatsReportSchema, gitStatusSchema, gitCommitInfoSchema } from '@hbar/contracts'
import type { MetricValue, PerformanceReadings } from '@hbar/contracts/metrics'
import { LumenFrame, LumenProvider, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'

export interface StatusWorkspaceFixtureInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly suffix: string
  readonly section: 'dashboard' | 'usage' | 'git'
  readonly count: number
  readonly state: 'ready' | 'empty' | 'duplicate' | 'error' | 'gap'
}

interface StatusFixtureSnapshot {
  readonly targets: readonly { readonly name: string; readonly input: unknown }[]
  readonly exports: readonly { readonly name: string; readonly mime: string; readonly content: string }[]
  readonly status: string | undefined
  readonly error: string | null | undefined
  readonly usageQuery: unknown
  readonly performanceQuery: unknown
  readonly gitQuery: unknown
}
declare global {
  interface Window {
    mountStatusWorkspace(input: StatusWorkspaceFixtureInput): Promise<void>
    releaseStatusWorkspace(): void
    statusWorkspaceSnapshot(): StatusFixtureSnapshot
    statusWorkspaceRepair(): void
    statusWorkspaceSelectBucket(): Promise<void>
    statusWorkspaceBounds(): Readonly<Record<string, boolean>>
  }
}

const metric = (value: number | null, unit: MetricValue['unit']): MetricValue => ({
  value,
  unit,
  availability: value === null ? 'unavailable' : 'available',
  reason: value === null ? 'PLATFORM_UNSUPPORTED' : null,
  source: 'owned-status',
  estimated: false,
  sampleCount: value === null ? 0 : 1,
})
const readings: PerformanceReadings = {
  systemCpuPercent: metric(42, 'percent'),
  hostCpuPercent: metric(12, 'percent'),
  systemLoad1: metric(null, 'load'),
  systemMemoryUsedBytes: metric(4000, 'bytes'),
  systemMemoryTotalBytes: metric(8000, 'bytes'),
  hostRssBytes: metric(2000, 'bytes'),
  hostHeapUsedBytes: metric(1000, 'bytes'),
  hostThreadCount: metric(null, 'count'),
  hostDiskReadBytesPerSecond: metric(100, 'bytes_per_second'),
  hostDiskWriteBytesPerSecond: metric(200, 'bytes_per_second'),
  systemNetworkReceiveBytesPerSecond: metric(300, 'bytes_per_second'),
  systemNetworkTransmitBytesPerSecond: metric(400, 'bytes_per_second'),
  eventLoopLagMs: metric(3, 'milliseconds'),
  activeRuns: metric(1, 'count'),
  queuedRuns: metric(2, 'count'),
  managedChildProcesses: metric(1, 'count'),
}
const usageMetric = (value: number, unit: 'USD' | 'ratio' | 'tokens_per_second') => ({
  value,
  unit,
  availability: 'available' as const,
  reason: null,
  source: 'owned-status',
  estimated: unit === 'USD',
  sampleCount: 2,
})
const latency = {
  p50: 40,
  p95: 80,
  unit: 'milliseconds' as const,
  availability: 'available' as const,
  reason: null,
  sampleCount: 2,
}
const totals = { attempts: 2, runs: 2, input: 200, output: 80, cacheRead: 40, cacheWrite: 10, billableTokens: 240 }
const gitTotals = {
  commits: 3,
  autoCommits: 1,
  manualCommits: 1,
  externalCommits: 1,
  filesChanged: 5,
  additions: 20,
  deletions: 4,
  renames: 1,
  binaryFiles: 1,
}
const start = Date.now() - 86400000
const models = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    modelSelectionId: `original-provider:original-model-${index}`,
    providerId: 'original-provider',
    modelId: `Original model ${index} — 原始模型完整名称 `.repeat(8).slice(0, 128),
    ...totals,
    cost: usageMetric(0.25, 'USD'),
  }))
const commits = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    gitCommitInfoSchema.parse({
      sha: (index + 1).toString(16).padStart(40, '0'),
      shortSha: (index + 1).toString(16).padStart(7, '0'),
      author: 'Original commit author — 原始作者 '.repeat(12),
      subject: `Original commit ${index} — 原始提交完整内容 `.repeat(10),
      authoredAt: new Date(start + index * 1000).toISOString(),
      committedAt: new Date(start + index * 1000).toISOString(),
      provenance: {
        source: 'auto',
        recordedAt: start,
        sessionId: 'original-session',
        runId: 'original-run',
        operationId: 'original-operation',
      },
    }),
  )
const points = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    start: start + index * 1000,
    end: start + (index + 1) * 1000,
    readings,
  }))
const usageSeries = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    start: start + index * 1000,
    end: start + (index + 1) * 1000,
    ...totals,
    cost: usageMetric(0.25, 'USD'),
  }))
const gitPoints = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    start: start + index * 86400000,
    end: start + (index + 1) * 86400000,
    ...gitTotals,
  }))

window.mountStatusWorkspace = async (input) => {
  const container = document.getElementById('status-workspace-fixture')
  if (!container) throw new Error('Missing owned status workspace root')
  const workspace = { id: 'original-workspace', path: 'D:/owned-status', name: 'Original workspace', createdAt: 1 }
  const session = {
    id: 'original-session',
    workspaceId: workspace.id,
    title: 'Original session',
    parentId: null,
    archived: false,
    createdAt: 1,
    updatedAt: 1,
    seq: 0,
  }
  const targets: { name: string; input: unknown }[] = []
  const exports: { name: string; mime: string; content: string }[] = []
  let failed = input.state === 'error'
  const count = input.state === 'empty' ? 0 : input.count
  const modelRows = models(count)
  const commitRows = commits(count)
  if (input.state === 'duplicate' && modelRows[0] && commitRows[0]) {
    modelRows.push({ ...modelRows[0], modelId: 'Duplicate should not replace original model' })
    commitRows.push({ ...commitRows[0], subject: 'Duplicate should not replace original commit' })
  }
  const performance = metricsQueryResultSchema.parse({
    observedAt: start,
    intervalMs: 1000,
    retentionSamples: 120,
    process: { pid: 42, platform: 'win32', arch: 'x64', startedAt: start - 1000, uptimeMs: 1000, logicalProcessors: 8 },
    current: count ? { observedAt: start, elapsedMs: 1000, readings } : null,
    gap: input.state === 'gap',
    skippedSamples: input.state === 'gap' ? 2 : 0,
    points: points(Math.min(count, 500)),
  })
  const usage = usageQueryResultSchema.parse({
    accountingVersion: 1,
    scope: { kind: 'global' },
    window: { from: start, to: start + 86400000, bucketMs: 1000 },
    observedAt: start,
    gap: input.state === 'gap',
    totals,
    cost: usageMetric(0.25, 'USD'),
    cacheHitRate: usageMetric(0.2, 'ratio'),
    rates: {
      input: usageMetric(10, 'tokens_per_second'),
      output: usageMetric(4, 'tokens_per_second'),
      total: usageMetric(14, 'tokens_per_second'),
    },
    latency: { firstProviderEvent: latency, firstThinking: latency, firstText: latency, response: latency },
    execution: count
      ? {
          toolCalls: { total: 3, succeeded: 2, failed: 1, unknown: 0 },
          requestConcurrency: {
            value: 2,
            unit: 'count',
            availability: 'available',
            reason: null,
            source: 'owned-status',
            sampleCount: 2,
          },
          toolConcurrency: {
            value: 1,
            unit: 'count',
            availability: 'available',
            reason: null,
            source: 'owned-status',
            sampleCount: 3,
          },
          totalRunDuration: {
            value: 2500,
            unit: 'milliseconds',
            availability: 'available',
            reason: null,
            source: 'owned-status',
            sampleCount: 2,
          },
          runDuration: latency,
          toolDuration: latency,
        }
      : undefined,
    models: input.section === 'usage' ? modelRows : [],
    series: usageSeries(Math.min(count, 500)),
  })
  const git = gitStatsReportSchema.parse({
    accountingVersion: 'git-stats-v1',
    repoId: workspace.path,
    head: count ? 'a'.repeat(40) : null,
    observedAt: start,
    from: start,
    to: start + 86400000,
    bucketMs: 86400000,
    sources: ['auto', 'manual', 'external'],
    timeBasis: 'committer',
    timezone: 'UTC',
    historyPolicy: 'first-parent',
    renamePolicy: 'separate',
    binaryLineChanges: { value: null, availability: 'unavailable', reason: 'BINARY_CONTENT' },
    totals: gitTotals,
    points: gitPoints(Math.min(count, 1000)),
    scannedCommits: count,
    indexMode: count ? 'full' : 'empty',
    indexComplete: true,
    gap: input.state === 'gap',
  })
  const repository = gitStatusSchema.parse({
    cwd: workspace.path,
    root: count ? workspace.path : null,
    branch: 'main',
    head: count ? 'a'.repeat(40) : null,
    upstream: 'origin/main',
    ahead: 1,
    behind: 0,
    dirty: Boolean(count),
    entries: count ? [{ index: 'M', worktree: ' ', path: 'src/index.ts' }] : [],
    originUrl: null,
  })
  const query: CommandExecutor = {
    async execute(name, value) {
      targets.push({ name, input: value })
      if (failed) throw new CommandError('DISCONNECTED', 'Owned status read failure')
      if (name === 'metrics.query') return performance
      if (name === 'usage.query') return { ...usage, scope: usageQueryInputSchema.parse(value).scope }
      if (name === 'usage.export')
        return usageExportResultSchema.parse({
          accountingVersion: 1,
          scope: usageExportInputSchema.parse(value).scope,
          observedAt: start,
          gap: input.state === 'gap',
          items: [],
        })
      if (name === 'git.stats') return git
      if (name === 'git.status') return repository
      if (name === 'git.log') return input.section === 'git' ? commitRows : []
      throw new Error(`Unexpected owned status query ${name}`)
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'owned-status-workspace',
    hostId: 'host',
    metrics: query,
    usage: query,
    git: query,
    exporter: {
      async save(file) {
        exports.push(file)
      },
    },
    directory: {
      async execute(name) {
        if (name === 'workspace.get') return workspace
        if (name === 'session.get') return session
        if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
        if (name === 'session.list') return { items: [session], nextCursor: null }
        throw new Error(`Unexpected owned status directory query ${name}`)
      },
    },
    surfaces: { canRender: () => true },
  })
  const root = createRoot(container)
  window.releaseStatusWorkspace = () => {
    root.unmount()
    runtime.dispose()
  }
  await runtime.ready
  await runtime.view.commands.execute('app.setSession', { workspaceId: workspace.id, sessionId: session.id })
  const panel = await runtime.view.commands.execute('app.openStatus', { section: input.section })
  try {
    await runtime.view.commands.execute('statusWorkspace.refresh', { instanceId: panel.instanceId })
  } catch (error) {
    if (!failed) throw error
  }
  window.statusWorkspaceRepair = () => {
    failed = false
  }
  window.statusWorkspaceSelectBucket = async () => {
    await runtime.view.commands.execute('statusWorkspace.selectGitBucket', {
      instanceId: panel.instanceId,
      bucketStart: start,
    })
  }
  window.statusWorkspaceSnapshot = () => {
    const entry = runtime.view.state.status.getSnapshot().entries[panel.instanceId]
    return {
      targets,
      exports,
      status: entry?.status,
      error: entry?.error,
      usageQuery: entry?.usageQuery,
      performanceQuery: entry?.performanceQuery,
      gitQuery: entry?.gitQuery,
    }
  }
  window.statusWorkspaceBounds = () => ({
    models1024: usageQueryResultSchema.shape.models.safeParse(models(1024)).success,
    models1025: usageQueryResultSchema.shape.models.safeParse(models(1025)).success,
    usage500: usageQueryResultSchema.shape.series.safeParse(usageSeries(500)).success,
    usage501: usageQueryResultSchema.shape.series.safeParse(usageSeries(501)).success,
    performance500: metricsQueryResultSchema.shape.points.safeParse(points(500)).success,
    performance501: metricsQueryResultSchema.shape.points.safeParse(points(501)).success,
    commits100: gitCommands['git.log'].output.safeParse(commits(100)).success,
    commits101: gitCommands['git.log'].output.safeParse(commits(101)).success,
    git1000: gitStatsReportSchema.shape.points.safeParse(gitPoints(1000)).success,
    git1001: gitStatsReportSchema.shape.points.safeParse(gitPoints(1001)).success,
  })
  const copy = getShellCopy(input.locale).status
  const labels: HbarStatusWorkspaceLabels = {
    ...copy,
    title: copy.title + input.suffix,
    resources: copy.resources + input.suffix,
    runtime: copy.runtime + input.suffix,
    trends: copy.trends + input.suffix,
    process: copy.process + input.suffix,
    io: copy.io + input.suffix,
    sections: {
      dashboard: copy.sections.dashboard + input.suffix,
      usage: copy.sections.usage + input.suffix,
      git: copy.sections.git + input.suffix,
    },
    performanceFilters: {
      ...copy.performanceFilters,
      timeWindow: copy.performanceFilters.timeWindow + input.suffix,
      target: copy.performanceFilters.target + input.suffix,
    },
    usage: {
      ...copy.usage,
      title: copy.usage.title + input.suffix,
      scope: copy.usage.scope + input.suffix,
      timeWindow: copy.usage.timeWindow + input.suffix,
      aggregation: copy.usage.aggregation + input.suffix,
      provider: copy.usage.provider + input.suffix,
      modelFilter: copy.usage.modelFilter + input.suffix,
      advancedFilters: copy.usage.advancedFilters + input.suffix,
      rates: copy.usage.rates + input.suffix,
      latency: copy.usage.latency + input.suffix,
      timeline: copy.usage.timeline + input.suffix,
      models: copy.usage.models + input.suffix,
      execution: copy.usage.execution + input.suffix,
    },
    git: {
      ...copy.git,
      title: copy.git.title + input.suffix,
      advancedFilters: copy.git.advancedFilters + input.suffix,
      repositoryFilter: copy.git.repositoryFilter + input.suffix,
      timeWindow: copy.git.timeWindow + input.suffix,
      recentCommits: copy.git.recentCommits + input.suffix,
      activity: copy.git.activity + input.suffix,
      timeline: copy.git.timeline + input.suffix,
      commits: copy.git.commits + input.suffix,
      files: copy.git.files + input.suffix,
      changes: copy.git.changes + input.suffix,
      commitAuthor: copy.git.commitAuthor + input.suffix,
      showAllCommits: copy.git.showAllCommits + input.suffix,
    },
  }
  root.render(
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}>
      <LumenFrame className="status-workspace-fixture-pane">
        <HbarRuntimeProvider view={runtime.view}>
          <HbarStatusWorkspace labels={labels} instanceId={panel.instanceId} />
        </HbarRuntimeProvider>
      </LumenFrame>
    </LumenProvider>,
  )
}
