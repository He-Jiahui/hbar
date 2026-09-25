import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  HbarRuntimeProvider,
  HbarSettingsWorkspace,
  type HbarSettingsGroupPresentation,
  type HbarSettingsWorkspaceLabels,
} from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import type { CommandExecutor } from '@hbar/commands'
import { settingsCommands } from '@hbar/contracts/commands/settings'
import type { Session, Workspace } from '@hbar/contracts/directory'
import { HBAR_SETTINGS_DEFINITIONS, HBAR_SETTINGS_DESCRIPTION } from '@hbar/kernel'
import { encodePath, type FieldIssue, type FieldValue } from '@hbar/schema-core'
import { resolveSettings } from '@hbar/settings-core'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { WEB_SETTINGS_GROUP_PRESENTATION } from '../apps/web/src/settings-group-presentation'

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
  controls: '设置控制',
  scopes: '设置作用域',
  hostScope: 'Host 全局设置',
  clientScope: '当前客户端设置',
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

async function readSettingsNavigation(html: string) {
  const result = {
    fixedScope: '',
    scopes: [] as { value: string | null; selected: boolean; disabled: boolean; text: string }[],
    groups: [] as { text: string; current: boolean; icon: string | null; tier: string | null; iconHidden: boolean }[],
  }
  await new HTMLRewriter()
    .on('.hbar-app-react-settings-fixed-scope', {
      text(chunk) {
        result.fixedScope += chunk.text
      },
    })
    .on('select.hbar-app-react-settings-scope option', {
      element(element) {
        result.scopes.push({
          value: element.getAttribute('value'),
          selected: element.hasAttribute('selected'),
          disabled: element.hasAttribute('disabled'),
          text: '',
        })
      },
      text(chunk) {
        const option = result.scopes.at(-1)
        if (option) option.text += chunk.text
      },
    })
    .on('.hbar-app-react-settings-groups button', {
      element(element) {
        result.groups.push({
          text: '',
          current: element.getAttribute('aria-current') === 'page',
          icon: null,
          tier: null,
          iconHidden: false,
        })
      },
      text(chunk) {
        const group = result.groups.at(-1)
        if (group) group.text += chunk.text
      },
    })
    .on('.hbar-app-react-settings-groups button svg', {
      element(element) {
        const group = result.groups.at(-1)
        if (group) {
          group.icon = element.getAttribute('class')
          group.tier = element.getAttribute('data-tier')
          group.iconHidden = element.getAttribute('aria-hidden') === 'true'
        }
      },
    })
    .transform(new Response(html))
    .text()
  return result
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
        <HbarSettingsWorkspace
          labels={labels}
          connected
          headerActions={
            <select aria-label="客户端主题">
              <option>跟随系统</option>
            </select>
          }
        />
      </HbarRuntimeProvider>,
    )
    expect(form.selectedGroup).toBe('model')
    expect(html).toContain('<h1 title="设置"')
    expect(html).toContain('data-variant="title">设置</h1>')
    expect(html).toContain('aria-label="返回会话"')
    expect(html).toContain('设置 workspace Schema 工程')
    expect(html).toContain('模型选择')
    expect(html).toContain('思考等级')
    expect(html).toContain('当前层覆盖')
    expect(html).toContain('恢复继承')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('aria-label="设置作用域"')
    expect(html).toContain('aria-label="设置控制"')
    expect(html).toContain('aria-label="客户端主题"')
    expect(html).toContain('跟随系统')
    expect(html).toContain('workspace · Schema 工程')
    expect(html).not.toContain('默认预算')
    expect(html).not.toContain('settings.get')
  } finally {
    runtime.dispose()
  }
})

test('settings workspace composes client groups from the app.openSettings section', async () => {
  const runtime = createAppRuntime({
    instanceId: 'settings-react-client-group',
    hostId: 'host',
    directory,
    settings,
    surfaces: { canRender: (panelId) => panelId === 'settings' },
  })
  try {
    await runtime.view.commands.execute('workspace.list', { limit: 100 })
    await runtime.view.commands.execute('session.list', { workspaceId: workspace.id, limit: 100 })
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    await runtime.view.commands.execute('app.openSettings', {
      scope: 'session',
      targetId: session.id,
      section: 'appearance',
    })
    await waitForReady(runtime)
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarSettingsWorkspace
          labels={labels}
          connected
          additionalGroups={[{ id: 'appearance', label: '外观', order: 0 }]}
          renderGroup={(groupId) => (groupId === 'appearance' ? <div>设备全局外观</div> : null)}
        />
      </HbarRuntimeProvider>,
    )
    expect(runtime.view.state.settings.getSnapshot().forms['settings:session:session-settings']?.selectedGroup).toBe(
      'model',
    )
    const selectedNavigation = { count: 0, text: '', buttonTypes: [] as (string | null)[] }
    await new HTMLRewriter()
      .on('nav[aria-label="设置分组"] button[aria-current="page"]', {
        element(element) {
          selectedNavigation.count++
          selectedNavigation.buttonTypes.push(element.getAttribute('type'))
        },
        text(chunk) {
          selectedNavigation.text += chunk.text
        },
      })
      .transform(new Response(html))
      .text()
    // Selection belongs to the named navigation control, not its decorative indicator or attribute order.
    expect(selectedNavigation.count).toBe(1)
    expect(selectedNavigation.text).toBe('外观')
    expect(selectedNavigation.buttonTypes).toEqual(['button'])
    expect(html).toContain('设备全局外观')
    expect(html).toContain('<option value="appearance" selected="">外观</option>')
    expect(html).not.toContain('模型选择')
    expect(html).not.toContain('由 Host Schema 生成的设置')
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

test('pinned project settings name their project instead of borrowing the active session scope', async () => {
  const target = { ...workspace, id: 'workspace-pinned', name: 'Pinned 工程，与活动会话不同' }
  const runtime = createAppRuntime({
    instanceId: 'settings-react-pinned',
    hostId: 'host',
    settings,
    directory: {
      execute(name, input, options) {
        if (
          name === 'workspace.get' &&
          input &&
          typeof input === 'object' &&
          'workspaceId' in input &&
          input.workspaceId === target.id
        )
          return Promise.resolve(target)
        return directory.execute(name, input, options)
      },
    },
    surfaces: { canRender: (panelId) => panelId === 'settings' },
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    await runtime.view.commands.execute('workspace.get', { workspaceId: target.id })
    await runtime.view.commands.execute('app.openSettings', {
      scope: 'workspace',
      targetId: target.id,
      workspaceId: target.id,
      binding: 'pinned',
    })
    await waitForReady(runtime)
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarSettingsWorkspace labels={labels} connected />
      </HbarRuntimeProvider>,
    )
    const options: { value: string | null; disabled: boolean; text: string }[] = []
    await new HTMLRewriter()
      .on('select[aria-label="设置作用域"] option', {
        element(element) {
          options.push({ value: element.getAttribute('value'), disabled: element.hasAttribute('disabled'), text: '' })
        },
        text(chunk) {
          const option = options.at(-1)
          if (option) option.text += chunk.text
        },
      })
      .transform(new Response(html))
      .text()
    expect(options.find((option) => option.value === 'workspace')).toMatchObject({
      text: `workspace · ${target.name}`,
      disabled: false,
    })
    expect(options.find((option) => option.value === 'session')).toMatchObject({ text: 'session', disabled: true })
    expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe(session.id)
  } finally {
    runtime.dispose()
  }
})

test.each(['zh-CN', 'en-US'] as const)(
  'fixed settings groups describe their actual scope without changing %s session drafts',
  async (locale) => {
    const copy = getShellCopy(locale)
    const runtime = createAppRuntime({
      instanceId: `settings-group-scopes-${locale}`,
      hostId: 'host',
      directory,
      settings,
      surfaces: { canRender: (panelId) => panelId === 'settings' },
    })
    const render = () =>
      renderToStaticMarkup(
        <HbarRuntimeProvider view={runtime.view}>
          <HbarSettingsWorkspace
            labels={copy.settings}
            connected
            additionalGroups={[
              { id: 'appearance', label: copy.appearance.group, order: 0 },
              { id: 'diagnostics', label: copy.diagnostics.title, order: 90 },
            ]}
            groupPresentation={WEB_SETTINGS_GROUP_PRESENTATION}
            renderGroup={(groupId) =>
              ['appearance', 'providers', 'extensions', 'diagnostics'].includes(groupId) ? (
                <div data-test-group={groupId}>{copy.settings.pageTitle}</div>
              ) : null
            }
          />
        </HbarRuntimeProvider>,
      )
    try {
      await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
      await runtime.view.commands.execute('app.openSettings', { scope: 'session', targetId: session.id })
      const initial = await waitForReady(runtime)
      await runtime.view.commands.execute('settingsForm.setField', {
        formId: initial.formId,
        field: model,
        value: 'unsaved-session-model',
      })
      for (const section of ['providers', 'extensions', 'diagnostics', 'appearance']) {
        await runtime.view.commands.execute('app.openSettings', { scope: 'session', targetId: session.id, section })
        const entry = await waitForReady(runtime)
        const html = render()
        const navigation = await readSettingsNavigation(html)
        expect(navigation.fixedScope).toBe(
          section === 'appearance' ? copy.settings.clientScope : copy.settings.hostScope,
        )
        expect(navigation.scopes).toEqual([])
        expect(html).not.toContain(copy.settings.title('session', session.title))
        expect(entry.formId).toBe(initial.formId)
        expect(entry.scope).toEqual({ kind: 'session', targetId: session.id })
        expect(entry.form?.draft[model]).toBe('unsaved-session-model')
        expect(entry.form?.dirty).toContain(model)
      }
      await runtime.view.commands.execute('app.openSettings', {
        scope: 'session',
        targetId: session.id,
        section: 'model',
      })
      const restored = await waitForReady(runtime)
      const html = render()
      const navigation = await readSettingsNavigation(html)
      expect(navigation.fixedScope).toBe('')
      expect(navigation.scopes.find((option) => option.selected)?.value).toBe('session')
      expect(html).toContain(copy.settings.title('session', session.title))
      expect(restored.formId).toBe(initial.formId)
      expect(restored.form?.draft[model]).toBe('unsaved-session-model')
      expect(restored.form?.dirty).toContain(model)
      expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe(session.id)
      expect(navigation.groups.map((group) => group.text)).toEqual([
        copy.appearance.group,
        copy.settings.resolve('i18n:settings.groups.model'),
        copy.settings.resolve('i18n:settings.groups.session'),
        copy.settings.resolve('i18n:settings.groups.providers'),
        copy.settings.resolve('i18n:settings.groups.extensions'),
        copy.diagnostics.title,
      ])
      for (const [index, glyph] of ['palette', 'cpu', 'message-square', 'server', 'puzzle', 'stethoscope'].entries()) {
        expect(navigation.groups[index]?.icon).toContain(`lucide-${glyph}`)
        expect(navigation.groups[index]?.tier).toBe('md')
        expect(navigation.groups[index]?.iconHidden).toBe(true)
      }
    } finally {
      runtime.dispose()
    }
  },
)

test('settings group metadata preserves long labels and ignores unknown or duplicate presentation IDs', async () => {
  const longLabel = '这是宿主提供的一个很长的设置分组名称，必须完整保留并参与正常文字流'
  const runtime = createAppRuntime({
    instanceId: 'settings-group-metadata',
    hostId: 'host',
    directory,
    settings,
    surfaces: { canRender: (panelId) => panelId === 'settings' },
  })
  const groupPresentation: readonly HbarSettingsGroupPresentation[] = [
    ...WEB_SETTINGS_GROUP_PRESENTATION,
    { id: 'appearance', icon: 'providers', scope: 'host' },
    { id: 'not-registered', icon: 'extensions', scope: 'host' },
  ]
  const render = () =>
    renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarSettingsWorkspace
          labels={labels}
          connected
          additionalGroups={[
            { id: 'appearance', label: longLabel, order: 0 },
            { id: 'appearance', label: '重复项不得覆盖首项', order: 1 },
            { id: 'model', label: '客户端不得覆盖 Host 分组', order: 2 },
            { id: 'future-group', label: '未提供展示元数据的后续分组', order: 50 },
          ]}
          groupPresentation={groupPresentation}
          renderGroup={(groupId) => (groupId === 'appearance' ? <div>{longLabel}</div> : null)}
        />
      </HbarRuntimeProvider>,
    )
  try {
    await runtime.view.commands.execute('app.openSettings', { scope: 'global', section: 'appearance' })
    await waitForReady(runtime)
    const appearance = await readSettingsNavigation(render())
    expect(appearance.fixedScope).toBe(labels.clientScope)
    expect(appearance.groups.filter((group) => group.current).map((group) => group.text)).toEqual([longLabel])
    expect(appearance.groups[0]?.icon).toContain('lucide-palette')
    expect(appearance.groups).toHaveLength(6)
    expect(appearance.groups.map((group) => group.text)).not.toContain('重复项不得覆盖首项')
    expect(appearance.groups.map((group) => group.text)).not.toContain('客户端不得覆盖 Host 分组')
    expect(render()).not.toContain('not-registered')

    await runtime.view.commands.execute('app.openSettings', { scope: 'global', section: 'future-group' })
    const fallback = await readSettingsNavigation(render())
    expect(fallback.fixedScope).toBe('')
    expect(fallback.scopes.find((option) => option.selected)?.value).toBe('global')
    expect(fallback.groups.find((group) => group.current)).toMatchObject({
      text: '未提供展示元数据的后续分组',
      tier: 'md',
      iconHidden: true,
    })
    expect(fallback.groups.find((group) => group.current)?.icon).toContain('lucide-settings')

    await runtime.view.commands.execute('app.openSettings', { scope: 'global', section: 'not-registered' })
    expect(
      (await readSettingsNavigation(render())).groups.filter((group) => group.current).map((group) => group.text),
    ).toEqual(['模型'])
  } finally {
    runtime.dispose()
  }
})

test('pinned workspace drafts return from fixed-scope groups without borrowing the active session', async () => {
  const target = { ...workspace, id: 'workspace-presentation', name: 'Pinned scope 工程' }
  const runtime = createAppRuntime({
    instanceId: 'settings-pinned-presentation',
    hostId: 'host',
    settings,
    directory: {
      execute(name, input, options) {
        if (
          name === 'workspace.get' &&
          input &&
          typeof input === 'object' &&
          'workspaceId' in input &&
          input.workspaceId === target.id
        )
          return Promise.resolve(target)
        return directory.execute(name, input, options)
      },
    },
    surfaces: { canRender: (panelId) => panelId === 'settings' },
  })
  const render = () =>
    renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarSettingsWorkspace labels={labels} connected groupPresentation={WEB_SETTINGS_GROUP_PRESENTATION} />
      </HbarRuntimeProvider>,
    )
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    await runtime.view.commands.execute('workspace.get', { workspaceId: target.id })
    const panel = await runtime.view.commands.execute('app.openSettings', {
      scope: 'workspace',
      targetId: target.id,
      workspaceId: target.id,
      binding: 'pinned',
    })
    const form = await waitForReady(runtime)
    await runtime.view.commands.execute('settingsForm.setField', {
      formId: form.formId,
      field: model,
      value: 'pinned-draft',
    })
    for (const section of ['providers', 'model']) {
      await runtime.view.commands.execute('app.openSettings', {
        scope: 'workspace',
        targetId: target.id,
        workspaceId: target.id,
        binding: 'pinned',
        instanceId: panel.instanceId,
        section,
      })
      const entry = await waitForReady(runtime)
      expect(entry.formId).toBe(form.formId)
      expect(entry.form?.draft[model]).toBe('pinned-draft')
      expect(entry.form?.dirty).toContain(model)
      expect(entry.scope).toEqual({ kind: 'workspace', targetId: target.id })
      const navigation = await readSettingsNavigation(render())
      if (section === 'providers') {
        expect(navigation.fixedScope).toBe(labels.hostScope)
        expect(navigation.scopes).toEqual([])
      } else {
        expect(navigation.scopes.find((option) => option.value === 'workspace')).toMatchObject({
          selected: true,
          text: `workspace · ${target.name}`,
        })
        expect(navigation.scopes.find((option) => option.value === 'session')?.disabled).toBe(true)
      }
    }
    expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe(session.id)
  } finally {
    runtime.dispose()
  }
})
