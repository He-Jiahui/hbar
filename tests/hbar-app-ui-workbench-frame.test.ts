import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  HbarAppUiAppShell,
  HbarAppUiAppSidebar,
  HbarAppUiBarSeries,
  HbarAppUiCompactMetrics,
  HbarAppUiPageAction,
  HbarAppUiPageHeader,
  HbarAppUiSettingsList,
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
      leading: createElement('button', { type: 'button', 'aria-label': 'Back to localized session' }, '←'),
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
  expect(html).toContain('aria-label="Back to localized session"')
  expect(html).toContain('role="group" aria-label="Session tools"')
  expect(html).toContain('aria-label="Open localized workspace files"')
  expect(html).toContain('aria-pressed="true"')
})

test('compact monitoring primitives render finite host metrics without fallback copy', () => {
  const metrics = renderToStaticMarkup(
    createElement(HbarAppUiCompactMetrics, {
      label: 'Localized usage summary',
      metrics: [{ id: 'rate', label: 'Localized rate', value: '14 tokens/s', detail: 'Measured by Host' }],
    }),
  )
  const series = renderToStaticMarkup(
    createElement(HbarAppUiBarSeries, {
      label: 'Localized token timeline',
      points: [
        { id: 'invalid', value: Number.NaN, label: 'Unavailable sample' },
        { id: 'valid', value: 20, label: '20 localized tokens' },
      ],
      maximum: 100,
      empty: 'Localized empty series',
    }),
  )
  expect(metrics).toContain('Localized usage summary')
  expect(metrics).toContain('Measured by Host')
  expect(series).toContain('Localized token timeline')
  expect(series).toContain('20 localized tokens')
  expect(series).toContain('block-size:20%')
  expect(series).not.toContain('NaN')
  expect(series).not.toContain('Localized empty series')
  const selectableSeries = renderToStaticMarkup(
    createElement(HbarAppUiBarSeries, {
      label: 'Localized selectable timeline',
      points: [{ id: 'bucket', value: 12, label: 'Localized bucket details' }],
      selectedId: 'bucket',
      selectLabel: () => 'Filter localized records to this bucket',
      onSelect: () => undefined,
      empty: 'Localized empty series',
    }),
  )
  expect(selectableSeries).toContain('type="button"')
  expect(selectableSeries).toContain('aria-label="Filter localized records to this bucket"')
  expect(selectableSeries).toContain('aria-pressed="true"')
  const emptySeries = renderToStaticMarkup(
    createElement(HbarAppUiBarSeries, {
      label: 'Localized empty timeline',
      points: [],
      empty: 'Localized empty series',
    }),
  )
  expect(emptySeries).toContain('Localized empty series')
  expect(emptySeries).not.toContain('hbar-app-ui-bar-series')
})

test('settings list keeps host metadata structured and secondary removal inside an action menu', () => {
  const html = renderToStaticMarkup(
    createElement(HbarAppUiSettingsList, {
      label: 'Localized provider configurations',
      description: 'Localized provider list description',
      empty: 'Localized empty providers',
      addLabel: 'Localized add provider',
      refreshLabel: 'Localized refresh providers',
      items: [
        {
          id: 'provider-id',
          title: 'Localized provider name',
          metadata: ['Localized protocol', 'Localized default model', '3 localized models'],
          status: { label: 'Localized credential status', tone: 'positive' },
          editLabel: 'Localized edit provider',
          menuLabel: 'Localized provider actions',
          removeLabel: 'Localized remove provider',
        },
      ],
      onAdd: () => undefined,
      onRefresh: () => undefined,
      onOpen: () => undefined,
      onRemove: () => undefined,
    }),
  )
  expect(html).toContain('Localized provider name')
  expect(html).toContain('Localized default model')
  expect(html).toContain('Localized credential status')
  expect(html).toContain('role="menu" aria-label="Localized provider actions"')
  expect(html).toContain('role="menuitem"')
})
