import { forwardRef } from 'react'
import { LoaderCircle } from 'lucide-react'
import { LumenButton, LumenIcon, type LumenButtonProps } from '@lumen/app-ui'
import './action-icon-button.css'

/** Plain workbench actions have no idle lamp. Busy, pressed and focus remain explicit. */
export interface HbarActionIconButtonProps extends Omit<
  LumenButtonProps,
  'variant' | 'indicator' | 'indicatorState' | 'indicatorEdge'
> {
  readonly label: string
}

export const HbarActionIconButton = forwardRef<HTMLButtonElement, HbarActionIconButtonProps>(
  function HbarActionIconButton({ label, loading = false, className, children, ...props }, ref) {
    return (
      <LumenButton
        {...props}
        ref={ref}
        variant="text"
        indicator="none"
        loading={loading}
        aria-label={props['aria-label'] ?? label}
        title={props.title ?? label}
        className={['hbar-action-icon-button', className].filter(Boolean).join(' ')}
      >
        {loading ? <LumenIcon icon={LoaderCircle} tier="md" className="hbar-action-icon-busy" /> : children}
      </LumenButton>
    )
  },
)
