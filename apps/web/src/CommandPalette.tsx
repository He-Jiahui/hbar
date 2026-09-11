import { useEffect, useMemo, useRef, useState } from 'react'
import { Command as CommandIcon, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import GlassSurface from './react-bits/GlassSurface'
import SpotlightCard from './react-bits/SpotlightCard'

export interface PaletteCommand {
  id: string
  label: string
  description?: string
  keywords?: readonly string[]
  icon?: LucideIcon
  group?: PaletteCommandGroup
  execute(): void
}

export type PaletteCommandGroup = 'navigation' | 'actions'

const GROUP_LABELS: Record<PaletteCommandGroup, string> = {
  navigation: '导航',
  actions: '操作',
}

interface CommandPaletteProps {
  open: boolean
  commands: readonly PaletteCommand[]
  onClose(): void
}

export default function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [recentIds, setRecentIds] = useState<string[]>([])
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem('hbar.command-palette.recent') ?? '[]')
      if (Array.isArray(stored)) setRecentIds(stored.filter((id): id is string => typeof id === 'string').slice(0, 5))
    } catch {
      setRecentIds([])
    }
  }, [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return commands
    return commands.filter((command) =>
      [command.label, command.description ?? '', ...(command.keywords ?? [])].some((value) =>
        value.toLocaleLowerCase().includes(needle),
      ),
    )
  }, [commands, query])

  const grouped = useMemo(() => {
    const recent = query.trim()
      ? []
      : recentIds
          .map((id) => filtered.find((command) => command.id === id))
          .filter((command): command is PaletteCommand => Boolean(command))
    const recentSet = new Set(recent.map((command) => command.id))
    const groups = (['navigation', 'actions'] as const)
      .map((group) => ({
        group,
        commands: filtered.filter((command) => (command.group ?? 'actions') === group && !recentSet.has(command.id)),
      }))
      .filter((entry) => entry.commands.length > 0)
    return { recent, groups, flat: [...recent, ...groups.flatMap((entry) => entry.commands)] }
  }, [filtered, query, recentIds])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setQuery('')
    setSelected(0)
    const frame = requestAnimationFrame(() => input.current?.focus())
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown)
      previous?.focus()
    }
  }, [onClose, open])

  useEffect(() => {
    setSelected((index) => Math.min(index, Math.max(0, grouped.flat.length - 1)))
  }, [grouped.flat.length])

  if (!open) return null

  const runSelected = () => {
    const command = grouped.flat[selected]
    if (!command) return
    executeCommand(command)
  }

  const executeCommand = (command: PaletteCommand) => {
    onClose()
    setRecentIds((current) => {
      const next = [command.id, ...current.filter((id) => id !== command.id)].slice(0, 5)
      try {
        localStorage.setItem('hbar.command-palette.recent', JSON.stringify(next))
      } catch {
        // Storage can be unavailable in private or embedded contexts.
      }
      return next
    })
    command.execute()
  }

  const renderCommand = (command: PaletteCommand, index: number) => {
    const Icon = command.icon ?? CommandIcon
    return (
      <SpotlightCard
        as="button"
        key={command.id}
        type="button"
        role="option"
        aria-selected={index === selected}
        className={`command-palette-item ${index === selected ? 'selected' : ''}`}
        spotlightColor="color-mix(in srgb, var(--rb-accent) 22%, transparent)"
        onMouseEnter={() => setSelected(index)}
        onClick={() => executeCommand(command)}
      >
        <Icon size={16} aria-hidden="true" />
        <span className="command-palette-copy">
          <strong>{command.label}</strong>
          {command.description && <small>{command.description}</small>}
        </span>
      </SpotlightCard>
    )
  }

  return (
    <div
      className="command-palette-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <GlassSurface
        className="command-palette"
        width="min(620px, 100%)"
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
      >
        <div className="command-palette-search">
          <Search size={16} aria-hidden="true" />
          <input
            ref={input}
            type="search"
            aria-label="搜索命令"
            placeholder="搜索命令"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setSelected(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setSelected((index) => (grouped.flat.length ? (index + 1) % grouped.flat.length : 0))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setSelected((index) => (grouped.flat.length ? (index - 1 + grouped.flat.length) % grouped.flat.length : 0))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                runSelected()
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="command-palette-list" role="listbox" aria-label="可用命令">
          {grouped.flat.length ? (
            <>
              {grouped.recent.length > 0 && (
                <section className="command-palette-group" aria-label="最近使用">
                  <h3>最近使用</h3>
                  {grouped.recent.map((command) => renderCommand(command, grouped.flat.indexOf(command)))}
                </section>
              )}
              {grouped.groups.map(({ group, commands: groupCommands }) => (
                <section className="command-palette-group" key={group} aria-label={GROUP_LABELS[group]}>
                  <h3>{GROUP_LABELS[group]}</h3>
                  {groupCommands.map((command) => renderCommand(command, grouped.flat.indexOf(command)))}
                </section>
              ))}
            </>
          ) : (
            <p className="command-palette-empty">没有匹配命令</p>
          )}
        </div>
      </GlassSurface>
    </div>
  )
}
