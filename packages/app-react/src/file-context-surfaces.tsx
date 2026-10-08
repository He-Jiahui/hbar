import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { MessageCircle, MessageSquare } from 'lucide-react'
import {
  LumenButton,
  LumenContentText,
  LumenFloatingSurface,
  LumenFrame,
  LumenIcon,
  LumenTextarea,
} from '@lumen/app-ui'
import type { FileComposerContextSelection } from '@hbar/app-runtime'
import type { FileDiffPagination } from './file-preview-pagination'
import { fileSourcePage, FILE_SOURCE_LINES_PER_PAGE, type FileSourceLine } from './file-source-pagination'
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
  readonly previousLines: string
  readonly nextLines: string
  readonly linePage: (from: number, to: number, total: number) => string
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
        <LumenContentText context="section.title" level={3} className="hbar-file-comment-title">
          {labels.commentTitle}
        </LumenContentText>
        <LumenFrame className="hbar-file-comment-range" role="group" aria-label={rangeLabel} tabIndex={0}>
          <LumenContentText context="metadata.detail">{rangeLabel}</LumenContentText>
        </LumenFrame>
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
      <LumenFrame className="hbar-file-comment-actions" role="group" aria-label={labels.commentTitle} tabIndex={0}>
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

function codeEndpoint(root: HTMLElement, node: Node, offset: number): number | null {
  const element = node instanceof Element ? node : node.parentElement
  const code = element?.closest<HTMLElement>('[data-source-code]')
  if (!code || !root.contains(code)) return null
  const start = Number(code.dataset.sourceStart)
  const length = Number(code.dataset.sourceLength)
  if (!Number.isFinite(start) || !Number.isFinite(length)) return null
  const prefix = root.ownerDocument.createRange()
  prefix.selectNodeContents(code)
  prefix.setEnd(node, offset)
  return start + Math.min(length, prefix.toString().length)
}

function captureTextSelection(root: HTMLElement): TextSelection | null {
  const selection = root.ownerDocument.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !selection.toString().trim()) return null
  const range = selection.getRangeAt(0)
  const start = codeEndpoint(root, range.startContainer, range.startOffset)
  const end = codeEndpoint(root, range.endContainer, range.endOffset)
  if (start === null || end === null) return null
  const startOffset = start
  const endOffset = end
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
  return (
    <LumenFloatingSurface
      open
      mode="point"
      anchorPoint={{ x: selection.rect.left, y: selection.rect.bottom }}
      placement="below"
      responsivePresentation="anchored"
      environmentChangeBehavior="dismiss"
      focusBehavior="preserve"
      restoreFocus={false}
      onClose={onDismiss}
      label={label}
      role="group"
      tabIndex={0}
      className="hbar-file-selection-menu"
    >
      <LumenButton variant="text" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={onAdd}>
        <LumenIcon icon={MessageCircle} tier="md" />
        {label}
      </LumenButton>
    </LumenFloatingSurface>
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
  pagination,
  onAdd,
}: {
  readonly path: string
  readonly value: string
  readonly sha256: string | null
  readonly previewLabel: string
  readonly labels: HbarFileContextLabels
  readonly disabled: boolean
  readonly revealedLine?: number | undefined
  /** The workspace owns at most 32 preview pages; standalone consumers keep one local page. */
  readonly pagination?: FileDiffPagination | undefined
  readonly onAdd: (selection: FileComposerContextSelection) => Promise<boolean>
}) {
  const root = useRef<HTMLDivElement>(null)
  const buttons = useRef(new Map<number, HTMLButtonElement>())
  const [selection, setSelection] = useState<TextSelection | null>(null)
  const [requestedPage, setPage] = useState(0)
  const page = useMemo(
    () => fileSourcePage(value, pagination?.page ?? requestedPage),
    [value, pagination?.page, requestedPage],
  )
  const changePage = pagination?.onChange ?? setPage
  const controlled = Boolean(pagination)
  useLayoutEffect(() => {
    if (!controlled) setPage(page.page)
  }, [controlled, page.page])
  const [review, setReview] = useState<{
    value: string
    anchor: FileSourceLine
    focus: FileSourceLine
    note: string
  } | null>(null)
  const comment = review?.value === value ? review : null
  useLayoutEffect(() => {
    setSelection(null)
    setReview(null)
  }, [path, value, sha256])
  const startLine = comment ? Math.min(comment.anchor.index, comment.focus.index) : -1
  const endLine = comment ? Math.max(comment.anchor.index, comment.focus.index) : -1
  const startOffset = comment ? Math.min(comment.anchor.startOffset, comment.focus.startOffset) : 0
  const endOffset = comment
    ? Math.max(
        comment.anchor.startOffset + comment.anchor.text.length,
        comment.focus.startOffset + comment.focus.text.length,
      )
    : 0
  const dismiss = () => setSelection(null)
  const closeComment = () => {
    const anchor = comment?.anchor.index
    setReview(null)
    if (anchor !== undefined) {
      changePage(Math.floor(anchor / FILE_SOURCE_LINES_PER_PAGE))
      requestAnimationFrame(() => buttons.current.get(anchor)?.focus())
    }
  }
  const mouseUp = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.ctrlKey || disabled || !sha256) return dismiss()
    setSelection(captureTextSelection(event.currentTarget))
  }
  return (
    <LumenFrame className="hbar-file-source-workspace">
      <LumenFrame
        ref={root}
        className="hbar-file-text-preview hbar-file-source-surface"
        aria-label={previewLabel}
        tabIndex={0}
        onMouseUp={mouseUp}
        onKeyUp={(event) => {
          if (event.key === 'Escape') dismiss()
          else if (event.shiftKey && root.current && !disabled) setSelection(captureTextSelection(root.current))
        }}
      >
        {page.lines.map((row) => {
          const { text: line, index } = row
          return (
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
                    setReview((current) =>
                      event.shiftKey && current?.value === value
                        ? { ...current, focus: row }
                        : { value, anchor: row, focus: row, note: '' },
                    )
                  }}
                >
                  {index + 1}
                </LumenButton>
                <LumenContentText
                  context="code.inline"
                  data-source-code={index}
                  data-source-start={row.startOffset}
                  data-source-length={line.length}
                >
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
                  onNote={(note) => setReview((current) => (current ? { ...current, note } : null))}
                  onCancel={closeComment}
                  onSubmit={async (note) => {
                    if (!sha256) return false
                    const added = await onAdd({
                      kind: 'source-comment',
                      sha256,
                      startOffset,
                      endOffset,
                      note,
                    })
                    if (added) closeComment()
                    return added
                  }}
                />
              )}
            </LumenFrame>
          )
        })}
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
      {page.totalLines > FILE_SOURCE_LINES_PER_PAGE && (
        <LumenFrame
          className="hbar-file-source-pagination"
          role="group"
          aria-label={labels.linePage(page.startLine + 1, page.startLine + page.lines.length, page.totalLines)}
          tabIndex={0}
        >
          <LumenContentText context="metadata.detail">
            {labels.linePage(page.startLine + 1, page.startLine + page.lines.length, page.totalLines)}
          </LumenContentText>
          <LumenButton
            disabled={disabled || page.page === 0}
            onClick={() => {
              dismiss()
              changePage(page.page - 1)
            }}
          >
            {labels.previousLines}
          </LumenButton>
          <LumenButton
            disabled={disabled || page.startLine + page.lines.length >= page.totalLines}
            onClick={() => {
              dismiss()
              changePage(page.page + 1)
            }}
          >
            {labels.nextLines}
          </LumenButton>
        </LumenFrame>
      )}
    </LumenFrame>
  )
}
