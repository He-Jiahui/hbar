import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarRuntimeProvider, HbarWorkspaceShell, type HbarWorkspaceShellLabels } from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError } from '@hbar/commands'
import { SessionNavigationRow } from '../packages/app-react/src/session-navigation-row'
import { workspaceOrganizationCopy } from '../apps/web/src/workspace-organization-copy'
import { workspaceSortCopy } from '../apps/web/src/workspace-sort-copy'
import { workspaceDisplayNamesCopy } from '../apps/web/src/workspace-display-names-copy'
import { getSessionStopCopy } from '../apps/web/src/session-stop-copy'
import { getShellCopy } from '../apps/web/src/shell-copy'

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
  stop: getSessionStopCopy('zh-CN'),
  main: '工作台主区域',
  brand: 'hbar 测试',
  projectsAndSessions: '工程与会话树',
  organization: workspaceOrganizationCopy('zh-CN'),
  sort: workspaceSortCopy('zh-CN'),
  displayNames: workspaceDisplayNamesCopy('zh-CN'),
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
  commandShortcut: 'Ctrl Shift P',
  settingsShortcut: 'Ctrl ,',
  searchChats: '搜索全部聊天记录中的内容',
  searchShortcut: 'Ctrl K',
  archiveBatch: getShellCopy('zh-CN').shell.archiveBatch,
  roster: {
    refreshExpanded: '刷新所有展开工程的会话',
    refreshWorkspace: (name) => `刷新 ${name} 的会话`,
    refreshing: '正在核对会话名单',
    refreshed: '名单已刷新',
    remaining: (count) => `还有 ${count} 个旧会话尚未核对`,
    limited: '扫描已达到上限，不代表全部最新名单',
    capacity: (count) => `已满，保留原名单，还有 ${count} 个新记录`,
    failure: (code) => `刷新失败 ${code}`,
    retry: '重试刷新原项目',
  },
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
  workspaceFilesEntry: '工程文件',
  workspaceFilesUnavailable: '先选择工程',
  openWorkspaceFiles: (name) => `打开 ${name} 的文件`,
  extensionsAndSkills: '扩展与技能',
  workspaceSettings: '查看并编辑此工作区的设置与覆盖值',
  pinWorkspace: '置顶工程',
  unpinWorkspace: '取消置顶',
  pinnedWorkspace: (name) => `已置顶工程 ${name}`,
  pinningWorkspace: '正在更新置顶',
  pinSaved: '已置顶',
  pinRemoved: '已取消置顶',
  pinVolatile: '本次运行有效',
  pinUnknown: '结果尚未确认',
  pinCheck: '核对结果',
  pinFailure: (code) => `置顶失败 ${code}`,
  pinRestoreFailure: (code) => `读取置顶失败 ${code}`,
  pinRetryRestore: '重试读取',
  openSession: (name) => `选择 ${name}`,
  sessionUpdatedAt: (timestamp) => `更新于 ${timestamp}`,
  sessionUpdatedAtFull: (timestamp) => `完整更新时间 ${timestamp}`,
  sessionActions: (name) => `${name} 的操作`,
  selectSession: (name) => `选择会话 ${name} 进行批量归档`,
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
  archive: {
    openList: (name) => `查看 ${name} 的归档会话`,
    listTitle: (name) => `${name} 中的归档会话`,
    close: '收起归档列表',
    loading: '正在加载归档会话',
    empty: '没有归档会话',
    emptyPage: '本页没有归档会话，可继续下一页',
    firstPage: '刷新并返回第一页',
    nextPage: '查看下一页',
    page: (page) => `第 ${page} 页`,
    restore: '恢复',
    restoreSession: (title) => `恢复原会话 ${title}`,
    restoreTitle: (title) => `恢复原会话 ${title}`,
    restored: (title) => `已恢复 ${title}，不会自动切换当前会话`,
    confirmTitle: (title) => `确认归档原会话 ${title}`,
    description: '归档只隐藏列表记录，不删除历史，之后可以在原工作区的归档列表中恢复。',
    confirm: '确认归档此会话',
    cancel: '取消归档',
    archiving: '正在归档',
    restoring: '正在恢复',
    archived: (title) => `已经归档 ${title}`,
    unknown: '原操作结果未知，请核对原会话',
    reconcile: '核对原会话',
    checking: '正在核对原会话',
    dismiss: '关闭确认结果',
    error: (code) => `归档操作错误 ${code}`,
  },
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
    expect(html).toMatch(
      /hbar-app-react-session-title[^>]*>需要键盘导航的会话<\/span><time[^>]*hbar-app-react-session-time/,
    )
    expect(html).toContain('title="完整更新时间 3"')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('打开命令目录')
    expect(html).toContain(labels.searchChats)
    expect(html.indexOf(labels.newSession)).toBeLessThan(html.indexOf(labels.extensionsAndSkills))
    expect(html.indexOf(labels.extensionsAndSkills)).toBeLessThan(html.indexOf(labels.searchChats))
    expect(html.indexOf(labels.searchChats)).toBeLessThan(html.indexOf(labels.commands))
    expect(html.indexOf(labels.commands)).toBeLessThan(html.indexOf(labels.workspaceFilesEntry))
    expect(html.indexOf(labels.workspaceFilesEntry)).toBeLessThan(html.indexOf('hbar-app-react-project-tree'))
    expect(html).toContain(`aria-label="${labels.openWorkspaceFiles(workspace.name)}"`)
    expect(html).toContain('打开工作区')
    expect(html).toContain('打开状态中心')
    expect(html).toContain('打开设置')
    expect(html).toContain('已经连接')
    expect(html).toContain('非常长的工程名称 的工程操作')
    expect(html).toContain(labels.createSessionInWorkspace(workspace.name))
    expect(html).not.toContain(labels.newSessionInWorkspace)
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

test('time-view session metadata follows the title and time and keeps host-owned workspace and status copy', () => {
  const runtime = runtimeFixture('time-view-session-metadata')
  try {
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <SessionNavigationRow
          session={session}
          selected={false}
          connected
          labels={labels}
          now={4}
          onOpen={() => {}}
          metadata={{ workspaceName: '宿主工程名', execution: { state: 'waiting_approval', label: '等待授权' } }}
        />
      </HbarRuntimeProvider>,
    )
    expect(html.indexOf('需要键盘导航的会话')).toBeLessThan(html.indexOf('完整更新时间 3'))
    expect(html.indexOf('完整更新时间 3')).toBeLessThan(html.indexOf('宿主工程名'))
    expect(html).toContain('role="img" aria-label="等待授权" title="等待授权" data-state="waiting_approval"')
    expect(html.indexOf('hbar-app-react-session-main-line')).toBeLessThan(
      html.indexOf('hbar-app-react-session-activity-indicator'),
    )
    expect(html.indexOf('hbar-app-react-session-activity-indicator')).toBeLessThan(
      html.indexOf('hbar-app-react-session-context-line'),
    )
    expect(html).toContain('data-has-metadata="true"')
    expect(html).toContain('data-state="waiting_approval"')
    expect(html).not.toContain('hbar-app-react-session-execution-label')
    expect(html.match(/data-tier="sm"/g)).toHaveLength(3)
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

test('English host copy renders Search, Commands, and workspace Files as separate first-level actions', () => {
  const runtime = runtimeFixture('search-entry-en')
  try {
    const english = getShellCopy('en-US', 'Win32').shell
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarWorkspaceShell labels={english} sidebarWidthRem={17} connection="connected" onReconnect={() => {}}>
          <h1>Host content</h1>
        </HbarWorkspaceShell>
      </HbarRuntimeProvider>,
    )
    expect(html).toContain(english.searchChats)
    expect(html).toContain(english.commands)
    expect(html).toContain(english.workspaceFilesEntry)
    expect(html).toContain(english.extensionsAndSkills)
    expect(html).toContain(english.workspaceFilesUnavailable)
    expect(html.indexOf(english.searchChats)).toBeLessThan(html.indexOf(english.commands))
    expect(html.indexOf(english.commands)).toBeLessThan(html.indexOf(english.workspaceFilesEntry))
    expect(html).toContain(english.searchShortcut)
    expect(html).toContain(english.commandShortcut)
  } finally {
    runtime.dispose()
  }
})

test('project quick-create is a single localized row action and stays disabled for a disconnected cached project', async () => {
  const runtime = runtimeFixture('project-quick-create')
  const render = (connection: 'connected' | 'disconnected') =>
    renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarWorkspaceShell labels={labels} sidebarWidthRem={17} connection={connection} onReconnect={() => {}}>
          <h1>项目上下文</h1>
        </HbarWorkspaceShell>
      </HbarRuntimeProvider>,
    )
  try {
    expect(render('connected')).not.toContain('hbar-app-react-project-new-session')
    await runtime.view.commands.execute('workspace.list', { limit: 100 })
    for (const connection of ['connected', 'disconnected'] as const) {
      const buttons: { label: string | null; title: string | null; disabled: boolean }[] = []
      await new HTMLRewriter()
        .on('button.hbar-app-react-project-new-session', {
          element(element) {
            buttons.push({
              label: element.getAttribute('aria-label'),
              title: element.getAttribute('title'),
              disabled: element.hasAttribute('disabled'),
            })
          },
        })
        .transform(new Response(render(connection)))
        .text()
      expect(buttons).toEqual([
        {
          label: labels.createSessionInWorkspace(workspace.name),
          title: labels.createSessionInWorkspace(workspace.name),
          disabled: connection === 'disconnected',
        },
      ])
      expect(runtime.view.state.navigation.getSnapshot().workspaceId).toBeNull()
      expect(runtime.view.state.navigation.getSnapshot().sessionId).toBeNull()
    }
  } finally {
    runtime.dispose()
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
    await runtime.view.commands.execute('app.openSettings', { scope: 'global', section: 'skills' })
    expect(await currentPageLabels()).toEqual([labels.extensionsAndSkills])
    await runtime.view.commands.execute('app.openSettings', { scope: 'global', section: 'extensions' })
    expect(await currentPageLabels()).toEqual([labels.extensionsAndSkills])
    await runtime.view.commands.execute('app.openSettings', { scope: 'global', section: 'providers' })
    expect(await currentPageLabels()).toEqual([labels.settings])
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
  // File previews are production UI. Reject preview apps/entrypoints and fixtures by path boundary,
  // not every legitimate source filename containing the word "preview".
  const previewOnly = (path: string) =>
    /catalog|fixtures|(?:^|\/)preview(?:\/|\.)|(?:^|\/)apps\/[^/]*preview(?:\/|$)/.test(path)
  for (const path of [
    'src/catalog.ts',
    'tests/fixtures/reader.tsx',
    'src/preview.tsx',
    'apps/hbar-app-ui-preview/src/main.tsx',
  ])
    expect(previewOnly(path)).toBeTrue()
  expect(previewOnly('packages/app-react/src/file-preview-tabs.tsx')).toBeFalse()
  expect(inputs.filter(previewOnly)).toEqual([])
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

test('archive confirmation remains in the original session row with reversible host-owned copy', async () => {
  const runtime = runtimeFixture('archive-long-labels')
  try {
    await runtime.view.commands.execute('workspace.list', {})
    await runtime.view.commands.execute('app.setSession', { workspaceId: workspace.id, sessionId: session.id })
    await runtime.view.commands.execute('sessionArchive.begin', { workspaceId: workspace.id, sessionId: session.id })
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarWorkspaceShell labels={labels} sidebarWidthRem={17} connection="connected" onReconnect={() => {}}>
          <h1>原会话历史</h1>
        </HbarWorkspaceShell>
      </HbarRuntimeProvider>,
    )
    expect(html).toContain(labels.archive.confirmTitle(session.title))
    expect(html).toContain(labels.archive.description)
    expect(html).toContain(labels.archive.confirm)
    expect(html).toContain(labels.archive.cancel)
    expect(html).toContain(`data-session-id="${session.id}"`)
    expect(html).not.toContain('role="dialog"')
    expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe(session.id)
  } finally {
    runtime.dispose()
  }
})

test('an inclusive archive page with no archived rows offers next page rather than a false project-wide empty state', async () => {
  const runtime = createAppRuntime({
    instanceId: 'archive-empty-page',
    hostId: 'host-test',
    directory: {
      execute(name) {
        if (name === 'workspace.get') return Promise.resolve(workspace)
        if (name === 'session.list') return Promise.resolve({ items: [session], nextCursor: session.id })
        throw new Error(`Unexpected ${name}`)
      },
    },
  })
  try {
    await runtime.view.commands.execute('workspace.get', { workspaceId: workspace.id })
    await runtime.view.commands.execute('archivedSessions.open', { workspaceId: workspace.id })
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarWorkspaceShell labels={labels} sidebarWidthRem={17} connection="connected" onReconnect={() => {}}>
          <h1>不改变原选择</h1>
        </HbarWorkspaceShell>
      </HbarRuntimeProvider>,
    )
    expect(html).toContain(labels.archive.listTitle(workspace.name))
    expect(html).toContain(labels.archive.emptyPage)
    expect(html).toContain(labels.archive.nextPage)
    expect(html).toContain(labels.archive.firstPage)
    expect(html).not.toContain(`>${labels.archive.empty}<`)
    expect(runtime.view.state.navigation.getSnapshot().workspaceId).toBeNull()
  } finally {
    runtime.dispose()
  }
})
