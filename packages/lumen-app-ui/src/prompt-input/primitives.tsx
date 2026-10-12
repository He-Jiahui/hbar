'use client'

import * as React from 'react'
import { ArrowUp, Check, ChevronDown, File, Hash, Paperclip, User, X } from 'lucide-react'
import LumenSurface from '../LumenSurface'
import type { LumenPromptInputAction } from '../prompt-input'
import type {
  LumenPromptReferenceChoice,
  LumenPromptReferenceComposer,
  LumenPromptReferenceFrameProps,
} from './reference-content'
import './primitives.css'

const attachmentGlyphs = { file: File, person: User, channel: Hash }

export function uniquePromptItems<Item extends { readonly id: string }>(items: readonly Item[]): Item[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id.trim() || seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}
export function PromptFrame({ content, variantId, className, children }: LumenPromptReferenceFrameProps) {
  return (
    <LumenSurface
      as="section"
      boundary="horizontal"
      className="lumen-prompt-reference-surface"
      contentClassName={`lumen-prompt-reference ${className ?? ''}`}
      data-lumen-component="prompt-input"
      data-lumen-variant={content.variant}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-list-strategy={content.listStrategy.kind}
    >
      {children}
      {content.help ? <p className="lumen-prompt-reference-help">{content.help}</p> : null}
      {content.notice ? (
        <p role="status" className="lumen-prompt-reference-notice">
          {content.notice}
        </p>
      ) : null}
    </LumenSurface>
  )
}
export function PromptComposer({
  composer,
  onDraftChange,
  onRemoveAttachment,
  onAction,
  children,
  sendOnEnter = false,
  expanded = false,
  listboxId,
  onKeyDown,
}: {
  readonly composer: LumenPromptReferenceComposer
  readonly onDraftChange?: ((value: string) => void) | undefined
  readonly onRemoveAttachment?: ((id: string) => void) | undefined
  readonly onAction?: ((event: LumenPromptInputAction) => void) | undefined
  readonly children?: React.ReactNode
  readonly sendOnEnter?: boolean | undefined
  readonly expanded?: boolean | undefined
  readonly listboxId?: string | undefined
  readonly onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement> | undefined
}) {
  const canSubmit = Boolean(composer.draft.trim() || (composer.allowAttachmentOnly && composer.attachments.length))
  const submit = () => {
    if (canSubmit) {
      onAction?.({ actionId: 'send', value: composer.draft })
    }
  }
  return (
    <form
      className="lumen-prompt-reference-composer"
      data-hbar-app-ui-region="composer"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      {composer.attachments.length ? (
        <div className="lumen-prompt-reference-attachments">
          {uniquePromptItems(composer.attachments).map((item) => {
            const Glyph = attachmentGlyphs[item.kind ?? 'file']
            return (
              <span key={item.id} data-attachment-id={item.id}>
                <Glyph aria-hidden="true" className="lumen-prompt-reference-icon" />
                <span>
                  {item.label}
                  {item.detail ? <small>{item.detail}</small> : null}
                </span>
                <button
                  type="button"
                  aria-label={composer.labels.remove(item.label)}
                  onClick={() => onRemoveAttachment?.(item.id)}
                >
                  <X aria-hidden="true" className="lumen-prompt-reference-icon" />
                </button>
              </span>
            )
          })}
        </div>
      ) : null}
      <textarea
        rows={2}
        value={composer.draft}
        aria-label={composer.labels.input}
        placeholder={composer.labels.placeholder}
        role={composer.role}
        aria-expanded={composer.role === 'combobox' ? expanded : undefined}
        aria-controls={composer.role === 'combobox' ? listboxId : undefined}
        aria-autocomplete={composer.role === 'combobox' ? 'list' : undefined}
        readOnly={!onDraftChange}
        onChange={(event) => onDraftChange?.(event.currentTarget.value)}
        onKeyDown={(event) => {
          onKeyDown?.(event)
          if (
            !event.defaultPrevented &&
            sendOnEnter &&
            event.key === 'Enter' &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault()
            submit()
          }
        }}
      />
      <div className="lumen-prompt-reference-toolbar">
        {composer.labels.attach ? (
          <button
            type="button"
            aria-label={composer.labels.attach}
            title={composer.labels.attach}
            onClick={() => onAction?.({ actionId: 'attach-request' })}
          >
            <Paperclip aria-hidden="true" className="lumen-prompt-reference-icon" />
          </button>
        ) : null}
        {children}
        <button
          type="submit"
          aria-label={composer.labels.send}
          title={composer.labels.send}
          disabled={!canSubmit}
          className="lumen-prompt-reference-send"
        >
          <ArrowUp aria-hidden="true" className="lumen-prompt-reference-icon" />
        </button>
      </div>
    </form>
  )
}
export function PromptChoiceMenu({
  choices,
  selectedId,
  label,
  onSelect,
  anchor = 'above',
  icon,
  showLabel = true,
}: {
  readonly choices: readonly LumenPromptReferenceChoice[]
  readonly selectedId: string
  readonly label: (name: string) => string
  readonly onSelect?: ((id: string) => void) | undefined
  readonly anchor?: 'above' | 'below' | undefined
  readonly icon?: React.ReactNode
  readonly showLabel?: boolean | undefined
}) {
  const [open, setOpen] = React.useState(false)
  const trigger = React.useRef<HTMLButtonElement>(null)
  const menu = React.useRef<HTMLDivElement>(null)
  const id = React.useId()
  const items = uniquePromptItems(choices)
  const selected = items.find((item) => item.id === selectedId) ?? items[0]
  React.useEffect(() => {
    if (open) {
      const active =
        menu.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]') ??
        menu.current?.querySelector<HTMLButtonElement>('button')
      active?.focus()
    }
  }, [open])
  const keyboardEvents: React.HTMLAttributes<HTMLDivElement> = {
    onBlur: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        setOpen(false)
      }
    },
    onKeyDown: (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
      if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        const options = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])
        const current = options.findIndex((option) => option === event.target)
        let next = (current + (event.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length
        if (event.key === 'Home') {
          next = 0
        }
        if (event.key === 'End') {
          next = options.length - 1
        }
        options[next]?.focus()
      }
    },
  }
  return (
    <div className="lumen-prompt-reference-choice-anchor" {...keyboardEvents}>
      <button
        ref={trigger}
        type="button"
        aria-label={label(selected?.label ?? '')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        disabled={!items.length}
        onClick={() => setOpen(!open)}
      >
        {icon}
        {showLabel ? selected?.label : null}
        {showLabel ? <ChevronDown aria-hidden="true" className="lumen-prompt-reference-icon" /> : null}
      </button>
      {open ? (
        <div
          ref={menu}
          id={id}
          role="listbox"
          aria-label={label(selected?.label ?? '')}
          className="lumen-prompt-reference-choice-menu"
          data-anchor={anchor}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={item.id === selected?.id}
              onClick={() => {
                onSelect?.(item.id)
                setOpen(false)
                trigger.current?.focus()
              }}
            >
              <span>
                {item.label}
                {item.detail ? <small>{item.detail}</small> : null}
              </span>
              {item.id === selected?.id ? <Check aria-hidden="true" className="lumen-prompt-reference-icon" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
