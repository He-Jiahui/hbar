import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarRuntimeProvider, HbarSettingsWorkspace, type HbarSettingsWorkspaceLabels } from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import type { CommandExecutor } from '@hbar/commands'
import { settingsCommands } from '@hbar/contracts/commands/settings'
import type { Session, Workspace } from '@hbar/contracts/directory'
import { HBAR_SETTINGS_DEFINITIONS, HBAR_SETTINGS_DESCRIPTION } from '@hbar/kernel'
import { encodePath, type FieldIssue, type FieldValue } from '@hbar/schema-core'
import { resolveSettings } from '@hbar/settings-core'

const workspace: Workspace = { id: 'workspace-settings', name: 'Schema 工程', path: 'D:/schema', createdAt: 1 }
const session: Session = {
  id: 'session-settings',
  workspaceId: workspace.id,
  title: 'Schema 会话',
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 2,
  seq: 1,
}
const model = encodePath([{ kind: 'field', name: 'provider.model' }])

const directory: CommandExecutor = {
  execute(name, raw) {
    const input = raw as Record<string, unknown>
    if (name === 'workspace.get') return Promise.resolve(input.workspaceId === workspace.id ? workspace : null)
    if (name === 'session.get') return Promise.resolve(input.sessionId === session.id ? session : null)
    if (name === 'workspace.list') return Promise.resolve({ items: [workspace], nextCursor: null })
    if (name === 'session.list') return Promise.resolve({ items: [session], nextCursor: null })
    return Promise.reject(new Error(`Unexpected directory query: ${name}`))
  },
}

const settings: CommandExecutor = {
  execute(name, raw) {
    if (name === 'settings.describe') return Promise.resolve(HBAR_SETTINGS_DESCRIPTION)
    if (name !== 'settings.get') return Promise.reject(new Error(`Unexpected settings command: ${name}`))
    const scope = settingsCommands[name].input.parse(raw).scope
    const layers =
      scope.kind === 'global'
        ? [{ id: 'settings:global', kind: 'global', revision: 1, values: { [model]: 'global-model' } }]
        : scope.kind === 'workspace'
          ? [
              { id: 'settings:global', kind: 'global', revision: 1, values: { [model]: 'global-model' } },
              {
                id: `settings:workspace:${scope.targetId}`,
                kind: 'workspace',
                revision: 2,
                values: { [model]: 'workspace-model' },
              },
            ]
          : [
              { id: 'settings:global', kind: 'global', revision: 1, values: { [model]: 'global-model' } },
              {
                id: `settings:workspace:${workspace.id}`,
                kind: 'workspace',
                revision: 2,
                values: { [model]: 'workspace-model' },
              },
              { id: `settings:session:${scope.targetId}`, kind: 'session', revision: 0, values: {} },
            ]
    return Promise.resolve(
      settingsCommands[name].output.parse({
        schemaVersion: 1,
        scope,
        revisions: Object.fromEntries(layers.map((layer) => [layer.id, layer.revision])),
        resolution: resolveSettings(HBAR_SETTINGS_DEFINITIONS, layers),
      }),
    )
  },
}

const labels: HbarSettingsWorkspaceLabels = {
  pageTitle: '设置',
  title: (scope, target) => `设置 ${scope}${target ? ` ${target}` : ''}`,
  description: '由 Host Schema 生成的设置',
  back: '返回会话',
  scopes: '设置作用域',
  global: '全局',
  workspace: '工作区',
  session: '会话',
  scopeOption: (scope, target) => `${scope}${target ? ` · ${target}` : ''}`,
  groups: '设置分组',
  loading: '正在加载设置',
  refresh: '刷新',
  save: '保存',
  reconcile: '核对保存结果',
  saved: '已保存',
  unsaved: (count) => `${count} 项未保存`,
  restoreInheritance: '恢复继承',
  localOverride: '当前层覆盖',
  pendingInheritance: '保存后继承',
  inheritedFrom: (source) => `继承自 ${source}`,
  readOnly: '当前作用域只读',
  applyMode: (mode) => `生效方式 ${mode}`,
  error: (code) => `错误 ${code}`,
  resolve: (key) =>
    ({
      'i18n:settings.groups.model': '模型',
      'i18n:settings.groups.session': '会话默认值',
      'i18n:settings.provider.model.label': '模型选择',
      'i18n:settings.provider.model.help': '选择运行模型',
      'i18n:settings.provider.thinkingLevel.label': '思考等级',
      'i18n:settings.provider.thinkingLevel.help': '选择思考强度',
      'i18n:settings.session.defaultBudget.label': '默认预算',
      'i18n:settings.session.defaultBudget.help': '设置默认 token 上限',
    })[key] ?? key,
  form: {
    reset: '恢复已保存值',
    loading: '正在加载选项',
    empty: '没有选项',
    unavailable: (code) => `选项不可用 ${code}`,
    contentError: (code) => `选项错误 ${code}`,
    selectedInvalid: (value: FieldValue) => `当前值 ${String(value)}`,
    issue: (issue: FieldIssue) => `字段错误 ${issue.code}`,
    option: (_field, value: FieldValue) => String(value),
    contentText: (text) => (text.kind === 'literal' ? text.text : text.key),
    pickResource: (kind) => (kind === 'file' ? '选择文件' : '选择文件夹'),
    openOptions: (label) => `打开 ${label}`,
    removeOption: (label) => `移除 ${label}`,
    componentUnavailable: (component) => `组件不可用 ${component}`,
  },
}

async function waitForReady(runtime: ReturnType<typeof createAppRuntime>) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const state = runtime.view.state.settings.getSnapshot()
    const entry = state.activeFormId ? state.forms[state.activeFormId] : undefined
    if (entry?.status === 'ready') return entry
    await Bun.sleep(2)
  }
  throw new Error('Settings form did not become ready')
}

test('settings workspace renders Host schema, scoped source state, and command-owned grouping', async () => {
  const runtime = createAppRuntime({
    instanceId: 'settings-react',
    hostId: 'host',
    directory,
    settings,
    surfaces: { canRender: (panelId) => panelId === 'settings' },
  })
  try {
    await runtime.view.commands.execute('workspace.list', { limit: 100 })
    await runtime.view.commands.execute('session.list', { workspaceId: workspace.id, limit: 100 })
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    await runtime.view.commands.execute('app.openSettings', { scope: 'workspace', targetId: workspace.id })
    const form = await waitForReady(runtime)
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarSettingsWorkspace labels={labels} connected />
      </HbarRuntimeProvider>,
    )
    expect(form.selectedGroup).toBe('model')
    expect(html).toContain('<h1 title="设置">设置</h1>')
    expect(html).toContain('aria-label="返回会话"')
    expect(html).toContain('设置 workspace Schema 工程')
    expect(html).toContain('模型选择')
    expect(html).toContain('思考等级')
    expect(html).toContain('当前层覆盖')
    expect(html).toContain('恢复继承')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('aria-label="设置作用域"')
    expect(html).toContain('workspace · Schema 工程')
    expect(html).not.toContain('默认预算')
    expect(html).not.toContain('settings.get')
  } finally {
    runtime.dispose()
  }
})

test('settings workspace presents one bounded failure when the Host is unavailable', async () => {
  const runtime = createAppRuntime({
    instanceId: 'settings-react-offline',
    hostId: 'host',
    directory,
    settings: { execute: () => Promise.reject(new Error('offline')) },
    surfaces: { canRender: (panelId) => panelId === 'settings' },
  })
  try {
    await runtime.view.commands.execute('app.openSettings', { scope: 'global' })
    for (let attempt = 0; attempt < 100; attempt++) {
      const state = runtime.view.state.settings.getSnapshot()
      const entry = state.activeFormId ? state.forms[state.activeFormId] : undefined
      if (entry?.status === 'error') break
      await Bun.sleep(2)
    }
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarSettingsWorkspace labels={labels} connected={false} />
      </HbarRuntimeProvider>,
    )
    expect(html).toContain('设置 global')
    expect(html.match(/role="alert"/g)).toHaveLength(1)
    expect(html).toContain('错误 EXECUTION_FAILED')
  } finally {
    runtime.dispose()
  }
})
