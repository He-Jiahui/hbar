import * as React from 'react'
import { type LumenShape } from './appearance'
import { type LumenState, type LumenTone } from './LumenIndicator'
import styles from './field.module.css'

export interface LumenFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  /** @deprecated Fields use a continuous outline regardless of boundary direction. */
  boundary?: 'horizontal' | 'vertical' | undefined
  children: React.ReactNode
  invalid?: boolean | undefined
  shape?: LumenShape | undefined
  state?: LumenState | undefined
  tone?: LumenTone | undefined
}

export default function LumenField({
  boundary,
  children,
  className,
  invalid = false,
  shape = 'rounded',
  state = 'idle',
  tone = 'neutral',
  ...other
}: LumenFieldProps) {
  const resolvedState = state === 'disabled' ? state : invalid ? 'failed' : state
  const hasError = invalid || state === 'failed'
  const resolvedTone = hasError ? 'danger' : tone
  return (
    <div
      {...other}
      className={['lumen-effect', 'lumen-outlined-field', styles.field, className].filter(Boolean).join(' ')}
      data-lumen-state={resolvedState}
      data-lumen-tone={resolvedTone}
      data-boundary={boundary}
      data-invalid={hasError || undefined}
      data-shape={shape}
    >
      <div className={styles.fieldContent}>{children}</div>
    </div>
  )
}
