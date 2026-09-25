import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarRuntimeProvider, HbarWorkspaceShell, type HbarWorkspaceShellLabels } from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError } from '@hbar/commands'

const workspace = { id: 'workspace-1', path: 'D:/workspace', name: '非常长的工程名称', createdAt: 1 }
const session = {
  id: 'session-1',
  workspaceId: workspace.id,
  title: '需要键盘导航的会话',
  archived: false,
  parentId: null,
  createdAt: 2,
  updatedAt: 3,
  seq: 0,
}

const labels: HbarWorkspaceShellLabels = {
  main: '工作台主区域',
  brand: 'hbar 测试',
  projectsAndSessions: '工程与会话树',
  noWorkspaces: '没有工程',
  noSessions: '没有会话',
  loading: '正在加载数据',
  loadMore: '加载下一页',
  newSession: '新建会话',
  creatingSession: '正在为所选项目创建会话',
  creationUnknown: '操作结果尚未确认，请核对原项目中的结果',
  reconcileCreation: '核对结果',
  chooseWorkspace: '选择本次新会话所属的项目',
  chooseWorkspaceDescription: '选择已经打开的项目，或添加连接服务端中的现有目录',
  workspacePath: '服务端项目目录',
  workspacePathHint: '填写服务端上已经存在的目录，不是浏览器上传文件',
  addWorkspace: '添加项目',
  openingWorkspace: '正在打开项目',
  cancel: '取消',
  createSessionInWorkspace: (name) => `在 ${name} 中创建新会话`,
  commands: '打开命令目录',
  commandShortcut: 'Ctrl K',
  openWorkspace: '打开工作区',
  status: '打开状态中心',
  settings: '打开设置',
  server: '服务端连接',
  connected: '已经连接',
  pairing: '等待配对',
  disconnected: '连接断开',
  reconnect: '重新连接服务端',
  showSidebar: '显示侧栏',
  hideSidebar: '隐藏侧栏',
  expandWorkspace: (name) => `展开 ${name}`,
  collapseWorkspace: (name) => `折叠 ${name}`,
  workspaceActions: (name) => `${name} 的工程操作`,
  newSessionInWorkspace: '在该工程新建会话',
  workspaceFiles: '查看该工程的文件',
  workspaceSettings: '查看并编辑此工作区的设置与覆盖值',
  openSession: (name) => `选择 ${name}`,
  sessionUpdatedAt: (timestamp) => `更新于 ${timestamp}`,
  sessionActions: (name) => `${name} 的操作`,
  renameSession: '重命名会话',
  renameEditor: {
    form: (title) => `重命名原会话 ${title}`,
    title: '会话标题',
    save: '确认保存会话标题',
    cancel: '取消并保留原有会话标题',
    saving: '正在保存标题',
    saved: '标题已保存',
    unknown: '保存结果尚未确认，请核对原会话',
    reconcile: '核对原会话标题',
    checking: '正在核对标题',
    error: (code) => `标题操作错误 ${code}`,
  },
  archiveSession: '归档会话',
  error: (code) => `错误 ${code}`,
}

function runtimeFixture(instanceId = 'react-test') {
  return createAppRuntime({
    instanceId,
    hostId: 'host-test',
    surfaces: { canRender: () => true },
    directory: {
      async execute(name, input) {
        if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
        if (name === 'workspace.get')
          return (input as { workspaceId: string }).workspaceId === workspace.id ? workspace : null
        if (name === 'session.list') return { items: [session], nextCursor: null }
        if (name === 'session.get') return (input as { sessionId: string }).sessionId === session.id ? session : null
        throw new Error(`Unsupported query: ${name}`)
      },
    },
  })
}

test('app-react renders host-owned workspace and session content from read-only runtime state', async () => {
  const runtime = runtimeFixture()
  try {
    await runtime.view.commands.execute('workspace.list', { limit: 100 })
    await runtime.view.commands.execute('session.list', { workspaceId: workspace.id, limit: 100 })
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarWorkspaceShell
          labels={labels}
          sidebarWidthRem={17}
          toolWidthRem={26}
          connection="connected"
          onReconnect={() => {}}
        >
          <h1>宿主主内容</h1>
        </HbarWorkspaceShell>
      </HbarRuntimeProvider>,
    )
    expect(html).toContain('非常长的工程名称')
    expect(html).toContain('需要键盘导航的会话')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('打开命令目录')
    expect(html).toContain('打开工作区')
    expect(html).toContain('打开状态中心')
    expect(html).toContain('打开设置')
    expect(html).toContain('已经连接')
    expect(html).toContain('非常长的工程名称 的工程操作')
    expect(html).toContain('在该工程新建会话')
    expect(html).toContain(labels.workspaceFiles)
    expect(html).toContain(labels.workspaceSettings)
    expect(html).toContain('需要键盘导航的会话 的操作')
    expect(html).toContain('重命名会话')
    expect(html).toContain('归档会话')
    expect(html).toContain('--lumen-tool-size:26rem')
    expect(html).not.toContain('Workspace 1')
  } finally {
    runtime.dispose()
  }
})

test('separate React runtime providers keep each window selection private', async () => {
  const selected = runtimeFixture('selected-window')
  const idle = runtimeFixture('idle-window')
  try {
    for (const runtime of [selected, idle]) {
      await runtime.view.commands.execute('workspace.list', { limit: 100 })
      await runtime.view.commands.execute('session.list', { workspaceId: workspace.id, limit: 100 })
    }
    await selected.view.commands.execute('app.setSession', { sessionId: session.id })

    const render = (runtime: ReturnType<typeof runtimeFixture>) =>
      renderToStaticMarkup(
        <HbarRuntimeProvider view={runtime.view}>
          <HbarWorkspaceShell labels={labels} sidebarWidthRem={17} connection="connected" onReconnect={() => {}}>
            <h1>窗口内容</h1>
          </HbarWorkspaceShell>
        </HbarRuntimeProvider>,
      )

    expect(render(selected)).toContain('aria-current="page"')
    expect(render(idle)).not.toContain('aria-current="page"')
  } finally {
    selected.dispose()
    idle.dispose()
  }
})

test('new session and project acquisition expose localized disabled controls while disconnected', async () => {
  const runtime = runtimeFixture('disconnected-shell')
  try {
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarWorkspaceShell labels={labels} sidebarWidthRem={17} connection="disconnected" onReconnect={() => {}}>
          <h1>未连接</h1>
        </HbarWorkspaceShell>
      </HbarRuntimeProvider>,
    )
    expect(html).toContain(labels.newSession)
    expect(html).toContain(labels.noWorkspaces)
    const buttons: { text: string; label: string | null; disabled: boolean }[] = []
    let current: (typeof buttons)[number] | undefined
    await new HTMLRewriter()
      .on('button', {
        element(element) {
          current = {
            text: '',
            label: element.getAttribute('aria-label'),
            disabled: element.hasAttribute('disabled'),
          }
          buttons.push(current)
        },
        text(chunk) {
          if (current) current.text += chunk.text
        },
      })
      .transform(new Response(html))
      .text()
    expect(buttons.find((button) => button.text.trim() === labels.newSession)?.disabled).toBe(true)
    expect(buttons.find((button) => button.label === labels.openWorkspace)?.disabled).toBe(true)
    expect(html).not.toContain('app.createSession')
    expect(html).not.toContain('workspaceId')
  } finally {
    runtime.dispose()
  }
})

test('settings and status highlight only their page while preserving the selected session for return', async () => {
  const runtime = runtimeFixture('page-selection')
  const currentPageLabels = async () => {
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarWorkspaceShell labels={labels} sidebarWidthRem={17} connection="connected" onReconnect={() => {}}>
          <h1>当前页面内容</h1>
        </HbarWorkspaceShell>
      </HbarRuntimeProvider>,
    )
    const current: { label: string | null; text: string }[] = []
    let button: (typeof current)[number] | undefined
    await new HTMLRewriter()
      .on('button[aria-current="page"]', {
        element(element) {
          button = { label: element.getAttribute('aria-label'), text: '' }
          current.push(button)
        },
        text(chunk) {
          if (button) button.text += chunk.text
        },
      })
      .transform(new Response(html))
      .text()
    return current.map((item) => item.label ?? item.text)
  }
  try {
    await runtime.view.commands.execute('app.setSession', { workspaceId: workspace.id, sessionId: session.id })
    expect(await currentPageLabels()).toEqual([labels.openSession(session.title)])
    await runtime.view.commands.execute('app.openSettings', {
      scope: 'workspace',
      targetId: workspace.id,
      workspaceId: workspace.id,
      binding: 'pinned',
    })
    expect(await currentPageLabels()).toEqual([labels.settings])
    expect(runtime.view.state.navigation.getSnapshot()).toMatchObject({
      workspaceId: workspace.id,
      sessionId: session.id,
    })
    await runtime.view.commands.execute('app.back', {})
    expect(await currentPageLabels()).toEqual([labels.openSession(session.title)])
    await runtime.view.commands.execute('app.openStatus', { section: 'dashboard' })
    expect(await currentPageLabels()).toEqual([labels.status])
    await runtime.view.commands.execute('app.back', {})
    expect(await currentPageLabels()).toEqual([labels.openSession(session.title)])
  } finally {
    runtime.dispose()
  }
})

test('app-react production entry excludes transport, Host, storage, catalog, and preview fixtures', async () => {
  const manifest = (await Bun.file('packages/app-react/package.json').json()) as {
    dependencies?: Record<string, string>
  }
  expect(manifest.dependencies).not.toHaveProperty('@hbar/contracts')
  const inputs: string[] = []
  const result = await Bun.build({
    entrypoints: ['packages/app-react/src/index.ts'],
    target: 'browser',
    format: 'esm',
    external: ['react', 'react-dom'],
    plugins: [
      {
        name: 'app-react-inputs',
        setup(build) {
          build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, ({ path }) => {
            inputs.push(path.replaceAll('\\', '/'))
            return undefined
          })
        },
      },
    ],
  })
  expect(result.success).toBeTrue()
  expect(inputs.some((path) => /packages\/client|apps\/host|packages\/storage/.test(path))).toBeFalse()
  expect(inputs.some((path) => /catalog|fixtures|preview/.test(path))).toBeFalse()
  expect(inputs.some((path) => /packages\/app-react\/src\/workspace-shell\.tsx$/.test(path))).toBeFalse()
})

test('session rename stays in its row with host-owned long copy, preserved input and nearby validation', async () => {
  const runtime = runtimeFixture('inline-rename-locale')
  try {
    const commands = runtime.view.commands
    await commands.execute('workspace.list', {})
    await commands.execute('session.list', { workspaceId: workspace.id })
    await commands.execute('app.setSession', { workspaceId: workspace.id, sessionId: session.id })
    await commands.execute('sessionRename.begin', { workspaceId: workspace.id, sessionId: session.id })
    const revision = runtime.view.state.sessionRename.getSnapshot().revision
    await commands.execute('sessionRename.edit', { sessionId: session.id, revision, title: '  ' })
    await expect(commands.execute('sessionRename.submit', { sessionId: session.id, revision })).rejects.toMatchObject({
      code: 'TITLE_REQUIRED',
    })
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarWorkspaceShell labels={labels} sidebarWidthRem={17} connection="connected" onReconnect={() => {}}>
          <h1>保留原会话内容</h1>
        </HbarWorkspaceShell>
      </HbarRuntimeProvider>,
    )
    expect(html).toContain(labels.renameEditor.form(session.title))
    expect(html).toContain(labels.renameEditor.save)
    expect(html).toContain(labels.renameEditor.cancel)
    expect(html).toContain(labels.renameEditor.error('TITLE_REQUIRED'))
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('maxLength="160"')
    expect(runtime.view.state.sessionRename.getSnapshot().draft).toBe('  ')
    expect(runtime.view.state.directory.getSnapshot().sessions[session.id]?.title).toBe(session.title)
  } finally {
    runtime.dispose()
  }
})

for (const unavailable of ['archived', 'removed'] as const) {
  test(`session rename remains recoverable when its original row is ${unavailable}`, async () => {
    let unavailableNow = false
    const runtime = createAppRuntime({
      instanceId: `rename-recovery-${unavailable}`,
      hostId: 'host-test',
      directory: {
        execute(name) {
          if (name === 'workspace.list') return Promise.resolve({ items: [workspace], nextCursor: null })
          if (name === 'workspace.get') return Promise.resolve(workspace)
          if (name === 'session.get')
            return Promise.resolve(
              unavailableNow ? (unavailable === 'archived' ? { ...session, archived: true, seq: 1 } : null) : session,
            )
          throw new Error(`Unexpected ${name}`)
        },
      },
    })
    try {
      const commands = runtime.view.commands
      await commands.execute('workspace.list', {})
      await commands.execute('app.setSession', { workspaceId: workspace.id, sessionId: session.id })
      await commands.execute('sessionRename.begin', { workspaceId: workspace.id, sessionId: session.id })
      const target = { sessionId: session.id, revision: runtime.view.state.sessionRename.getSnapshot().revision }
      await commands.execute('sessionRename.edit', { ...target, title: '请保留尚未提交的原会话标题草稿' })
      unavailableNow = true
      await expect(commands.execute('sessionRename.submit', target)).rejects.toMatchObject({ code: 'STALE_TARGET' })
      const html = renderToStaticMarkup(
        <HbarRuntimeProvider view={runtime.view}>
          <HbarWorkspaceShell labels={labels} sidebarWidthRem={17} connection="connected" onReconnect={() => {}}>
            <h1>其他会话内容</h1>
          </HbarWorkspaceShell>
        </HbarRuntimeProvider>,
      )
      expect(html).toContain('hbar-app-react-session-rename-recovery')
      expect(html).toContain(`aria-label="${labels.renameEditor.form(session.title)}"`)
      expect(html).toContain('请保留尚未提交的原会话标题草稿')
      expect(html).toContain('readOnly=""')
      expect(html).toContain(labels.renameEditor.cancel)
      expect(html).toContain(labels.renameEditor.error('STALE_TARGET'))
      expect(html).not.toContain(`data-session-id="${session.id}"`)
      expect(runtime.view.state.sessionRename.getSnapshot().target?.sessionId).toBe(session.id)
    } finally {
      runtime.dispose()
    }
  })
}

test('an archived unknown rename exposes only original-target reconciliation, not cancel or replay', async () => {
  let archived = false
  const runtime = createAppRuntime({
    instanceId: 'rename-unknown-recovery',
    hostId: 'host-test',
    directory: {
      execute(name) {
        if (name === 'workspace.get') return Promise.resolve(workspace)
        if (name === 'session.get') return Promise.resolve({ ...session, archived, seq: archived ? 1 : 0 })
        throw new Error(`Unexpected ${name}`)
      },
    },
    workspaces: {
      execute() {
        return Promise.reject(new CommandError('CONNECTION_CLOSED', 'Fixture lost the rename result'))
      },
    },
  })
  try {
    const commands = runtime.view.commands
    await commands.execute('app.setSession', { workspaceId: workspace.id, sessionId: session.id })
    await commands.execute('sessionRename.begin', { workspaceId: workspace.id, sessionId: session.id })
    const target = { sessionId: session.id, revision: runtime.view.state.sessionRename.getSnapshot().revision }
    await commands.execute('sessionRename.edit', { ...target, title: '不能因归档丢失或重放的原始标题意图' })
    await expect(commands.execute('sessionRename.submit', target)).rejects.toMatchObject({ code: 'CONNECTION_CLOSED' })
    archived = true
    await commands.execute('sessionRename.reconcile', target)
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarWorkspaceShell labels={labels} sidebarWidthRem={17} connection="connected" onReconnect={() => {}}>
          <h1>其他会话内容</h1>
        </HbarWorkspaceShell>
      </HbarRuntimeProvider>,
    )
    expect(html).toContain('hbar-app-react-session-rename-recovery')
    expect(html).toContain('不能因归档丢失或重放的原始标题意图')
    expect(html).toContain(labels.renameEditor.unknown)
    expect(html).toContain(labels.renameEditor.reconcile)
    expect(html).not.toContain(labels.renameEditor.cancel)
    expect(html).not.toContain(labels.renameEditor.save)
    expect(runtime.view.state.sessionRename.getSnapshot().status).toBe('unknown')
    expect(runtime.view.state.directory.getSnapshot().sessions[session.id]?.archived).toBe(true)
  } finally {
    runtime.dispose()
  }
})
