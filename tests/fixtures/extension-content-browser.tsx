import { createRoot } from 'react-dom/client'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import { extensionCommands, pluginInfoSchema, type PluginInfo } from '@hbar/contracts/commands/extensions'
import { HbarRuntimeProvider, HbarExtensionWorkspace } from '@hbar/app-react'
import { LumenProvider, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'

export interface ExtensionContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly suffix: string
  readonly count: number
  readonly collection: 'plugins' | 'skills'
  readonly state: 'ready' | 'read-error' | 'stale-error' | 'duplicates' | 'unknown' | 'offline'
}
declare global {
  interface Window {
    mountExtensionContent(input: ExtensionContentInput): Promise<void>
    releaseExtensionContent(): void
    repairExtensionContent(): void
    mutateExtensionContent(change: 'reverse' | 'shrink' | 'drop-active'): Promise<void>
    extensionContentState(): {
      readonly calls: readonly { readonly name: string; readonly input: unknown }[]
      readonly entry: unknown
    }
    extensionContentBounds(): Readonly<Record<string, boolean>>
  }
}
window.mountExtensionContent = async (input) => {
  const element = document.getElementById('extension-content-fixture')
  if (!element) throw new Error('Missing extension content fixture root')
  const name = (index: number) => `原始插件 ${index} Complete original Plugin record name `.repeat(6)
  let plugins = Array.from({ length: input.collection === 'plugins' ? input.count : 1 }, (_, index) =>
    pluginInfoSchema.parse({
      id: `original-plugin-${index}`,
      name: name(index),
      version: '1.2.3',
      required: false,
      status: 'active',
      provides: [],
      requires: [],
      description: '原始插件记录说明 Original Plugin record description '.repeat(6),
      config: { private: 'owned-private-config-never-displayed' },
      path: `D:/original-plugins/${index}/` + 'original-parent/'.repeat(25),
      contributes: { commands: [], panels: [], renderers: [] },
    }),
  )
  let skills = extensionCommands['skill.list'].output.parse(
    Array.from({ length: input.collection === 'skills' ? input.count : 1 }, (_, index) => ({
      id: `original-skill-${index}-` + '完整技能标识-original-name-'.repeat(4),
      path: `D:/original-skills/${index}/` + 'original-parent/'.repeat(25),
      scope: 'global',
    })),
  )
  let failed = input.state === 'read-error'
  const calls: { name: string; input: unknown }[] = []
  const extensions: CommandExecutor = {
    async execute(command, value) {
      calls.push({ name: command, input: value })
      if (command === 'plugin.list' || command === 'skill.list') {
        if (failed && command === (input.collection === 'plugins' ? 'plugin.list' : 'skill.list'))
          throw new CommandError('DISCONNECTED', 'Owned collection read failed')
        const records = command === 'plugin.list' ? plugins : skills
        if (
          input.state === 'duplicates' &&
          command === (input.collection === 'plugins' ? 'plugin.list' : 'skill.list') &&
          records[0]
        )
          return [...records, records[0]]
        return records
      }
      if (command === 'plugin.inspect') {
        const target = extensionCommands[command].input.parse(value)
        return plugins.find((plugin) => plugin.id === target.id) ?? null
      }
      if (command === 'skill.inspect') {
        const target = extensionCommands[command].input.parse(value)
        const skill = skills.find((skill) => skill.id === target.id)
        return skill
          ? extensionCommands[command].output.parse({
              ...skill,
              displayName: skill.id,
              description: '',
              body: '',
              entryPath: null,
              files: [],
              filesTruncated: false,
              entryTruncated: false,
            })
          : null
      }
      if (command === 'plugin.enable' || command === 'plugin.disable') {
        const target = extensionCommands[command].input.parse(value)
        if (!plugins.some((plugin) => plugin.id === target.id)) throw new Error('A foreign plugin was changed')
        const status: PluginInfo['status'] = command === 'plugin.enable' ? 'active' : 'disabled'
        plugins = plugins.map((plugin) => (plugin.id === target.id ? { ...plugin, status } : plugin))
        if (input.state === 'unknown') throw new CommandError('RESULT_UNKNOWN', 'Owned reply lost')
        return plugins
      }
      throw new Error(`Unexpected extension content query ${command}`)
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'owned-extension-content',
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
  window.releaseExtensionContent = () => {
    root.unmount()
    runtime.dispose()
  }
  await runtime.ready
  await runtime.view.commands.execute('app.openSettings', {
    scope: 'global',
    section: input.collection === 'plugins' ? 'extensions' : 'skills',
    instanceId: 'owned-extension-settings',
  })
  const refresh = () =>
    runtime.view.commands.execute('extensionWorkspace.refresh', {
      instanceId: 'owned-extension-settings',
      collection: input.collection,
    })
  try {
    await refresh()
  } catch (reason) {
    if (input.state !== 'read-error' && input.state !== 'duplicates') throw reason
  }
  if (input.state === 'stale-error') {
    failed = true
    try {
      await refresh()
    } catch {
      /* Original snapshot remains stale. */
    }
  }
  if (input.state === 'unknown') {
    try {
      await runtime.view.commands.execute('extensionWorkspace.setEnabled', {
        instanceId: 'owned-extension-settings',
        pluginId: 'original-plugin-0',
        enabled: false,
      })
    } catch {
      /* Original receipt is unknown. */
    }
  }
  const base = getShellCopy(input.locale).extensions
  const labels = {
    ...base,
    navigation: {
      plugins: {
        title: base.navigation.plugins.title + input.suffix,
        description: base.navigation.plugins.description + input.suffix,
        filter: base.navigation.plugins.filter + input.suffix,
      },
      skills: {
        title: base.navigation.skills.title + input.suffix,
        description: base.navigation.skills.description + input.suffix,
        filter: base.navigation.skills.filter + input.suffix,
      },
    },
    refresh: base.refresh + input.suffix,
    openSystemCommands: base.openSystemCommands + input.suffix,
    clearSearch: base.clearSearch + input.suffix,
    discovered: base.discovered + input.suffix,
    status: {
      active: base.status.active + input.suffix,
      disabled: base.status.disabled + input.suffix,
      failed: base.status.failed + input.suffix,
    },
    collections: {
      plugins: { ...base.collections.plugins, retry: base.collections.plugins.retry + input.suffix },
      skills: { ...base.collections.skills, retry: base.collections.skills.retry + input.suffix },
    },
    detail: {
      ...base.detail,
      actions: { ...base.detail.actions, readCurrent: base.detail.actions.readCurrent + input.suffix },
    },
    pagination: {
      ...base.pagination,
      previous: base.pagination.previous + input.suffix,
      next: base.pagination.next + input.suffix,
    },
  }
  root.render(
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}>
      <HbarRuntimeProvider view={runtime.view}>
        <HbarExtensionWorkspace
          labels={labels}
          instanceId="owned-extension-settings"
          connected={input.state !== 'offline'}
          collection={input.collection}
        />
      </HbarRuntimeProvider>
    </LumenProvider>,
  )
  window.repairExtensionContent = () => {
    failed = false
  }
  window.mutateExtensionContent = async (change) => {
    const entry = runtime.view.state.extensions.getSnapshot().entries['owned-extension-settings']
    if (input.collection === 'plugins')
      plugins =
        change === 'reverse'
          ? [...plugins].reverse()
          : change === 'shrink'
            ? plugins.slice(0, 1)
            : plugins.filter((record) => record.id !== entry?.selectedPluginId)
    else
      skills =
        change === 'reverse'
          ? [...skills].reverse()
          : change === 'shrink'
            ? skills.slice(0, 1)
            : skills.filter((record) => record.id !== entry?.selectedSkillId)
    await refresh()
  }
  window.extensionContentState = () => ({
    calls,
    entry: runtime.view.state.extensions.getSnapshot().entries['owned-extension-settings'],
  })
  window.extensionContentBounds = () => ({
    plugins4096: extensionCommands['plugin.list'].output.safeParse(
      Array.from({ length: 4096 }, (_, index) => ({ ...plugins[0], id: `bound-plugin-${index}` })),
    ).success,
    plugins4097: extensionCommands['plugin.list'].output.safeParse(
      Array.from({ length: 4097 }, (_, index) => ({ ...plugins[0], id: `bound-plugin-${index}` })),
    ).success,
    skills10000: extensionCommands['skill.list'].output.safeParse(
      Array.from({ length: 10000 }, (_, index) => ({
        id: `bound-skill-${index}`,
        path: `D:/bound/${index}`,
        scope: 'global',
      })),
    ).success,
    skills10001: extensionCommands['skill.list'].output.safeParse(
      Array.from({ length: 10001 }, (_, index) => ({
        id: `bound-skill-${index}`,
        path: `D:/bound/${index}`,
        scope: 'global',
      })),
    ).success,
  })
}
