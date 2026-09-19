import { expect, test } from 'bun:test'
import { CommandError } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import type { PluginInfo, SkillDescriptor } from '@hbar/contracts/commands/extensions'

const plugin = (status: PluginInfo['status']): PluginInfo => ({
  id: 'browser.playwright',
  packageName: '@hbar/browser-use',
  name: 'Browser use',
  version: '1.0.0',
  required: false,
  status,
  provides: ['browser'],
  requires: [],
  description: 'Managed browser automation',
  config: {},
  contributes: { commands: [], panels: [], renderers: [] },
})
const skill: SkillDescriptor = { id: 'review-helper', path: 'D:/skills/review-helper', scope: 'global' }

test('extension workspace lists Host extensions and reconciles an unknown lifecycle mutation', async () => {
  let plugins = [plugin('active')]
  let disableAttempts = 0
  const runtime = createAppRuntime({
    instanceId: 'extensions',
    hostId: 'host',
    directory: {
      async execute() {
        return { items: [], nextCursor: null }
      },
    },
    extensions: {
      async execute(name: string) {
        if (name === 'plugin.list') return plugins
        if (name === 'skill.list') return [skill]
        if (name === 'plugin.disable') {
          disableAttempts += 1
          plugins = [plugin('disabled')]
          if (disableAttempts === 1) throw new CommandError('RESULT_UNKNOWN', 'response lost')
          return plugins
        }
        throw new Error(`Unsupported extension command: ${name}`)
      },
    },
    surfaces: { canRender: (panelId) => panelId === 'settings' },
  })
  try {
    const panel = await runtime.view.commands.execute('app.openPanel', { panelId: 'extensions' })
    expect(panel).toMatchObject({ instanceId: 'settings', panelId: 'settings' })
    expect(runtime.view.state.presentation.getSnapshot().page).toEqual({ kind: 'settings', instanceId: 'settings' })
    expect(runtime.view.state.surfaces.getSnapshot().panels.settings?.params).toEqual({
      scope: 'global',
      section: 'extensions',
    })
    await runtime.view.commands.execute('extensionWorkspace.refresh', { instanceId: panel.instanceId })
    expect(runtime.view.state.extensions.getSnapshot().entries[panel.instanceId]).toMatchObject({
      status: 'ready',
      plugins: [{ id: 'browser.playwright', status: 'active' }],
      skills: [{ id: 'review-helper' }],
    })

    await expect(
      runtime.view.commands.execute('extensionWorkspace.setEnabled', {
        instanceId: panel.instanceId,
        pluginId: 'browser.playwright',
        enabled: false,
      }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(
      runtime.view.state.extensions.getSnapshot().entries[panel.instanceId]!.actions['browser.playwright'],
    ).toMatchObject({
      status: 'unknown',
    })
    await runtime.view.commands.execute('extensionWorkspace.refresh', { instanceId: panel.instanceId })
    expect(runtime.view.state.extensions.getSnapshot().entries[panel.instanceId]).toMatchObject({
      plugins: [{ status: 'disabled' }],
      actions: {},
    })
  } finally {
    runtime.dispose()
  }
})
