'use client'

import * as React from 'react'
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link2,
  Undo2,
  Redo2,
  ChevronDown,
  ChevronUp,
  Heading1,
  Heading2,
  Quote,
  List,
  ListOrdered,
  Check,
} from 'lucide-react'
import type { LumenEditorAction, LumenEditorFormattingAction, LumenRichTextChange } from './editor'
import './editor-rich-reference.css'

export interface LumenRichEditorBlock {
  readonly id: string
  readonly label: string
  readonly icon?: 'heading-1' | 'heading-2' | 'quote' | 'bulleted-list' | 'numbered-list' | undefined
}

export interface LumenRichEditorReferenceContent {
  readonly labels: {
    readonly emptyBlocks: string
    readonly formatAction: (action: LumenEditorFormattingAction) => string
    readonly undo: string
    readonly redo: string
    readonly title: string
    readonly body: string
    readonly titlePlaceholder: string
    readonly bodyPlaceholder: string
    readonly wordCount: (body: string) => string
    readonly characterCount: (body: string) => string
    readonly readingTime: (body: string) => string
    readonly footerNote: string
    readonly saving: string
  }
  readonly document: Readonly<{ id: string; title: string; body: string; metadata: string }>
  readonly blocks: readonly LumenRichEditorBlock[]
  /** Short block taxonomy; the flowing menu scrolls when extensions exceed the expected bound. */
  readonly blockStrategy: Readonly<{ kind: 'pane-scroll'; expectedMaximum: number }>
  readonly blockId: string
  readonly pressed: Readonly<Record<LumenEditorFormattingAction, boolean>>
  /** Host-owned feedback. The demo's Saving→Saved labels are not a persistence receipt. */
  readonly status: string
  readonly onChange?: ((change: LumenRichTextChange) => void) | undefined
  readonly onBlockChange?: ((documentId: string, blockId: string) => void) | undefined
  readonly onFormatChange?: ((documentId: string, action: LumenEditorFormattingAction) => void) | undefined
}

export function uniqueLumenRichEditorBlocks(blocks: readonly LumenRichEditorBlock[]): readonly LumenRichEditorBlock[] {
  const seen = new Set<string>()
  return blocks.filter((block) => {
    if (seen.has(block.id)) return false
    seen.add(block.id)
    return true
  })
}

function EditorIcon({
  kind,
}: {
  readonly kind:
    | LumenEditorFormattingAction
    | 'undo'
    | 'redo'
    | 'chevron'
    | 'chevron-up'
    | 'heading-1'
    | 'heading-2'
    | 'quote'
    | 'bulleted-list'
    | 'numbered-list'
    | 'check'
}): React.ReactElement {
  const icons = {
    bold: Bold,
    italic: Italic,
    strikethrough: Strikethrough,
    'inline-code': Code,
    link: Link2,
    undo: Undo2,
    redo: Redo2,
    chevron: ChevronDown,
    'chevron-up': ChevronUp,
    'heading-1': Heading1,
    'heading-2': Heading2,
    quote: Quote,
    'bulleted-list': List,
    'numbered-list': ListOrdered,
    check: Check,
  }
  const Icon = icons[kind]
  return (
    <Icon
      className="lumen-rich-editor-icon"
      data-icon-tier={
        ['bold', 'italic', 'strikethrough', 'inline-code', 'link', 'undo', 'redo'].includes(kind) ? 'md' : 'sm'
      }
      strokeWidth={kind === 'check' ? 2 : 1.75}
      aria-hidden="true"
      focusable="false"
    />
  )
}

function BlockMenu({
  content,
  onAction,
}: {
  readonly content: LumenRichEditorReferenceContent
  readonly onAction: ((event: LumenEditorAction) => void) | undefined
}): React.ReactElement {
  const blocks = React.useMemo(() => uniqueLumenRichEditorBlocks(content.blocks), [content.blocks])
  const selected = blocks.find((block) => block.id === content.blockId) ?? blocks[0]
  const [open, setOpen] = React.useState(false)
  const trigger = React.useRef<HTMLButtonElement>(null)
  const owner = React.useRef<HTMLDivElement>(null)
  const menu = React.useRef<HTMLDivElement>(null)
  const menuId = React.useId()
  const close = React.useCallback((restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) trigger.current?.focus()
  }, [])
  React.useEffect(() => {
    setOpen(false)
  }, [content.document.id])
  React.useEffect(() => {
    if (!open) return undefined
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !owner.current?.contains(event.target)) close(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open, close])
  React.useEffect(() => {
    if (open) {
      const items = menu.current?.querySelectorAll<HTMLButtonElement>('button')
      const index = blocks.findIndex((block) => block.id === selected?.id)
      items?.[Math.max(0, index)]?.focus()
    }
  }, [open, blocks, selected?.id])
  const keyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
    }
    if (!open || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    const current = items.findIndex((item) => item === document.activeElement)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }
  return (
    <div
      className="lumen-rich-editor-block-owner"
      ref={owner}
      onKeyDown={keyDown}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close(false)
      }}
    >
      <button
        className="lumen-rich-editor-block-trigger"
        type="button"
        ref={trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={!selected}
        onClick={() => {
          setOpen((value) => !value)
          onAction?.({ actionId: 'block-menu' })
        }}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp'].includes(event.key) && !open) {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        <span>{selected?.label ?? content.labels.emptyBlocks}</span>
        <EditorIcon kind={open ? 'chevron-up' : 'chevron'} />
      </button>
      {open ? (
        <div
          className="lumen-rich-editor-block-menu"
          id={menuId}
          role="menu"
          ref={menu}
          data-hbar-app-ui-list-strategy={content.blockStrategy.kind}
          data-hbar-app-ui-expected-maximum={content.blockStrategy.expectedMaximum}
        >
          {blocks.map((block) => (
            <button
              key={block.id}
              type="button"
              role="menuitemradio"
              aria-checked={selected?.id === block.id}
              onClick={() => {
                content.onBlockChange?.(content.document.id, block.id)
                onAction?.({ actionId: 'block', value: block.id })
                close(true)
              }}
            >
              {block.icon ? (
                <EditorIcon kind={block.icon} />
              ) : (
                <span className="lumen-rich-editor-menu-icon-placeholder" aria-hidden="true" />
              )}
              <span>{block.label}</span>
              {selected?.id === block.id ? <EditorIcon kind="check" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function LumenRichEditorReference({
  content,
  onAction,
}: {
  readonly content: LumenRichEditorReferenceContent
  readonly onAction: ((event: LumenEditorAction) => void) | undefined
}): React.ReactElement {
  const formats: readonly LumenEditorFormattingAction[] = ['bold', 'italic', 'strikethrough', 'inline-code', 'link']
  return (
    <>
      <div className="lumen-rich-editor-toolbar">
        <BlockMenu content={content} onAction={onAction} />
        <span className="lumen-rich-editor-separator" aria-hidden="true" />
        {formats.map((action) => (
          <button
            className="lumen-rich-editor-tool"
            type="button"
            key={action}
            aria-label={content.labels.formatAction(action)}
            aria-pressed={content.pressed[action]}
            onClick={() => {
              content.onFormatChange?.(content.document.id, action)
              onAction?.({ actionId: action, value: content.document.id })
            }}
          >
            <EditorIcon kind={action} />
          </button>
        ))}
        <span className="lumen-rich-editor-separator" aria-hidden="true" />
        {(['undo', 'redo'] as const).map((action) => (
          <button
            className="lumen-rich-editor-tool"
            type="button"
            key={action}
            aria-label={content.labels[action]}
            onClick={() => onAction?.({ actionId: action, value: content.document.id })}
          >
            <EditorIcon kind={action} />
          </button>
        ))}
        <span className="lumen-rich-editor-status">{content.status}</span>
      </div>
      <div className="lumen-rich-editor-main">
        <div className="lumen-rich-editor-document">
          <input
            aria-label={content.labels.title}
            placeholder={content.labels.titlePlaceholder}
            value={content.document.title}
            readOnly={!content.onChange}
            onChange={(event) =>
              content.onChange?.({
                documentId: content.document.id,
                field: 'title',
                value: event.currentTarget.value,
              })
            }
          />
          <p>{content.document.metadata}</p>
          <textarea
            aria-label={content.labels.body}
            placeholder={content.labels.bodyPlaceholder}
            value={content.document.body}
            readOnly={!content.onChange}
            spellCheck={false}
            onChange={(event) =>
              content.onChange?.({
                documentId: content.document.id,
                field: 'body',
                value: event.currentTarget.value,
              })
            }
          />
        </div>
      </div>
      <footer className="lumen-rich-editor-footer" role="contentinfo">
        <div>
          <span>{content.labels.wordCount(content.document.body)}</span>
          <span>{content.labels.characterCount(content.document.body)}</span>
          <span>{content.labels.readingTime(content.document.body)}</span>
        </div>
        <span className="lumen-rich-editor-note">{content.labels.footerNote}</span>
      </footer>
    </>
  )
}
