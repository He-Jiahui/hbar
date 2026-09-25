import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarExtensionWorkspace, HbarRuntimeProvider } from '@hbar/app-react'
import { createAppRuntime, EXTENSION_PAGE_SIZE, extensionWorkspacePage } from '@hbar/app-runtime'
import { CommandError } from '@hbar/commands'
import type { PluginInfo } from '@hbar/contracts/commands/extensions'
import { getShellCopy } from '../apps/web/src/shell-copy'

const plugin = (index = 0): PluginInfo => ({
  id: `plugin-${index}`,
  name: `Review plugin ${index}`,
  version: '1.0.0',
  required: index === 0,
  status: 'active',
  description: 'Review capabilities',
  config: { apiKey: 'never-display-this-secret' },
  provides: ['review'],
  requires: ['workspace'],
  packageName: `@fixture/plugin-${index}`,
  installScope: 'global',
  runtimeScope: 'host',
  contributes: {
    commands: Array.from({ length: 21 }, (_, command) => ({
      id: `review.${command}`,
      title: `Review command ${command}`,
      description: `Description ${command}`,
      usage: `/review.${command}`,
      group: 'extensions' as const,
    })),
    panels: [{ id: 'review.panel', title: 'Review panel', privateField: 'do-not-render-arbitrary-records' }],
    renderers: [{ id: 'review.renderer' }],
  },
})

function fixture(plugins: PluginInfo[] = [plugin()], inspect?: (id: string) => Promise<PluginInfo | null>) {
  const reads: string[] = []
  const runtime = createAppRuntime({
    instanceId: 'detail-test',
    hostId: 'host',
    directory: {
      async execute() {
        return { items: [], nextCursor: null }
      },
    },
    extensions: {
      async execute(name, input) {
        if (name === 'plugin.list') return plugins
        if (name === 'skill.list') return []
        if (
          name === 'plugin.inspect' &&
          input &&
          typeof input === 'object' &&
          'id' in input &&
          typeof input.id === 'string'
        ) {
          reads.push(input.id)
          return inspect ? inspect(input.id) : (plugins.find((plugin) => plugin.id === input.id) ?? null)
        }
        throw new CommandError('UNSUPPORTED', name)
      },
    },
    surfaces: { canRender: () => true },
  })
  return {
    runtime,
    reads,
    async open(instanceId = 'settings') {
      await runtime.view.commands.execute('app.openSettings', {
        scope: 'global',
        section: 'extensions',
        instanceId,
        binding: 'pinned',
        workspaceId: 'workspace-b',
      })
      await runtime.view.commands.execute('extensionWorkspace.refresh', { instanceId })
      return instanceId
    },
    entry() {
      const value = runtime.view.state.extensions.getSnapshot().entries.settings
      if (!value) throw new Error('Expected extension entry')
      return value
    },
  }
}

test('detail uses inspect, preserves filtered page and pinned target, and returns without navigating', async () => {
  const value = fixture(Array.from({ length: 41 }, (_, index) => plugin(index)))
  try {
    const instanceId = await value.open()
    await value.runtime.view.commands.execute('extensionWorkspace.setQuery', { instanceId, query: 'Review plugin' })
    await value.runtime.view.commands.execute('extensionWorkspace.setPage', {
      instanceId,
      collection: 'plugins',
      page: 1,
    })
    const original = value.runtime.view.state.surfaces.getSnapshot().panels.settings
    await value.runtime.view.commands.execute('extensionWorkspace.inspect', { instanceId, pluginId: 'plugin-25' })
    expect(value.reads).toEqual(['plugin-25'])
    expect(value.entry().detail).toMatchObject({ pluginId: 'plugin-25', status: 'ready', plugin: { id: 'plugin-25' } })
    await value.runtime.view.commands.execute('extensionWorkspace.back', { instanceId })
    expect(value.entry()).toMatchObject({
      query: 'Review plugin',
      pluginPage: 1,
      selectedPluginId: 'plugin-25',
      detail: null,
    })
    expect(extensionWorkspacePage(value.entry()).plugins[5]?.id).toBe('plugin-25')
    expect(value.runtime.view.state.surfaces.getSnapshot().panels.settings).toBe(original)
    expect(value.runtime.view.state.presentation.getSnapshot().page).toEqual({ kind: 'settings', instanceId })
  } finally {
    value.runtime.dispose()
  }
})

test('detail read failure is local and retry binds the same plugin; absent inspect data is not an empty success', async () => {
  let attempt = 0
  const value = fixture([plugin()], async () => {
    attempt += 1
    if (attempt === 1) throw new CommandError('DISCONNECTED', 'offline')
    return attempt === 2 ? plugin() : null
  })
  try {
    const instanceId = await value.open()
    await expect(
      value.runtime.view.commands.execute('extensionWorkspace.inspect', { instanceId, pluginId: 'plugin-0' }),
    ).rejects.toMatchObject({ code: 'DISCONNECTED' })
    expect(value.entry()).toMatchObject({
      status: 'ready',
      detail: { status: 'error', error: 'DISCONNECTED', plugin: null },
    })
    await value.runtime.view.commands.execute('extensionWorkspace.inspect', { instanceId, pluginId: 'plugin-0' })
    expect(value.entry().detail?.status).toBe('ready')
    await value.runtime.view.commands.execute('extensionWorkspace.inspect', { instanceId, pluginId: 'plugin-0' })
    expect(value.entry().detail).toMatchObject({ status: 'missing', plugin: null })
    expect(value.reads).toEqual(['plugin-0', 'plugin-0', 'plugin-0'])
  } finally {
    value.runtime.dispose()
  }
})

test('duplicate clicks are single flight and late A cannot cover B or reopen the list', async () => {
  const pending = Promise.withResolvers<PluginInfo | null>()
  const value = fixture([plugin(), plugin(1)], async (id) => (id === 'plugin-0' ? pending.promise : plugin(1)))
  try {
    const instanceId = await value.open()
    const first = value.runtime.view.commands
      .execute('extensionWorkspace.inspect', { instanceId, pluginId: 'plugin-0' })
      .catch((reason: unknown) => reason)
    await value.runtime.view.commands.execute('extensionWorkspace.inspect', { instanceId, pluginId: 'plugin-0' })
    expect(value.reads).toEqual(['plugin-0'])
    await value.runtime.view.commands.execute('extensionWorkspace.inspect', { instanceId, pluginId: 'plugin-1' })
    pending.resolve(plugin())
    expect(await first).toMatchObject({ code: 'CANCELLED' })
    expect(value.entry().detail).toMatchObject({ pluginId: 'plugin-1', plugin: { id: 'plugin-1' } })
    await value.runtime.view.commands.execute('extensionWorkspace.back', { instanceId })
    expect(value.entry().detail).toBeNull()
  } finally {
    pending.resolve(null)
    value.runtime.dispose()
  }
})

for (const action of ['back', 'leave', 'retarget', 'close', 'dispose'] as const)
  test(`pending plugin detail ignores late response after ${action}`, async () => {
    const pending = Promise.withResolvers<PluginInfo | null>()
    const value = fixture([plugin()], () => pending.promise)
    try {
      const instanceId = await value.open()
      const result = value.runtime.view.commands
        .execute('extensionWorkspace.inspect', { instanceId, pluginId: 'plugin-0' })
        .catch((reason: unknown) => reason)
      if (action === 'back') await value.runtime.view.commands.execute('extensionWorkspace.back', { instanceId })
      if (action === 'leave') await value.runtime.view.commands.execute('app.back', {})
      if (action === 'retarget')
        await value.runtime.view.commands.execute('app.openSettings', {
          instanceId,
          scope: 'global',
          section: 'providers',
        })
      if (action === 'close') await value.runtime.view.commands.execute('app.closePanel', { instanceId })
      if (action === 'dispose') value.runtime.dispose()
      const original = value.runtime.view.state.extensions.getSnapshot()
      pending.resolve(plugin())
      expect(await result).toMatchObject({ code: action === 'dispose' ? 'RESULT_UNKNOWN' : 'CANCELLED' })
      expect(value.runtime.view.state.extensions.getSnapshot()).toBe(original)
    } finally {
      pending.resolve(null)
      value.runtime.dispose()
    }
  })

test('inspect rejects an unlisted identity or mismatched response and duplicate list identities', async () => {
  const value = fixture([plugin()], async () => plugin(9))
  try {
    const instanceId = await value.open()
    await expect(
      value.runtime.view.commands.execute('extensionWorkspace.inspect', { instanceId, pluginId: 'gone' }),
    ).rejects.toMatchObject({ code: 'COMMAND_NOT_FOUND' })
    expect(value.reads).toHaveLength(0)
    await expect(
      value.runtime.view.commands.execute('extensionWorkspace.inspect', { instanceId, pluginId: 'plugin-0' }),
    ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
    expect(value.entry().detail).toMatchObject({ status: 'error', plugin: null })
  } finally {
    value.runtime.dispose()
  }
  const duplicates = fixture([plugin(), plugin()])
  try {
    await expect(duplicates.open()).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
  } finally {
    duplicates.runtime.dispose()
  }
})

test('global skills are paged separately and not attributed to any plugin', async () => {
  const value = createAppRuntime({
    instanceId: 'global-skill-pages',
    hostId: 'host',
    directory: {
      async execute() {
        return { items: [], nextCursor: null }
      },
    },
    extensions: {
      async execute(name) {
        if (name === 'plugin.list') return [plugin()]
        if (name === 'skill.list')
          return Array.from({ length: 10_000 }, (_, index) => ({
            id: `skill-${index}`,
            path: `/fixtures/skills/${index}`,
            scope: 'global',
          }))
        throw new CommandError('UNSUPPORTED', name)
      },
    },
    surfaces: { canRender: () => true },
  })
  try {
    const instanceId = 'settings'
    await value.view.commands.execute('app.openSettings', { scope: 'global', section: 'extensions' })
    await value.view.commands.execute('extensionWorkspace.refresh', { instanceId })
    const entry = () => value.view.state.extensions.getSnapshot().entries.settings!
    expect(extensionWorkspacePage(entry()).skills).toHaveLength(20)
    await value.view.commands.execute('extensionWorkspace.setPage', { instanceId, collection: 'skills', page: 499 })
    expect(extensionWorkspacePage(entry()).skills[0]?.id).toBe('skill-9980')
    await value.view.commands.execute('extensionWorkspace.setQuery', { instanceId, query: 'skill-9999' })
    expect(extensionWorkspacePage(entry())).toMatchObject({
      skillCount: 1,
      skills: [{ id: 'skill-9999' }],
      pluginCount: 0,
      pluginPage: 0,
      skillPage: 0,
    })
  } finally {
    value.dispose()
  }
})

test('rapidly changing plugin reads stay within the eight-request bound and recover when the reads settle', async () => {
  const pending = Promise.withResolvers<PluginInfo | null>()
  const value = fixture([plugin()], () => pending.promise)
  try {
    const instanceId = await value.open()
    const reads: Promise<unknown>[] = []
    for (let index = 0; index < 8; index += 1) {
      reads.push(
        value.runtime.view.commands
          .execute('extensionWorkspace.inspect', { instanceId, pluginId: 'plugin-0' })
          .catch((reason: unknown) => reason),
      )
      await value.runtime.view.commands.execute('extensionWorkspace.back', { instanceId })
    }
    await expect(
      value.runtime.view.commands.execute('extensionWorkspace.inspect', { instanceId, pluginId: 'plugin-0' }),
    ).rejects.toMatchObject({ code: 'BUSY' })
    expect(value.reads).toHaveLength(8)
    expect(value.entry().detail).toMatchObject({ status: 'error', error: 'BUSY' })
    pending.resolve(plugin())
    await Promise.all(reads)
    await value.runtime.view.commands.execute('extensionWorkspace.inspect', { instanceId, pluginId: 'plugin-0' })
    expect(value.entry().detail).toMatchObject({ status: 'ready', plugin: { id: 'plugin-0' } })
  } finally {
    pending.resolve(null)
    value.runtime.dispose()
  }
})

for (const count of [0, 1, 5, EXTENSION_PAGE_SIZE, EXTENSION_PAGE_SIZE + 1])
  test(`extension pages bound ${count} records and clamp stale page after filtering`, async () => {
    const value = fixture(Array.from({ length: count }, (_, index) => plugin(index)))
    try {
      const instanceId = await value.open()
      expect(extensionWorkspacePage(value.entry()).plugins).toHaveLength(Math.min(count, EXTENSION_PAGE_SIZE))
      await value.runtime.view.commands.execute('extensionWorkspace.setPage', {
        instanceId,
        collection: 'plugins',
        page: 499,
      })
      expect(extensionWorkspacePage(value.entry()).pluginPage).toBe(count > EXTENSION_PAGE_SIZE ? 1 : 0)
      await value.runtime.view.commands.execute('extensionWorkspace.setQuery', { instanceId, query: 'unmatched' })
      expect(extensionWorkspacePage(value.entry())).toMatchObject({ pluginPage: 0, pluginCount: 0, plugins: [] })
      await expect(
        value.runtime.view.commands.execute('extensionWorkspace.setQuery', { instanceId, query: 'x'.repeat(201) }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    } finally {
      value.runtime.dispose()
    }
  })

for (const locale of ['en-US', 'zh-CN'] as const)
  test(`detail renders real contribution facts and required/read-only reasons without config: ${locale}`, async () => {
    const value = fixture()
    try {
      const instanceId = await value.open()
      await value.runtime.view.commands.execute('extensionWorkspace.inspect', { instanceId, pluginId: 'plugin-0' })
      const labels = getShellCopy(locale).extensions
      const longBack = `${labels.detail.back} ${'很长的返回文字 '.repeat(12)}`
      const html = renderToStaticMarkup(
        <HbarRuntimeProvider view={value.runtime.view}>
          <HbarExtensionWorkspace
            connected
            instanceId={instanceId}
            labels={{ ...labels, detail: { ...labels.detail, back: longBack } }}
          />
        </HbarRuntimeProvider>,
      )
      expect(html).toContain(labels.detail.required)
      expect(html).toContain(labels.detail.readOnly)
      expect(html).toContain(longBack)
      expect(html).toContain('Review command 0')
      expect(html).toContain('Review command 19')
      expect(html).not.toContain('Review command 20')
      expect(html).toContain(labels.detail.pagination.page(1, 2, 21))
      expect(html).toContain('review.panel')
      expect(html).toContain('review.renderer')
      expect(html).not.toContain('never-display-this-secret')
      expect(html).not.toContain('do-not-render-arbitrary-records')
      expect(html).not.toContain('Open related commands')
    } finally {
      value.runtime.dispose()
    }
  })
