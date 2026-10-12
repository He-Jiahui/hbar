'use client'

import * as React from 'react'
import type { LumenSize } from './appearance'
import styles from './primitives.module.css'

export type LumenTextTone = 'neutral' | 'muted' | 'subtle' | 'info' | 'success' | 'warning' | 'danger'
export type LumenTextVariant = 'title' | 'heading' | 'body' | 'label' | 'supporting' | 'code'

/** Low-level renderer retained for compatibility. Product content uses LumenContentText. */
export interface LumenTextProps extends React.HTMLAttributes<HTMLElement> {
  as?:
    | 'h1'
    | 'h2'
    | 'h3'
    | 'h4'
    | 'h5'
    | 'h6'
    | 'span'
    | 'p'
    | 'small'
    | 'strong'
    | 'b'
    | 'em'
    | 'kbd'
    | 's'
    | 'code'
    | 'pre'
    | 'time'
    | 'output'
    | 'legend'
    | 'dt'
    | 'dd'
    | undefined
  dateTime?: string | undefined
  size?: LumenSize | undefined
  tone?: LumenTextTone | undefined
  variant?: LumenTextVariant | undefined
}

export function LumenText({
  as: Element = 'span',
  size,
  tone = 'neutral',
  variant = 'body',
  className,
  children,
  ...other
}: LumenTextProps) {
  return (
    <Element
      {...other}
      className={[styles.text, className].filter(Boolean).join(' ')}
      data-size={size}
      data-tone={tone}
      data-variant={variant}
    >
      {children}
    </Element>
  )
}
