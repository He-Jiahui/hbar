import { useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  DEFAULT_LUMEN_APPEARANCE,
  LumenProvider,
  LumenFrame,
  LumenButton,
  LumenContentText,
  LumenFloatingSurface,
  useFloatingTrigger,
} from '@lumen/app-ui'
import { HbarSessionToolsMenu, type SessionSecondaryTool } from '../../packages/app-react/src/session-tools-menu'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'

export interface SessionToolsContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly selected: SessionSecondaryTool | null
  readonly disabled: boolean
  readonly long?: boolean
}
declare global {
  interface Window {
    mountSessionToolsContent(input: SessionToolsContentInput): void
    updateSessionToolsContent(input: SessionToolsContentInput): void
    sessionToolsContentTargets(): readonly string[]
    disposeSessionToolsContent?: () => void
  }
}
const targets: string[] = []
let root: Root | undefined
function Fixture({ input }: { readonly input: SessionToolsContentInput }) {
  const copy = getShellCopy(input.locale).session.tools
  const repeat = input.long ? 8 : 1
  const labels = {
    ...copy,
    goals: copy.goals.repeat(repeat),
    agents: copy.agents.repeat(repeat),
    monitoring: copy.monitoring.repeat(repeat),
    settings: copy.settings.repeat(repeat),
  }
  const [other, setOther] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const otherEvents = useFloatingTrigger({ open: other, onOpen: () => setOther(true), onClose: () => setOther(false) })
  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, textSize: 'l', motion: false }}>
      <LumenFrame
        as="main"
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          blockSize: '100dvh',
          padding: '1rem',
          minInlineSize: 0,
        }}
      >
        <LumenFrame style={{ display: 'flex', justifyContent: 'flex-end', minInlineSize: 0 }}>
          <HbarSessionToolsMenu
            labels={labels}
            selected={input.selected}
            disabled={input.disabled}
            onToggleTool={(id) => targets.push(id)}
            onSettings={() => targets.push('settings')}
          />
        </LumenFrame>
        <LumenFrame style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', minInlineSize: 0 }}>
          <LumenButton data-tools-outside>{copy.files}</LumenButton>
          <LumenButton ref={anchor} {...otherEvents} data-tools-other>
            {copy.activity}
          </LumenButton>
        </LumenFrame>
        <LumenFloatingSurface
          open={other}
          onClose={() => setOther(false)}
          anchorRef={anchor}
          mode="anchored"
          placement="above"
          responsivePresentation="anchored"
          label={copy.activity}
          role="dialog"
        >
          <LumenContentText context="popover.title">{copy.activity}</LumenContentText>
        </LumenFloatingSurface>
      </LumenFrame>
    </LumenProvider>
  )
}
function mount(input: SessionToolsContentInput) {
  const node = document.getElementById('session-tools-content-fixture')
  if (!node) throw new Error('Missing owned tools fixture')
  root ??= createRoot(node)
  root.render(<Fixture input={input} />)
}
window.mountSessionToolsContent = (input) => {
  window.disposeSessionToolsContent?.()
  targets.length = 0
  mount(input)
}
window.updateSessionToolsContent = mount
window.sessionToolsContentTargets = () => targets
window.disposeSessionToolsContent = () => {
  root?.unmount()
  root = undefined
}
