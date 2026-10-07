import { createRoot, type Root } from 'react-dom/client'
import { createAppRuntime, type ScheduleRuntimeState } from '@hbar/app-runtime'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import { scheduleCommands, type ScheduleDefinition } from '@hbar/contracts/commands/schedules'
import { modelCommands } from '@hbar/contracts/commands/models'
import { HbarRuntimeProvider } from '@hbar/app-react'
import { LumenProvider, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import { SchedulesPage } from '../../apps/web/src/schedules-page'
import { scheduleCopy } from '../../apps/web/src/schedule-copy'
import { scheduleContentName, scheduleContentProvider, scheduleContentModel } from './schedule-content-data'
import '@lumen/app-ui/styles.css'

export interface ScheduleContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly state: 'list' | 'edit' | 'load-error' | 'save-error' | 'unknown' | 'loading' | 'unavailable'
  readonly count: number
  readonly suffix: string
  readonly occurrenceCount?: number
  readonly nameLength?: number
  readonly promptLength?: number
  readonly duplicate?: boolean
  readonly foreign?: boolean
  readonly oversizedPage?: boolean
  readonly noModels?: boolean
  readonly kind?: ScheduleDefinition['spec']['kind']
}
declare global {
  interface Window {
    mountScheduleContent(input: ScheduleContentInput): Promise<void>
    scheduleContentState(): {
      readonly calls: readonly { name: string; input: unknown }[]
      readonly state: ScheduleRuntimeState | undefined
    }
    repairScheduleContent(): void
    reorderScheduleContent(): Promise<void>
    disposeScheduleContent?: () => void
  }
}
const workspace = { id: 'original-workspace', path: 'D:/owned-schedules', name: 'Original workspace', createdAt: 1 }
const session = {
  id: 'original-session',
  workspaceId: workspace.id,
  title: 'Original session target 原始会话 '.repeat(4),
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 2,
  seq: 3,
}
let root: Root | undefined
let release: (() => void) | undefined
window.mountScheduleContent = async (input) => {
  window.disposeScheduleContent?.()
  const element = document.getElementById('schedule-content-fixture')
  if (!element) throw new Error('Missing owned schedule fixture')
  const calls: { name: string; input: unknown }[] = []
  const spec: ScheduleDefinition['spec'] =
    input.kind === 'weekly'
      ? { kind: 'weekly', hour: 9, minute: 0, weekdays: [1] }
      : input.kind === 'cron'
        ? { kind: 'cron', expression: '0 9 * * *' }
        : input.kind === 'once'
          ? { kind: 'once', at: 1791408600000 }
          : { kind: 'daily', hour: 9, minute: 0 }
  let items: ScheduleDefinition[] = Array.from({ length: input.count }, (_, index) => ({
    id: input.duplicate ? 'original-schedule-0' : `original-schedule-${index}`,
    workspaceId: input.foreign ? 'foreign-workspace' : workspace.id,
    name: scheduleContentName(index, input.nameLength),
    input: input.promptLength ? '原'.repeat(input.promptLength) : 'Original prompt 原始提示词',
    modelId: 'original-model',
    timezone: 'UTC',
    target: { mode: 'existing-session', sessionId: session.id },
    spec,
    enabled: true,
    revision: 3,
    createdAt: 1,
    updatedAt: 2,
  }))
  let failed = input.state === 'load-error' || input.state === 'save-error'
  let hold = input.state === 'loading'
  let receipt: unknown = null
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const port: CommandExecutor = {
    async execute(name, raw) {
      calls.push({ name, input: raw })
      if (name === 'schedule.list') {
        if (hold) await gate
        if (failed && input.state === 'load-error')
          throw new CommandError('DISCONNECTED', `Owned schedule read failure ${input.suffix}`)
        const request = scheduleCommands[name].input.parse(raw)
        const start = Number(request.after ?? 0)
        const size = input.oversizedPage ? 101 : 100
        return {
          items: items.slice(start, start + size),
          next: start + size < items.length ? String(start + size) : null,
          revision: 1,
        }
      }
      if (name === 'schedule.get') {
        const request = scheduleCommands[name].input.parse(raw)
        return items.find((item) => item.id === request.scheduleId) ?? null
      }
      if (name === 'schedule.preview') {
        const request = scheduleCommands[name].input.parse(raw)
        return {
          occurrences: [1791408600000, 1791495000000, 1791581400000, 1791667800000, 1791754200000],
          timezone: request.timezone,
        }
      }
      if (name === 'schedule.update' || name === 'schedule.create') {
        if (failed) throw new CommandError('CONFLICT', `Owned original schedule conflict ${input.suffix}`)
        if (name === 'schedule.update') {
          const request = scheduleCommands[name].input.parse(raw)
          const previous = items.find((item) => item.id === request.scheduleId)
          if (!previous) throw new Error('Original schedule disappeared')
          receipt = scheduleCommands[name].output.parse({
            ...previous,
            workspaceId: request.workspaceId,
            name: request.name,
            input: request.input,
            modelId: request.modelId,
            timezone: request.timezone,
            target: request.target,
            spec: request.spec,
            enabled: request.enabled ?? previous.enabled,
            revision: request.expectedRevision + 1,
            updatedAt: 4,
          })
          const saved = scheduleCommands[name].output.parse(receipt)
          items = items.map((item) => (item.id === saved.id ? saved : item))
        } else {
          const request = scheduleCommands[name].input.parse(raw)
          const saved = scheduleCommands[name].output.parse({
            ...request,
            id: 'new-original-schedule',
            enabled: true,
            revision: 0,
            createdAt: 1,
            updatedAt: 4,
          })
          receipt = saved
          items = [saved, ...items]
        }
        if (input.state === 'unknown')
          throw new CommandError('DISCONNECTED', `Owned accepted schedule response lost ${input.suffix}`)
        return receipt
      }
      if (name === 'schedule.receipt') return receipt
      if (name === 'schedule.delete') {
        const request = scheduleCommands[name].input.parse(raw)
        items = items.filter((item) => item.id !== request.scheduleId)
        return { scheduleId: request.scheduleId, revision: request.expectedRevision + 1 }
      }
      if (name === 'schedule.occurrences') {
        const request = scheduleCommands[name].input.parse(raw)
        const start = Number(request.after ?? 0),
          count = input.occurrenceCount ?? 1
        return {
          items: Array.from({ length: Math.min(100, count - start) }, (_, position) => ({
            id: `original-occurrence-${start + position}`,
            scheduleId: request.scheduleId,
            dueAt: 1791408600000 + position * 1000,
            status: 'failed',
            sessionId: session.id,
            runId: null,
            attempt: 1,
            idempotencyKey: `original-key-${start + position}`,
            createdAt: 1,
            updatedAt: 2,
            error: `Original execution failure 原始执行错误 ${input.suffix}`,
          })),
          next: start + 100 < count ? String(start + 100) : null,
        }
      }
      throw new Error(`Unexpected schedule command ${name}`)
    },
  }
  const owned = createAppRuntime({
    instanceId: 'schedule-content',
    hostId: 'owned-fixture',
    directory: {
      execute(name) {
        if (name === 'session.get') return Promise.resolve(session)
        if (name === 'workspace.get') return Promise.resolve(workspace)
        if (name === 'session.list') return Promise.resolve({ items: [session], nextCursor: null })
        if (name === 'workspace.list') return Promise.resolve({ items: [workspace], nextCursor: null })
        return Promise.reject(new Error(`Unexpected directory command ${name}`))
      },
    },
    models: {
      execute(name) {
        if (name !== 'model.list') return Promise.reject(new Error(`Unexpected model command ${name}`))
        return Promise.resolve(
          modelCommands[name].output.parse(
            input.noModels
              ? []
              : [
                  {
                    id: 'original-model',
                    providerId: 'original-provider',
                    providerName: scheduleContentProvider,
                    modelId: 'original-model',
                    modelName: scheduleContentModel,
                    contextWindow: 100000,
                    maxOutput: 8000,
                    imageInput: false,
                    reasoning: false,
                    thinkingLevels: ['off'],
                    defaultThinkingLevel: 'off',
                    hasKey: true,
                  },
                ],
          ),
        )
      },
    },
    ...(input.state === 'unavailable' ? {} : { schedules: port }),
    surfaces: { canRender: () => true },
  })
  await owned.ready
  await owned.view.commands.execute('app.setSession', { workspaceId: workspace.id, sessionId: session.id })
  const base = scheduleCopy(input.locale)
  const labels = {
    ...base,
    title: base.title + input.suffix,
    unavailable: base.unavailable + input.suffix,
    name: base.name + input.suffix,
    enabled: base.enabled + input.suffix,
    paused: base.paused + input.suffix,
    previewTitle: base.previewTitle + input.suffix,
    saved: base.saved + input.suffix,
    empty: base.empty + input.suffix,
    unknown: base.unknown + input.suffix,
    noModels: base.noModels + input.suffix,
    refresh: base.refresh + input.suffix,
    create: base.create + input.suffix,
    save: base.save + input.suffix,
    edit: base.edit + input.suffix,
    delete: base.delete + input.suffix,
    preview: base.preview + input.suffix,
    summary: (kind: string, timezone: string) => base.summary(kind, timezone) + input.suffix,
    occurrenceSummary: (date: string, status: string) => base.occurrenceSummary(date, status) + input.suffix,
  }
  window.scheduleContentState = () => ({ calls, state: owned.view.state.schedules?.reader.getSnapshot() })
  window.repairScheduleContent = () => {
    failed = false
    hold = false
    release?.()
  }
  window.reorderScheduleContent = async () => {
    items = [...items].reverse()
    await owned.view.state.schedules?.refresh(workspace.id)
  }
  window.disposeScheduleContent = () => {
    root?.unmount()
    owned.dispose()
    release?.()
    root = undefined
    release = undefined
  }
  root = createRoot(element)
  const editing = input.state === 'edit' || input.state === 'save-error' || input.state === 'unknown'
  root.render(
    <LumenProvider
      className="schedule-fixture-provider"
      appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}
    >
      <HbarRuntimeProvider view={owned.view}>
        <SchedulesPage
          runtime={owned.view}
          workspaceId={workspace.id}
          locale={input.locale}
          labels={labels}
          {...(editing ? { initialScheduleId: 'original-schedule-0' } : {})}
        />
      </HbarRuntimeProvider>
    </LumenProvider>,
  )
}
