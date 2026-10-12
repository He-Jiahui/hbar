'use client'

import * as React from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { LumenIcon } from './workbench'
import './tree.css'

interface TreeContextValue {
  readonly activeId: string | null
  readonly focus: (id: string) => void
  readonly root: React.RefObject<HTMLElement | null>
  readonly search: React.RefObject<{ text: string; at: number }>
}
const TreeContext = React.createContext<TreeContextValue | null>(null)
const LevelContext = React.createContext(1)

function visibleItems(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>('[role="treeitem"]')].filter(
    (item) => item.closest('[role="tree"]') === root && !item.closest('[hidden],[inert]'),
  )
}

export interface LumenTreeProps extends React.HTMLAttributes<HTMLElement> {
  readonly as?: 'div' | 'nav' | undefined
  readonly label: string
  /** Allows the same host pane to display an alternative non-tree view. */
  readonly enabled?: boolean | undefined
  readonly ref?: React.Ref<HTMLElement> | undefined
}

/** Pane-owned tree. Hosts own node identity/data, selection, lazy loading and controlled expansion. */
export function LumenTree({
  as: Tag = 'div',
  label,
  enabled = true,
  children,
  className,
  ref,
  ...props
}: LumenTreeProps) {
  const root = React.useRef<HTMLElement>(null)
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const active = React.useRef(activeId)
  const search = React.useRef({ text: '', at: 0 })
  const ownsFocus = React.useRef(false)
  const ancestry = React.useRef<readonly string[]>([])
  React.useLayoutEffect(() => {
    active.current = activeId
  }, [activeId])
  React.useLayoutEffect(() => {
    const element = root.current
    if (!element || !enabled) return undefined
    const reconcile = () => {
      const items = visibleItems(element)
      if (!items.some((item) => item.id === active.current)) {
        const parent = ancestry.current.map((id) => items.find((item) => item.id === id)).find(Boolean)
        const next = parent ?? items.find((item) => item.getAttribute('aria-selected') === 'true') ?? items[0]
        active.current = next?.id ?? null
        setActiveId(active.current)
        if (ownsFocus.current && element.ownerDocument.activeElement === element.ownerDocument.body) next?.focus()
      }
    }
    reconcile()
    const observer = new MutationObserver(reconcile)
    observer.observe(element, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [enabled])
  const context = React.useMemo<TreeContextValue>(() => ({ activeId, focus: setActiveId, root, search }), [activeId])
  return (
    <TreeContext.Provider value={enabled ? context : null}>
      <LevelContext.Provider value={1}>
        <Tag
          {...props}
          ref={(element) => {
            root.current = element
            if (typeof ref === 'function') return ref(element)
            if (ref) ref.current = element
            return undefined
          }}
          className={['lumen-tree', className].filter(Boolean).join(' ')}
          role={enabled ? 'tree' : 'navigation'}
          aria-label={label}
          tabIndex={enabled && activeId === null ? 0 : undefined}
          onFocusCapture={(event) => {
            props.onFocusCapture?.(event)
            ownsFocus.current = true
            const chain: string[] = []
            let item = event.target instanceof Element ? event.target.closest('[role="treeitem"]') : null
            while (item && item.closest('[role="tree"]') === root.current) {
              chain.push(item.id)
              item = item.parentElement?.closest('[role="treeitem"]') ?? null
            }
            ancestry.current = chain
          }}
          onBlurCapture={(event) => {
            props.onBlurCapture?.(event)
            if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget))
              ownsFocus.current = false
          }}
          onFocus={(event) => {
            props.onFocus?.(event)
            if (enabled && event.target === event.currentTarget) visibleItems(event.currentTarget)[0]?.focus()
          }}
        >
          {children}
        </Tag>
      </LevelContext.Provider>
    </TreeContext.Provider>
  )
}

export interface LumenTreeItemProps extends Omit<React.HTMLAttributes<HTMLElement>, 'content'> {
  readonly as?: 'div' | 'section' | undefined
  readonly nodeId: string
  readonly label: string
  readonly content: React.ReactNode
  readonly selected?: boolean | undefined
  readonly expanded?: boolean | undefined
  readonly expansionDisabled?: boolean | undefined
  readonly onExpandedChange?: ((expanded: boolean) => void) | undefined
  readonly onActivate?: (() => void) | undefined
  readonly rowClassName?: string | undefined
  readonly rowProps?: React.HTMLAttributes<HTMLDivElement> | undefined
  readonly afterContent?: React.ReactNode
}

/** One semantic node, not a navigation button. Trailing actions stay independent of activation. */
export function LumenTreeItem({
  as: Tag = 'div',
  nodeId,
  label,
  content,
  selected = false,
  expanded,
  expansionDisabled = false,
  onExpandedChange,
  onActivate,
  rowClassName,
  rowProps,
  afterContent,
  children,
  className,
  ...props
}: LumenTreeItemProps) {
  const tree = React.useContext(TreeContext)
  const level = React.useContext(LevelContext)
  const groupId = React.useId()
  const itemId = React.useId()
  const branch = expanded !== undefined && onExpandedChange !== undefined
  const expand = (value: boolean) => {
    if (!expansionDisabled) onExpandedChange?.(value)
  }
  const activate = () => {
    if (onActivate) onActivate()
    else if (branch) expand(!expanded)
  }
  const interactive = (target: EventTarget | null) =>
    target instanceof Element &&
    Boolean(target.closest('button,input,textarea,select,a,summary,[contenteditable="true"]'))
  return (
    <Tag
      {...props}
      className={['lumen-tree-item', className].filter(Boolean).join(' ')}
      role="treeitem"
      id={itemId}
      aria-label={label}
      aria-level={level}
      aria-selected={selected}
      aria-expanded={branch ? expanded : undefined}
      aria-controls={branch && expanded ? groupId : undefined}
      data-tree-node-id={nodeId}
      tabIndex={tree?.activeId === itemId ? 0 : -1}
      onFocus={(event) => {
        props.onFocus?.(event)
        if (event.target === event.currentTarget) tree?.focus(itemId)
      }}
      onKeyDown={(event) => {
        props.onKeyDown?.(event)
        if (
          event.defaultPrevented ||
          event.nativeEvent.isComposing ||
          event.target !== event.currentTarget ||
          !tree?.root.current ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey
        )
          return
        const item = event.currentTarget
        const items = visibleItems(tree.root.current)
        const index = items.indexOf(item)
        let target: HTMLElement | undefined
        switch (event.key) {
          case 'ArrowDown':
            target = items[index + 1]
            break
          case 'ArrowUp':
            target = items[index - 1]
            break
          case 'Home':
            target = items[0]
            break
          case 'End':
            target = items.at(-1)
            break
          case 'ArrowRight':
            if (branch && !expanded) expand(true)
            else if (branch)
              target = items.find((candidate) => candidate.parentElement?.closest('[role="treeitem"]') === item)
            break
          case 'ArrowLeft':
            if (branch && expanded) expand(false)
            else {
              const parent = item.parentElement?.closest('[role="treeitem"]')
              if (parent instanceof HTMLElement) target = parent
            }
            break
          case 'Enter':
          case ' ':
            activate()
            break
          default: {
            if (event.key.length !== 1) return
            const now = Date.now()
            const typed = event.key.toLocaleLowerCase()
            const query = now - tree.search.current.at < 700 ? tree.search.current.text + typed : typed
            tree.search.current = { text: query, at: now }
            const ordered = [...items.slice(index + 1), ...items.slice(0, index + 1)]
            target = ordered.find((candidate) =>
              candidate.getAttribute('aria-label')?.toLocaleLowerCase().startsWith(query),
            )
            if (!target && [...query].every((character) => character === typed)) {
              target = ordered.find((candidate) =>
                candidate.getAttribute('aria-label')?.toLocaleLowerCase().startsWith(typed),
              )
            }
            if (!target) return
          }
        }
        event.preventDefault()
        event.stopPropagation()
        target?.focus()
      }}
    >
      <div
        {...rowProps}
        className={['lumen-tree-row', rowClassName].filter(Boolean).join(' ')}
        onClickCapture={(event) => {
          if (!interactive(event.target)) rowProps?.onClickCapture?.(event)
        }}
        onClick={(event) => {
          rowProps?.onClick?.(event)
          if (event.defaultPrevented || interactive(event.target)) return
          const item = event.currentTarget.parentElement
          item?.focus()
          if (event.target instanceof Element && event.target.closest('[data-tree-disclosure]') && branch)
            expand(!expanded)
          else activate()
        }}
      >
        <span className="lumen-tree-disclosure" data-tree-disclosure aria-hidden="true">
          {branch ? <LumenIcon icon={expanded ? ChevronDown : ChevronRight} tier="sm" /> : null}
        </span>
        {content}
      </div>
      {afterContent}
      {branch && expanded ? (
        <LevelContext.Provider value={level + 1}>
          <div id={groupId} role="group" className="lumen-tree-group" data-flat-depth={level >= 4}>
            {children}
          </div>
        </LevelContext.Provider>
      ) : null}
    </Tag>
  )
}
