import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { CommandError } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import type { ExtensionWorkspaceActionState, ExtensionWorkspaceDetailState } from '@hbar/app-runtime'
import { HbarExtensionWorkspace, HbarRuntimeProvider } from '@hbar/app-react'
import { ExtensionPluginDetail } from '../packages/app-react/src/extension-plugin-detail'
import { extensionMessages } from '../packages/app-react/src/extension-messages'
import { getShellCopy } from '../apps/web/src/shell-copy'

const detail: ExtensionWorkspaceDetailState = {
  pluginId: 'plugin',
  status: 'ready',
  error: null,
  plugin: {
    id: 'plugin',
    name: 'Plugin',
    version: '1',
    required: false,
    status: 'active',
    provides: [],
    requires: [],
    description: '',
    config: { secret: 'never-render' },
    installScope: 'global',
    runtimeScope: 'host',
  },
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`the real owner projects capacity feedback only into the captured detail, not a different plugin: ${locale}`, async () => {
    if (!detail.plugin) throw new Error('Missing plugin fixture')
    const source = detail.plugin
    const plugins = Array.from({ length: 65 }, (_, index) => ({
      ...source,
      id: `plugin-${index}`,
      name: `Plugin ${index}`,
    }))
    let writes = 0
    const runtime = createAppRuntime({
      instanceId: 'capacity-view',
      hostId: 'host',
      directory: {
        async execute() {
          return { items: [], nextCursor: null }
        },
      },
      extensions: {
        async execute(id, input) {
          if (id === 'plugin.list') return plugins
          if (id === 'skill.list') return []
          if (!input || typeof input !== 'object' || !('id' in input) || typeof input.id !== 'string')
            throw new Error('Expected plugin id')
          if (id === 'plugin.inspect') return plugins.find((plugin) => plugin.id === input.id) ?? null
          writes++
          throw new CommandError('RESULT_UNKNOWN', 'Uncertain fixture reply')
        },
      },
      surfaces: { canRender: () => true },
    })
    const labels = getShellCopy(locale).extensions
    const html = () =>
      renderToStaticMarkup(
        <HbarRuntimeProvider view={runtime.view}>
          <HbarExtensionWorkspace labels={labels} connected instanceId="settings" />
        </HbarRuntimeProvider>,
      )
    try {
      await runtime.view.commands.execute('app.openSettings', {
        scope: 'global',
        section: 'extensions',
        instanceId: 'settings',
      })
      await runtime.view.commands.execute('extensionWorkspace.refresh', { instanceId: 'settings' })
      for (let index = 0; index < 64; index++)
        await expect(
          runtime.view.commands.execute('extensionWorkspace.setEnabled', {
            instanceId: 'settings',
            pluginId: `plugin-${index}`,
            enabled: false,
          }),
        ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
      await runtime.view.commands.execute('extensionWorkspace.inspect', {
        instanceId: 'settings',
        pluginId: 'plugin-64',
      })
      await expect(
        runtime.view.commands.execute('extensionWorkspace.setEnabled', {
          instanceId: 'settings',
          pluginId: 'plugin-64',
          enabled: false,
        }),
      ).rejects.toMatchObject({ code: 'CAPACITY_EXCEEDED' })
      const rejected = html()
      const visibleDetail = rejected.slice(rejected.indexOf('class="hbar-app-react-plugin-detail"'))
      expect(visibleDetail).toContain('Plugin 64')
      expect(visibleDetail).toContain('role="alert"')
      expect(visibleDetail).toContain(labels.detail.actions.error('CAPACITY_EXCEEDED'))
      expect(visibleDetail).not.toContain(labels.detail.actions.error('BUSY'))
      expect(writes).toBe(64)
      expect(Object.keys(runtime.view.state.extensions.getSnapshot().entries.settings?.actions ?? {})).toHaveLength(64)
      await runtime.view.commands.execute('extensionWorkspace.inspect', {
        instanceId: 'settings',
        pluginId: 'plugin-0',
      })
      const other = html()
      expect(other).not.toContain(labels.detail.actions.error('CAPACITY_EXCEEDED'))
      expect(other).toContain(labels.detail.actions.unknown)
      expect(writes).toBe(64)
    } finally {
      runtime.dispose()
    }
  })
  test(`local capacity rejection is visible without a fabricated Host busy reason: ${locale}`, () => {
    const labels = getShellCopy(locale).extensions.detail
    const html = renderToStaticMarkup(
      <extensionMessages.Provider messages={getShellCopy(locale).extensions}>
        <ExtensionPluginDetail
        detail={detail}
        connected
        action={undefined}
        refreshing={false}
        operationError="CAPACITY_EXCEEDED"
        onBack={() => {}}
        onRetry={() => {}}
        onSetEnabled={() => {}}
        />
      </extensionMessages.Provider>,
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain(labels.actions.error('CAPACITY_EXCEEDED'))
    expect(html).not.toContain(labels.actions.error('BUSY'))
    expect(html).not.toContain(labels.actions.confirmed)
  })
  test(`activation controls are near real scope facts and do not claim contribution execution: ${locale}`, () => {
    const labels = getShellCopy(locale).extensions.detail
    const html = renderToStaticMarkup(
      <extensionMessages.Provider messages={getShellCopy(locale).extensions}>
        <ExtensionPluginDetail
        detail={detail}
        connected
        action={undefined}
        refreshing={false}
        onBack={() => {}}
        onRetry={() => {}}
        onSetEnabled={() => {}}
        />
      </extensionMessages.Provider>,
    )
    expect(html).toContain(labels.actions.disable)
    expect(html).toContain(labels.actions.scope)
    expect(html).toContain(labels.installScope.global)
    expect(html).toContain(labels.runtimeScope.host)
    expect(html.indexOf('hbar-app-react-plugin-actions')).toBeGreaterThan(
      html.indexOf('hbar-app-react-plugin-detail-summary'),
    )
    expect(html).not.toContain('never-render')
  })
  for (const status of ['submitting', 'succeeded', 'failed', 'unknown'] as const) {
    test(`typed activation feedback ${status} is local and unknown cannot offer another write: ${locale}`, () => {
      const labels = getShellCopy(locale).extensions.detail
      const action: ExtensionWorkspaceActionState = { status, error: status === 'failed' ? 'BUSY' : null }
      const html = renderToStaticMarkup(
        <extensionMessages.Provider messages={getShellCopy(locale).extensions}>
          <ExtensionPluginDetail
          detail={detail}
          connected
          action={action}
          refreshing={false}
          onBack={() => {}}
          onRetry={() => {}}
          onSetEnabled={() => {}}
          />
        </extensionMessages.Provider>,
      )
      if (status === 'submitting') {
        expect(html).toContain(labels.actions.pending)
        expect(html).toContain('aria-busy="true"')
        expect(html).toContain('disabled=""')
      }
      if (status === 'succeeded') expect(html).toContain(labels.actions.confirmed)
      if (status === 'failed') {
        expect(html).toContain('role="alert"')
        expect(html).toContain(labels.actions.error('BUSY'))
        expect(html).toContain(labels.actions.disable)
      }
      if (status === 'unknown') {
        expect(html).toContain(labels.actions.unknown)
        expect(html).toContain(labels.actions.readCurrent)
        expect(html).not.toContain(labels.actions.disable)
        expect(html).not.toContain(labels.actions.enable)
        expect(html).not.toContain(labels.actions.confirmed)
      }
      expect(html).toContain(labels.back)
    })
  }
  test(`required and offline boundaries retain named Back and long host-owned labels: ${locale}`, () => {
    const original = getShellCopy(locale).extensions.detail
    const labels = {
      ...original,
      actions: { ...original.actions, scope: `${original.actions.scope} ${'Long host-owned text '.repeat(20)}` },
    }
    const html = renderToStaticMarkup(
      <extensionMessages.Provider messages={{ ...getShellCopy(locale).extensions, detail: labels }}>
        <ExtensionPluginDetail
        detail={{ ...detail, plugin: detail.plugin ? { ...detail.plugin, required: true } : null }}
        connected={false}
        action={undefined}
        refreshing={false}
        onBack={() => {}}
        onRetry={() => {}}
        onSetEnabled={() => {}}
        />
      </extensionMessages.Provider>,
    )
    expect(html).toContain(labels.actions.scope)
    expect(html).toContain(labels.required)
    expect(html).not.toContain(labels.actions.disable)
    expect(html).toContain(labels.back)
    expect(html).toContain('disabled=""')
  })
}
