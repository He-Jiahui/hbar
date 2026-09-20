import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarRuntimeProvider, HbarWorkspaceShell, type HbarWorkspaceShellLabels } from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'

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
  openSession: (name) => `选择 ${name}`,
  sessionUpdatedAt: (timestamp) => `更新于 ${timestamp}`,
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
    expect(html).toContain('--hbar-app-ui-tool-size:26rem')
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
})
