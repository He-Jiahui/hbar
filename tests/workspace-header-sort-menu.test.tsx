import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  WorkspaceHeaderSortMenu,
  type WorkspaceHeaderSortMenuLabels,
  type WorkspaceHeaderSortMenuProps,
} from '../packages/app-react/src/workspace-header-sort-menu'

const englishLabels: WorkspaceHeaderSortMenuLabels = {
  menu: 'Projects menu',
  sortCondition: 'Sort condition',
  createdAt: 'Created time',
  updatedAt: 'Updated time',
  restoreHidden: (count) => `Restore hidden projects (${count})`,
  refresh: 'Refresh sidebar',
  updating: 'Updating sort…',
}

const baseProps: WorkspaceHeaderSortMenuProps = {
  labels: englishLabels,
  sortBy: 'updatedAt',
  pending: false,
  sortDisabled: false,
  hiddenCount: 0,
  restoreDisabled: false,
  refreshDisabled: false,
  onSortChange: () => {},
  onRestoreHidden: () => {},
  onRefresh: () => {},
}

function render(props: Partial<WorkspaceHeaderSortMenuProps> = {}): string {
  return renderToStaticMarkup(<WorkspaceHeaderSortMenu {...baseProps} {...props} />)
}

test('the controlled menu exposes only the available sort choices and marks the current choice', () => {
  const html = render()

  expect(html).toContain('data-testid="workspace-organization-menu"')
  expect(html).toContain('data-workspace-menu-trigger=""')
  expect(html).toContain('aria-haspopup="menu"')
  expect(html).toContain('data-testid="workspace-sort-submenu"')
  expect(html).toContain('aria-checked="false"')
  expect(html).toContain('aria-checked="true"')
  expect(html).toContain('Created time')
  expect(html).toContain('Updated time')
  expect(html).not.toContain('Restore hidden projects (0)')
  expect(html).toContain('Refresh sidebar')
})

test('host-provided long Chinese labels remain in the flow and pending state disables sorting', () => {
  const labels: WorkspaceHeaderSortMenuLabels = {
    menu: '项目菜单（较长的本地化辅助名称）',
    sortCondition: '排序条件（使用当前活动时间重新排列工程）',
    createdAt: '创建时间（按每个工程中最新会话的创建时间排列）',
    updatedAt: '更新时间（按每个工程中最新会话的更新时间排列）',
    restoreHidden: (count) => `恢复隐藏项目（${count}）`,
    refresh: '刷新侧栏显示',
    updating: '正在更新排序设置，请稍候…',
  }
  const html = render({ labels, pending: true, hiddenCount: 2, restoreDisabled: true })

  expect(html).toContain(labels.sortCondition)
  expect(html).toContain(labels.createdAt)
  expect(html).toContain(labels.updatedAt)
  expect(html).toContain(labels.restoreHidden(2))
  expect(html).toContain(labels.updating)
  expect(html).toContain('role="menuitemradio"')
  expect(html).toContain('disabled=""')
})

test('the optional organization submenu renders host labels, selected mode, and independent disabled state', () => {
  const labels = {
    organize: '整理侧边栏（选择项目分组与显示顺序）',
    byProject: '按项目',
    recentProjects: '近期项目',
    byTime: '按时间顺序',
  }
  const html = render({
    organization: {
      mode: 'recentProject',
      pending: false,
      disabled: true,
      labels,
      onChoose: () => {},
    },
  })

  expect(html).toContain('data-testid="workspace-organization-submenu"')
  expect(html).toContain(labels.organize)
  expect(html).toContain(labels.byProject)
  expect(html).toContain(labels.recentProjects)
  expect(html).toContain(labels.byTime)
  expect(html).toContain('aria-checked="false"')
  expect(html).toContain('aria-checked="true"')
  expect(html.match(/disabled=""/g)).toHaveLength(4)
})

test('organization pending contributes to the shared pending status and disables sort choices', () => {
  const html = render({
    organization: {
      mode: 'project',
      pending: true,
      disabled: false,
      labels: {
        organize: 'Organize sidebar',
        byProject: 'By project',
        recentProjects: 'Recent projects',
        byTime: 'By time',
      },
      onChoose: () => {},
    },
  })

  expect(html).toContain(englishLabels.updating)
  expect(html).toContain('data-testid="workspace-sort-submenu"')
  expect(html).toContain('data-testid="workspace-organization-submenu"')
  expect(html.match(/disabled=""/g)).toHaveLength(7)
})
