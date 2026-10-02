import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { Maximize, Minus, Plus, Workflow } from 'lucide-react'
import { LumenButton, LumenDialog, LumenFrame, LumenIcon, LumenText } from '@lumen/app-ui'
import { clampDiagramZoom, fitDiagramZoom, type HbarDiagramLabels } from './markdown-diagram-model'
import { renderMarkdownDiagram, type DiagramRenderResult } from './markdown-diagram-render'
import { registerSessionCodeBlock } from './session-code-block-dom'
import './markdown-diagram.css'

/** A single original source pane, with a static graphic as renderer-owned chrome. */
export function MarkdownDiagram({
  text,
  sourceText,
  owner,
  labels,
  copy,
  find,
  occurrenceId,
  className,
  streaming = false,
}: {
  readonly text: string
  readonly sourceText: string
  readonly owner?: object | undefined
  readonly labels: HbarDiagramLabels
  readonly copy: ReactNode
  readonly find: boolean
  readonly occurrenceId: string
  readonly className?: string | undefined
  readonly streaming?: boolean | undefined
}) {
  const root = useRef<HTMLDivElement>(null)
  const header = useRef<HTMLDivElement>(null)
  const graphic = useRef<HTMLDivElement>(null)
  const modalChrome = useRef<HTMLDivElement>(null)
  const source = useRef<HTMLPreElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const lifetime = useRef(0)
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null)
  const [result, setResult] = useState<DiagramRenderResult | null>(null)
  const [showSource, setShowSource] = useState(false)
  const [open, setOpen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [fit, setFit] = useState(true)
  const [retry, setRetry] = useState(0)
  const [dark, setDark] = useState(false)
  useLayoutEffect(() => {
    const update = () => setDark(document.documentElement.dataset.lumenMode === 'dark')
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-lumen-mode'] })
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => {
    lifetime.current += 1
    setResult(null)
    setShowSource(false)
    setOpen(false)
    drag.current = null
    if (streaming)
      return () => {
        lifetime.current += 1
      }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      if (!controller.signal.aborted) {
        setResult({ status: 'failed', reason: 'failed' })
        controller.abort()
      }
    }, 12_000)
    void renderMarkdownDiagram({ source: text, dark, signal: controller.signal }).then((next) => {
      clearTimeout(timer)
      if (!controller.signal.aborted && next.status !== 'cancelled') setResult(next)
    })
    return () => {
      lifetime.current += 1
      clearTimeout(timer)
      controller.abort()
    }
  }, [text, owner, dark, retry, streaming])
  useLayoutEffect(() => {
    const element = root.current
    if (!find || !element) return
    return registerSessionCodeBlock({
      root: element,
      chrome: [header.current, graphic.current, modalChrome.current].flatMap((item) => (item ? [item] : [])),
      revealHiddenTail: (ranges) => {
        const original = source.current
        if (!original?.hidden || !ranges.some((range) => range.intersectsNode(original))) return false
        flushSync(() => setShowSource(true))
        return !original.hidden
      },
    })
  }, [find, owner, sourceText, result, showSource])
  const ready = result?.status === 'ready' ? result : null
  const close = () => {
    setOpen(false)
    drag.current = null
    const target = opener.current
    const captured = lifetime.current
    requestAnimationFrame(() => {
      if (lifetime.current === captured && target?.isConnected && root.current?.contains(target))
        target.focus({ preventScroll: true })
    })
  }
  const preview = (target: HTMLElement) => {
    opener.current = target
    setZoom(1)
    setFit(true)
    setOpen(true)
  }
  useEffect(() => {
    const pane = viewport.current
    if (!open || !ready || !pane || !fit) return
    const update = () => {
      // The graphic grows in flow. Fitting against its already-scaled height
      // would feed each ResizeObserver update back into the next fit and shrink
      // toward 5%; use the preview's documented scroll ceiling instead.
      const maximumHeight = Number.parseFloat(getComputedStyle(pane).maxBlockSize)
      setZoom(
        fitDiagramZoom(
          ready.width,
          ready.height,
          pane.clientWidth,
          Number.isFinite(maximumHeight) ? maximumHeight : pane.clientHeight,
        ),
      )
      pane.scrollTop = 0
      pane.scrollLeft = 0
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(pane)
    return () => observer.disconnect()
  }, [open, ready, fit])
  const zoomTo = (value: number) => {
    const pane = viewport.current
    const next = clampDiagramZoom(value)
    const centerX = pane ? (pane.scrollLeft + pane.clientWidth / 2) / zoom : 0
    const centerY = pane ? (pane.scrollTop + pane.clientHeight / 2) / zoom : 0
    setFit(false)
    setZoom(next)
    requestAnimationFrame(() => {
      if (pane && pane === viewport.current && pane.isConnected) {
        pane.scrollLeft = Math.max(0, centerX * next - pane.clientWidth / 2)
        pane.scrollTop = Math.max(0, centerY * next - pane.clientHeight / 2)
      }
    })
  }
  const stopDrag = () => {
    const pane = viewport.current
    const captured = drag.current
    drag.current = null
    if (pane && captured && pane.hasPointerCapture(captured.id)) pane.releasePointerCapture(captured.id)
  }
  return (
    <LumenFrame
      ref={root}
      className={['hbar-message-code', 'hbar-markdown-diagram', className].filter(Boolean).join(' ')}
      data-code-occurrence={occurrenceId}
    >
      <LumenFrame ref={header} className="hbar-message-code-header" data-session-find-exclude="code-chrome">
        <LumenFrame className="hbar-message-code-metadata">
          <LumenIcon icon={Workflow} tier="sm" />
          <LumenText as="span">{labels.title}</LumenText>
        </LumenFrame>
        <LumenFrame className="hbar-diagram-actions">
          <LumenButton
            size="s"
            variant="text"
            indicator="none"
            aria-pressed={showSource}
            onClick={() => setShowSource((value) => !value)}
          >
            {showSource ? labels.diagram : labels.source}
          </LumenButton>
          <LumenButton
            size="s"
            variant="text"
            indicator="none"
            disabled={!ready}
            onClick={(event) => preview(event.currentTarget)}
          >
            <LumenIcon icon={Maximize} tier="sm" />
            {labels.preview}
          </LumenButton>
          {copy}
        </LumenFrame>
      </LumenFrame>
      <LumenFrame
        ref={graphic}
        className="hbar-diagram-graphic"
        hidden={showSource}
        data-session-find-exclude="code-chrome"
      >
        {ready ? (
          <LumenButton
            className="hbar-diagram-inline"
            variant="text"
            indicator="none"
            aria-label={labels.preview}
            onClick={(event) => preview(event.currentTarget)}
          >
            <span
              className="hbar-diagram-svg"
              style={{ inlineSize: `min(100%, ${ready.width / 16}rem)` }}
              dangerouslySetInnerHTML={{ __html: ready.svg }}
            />
          </LumenButton>
        ) : (
          <LumenFrame className="hbar-diagram-status">
            <LumenText as="p" role="status">
              {streaming
                ? labels.generating
                : result?.status === 'failed'
                  ? labels.failure(result.reason)
                  : labels.loading}
            </LumenText>
            {result?.status === 'failed' &&
              (result.reason === 'busy' || result.reason === 'failed' || result.reason === 'invalid') && (
                <LumenButton size="s" variant="text" indicator="none" onClick={() => setRetry((value) => value + 1)}>
                  {labels.retry}
                </LumenButton>
              )}
          </LumenFrame>
        )}
      </LumenFrame>
      <pre ref={source} className="hbar-message-code-body" hidden={!showSource} tabIndex={0}>
        <LumenText as="code" variant="code">
          {sourceText}
        </LumenText>
      </pre>
      <LumenFrame ref={modalChrome} data-session-find-exclude="code-chrome">
        {open && ready && (
          <LumenDialog
            open={open}
            title={labels.previewTitle}
            closeLabel={labels.close}
            onClose={close}
            appearance="panel"
            className="hbar-diagram-preview-overlay"
          >
            <LumenFrame className="hbar-diagram-preview-tools">
              <LumenButton
                size="s"
                variant="text"
                indicator="none"
                aria-label={labels.zoomOut}
                disabled={zoom <= 0.05}
                onClick={() => zoomTo(zoom - 0.25)}
              >
                <LumenIcon icon={Minus} tier="md" />
              </LumenButton>
              <LumenButton
                size="s"
                variant="text"
                indicator="none"
                aria-label={labels.resetZoom}
                onClick={() => zoomTo(1)}
              >
                {labels.zoom(Math.round(zoom * 100))}
              </LumenButton>
              <LumenButton size="s" variant="text" indicator="none" onClick={() => setFit(true)}>
                {labels.fit}
              </LumenButton>
              <LumenButton
                size="s"
                variant="text"
                indicator="none"
                aria-label={labels.zoomIn}
                disabled={zoom >= 3}
                onClick={() => zoomTo(zoom + 0.25)}
              >
                <LumenIcon icon={Plus} tier="md" />
              </LumenButton>
              {copy}
            </LumenFrame>
            <LumenFrame
              ref={viewport}
              className="hbar-diagram-preview-viewport"
              tabIndex={0}
              onWheel={(event) => {
                if (event.ctrlKey || event.metaKey) {
                  event.preventDefault()
                  zoomTo(zoom + (event.deltaY < 0 ? 0.25 : -0.25))
                }
              }}
              onPointerDown={(event) => {
                if (event.pointerType === 'mouse' && event.button !== 0) return
                const pane = event.currentTarget
                drag.current = {
                  id: event.pointerId,
                  x: event.clientX,
                  y: event.clientY,
                  left: pane.scrollLeft,
                  top: pane.scrollTop,
                }
                pane.setPointerCapture(event.pointerId)
              }}
              onPointerMove={(event) => {
                const captured = drag.current
                if (!captured || captured.id !== event.pointerId) return
                event.preventDefault()
                event.currentTarget.scrollLeft = captured.left - (event.clientX - captured.x)
                event.currentTarget.scrollTop = captured.top - (event.clientY - captured.y)
              }}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
              onLostPointerCapture={() => {
                drag.current = null
              }}
            >
              <LumenFrame
                className="hbar-diagram-zoom-canvas"
                style={{ inlineSize: `${(ready.width * zoom) / 16}rem`, blockSize: `${(ready.height * zoom) / 16}rem` }}
              >
                <span className="hbar-diagram-svg" dangerouslySetInnerHTML={{ __html: ready.previewSvg }} />
              </LumenFrame>
            </LumenFrame>
            <LumenText as="p" className="hbar-diagram-help" tone="muted">
              {labels.panHelp}
            </LumenText>
          </LumenDialog>
        )}
      </LumenFrame>
    </LumenFrame>
  )
}
