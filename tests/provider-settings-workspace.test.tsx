import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarProviderDialog, HbarProviderSettings, HbarRuntimeProvider } from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import type { CommandExecutor } from '@hbar/commands'
import { providerSchema } from '@hbar/contracts'
import { HBAR_PROVIDER_EDITOR_DESCRIPTION } from '@hbar/kernel'
import { getShellCopy } from '../apps/web/src/shell-copy'

const configured = providerSchema.parse({
  id: 'visible-provider',
  name: 'Visible provider',
  protocol: 'openai-responses',
  baseUrl: 'https://example.invalid/v1',
  model: 'visible-model',
})
const directory: CommandExecutor = {
  execute(name) {
    if (name === 'workspace.list' || name === 'session.list') return Promise.resolve({ items: [], nextCursor: null })
    if (name === 'workspace.get' || name === 'session.get') return Promise.resolve(null)
    return Promise.reject(new Error(`Unexpected directory query: ${name}`))
  },
}
const configuration: CommandExecutor = {
  execute(name) {
    if (name === 'provider.describe') return Promise.resolve(HBAR_PROVIDER_EDITOR_DESCRIPTION)
    if (name === 'provider.list') return Promise.resolve([{ provider: configured, hasKey: true }])
    return Promise.reject(new Error(`Unexpected provider command: ${name}`))
  },
}

async function waitForEditor(runtime: ReturnType<typeof createAppRuntime>) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const editor = runtime.view.state.providers.getSnapshot().editor
    if (editor) return editor
    await Bun.sleep(2)
  }
  throw new Error('Provider editor did not load')
}

test('provider list and dialog render Host descriptions without exposing a credential', async () => {
  const runtime = createAppRuntime({
    instanceId: 'provider-react',
    hostId: 'host',
    directory,
    configuration,
    surfaces: { canRender: (panelId) => panelId === 'settings-editor' },
  })
  const copy = getShellCopy('en-US')
  try {
    await runtime.view.commands.execute('providerEditor.refresh', {})
    const list = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarProviderSettings labels={copy.providers.list} connected />
      </HbarRuntimeProvider>,
    )
    expect(list).toContain('Provider configurations')
    expect(list).toContain('Visible provider')
    expect(list).toContain('credential configured')
    expect(list).toContain('Edit Visible provider')

    await runtime.view.commands.execute('app.openSettingsEditor', {
      scope: 'global',
      path: 'providers',
      entryId: configured.id,
    })
    await waitForEditor(runtime)
    const dialog = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarProviderDialog labels={copy.providers.dialog} connected />
      </HbarRuntimeProvider>,
    )
    expect(dialog).toContain('Edit provider · Visible provider')
    expect(dialog).toContain('Provider ID')
    expect(dialog).toContain('API key')
    expect(dialog).toContain('type="password"')
    expect(dialog).toContain('Credential is stored securely')
    expect(dialog).not.toContain('runtime-secret')
  } finally {
    runtime.dispose()
  }
})
