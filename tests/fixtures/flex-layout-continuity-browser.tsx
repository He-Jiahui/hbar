import { useEffect, useId, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LumenButton, LumenInput } from '@lumen/app-ui'
import { HbarDesktopLayoutProjection } from '../../packages/app-react/src/lumen-flex-layout-adapter'
import { usePersistentPane } from '../../packages/app-react/src/persistent-pane'
import { shellLayout, shellLayoutToFlexModel } from '../../apps/web/src/shell-layout'
import '../../packages/hbar-app-ui/src/theme.css'
import './flex-layout-continuity-browser.css'

interface PaneContent {
  readonly draft: string
  readonly sidebar: string
  readonly tool: string
  readonly replace: string
  readonly responsive: string
  readonly rows: readonly { readonly id: string; readonly text: string }[]
}

function WorkspacePane({ content }: { readonly content: PaneContent }) {
  const [draft, setDraft] = useState('')
  const instanceId = useId()
  return (
    <main className="continuity-pane" data-instance-id={instanceId}>
      <LumenInput aria-label={content.draft} value={draft} onChange={(event) => setDraft(event.target.value)} />
      <div className="continuity-scroll">
        {content.rows.map((row) => (
          <p key={row.id}>{row.text}</p>
        ))}
      </div>
    </main>
  )
}

function ContinuityFixture({ content }: { readonly content: PaneContent }) {
  const [width, setWidth] = useState(innerWidth)
  const [sidebar, setSidebar] = useState(true)
  const [tool, setTool] = useState(true)
  const [replacement, setReplacement] = useState(false)
  const [persistent, setPersistent] = useState(false)
  const workspace = usePersistentPane(persistent ? <WorkspacePane key={String(replacement)} content={content} /> : null)
  useEffect(() => {
    const update = () => setWidth(innerWidth)
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  const model = useMemo(() => {
    const projected = shellLayoutToFlexModel(shellLayout, {
      geometry: { widthPx: width, remPx: 16, splitterSizePx: 8 },
      sidebarVisible: sidebar && width >= 960,
      toolVisible: tool && width >= 960,
    })
    if (replacement) {
      const workspace = projected.layout.children?.find((node) => node.id === 'workspace')
      const tab = workspace?.type === 'tabset' ? workspace.children?.[0] : undefined
      if (tab) tab.id = 'replacement-workspace-pane'
    }
    return projected
  }, [width, sidebar, tool, replacement])
  return (
    <div className="continuity-fixture">
      <div className="continuity-actions">
        <LumenButton onClick={() => setSidebar((value) => !value)}>{content.sidebar}</LumenButton>
        <LumenButton onClick={() => setTool((value) => !value)}>{content.tool}</LumenButton>
        <LumenButton onClick={() => setReplacement(true)}>{content.replace}</LumenButton>
        <LumenButton onClick={() => setPersistent(true)}>{content.responsive}</LumenButton>
      </div>
      {persistent && width < 1000 ? (
        <section className="continuity-compact">{workspace.outlet}</section>
      ) : (
        <HbarDesktopLayoutProjection
          model={model}
          panes={{
            projects: <aside>{content.sidebar}</aside>,
            workspace: (
              <div className="continuity-pane-host">
                {persistent ? workspace.outlet : <WorkspacePane content={content} />}
              </div>
            ),
            'session-tool': <aside>{content.tool}</aside>,
          }}
        />
      )}
      {workspace.portal}
    </div>
  )
}

const chinese = document.documentElement.lang.startsWith('zh')
const content: PaneContent = {
  draft: chinese ? '调整窗口后保留的本地草稿' : 'Local draft preserved after resizing',
  sidebar: chinese ? '切换左侧栏' : 'Toggle sidebar',
  tool: chinese ? '切换工具栏' : 'Toggle tool',
  replace: chinese ? '打开新的工作区视图' : 'Open a different workspace view',
  responsive: chinese ? '验证自适应外壳切换' : 'Verify responsive shell changes',
  rows: Array.from({ length: 80 }, (_, index) => ({
    id: `row-${index}`,
    text: chinese ? `原内容第 ${index + 1} 行` : `Original content row ${index + 1}`,
  })),
}
const element = document.getElementById('fixture-root')
if (!element) throw new Error('Continuity fixture root is missing')
createRoot(element).render(<ContinuityFixture content={content} />)
