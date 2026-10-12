'use client'

import * as React from 'react'
import { LumenIconButton } from './primitives'

export interface LumenFilePickerProps {
  label: string
  children: React.ReactNode
  disabled?: boolean | undefined
  multiple?: boolean | undefined
  accept?: string | undefined
  onFiles: (files: readonly File[]) => void
}

/** Keyboard-accessible file selection; the host owns upload, errors and selected files. */
export function LumenFilePicker({ label, children, disabled, multiple, accept, onFiles }: LumenFilePickerProps) {
  const input = React.useRef<HTMLInputElement>(null)
  return (
    <>
      <LumenIconButton label={label} disabled={disabled} onClick={() => input.current?.click()}>
        {children}
      </LumenIconButton>
      <input
        ref={input}
        type="file"
        hidden
        disabled={disabled}
        multiple={multiple}
        accept={accept}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? [])
          event.currentTarget.value = ''
          if (files.length > 0) onFiles(files)
        }}
      />
    </>
  )
}
