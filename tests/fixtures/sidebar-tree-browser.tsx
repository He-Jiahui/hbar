import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LumenTree, LumenTreeItem, LumenButton } from '@lumen/app-ui'
import LumenProvider from '@lumen/app-ui/provider'
import { DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui/appearance'
import '../../packages/hbar-app-ui/src/theme.css'

const copy = {
  tree: 'Project, parent Session and subagent tree',
  action: 'Rename Alpha',
  outside: 'Outside input',
  alpha: 'Alpha',
  bravo: 'Bravo',
  charlie: 'Charlie',
  delta: 'Delta',
  zulu: 'Zulu',
}
export interface SidebarTreeFixtureApi {
  removeChild(): void
  duplicate(): void
  events(): readonly string[]
}
declare global {
  interface Window {
    sidebarTreeFixture: SidebarTreeFixtureApi
  }
}
const events: string[] = []
function Fixture() {
  const [projectOpen, setProjectOpen] = useState(true)
  const [parentOpen, setParentOpen] = useState(false)
  const [childRemoved, setChildRemoved] = useState(false)
  const [duplicate, setDuplicate] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const activate = (id: string) => {
    events.push(`activate:${id}`)
    setSelected(id)
  }
  useEffect(() => {
    window.sidebarTreeFixture = {
      removeChild: () => setChildRemoved(true),
      duplicate: () => setDuplicate(true),
      events: () => events,
    }
  }, [])
  return (
    <LumenProvider appearance={DEFAULT_LUMEN_APPEARANCE} withCssBaseline={false}>
      <input aria-label={copy.outside} />
      <LumenTree label={copy.tree}>
        <LumenTreeItem
          nodeId="alpha"
          label={copy.alpha}
          expanded={projectOpen}
          onExpandedChange={setProjectOpen}
          content={
            <>
              <span>{copy.alpha}</span>
              <LumenButton onClick={() => events.push('action:alpha')}>{copy.action}</LumenButton>
            </>
          }
        >
          <LumenTreeItem
            nodeId="bravo"
            label={copy.bravo}
            expanded={parentOpen}
            onExpandedChange={setParentOpen}
            selected={selected === 'bravo'}
            onActivate={() => activate('bravo')}
            content={<span>{copy.bravo}</span>}
          >
            {!childRemoved && (
              <LumenTreeItem
                nodeId="charlie"
                label={copy.charlie}
                selected={selected === 'charlie'}
                onActivate={() => activate('charlie')}
                content={<span>{copy.charlie}</span>}
              />
            )}
          </LumenTreeItem>
          <LumenTreeItem
            nodeId="delta"
            label={copy.delta}
            onActivate={() => activate('delta')}
            content={<span>{copy.delta}</span>}
          />
        </LumenTreeItem>
        <LumenTreeItem
          nodeId={duplicate ? 'alpha' : 'zulu'}
          label={copy.zulu}
          onActivate={() => activate('zulu')}
          content={<span>{copy.zulu}</span>}
        />
      </LumenTree>
    </LumenProvider>
  )
}
const container = document.getElementById('fixture-root')
if (!container) throw new Error('Missing tree fixture root')
createRoot(container).render(<Fixture />)
