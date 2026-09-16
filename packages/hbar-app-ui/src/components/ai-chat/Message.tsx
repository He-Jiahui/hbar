import { Check, Copy, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { HbarAppUiIcon } from '../../icon'

export interface HbarAppUiMessageProps {
  readonly id: string
  readonly role: 'user' | 'system' | 'assistant' | 'tool'
  readonly author: string
  readonly avatar: string
  readonly timestamp?: string | undefined
  readonly streaming?: boolean
  readonly copyLabel: string
  readonly copied?: boolean
  readonly onCopy?: (() => void) | undefined
  readonly children: ReactNode
}

export function HbarAppUiMessage(props: HbarAppUiMessageProps) {
  return (
    <article className={`message message-${props.role}`} data-message-id={props.id}>
      {props.role !== 'tool' && (
        <header className="message-heading">
          <span className={`avatar${props.role === 'user' ? ' avatar-user' : ''}`} aria-hidden="true">
            {props.avatar}
          </span>
          <span>{props.author}</span>
          {props.timestamp && <time>{props.timestamp}</time>}
          {props.streaming && <HbarAppUiIcon icon={LoaderCircle} tier="sm" className="spinning" />}
        </header>
      )}
      <div className="message-body">{props.children}</div>
      {props.onCopy && (
        <footer className="message-actions">
          <button type="button" title={props.copyLabel} aria-label={props.copyLabel} onClick={props.onCopy}>
            <HbarAppUiIcon icon={props.copied ? Check : Copy} tier="sm" />
          </button>
        </footer>
      )}
    </article>
  )
}
