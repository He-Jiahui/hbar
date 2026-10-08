import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { LumenContentText, LumenFrame } from '@lumen/app-ui'
import type { MessageFileReference } from './message-file-reference-model'
import './message-file-reference.css'
import { registerSessionNavigationChrome } from './session-navigation-chrome'

export interface MessageFileReferenceLabels {
  readonly open: (reference: MessageFileReference) => string
  readonly opening: string
  readonly error: (code: string) => string
}
export interface MessageFileReferenceContext {
  readonly owner: object
  readonly targetKey: string
  readonly labels: MessageFileReferenceLabels
  readonly streaming?: boolean | undefined
  readonly onOpen: (reference: MessageFileReference) => Promise<void>
}

/** A read-only navigation affordance; errors belong beside the original reference. */
export function MessageFileReferenceLink({
  reference,
  context,
  children,
}: {
  readonly reference: MessageFileReference
  readonly context: MessageFileReferenceContext
  readonly children: ReactNode
}) {
  const root = useRef<HTMLSpanElement>(null)
  const feedback = useRef<HTMLSpanElement>(null)
  const lifetime = useRef({ active: true })
  const pending = useRef(false)
  const [status, setStatus] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })
  useEffect(() => {
    const token = { active: true }
    lifetime.current = token
    pending.current = false
    setStatus({ busy: false, error: null })
    return () => {
      token.active = false
      pending.current = false
    }
  }, [context.owner, context.targetKey, reference.path, reference.line, reference.column])
  useLayoutEffect(() => {
    if (!root.current || !feedback.current) return
    return registerSessionNavigationChrome(root.current, feedback.current)
  }, [])
  const open = () => {
    if (pending.current) return
    const current = lifetime.current
    pending.current = true
    setStatus({ busy: true, error: null })
    void context.onOpen(reference).then(
      () => {
        if (current !== lifetime.current || !current.active) return
        pending.current = false
        setStatus({ busy: false, error: null })
      },
      (reason: unknown) => {
        if (current !== lifetime.current || !current.active) return
        pending.current = false
        const code =
          reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
            ? reason.code
            : 'EXECUTION_FAILED'
        setStatus({ busy: false, error: code })
      },
    )
  }
  return (
    <LumenFrame as="span" ref={root} className="hbar-message-file-reference">
      <LumenFrame
        as="a"
        role="link"
        tabIndex={0}
        aria-label={context.labels.open(reference)}
        title={context.labels.open(reference)}
        aria-busy={status.busy || undefined}
        className="hbar-message-file-link"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          open()
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          event.stopPropagation()
          open()
        }}
      >
        {children}
      </LumenFrame>
      <LumenFrame as="span" ref={feedback} data-session-find-exclude="file-navigation">
        {status.busy && (
          <LumenContentText
            context="feedback.detail"
            className="hbar-message-file-feedback"
            role="status"
            data-session-find-exclude="file-navigation"
          >
            {context.labels.opening}
          </LumenContentText>
        )}
        {status.error && (
          <LumenContentText
            context="feedback.detail"
            className="hbar-message-file-feedback"
            role="alert"
            data-session-find-exclude="file-navigation"
          >
            {context.labels.error(status.error)}
          </LumenContentText>
        )}
      </LumenFrame>
    </LumenFrame>
  )
}
