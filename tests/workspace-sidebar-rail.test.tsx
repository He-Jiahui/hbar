import { expect, test } from 'bun:test'
import { createRef, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WorkspaceSidebarRail } from '../packages/app-react/src/workspace-sidebar-rail'
import { WorkspaceSidebarRailMessagesProvider } from '../packages/app-react/src/workspace-shell-messages'

const labels = {
  expand: '展开工程与会话侧栏',
  navigation: '工程与会话导航',
  newSession: '新建会话——这是一个足够长的中文入口标签',
  search: '搜索聊天记录与当前会话',
  settings: '设置与工作区首选项',
  serverValue: '已连接',
}
const messages = {
  showSidebar: labels.expand,
  projectsAndSessions: labels.navigation,
  newSession: labels.newSession,
  searchChats: labels.search,
  settings: labels.settings,
  server: '服务器',
}

function render(overrides: Partial<ComponentProps<typeof WorkspaceSidebarRail>> = {}) {
  return renderToStaticMarkup(
    <WorkspaceSidebarRailMessagesProvider messages={messages}>
      <WorkspaceSidebarRail
        serverValue={labels.serverValue}
        expandRef={createRef<HTMLButtonElement>()}
        connected
        serverTone="success"
        newDisabled={false}
        newBusy={false}
        searchSelected={false}
        settingsSelected={false}
        onExpand={() => {}}
        onNew={() => {}}
        onSearch={() => {}}
        onSettings={() => {}}
        {...overrides}
      />
    </WorkspaceSidebarRailMessagesProvider>,
  )
}

test('rail renders host-owned non-English labels and bounded normal-flow regions', () => {
  const html = render({ children: <p role="alert">操作失败：请在此处重试，不要丢失当前上下文。</p> })

  for (const label of [
    labels.expand,
    labels.navigation,
    labels.newSession,
    labels.search,
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
  expect(html).toContain(`title="${messages.server} · ${labels.serverValue}"`)
  expect(html).toContain('data-tier="sm"')
})

test('selected flags use page semantics and the new action preserves busy and disabled state', () => {
  const html = render({
    connected: false,
    newDisabled: false,
    newBusy: true,
    searchSelected: true,
    settingsSelected: true,
  })

  expect(html.match(/aria-current="page"/g)).toHaveLength(2)
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(2)
  expect(html).toContain('aria-busy="true"')
  expect(html).toContain('disabled=""')
  expect(html).toContain(`aria-label="${labels.expand}"`)
  expect(html).toContain(`title="${labels.expand}"`)
})

test('secondary destinations use one host menu slot and do not duplicate permanent actions', () => {
  const html = render({ secondaryNavigation: <button aria-label="更多操作（宿主提供的长标签）">更多</button> })
  expect(html).toContain('更多操作（宿主提供的长标签）')
  expect(html.match(/aria-label="更多操作（宿主提供的长标签）"/g)).toHaveLength(1)
  expect(html).not.toContain('状态中心')
  expect(html).not.toContain('扩展与技能')
})
