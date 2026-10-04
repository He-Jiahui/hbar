import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

export interface FilePreviewReveal {
  readonly requestId: string
  readonly line: number
  readonly column?: number | undefined
}
export function fileRevealOffsets(value: string, request: Pick<FilePreviewReveal, 'line' | 'column'>) {
  const lines = value.split('\n')
  const line = Math.max(1, Math.min(lines.length, request.line))
  const start = lines.slice(0, line - 1).reduce((offset, item) => offset + item.length + 1, 0)
  const length = lines[line - 1]?.length ?? 0
  const column = request.column ? Math.min(length, request.column - 1) : 0
  return { line, start: start + column, end: request.column ? start + column : start + length, column }
}

/** A one-shot request operates only on the active owner's already rendered file, never on document data. */
export function useFilePreviewReveal({
  reader,
  owner,
  previewId,
  request,
  value,
  ready,
  editing,
  onConsume,
}: {
  readonly reader: RefObject<HTMLDivElement | null>
  readonly owner: object
  readonly previewId: string | null
  readonly request: FilePreviewReveal | undefined
  readonly value: string
  readonly ready: boolean
  readonly editing: boolean
  readonly onConsume: (requestId: string) => Promise<void>
}) {
  const current = useRef({ owner, previewId, requestId: request?.requestId })
  current.current = { owner, previewId, requestId: request?.requestId }
  const intent = useRef({ owner, requestId: request?.requestId, interrupted: false })
  if (intent.current.owner !== owner || intent.current.requestId !== request?.requestId)
    intent.current = { owner, requestId: request?.requestId, interrupted: false }
  const [highlight, setHighlight] = useState<{ owner: object; previewId: string; line: number } | null>(null)
  const requestId = request?.requestId
  useLayoutEffect(() => {
    if (!requestId) return
    const captured = intent.current
    const interrupt = () => {
      if (captured.interrupted) return
      captured.interrupted = true
      void onConsume(requestId).catch(() => {})
    }
    const key = (event: KeyboardEvent) => {
      if (
        [
          'Tab',
          'Enter',
          'Escape',
          'Backspace',
          'Delete',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'Home',
          'End',
          'PageUp',
          'PageDown',
        ].includes(event.key) ||
        event.key.length === 1
      )
        interrupt()
    }
    window.addEventListener('pointerdown', interrupt, true)
    window.addEventListener('wheel', interrupt, true)
    window.addEventListener('touchstart', interrupt, true)
    window.addEventListener('keydown', key, true)
    window.addEventListener('beforeinput', interrupt, true)
    return () => {
      window.removeEventListener('pointerdown', interrupt, true)
      window.removeEventListener('wheel', interrupt, true)
      window.removeEventListener('touchstart', interrupt, true)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('beforeinput', interrupt, true)
    }
  }, [owner, requestId, onConsume])
  useLayoutEffect(() => {
    if (!request || !previewId || !ready) return
    const requestId = request.requestId
    const frame = requestAnimationFrame(() => {
      if (
        current.current.owner !== owner ||
        current.current.previewId !== previewId ||
        current.current.requestId !== requestId ||
        intent.current.interrupted
      )
        return
      const root = reader.current
      if (!root) return
      const target = fileRevealOffsets(value, request)
      if (editing) {
        const editor = root.querySelector<HTMLTextAreaElement>('.hbar-app-react-file-editor')
        if (!editor || editor.disabled) return
        editor.focus({ preventScroll: true })
        editor.setSelectionRange(target.start, target.end)
        const lineHeight = Number.parseFloat(getComputedStyle(editor).lineHeight)
        if (Number.isFinite(lineHeight))
          editor.scrollTop = Math.max(0, (target.line - 1) * lineHeight - editor.clientHeight / 2)
      } else {
        const viewport = root.querySelector<HTMLElement>('.hbar-file-text-preview')
        const code = viewport?.querySelector<HTMLElement>(`[data-source-code="${target.line - 1}"]`)
        if (!viewport || !code) return
        const box = viewport.getBoundingClientRect()
        const row = code.getBoundingClientRect()
        viewport.scrollTop += row.top - box.top - viewport.clientHeight / 2 + row.height / 2
        if (request.column && code.firstChild?.nodeType === Node.TEXT_NODE) {
          const range = code.ownerDocument.createRange()
          const offset = Math.min(code.firstChild.textContent?.length ?? 0, target.column)
          range.setStart(code.firstChild, offset)
          range.collapse(true)
          const point = range.getBoundingClientRect()
          if (point.width || point.height) viewport.scrollLeft += point.left - box.left - viewport.clientWidth / 2
        }
        viewport.focus({ preventScroll: true })
      }
      setHighlight({ owner, previewId, line: target.line })
      // A late ACK is identity-bound and cannot consume a newer click. Failures
      // leave the request pending in the runtime; they do not change file facts.
      void onConsume(requestId).catch(() => {})
    })
    return () => cancelAnimationFrame(frame)
  }, [reader, owner, previewId, request, value, ready, editing, onConsume])
  return highlight?.owner === owner && highlight.previewId === previewId ? highlight.line : undefined
}
