import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Ellipsis, X, type LucideIcon } from 'lucide-react'
import { LumenButton, LumenContentText, LumenFrame, LumenIcon } from '@lumen/app-ui'
import { FloatingSurface, useFloatingTrigger } from './floating-surface'
import './mobile-header-menu.css'

export interface HbarMobileHeaderMenuItem {
  readonly id: string
  readonly label: string
  readonly order?: number | undefined
  readonly icon?: LucideIcon | undefined
  readonly disabled?: boolean | undefined
  readonly current?: boolean | undefined
  readonly pressed?: boolean | undefined
  readonly onActivate: () => void
  readonly close?:
    | {
        readonly label: string
        readonly disabled?: boolean | undefined
        readonly onActivate: () => void
      }
    | undefined
}

export interface HbarMobileHeaderMenuSection {
  readonly id: string
  readonly order: number
  readonly label: string
  readonly items: readonly HbarMobileHeaderMenuItem[]
}

interface MenuRegistry {
  readonly readSections: () => readonly HbarMobileHeaderMenuSection[]
  readonly register: (registrationId: string, read: () => HbarMobileHeaderMenuSection | null) => () => void
  readonly registerDismiss: (dismiss: () => void) => () => void
  readonly dismiss: () => void
  readonly revision: number
}

const MobileHeaderMenuContext = createContext<MenuRegistry | null>(null)

/** Host-owned bounded sections grow in one viewport reader; ambiguous row IDs cannot dispatch. */
export function projectMobileHeaderMenuSections(
  source: readonly HbarMobileHeaderMenuSection[],
): readonly HbarMobileHeaderMenuSection[] {
  const sections = new Map<string, HbarMobileHeaderMenuSection>()
  for (const section of source) {
    const current = sections.get(section.id)
    sections.set(section.id, current ? { ...current, items: [...current.items, ...section.items] } : section)
  }
  return [...sections.values()]
    .flatMap((section) => {
      const counts = new Map<string, number>()
      for (const item of section.items) counts.set(item.id, (counts.get(item.id) ?? 0) + 1)
      const items = section.items
        .filter((item) => counts.get(item.id) === 1)
        .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
      return items.length ? [{ ...section, items }] : []
    })
    .sort((left, right) => left.order - right.order)
}

export function HbarMobileHeaderMenuProvider({ children }: { readonly children: ReactNode }) {
  const readersRef = useRef(new Map<string, () => HbarMobileHeaderMenuSection | null>())
  const [revision, setRevision] = useState(0)
  const dismissRef = useRef<() => void>(() => undefined)
  const register = useCallback((id: string, read: () => HbarMobileHeaderMenuSection | null) => {
    readersRef.current.set(id, read)
    setRevision((current) => current + 1)
    return () => {
      if (readersRef.current.get(id) !== read) return
      readersRef.current.delete(id)
      setRevision((current) => current + 1)
    }
  }, [])
  const readSections = useCallback(() => {
    const sections: HbarMobileHeaderMenuSection[] = []
    for (const read of readersRef.current.values()) {
      const section = read()
      if (!section) continue
      sections.push(section)
    }
    return projectMobileHeaderMenuSections(sections)
  }, [])
  const registerDismiss = useCallback((dismiss: () => void) => {
    dismissRef.current = dismiss
    return () => {
      if (dismissRef.current === dismiss) dismissRef.current = () => undefined
    }
  }, [])
  const dismiss = useCallback(() => dismissRef.current(), [])
  const value = useMemo(
    () => ({ readSections, register, registerDismiss, dismiss, revision }),
    [readSections, register, registerDismiss, dismiss, revision],
  )
  return <MobileHeaderMenuContext.Provider value={value}>{children}</MobileHeaderMenuContext.Provider>
}

/** A host child contributes current actions without owning menu visibility or navigation state. */
export function useHbarMobileHeaderMenuSection(section: HbarMobileHeaderMenuSection | null) {
  const registry = useContext(MobileHeaderMenuContext)
  const registrationId = useId()
  const sectionRef = useRef(section)
  sectionRef.current = section
  const register = registry?.register
  useEffect(() => {
    if (!register) return
    return register(registrationId, () => sectionRef.current)
  }, [register, registrationId])
}

export function HbarMobileHeaderMenu({ label }: { readonly label: string }) {
  const registry = useContext(MobileHeaderMenuContext)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const contentId = useId()
  const [open, setOpen] = useState(false)
  const triggerEvents = useFloatingTrigger(open, setOpen)
  const pendingActionRef = useRef<(() => void) | null>(null)
  const dismiss = registry?.dismiss
  const registerDismiss = registry?.registerDismiss
  const sections = registry?.readSections() ?? []
  useLayoutEffect(() => {
    if (sections.length === 0) setOpen(false)
  }, [sections.length])
  const close = useCallback((returnFocus = true) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (!registerDismiss) return
    return registerDismiss(close)
  }, [registerDismiss, close])

  useLayoutEffect(() => {
    if (open) return
    const action = pendingActionRef.current
    if (!action) return
    pendingActionRef.current = null
    // Use the callback captured by the activated row, but run it only after
    // the committed closed state removes this disclosure from overlay guards.
    action()
  }, [open])

  const activate = useCallback(
    (action: () => void) => {
      pendingActionRef.current = action
      dismiss?.()
    },
    [dismiss],
  )

  if (!sections.length) return null

  return (
    <LumenFrame
      className="hbar-mobile-header-menu"
      data-hbar-mobile-header-menu="true"
      data-open={open ? 'true' : 'false'}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return
        event.preventDefault()
        event.stopPropagation()
        dismiss?.()
      }}
    >
      <LumenButton
        ref={triggerRef}
        className="hbar-mobile-header-menu-trigger"
        type="button"
        size="s"
        variant="text"
        indicator="none"
        aria-label={label}
        aria-controls={contentId}
        aria-expanded={open}
        title={label}
        {...triggerEvents}
      >
        <LumenIcon icon={Ellipsis} tier="md" />
      </LumenButton>
      {open && (
        <FloatingSurface
          open={open}
          onClose={close}
          anchorRef={triggerRef}
          label={label}
          id={contentId}
          className="hbar-mobile-header-menu-content"
        >
          {sections.map((section) => (
            <LumenFrame
              key={section.id}
              as="section"
              className="hbar-mobile-header-menu-section"
              aria-label={section.label}
            >
              <LumenContentText context="section.title" level={2}>
                {section.label}
              </LumenContentText>
              <LumenFrame className="hbar-mobile-header-menu-items">
                {section.items.map((item) => (
                  <LumenFrame key={item.id} className="hbar-mobile-header-menu-item-row">
                    <LumenButton
                      type="button"
                      variant="text"
                      indicator="none"
                      aria-current={item.current ? 'page' : undefined}
                      aria-pressed={item.pressed}
                      disabled={item.disabled}
                      onClick={() => activate(item.onActivate)}
                    >
                      {item.icon && <LumenIcon icon={item.icon} tier="sm" />}
                      <LumenContentText context="collection.title" className="hbar-mobile-header-menu-item-title">
                        {item.label}
                      </LumenContentText>
                    </LumenButton>
                    {item.close && (
                      <LumenButton
                        type="button"
                        variant="text"
                        indicator="none"
                        aria-label={item.close.label}
                        title={item.close.label}
                        disabled={item.close.disabled}
                        onClick={() => item.close && activate(item.close.onActivate)}
                      >
                        <LumenIcon icon={X} tier="sm" />
                      </LumenButton>
                    )}
                  </LumenFrame>
                ))}
              </LumenFrame>
            </LumenFrame>
          ))}
        </FloatingSurface>
      )}
    </LumenFrame>
  )
}
