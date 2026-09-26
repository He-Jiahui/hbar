import {
  CommandError,
  createCommandClient,
  defineCommand,
  type CommandExecutor,
  type CommandRegistry,
} from '@hbar/commands'
import { usageCommands, type UsageQueryInput, type UsageQueryResult } from '@hbar/contracts/commands/usage'
import { z } from 'zod'
import { createState, type StateReader } from './state'
import type { PresentationState, SurfaceState } from './types'

export type SettingsUsageWindow = '1h' | '24h' | '7d' | '30d'
export type SettingsUsageReport = UsageQueryResult
export const SETTINGS_USAGE_MAX_BUCKETS = 120
const WINDOWS = {
  '1h': { duration: 3_600_000, bucket: 300_000 },
  '24h': { duration: 86_400_000, bucket: 3_600_000 },
  '7d': { duration: 604_800_000, bucket: 21_600_000 },
  '30d': { duration: 2_592_000_000, bucket: 86_400_000 },
} satisfies Record<SettingsUsageWindow, { duration: number; bucket: number }>
const inputSchema = z.strictObject({ instanceId: z.string().min(1).max(160) })
const resultSchema = z.strictObject({ status: z.enum(['ready', 'error']), error: z.string().nullable() })
const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.settings-usage',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  scope: 'client' as const,
  category: 'monitoring.usage',
  visibility: 'internal' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as 'api'[],
})
export const settingsUsageCommands = {
  'settingsUsage.refresh': defineCommand(metadata('settingsUsage.refresh'), inputSchema, resultSchema),
  'settingsUsage.setWindow': defineCommand(
    metadata('settingsUsage.setWindow'),
    inputSchema.extend({ window: z.enum(['1h', '24h', '7d', '30d']) }),
    resultSchema,
  ),
}
export interface SettingsUsageEntry {
  readonly instanceId: string
  readonly window: SettingsUsageWindow
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly report: Readonly<SettingsUsageReport> | null
  readonly error: string | null
}
export interface SettingsUsageState {
  readonly entries: Readonly<Record<string, Readonly<SettingsUsageEntry>>>
}
function errorCode(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

/** Read-only global usage belongs to its open settings page, never to a hidden status surface. */
export function createSettingsUsage(
  local: CommandRegistry,
  usage: CommandExecutor | undefined,
  surfaces: StateReader<SurfaceState>,
  onSubscriberError: (reason: unknown) => void,
  isDisposed: () => boolean,
  presentation: StateReader<PresentationState>,
) {
  const state = createState<SettingsUsageState>({ entries: {} }, onSubscriberError)
  const client = usage ? createCommandClient(usageCommands, usage) : null
  const active = new Map<
    string,
    { panel: SurfaceState['panels'][string]; controller: AbortController; generation: number }
  >()
  let generation = 0
  let disposed = false
  function panel(instanceId: string) {
    const target = surfaces.getSnapshot().panels[instanceId]
    const page = presentation.getSnapshot().page
    if (
      !target ||
      target.panelId !== 'settings' ||
      target.params.section !== 'usage' ||
      page.kind !== 'settings' ||
      page.instanceId !== instanceId
    )
      throw new CommandError('COMMAND_NOT_FOUND', 'Usage settings page is not open')
    return target
  }
  function replace(entry: SettingsUsageEntry) {
    const entries = { ...state.reader.getSnapshot().entries, [entry.instanceId]: entry }
    for (const id of Object.keys(entries)) if (!surfaces.getSnapshot().panels[id]) delete entries[id]
    const ids = Object.keys(entries)
    if (ids.length > 4) delete entries[ids.find((id) => id !== entry.instanceId)!]
    state.replace({ entries })
  }
  const invalidate = () => {
    for (const [id, request] of active) {
      const page = presentation.getSnapshot().page
      if (surfaces.getSnapshot().panels[id] === request.panel && page.kind === 'settings' && page.instanceId === id)
        continue
      active.delete(id)
      request.controller.abort()
      const entry = state.reader.getSnapshot().entries[id]
      if (entry) replace({ ...entry, status: 'idle', error: null })
    }
  }
  const unsubscribeSurfaces = surfaces.subscribe(invalidate)
  const unsubscribePresentation = presentation.subscribe(invalidate)
  async function load(instanceId: string, window?: SettingsUsageWindow) {
    if (disposed || isDisposed()) throw new CommandError('DISPOSED', 'Usage runtime is disposed')
    const target = panel(instanceId)
    if (active.has(instanceId) && (!window || state.reader.getSnapshot().entries[instanceId]?.window === window))
      throw new CommandError('BUSY', 'Usage read is already pending')
    active.get(instanceId)?.controller.abort()
    const previous = state.reader.getSnapshot().entries[instanceId]
    const selectedWindow = window ?? previous?.window ?? '24h'
    const controller = new AbortController()
    const request = { panel: target, controller, generation: ++generation }
    active.set(instanceId, request)
    const sameWindow = previous?.window === selectedWindow
    replace({
      instanceId,
      window: selectedWindow,
      status: 'loading',
      report: sameWindow ? (previous?.report ?? null) : null,
      error: null,
    })
    const current = () => {
      const page = presentation.getSnapshot().page
      return (
        !disposed &&
        !isDisposed() &&
        active.get(instanceId) === request &&
        surfaces.getSnapshot().panels[instanceId] === target &&
        page.kind === 'settings' &&
        page.instanceId === instanceId
      )
    }
    let removeAbort = () => {}
    const timer = setTimeout(() => controller.abort(new CommandError('TIMEOUT', 'Usage read timed out')), 12_000)
    try {
      if (!client) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Host usage is unavailable')
      const interrupted = new Promise<never>((_resolve, reject) => {
        const abort = () =>
          reject(
            controller.signal.reason instanceof CommandError
              ? controller.signal.reason
              : new CommandError('QUERY_SUPERSEDED', 'Usage read was interrupted'),
          )
        controller.signal.addEventListener('abort', abort, { once: true })
        removeAbort = () => controller.signal.removeEventListener('abort', abort)
      })
      const to = Date.now()
      const spec = WINDOWS[selectedWindow]
      const input: UsageQueryInput = {
        scope: { kind: 'global' },
        from: Math.max(0, to - spec.duration),
        to,
        bucketMs: spec.bucket,
        maxBuckets: SETTINGS_USAGE_MAX_BUCKETS,
        maxSamples: 5_000,
        filters: {},
      }
      const report = await Promise.race([
        client.execute('usage.query', input, { signal: controller.signal }),
        interrupted,
      ])
      if (
        report.scope.kind !== 'global' ||
        report.window.from !== input.from ||
        report.window.to !== to ||
        report.window.bucketMs !== input.bucketMs ||
        report.series.length > SETTINGS_USAGE_MAX_BUCKETS ||
        new Set(report.models.map((item) => item.modelSelectionId)).size !== report.models.length ||
        new Set(report.series.map((item) => item.start)).size !== report.series.length
      )
        throw new CommandError('INVALID_OUTPUT', 'Usage report does not match its bounded query')
      if (!current()) throw new CommandError('QUERY_SUPERSEDED', 'Usage settings page changed during the read')
      replace({ instanceId, window: selectedWindow, status: 'ready', report, error: null })
      return { status: 'ready' as const, error: null }
    } catch (reason) {
      if (current())
        replace({
          instanceId,
          window: selectedWindow,
          status: 'error',
          report: sameWindow ? (previous?.report ?? null) : null,
          error: errorCode(reason),
        })
      return { status: 'error' as const, error: errorCode(reason) }
    } finally {
      clearTimeout(timer)
      removeAbort()
      if (active.get(instanceId) === request) active.delete(instanceId)
    }
  }
  local.register(settingsUsageCommands['settingsUsage.refresh'], ({ instanceId }) => load(instanceId))
  local.register(settingsUsageCommands['settingsUsage.setWindow'], ({ instanceId, window }) => load(instanceId, window))
  return {
    reader: state.reader,
    dispose() {
      disposed = true
      unsubscribeSurfaces()
      unsubscribePresentation()
      for (const request of active.values()) request.controller.abort()
      active.clear()
      state.dispose()
    },
  }
}
