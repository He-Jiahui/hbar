import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Bot, ChartNoAxesColumnIncreasing, Check, Ellipsis, ListTodo, Settings } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenText } from '@lumen/app-ui'
import { sessionToolsMenuPosition } from './session-tools-menu-model'
import './session-tools-menu.css'

export type SessionSecondaryTool = 'monitoring' | 'agents' | 'goals'

export interface HbarSessionToolsMenuLabels {
  readonly more: string
  readonly current: (label: string) => string
  readonly monitoring: string
  readonly agents: string
  readonly goals: string
  readonly settings: string
}

const tools = [
  { id: 'goals', icon: ListTodo },
  { id: 'agents', icon: Bot },
  { id: 'monitoring', icon: ChartNoAxesColumnIncreasing },
] as const

/** Four content-grown actions. Only the viewport-constrained overlay may scroll. */
export function HbarSessionToolsMenu({
  labels,
  selected,
  disabled,
  onToggleTool,
  onSettings,
}: {
  readonly labels: HbarSessionToolsMenuLabels
  readonly selected: SessionSecondaryTool | null
  readonly disabled: boolean
  readonly onToggleTool: (tool: SessionSecondaryTool) => void
  readonly onSettings: () => void
}) {
  const id = useId()
  const anchor = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const firstFocus = useRef<'first' | 'last' | 'selected'>('selected')
  const place = () => {
    if (!anchor.current || !popup.current) return
    const position = sessionToolsMenuPosition(anchor.current.getBoundingClientRect(), {
      width: innerWidth,
      height: innerHeight,
      rem: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
    })
    popup.current.style.setProperty('--session-tools-menu-left', `${position.left}px`)
    popup.current.style.setProperty('--session-tools-menu-top', `${position.top}px`)
    popup.current.style.setProperty('--session-tools-menu-height', `${position.availableHeight}px`)
  }
  useEffect(() => {
    if (disabled) popup.current?.hidePopover()
  }, [disabled])
  useEffect(() => {
    if (!open) return
    const reposition = () => place()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open])
  const close = () => {
    popup.current?.hidePopover()
    anchor.current?.focus()
  }
  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const rows = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
    const index = rows.findIndex((row) => row === document.activeElement)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? rows.length - 1
          : (index + (event.key === 'ArrowUp' ? -1 : 1) + rows.length) % rows.length
    rows[next]?.focus()
  }
  return (
    <LumenFrame className="hbar-session-tools-menu">
      <LumenButton
        ref={anchor}
        type="button"
        variant="text"
        size="s"
        indicator="none"
        disabled={disabled}
        className="hbar-app-react-session-tool hbar-session-tools-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        data-selected={selected !== null}
        title={selected === null ? labels.more : labels.current(labels[selected])}
        aria-label={labels.more}
        popoverTarget={id}
        onClick={() => {
          firstFocus.current = 'selected'
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          firstFocus.current = event.key === 'ArrowUp' ? 'last' : 'first'
          popup.current?.showPopover()
        }}
      >
        <LumenIcon icon={Ellipsis} tier="sm" />
        <LumenText as="span">{labels.more}</LumenText>
      </LumenButton>
      <LumenFrame
        ref={popup}
        id={id}
        popover="auto"
        role="menu"
        aria-label={labels.more}
        className="hbar-session-tools-menu-popover"
        onBeforeToggle={(event) => {
          if (event.newState === 'open') place()
        }}
        onToggle={(event) => {
          const opening = event.newState === 'open'
          setOpen(opening)
          if (!opening) return
          requestAnimationFrame(() => {
            if (!popup.current?.matches(':popover-open')) return
            const rows = Array.from(popup.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
            const target =
              firstFocus.current === 'last'
                ? rows.at(-1)
                : firstFocus.current === 'selected'
                  ? (rows.find((row) => row.getAttribute('aria-checked') === 'true') ?? rows[0])
                  : rows[0]
            target?.focus()
          })
        }}
        onKeyDown={navigate}
      >
        {tools.map((tool) => (
          <LumenButton
            key={tool.id}
            type="button"
            variant="text"
            indicator="none"
            role="menuitemcheckbox"
            aria-checked={selected === tool.id}
            disabled={disabled}
            onClick={() => {
              close()
              onToggleTool(tool.id)
            }}
          >
            <LumenIcon icon={tool.icon} tier="sm" />
            <LumenText as="span" className="hbar-session-tools-menu-label">
              {labels[tool.id]}
            </LumenText>
            {selected === tool.id && <LumenIcon icon={Check} tier="sm" />}
          </LumenButton>
        ))}
        <LumenButton
          type="button"
          variant="text"
          indicator="none"
          role="menuitem"
          disabled={disabled}
          onClick={() => {
            close()
            onSettings()
          }}
        >
          <LumenIcon icon={Settings} tier="sm" />
          <LumenText as="span" className="hbar-session-tools-menu-label">
            {labels.settings}
          </LumenText>
        </LumenButton>
      </LumenFrame>
    </LumenFrame>
  )
}
