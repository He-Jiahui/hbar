import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  HbarAppUiAppShell,
  HbarAppUiAppSidebar,
  HbarAppUiPageAction,
  HbarAppUiPageHeader,
  HbarAppUiWorkbenchNotice,
} from '../packages/hbar-app-ui/src/workbench'

test('structural shell renders host content and a read-only connection state without invented controls', () => {
  const html = renderToStaticMarkup(
    createElement(HbarAppUiAppShell, {
      label: '工作台',
      sidebarWidthRem: 17,
      sidebarOpen: true,
      closeSidebarLabel: '关闭侧栏',
      onCloseSidebar: () => {},
      sidebar: createElement(HbarAppUiAppSidebar, {
        brand: 'hbar',
        title: '工程与会话',
        emptyLabel: '尚无内容',
        status: { label: 'Host', value: '未连接', tone: 'danger' },
      }),
      children: createElement(HbarAppUiWorkbenchNotice, {
        title: '等待连接',
        description: 'Host supplies this description.',
        command: { label: 'CLI', value: 'bun run cli --help' },
      }),
    }),
  )
  expect(html).toContain('<aside')
  expect(html).toContain('工程与会话')
  expect(html).toContain('<dt><i aria-hidden="true"></i>Host</dt><dd>未连接</dd>')
  expect(html).toContain('bun run cli --help')
  expect(html).not.toMatch(/<(input|select|textarea)\b/)
})

test('slots preserve supplied content, suppress the empty label, and allow the sidebar to be absent', () => {
  const sidebar = renderToStaticMarkup(
    createElement(HbarAppUiAppSidebar, {
      brand: 'A long localized application name',
      title: 'Projects and sessions with a deliberately long translated title',
      emptyLabel: 'No projects',
      status: { label: 'Server', value: 'Disconnected', tone: 'danger' },
      children: createElement('p', null, 'Host-owned collection'),
      actions: createElement('button', { type: 'button' }, 'Host-owned action'),
    }),
  )
  expect(sidebar).toContain('Host-owned collection')
  expect(sidebar).not.toContain('No projects')
  expect(sidebar).toContain('Host-owned action')
  const shell = renderToStaticMarkup(
    createElement(HbarAppUiAppShell, {
      label: 'Workspace',
      sidebarWidthRem: 17,
      sidebarOpen: false,
      closeSidebarLabel: 'Close sidebar',
      onCloseSidebar: () => {},
      header: createElement('strong', null, 'Host-owned header'),
      tool: createElement('section', null, 'Host-owned tool'),
      overlay: createElement('div', null, 'Host-owned overlay'),
      children: 'Main content',
    }),
  )
  expect(shell).not.toContain('hbar-app-ui-app-sidebar-drawer')
  expect(shell).toContain('Host-owned header')
  expect(shell).toContain('Host-owned tool')
  expect(shell).toContain('Host-owned overlay')
  expect(shell).toContain('Main content')
})

test('page header preserves long host copy and icon actions expose names and selected state', () => {
  const html = renderToStaticMarkup(
    createElement(HbarAppUiPageHeader, {
      title: 'A deliberately long localized session title supplied by the host',
      context: 'A deliberately long localized workspace name supplied by the host',
      status: { label: 'Waiting for an external approval', tone: 'warning' },
      actionsLabel: 'Session tools',
      actions: createElement(HbarAppUiPageAction, {
        icon: 'files',
        label: 'Open localized workspace files',
        selected: true,
      }),
    }),
  )
  expect(html).toContain('A deliberately long localized session title supplied by the host')
  expect(html).toContain('A deliberately long localized workspace name supplied by the host')
  expect(html).toContain('Waiting for an external approval')
  expect(html).toContain('role="group" aria-label="Session tools"')
  expect(html).toContain('aria-label="Open localized workspace files"')
  expect(html).toContain('aria-pressed="true"')
})
