import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Bot, ChartNoAxesColumnIncreasing, Check, Ellipsis, ListTodo, Settings } from 'lucide-react'
import {
  LumenButton,
  LumenContentText,
  LumenFloatingSurface,
  LumenFrame,
  LumenIcon,
  useFloatingTrigger,
} from '@lumen/app-ui'
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

/** Four content-grown actions. The shared viewport-constrained surface owns overflow. */
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
  const goals = useRef<HTMLButtonElement>(null)
  const agents = useRef<HTMLButtonElement>(null)
  const monitoring = useRef<HTMLButtonElement>(null)
  const settings = useRef<HTMLButtonElement>(null)
  const toolRefs = { goals, agents, monitoring }
  const [requestedOpen, setRequestedOpen] = useState(false)
  const [focusIntent, setFocusIntent] = useState<'first' | 'last' | 'selected'>('selected')
  const open = requestedOpen && !disabled
  useLayoutEffect(() => {
    if (disabled) setRequestedOpen(false)
  }, [disabled])
  const close = () => setRequestedOpen(false)
  const triggerEvents = useFloatingTrigger({
    open,
    onOpen: () => {
      setFocusIntent('selected')
      setRequestedOpen(true)
    },
    onClose: close,
  })
  const initialFocus =
    focusIntent === 'last' ? settings : focusIntent === 'first' || selected === null ? goals : toolRefs[selected]
  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const rows = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
    if (rows.length === 0) return
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
        {...triggerEvents}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          setFocusIntent(event.key === 'ArrowUp' ? 'last' : 'first')
          setRequestedOpen(true)
        }}
      >
        <LumenIcon icon={Ellipsis} tier="sm" />
        <LumenContentText context="control.label">{labels.more}</LumenContentText>
      </LumenButton>
      <LumenFloatingSurface
        id={id}
        open={open}
        onClose={close}
        anchorRef={anchor}
        mode="anchored"
        placement="below"
        anchorAlignment="end"
        responsivePresentation="anchored"
        initialFocusRef={initialFocus}
        restoreFocus
        keepMounted
        role="menu"
        label={labels.more}
        className="hbar-session-tools-menu-popover"
        onKeyDown={navigate}
      >
        {tools.map((tool) => (
          <LumenButton
            key={tool.id}
            ref={toolRefs[tool.id]}
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
            <LumenContentText context="collection.title" className="hbar-session-tools-menu-label">
              {labels[tool.id]}
            </LumenContentText>
            {selected === tool.id && <LumenIcon icon={Check} tier="sm" />}
          </LumenButton>
        ))}
        <LumenButton
          ref={settings}
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
          <LumenContentText context="collection.title" className="hbar-session-tools-menu-label">
            {labels.settings}
          </LumenContentText>
        </LumenButton>
      </LumenFloatingSurface>
    </LumenFrame>
  )
}
