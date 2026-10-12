'use client'

import * as React from 'react'
import type { LumenShape } from './appearance'
import LumenSurface from './LumenSurface'
import { LumenText } from './primitives'
import styles from './LumenWorkbenchNotice.module.css'

export interface LumenWorkbenchNoticeCommand {
  label: string
  value: string
}

export interface LumenWorkbenchNoticeProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title: string
  description: string
  command?: LumenWorkbenchNoticeCommand | undefined
  shape?: LumenShape | undefined
}

export default function LumenWorkbenchNotice({
  title,
  description,
  command,
  shape = 'rounded',
  className,
  ...other
}: LumenWorkbenchNoticeProps) {
  const titleId = React.useId()

  return (
    <section {...other} className={[styles.root, className].filter(Boolean).join(' ')} aria-labelledby={titleId}>
      <LumenSurface className={styles.surface} material="glass" shape={shape}>
        <div className={styles.content}>
          <LumenText as="h1" id={titleId} variant="title" className={styles.title}>
            {title}
          </LumenText>
          <LumenText as="p" tone="muted" className={styles.description}>
            {description}
          </LumenText>
          {command ? (
            <div className={styles.command}>
              <LumenText as="p" variant="label" tone="subtle">
                {command.label}
              </LumenText>
              <pre>
                <LumenText as="code" variant="code">
                  {command.value}
                </LumenText>
              </pre>
            </div>
          ) : null}
        </div>
      </LumenSurface>
    </section>
  )
}
