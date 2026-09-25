import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarProviderDialog, HbarProviderSettings, HbarRuntimeProvider } from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import type { CommandExecutor } from '@hbar/commands'
import { providerSchema } from '@hbar/contracts'
import { HBAR_PROVIDER_EDITOR_DESCRIPTION } from '@hbar/kernel'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { HbarProviderEditorView } from '../packages/app-react/src/lumen-provider-editor'

const configured = providerSchema.parse({
  id: 'visible-provider',
  name: 'Visible provider',
  protocol: 'openai-responses',
  baseUrl: 'https://example.invalid/v1',
  model: 'visible-model',
})

test('advanced provider parameters are collapsed, retain saved values, and disclose invalid model fields', async () => {
  const runtime = createAppRuntime({
    instanceId: 'provider-progressive',
    hostId: 'host',
    directory,
    configuration,
    surfaces: { canRender: (panelId) => panelId === 'settings-editor' },
  })
  try {
    await runtime.view.commands.execute('app.openSettingsEditor', {
      scope: 'global',
      path: 'providers',
      entryId: configured.id,
    })
    const editor = await waitForEditor(runtime)
    const labels = getShellCopy('zh-CN').providers.dialog
    const render = (input = editor) =>
      renderToStaticMarkup(
        <HbarProviderEditorView
          editor={input}
          labels={{
            ...labels,
            advancedModel: '展开这一个模型的上下文容量、输入和输出价格、图像能力及推理等级高级参数',
          }}
          connected
          actionError={null}
          onBack={() => {}}
          onSave={() => {}}
          onReconcile={() => {}}
          onIntent={() => {}}
        />,
      )
    const collapsed = render()
    expect(collapsed.match(/class="hbar-provider-advanced-content" hidden=""/g)).toHaveLength(2)
    expect(collapsed).toContain('展开这一个模型的上下文容量')
    expect(collapsed).toContain(`value="${editor.draft.models[0]?.contextWindow}"`)
    expect(collapsed).toContain(labels.cancel)
    expect(collapsed).toContain(labels.checkConfiguration)
    expect(collapsed).not.toContain('删除供应商')
    const invalid = render({ ...editor, draftIssues: [{ path: 'models.0.contextWindow', code: 'too_small' }] })
    expect(invalid.match(/class="hbar-provider-advanced-content" hidden=""/g)).toHaveLength(1)
    expect(invalid).toContain(labels.validation('models.0.contextWindow', 'too_small'))
    expect(invalid).toContain(labels.modelIssues(editor.draft.models[0]?.name ?? '', 1))
    expect(invalid).toContain(labels.issues(1))
  } finally {
    runtime.dispose()
  }
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
    expect(list).toContain('Manage model connections, defaults, and credentials.')
    expect(list).toContain('Visible provider')
    expect(list).toContain('OpenAI Responses')
    expect(list).toContain('Default: visible-model')
    expect(list).toContain('1 model')
    expect(list).toContain('Credential configured')
    expect(list).toContain('Edit Visible provider')
    expect(list).toContain('Actions for Visible provider')
    expect(list).toContain('role="menuitem"')

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
    expect(dialog).toContain('Connection')
    expect(dialog).toContain('Models')
    expect(dialog).toContain('Model details')
    expect(dialog).toContain('Show in model selection')
    expect(dialog).toContain('API key')
    expect(dialog).toContain('type="password"')
    expect(dialog).toContain('Credential is stored securely')
    expect(dialog).not.toContain('runtime-secret')

    const chinese = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarProviderDialog labels={getShellCopy('zh-CN').providers.dialog} connected />
      </HbarRuntimeProvider>,
    )
    expect(chinese).toContain('编辑供应商 · Visible provider')
    expect(chinese).toContain('连接')
    expect(chinese).toContain('模型详情')
    expect(chinese).toContain('在模型选择中显示')
    expect(chinese).not.toContain('Configure protocol')
  } finally {
    runtime.dispose()
  }
})
