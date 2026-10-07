import { useId, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { LumenFrame, LumenContentText, LumenButton, LumenIcon } from '@lumen/app-ui'
import './lumen-disclosure.css'

export interface HbarLumenDisclosureProps {
  readonly label: ReactNode
  readonly children: ReactNode
  readonly defaultOpen?: boolean
  readonly open?: boolean
  readonly onOpenChange?: (open: boolean) => void
  readonly className?: string
}

/** A disclosure composed from Lumen controls for app-owned expandable content. */
export function HbarLumenDisclosure({
  label,
  children,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  className,
}: HbarLumenDisclosureProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const open = controlledOpen ?? uncontrolledOpen
  const contentId = useId()
  const triggerId = useId()
  const toggle = () => {
    const next = !open
    if (controlledOpen === undefined) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }
  return (
    <LumenFrame
      as="section"
      className={['hbar-lumen-disclosure', className].filter(Boolean).join(' ')}
      data-open={open}
    >
      <LumenFrame
        className="hbar-lumen-disclosure-trigger-reading"
        role="group"
        aria-labelledby={triggerId}
        tabIndex={0}
      >
        <LumenButton
          id={triggerId}
          className="hbar-lumen-disclosure-trigger"
          type="button"
          variant="text"
          indicator="none"
          size="s"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={toggle}
        >
          <LumenIcon icon={open ? ChevronDown : ChevronRight} tier="sm" />
          <LumenContentText context="control.label">{label}</LumenContentText>
        </LumenButton>
      </LumenFrame>
      <LumenFrame id={contentId} className="hbar-lumen-disclosure-content" hidden={!open}>
        {children}
      </LumenFrame>
    </LumenFrame>
  )
}
