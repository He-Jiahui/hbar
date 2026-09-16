import { useEffect } from 'react'
import type { ReactNode } from 'react'
import type { HbarAppUiVariantProps } from '../../types'
import { ActionSurfaceFrame } from '../SurfaceFrame'

export type CommandMenuProps = HbarAppUiVariantProps

export function CommandFrame({
  spec,
  onAction,
  className,
  children,
}: CommandMenuProps & { readonly className: string; readonly children: ReactNode }): React.JSX.Element {
  return (
    <ActionSurfaceFrame spec={spec} onAction={onAction} className={className}>
      {children}
    </ActionSurfaceFrame>
  )
}

export function CommandBackdrop({
  children,
  onClose,
  closeLabel,
}: {
  readonly children: ReactNode
  readonly onClose: () => void
  readonly closeLabel: string
}): React.JSX.Element {
  return (
    <div className="hbar-app-ui-dialog-backdrop hbar-app-ui-command-backdrop">
      <button
        type="button"
        className="hbar-app-ui-command-backdrop-dismiss"
        aria-label={closeLabel}
        onClick={onClose}
      />
      {children}
    </div>
  )
}

export function useCommandEscape(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return undefined
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose, open])
}
