'use client'

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import './floating-surface.css'

/** The geometry used by a transient surface. */
export type FloatingSurfaceMode = 'anchored' | 'point' | 'modal'

/** A preferred side for a surface that has an anchor. */
export type FloatingPlacement = 'above' | 'below' | 'left' | 'right'

/** Theme-independent material overrides accepted by the shared primitive. */
export interface FloatingSurfaceMaterial {
  readonly kind?: 'glass' | 'frost' | 'solid' | undefined
  readonly mode?: 'glass' | 'frost' | 'solid' | undefined
  readonly blur?: string | number | undefined
  readonly blurAmount?: number | undefined
  readonly background?: string | undefined
  readonly color?: string | undefined
  readonly borderColor?: string | undefined
  readonly shadow?: string | undefined
}

/**
 * The common shape used by the app shell and Lumen controls when they register
 * an open transient surface.  `getElement` is a getter instead of an element
 * value because React registers the surface before its portal node is mounted
 * in a few renderers (and because StrictMode mounts effects twice).
 */
export interface FloatingSurfaceRegistration {
  readonly id: string
  readonly close: () => void
  readonly getElement?: (() => HTMLElement | null) | undefined
  readonly element?: HTMLElement | null | undefined
  readonly anchor?: HTMLElement | null | undefined
  readonly mode?: FloatingSurfaceMode | undefined
  /** A child surface keeps its owner active while it is open. */
  readonly parentId?: string | undefined
  readonly nested?: boolean | undefined
  readonly trapFocus?: boolean | undefined
}

interface RegisteredSurface extends FloatingSurfaceRegistration {
  readonly order: number
  readonly getElement: () => HTMLElement | null
}

const registrations = new Map<string, RegisteredSurface>()
const pointerClosedAnchors = new WeakSet<HTMLElement>()
const pointerClosedEvents = new WeakSet<Event>()
let registrationOrder = 0
let listenersInstalled = false

function elementFor(surface: RegisteredSurface): HTMLElement | null {
  return surface.getElement()
}

function isDescendantOf(surface: RegisteredSurface, ancestor: RegisteredSurface): boolean {
  let parentId = surface.parentId
  while (parentId) {
    if (parentId === ancestor.id) {
      return true
    }
    parentId = registrations.get(parentId)?.parentId
  }
  return false
}

function pathIncludes(path: readonly EventTarget[], element: HTMLElement | null): boolean {
  return element ? path.includes(element) : false
}

function surfaceIsInPath(surface: RegisteredSurface, path: readonly EventTarget[]): boolean {
  if (pathIncludes(path, elementFor(surface))) {
    return true
  }
  for (const candidate of registrations.values()) {
    if (!isDescendantOf(candidate, surface)) {
      continue
    }
    if (pathIncludes(path, elementFor(candidate))) {
      return true
    }
  }
  return false
}

function shouldProtectFromPointer(surface: RegisteredSurface, path: readonly EventTarget[]): boolean {
  if (surfaceIsInPath(surface, path)) {
    return true
  }
  // The anchor is intentionally outside an anchored surface.  Clicking it is
  // an outside click and must close the surface, even when its owner is also
  // present in the composed path.
  return false
}

function focusableElements(surface: HTMLElement): HTMLElement[] {
  return [
    ...surface.querySelectorAll<HTMLElement>(
      '[autofocus],a[href],area[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[contenteditable="true"],[tabindex]:not([tabindex="-1"])',
    ),
  ].filter((element) => {
    if (element.matches('[inert], :disabled')) {
      return false
    }
    const style = getComputedStyle(element)
    return style.visibility !== 'hidden' && style.display !== 'none' && element.getClientRects().length > 0
  })
}

function activeLeaf(): RegisteredSurface | undefined {
  const values = [...registrations.values()].sort((left, right) => right.order - left.order)
  return values.find((surface) => !values.some((candidate) => isDescendantOf(candidate, surface)))
}

function handlePointerDown(event: PointerEvent): void {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target as EventTarget]
  const values = [...registrations.values()].sort((left, right) => right.order - left.order)
  for (const surface of values) {
    if (shouldProtectFromPointer(surface, path)) {
      continue
    }
    const anchor = surface.anchor
    if (anchor && pathIncludes(path, anchor)) {
      pointerClosedEvents.add(event)
      pointerClosedAnchors.add(anchor)
      if (event.target instanceof HTMLElement) {
        pointerClosedAnchors.add(event.target)
      }
      event.preventDefault()
    }
    surface.close()
  }
}

function handleTabKeyDown(event: KeyboardEvent): void {
  const surface = activeLeaf()
  if (!surface) {
    return
  }
  const element = elementFor(surface)
  if (!element) {
    return
  }
  if (event.key !== 'Tab' || !surface.trapFocus) {
    return
  }
  if (document.activeElement !== element && !element.contains(document.activeElement)) {
    return
  }
  const controls = focusableElements(element)
  const first = controls[0]
  const last = controls.at(-1)
  if (!first || !last) {
    event.preventDefault()
    element.focus({ preventScroll: true })
    return
  }
  if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) {
    event.preventDefault()
    last.focus({ preventScroll: true })
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus({ preventScroll: true })
  }
}

function handleEscapeKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.defaultPrevented) {
    return
  }
  const surface = activeLeaf()
  if (!surface) {
    return
  }
  event.preventDefault()
  event.stopPropagation()
  surface.close()
}

function installListeners(): void {
  if (listenersInstalled || typeof document === 'undefined') {
    return
  }
  document.addEventListener('pointerdown', handlePointerDown, true)
  document.addEventListener('keydown', handleTabKeyDown, true)
  document.addEventListener('keydown', handleEscapeKeyDown)
  listenersInstalled = true
}

function removeListenersIfIdle(): void {
  if (!listenersInstalled || registrations.size > 0 || typeof document === 'undefined') {
    return
  }
  document.removeEventListener('pointerdown', handlePointerDown, true)
  document.removeEventListener('keydown', handleTabKeyDown, true)
  document.removeEventListener('keydown', handleEscapeKeyDown)
  listenersInstalled = false
}

function sameScope(existing: RegisteredSurface, next: FloatingSurfaceRegistration): boolean {
  if (next.parentId) {
    return existing.parentId === next.parentId
  }
  return !existing.parentId
}

/**
 * Register an open surface and close an older surface in the same scope.
 *
 * A root surface claims the root scope.  A nested surface only claims the
 * scope below its `parentId`, so opening a combobox inside a dialog never
 * dismisses that dialog.  The returned disposer is idempotent and safe under
 * StrictMode effect replay.
 */
export function registerFloatingSurface(registration: FloatingSurfaceRegistration): () => void {
  const getElement = registration.getElement ?? (() => registration.element ?? null)
  const anchor = registration.anchor ?? null
  const inferredParentId =
    registration.parentId ??
    [...registrations.values()]
      .sort((left, right) => right.order - left.order)
      .find((existing) => {
        const element = elementFor(existing)
        return Boolean(element && anchor && element.contains(anchor))
      })?.id
  const registered: RegisteredSurface = {
    ...registration,
    anchor,
    parentId: inferredParentId,
    getElement,
    order: (registrationOrder += 1),
  }
  for (const existing of [...registrations.values()]) {
    if (existing.id === registered.id) {
      continue
    }
    const existingElement = elementFor(existing)
    const anchorOwnedByExisting = Boolean(existingElement && anchor && existingElement.contains(anchor))
    // A portal child can lose React context when a host composes it through a
    // slot.  Anchor containment is an equally strong ownership signal and
    // prevents a nested combobox from claiming (and closing) its dialog.
    if (anchorOwnedByExisting) {
      continue
    }
    const sibling = sameScope(existing, registered)
    const rootClaim = !registered.parentId
    if ((rootClaim && !isDescendantOf(registered, existing)) || sibling) {
      existing.close()
    }
  }
  registrations.set(registered.id, registered)
  installListeners()
  let disposed = false
  return () => {
    if (disposed) {
      return
    }
    disposed = true
    if (registrations.get(registered.id) === registered) {
      registrations.delete(registered.id)
    }
    removeListenersIfIdle()
  }
}

/** Alias used by hosts that describe the operation as claiming a layer. */
export const claimFloatingSurface = registerFloatingSurface

/** A stable object makes the coordinator convenient to inject into another host. */
export const floatingSurfaceCoordinator = {
  register: registerFloatingSurface,
  claim: claimFloatingSurface,
}

export interface FloatingTriggerProps {
  readonly open: boolean
  readonly onOpen: () => void
  readonly onClose: () => void
}

interface FloatingTriggerHandlers {
  readonly onPointerDown: (event: React.PointerEvent<HTMLElement>) => void
  readonly onClick: (event: React.MouseEvent<HTMLElement>) => void
}

/**
 * Keep a trigger's pointerdown close and subsequent click from reopening an
 * already-open surface.  The object form is the public contract; the legacy
 * `(open, setOpen)` form remains for existing hbar consumers.
 */
export function useFloatingTrigger(
  ...[propsOrOpen, legacySetOpen]: [props: FloatingTriggerProps] | [open: boolean, setOpen: (value: boolean) => void]
): FloatingTriggerHandlers {
  const objectProps = typeof propsOrOpen === 'boolean' ? undefined : propsOrOpen
  const open = objectProps?.open ?? propsOrOpen
  const legacyOpen = React.useCallback(() => legacySetOpen?.(true), [legacySetOpen])
  const legacyClose = React.useCallback(() => legacySetOpen?.(false), [legacySetOpen])
  const onOpen = objectProps?.onOpen ?? legacyOpen
  const onClose = objectProps?.onClose ?? legacyClose
  const suppressClick = React.useRef(false)
  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const closedByCoordinator =
        pointerClosedEvents.has(event.nativeEvent) || pointerClosedAnchors.has(event.currentTarget)
      if (closedByCoordinator) {
        pointerClosedAnchors.delete(event.currentTarget)
        suppressClick.current = true
        event.preventDefault()
        onClose()
        return
      }
      if (!open) {
        suppressClick.current = false
        return
      }
      suppressClick.current = true
      event.preventDefault()
      onClose()
    },
    [onClose, open],
  )
  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const closedByCoordinator =
        pointerClosedEvents.has(event.nativeEvent) || pointerClosedAnchors.has(event.currentTarget)
      if (closedByCoordinator) {
        pointerClosedAnchors.delete(event.currentTarget)
        suppressClick.current = false
        return
      }
      if (suppressClick.current) {
        suppressClick.current = false
        return
      }
      if (open) {
        onClose()
      } else {
        onOpen()
      }
    },
    [onClose, onOpen, open],
  )
  return { onPointerDown: handlePointerDown, onClick: handleClick }
}

type SurfaceAttributes = Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'style'>

interface FloatingSurfaceBaseProps extends SurfaceAttributes {
  /** A tool pane can move between its flow dock and overlay without remounting children. */
  readonly docked?: boolean | undefined
  readonly dockRef?: React.RefObject<HTMLElement | null> | undefined
  readonly open: boolean
  readonly onClose: () => void
  readonly children: React.ReactNode
  readonly className?: string | undefined
  readonly backdropClassName?: string | undefined
  readonly style?: React.CSSProperties | undefined
  readonly initialFocusRef?: React.RefObject<HTMLElement | null> | undefined
  readonly initialFocus?: React.RefObject<HTMLElement | null> | undefined
  readonly focusBehavior?: 'surface' | 'preserve' | undefined
  readonly label?: string | undefined
  readonly material?: 'glass' | 'frost' | 'solid' | FloatingSurfaceMaterial | undefined
  readonly parentId?: string | undefined
  /** Explicitly opt a surface out of automatic React-tree nesting. */
  readonly nested?: boolean | undefined
  readonly restoreFocus?: boolean | undefined
  readonly trapFocus?: boolean | undefined
  /** Keep the portal and children mounted while closed without registering a surface. */
  readonly keepMounted?: boolean | undefined
  /** Access the stable content node for editor selection and existing renderer integration. */
  readonly contentRef?: React.RefObject<HTMLDivElement | null> | undefined
}

export type AnchoredFloatingSurfaceProps = FloatingSurfaceBaseProps & {
  readonly mode?: 'anchored' | undefined
  readonly anchorRef: React.RefObject<HTMLElement | null>
  readonly anchorPoint?: never | undefined
  readonly placement?: FloatingPlacement | undefined
  readonly anchorMatchWidth?: boolean | undefined
  readonly matchAnchorWidth?: boolean | undefined
}

export type PointFloatingSurfaceProps = FloatingSurfaceBaseProps & {
  readonly mode: 'point'
  readonly anchorRef?: never | undefined
  readonly anchorPoint: { readonly x: number; readonly y: number }
  readonly placement?: FloatingPlacement | undefined
  readonly anchorMatchWidth?: never | undefined
  readonly matchAnchorWidth?: never | undefined
}

export type ModalFloatingSurfaceProps = FloatingSurfaceBaseProps & {
  readonly mode: 'modal'
  readonly anchorRef?: never | undefined
  readonly anchorPoint?: never | undefined
  readonly placement?: never | undefined
  readonly anchorMatchWidth?: never | undefined
  readonly matchAnchorWidth?: never | undefined
}

export type FloatingSurfaceProps = AnchoredFloatingSurfaceProps | PointFloatingSurfaceProps | ModalFloatingSurfaceProps

const VIEWPORT_GAP = 8
const SurfaceContext = React.createContext<string | null>(null)

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function viewportRem(): number {
  if (typeof document === 'undefined') {
    return 16
  }
  const parsed = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 16
}

function isTouchSheetViewport(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 40rem) and (pointer: coarse)').matches
  )
}

function openPopover(element: HTMLElement): boolean {
  if (typeof element.showPopover !== 'function') {
    element.removeAttribute('popover')
    return false
  }
  try {
    if (!element.matches(':popover-open')) {
      element.showPopover()
    }
    return true
  } catch {
    element.removeAttribute('popover')
    return false
  }
}

function closePopover(element: HTMLElement): void {
  if (typeof element.hidePopover !== 'function' || !element.matches(':popover-open')) {
    return
  }
  try {
    element.hidePopover()
  } catch {
    // A browser may remove a top-layer element while React is unmounting it.
  }
}

/**
 * The shared transient surface primitive.  It owns the portal, top-layer
 * promotion, viewport geometry, dismissal, focus lifecycle and coordination;
 * callers only supply semantic content and an anchor.
 */
export function LumenFloatingSurface(props: FloatingSurfaceProps) {
  const {
    open,
    onClose,
    children,
    className,
    backdropClassName,
    style,
    initialFocusRef,
    initialFocus,
    focusBehavior = 'surface',
    label,
    material = 'frost',
    parentId,
    nested,
    restoreFocus = true,
    trapFocus,
    keepMounted = false,
    contentRef,
    docked = false,
    dockRef,
    mode: suppliedMode,
    anchorRef: suppliedAnchorRef,
    anchorPoint: suppliedAnchorPoint,
    placement: suppliedPlacement,
    anchorMatchWidth: suppliedAnchorMatchWidth,
    matchAnchorWidth: suppliedMatchAnchorWidth,
    ...attributes
  } = props
  const mode = suppliedMode ?? 'anchored'
  const anchorRef = mode === 'anchored' ? suppliedAnchorRef : undefined
  const anchorPoint = mode === 'point' ? suppliedAnchorPoint : undefined
  const placement = mode === 'modal' ? undefined : (suppliedPlacement ?? 'below')
  const anchorMatchWidth = mode === 'anchored' ? (suppliedAnchorMatchWidth ?? suppliedMatchAnchorWidth ?? false) : false
  const contextParentId = React.useContext(SurfaceContext)
  const id = React.useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const surfaceId = `lumen-floating-${id}`
  const surfaceRef = React.useRef<HTMLDivElement>(null)
  const layerRef = React.useRef<HTMLDivElement>(null)
  const previousFocusRef = React.useRef<HTMLElement | null>(null)
  const focusPendingRef = React.useRef(false)
  const closeRef = React.useRef(onClose)
  const [portalHost] = React.useState(() => (typeof document === 'undefined' ? null : document.createElement('div')))
  const readingPositions = React.useRef(new Map<HTMLElement, { top: number; left: number }>())
  const movingPortal = React.useRef(false)
  React.useLayoutEffect(() => {
    if (!portalHost || !dockRef) {
      return undefined
    }
    const rememberPosition = (event: Event) => {
      if (!movingPortal.current && event.target instanceof HTMLElement) {
        readingPositions.current.set(event.target, {
          top: event.target.scrollTop,
          left: event.target.scrollLeft,
        })
      }
    }
    portalHost.addEventListener('scroll', rememberPosition, true)
    return () => {
      portalHost.removeEventListener('scroll', rememberPosition, true)
      portalHost.remove()
    }
  }, [dockRef, portalHost])
  React.useLayoutEffect(() => {
    if (!portalHost || !dockRef) {
      return undefined
    }
    portalHost.className = 'lumen-floating-portal-host'
    movingPortal.current = true
    ;(docked && dockRef.current ? dockRef.current : document.body).appendChild(portalHost)
    // The DOM stays alive, but native reparenting/top-layer promotion resets scroll offsets.
    // Restore them after promotion and layout, without storing a second copy of panel data.
    const frame = requestAnimationFrame(() => {
      for (const [element, position] of readingPositions.current) {
        if (portalHost.contains(element)) {
          element.scrollTop = position.top
          element.scrollLeft = position.left
        } else {
          readingPositions.current.delete(element)
        }
      }
      movingPortal.current = false
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [dockRef, docked, portalHost])
  const [positioned, setPositioned] = React.useState(false)
  const [topLayer, setTopLayer] = React.useState(false)
  const [mobileSheet, setMobileSheet] = React.useState(false)
  closeRef.current = onClose
  // A stable toolbar portal can move under a surface without changing React context.
  const anchorParentId = anchorRef?.current
    ?.closest<HTMLElement>('[data-lumen-floating-surface="true"][data-lumen-floating-open="true"]')
    ?.getAttribute('data-lumen-floating-id')
  const resolvedParentId = parentId ?? (nested === false ? undefined : (anchorParentId ?? contextParentId ?? undefined))
  const materialKind = typeof material === 'string' ? material : (material.kind ?? material.mode ?? 'frost')
  let materialBlur = '1.2rem'
  if (typeof material === 'object') {
    if (typeof material.blur === 'number') {
      materialBlur = `${material.blur}px`
    } else if (material.blur) {
      materialBlur = material.blur
    } else if (typeof material.blurAmount === 'number') {
      materialBlur = `${material.blurAmount}px`
    }
  }

  const position = React.useCallback(() => {
    const layer = layerRef.current
    const surface = surfaceRef.current ?? layerRef.current
    if (!layer || !surface || mode === 'modal') {
      return
    }
    const bounds = anchorPoint
      ? {
          left: anchorPoint.x,
          right: anchorPoint.x,
          top: anchorPoint.y,
          bottom: anchorPoint.y,
          width: 0,
          height: 0,
        }
      : anchorRef?.current?.getBoundingClientRect()
    if (!bounds) {
      return
    }
    const sheet = mode === 'anchored' && focusBehavior === 'surface' && isTouchSheetViewport()
    setMobileSheet(sheet)
    if (sheet) {
      surface.style.removeProperty('inset-inline-start')
      surface.style.removeProperty('inset-block-start')
      surface.style.removeProperty('inset-inline-end')
      surface.style.removeProperty('inset-block-end')
      surface.style.removeProperty('inline-size')
      surface.style.removeProperty('max-block-size')
      surface.style.removeProperty('max-inline-size')
      setPositioned(true)
      return
    }
    const rem = viewportRem()
    const gap = Math.max(VIEWPORT_GAP, rem / 2)
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const layerBounds = surface.getBoundingClientRect()
    const maxWidth = Math.max(0, viewportWidth - gap * 2)
    const measuredWidth = layerBounds.width || (anchorMatchWidth ? bounds.width : 0)
    const width = clamp(anchorMatchWidth ? bounds.width : measuredWidth, 0, maxWidth)
    const horizontal = placement === 'left' || placement === 'right'
    const availableBelow = Math.max(0, viewportHeight - bounds.bottom - gap)
    const availableAbove = Math.max(0, bounds.top - gap)
    const placeAbove =
      placement === 'above' ||
      (placement === 'below' && layerBounds.height > availableBelow && availableAbove > availableBelow)
    const availableHeight = horizontal
      ? Math.max(0, viewportHeight - gap * 2)
      : Math.max(0, placeAbove ? availableAbove : availableBelow)
    let desiredLeft = bounds.left
    if (placement === 'left') {
      desiredLeft = bounds.left - layerBounds.width - gap
    } else if (placement === 'right') {
      desiredLeft = bounds.right + gap
    }
    let desiredTop = bounds.bottom + gap
    if (placement === 'above' || placeAbove) {
      desiredTop = bounds.top - layerBounds.height - gap
    } else if (horizontal) {
      desiredTop = bounds.top + (bounds.height - layerBounds.height) / 2
    }
    const left = clamp(desiredLeft, gap, viewportWidth - (width || layerBounds.width) - gap)
    const top = clamp(desiredTop, gap, viewportHeight - layerBounds.height - gap)
    surface.style.setProperty('inset-inline-start', `${left}px`)
    surface.style.setProperty('inset-block-start', `${top}px`)
    surface.style.setProperty('inset-inline-end', 'auto')
    surface.style.setProperty('inset-block-end', 'auto')
    surface.style.setProperty('--lumen-floating-limit', `${availableHeight}px`)
    surface.style.setProperty('max-inline-size', `${maxWidth}px`)
    if (anchorMatchWidth) {
      surface.style.setProperty('inline-size', `${width}px`)
    } else {
      surface.style.removeProperty('inline-size')
    }
    setPositioned(true)
  }, [anchorMatchWidth, anchorPoint, anchorRef, focusBehavior, mode, placement])

  React.useLayoutEffect(() => {
    if (!open || docked || !positioned || !focusPendingRef.current || focusBehavior !== 'surface') {
      return
    }
    focusPendingRef.current = false
    const surface = surfaceRef.current ?? layerRef.current
    if (!surface) {
      return
    }
    const sheet = mode === 'anchored' && isTouchSheetViewport()
    const target = sheet ? surface : (initialFocusRef?.current ?? initialFocus?.current ?? surface)
    target.focus({ preventScroll: true })
  }, [docked, focusBehavior, initialFocus, initialFocusRef, mode, open, positioned])

  React.useLayoutEffect(() => {
    if (!open || docked) {
      return undefined
    }
    const layer = layerRef.current
    const surface = surfaceRef.current ?? layerRef.current
    if (!layer || !surface) {
      return undefined
    }
    const anchorElement = anchorRef?.current
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    focusPendingRef.current = focusBehavior === 'surface'
    setPositioned(false)
    const promoted = openPopover(layer)
    setTopLayer(promoted)
    if (mode === 'modal') {
      surface.style.removeProperty('inset-inline-start')
      surface.style.removeProperty('inset-block-start')
      surface.style.removeProperty('max-block-size')
      surface.style.removeProperty('max-inline-size')
      surface.style.removeProperty('inline-size')
      setPositioned(true)
    } else {
      position()
      const frame = requestAnimationFrame(position)
      const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(position) : undefined
      resizeObserver?.observe(surface)
      if (anchorElement) {
        resizeObserver?.observe(anchorElement)
      }
      window.addEventListener('resize', position)
      window.addEventListener('scroll', position, true)
      const disposer = registerFloatingSurface({
        id: surfaceId,
        close: () => closeRef.current(),
        getElement: () => surfaceRef.current ?? layerRef.current,
        anchor: anchorElement,
        mode,
        parentId: resolvedParentId,
        nested: Boolean(resolvedParentId),
        trapFocus: trapFocus ?? isTouchSheetViewport(),
      })
      return () => {
        cancelAnimationFrame(frame)
        resizeObserver?.disconnect()
        window.removeEventListener('resize', position)
        window.removeEventListener('scroll', position, true)
        disposer()
        closePopover(layer)
        setTopLayer(false)
        setPositioned(false)
        if (restoreFocus) {
          const active = document.activeElement
          const restore = previousFocusRef.current ?? anchorElement
          if (restore?.isConnected && (active === document.body || active === surface || surface.contains(active))) {
            restore.focus({ preventScroll: true })
          }
        }
      }
    }
    const disposer = registerFloatingSurface({
      id: surfaceId,
      close: () => closeRef.current(),
      getElement: () => surfaceRef.current ?? layerRef.current,
      mode,
      parentId: resolvedParentId,
      nested: Boolean(resolvedParentId),
      trapFocus: trapFocus ?? true,
    })
    return () => {
      disposer()
      closePopover(layer)
      setTopLayer(false)
      setPositioned(false)
      if (restoreFocus) {
        const active = document.activeElement
        const restore = previousFocusRef.current
        if (restore?.isConnected && (active === document.body || active === surface || surface.contains(active))) {
          restore.focus({ preventScroll: true })
        }
      }
    }
  }, [
    anchorRef,
    docked,
    focusBehavior,
    initialFocus,
    initialFocusRef,
    mode,
    open,
    position,
    resolvedParentId,
    restoreFocus,
    surfaceId,
    trapFocus,
  ])

  if (!open && !docked && !keepMounted) {
    return null
  }
  const mountedHidden = !open && !docked

  const sharedSurfaceProps = {
    ...attributes,
    ref: (node: HTMLDivElement | null) => {
      surfaceRef.current = node
      if (contentRef) {
        contentRef.current = node
      }
      if (mode !== 'modal') {
        layerRef.current = node
      }
    },
    className: ['lumen-floating-surface', className].filter(Boolean).join(' '),
    tabIndex: attributes.tabIndex ?? -1,
    hidden: mountedHidden || attributes.hidden,
    inert: mountedHidden || attributes.inert,
    'aria-hidden': mountedHidden ? true : attributes['aria-hidden'],
    role: attributes.role ?? (docked ? 'region' : undefined) ?? (mode === 'modal' ? 'dialog' : undefined),
    'aria-label': label ?? attributes['aria-label'],
    'aria-modal': !docked && (mode === 'modal' || mobileSheet) ? true : attributes['aria-modal'],
    'data-docked': docked || undefined,
    'data-lumen-floating-surface': 'true',
    'data-lumen-floating-id': surfaceId,
    'data-lumen-floating-parent': resolvedParentId,
    'data-lumen-floating-mode': mode,
    'data-lumen-floating-material': materialKind,
    'data-lumen-floating-open': open ? 'true' : 'false',
    'data-focus-behavior': focusBehavior,
    'data-mobile-sheet': mobileSheet ? 'true' : undefined,
    'data-positioned': positioned ? 'true' : 'false',
    'data-top-layer': topLayer ? 'true' : 'false',
    style: {
      ...style,
      '--lumen-floating-blur': materialBlur,
      ...(typeof material === 'object' && material.background
        ? { '--lumen-floating-background': material.background }
        : {}),
      ...(typeof material === 'object' && material.color ? { color: material.color } : {}),
      ...(typeof material === 'object' && material.borderColor
        ? { '--lumen-floating-border': material.borderColor }
        : {}),
      ...(typeof material === 'object' && material.shadow ? { '--lumen-floating-shadow': material.shadow } : {}),
    } as React.CSSProperties,
  }

  const modalContent = (
    <SurfaceContext.Provider value={surfaceId}>
      <div
        ref={layerRef}
        popover="manual"
        className={['lumen-floating-modal-root', backdropClassName].filter(Boolean).join(' ')}
        data-lumen-floating-root="true"
        data-lumen-floating-id={surfaceId}
        data-docked={docked || undefined}
        hidden={mountedHidden || undefined}
        inert={mountedHidden || undefined}
        aria-hidden={mountedHidden || undefined}
      >
        <div className="lumen-floating-modal-backdrop" data-lumen-floating-backdrop="true" />
        <div {...sharedSurfaceProps}>{children}</div>
      </div>
    </SurfaceContext.Provider>
  )
  const anchoredContent = (
    <SurfaceContext.Provider value={surfaceId}>
      <div popover="manual" {...sharedSurfaceProps}>
        {children}
      </div>
    </SurfaceContext.Provider>
  )
  if (typeof document === 'undefined') {
    return mode === 'modal' ? modalContent : anchoredContent
  }
  return ReactDOM.createPortal(
    mode === 'modal' ? modalContent : anchoredContent,
    dockRef && portalHost ? portalHost : document.body,
  )
}

/** Short alias used by hosts that already call their transient layer a surface. */
export const FloatingSurface = LumenFloatingSurface

export default LumenFloatingSurface
