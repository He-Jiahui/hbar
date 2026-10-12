'use client'

import * as React from 'react'
import styles from './disclosure.module.css'

export interface LumenDisclosureProps extends React.DetailsHTMLAttributes<HTMLDetailsElement> {
  summary: React.ReactNode
}

export function LumenDisclosure({ summary, className, children, ...other }: LumenDisclosureProps) {
  return (
    <details {...other} className={[styles.disclosure, className].filter(Boolean).join(' ')}>
      <summary>{summary}</summary>
      {children}
    </details>
  )
}
