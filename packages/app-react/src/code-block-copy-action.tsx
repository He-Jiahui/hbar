import { useId, useLayoutEffect, useRef, useState } from 'react'
import { Check, Copy, LoaderCircle, RotateCcw } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenText } from '@lumen/app-ui'
import type { MessageClipboardPort } from './message-copy'
import { copyCodeBlockText, MAX_CODE_BLOCK_COPY_CHARACTERS, type CodeBlockCopyInput } from './code-block-copy'

export interface HbarCodeBlockLabels {
  readonly copy: string
  readonly copying: string
  readonly copied: string
  readonly failed: string
  readonly unavailable: string
  readonly tooLarge: (limit: number) => string
  readonly retry: string
  readonly language: (language: string | null) => string
  readonly lines: (count: number) => string
  readonly showMore: (count: number) => string
  readonly showLess: string
}

interface CodeBlockCopyActionProps extends CodeBlockCopyInput {
  readonly source: string
  readonly owner?: object | undefined
  readonly labels: HbarCodeBlockLabels
  readonly clipboard?: MessageClipboardPort | null | undefined
}

type CopyStatus = 'idle' | 'copying' | 'copied' | 'failed' | 'unavailable'

function platformClipboard(): MessageClipboardPort | null {
  try {
    return typeof navigator === 'undefined' ? null : (navigator.clipboard ?? null)
  } catch {
    return null
  }
}

function CopyAction({ labels, clipboard, source, owner, ...input }: CodeBlockCopyActionProps) {
  const [status, setStatus] = useState<CopyStatus>('idle')
  const generation = useRef(0)
  const pending = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noticeId = useId()
  useLayoutEffect(() => {
    generation.current += 1
    pending.current = false
    setStatus('idle')
    return () => {
      generation.current += 1
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = null
    }
  }, [source, owner, input.text])
  const tooLarge = input.text.length > MAX_CODE_BLOCK_COPY_CHARACTERS
  if (!tooLarge && !/\S/u.test(input.text)) return null
  const failure = status === 'failed' || status === 'unavailable'
  const notice = tooLarge
    ? labels.tooLarge(MAX_CODE_BLOCK_COPY_CHARACTERS)
    : failure
      ? status === 'unavailable'
        ? labels.unavailable
        : labels.failed
      : null
  const copy = () => {
    if (pending.current || tooLarge) return
    const captured = ++generation.current
    pending.current = true
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    setStatus('copying')
    void copyCodeBlockText(input, clipboard === undefined ? platformClipboard() : clipboard).then((result) => {
      if (generation.current !== captured) return
      pending.current = false
      if (result.status === 'empty' || result.status === 'too_large') {
        setStatus('idle')
        return
      }
      setStatus(result.status)
      if (result.status === 'copied')
        timer.current = setTimeout(() => {
          if (generation.current === captured) setStatus('idle')
          timer.current = null
        }, 1_500)
    })
  }
  return (
    <LumenFrame className="hbar-message-code-copy" data-copy-status={tooLarge ? 'too_large' : status}>
      <LumenButton
        type="button"
        size="s"
        variant="text"
        indicator="none"
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
          {status === 'copied'
            ? labels.copied
            : status === 'copying'
              ? labels.copying
              : failure
                ? labels.retry
                : labels.copy}
        </LumenText>
      </LumenButton>
      {notice && (
        <LumenText as="span" id={noticeId} role={failure ? 'alert' : 'status'} tone={failure ? 'danger' : 'muted'}>
          {notice}
        </LumenText>
      )}
    </LumenFrame>
  )
}

export function CodeBlockCopyAction(props: CodeBlockCopyActionProps) {
  return (
    <CopyAction
      key={JSON.stringify([props.sessionId, props.messageId, props.segmentId, props.occurrenceId])}
      {...props}
    />
  )
}
