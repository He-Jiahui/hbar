import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createAppRuntime } from '@hbar/app-runtime'
import { HbarRuntimeProvider } from '../packages/app-react/src/runtime'
import {
  HbarChatSearchView,
  type HbarChatSearchLabels,
  type HbarChatSearchRow,
} from '../packages/app-react/src/chat-search-view'
import {
  HbarComposerPermissionPicker,
  type HbarComposerPermissionLabels,
} from '../packages/app-react/src/composer-permission-picker'
import { SessionNavigationRow } from '../packages/app-react/src/session-navigation-row'
import { WorkspaceShellMessagesProvider } from '../packages/app-react/src/workspace-shell-messages'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { chatSearchCopy } from '../apps/web/src/chat-search-copy'

const searchLabels: HbarChatSearchLabels = {
  ...chatSearchCopy('zh-CN'),
  search: '搜索聊天',
  recent: '最近的聊天',
  close: '关闭搜索',
  loading: '正在搜索',
  indexing: '正在建立索引',
  searchFailed: '搜索失败',
  empty: '没有匹配的聊天',
  noRecent: '没有最近的聊天',
  disconnected: 'Host 未连接',
  retry: '重试',
  truncated: '仅显示部分结果',
  navigateKey: '↑↓',
  navigate: '导航',
  selectKey: 'Enter',
  select: '打开',
  closeKey: 'Esc',
  closeHint: '关闭',
  role: (role) => (role === 'user' ? '你' : '助手'),
  time: (value) => `${value} 分钟前`,
  matches: (count, capped) => `${count}${capped ? '+' : ''} 条匹配`,
  openSession: (title, workspace) => `打开 ${workspace} 中的 ${title}`,
  opening: (title) => `正在打开 ${title}`,
}

const searchRow: HbarChatSearchRow = {
  sessionId: 'long-session',
  workspaceId: 'long-workspace',
  title: '会话标题非常长，用于确认搜索结果可以查看完整内容',
  workspaceName: '工作区显示名称非常长，用于确认上下文完整内容',
  updatedAt: 1_700_000_000_000,
  matchCount: 2,
  snippets: [
    {
      messageId: 'long-message',
      role: 'assistant',
      text: '搜索结果片段包含完整中文文本，不应该只剩下视觉上的省略号',
      highlights: [{ start: 0, end: 4 }],
    },
  ],
}

function renderSearch() {
  return renderToStaticMarkup(
    <HbarChatSearchView
      inputRef={{ current: null }}
      query="完整"
      status="ready"
      rows={[searchRow]}
      selectedResultId="long-session"
      truncated={false}
      error={null}
      labels={searchLabels}
      onQueryChange={() => undefined}
      onSourceChange={() => undefined}
      onMove={() => undefined}
      onSelect={() => undefined}
      onOpen={() => undefined}
      onClose={() => undefined}
      onCompositionStart={() => undefined}
      onCompositionEnd={() => undefined}
      onRetry={() => undefined}
    />,
  )
}

function permissionLabels(): HbarComposerPermissionLabels {
  return {
    execution: {
      loading: '正在读取',
      pending: '正在保存',
      checking: '正在核对',
      unknown: '结果未知',
      failed: '读取失败',
      approvalFrozen: '审批选择暂时冻结',
      checkFailed: '核对失败',
      readFailed: '读取失败',
    },
    title: '执行选项',
    trigger: (choice) => `执行选项：${choice}`,
    inheritedTrigger: (choice) => `${choice} · 服务端默认`,
    close: '关闭执行选项',
    loading: '读取中',
    retry: '重试',
    pending: '保存中',
    unknown: '结果未知',
    recheck: '重新核对',
    scopeHint: '本会话持续生效',
    runActiveHint: '运行中无法切换执行选项',
    inheritedSnapshotHint: (mode) => `发送时固定默认值：${mode ?? '未读取'}`,
    options: {
      inherit: { label: '继承服务端默认', description: '发送时读取默认值' },
      ask: { label: '逐次询问', description: '需要审批时询问' },
      deny: { label: '拒绝需审批工具', description: '拒绝审批请求' },
      sandbox: { label: '沙盒配置', description: '使用沙盒策略' },
      allow: { label: '自动批准需审批工具', description: '自动批准审批请求' },
    },
    confirmTitle: '确认自动批准',
    confirmBody: (session) => `确认会话 ${session}`,
    confirmAllow: '确认',
    cancel: '取消',
    error: (code) => `错误：${code}`,
    plan: {
      label: '计划模式',
      description: '只读规划',
      scope: '本会话持续生效',
      pending: '计划保存中',
      unknown: '计划结果未知',
      loading: '计划读取中',
      selected: '当前为计划模式',
      exit: '退出计划模式',
      exitDescription: '保留当前草稿',
      retry: '重试计划',
      recheck: '核对计划',
      goalPrepared: '先取消目标准备',
      cancelGoalPreparation: '取消目标准备',
      cancellingGoalPreparation: '正在取消目标准备',
    },
  }
}

test('search result ellipsis keeps the complete title, workspace context, role and snippet in title attributes', () => {
  const html = renderSearch()
  expect(html).toContain(`title="${searchRow.title}"`)
  expect(html).toContain(`title="${searchRow.workspaceName}"`)
  expect(html).toContain(`title="${searchRow.snippets[0]!.text}"`)
  expect(html).toContain('title="助手"')
})

test('permission trigger exposes its current host choice as a complete title when idle', () => {
  const labels = permissionLabels()
  const html = renderToStaticMarkup(
    <HbarComposerPermissionPicker
      sessionId="session"
      sessionLabel="长会话"
      entry={{ sessionId: 'session', choice: 'allow', revision: 1, status: 'idle', locked: false, error: null }}
      hostDefault={{ status: 'ready', mode: 'ask', error: null }}
      defaultAvailable
      connected
      disabled={false}
      labels={labels}
      onRefresh={async () => undefined}
      onSelect={async () => undefined}
    />,
  )
  expect(html).toContain(`title="${labels.options.allow.label}"`)
})

test('sidebar session workspace metadata keeps its canonical path available when display name is clipped', async () => {
  const workspace = { id: 'workspace', path: 'D:/非常长的服务端项目路径', name: '宿主显示名称', createdAt: 1 }
  const session = {
    id: 'session',
    workspaceId: workspace.id,
    title: '会话',
    archived: false,
    parentId: null,
    createdAt: 1,
    updatedAt: 1,
    seq: 0,
  }
  const runtime = createAppRuntime({
    instanceId: 'text-overflow-contract',
    hostId: 'host',
    directory: {
      async execute(name: string) {
        if (name === 'workspace.get') return workspace
        if (name === 'session.get') return session
        if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
        if (name === 'session.list') return { items: [session], nextCursor: null }
        throw new Error(name)
      },
    },
    surfaces: { canRender: () => true },
  })
  try {
    await runtime.ready
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <WorkspaceShellMessagesProvider labels={getShellCopy('zh-CN').shell} mobileNavigationLabel="导航">
          <SessionNavigationRow
            session={session}
            selected={false}
            connected
            now={1}
            onOpen={() => undefined}
            metadata={{
              workspaceName: workspace.name,
              workspacePath: workspace.path,
              execution: { state: 'idle', label: '空闲' },
            }}
          />
        </WorkspaceShellMessagesProvider>
      </HbarRuntimeProvider>,
    )
    expect(html).toContain(`title="${workspace.path}"`)
  } finally {
    runtime.dispose()
  }
})
