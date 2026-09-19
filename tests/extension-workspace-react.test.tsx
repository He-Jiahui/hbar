import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarExtensionWorkspace, HbarRuntimeProvider } from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import type { PluginInfo, SkillDescriptor } from '@hbar/contracts/commands/extensions'
import { getShellCopy } from '../apps/web/src/shell-copy'

const plugin: PluginInfo = {
  id: 'browser.playwright',
  packageName: '@hbar/browser-use',
  name: 'Browser use',
  version: '1.0.0',
  required: false,
  status: 'active',
  provides: ['browser'],
  requires: [],
  description: 'Managed browser automation',
  config: {},
  contributes: { commands: [], panels: [], renderers: [] },
}
const skill: SkillDescriptor = { id: 'review-helper', path: 'D:/skills/review-helper', scope: 'global' }

test('extension panel renders Host plugins, skills, and command catalog entry points', async () => {
  const runtime = createAppRuntime({
    instanceId: 'extensions-react',
    hostId: 'host',
    directory: {
      async execute() {
        return { items: [], nextCursor: null }
      },
    },
    extensions: {
      async execute(name: string) {
        if (name === 'plugin.list') return [plugin]
        if (name === 'skill.list') return [skill]
        throw new Error(`Unsupported extension command: ${name}`)
      },
    },
    surfaces: { canRender: (panelId) => panelId === 'extensions' || panelId === 'commands' },
  })
  try {
    const panel = await runtime.view.commands.execute('app.openPanel', { panelId: 'extensions' })
    await runtime.view.commands.execute('extensionWorkspace.refresh', { instanceId: panel.instanceId })
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarExtensionWorkspace labels={getShellCopy('en-US').extensions} connected />
      </HbarRuntimeProvider>,
    )
    expect(html).toContain('Extensions and skills')
    expect(html).toContain('Browser use')
    expect(html).toContain('Managed browser automation')
    expect(html).toContain('review-helper')
    expect(html).toContain('Open related commands')
    expect(html).toContain('Open system and diagnostic commands')
  } finally {
    runtime.dispose()
  }
})
