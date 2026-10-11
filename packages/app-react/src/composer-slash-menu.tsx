import { Bot, Box, CircleDollarSign, HelpCircle, Minimize2, Settings, Target } from 'lucide-react'
import { LumenContentText, LumenButton, LumenFrame, LumenIcon } from '@lumen/app-ui'
import type { AgentComposerState } from '@hbar/app-runtime'
import { slashMatches, type LocalSlashCommand } from './composer-slash'
import type { HbarComposerAgentNoticeLabels } from './composer-agent-notice'
import './composer-slash-menu.css'

type AgentProfileId = AgentComposerState['profileCatalog']['profiles'][number]

export interface HbarComposerSlashLabels {
  readonly menu: string
  readonly commands: readonly {
    readonly id: LocalSlashCommand
    readonly label: string
    readonly argumentHint?: string
    readonly description: string
  }[]
  readonly select: (name: string) => string
  readonly hint: string
  readonly agentProfile: (profileId: AgentProfileId) => { readonly label: string; readonly description: string }
  readonly agentTaskHint: string
  readonly agentRequired: string
  readonly agentCatalogUnavailable: string
  readonly agentProfileUnavailable: (profileId: string) => string
  readonly agentNotice: HbarComposerAgentNoticeLabels
  readonly attachmentsBlocked: string
  readonly modelBusy: string
  readonly goalRequired: string
  readonly goalBusy: string
  readonly goalSnapshotUnavailable: string
  readonly goalConfirmReplace: (objective: string) => string
  readonly goalConfirmClear: (objective: string) => string
  readonly goalConfirm: string
  readonly goalCancel: string
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
              <LumenIcon
                icon={
                  command === 'model'
                    ? Box
                    : command === 'goal'
                      ? Target
                      : command === 'agents' || command === 'agent' || command.startsWith('agent ')
                        ? Bot
                        : command === 'cost'
                          ? CircleDollarSign
                          : command === 'help'
                            ? HelpCircle
                            : command === 'compact'
                              ? Minimize2
                              : Settings
                }
                tier="sm"
              />
              <LumenContentText context="control.label" className="hbar-composer-slash-name">
                {item.label} {item.argumentHint}
              </LumenContentText>
              <LumenContentText context="choice.description" className="hbar-composer-slash-description">
                {item.description}
              </LumenContentText>
            </LumenButton>
          )
        })}
      </LumenFrame>
      <LumenContentText context="message.inline" className="hbar-composer-slash-hint">
        {labels.hint}
      </LumenContentText>
    </LumenFrame>
  )
}
