import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ClipboardList,
  FileText,
  Gauge,
  ImagePlus,
  Paperclip,
  Plus,
  Puzzle,
  Search,
  Target,
  Wrench,
} from 'lucide-react'
import type { ComposerAction, ComposerActionGroup, ComposerActionIcon } from '@hbar/ui-sdk'

const GROUP_ORDER: readonly ComposerActionGroup[] = ['session', 'context', 'tools', 'extensions']
const GROUP_LABELS: Record<ComposerActionGroup, string> = {
  session: '会话模式',
  context: '上下文',
  tools: '工具',
  extensions: '插件',
}
const ICONS: Record<ComposerActionIcon, typeof Target> = {
  target: Target,
  'clipboard-list': ClipboardList,
  gauge: Gauge,
  image: ImagePlus,
  file: FileText,
  paperclip: Paperclip,
  puzzle: Puzzle,
  wrench: Wrench,
}

export function filterComposerActions(actions: readonly ComposerAction[], query: string): ComposerAction[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return [...actions]
  return actions.filter((action) => {
    const haystack = [action.label, action.description, action.id, ...(action.keywords ?? [])]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
}

type ComposerMenuProps = {
  actions: readonly ComposerAction[]
  onSelect(action: ComposerAction): void
}

export default function ComposerMenu({ actions, onSelect }: ComposerMenuProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const filtered = useMemo(() => filterComposerActions(actions, query), [actions, query])
  const grouped = useMemo(
    () => GROUP_ORDER.map((group) => ({ group, actions: filtered.filter((action) => action.group === group) }))
      .filter((entry) => entry.actions.length > 0),
    [filtered],
  )
  const displayed = useMemo(() => grouped.flatMap((entry) => entry.actions), [grouped])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(0, displayed.length - 1)))
  }, [displayed.length])

  const move = (delta: number) => {
    if (!displayed.length) return
    setSelectedIndex((current) => {
      let next = current
      for (let count = 0; count < displayed.length; count += 1) {
        next = (next + delta + displayed.length) % displayed.length
        if (!displayed[next]?.disabled) {
          itemRefs.current[next]?.focus()
          return next
        }
      }
      return current
    })
  }

  const select = (action: ComposerAction) => {
    if (action.disabled) return
    setOpen(false)
    setQuery('')
    onSelect(action)
  }

  let index = 0
  return (
    <div className="composer-plus" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="composer-plus-trigger"
        aria-label="添加能力"
        aria-haspopup="menu"
        aria-expanded={open}
        title="添加能力"
        onClick={() => setOpen((current) => !current)}
      >
        <Plus size={17} />
      </button>
      {open && (
        <div
          className="composer-menu"
          role="menu"
          aria-label="会话能力"
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              move(1)
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              move(-1)
            } else if (event.key === 'Enter' && document.activeElement?.getAttribute('role') !== 'menuitem') {
              const action = displayed[selectedIndex]
              if (action) {
                event.preventDefault()
                select(action)
              }
            }
          }}
        >
          <div className="composer-menu-search">
            <Search size={14} />
            <input
              autoFocus
              aria-label="搜索能力"
              placeholder="搜索能力"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="composer-menu-list">
            {grouped.map(({ group, actions: groupActions }) => (
              <section key={group} className="composer-menu-group" aria-label={GROUP_LABELS[group]}>
                <div className="composer-menu-heading">{GROUP_LABELS[group]}</div>
                {groupActions.map((action) => {
                  const itemIndex = index
                  index += 1
                  const Icon = ICONS[action.icon]
                  return (
                    <button
                      key={action.id}
                      ref={(element) => {
                        itemRefs.current[itemIndex] = element
                      }}
                      type="button"
                      role="menuitem"
                      disabled={action.disabled}
                      aria-label={action.label}
                      title={action.disabled ? action.disabledReason : action.description}
                      className={`composer-menu-item ${itemIndex === selectedIndex ? 'selected' : ''}`}
                      onClick={() => select(action)}
                    >
                      <span className="composer-menu-icon">
                        <Icon size={15} />
                      </span>
                      <span className="composer-menu-copy">
                        <strong>{action.label}</strong>
                        {action.description && <small>{action.description}</small>}
                      </span>
                      {action.disabled && <span className="composer-menu-status">接入中</span>}
                    </button>
                  )
                })}
              </section>
            ))}
            {!grouped.length && <div className="composer-menu-empty">没有匹配的能力</div>}
          </div>
        </div>
      )}
    </div>
  )
}
