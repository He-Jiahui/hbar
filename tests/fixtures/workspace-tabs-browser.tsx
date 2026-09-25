import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  HbarWorkspaceTabs,
  type HbarWorkspaceTabItem,
  type HbarWorkspaceTabCloseScope,
} from '../../packages/app-react/src/workspace-tabs'
import {
  HbarWorkspaceTabsCloseDialog,
  type HbarWorkspaceTabsCloseStatus,
} from '../../packages/app-react/src/workspace-tabs-close-dialog'
import { workspaceTabsCopy } from '../../apps/web/src/workspace-tabs-copy'
import '@lumen/app-ui/styles.css'
import '../../packages/hbar-app-ui/src/theme.css'

const titles = [
  '导航审查 — Navigation review',
  '执行中的会话 — Running conversation',
  '工作台来源 — Workbench source',
  '长标题：关闭、返回、滚动与源会话都必须绑定稳定目标',
]
function Fixture() {
  const [items, setItems] = useState<readonly HbarWorkspaceTabItem[]>(
    titles.map((title, index) => ({
      id: `tab-${index}`,
      kind: index === 2 ? 'workbench' : 'session',
      title,
      activity: index === 1 ? 'running' : 'idle',
    })),
  )
  const [active, setActive] = useState<string | null>('tab-0')
  const [event, setEvent] = useState('')
  const [busy, setBusy] = useState(false)
  const [locale, setLocale] = useState<'zh' | 'en'>('zh')
  const [dialog, setDialog] = useState<HbarWorkspaceTabsCloseStatus | null>(null)
  const copy = workspaceTabsCopy((zh, en) => (locale === 'zh' ? zh : en))
  const close = (id: string, scope: HbarWorkspaceTabCloseScope) =>
    setEvent(JSON.stringify({ action: 'close', id, scope }))
  return (
    <main>
      <HbarWorkspaceTabs
        items={items}
        activeId={active}
        busy={busy}
        labels={copy.tabs}
        onSelect={(id) => {
          setActive(id)
          setEvent(JSON.stringify({ action: 'select', id }))
        }}
        onRequestClose={close}
        onMove={(id, beforeId) => {
          setEvent(JSON.stringify({ action: 'move', id, beforeId }))
          setItems((current) => {
            const moved = current.find((item) => item.id === id)
            if (!moved) return current
            const rest = current.filter((item) => item.id !== id)
            const index = beforeId ? rest.findIndex((item) => item.id === beforeId) : rest.length
            return [
              ...rest.slice(0, index < 0 ? rest.length : index),
              moved,
              ...rest.slice(index < 0 ? rest.length : index),
            ]
          })
        }}
      />
      <section>
        <output aria-label="Fixture event">{event}</output>
        <output aria-label="Fixture order">{items.map((item) => item.id).join(',')}</output>
        <button
          onClick={() =>
            setItems(
              Array.from({ length: 32 }, (_, i) => ({
                id: `tab-${i}`,
                kind: 'session',
                title: `${i + 1} — 长名称会话与状态不会丢失`,
                activity: 'idle',
              })),
            )
          }
        >
          32 tabs
        </button>
        <button onClick={() => setActive('tab-31')}>Select last</button>
        <button onClick={() => setBusy(!busy)}>Toggle busy</button>
        <button onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}>Locale</button>
        <button onClick={() => setItems((current) => current.filter((item) => item.id !== 'tab-1'))}>
          Remove original target
        </button>
        {(['checking', 'choice', 'stopping', 'unknown', 'failed'] as const).map((status) => (
          <button key={status} onClick={() => setDialog(status)}>
            {status}
          </button>
        ))}
        <HbarWorkspaceTabsCloseDialog
          open={dialog !== null}
          status={dialog ?? 'choice'}
          targets={items.map((item) => ({
            id: item.id,
            title: item.title,
            runCount: item.activity === 'running' ? 1 : 0,
          }))}
          labels={copy.close}
          onCancel={() => {
            setDialog(null)
            setEvent('cancel')
          }}
          onKeepRunning={() => {
            setDialog(null)
            setEvent('keep')
          }}
          onStopAndClose={() => {
            setDialog('stopping')
            setEvent('stop')
          }}
          onRecheck={() => {
            setDialog('checking')
            setEvent('recheck')
          }}
        />
      </section>
    </main>
  )
}
const root = document.getElementById('fixture-root')
if (!root) throw new Error('Workspace tabs fixture mount is missing')
createRoot(root).render(<Fixture />)
