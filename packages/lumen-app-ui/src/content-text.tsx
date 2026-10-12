'use client'

import { LumenText, type LumenTextProps } from './text'
import styles from './content-text.module.css'

interface TextDefinition {
  readonly element: NonNullable<LumenTextProps['as']>
  readonly variant: NonNullable<LumenTextProps['variant']>
  readonly flow: 'single' | 'reading' | 'inlineCode' | 'code' | 'clipped'
}

/** Location and purpose are explicit; neither string length nor an HTML tag selects the policy. */
export const LUMEN_TEXT_CONTEXTS = {
  'control.label': { element: 'span', variant: 'body', flow: 'single' },
  'control.status': { element: 'span', variant: 'body', flow: 'single' },
  'navigation.caption': { element: 'span', variant: 'body', flow: 'single' },
  'navigation.title': { element: 'h2', variant: 'heading', flow: 'single' },
  'navigation.item': { element: 'span', variant: 'body', flow: 'clipped' },
  'page.title': { element: 'h1', variant: 'title', flow: 'reading' },
  'section.title': { element: 'h2', variant: 'heading', flow: 'reading' },
  'section.subtitle': { element: 'h3', variant: 'heading', flow: 'reading' },
  'section.description': { element: 'p', variant: 'supporting', flow: 'reading' },
  'metric.label': { element: 'dt', variant: 'supporting', flow: 'single' },
  'metric.value': { element: 'dd', variant: 'body', flow: 'single' },
  'record.title': { element: 'strong', variant: 'body', flow: 'reading' },
  'record.description': { element: 'span', variant: 'supporting', flow: 'reading' },
  'message.inline': { element: 'span', variant: 'body', flow: 'reading' },
  'workspace.title': { element: 'h1', variant: 'title', flow: 'single' },
  'workspace.context': { element: 'p', variant: 'body', flow: 'single' },
  'tool.title': { element: 'h2', variant: 'heading', flow: 'single' },
  'tool.summary': { element: 'span', variant: 'body', flow: 'single' },
  'form.label': { element: 'span', variant: 'label', flow: 'single' },
  'form.description': { element: 'p', variant: 'supporting', flow: 'reading' },
  'form.help': { element: 'small', variant: 'supporting', flow: 'reading' },
  'dialog.title': { element: 'h2', variant: 'heading', flow: 'reading' },
  'dialog.body': { element: 'p', variant: 'body', flow: 'reading' },
  'popover.title': { element: 'strong', variant: 'body', flow: 'reading' },
  'popover.body': { element: 'p', variant: 'body', flow: 'reading' },
  'popover.description': { element: 'span', variant: 'body', flow: 'reading' },
  'choice.title': { element: 'strong', variant: 'body', flow: 'reading' },
  'choice.description': { element: 'small', variant: 'supporting', flow: 'reading' },
  'feedback.detail': { element: 'span', variant: 'body', flow: 'reading' },
  'feedback.message': { element: 'p', variant: 'body', flow: 'reading' },
  'message.body': { element: 'p', variant: 'body', flow: 'reading' },
  'code.inline': { element: 'code', variant: 'code', flow: 'inlineCode' },
  'code.block': { element: 'pre', variant: 'code', flow: 'code' },
  metadata: { element: 'span', variant: 'body', flow: 'single' },
} as const satisfies Record<string, TextDefinition>

export type LumenTextContext = keyof typeof LUMEN_TEXT_CONTEXTS

export interface LumenContentTextProps extends Omit<LumenTextProps, 'as' | 'variant'> {
  /** The owning content slot, not an HTML element or a user-selectable wrap preference. */
  readonly context: LumenTextContext
}

/** Host-owned content with a typed semantic slot and a shared reading/overflow policy. */
export function LumenContentText({ context, className, tone, ...other }: LumenContentTextProps) {
  const definition = LUMEN_TEXT_CONTEXTS[context]
  return (
    <LumenText
      {...other}
      tone={tone ?? (context === 'feedback.message' && other.role === 'alert' ? 'danger' : undefined)}
      as={definition.element}
      variant={definition.variant}
      data-text-context={context}
      data-text-flow={definition.flow}
      className={[styles[definition.flow], className].filter(Boolean).join(' ')}
    />
  )
}
