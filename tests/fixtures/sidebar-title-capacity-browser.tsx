import { createRoot } from 'react-dom/client'
import { createStore, useStore } from 'zustand'
import { workspaceSchema } from '@hbar/contracts/directory'
import { LumenAppSidebar, LumenButton, LumenFrame, LumenTree, LumenTreeItem } from '@lumen/app-ui'
import LumenProvider from '@lumen/app-ui/provider'
import { DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui/appearance'
import { getShellCopy, type ShellLocale } from '../../apps/web/src/shell-copy'
import { SidebarTitle } from '../../packages/app-react/src/sidebar-title'
import '../../packages/app-react/src/lumen-workspace-shell.css'

export interface SidebarTitleCapacityInput {
  readonly locale: ShellLocale
  readonly mode: 'light' | 'dark'
  readonly names: readonly string[]
  readonly selected: string | null
}
const owner = createStore<{ input: SidebarTitleCapacityInput }>(() => ({
  input: { locale: 'en-US', mode: 'dark', names: [], selected: null },
}))
const actions: string[] = []
function Fixture() {
  const input = useStore(owner, (state) => state.input)
  const labels = getShellCopy(input.locale).shell
  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, textSize: 'l', motion: false }}>
      <LumenFrame
        as="main"
        className="hbar-app-react-sidebar-surface"
        style={{ blockSize: 'calc(100dvh / 1.25)', maxInlineSize: '100%', zoom: 1.25 }}
      >
        <LumenAppSidebar
          brand={labels.brand}
          title={labels.projectsAndSessions}
          emptyLabel={labels.noWorkspaces}
          status={{ label: labels.server, value: labels.connected, tone: 'success' }}
          actions={<LumenButton onClick={() => actions.push('settings')}>{labels.settings}</LumenButton>}
        >
          {input.names.length ? (
            <LumenTree className="hbar-app-react-project-tree" label={labels.projectsAndSessions}>
              {input.names.map((name, index) => (
                <LumenTreeItem
                  key={index}
                  nodeId={`project:${index}`}
                  label={name}
                  selected={input.selected === `project:${index}`}
                  onActivate={() => actions.push(`open:${index}`)}
                  content={
                    <LumenFrame className="hbar-app-react-workspace-line">
                      <LumenFrame className="hbar-app-react-workspace-row">
                        <SidebarTitle text={name} />
                      </LumenFrame>
                      <LumenButton
                        aria-label={labels.createSessionInWorkspace(name)}
                        onClick={() => actions.push(`new:${index}`)}
                      >
                        {labels.newSession}
                      </LumenButton>
                    </LumenFrame>
                  }
                />
              ))}
            </LumenTree>
          ) : undefined}
        </LumenAppSidebar>
      </LumenFrame>
    </LumenProvider>
  )
}
declare global {
  interface Window {
    setSidebarTitleCapacity(input: SidebarTitleCapacityInput): void
    sidebarTitleCapacityActions(): readonly string[]
    canRenderSidebarWorkspaceName(name: string): boolean
  }
}
window.setSidebarTitleCapacity = (input) => {
  for (const name of input.names) workspaceSchema.shape.name.parse(name)
  owner.setState({ input })
}
window.sidebarTitleCapacityActions = () => actions
window.canRenderSidebarWorkspaceName = (name) => workspaceSchema.shape.name.safeParse(name).success
const root = document.getElementById('fixture-root')
if (!root) throw new Error('Missing owned sidebar title fixture')
createRoot(root).render(<Fixture />)
