import {
  LumenFrame,
  LumenText,
 LumenButton } from '@lumen/app-ui'
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
    <LumenFrame as="article" className={`message message-${props.role}`} data-message-id={props.id}>
      {props.role !== 'tool' && (
        <LumenFrame as="header" className="message-heading">
          <LumenText as="span" className={`avatar${props.role === 'user' ? ' avatar-user' : ''}`} aria-hidden="true">
            {props.avatar}
          </LumenText>
          <LumenText as="span">{props.author}</LumenText>
          {props.timestamp && <LumenText as="time">{props.timestamp}</LumenText>}
          {props.streaming && <HbarAppUiIcon icon={LoaderCircle} tier="sm" className="spinning" />}
        </LumenFrame>
      )}
      <LumenFrame className="message-body">{props.children}</LumenFrame>
      {props.onCopy && (
        <LumenFrame as="footer" className="message-actions">
          <LumenButton type="button" title={props.copyLabel} aria-label={props.copyLabel} onClick={props.onCopy}>
            <HbarAppUiIcon icon={props.copied ? Check : Copy} tier="sm" />
          </LumenButton>
        </LumenFrame>
      )}
    </LumenFrame>
  )
}
