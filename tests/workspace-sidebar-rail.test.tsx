import { expect, test } from 'bun:test'
import { createRef, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WorkspaceSidebarRail, type WorkspaceSidebarRailLabels } from '../packages/app-react/src/workspace-sidebar-rail'

const labels: WorkspaceSidebarRailLabels = {
  expand: '展开工程与会话侧栏',
  navigation: '工程与会话导航',
  newSession: '新建会话——这是一个足够长的中文入口标签',
  extensions: '扩展与技能（宿主提供的超长标签）',
  commands: '命令目录',
  schedules: '排期与定时任务',
  search: '搜索聊天记录与当前会话',
  status: '状态中心',
  settings: '设置与工作区首选项',
  reconnect: '重新连接服务端',
  serverValue: '已连接',
}

function render(overrides: Partial<ComponentProps<typeof WorkspaceSidebarRail>> = {}) {
  return renderToStaticMarkup(
    <WorkspaceSidebarRail
      labels={labels}
      expandRef={createRef<HTMLButtonElement>()}
      connected
      serverTone="success"
      newDisabled={false}
      newBusy={false}
      extensionsSelected={false}
      commandsSelected={false}
      schedulesSelected={false}
      searchSelected={false}
      statusSelected={false}
      settingsSelected={false}
      onExpand={() => {}}
      onNew={() => {}}
      onExtensions={() => {}}
      onCommands={() => {}}
      onSchedules={() => {}}
      onSearch={() => {}}
      onStatus={() => {}}
      onSettings={() => {}}
      {...overrides}
    />,
  )
}

test('rail renders host-owned non-English labels and bounded normal-flow regions', () => {
  const html = render({ children: <p role="alert">操作失败：请在此处重试，不要丢失当前上下文。</p> })

  for (const label of [
    labels.expand,
    labels.navigation,
    labels.newSession,
    labels.extensions,
    labels.search,
    labels.status,
    labels.settings,
    labels.serverValue,
  ])
    expect(html).toContain(label)
  expect(html).toContain('hbar-app-react-sidebar-rail-body')
  expect(html).toContain('hbar-app-react-sidebar-rail-feedback')
  expect(html).toContain('role="alert"')
  expect(html).not.toContain('sample')
  expect(html).not.toContain('position:')
  expect(html).toContain(`aria-label="${labels.navigation}"`)
  expect(html).toContain(`role="status"`)
  expect(html).toContain(`title="${labels.serverValue}"`)
  expect(html).toContain('data-tier="sm"')
})

test('selected flags use page semantics and the new action preserves busy and disabled state', () => {
  const html = render({
    connected: false,
    newDisabled: false,
    newBusy: true,
    extensionsSelected: true,
    searchSelected: true,
    statusSelected: true,
    settingsSelected: true,
  })

  expect(html.match(/aria-current="page"/g)).toHaveLength(4)
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(4)
  expect(html).toContain('aria-busy="true"')
  expect(html).toContain('disabled=""')
  expect(html).toContain(`aria-label="${labels.expand}"`)
  expect(html).toContain(`title="${labels.expand}"`)
})

test('reconnect remains a real optional action and disappears while connected', () => {
  const disconnected = render({ connected: false, onReconnect: () => {} })
  expect(disconnected).toContain(`aria-label="${labels.reconnect}"`)
  expect(disconnected).toContain(`title="${labels.reconnect}"`)
  expect(render()).not.toContain(`aria-label="${labels.reconnect}"`)
})
