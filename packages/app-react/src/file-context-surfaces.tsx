import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { MessageCircle, MessageSquare } from 'lucide-react'
import { LumenContentText, LumenButton, LumenFrame, LumenIcon, LumenTextarea } from '@lumen/app-ui'
import type { FileComposerContextSelection } from '@hbar/app-runtime'
import './file-context-surfaces.css'

export interface HbarFileContextLabels {
  readonly addSelection: string
  readonly commentTitle: string
  readonly note: string
  readonly placeholder: string
  readonly addComment: string
  readonly cancel: string
  readonly range: (start: number, end: number, side?: 'old' | 'new') => string
  readonly commentLine: (path: string, line: number, side?: 'old' | 'new') => string
  readonly incompatible: string
}

export function HbarFileCommentEditor({
  labels,
  rangeLabel,
  disabled,
  note,
  onNote,
  onCancel,
  onSubmit,
}: {
  readonly labels: HbarFileContextLabels
  readonly rangeLabel: string
  readonly disabled: boolean
  readonly note: string
  readonly onNote: (note: string) => void
  readonly onCancel: () => void
  readonly onSubmit: (note: string) => Promise<boolean>
}) {
  const [submitting, setSubmitting] = useState(false)
  const submit = () => {
    if (disabled || submitting || !note.trim()) return
    setSubmitting(true)
    void onSubmit(note.trim()).finally(() => setSubmitting(false))
  }
  return (
    <LumenFrame className="hbar-file-comment-editor">
      <LumenFrame className="hbar-file-comment-heading">
        <LumenIcon icon={MessageSquare} tier="sm" />
        <LumenContentText context="record.title">{labels.commentTitle}</LumenContentText>
        <LumenContentText context="record.description">{rangeLabel}</LumenContentText>
      </LumenFrame>
      <LumenTextarea
        variant="plain"
        aria-label={labels.note}
        placeholder={labels.placeholder}
        value={note}
        rows={3}
        maxLength={4000}
        autoFocus
        disabled={disabled || submitting}
        onChange={(event) => onNote(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            if (!submitting) onCancel()
          } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            submit()
          }
        }}
      />
      <LumenFrame className="hbar-file-comment-actions">
        <LumenButton variant="text" disabled={submitting} onClick={onCancel}>
          {labels.cancel}
        </LumenButton>
        <LumenButton tone="primary" disabled={disabled || submitting || !note.trim()} onClick={submit}>
          {labels.addComment}
        </LumenButton>
      </LumenFrame>
    </LumenFrame>
  )
}

interface TextSelection {
  readonly startOffset: number
  readonly endOffset: number
  readonly rect: DOMRect
}

function codeEndpoint(root: HTMLElement, node: Node, offset: number): { line: number; offset: number } | null {
  const element = node instanceof Element ? node : node.parentElement
  const code = element?.closest<HTMLElement>('[data-source-code]')
  if (!code || !root.contains(code)) return null
  const line = Number(code.dataset.sourceCode)
  const prefix = root.ownerDocument.createRange()
  prefix.selectNodeContents(code)
  prefix.setEnd(node, offset)
  return { line, offset: prefix.toString().length }
}

function captureTextSelection(root: HTMLElement, starts: readonly number[]): TextSelection | null {
  const selection = root.ownerDocument.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !selection.toString().trim()) return null
  const range = selection.getRangeAt(0)
  const start = codeEndpoint(root, range.startContainer, range.startOffset)
  const end = codeEndpoint(root, range.endContainer, range.endOffset)
  if (!start || !end || starts[start.line] === undefined || starts[end.line] === undefined) return null
  const startOffset = starts[start.line]! + start.offset
  const endOffset = starts[end.line]! + end.offset
  if (startOffset >= endOffset) return null
  return { startOffset, endOffset, rect: range.getBoundingClientRect() }
}

function SelectionMenu({
  selection,
  label,
  disabled,
  onAdd,
  onDismiss,
}: {
  readonly selection: TextSelection
  readonly label: string
  readonly disabled: boolean
  readonly onAdd: () => void
  readonly onDismiss: () => void
}) {
  const menu = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const box = menu.current?.getBoundingClientRect()
    if (!box) return
    const margin = 8
    const top =
      selection.rect.bottom + margin + box.height <= innerHeight
        ? selection.rect.bottom + margin
        : selection.rect.top - margin - box.height
    setPosition({
      left: Math.max(margin, Math.min(selection.rect.left, innerWidth - box.width - margin)),
      top: Math.max(margin, Math.min(top, innerHeight - box.height - margin)),
    })
  }, [selection])
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) onDismiss()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    window.addEventListener('resize', onDismiss)
    window.addEventListener('scroll', onDismiss, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('resize', onDismiss)
      window.removeEventListener('scroll', onDismiss, true)
    }
  }, [onDismiss])
  return createPortal(
    <LumenFrame
      ref={menu}
      className="hbar-file-selection-menu"
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}
    >
      <LumenButton variant="text" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={onAdd}>
        <LumenIcon icon={MessageCircle} tier="md" />
        {label}
      </LumenButton>
    </LumenFrame>,
    document.body,
  )
}

export function HbarFileSourceSurface({
  path,
  value,
  sha256,
  previewLabel,
  labels,
  disabled,
  revealedLine,
  onAdd,
}: {
  readonly path: string
  readonly value: string
  readonly sha256: string | null
  readonly previewLabel: string
  readonly labels: HbarFileContextLabels
  readonly disabled: boolean
  readonly revealedLine?: number | undefined
  readonly onAdd: (selection: FileComposerContextSelection) => Promise<boolean>
}) {
  const root = useRef<HTMLDivElement>(null)
  const buttons = useRef(new Map<number, HTMLButtonElement>())
  const [selection, setSelection] = useState<TextSelection | null>(null)
  const [comment, setComment] = useState<{ anchor: number; focus: number; note: string } | null>(null)
  const lines = value.split('\n')
  let offset = 0
  const starts = lines.map((line) => {
    const start = offset
    offset += line.length + 1
    return start
  })
  const startLine = comment ? Math.min(comment.anchor, comment.focus) : -1
  const endLine = comment ? Math.max(comment.anchor, comment.focus) : -1
  const dismiss = () => setSelection(null)
  const closeComment = () => {
    const anchor = comment?.anchor
    setComment(null)
    if (anchor !== undefined) requestAnimationFrame(() => buttons.current.get(anchor)?.focus())
  }
  const mouseUp = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.ctrlKey || disabled || !sha256) return dismiss()
    setSelection(captureTextSelection(event.currentTarget, starts))
  }
  return (
    <LumenFrame
      ref={root}
      className="hbar-file-text-preview hbar-file-source-surface"
      aria-label={previewLabel}
      tabIndex={0}
      onMouseUp={mouseUp}
      onKeyUp={(event) => {
        if (event.key === 'Escape') dismiss()
        else if (event.shiftKey && root.current && !disabled) setSelection(captureTextSelection(root.current, starts))
      }}
    >
      {lines.map((line, index) => (
        <LumenFrame key={index}>
          <LumenFrame
            className="hbar-file-source-row"
            data-selected={index >= startLine && index <= endLine}
            data-revealed={index + 1 === revealedLine || undefined}
          >
            <LumenButton
              ref={(element) => {
                if (element) buttons.current.set(index, element)
                else buttons.current.delete(index)
              }}
              variant="text"
              indicator="none"
              className="hbar-file-line-control"
              aria-label={labels.commentLine(path, index + 1)}
              aria-pressed={index >= startLine && index <= endLine}
              disabled={disabled || !sha256 || !line}
              onClick={(event) => {
                dismiss()
                setComment((current) =>
                  event.shiftKey && current ? { ...current, focus: index } : { anchor: index, focus: index, note: '' },
                )
              }}
            >
              {index + 1}
            </LumenButton>
            <LumenContentText context="message.inline" data-source-code={index}>
              {line || '\u200b'}
            </LumenContentText>
          </LumenFrame>
          {comment && endLine === index && (
            <HbarFileCommentEditor
              key={`${startLine}:${endLine}`}
              labels={labels}
              rangeLabel={labels.range(startLine + 1, endLine + 1)}
              disabled={disabled}
              note={comment.note}
              onNote={(note) => setComment((current) => (current ? { ...current, note } : null))}
              onCancel={closeComment}
              onSubmit={async (note) => {
                if (!sha256) return false
                const added = await onAdd({
                  kind: 'source-comment',
                  sha256,
                  startOffset: starts[startLine]!,
                  endOffset: starts[endLine]! + lines[endLine]!.length,
                  note,
                })
                if (added) closeComment()
                return added
              }}
            />
          )}
        </LumenFrame>
      ))}
      {selection && (
        <SelectionMenu
          selection={selection}
          label={labels.addSelection}
          disabled={disabled}
          onDismiss={dismiss}
          onAdd={() => {
            if (!sha256) return
            void onAdd({
              kind: 'source-selection',
              sha256,
              startOffset: selection.startOffset,
              endOffset: selection.endOffset,
            }).then((added) => {
              if (!added) return
              dismiss()
              root.current?.ownerDocument.getSelection()?.removeAllRanges()
            })
          }}
        />
      )}
    </LumenFrame>
  )
}
