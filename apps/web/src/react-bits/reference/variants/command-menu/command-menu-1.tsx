import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, FileText, FolderSearch, Search, Settings2, Users, X } from 'lucide-react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './command-menu-1.css'

type CommandItem = { label: string; description?: string; shortcut?: string; icon: typeof Search }

const recent: CommandItem[] = [
  { label: 'Launch readiness review', description: 'Review launch checklist and owners', icon: CalendarClock },
  { label: 'Incident 4821, checkout latency', description: 'Open incident workspace', icon: FileText },
  { label: 'Q3 roadmap draft', description: 'Open the latest roadmap document', icon: FolderSearch },
]
const navigation: CommandItem[] = [
  { label: 'Release overview', shortcut: 'G O', icon: FolderSearch },
  { label: 'Runbooks and docs', shortcut: 'G D', icon: FileText },
  { label: 'Team directory', shortcut: 'G P', icon: Users },
  { label: 'Workspace settings', shortcut: 'G S', icon: Settings2 },
]
const actions: CommandItem[] = [
  { label: 'Invite a teammate', icon: Users },
  { label: 'Schedule a launch review', icon: CalendarClock },
  { label: 'Rotate an API key', icon: Settings2 },
]

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/command-menu/command-menu-1. */
export default function CommandMenu1({ onInteraction }: ReferenceFixtureProps) {
  const [open, setOpen] = useState(true)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const all = useMemo(() => [...recent, ...navigation, ...actions], [])
  const matching = useMemo(() => {
    const term = query.trim().toLowerCase()
    return term ? all.filter((item) => `${item.label} ${item.description ?? ''}`.toLowerCase().includes(term)) : all
  }, [all, query])
  useEffect(() => { if (open) inputRef.current?.focus() }, [open])
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); return }
      if (!open) return
      if (event.key === 'ArrowDown') { event.preventDefault(); setSelected((value) => Math.min(value + 1, Math.max(matching.length - 1, 0))) }
      if (event.key === 'ArrowUp') { event.preventDefault(); setSelected((value) => Math.max(value - 1, 0)) }
      if (event.key === 'Enter') { event.preventDefault(); setOpen(false) }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, matching.length])
  const renderGroup = (label: string, items: CommandItem[], descriptions = false) => {
    const visible = items.filter((item) => matching.includes(item))
    if (visible.length === 0) return null
    return <section className="rb-public-command-1-group" key={label}><h2 className="rb-public-command-1-group-label">{label}</h2>{visible.map((item) => {
      const index = matching.indexOf(item)
      const Icon = item.icon
      return <button type="button" className={`rb-public-command-1-item${descriptions ? ' has-description' : ''}${selected === index ? ' selected' : ''}`} key={item.label} onMouseEnter={() => setSelected(index)} onClick={() => setOpen(false)}><Icon size={16} /><span className="rb-public-command-1-item-copy"><strong>{item.label}</strong>{descriptions && item.description && <small>{item.description}</small>}</span>{item.shortcut && <kbd>{item.shortcut}</kbd>}</button>
    })}</section>
  }
  return <main className="rb-public-command-1" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}>
    {!open && <button type="button" className="rb-public-command-1-launcher" onClick={() => setOpen(true)}><Search size={16} /><span>Search or run a command</span><kbd>⌘K</kbd></button>}
    {open && <div className="rb-public-command-1-scrim" role="presentation"><section className="rb-public-command-1-palette" role="dialog" aria-label="Command menu"><div className="rb-public-command-1-search-row"><Search size={16} /><input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setSelected(0) }} placeholder="Search or run a command" aria-label="Search or run a command" /><button type="button" aria-label="Close command menu" onClick={() => setOpen(false)}><X size={15} /></button></div><div className="rb-public-command-1-results-viewport"><div className="rb-public-command-1-results">{matching.length === 0 ? <p className="rb-public-command-1-empty">No commands match “{query}”.</p> : <>{renderGroup('Recent', recent, true)}{renderGroup('Navigation', navigation)}{renderGroup('Actions', actions)}</>}</div></div><footer className="rb-public-command-1-footer"><span className="rb-command-hint"><span><kbd>↑</kbd><kbd>↓</kbd></span> to navigate</span><span className="rb-command-hint"><kbd>↵</kbd> to open</span><span className="rb-command-hint"><kbd>esc</kbd> to close</span><span className="rb-command-results-count">{matching.length} results</span></footer></section></div>}
  </main>
}
