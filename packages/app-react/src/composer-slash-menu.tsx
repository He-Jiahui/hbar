import { Box, Settings } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenText } from '@lumen/app-ui'
import { slashMatches, type LocalSlashCommand } from './composer-slash'
import './composer-slash-menu.css'

export interface HbarComposerSlashLabels {
  readonly menu: string
  readonly commands: readonly {
    readonly id: LocalSlashCommand
    readonly label: string
    readonly description: string
  }[]
  readonly select: (name: string) => string
  readonly hint: string
  readonly attachmentsBlocked: string
  readonly modelBusy: string
  readonly error: (code: string) => string
}

export function HbarComposerSlashMenu({
  id,
  term,
  selected,
  labels,
  onSelect,
  onHover,
}: {
  readonly id: string
  readonly term: string
  readonly selected: number
  readonly labels: HbarComposerSlashLabels
  readonly onSelect: (command: LocalSlashCommand) => void
  readonly onHover: (index: number) => void
}) {
  const matches = slashMatches(
    term,
    labels.commands.map((item) => item.id),
  )
  if (!matches.length) return null
  const selectedIndex = Math.min(selected, matches.length - 1)
  return (
    <LumenFrame
      id={id}
      className="hbar-composer-mention-menu hbar-composer-slash-menu"
      role="listbox"
      aria-label={labels.menu}
    >
      <LumenFrame className="hbar-composer-slash-items">
        {matches.map((command, index) => {
          const item = labels.commands.find((entry) => entry.id === command)
          if (!item) return null
          return (
            <LumenButton
              key={command}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={index === selectedIndex}
              aria-label={labels.select(item.label)}
              size="s"
              variant="text"
              indicator="none"
              className="hbar-composer-slash-item"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => onHover(index)}
              onClick={() => onSelect(command)}
            >
              <LumenIcon icon={command === 'model' ? Box : Settings} tier="sm" />
              <LumenText as="span" className="hbar-composer-slash-name">
                {item.label}
              </LumenText>
              <LumenText as="span" className="hbar-composer-slash-description">
                {item.description}
              </LumenText>
            </LumenButton>
          )
        })}
      </LumenFrame>
      <LumenText as="span" className="hbar-composer-slash-hint">
        {labels.hint}
      </LumenText>
    </LumenFrame>
  )
}
