'use client'

import * as React from 'react'
import { AtSign, File, Hash, User, X } from 'lucide-react'
import type {
  LumenPromptReferenceViewProps,
  LumenPromptReferenceAttachment,
  LumenPromptScopeReferenceContent,
} from './reference-content'
import { PromptComposer, PromptFrame, uniquePromptItems } from './primitives'
import './reference-scope.css'

type PickerOrigin = 'context' | 'mention' | null

function SourceIcon({ kind }: { readonly kind: LumenPromptReferenceAttachment['kind'] }) {
  if (kind === 'person') {
    return <User aria-hidden="true" className="lumen-prompt-reference-icon" />
  }
  if (kind === 'channel') {
    return <Hash aria-hidden="true" className="lumen-prompt-reference-icon" />
  }
  return <File aria-hidden="true" className="lumen-prompt-reference-icon" />
}

function ReferenceScopePrompt({
  viewModel,
  variantId,
  className,
  onAction,
}: LumenPromptReferenceViewProps<LumenPromptScopeReferenceContent>) {
  const { content } = viewModel
  const composer = content.composer
  const sources = uniquePromptItems(content.sources)
  const selectedIds = uniquePromptItems(content.selectedSourceIds.map((id) => ({ id }))).map((item) => item.id)
  const selectedSources = selectedIds.flatMap((id) => {
    const source = sources.find((item) => item.id === id)
    return source ? [source] : []
  })
  const availableSources = sources.filter((source) => !selectedIds.includes(source.id))
  const maximumSources = Math.max(0, content.maximumSources)
  const canAddSource = selectedSources.length < maximumSources
  const action = viewModel.onAction ?? onAction
  const [pickerOrigin, setPickerOrigin] = React.useState<PickerOrigin>(null)
  const listboxId = React.useId()
  const pickerRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const mentionMatch = composer?.draft.match(/(?:^|\s)@([^\s@]*)$/u)
  const mentionQuery = mentionMatch?.[1]?.toLocaleLowerCase() ?? ''
  const visibleSources =
    pickerOrigin === 'mention'
      ? availableSources.filter((source) => source.label.toLocaleLowerCase().includes(mentionQuery))
      : availableSources

  React.useEffect(() => {
    if (pickerOrigin === 'context') {
      pickerRef.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus()
    }
  }, [pickerOrigin])

  const handleDraftChange = (draft: string) => {
    viewModel.onDraftChange?.(draft)
    setPickerOrigin(canAddSource && /(?:^|\s)@[^\s@]*$/u.test(draft) ? 'mention' : null)
  }

  const selectSource = (id: string) => {
    const source = availableSources.find((item) => item.id === id)
    if (!source || !canAddSource) {
      return
    }
    if (pickerOrigin === 'mention' && composer) {
      const nextDraft = composer.draft.replace(/@[^\s@]*$/u, '')
      if (nextDraft !== composer.draft) {
        viewModel.onDraftChange?.(nextDraft)
      }
    }
    viewModel.onSourceAdd?.(id)
    action?.({ actionId: 'add-source', value: id })
    if (pickerOrigin === 'context') {
      triggerRef.current?.focus()
    }
    setPickerOrigin(null)
  }

  const handlePickerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement | HTMLButtonElement>) => {
    if (pickerOrigin === null) {
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setPickerOrigin(null)
      if (pickerOrigin === 'context') {
        triggerRef.current?.focus()
      }
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      return
    }
    const options = Array.from(pickerRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])
    if (options.length === 0) {
      return
    }
    event.preventDefault()
    const currentIndex = options.findIndex((option) => option === event.target)
    let nextIndex = 0
    if (event.key === 'End') {
      nextIndex = options.length - 1
    } else if (currentIndex >= 0 && event.key !== 'Home') {
      nextIndex = (currentIndex + (event.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length
    }
    options[nextIndex]?.focus()
  }

  return (
    <PromptFrame content={content} variantId={variantId} className={`lumen-prompt-reference-scope ${className ?? ''}`}>
      <div className="lumen-prompt-scope-content">
        {composer && selectedSources.length ? (
          <div className="lumen-prompt-scope-chips" role="group" aria-label={content.labels.sources}>
            {selectedSources.map((source) => {
              return (
                <span key={source.id} className="lumen-prompt-scope-chip" data-source-id={source.id}>
                  <SourceIcon kind={source.kind} />
                  <span>{source.label}</span>
                  <button
                    type="button"
                    aria-label={composer.labels.remove(source.label)}
                    data-hbar-app-ui-action="remove-source"
                    data-hbar-app-ui-target={source.id}
                    onClick={() => {
                      viewModel.onSourceRemove?.(source.id)
                      action?.({ actionId: 'remove-source', value: source.id })
                    }}
                  >
                    <X aria-hidden="true" className="lumen-prompt-reference-icon" />
                  </button>
                </span>
              )
            })}
          </div>
        ) : null}
        {composer ? (
          <PromptComposer
            composer={composer}
            onDraftChange={handleDraftChange}
            onRemoveAttachment={viewModel.onRemoveAttachment}
            onAction={action}
            expanded={pickerOrigin !== null}
            listboxId={listboxId}
            onKeyDown={handlePickerKeyDown}
          >
            <button
              ref={triggerRef}
              type="button"
              aria-haspopup="listbox"
              aria-expanded={pickerOrigin === 'context'}
              aria-controls={listboxId}
              disabled={!canAddSource}
              data-hbar-app-ui-action="open-context-picker"
              onKeyDown={handlePickerKeyDown}
              onClick={() => setPickerOrigin((current) => (current === 'context' ? null : 'context'))}
            >
              <AtSign aria-hidden="true" className="lumen-prompt-reference-icon" />
              {content.labels.addContext}
            </button>
          </PromptComposer>
        ) : null}
        {pickerOrigin !== null ? (
          <div
            ref={pickerRef}
            id={listboxId}
            role="listbox"
            aria-label={content.labels.sources}
            className="lumen-prompt-scope-picker"
          >
            {visibleSources.map((source) => (
              <button
                key={source.id}
                type="button"
                role="option"
                aria-selected="false"
                data-hbar-app-ui-action="add-source"
                data-hbar-app-ui-target={source.id}
                onKeyDown={handlePickerKeyDown}
                onClick={() => selectSource(source.id)}
              >
                <SourceIcon kind={source.kind} />
                <span>{source.label}</span>
                {source.detail ? <small>{source.detail}</small> : null}
              </button>
            ))}
          </div>
        ) : null}
        {pickerOrigin !== null && visibleSources.length === 0 ? <p role="status">{content.labels.empty}</p> : null}
      </div>
    </PromptFrame>
  )
}

export default ReferenceScopePrompt
