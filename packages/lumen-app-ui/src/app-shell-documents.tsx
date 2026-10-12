'use client'

import * as React from 'react'
import {
  Bold,
  ChevronDown,
  ChevronRight,
  Code,
  Copy,
  Download,
  FolderInput,
  History,
  Italic,
  Link2,
  List,
  Menu,
  MoreHorizontal,
  Plus,
  Quote,
  Share2,
  Strikethrough,
  Trash2,
  X,
} from 'lucide-react'
import { LumenButton, LumenIconButton } from './primitives'
import './app-shell-documents.css'

const formatIcons = {
  bold: Bold,
  italic: Italic,
  strike: Strikethrough,
  list: List,
  quote: Quote,
  code: Code,
}
const actionIcons = {
  duplicate: Copy,
  move: FolderInput,
  history: History,
  export: Download,
  trash: Trash2,
  list: List,
  quote: Quote,
  code: Code,
  link: Link2,
}
export type LumenDocumentFormat = keyof typeof formatIcons
export type LumenDocumentBlock =
  | { readonly id: string; readonly kind: 'paragraph' | 'heading' | 'code'; readonly text: string }
  | {
      readonly id: string
      readonly kind: 'list'
      readonly items: readonly { readonly id: string; readonly text: string }[]
    }
export interface LumenShellDocument {
  readonly id: string
  readonly title: string
  readonly metadata: string
  readonly wordCount: string
  readonly blocks: readonly LumenDocumentBlock[]
}
export interface LumenDocumentFolder {
  readonly id: string
  readonly label: string
  readonly initiallyExpanded: boolean
  readonly documents: readonly LumenShellDocument[]
}
export interface LumenDocumentMenuItem {
  readonly id: string
  readonly label: string
  readonly icon: keyof typeof actionIcons
}
export interface LumenAppShellDocumentsContent {
  readonly brand: string
  readonly labels: {
    readonly documents: string
    readonly openDocuments: string
    readonly closeDocuments: string
    readonly closeOverlay: string
    readonly newDocument: string
    readonly trash: string
    readonly title: string
    readonly share: string
    readonly actions: string
    readonly textStyle: string
    readonly blockStyle: string
    readonly moreFormatting: string
    readonly link: string
    readonly emptyTree: string
    readonly emptyDocument: string
    readonly formats: Readonly<Record<LumenDocumentFormat, string>>
  }
  /** Pane-owned tree scrolling; hosts page/group inventories above 100 documents. */
  readonly folders: readonly LumenDocumentFolder[]
  /** Stale/missing IDs render the explicit empty reader, never a fabricated selection. */
  readonly selectedId: string | null
  readonly status: string
  readonly statusState: 'saved' | 'pending' | 'failed'
  readonly trashCount: string
  readonly formats: readonly LumenDocumentFormat[]
  readonly menu: readonly LumenDocumentMenuItem[]
  readonly moreFormatting: readonly LumenDocumentMenuItem[]
  readonly onSelect: (id: string) => void
  readonly onTitle: (id: string, value: string) => void
  readonly onFormat: (format: LumenDocumentFormat) => void
  readonly onAction: (
    action: 'new' | 'trash' | 'share' | 'link' | 'menu' | 'format-menu',
    documentId?: string,
    actionId?: string,
  ) => void
}
const unique = <T extends { readonly id: string }>(items: readonly T[]): T[] => [
  ...new Map(items.map((item) => [item.id, item])).values(),
]
function ScrollFrame({ children }: { readonly children: React.ReactNode }) {
  const frame = React.useRef<HTMLDivElement>(null)
  const [edges, setEdges] = React.useState({ top: false, bottom: false })
  const measure = React.useCallback(() => {
    const pane = frame.current?.firstElementChild
    if (pane)
      setEdges((old) => {
        const top = pane.scrollTop > 1,
          bottom = pane.scrollHeight - pane.clientHeight - pane.scrollTop > 1
        return old.top === top && old.bottom === bottom ? old : { top, bottom }
      })
  }, [])
  React.useEffect(() => {
    const pane = frame.current?.firstElementChild
    if (!pane) return
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(pane)
    if (pane.firstElementChild) observer.observe(pane.firstElementChild)
    return () => observer.disconnect()
  }, [children, measure])
  return (
    <div
      className="lumen-documents-scroll-frame"
      ref={frame}
      onScrollCapture={measure}
      data-top={edges.top}
      data-bottom={edges.bottom}
    >
      {children}
    </div>
  )
}
function DocumentsMenu({
  label,
  items,
  onAction,
  className = '',
}: {
  readonly label: string
  readonly items: readonly LumenDocumentMenuItem[]
  readonly onAction: (id: string) => void
  readonly className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const anchor = React.useRef<HTMLDivElement>(null),
    trigger = React.useRef<HTMLButtonElement>(null)
  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }
  React.useEffect(() => {
    if (!open) return
    anchor.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus()
    const owner = anchor.current?.ownerDocument
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !anchor.current?.contains(event.target)) setOpen(false)
    }
    owner?.addEventListener('pointerdown', outside)
    return () => owner?.removeEventListener('pointerdown', outside)
  }, [open])
  return (
    <div
      className={`lumen-documents-menu-anchor ${className}`}
      ref={anchor}
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') {
          event.stopPropagation()
          close()
        }
      }}
    >
      <LumenIconButton
        ref={trigger}
        size="s"
        label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <MoreHorizontal className="lumen-documents-icon" aria-hidden="true" />
      </LumenIconButton>
      {open ? (
        <div
          role="menu"
          aria-label={label}
          className="lumen-documents-menu"
          onKeyDown={(event) => {
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=menuitem]')]
            const index = buttons.findIndex((button) => button === event.target)
            buttons[
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? buttons.length - 1
                  : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
            ]?.focus()
          }}
        >
          {unique(items).map((item) => {
            const Icon = actionIcons[item.icon]
            return (
              <LumenButton
                size="s"
                variant="text"
                indicator="none"
                role="menuitem"
                key={item.id}
                onClick={() => {
                  onAction(item.id)
                  close()
                }}
              >
                <Icon className="lumen-documents-icon-sm" aria-hidden="true" />
                {item.label}
              </LumenButton>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
function DocumentTree({
  content,
  onSelect,
  expanded,
  setExpanded,
}: {
  readonly content: LumenAppShellDocumentsContent
  readonly onSelect: (id: string) => void
  readonly expanded: Readonly<Record<string, boolean>>
  readonly setExpanded: React.Dispatch<React.SetStateAction<Readonly<Record<string, boolean>>>>
}) {
  const folders = unique(content.folders)
  const [focused, setFocused] = React.useState<string | null>(null)
  const root = React.useRef<HTMLUListElement>(null)
  const isOpen = (folder: LumenDocumentFolder) => expanded[folder.id] ?? folder.initiallyExpanded
  const visible = folders.flatMap((folder) => [
    { key: `folder:${folder.id}`, folder, file: null },
    ...(isOpen(folder) ? unique(folder.documents).map((file) => ({ key: `file:${file.id}`, folder, file })) : []),
  ])
  const active =
    visible.find((item) => item.key === focused)?.key ??
    visible.find((item) => item.file?.id === content.selectedId)?.key ??
    visible[0]?.key
  const focus = (key: string | undefined) => {
    if (!key) return
    setFocused(key)
    const index = visible.findIndex((item) => item.key === key)
    root.current?.querySelectorAll<HTMLButtonElement>('[role=treeitem]')[index]?.focus()
  }
  const onKey = (event: React.KeyboardEvent<HTMLButtonElement>, key: string) => {
    const index = visible.findIndex((item) => item.key === key),
      item = visible[index]
    if (!item || !['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    if (event.key === 'ArrowLeft') {
      if (item.file) focus(`folder:${item.folder.id}`)
      else setExpanded((old) => ({ ...old, [item.folder.id]: false }))
    } else if (event.key === 'ArrowRight') {
      if (!item.file) {
        if (isOpen(item.folder))
          focus(visible[index + 1]?.folder.id === item.folder.id ? visible[index + 1]?.key : undefined)
        else setExpanded((old) => ({ ...old, [item.folder.id]: true }))
      }
    } else
      focus(
        visible[
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? visible.length - 1
              : Math.max(0, Math.min(visible.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))
        ]?.key,
      )
  }
  return (
    <ScrollFrame>
      <nav
        aria-label={content.labels.documents}
        className="lumen-documents-tree-pane"
        data-lumen-list-strategy="pane-scroll"
      >
        <ul ref={root} role="tree" aria-label={content.labels.documents}>
          {folders.map((folder) => {
            const key = `folder:${folder.id}`,
              open = isOpen(folder),
              Icon = open ? ChevronDown : ChevronRight
            return (
              <li role="none" key={folder.id}>
                <LumenButton
                  size="s"
                  variant="text"
                  indicator="none"
                  role="treeitem"
                  aria-level={1}
                  aria-selected={false}
                  aria-expanded={open}
                  tabIndex={active === key ? 0 : -1}
                  onFocus={() => setFocused(key)}
                  onKeyDown={(event) => onKey(event, key)}
                  onClick={() => setExpanded((old) => ({ ...old, [folder.id]: !open }))}
                >
                  <Icon className="lumen-documents-icon-sm" aria-hidden="true" />
                  <span>{folder.label}</span>
                </LumenButton>
                {open ? (
                  <ul role="group" aria-label={folder.label}>
                    {unique(folder.documents).map((file) => {
                      const fileKey = `file:${file.id}`
                      return (
                        <li role="none" key={file.id}>
                          <LumenButton
                            size="s"
                            variant="text"
                            indicator="none"
                            className="lumen-documents-file"
                            role="treeitem"
                            aria-level={2}
                            aria-selected={content.selectedId === file.id}
                            tabIndex={active === fileKey ? 0 : -1}
                            onFocus={() => setFocused(fileKey)}
                            onKeyDown={(event) => onKey(event, fileKey)}
                            onClick={() => onSelect(file.id)}
                          >
                            <span>{file.title}</span>
                          </LumenButton>
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ul>
        {folders.length ? null : <p>{content.labels.emptyTree}</p>}
      </nav>
    </ScrollFrame>
  )
}
function DocumentBody({ record, empty }: { readonly record: LumenShellDocument | undefined; readonly empty: string }) {
  return (
    <ScrollFrame>
      <main className="lumen-documents-reader" data-lumen-list-strategy="pane-scroll">
        {record ? (
          <article>
            <h1>{record.title}</h1>
            <p className="lumen-documents-metadata">{record.metadata}</p>
            {unique(record.blocks).map((block) => {
              if (block.kind === 'heading') return <h2 key={block.id}>{block.text}</h2>
              if (block.kind === 'code') return <pre key={block.id}>{block.text}</pre>
              if (block.kind === 'list')
                return (
                  <ul key={block.id}>
                    {unique(block.items).map((item) => (
                      <li key={item.id}>{item.text}</li>
                    ))}
                  </ul>
                )
              return <p key={block.id}>{block.text}</p>
            })}
          </article>
        ) : (
          <p className="lumen-documents-empty">{empty}</p>
        )}
      </main>
    </ScrollFrame>
  )
}
export function AppShellDocuments({ content }: { readonly content: LumenAppShellDocumentsContent }) {
  const root = React.useRef<HTMLDivElement>(null),
    openTrigger = React.useRef<HTMLButtonElement>(null)
  const [narrow, setNarrow] = React.useState(false),
    [documentsOpen, setDocumentsOpen] = React.useState(true)
  const [expanded, setExpanded] = React.useState<Readonly<Record<string, boolean>>>({})
  const record = unique(content.folders.flatMap((folder) => folder.documents)).find(
    (item) => item.id === content.selectedId,
  )
  React.useEffect(() => {
    const element = root.current
    if (!element) return
    const measure = () => setNarrow(element.clientWidth < 1024)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const close = () => {
    setDocumentsOpen(false)
    openTrigger.current?.focus()
  }
  const sidebar = (drawer: boolean) => (
    <>
      <div className="lumen-documents-brand">
        <p>{content.brand}</p>
        <LumenIconButton size="s" label={content.labels.newDocument} onClick={() => content.onAction('new')}>
          <Plus className="lumen-documents-icon" aria-hidden="true" />
        </LumenIconButton>
        {drawer ? (
          <LumenIconButton size="s" label={content.labels.closeDocuments} onClick={close}>
            <X className="lumen-documents-icon" aria-hidden="true" />
          </LumenIconButton>
        ) : null}
      </div>
      <DocumentTree
        content={content}
        expanded={expanded}
        setExpanded={setExpanded}
        onSelect={(id) => {
          content.onSelect(id)
        }}
      />
      <footer>
        <LumenButton size="s" variant="text" indicator="none" onClick={() => content.onAction('trash')}>
          <Trash2 className="lumen-documents-icon-sm" aria-hidden="true" />
          <span>{content.labels.trash}</span>
          <span>{content.trashCount}</span>
        </LumenButton>
      </footer>
    </>
  )
  const formatGroup = (formats: readonly LumenDocumentFormat[], label: string, className: string) => (
    <div role="group" aria-label={label} className={`lumen-documents-format-group ${className}`}>
      {formats.map((format) => {
        const Icon = formatIcons[format]
        return (
          <LumenIconButton
            key={format}
            size="s"
            label={content.labels.formats[format]}
            aria-pressed={content.formats.includes(format)}
            onClick={() => content.onFormat(format)}
          >
            <Icon className="lumen-documents-icon-sm" aria-hidden="true" />
          </LumenIconButton>
        )
      })}
    </div>
  )
  return (
    <div className="lumen-documents-shell" ref={root}>
      <aside className="lumen-documents-sidebar">{sidebar(false)}</aside>
      <div className="lumen-documents-workspace">
        <header className="lumen-documents-heading" role="banner">
          <LumenIconButton
            className="lumen-documents-open"
            size="s"
            ref={openTrigger}
            label={content.labels.openDocuments}
            aria-expanded={narrow && documentsOpen}
            onClick={() => setDocumentsOpen(!documentsOpen)}
          >
            <Menu className="lumen-documents-icon" aria-hidden="true" />
          </LumenIconButton>
          <div className="lumen-documents-title">
            <input
              aria-label={content.labels.title}
              value={record?.title ?? ''}
              disabled={!record}
              onChange={(event) => {
                if (record) content.onTitle(record.id, event.target.value)
              }}
            />
          </div>
          <span className="lumen-documents-status" data-state={content.statusState}>
            <i aria-hidden="true" />
            {content.status}
          </span>
          <LumenButton size="s" variant="solid" indicator="none" onClick={() => content.onAction('share', record?.id)}>
            <Share2 className="lumen-documents-icon-sm" aria-hidden="true" />
            {content.labels.share}
          </LumenButton>
          <DocumentsMenu
            label={content.labels.actions}
            items={content.menu}
            onAction={(id) => content.onAction('menu', record?.id, id)}
          />
        </header>
        <div className="lumen-documents-toolbar">
          {formatGroup(['bold', 'italic', 'strike'], content.labels.textStyle, 'lumen-documents-text-style')}
          {formatGroup(['list', 'quote', 'code'], content.labels.blockStyle, 'lumen-documents-block-style')}
          <LumenIconButton
            className="lumen-documents-insert-link"
            size="s"
            label={content.labels.link}
            onClick={() => content.onAction('link', record?.id)}
          >
            <Link2 className="lumen-documents-icon" aria-hidden="true" />
          </LumenIconButton>
          <DocumentsMenu
            className="lumen-documents-more-formatting"
            label={content.labels.moreFormatting}
            items={content.moreFormatting}
            onAction={(id) => content.onAction('format-menu', record?.id, id)}
          />
          <span className="lumen-documents-count">{record?.wordCount}</span>
        </div>
        <DocumentBody record={record} empty={content.labels.emptyDocument} />
      </div>
      {narrow && documentsOpen ? (
        <div className="lumen-documents-overlay">
          <button
            type="button"
            className="lumen-documents-backdrop"
            aria-label={content.labels.closeOverlay}
            onClick={close}
          />
          <aside
            className="lumen-documents-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={content.labels.documents}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                close()
              }
            }}
          >
            {sidebar(true)}
          </aside>
        </div>
      ) : null}
    </div>
  )
}
