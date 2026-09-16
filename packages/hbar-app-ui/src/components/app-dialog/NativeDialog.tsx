import { useEffect, useId, useRef, type ReactNode, type RefObject, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { HbarAppUiIcon } from '../../icon'
import './NativeDialog.css'

export interface HbarAppUiDialogProps {
  readonly open: boolean
  readonly title: string
  readonly closeLabel: string
  readonly onClose: () => void
  readonly children: ReactNode
  readonly footer?: ReactNode
  readonly className?: string
  readonly initialFocus?: RefObject<HTMLElement | null> | undefined
}

function retainDialogFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab' || event.defaultPrevented) return
  if (event.target instanceof Element && event.target.closest('dialog') !== event.currentTarget) return
  const controls = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], area[href], button, input, select, textarea, [tabindex], [contenteditable="true"]',
    ),
  ].filter(
    (element) =>
      (element.tabIndex >= 0 || element.isContentEditable) &&
      !element.matches(':disabled') &&
      !element.closest('[inert]') &&
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility === 'visible',
  )
  const first = controls[0],
    last = controls.at(-1),
    active = document.activeElement
  if ((event.shiftKey && active === first) || (!event.shiftKey && active === last)) {
    event.preventDefault()
    ;(event.shiftKey ? last : first)?.focus()
  }
}

/** A host-controlled modal using the platform's focus containment and top layer. */
export function HbarAppUiDialog({
  open,
  title,
  closeLabel,
  onClose,
  children,
  footer,
  className = '',
  initialFocus,
}: HbarAppUiDialogProps) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (!open) {
      if (dialog.open) dialog.close()
      return
    }
    const previous = document.activeElement
    if (!dialog.open) dialog.showModal()
    if (initialFocus?.current && dialog.contains(initialFocus.current)) initialFocus.current.focus()
    return () => {
      const active = document.activeElement
      const restore = active === document.body || dialog.contains(active)
      if (dialog.open) dialog.close()
      if (restore && previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [open, initialFocus])
  return (
    <dialog
      ref={ref}
      className={`hbar-app-ui-native-dialog ${className}`}
      aria-labelledby={titleId}
      onKeyDown={retainDialogFocus}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose()
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button type="button" aria-label={closeLabel} title={closeLabel} onClick={onClose}>
          <HbarAppUiIcon icon={X} />
        </button>
      </header>
      <div className="hbar-app-ui-native-dialog-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </dialog>
  )
}
