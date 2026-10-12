import * as React from 'react'
import type { LumenIndicatorProps } from './LumenIndicator'
import styles from './materials.module.css'

export interface LumenDividerProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  length?: LumenIndicatorProps['length'] | undefined
  orientation?: 'horizontal' | 'vertical' | undefined
  tone?: LumenIndicatorProps['tone'] | undefined
}

export default function LumenDivider({
  className,
  length: _length,
  orientation = 'horizontal',
  role = 'separator',
  tone = 'neutral',
  ...other
}: LumenDividerProps) {
  return (
    <div
      {...other}
      className={[styles.divider, className].filter(Boolean).join(' ')}
      data-orientation={orientation}
      data-tone={tone}
      role={role}
      aria-orientation={other['aria-orientation'] ?? orientation}
    />
  )
}
