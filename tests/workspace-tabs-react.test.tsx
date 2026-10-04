import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  HbarWorkspaceTabs,
  uniqueWorkspaceTabs,
  type HbarWorkspaceTabItem,
} from '../packages/app-react/src/workspace-tabs'
import { HbarWorkspaceTabsCloseDialog } from '../packages/app-react/src/workspace-tabs-close-dialog'
import { workspaceTabsCopy } from '../apps/web/src/workspace-tabs-copy'

const labels = workspaceTabsCopy((zh) => zh)
const item = (index: number): HbarWorkspaceTabItem => ({
  id: `tab-${index}`,
  kind: 'session',
  title: `会话 ${index}：保留原始目标与足够长的本地化标题`,
  activity: 'idle',
})
const props = { busy: false, labels: labels.tabs, onSelect: () => {}, onRequestClose: () => {}, onMove: () => {} }
test('open tabs render empty, one, normal, capacity and one over capacity without silently dropping content', () => {
  expect(renderToStaticMarkup(<HbarWorkspaceTabs {...props} items={[]} activeId={null} />)).toContain(labels.tabs.empty)
  for (const count of [1, 4, 32, 33]) {
    const html = renderToStaticMarkup(
      <HbarWorkspaceTabs {...props} items={Array.from({ length: count }, (_, i) => item(i))} activeId="tab-0" />,
    )
    expect(html.match(/role="tab"/g)).toHaveLength(count)
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1)
    expect(html).toContain(item(count - 1).title)
  }
})
test('duplicate identities retain their first item, stale selection is not fabricated, and unknown is not shown as running', () => {
  const items = [item(0), { ...item(0), title: 'duplicate' }, { ...item(1), activity: 'unknown' as const }]
  expect(uniqueWorkspaceTabs(items)).toHaveLength(2)
  const html = renderToStaticMarkup(<HbarWorkspaceTabs {...props} items={items} activeId="missing" />)
  expect(html.match(/role="tab"/g)).toHaveLength(2)
  expect(html).not.toContain('duplicate')
  expect(html).not.toContain('aria-selected="true"')
  expect(html).not.toContain(labels.tabs.activity('unknown'))
  expect(html).not.toContain('data-activity="unknown"')
})
test('an Agent-origin child keeps its real session title and receives a distinct semantic tab glyph', () => {
  const child: HbarWorkspaceTabItem = { id: 'child', kind: 'agent-run', title: 'Child task', activity: 'running' }
  const html = renderToStaticMarkup(<HbarWorkspaceTabs {...props} items={[child]} activeId="child" />)
  expect(html).toContain('Child task')
  expect(html).toContain('lucide-bot')
  expect(html).toContain(labels.tabs.activity('running'))
})
test('close dialog renders unknown as read-only reconciliation, not another stop action', () => {
  const shared = {
    open: true,
    targets: [{ id: 'original', title: '原会话', runCount: 2 }],
    labels: labels.close,
    onCancel: () => {},
    onKeepRunning: () => {},
    onStopAndClose: () => {},
    onRecheck: () => {},
  }
  const unknown = renderToStaticMarkup(<HbarWorkspaceTabsCloseDialog {...shared} status="unknown" error="连接中断" />)
  expect(unknown).toContain(labels.close.keepRunning)
  expect(unknown).not.toContain(labels.close.stopAndClose)
  expect(unknown).toContain(labels.close.recheck)
  expect(unknown).not.toContain(labels.close.stopAndClose)
  expect(unknown).toContain('role="alert"')
  expect(unknown).toContain(labels.close.target('原会话', 2))
  const choice = renderToStaticMarkup(<HbarWorkspaceTabsCloseDialog {...shared} status="choice" />)
  expect(choice).toContain(labels.close.stopAndClose)
  expect(choice).toContain(labels.close.keepRunning)
  const stopping = renderToStaticMarkup(<HbarWorkspaceTabsCloseDialog {...shared} status="stopping" />)
  expect(stopping).toContain('aria-busy="true"')
  expect(stopping).not.toContain(labels.close.stopAndClose)
})
