import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { Actions, Layout, Model, type IJsonModel } from 'flexlayout-react'
import { LumenFrame } from '@lumen/app-ui'
import './lumen-flex-layout-adapter.css'
import 'flexlayout-react/style/dark.css'

/** CSS pixels in the layout container, independent of native display scaling. */
export interface HbarFlexLayoutGeometry {
  readonly widthPx: number
  readonly remPx: number
  readonly splitterSizePx: number
}

export interface HbarFlexLayoutAdapterProps {
  readonly model: IJsonModel
  readonly factory: (node: { readonly component: string; readonly id: string }) => ReactNode
  /** Called once for a committed row resize; pane activation does not write layout preferences. */
  readonly onModelChange?: (model: IJsonModel, geometry: HbarFlexLayoutGeometry) => void
  readonly onGeometryChange?: (geometry: HbarFlexLayoutGeometry) => void
  readonly className?: string
}

export interface HbarDesktopLayoutProjectionProps {
  readonly model: IJsonModel
  readonly panes: Readonly<Record<'projects' | 'workspace' | 'session-tool', ReactNode>>
  readonly onModelChange?: (model: IJsonModel, geometry: HbarFlexLayoutGeometry) => void
  readonly onGeometryChange?: (geometry: HbarFlexLayoutGeometry) => void
}

export function desktopPaneForComponent(
  component: string | undefined,
  panes: Readonly<Record<'projects' | 'workspace' | 'session-tool', ReactNode>>,
): ReactNode {
  if (component === 'sidebar') return panes.projects
  if (component === 'page') return panes.workspace
  if (component === 'tool') return panes['session-tool']
  return null
}

/** Renders the host's descriptor projection; the adapter never owns layout state. */
export function HbarFlexLayoutAdapter({
  model: json,
  factory,
  onModelChange,
  onGeometryChange,
  className,
}: HbarFlexLayoutAdapterProps) {
  const model = useMemo(() => Model.fromJson(json), [json])
  const frameRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ element: Element; pointerId: number } | null>(null)
  useLayoutEffect(() => {
    // FlexLayout keeps real DOM probes for its border measurement; they are not content or controls.
    for (const probe of frameRef.current?.querySelectorAll('.flexlayout__border_sizer') ?? []) {
      probe.setAttribute('aria-hidden', 'true')
    }
  }, [model])
  useEffect(() => {
    const document = frameRef.current?.ownerDocument
    if (!document) return
    const finish = () => {
      dragRef.current = null
    }
    const cancel = () => {
      const drag = dragRef.current
      if (!drag) return
      dragRef.current = null
      // FlexLayout cancels on pointercancel, but does not handle Escape itself.
      drag.element.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: drag.pointerId }))
      if (drag.element.hasPointerCapture(drag.pointerId)) drag.element.releasePointerCapture(drag.pointerId)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !dragRef.current) return
      event.preventDefault()
      event.stopPropagation()
      cancel()
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerup', finish, true)
    document.addEventListener('pointercancel', finish, true)
    return () => {
      cancel()
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerup', finish, true)
      document.removeEventListener('pointercancel', finish, true)
    }
  }, [model])
  const readGeometry = useCallback((): HbarFlexLayoutGeometry | undefined => {
    const frame = frameRef.current
    if (!frame) return undefined
    const widthPx = Number.parseFloat(getComputedStyle(frame).width)
    const remPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
    const splitter = frame.querySelector('.flexlayout__splitter')
    const splitterSizePx = splitter
      ? Number.parseFloat(getComputedStyle(splitter).width)
      : (model.getSplitterSize() ?? 8)
    if (![widthPx, remPx, splitterSizePx].every(Number.isFinite) || widthPx <= 0 || remPx <= 0 || splitterSizePx < 0)
      return undefined
    return { widthPx, remPx, splitterSizePx }
  }, [model])
  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame || !onGeometryChange) return
    const update = () => {
      const geometry = readGeometry()
      if (geometry) onGeometryChange(geometry)
    }
    const observer = new ResizeObserver(update)
    observer.observe(frame)
    observer.observe(document.documentElement)
    // A font-size change can leave the container's pixel width unchanged.
    const rootObserver = new MutationObserver(update)
    rootObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] })
    update()
    return () => {
      observer.disconnect()
      rootObserver.disconnect()
    }
  }, [readGeometry, onGeometryChange])
  return (
    <LumenFrame
      ref={frameRef}
      className={className}
      data-hbar-layout-adapter="flexlayout"
      onPointerDownCapture={(event) => {
        const splitter = event.target instanceof Element ? event.target.closest('.flexlayout__splitter') : null
        if (splitter && event.button === 0) dragRef.current = { element: splitter, pointerId: event.pointerId }
      }}
    >
      <Layout
        model={model}
        factory={(node) => {
          const component = node.getComponent()
          return factory({ component: typeof component === 'string' ? component : '', id: node.getId() })
        }}
        {...(onModelChange
          ? {
              onModelChange: (next, action) => {
                if (action.type !== Actions.ADJUST_WEIGHTS || action.isAdjusting()) return
                const geometry = readGeometry()
                if (geometry) onModelChange(next.toJson(), geometry)
              },
            }
          : {})}
      />
    </LumenFrame>
  )
}

/** Desktop projection with a closed component whitelist for the three shell panes. */
export function HbarDesktopLayoutProjection({
  model,
  panes,
  onModelChange,
  onGeometryChange,
}: HbarDesktopLayoutProjectionProps) {
  return (
    <HbarFlexLayoutAdapter
      model={model}
      className="hbar-desktop-layout-projection"
      factory={({ component }) => desktopPaneForComponent(component, panes)}
      {...(onModelChange ? { onModelChange } : {})}
      {...(onGeometryChange ? { onGeometryChange } : {})}
    />
  )
}
