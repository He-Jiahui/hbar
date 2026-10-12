'use client'

import * as React from 'react'
import { LumenButton, type LumenButtonProps } from './primitives'
import './forms.css'

export interface LumenToggleButtonProps extends Omit<
  LumenButtonProps,
  'children' | 'role' | 'aria-checked' | 'onClick'
> {
  readonly label: string
  readonly checked: boolean
  readonly onCheckedChange: (checked: boolean) => void
}

/** Button-backed switch for references/hosts requiring native Enter and Space activation. */
export const LumenToggleButton = React.forwardRef<HTMLButtonElement, LumenToggleButtonProps>(function LumenToggleButton(
  { label, checked, onCheckedChange, className, ...props },
  ref,
) {
  return (
    <LumenButton
      {...props}
      ref={ref}
      className={['lumen-toggle-control', 'lumen-toggle-button', className].filter(Boolean).join(' ')}
      variant="text"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
    >
      <span className="lumen-toggle-track" aria-hidden="true">
        <span className="lumen-toggle-thumb" />
      </span>
    </LumenButton>
  )
})
