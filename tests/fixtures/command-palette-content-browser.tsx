import { createRoot, type Root } from 'react-dom/client'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError, defineCommand, describeCommand } from '@hbar/commands'
import { z } from 'zod'
import { HbarCommandPalette, HbarRuntimeProvider } from '@hbar/app-react'
import { LumenProvider, LumenFrame, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'
import { commandContentTitle, commandContentDescription, commandContentSession } from './command-palette-content-data'

export interface CommandPaletteContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly count: number
  readonly suffix: string
  readonly view?: 'search' | 'parameters' | 'result'
  readonly failure?: 'read' | 'write' | 'unknown' | 'loading'
  readonly resultLength?: number
  readonly noParameters?: boolean
}
declare global {
  interface Window {
    mountCommandPaletteContent(input: CommandPaletteContentInput): Promise<void>
    commandPaletteContentState(): {
      readonly palette: ReturnType<
        ReturnType<typeof createAppRuntime>['view']['state']['commandPalette']['getSnapshot']
      >
      readonly writes: readonly { readonly id: string; readonly input: Readonly<Record<string, unknown>> }[]
    }
    refreshCommandPaletteContent(remove?: boolean): Promise<unknown>
    repairCommandPaletteContent(): void
    disposeCommandPaletteContent?: () => void
  }
}
const workspace = { id: 'original-workspace', path: 'D:/owned-commands', name: 'Original workspace', createdAt: 1 }
const session = {
  id: 'original-session',
  title: commandContentSession,
  workspaceId: workspace.id,
  parentId: null,
  archived: false,
  createdAt: 1,
  updatedAt: 2,
  seq: 3,
}
let root: Root | undefined
window.mountCommandPaletteContent = async (input) => {
  window.disposeCommandPaletteContent?.()
  const node = document.getElementById('command-palette-content-fixture')
  if (!node) throw new Error('Missing owned command palette fixture')
  let failed = input.failure
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const writes: { id: string; input: Readonly<Record<string, unknown>> }[] = []
  let descriptors = Array.from({ length: input.count }, (_, index) =>
    describeCommand(
      defineCommand(
        {
          id: `owned.command${String(index).padStart(4, '0')}`,
          version: 1,
          owner: 'owned-test',
          kind: 'command',
          execution: 'host',
          stateEffect: 'persistent',
          category: 'owned-category',
          scope: 'global',
          surfaces: ['palette'],
          titleKey: `owned.${index}.title`,
          descriptionKey: `owned.${index}.description`,
        },
        input.noParameters
          ? z.strictObject({})
          : z.strictObject({
              caption: z.string().min(1).max(4000),
              sessionId: z.string().min(1).max(160).optional(),
              enabled: z.boolean().optional(),
              choice: z.enum(['original', 'later']).optional(),
              secret: z.string().max(160).meta({ writeOnly: true }).optional(),
            }),
        z.unknown(),
      ),
    ),
  )
  const base = getShellCopy(input.locale).commandPalette
  const resolveCopy = (key: string) => {
    const match = /^owned\.(\d+)\.(title|description)$/.exec(key)
    if (match) return match[2] === 'title' ? commandContentTitle(Number(match[1])) : commandContentDescription
    return base.resolve(key)
  }
  const owned = createAppRuntime({
    instanceId: crypto.randomUUID(),
    hostId: 'owned-command-host',
    surfaces: { canRender: () => true },
    directory: {
      execute(name, raw) {
        if (name === 'workspace.list') return Promise.resolve({ items: [workspace], nextCursor: null })
        if (name === 'workspace.get') return Promise.resolve(workspace)
        if (name === 'session.list') return Promise.resolve({ items: [session], nextCursor: null })
        if (name === 'session.get')
          return Promise.resolve(
            raw && typeof raw === 'object' && 'sessionId' in raw && raw.sessionId === session.id ? session : null,
          )
        return Promise.reject(new Error(`Unexpected owned directory read ${name}`))
      },
    },
    commandText: { resolve: resolveCopy },
    commandCatalog: {
      async list({ after, limit }) {
        if (failed === 'loading') await gate
        if (failed === 'read') throw new CommandError('READ_FAILED', 'Owned catalog read failed')
        const start = after ? descriptors.findIndex((entry) => entry.metadata.id === after) + 1 : 0
        const items = descriptors.slice(start, start + limit)
        const last = items.at(-1)
        return {
          revision: 1,
          items,
          ...(last && start + items.length < descriptors.length ? { nextCursor: last.metadata.id } : {}),
        }
      },
      async execute(descriptor, values) {
        writes.push({ id: descriptor.metadata.id, input: values })
        if (failed === 'write') throw new CommandError('WRITE_FAILED', 'Owned write failed')
        if (failed === 'unknown') throw new CommandError('RESULT_UNKNOWN', 'Owned accepted reply unavailable')
        return '完整原命令结果 Complete original result '.repeat(1000).slice(0, input.resultLength ?? 80)
      },
    },
  })
  await owned.ready
  await owned.view.commands.execute('app.setSession', { sessionId: session.id, workspaceId: workspace.id })
  const panel = await owned.view.commands.execute('app.openPanel', { panelId: 'commands' })
  const refresh = () => owned.view.commands.execute('commandPalette.refresh', {}).catch(() => {})
  if (failed !== 'loading') await refresh()
  else void refresh().catch(() => {})
  await owned.view.commands.execute('commandPalette.setQuery', { query: 'owned.command' })
  if (input.view !== 'search' && input.view !== undefined && descriptors[0]) {
    await owned.view.commands.execute('commandPalette.openCommand', { commandId: descriptors[0].metadata.id })
    if (!input.noParameters) {
      await owned.view.commands.execute('commandPalette.setParameter', {
        field: 'caption',
        value: '原始未保存参数 Original parameter draft',
      })
      await owned.view.commands.execute('commandPalette.setParameter', { field: 'sessionId', value: session.id })
    }
    if (input.view === 'result') await owned.view.commands.execute('commandPalette.execute', {}).catch(() => {})
  }
  const labels = {
    ...base,
    resolve: resolveCopy,
    title: base.title + input.suffix,
    description: base.description + input.suffix,
    result: base.result + input.suffix,
    parameters: base.parameters + input.suffix,
    noParameters: base.noParameters + input.suffix,
    succeeded: base.succeeded + input.suffix,
    technicalDetails: base.technicalDetails + input.suffix,
    backToCommands: base.backToCommands + input.suffix,
    backToParameters: base.backToParameters + input.suffix,
    close: base.close + input.suffix,
    execute: base.execute + input.suffix,
    executing: base.executing + input.suffix,
    reset: base.reset + input.suffix,
    fieldFallback: (field: string) => base.fieldFallback(field) + input.suffix,
    error: (code: string) => base.error(code) + input.suffix,
  }
  root = createRoot(node)
  root.render(
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode }}>
      <HbarRuntimeProvider view={owned.view}>
        <LumenFrame className="owned-command-pane">
          <HbarCommandPalette connected labels={labels} />
        </LumenFrame>
      </HbarRuntimeProvider>
    </LumenProvider>,
  )
  window.commandPaletteContentState = () => ({ palette: owned.view.state.commandPalette.getSnapshot(), writes })
  window.refreshCommandPaletteContent = async (remove = false) => {
    if (remove) descriptors = descriptors.slice(1)
    return refresh()
  }
  window.repairCommandPaletteContent = () => {
    failed = undefined
    release()
  }
  window.disposeCommandPaletteContent = () => {
    release()
    root?.unmount()
    root = undefined
    void owned.view.commands.execute('app.closePanel', { instanceId: panel.instanceId }).catch(() => {})
    owned.dispose()
  }
}
