import { createRoot } from 'react-dom/client'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import { pluginInfoSchema, extensionCommands } from '@hbar/contracts/commands/extensions'
import { terminalContributionSchema } from '@hbar/contracts'
import { HbarRuntimeProvider, HbarExtensionWorkspace } from '@hbar/app-react'
import { LumenProvider, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'

export interface PluginContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly suffix: string
  readonly count: number
  readonly state:
    'ready' | 'empty' | 'read-error' | 'missing' | 'failed' | 'unknown' | 'required' | 'offline' | 'duplicates'
}
declare global {
  interface Window {
    mountPluginContent(input: PluginContentInput): Promise<void>
    releasePluginContent(): void
    repairPluginContent(): void
    pluginContentState(): {
      readonly calls: readonly { readonly name: string; readonly input: unknown }[]
      readonly selected: string | null | undefined
      readonly action: unknown
    }
    shrinkPluginContent(): Promise<void>
    pluginContentTextBounds(): Readonly<Record<string, boolean>>
  }
}
window.mountPluginContent = async (input) => {
  const element = document.getElementById('plugin-content-fixture')
  if (!element) throw new Error('Missing Plugin content fixture root')
  const name = '完整原始插件名称 Complete original extension name '.repeat(6)
  const commandTitle = (index: number) => `原始命令 ${index} Complete original command name `.repeat(5).slice(0, 120)
  const commands = Array.from({ length: input.count }, (_, index) => ({
    id: `original.command-${index}`,
    title: commandTitle(index),
    description: '原始能力描述 Complete original capability description '.repeat(6),
    usage: `/original.command-${index} --original-option=${'original-full-command-argument'.repeat(12).slice(0, 260)}`,
    group: 'extensions' as const,
  }))
  if (input.state === 'duplicates' && commands[0])
    commands.push({ ...commands[0], title: 'Original last duplicate command record — 原有最后一条同 ID 记录' })
  let plugin = pluginInfoSchema.parse({
    id: 'original-plugin',
    name,
    version: '1.2.3',
    required: input.state === 'required',
    status: 'active',
    provides: Array.from(
      { length: input.count },
      (_, index) => `original-service-${index}-` + 'complete-service-name'.repeat(10),
    ),
    requires: Array.from(
      { length: input.count },
      (_, index) => `original-dependency-${index}-` + 'complete-dependency-name'.repeat(10),
    ),
    description: '原始插件说明 Complete original plugin description '.repeat(8),
    config: { secret: 'owned-secret-never-display' },
    path: 'D:/original-plugin/' + 'original-parent-folder/'.repeat(25),
    installScope: 'global',
    runtimeScope: 'host',
    projectId: 'original-project',
    contributes: {
      commands,
      panels: Array.from({ length: input.count }, (_, index) => ({
        id: `original-panel-${index}`,
        title: `原始面板 ${index} Complete original panel title `.repeat(6),
        privateField: 'private-declaration-never-display',
      })),
      renderers: Array.from({ length: input.count }, (_, index) => ({
        id: `original-renderer-${index}`,
        title: `原始渲染器 ${index} Complete original renderer title `.repeat(6),
      })),
    },
  })
  let failure = input.state === 'read-error' || input.state === 'failed' || input.state === 'unknown'
  const calls: { readonly name: string; readonly input: unknown }[] = []
  const extensions: CommandExecutor = {
    async execute(name, value) {
      calls.push({ name, input: value })
      if (name === 'plugin.list') return [plugin]
      if (name === 'skill.list') return []
      if (name === 'plugin.inspect') {
        const target = extensionCommands[name].input.parse(value)
        if (target.id !== plugin.id) throw new Error('A foreign plugin was inspected')
        if (input.state === 'read-error' && failure) throw new CommandError('DISCONNECTED', 'Owned detail read failed')
        return input.state === 'missing' ? null : plugin
      }
      if (name === 'plugin.enable' || name === 'plugin.disable') {
        const target = extensionCommands[name].input.parse(value)
        if (target.id !== plugin.id) throw new Error('A foreign plugin was mutated')
        if (failure && input.state === 'failed') throw new CommandError('PLUGIN_DEPENDENCY', 'Owned activation failure')
        plugin = pluginInfoSchema.parse({ ...plugin, status: name === 'plugin.enable' ? 'active' : 'disabled' })
        if (failure && input.state === 'unknown') throw new CommandError('RESULT_UNKNOWN', 'Owned reply was lost')
        return [plugin]
      }
      throw new Error(`Unexpected Plugin content query ${name}`)
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'owned-plugin-content',
    hostId: 'owned-host',
    directory: {
      async execute() {
        return { items: [], nextCursor: null }
      },
    },
    extensions,
    surfaces: { canRender: () => true },
  })
  const root = createRoot(element)
  window.releasePluginContent = () => {
    root.unmount()
    runtime.dispose()
  }
  await runtime.ready
  await runtime.view.commands.execute('app.openSettings', {
    scope: 'global',
    section: 'extensions',
    instanceId: 'owned-plugin-settings',
  })
  await runtime.view.commands.execute('extensionWorkspace.refresh', { instanceId: 'owned-plugin-settings' })
  try {
    await runtime.view.commands.execute('extensionWorkspace.inspect', {
      instanceId: 'owned-plugin-settings',
      pluginId: plugin.id,
    })
  } catch (reason) {
    if (input.state !== 'read-error') throw reason
  }
  const base = getShellCopy(input.locale).extensions
  const labels = {
    ...base,
    pagination: {
      ...base.pagination,
      previous: base.pagination.previous + input.suffix,
      next: base.pagination.next + input.suffix,
    },
    detail: {
      ...base.detail,
      commands: base.detail.commands + input.suffix,
      services: base.detail.services + input.suffix,
      requires: base.detail.requires + input.suffix,
      panels: base.detail.panels + input.suffix,
      renderers: base.detail.renderers + input.suffix,
      source: base.detail.source + input.suffix,
      back: base.detail.back + input.suffix,
      retry: base.detail.retry + input.suffix,
      pagination: {
        ...base.detail.pagination,
        previous: base.detail.pagination.previous + input.suffix,
        next: base.detail.pagination.next + input.suffix,
      },
      actions: {
        ...base.detail.actions,
        enable: base.detail.actions.enable + input.suffix,
        disable: base.detail.actions.disable + input.suffix,
        readCurrent: base.detail.actions.readCurrent + input.suffix,
      },
    },
  }
  root.render(
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}>
      <HbarRuntimeProvider view={runtime.view}>
        <HbarExtensionWorkspace
          labels={labels}
          instanceId="owned-plugin-settings"
          connected={input.state !== 'offline'}
        />
      </HbarRuntimeProvider>
    </LumenProvider>,
  )
  window.repairPluginContent = () => {
    failure = false
  }
  window.pluginContentTextBounds = () => {
    const original = {
      id: 'original.command',
      title: 't'.repeat(120),
      description: 'd'.repeat(500),
      usage: 'u'.repeat(300),
      group: 'extensions',
    }
    return {
      title120: terminalContributionSchema.safeParse(original).success,
      title121: terminalContributionSchema.safeParse({ ...original, title: 't'.repeat(121) }).success,
      description500: terminalContributionSchema.safeParse(original).success,
      description501: terminalContributionSchema.safeParse({ ...original, description: 'd'.repeat(501) }).success,
      usage300: terminalContributionSchema.safeParse(original).success,
      usage301: terminalContributionSchema.safeParse({ ...original, usage: 'u'.repeat(301) }).success,
    }
  }
  window.pluginContentState = () => {
    const entry = runtime.view.state.extensions.getSnapshot().entries['owned-plugin-settings']
    return { calls, selected: entry?.selectedPluginId, action: entry?.actions[plugin.id] }
  }
  window.shrinkPluginContent = async () => {
    plugin = pluginInfoSchema.parse({
      ...plugin,
      contributes: { ...plugin.contributes, commands: commands.slice(0, 1) },
    })
    await runtime.view.commands.execute('extensionWorkspace.inspect', {
      instanceId: 'owned-plugin-settings',
      pluginId: plugin.id,
    })
  }
}
