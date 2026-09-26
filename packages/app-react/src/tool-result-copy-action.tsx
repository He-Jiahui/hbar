import { useId, useLayoutEffect, useRef, useState } from 'react'
import { Check, Copy, LoaderCircle, RotateCcw } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenText } from '@lumen/app-ui'
import type { MessageClipboardPort } from './message-copy'
import { copyToolResultText, MAX_TOOL_RESULT_COPY_CHARACTERS, type ToolResultCopyInput } from './tool-result-copy'

export interface HbarToolResultCopyLabels {
  readonly copy: string
  readonly copying: string
  readonly copied: string
  readonly failed: string
  readonly unavailable: string
  readonly tooLarge: (limit: number) => string
  readonly retry: string
}

interface ToolResultCopyActionProps extends ToolResultCopyInput {
  readonly labels: HbarToolResultCopyLabels
  /** Undefined uses the platform clipboard; null explicitly denotes unavailable access. */
  readonly clipboard?: MessageClipboardPort | null | undefined
}

type CopyStatus = 'idle' | 'copying' | 'copied' | 'failed' | 'unavailable'

function browserClipboard(): MessageClipboardPort | null {
  try {
    return typeof navigator === 'undefined' ? null : (navigator.clipboard ?? null)
  } catch {
    return null
  }
}

function ToolResultCopyActionContent({ labels, clipboard, ...input }: ToolResultCopyActionProps) {
  const [receipt, setReceipt] = useState<{ readonly text: string; readonly status: CopyStatus }>({
    text: input.text,
    status: 'idle',
  })
  const generation = useRef(0)
  const pending = useRef(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noticeId = useId()
  const text = input.text
  // Invalidate at commit, including A -> B -> A replacement. A clipboard write
  // already submitted cannot be cancelled, but its receipt must not relabel B.
  useLayoutEffect(() => {
    generation.current += 1
    pending.current = false
    setReceipt({ text, status: 'idle' })
    return () => {
      generation.current += 1
      if (resetTimer.current !== null) clearTimeout(resetTimer.current)
      resetTimer.current = null
    }
  }, [text])
  const tooLarge = text.length > MAX_TOOL_RESULT_COPY_CHARACTERS
  const status = tooLarge ? 'too_large' : receipt.text === text ? receipt.status : 'idle'
  const failure = status === 'failed' || status === 'unavailable'
  const copy = () => {
    if (pending.current || tooLarge) return
    const version = ++generation.current
    pending.current = true
    if (resetTimer.current !== null) clearTimeout(resetTimer.current)
    resetTimer.current = null
    setReceipt({ text, status: 'copying' })
    void copyToolResultText(input, clipboard === undefined ? browserClipboard() : clipboard).then((result) => {
      if (generation.current !== version) return
      pending.current = false
      if (result.status === 'empty' || result.status === 'too_large') {
        setReceipt({ text, status: 'idle' })
        return
      }
      setReceipt({ text, status: result.status })
      if (result.status === 'copied') {
        resetTimer.current = setTimeout(() => {
          if (generation.current === version) setReceipt({ text, status: 'idle' })
          resetTimer.current = null
        }, 1_500)
      }
    })
  }
  if (!tooLarge && !/\S/u.test(text)) return null
  const label =
    status === 'copied' ? labels.copied : status === 'copying' ? labels.copying : failure ? labels.retry : labels.copy
  const notice = tooLarge
    ? labels.tooLarge(MAX_TOOL_RESULT_COPY_CHARACTERS)
    : failure
      ? status === 'unavailable'
        ? labels.unavailable
        : labels.failed
      : null
  return (
    <LumenFrame className="hbar-session-tool-result-copy-action" data-copy-status={status}>
      <LumenButton
        variant="text"
        indicator="none"
        size="s"
        className="hbar-session-tool-result-copy"
        aria-describedby={notice ? noticeId : undefined}
        loading={status === 'copying'}
        disabled={status === 'copying' || tooLarge}
        onClick={copy}
      >
        <LumenIcon
          icon={status === 'copied' ? Check : status === 'copying' ? LoaderCircle : failure ? RotateCcw : Copy}
          tier="sm"
        />
        <LumenText as="span" aria-live="polite">
          {label}
        </LumenText>
      </LumenButton>
      {notice ? (
        <LumenText
          as="span"
          id={noticeId}
          role={failure ? 'alert' : 'status'}
          className="hbar-session-tool-result-copy-notice"
        >
          {notice}
        </LumenText>
      ) : null}
    </LumenFrame>
  )
}

/** Local output action; no execution permission or Host mutation is involved. */
export function ToolResultCopyAction(props: ToolResultCopyActionProps) {
  return (
    <ToolResultCopyActionContent
      key={JSON.stringify([props.sessionId, props.messageId, props.callId, props.toolName])}
      {...props}
    />
  )
}
