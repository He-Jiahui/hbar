import './theme-bridge'
import { useId, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { LumenButton, LumenContentText, LumenFrame, LumenIcon, LumenText } from '@lumen/app-ui'
import type { HbarMessageActivityPart } from './session-message'
import './session-message.css'
import './session-text.css'

export interface HbarActivityDisclosureProps {
  readonly summary: string | readonly HbarMessageActivityPart[]
  readonly active?: boolean
  readonly feedback?: ReactNode
  readonly children: ReactNode
}

/** Shared light disclosure for within-message and cross-message activity, with normal-flow wrapping. */
export function HbarActivityDisclosure({ summary, active = false, feedback, children }: HbarActivityDisclosureProps) {
  const [pinnedOpen, setPinnedOpen] = useState<boolean | null>(null)
  const contentId = useId()
  const open = pinnedOpen ?? active
  const title = typeof summary === 'string' ? summary : summary.map((part) => part.text).join('')
  return (
    <LumenFrame className="hbar-session-activity" data-live={active}>
      <LumenButton
        variant="text"
        indicator="none"
        size="s"
        className="hbar-session-activity-summary"
        title={title}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setPinnedOpen(!open)}
      >
        {active && (
          <LumenText
            as="span"
            className="lumen-effect hbar-session-tool-status-indicator"
            data-lumen-state="running"
            aria-hidden="true"
          />
        )}
        <LumenContentText context="control.label" className="hbar-session-activity-summary-text">
          {typeof summary === 'string'
            ? summary
            : summary.map((part, index) => (
                <LumenContentText context="control.label" key={index} data-activity-role={part.role}>
                  {part.text}
                </LumenContentText>
              ))}
        </LumenContentText>
        <LumenIcon icon={open ? ChevronDown : ChevronRight} tier="sm" />
      </LumenButton>
      {feedback}
      <LumenFrame id={contentId} className="hbar-session-activity-steps" hidden={!open}>
        {open ? children : null}
      </LumenFrame>
    </LumenFrame>
  )
}
