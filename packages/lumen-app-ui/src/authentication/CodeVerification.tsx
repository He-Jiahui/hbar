'use client'
import * as React from 'react'
import { LumenInput } from '../forms'
import { LumenButton } from '../primitives'
import { ShieldCheck } from './glyphs'

export interface LumenCodeVerificationProps {
  readonly labels: {
    readonly title: string
    readonly description: string
    readonly code: string
    readonly codeDigit: (index: number) => string
    readonly helper: string
    readonly submit: string
  }
  /** Supplied by the authentication protocol or the preview host. */
  readonly codeLength: number
  readonly presentation: 'single' | 'segmented'
  readonly value: string
  readonly busy: boolean
  readonly canSubmit: boolean
  readonly error: string | undefined
  readonly onCodeChange: (code: string) => void
  readonly onSubmit: () => void
  readonly children?: React.ReactNode
  readonly context?: React.ReactNode
  readonly secondaryActions?: React.ReactNode
  readonly footer?: React.ReactNode
}

/** Verification state and optional recovery/resend actions belong to the host. */
export function LumenCodeVerification(content: LumenCodeVerificationProps) {
  const fields = React.useRef<(HTMLInputElement | null)[]>([])
  const length = Number.isSafeInteger(content.codeLength) && content.codeLength > 0 ? content.codeLength : 0
  const update = (index: number, text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, length - index)
    const next = content.value.padEnd(length, ' ').split('')
    next.splice(index, Math.max(1, digits.length), ...(digits || ' ').split(''))
    content.onCodeChange(next.join('').trimEnd())
    if (digits) {
      fields.current[Math.min(index + digits.length, length - 1)]?.focus()
    }
  }
  return (
    <div className="hbar-app-ui-code-verification hbar-app-ui-auth-centered">
      <form
        className="hbar-app-ui-auth-code-card"
        aria-label={content.labels.title}
        aria-busy={content.busy}
        onSubmit={(event) => {
          event.preventDefault()
          if (content.canSubmit && !content.busy) {
            content.onSubmit()
          }
        }}
      >
        <span className="hbar-app-ui-auth-icon hbar-app-ui-icon-lg" aria-hidden="true">
          <ShieldCheck />
        </span>
        <h1>{content.labels.title}</h1>
        <p>{content.labels.description}</p>
        {content.context}
        {content.presentation === 'single' ? (
          <label>
            {content.labels.code}
            <LumenInput
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={length}
              value={content.value}
              disabled={content.busy || !length}
              onChange={(event) => content.onCodeChange(event.currentTarget.value)}
            />
          </label>
        ) : (
          <fieldset className="hbar-app-ui-verification-digits" disabled={content.busy || !length}>
            <legend>{content.labels.code}</legend>
            {Array.from({ length }, (_, index) => (
              <LumenInput
                key={index}
                ref={(element) => {
                  fields.current[index] = element
                }}
                aria-label={content.labels.codeDigit(index + 1)}
                inputMode="numeric"
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                value={content.value[index]?.trim() ?? ''}
                onPaste={(event) => {
                  event.preventDefault()
                  update(index, event.clipboardData.getData('text'))
                }}
                onChange={(event) => update(index, event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Backspace' && !content.value[index]?.trim() && index > 0) {
                    fields.current[index - 1]?.focus()
                  }
                }}
              />
            ))}
          </fieldset>
        )}
        <small>{content.labels.helper}</small>
        {content.children}
        {content.error && (
          <p className="hbar-app-ui-verification-error" role="alert">
            {content.error}
          </p>
        )}
        <LumenButton type="submit" tone="primary" disabled={content.busy || !content.canSubmit || !length}>
          {content.labels.submit}
        </LumenButton>
        {content.secondaryActions && <div className="hbar-app-ui-verification-actions">{content.secondaryActions}</div>}
      </form>
      {content.footer}
    </div>
  )
}
