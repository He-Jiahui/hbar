import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import {
  LumenButton,
  LumenContentText,
  LumenFloatingSurface,
  LumenFrame,
  LumenInput,
  useFloatingTrigger,
  type FloatingResponsivePresentation,
} from '@lumen/app-ui'
import '@lumen/app-ui/styles.css'
import { applyLumenAppearance, DEFAULT_LUMEN_APPEARANCE, type LumenMode } from '@lumen/app-ui/appearance'

interface FloatingPresentationCopy {
  readonly title: string
  readonly open: string
  readonly search: string
  readonly close: string
  readonly other: string
  readonly detail: string
}
interface FloatingPresentationInput {
  readonly copy: FloatingPresentationCopy
  readonly presentation: FloatingResponsivePresentation
  readonly mode: LumenMode
}
declare global {
  interface Window {
    renderFloatingPresentationFixture: (input: FloatingPresentationInput) => void
    releaseFloatingPresentationFixture: () => void
  }
}
function FloatingPresentationFixture({ copy, presentation }: FloatingPresentationInput) {
  const [open, setOpen] = useState(false)
  const [otherOpen, setOtherOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const other = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const triggerEvents = useFloatingTrigger({ open, onOpen: () => setOpen(true), onClose: () => setOpen(false) })
  const otherEvents = useFloatingTrigger({
    open: otherOpen,
    onOpen: () => setOtherOpen(true),
    onClose: () => setOtherOpen(false),
  })
  return (
    <LumenFrame className="floating-fixture">
      <LumenFrame className="floating-fixture-main">
        <LumenContentText context="workspace.title">{copy.title}</LumenContentText>
        <LumenButton ref={other} {...otherEvents} aria-expanded={otherOpen} aria-haspopup="dialog">
          {copy.other}
        </LumenButton>
      </LumenFrame>
      <LumenFrame className="floating-fixture-controls">
        <LumenButton ref={trigger} {...triggerEvents} aria-expanded={open} aria-haspopup="dialog">
          {copy.open}
        </LumenButton>
      </LumenFrame>
      <LumenFloatingSurface
        open={open}
        onClose={() => setOpen(false)}
        mode="anchored"
        anchorRef={trigger}
        initialFocusRef={search}
        responsivePresentation={presentation}
        placement="above"
        label={copy.title}
        role="dialog"
        className="floating-fixture-popup"
      >
        <LumenFrame className="floating-fixture-heading">
          <LumenContentText context="popover.title">{copy.title}</LumenContentText>
          <LumenButton onClick={() => setOpen(false)}>{copy.close}</LumenButton>
        </LumenFrame>
        <LumenInput ref={search} type="search" aria-label={copy.search} />
        <LumenFrame className="floating-fixture-reading" role="region" aria-label={copy.detail} tabIndex={0}>
          <LumenContentText context="popover.body">{copy.detail}</LumenContentText>
        </LumenFrame>
      </LumenFloatingSurface>
      <LumenFloatingSurface
        open={otherOpen}
        onClose={() => setOtherOpen(false)}
        mode="anchored"
        anchorRef={other}
        label={copy.other}
        role="dialog"
        className="floating-fixture-popup"
      >
        <LumenButton onClick={() => setOtherOpen(false)}>{copy.close}</LumenButton>
      </LumenFloatingSurface>
    </LumenFrame>
  )
}
const element = document.getElementById('floating-presentation-fixture')
if (!element) throw new Error('Missing floating presentation fixture root')
const root = createRoot(element)
window.renderFloatingPresentationFixture = (input) => {
  applyLumenAppearance(document.documentElement, { ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode })
  flushSync(() => root.render(<FloatingPresentationFixture {...input} />))
}
window.releaseFloatingPresentationFixture = () => root.unmount()
