import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { LumenButton, LumenFloatingSurface, LumenFrame, LumenInput, useFloatingTrigger } from '@lumen/app-ui'
import { applyLumenAppearance, DEFAULT_LUMEN_APPEARANCE, type LumenMode } from '@lumen/app-ui/appearance'
import '@lumen/app-ui/styles.css'

export interface RecoveryFixtureInput {
  readonly mode: LumenMode
  readonly preserve: boolean
  readonly copy: {
    readonly title: string
    readonly open: string
    readonly search: string
    readonly remove: string
    readonly next: string
    readonly outside: string
    readonly draft: string
  }
}
declare global {
  interface Window {
    mountFloatingRecovery: (input: RecoveryFixtureInput) => void
    removeFloatingRecoveryControl: () => void
    releaseFloatingRecovery: () => void
  }
}
let removeFocused = () => {}
function Fixture({ copy, preserve }: RecoveryFixtureInput) {
  const anchor = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const next = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(true)
  const [draft, setDraft] = useState(copy.draft)
  removeFocused = () => setVisible(false)
  const events = useFloatingTrigger({ open, onOpen: () => setOpen(true), onClose: () => setOpen(false) })
  return (
    <LumenFrame className="recovery-fixture">
      <LumenInput aria-label={copy.outside} value={draft} onChange={(event) => setDraft(event.currentTarget.value)} />
      <LumenButton ref={anchor} {...events}>
        {copy.open}
      </LumenButton>
      <LumenFloatingSurface
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchor}
        label={copy.title}
        role="dialog"
        initialFocusRef={search}
        focusRecoveryRef={next}
        focusBehavior={preserve ? 'preserve' : 'surface'}
      >
        <LumenInput ref={search} aria-label={copy.search} />
        {visible && <LumenButton onClick={() => setVisible(false)}>{copy.remove}</LumenButton>}
        <LumenButton ref={next}>{copy.next}</LumenButton>
      </LumenFloatingSurface>
    </LumenFrame>
  )
}
const element = document.getElementById('floating-recovery-fixture')
if (!element) throw new Error('Missing floating recovery fixture')
const root = createRoot(element)
window.mountFloatingRecovery = (input) => {
  applyLumenAppearance(document.documentElement, { ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode })
  flushSync(() => root.render(<Fixture {...input} />))
}
window.removeFloatingRecoveryControl = () => flushSync(() => removeFocused())
window.releaseFloatingRecovery = () => root.unmount()
