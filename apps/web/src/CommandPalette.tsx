import { useEffect, useMemo, useRef, useState } from 'react'
import { Command as CommandIcon, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface PaletteCommand {
  id: string
  label: string
  description?: string
  keywords?: readonly string[]
  icon?: LucideIcon
  execute(): void
}

interface CommandPaletteProps {
  open: boolean
  commands: readonly PaletteCommand[]
  onClose(): void
}

export default function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return commands
    return commands.filter((command) =>
      [command.label, command.description ?? '', ...(command.keywords ?? [])].some((value) =>
        value.toLocaleLowerCase().includes(needle),
      ),
    )
  }, [commands, query])

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
    setSelected((index) => Math.min(index, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  if (!open) return null

  const runSelected = () => {
    const command = filtered[selected]
    if (!command) return
    onClose()
    command.execute()
  }

  return (
    <div
      className="command-palette-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="命令面板">
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
                setSelected((index) => (filtered.length ? (index + 1) % filtered.length : 0))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setSelected((index) => (filtered.length ? (index - 1 + filtered.length) % filtered.length : 0))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                runSelected()
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="command-palette-list" role="listbox" aria-label="可用命令">
          {filtered.length ? (
            filtered.map((command, index) => {
              const Icon = command.icon ?? CommandIcon
              return (
                <button
                  key={command.id}
                  type="button"
                  role="option"
                  aria-selected={index === selected}
                  className={index === selected ? 'selected' : ''}
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => {
                    onClose()
                    command.execute()
                  }}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span className="command-palette-copy">
                    <strong>{command.label}</strong>
                    {command.description && <small>{command.description}</small>}
                  </span>
                </button>
              )
            })
          ) : (
            <p className="command-palette-empty">没有匹配命令</p>
          )}
        </div>
      </section>
    </div>
  )
}
