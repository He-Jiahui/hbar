import { useId, useLayoutEffect, useRef, useState } from 'react'
import { Check, Copy, LoaderCircle, RotateCcw } from 'lucide-react'
import { LumenContentText, LumenButton, LumenFrame, LumenIcon } from '@lumen/app-ui'
import type { MessageClipboardPort } from './message-copy'
import { copyCodeText, MAX_CODE_BLOCK_COPY_CHARACTERS, type CodeBlockCopyInput } from './code-block-copy'
import type { HbarDiagramLabels } from './markdown-diagram-model'
import { createMessageScope } from './messages'

export interface HbarCodeBlockLabels {
  readonly diagram: HbarDiagramLabels
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

const { Provider: CodeBlockMessagesProvider, useMessages: useCodeBlockMessages } =
  createMessageScope<HbarCodeBlockLabels>()

export { CodeBlockMessagesProvider }

export function useCodeBlockLabels(): HbarCodeBlockLabels {
  const { t } = useCodeBlockMessages()
  return {
    diagram: t('diagram'),
    copy: t('copy'),
    copying: t('copying'),
    copied: t('copied'),
    failed: t('failed'),
    unavailable: t('unavailable'),
    tooLarge: t('tooLarge'),
    retry: t('retry'),
    language: t('language'),
    lines: t('lines'),
    showMore: t('showMore'),
    showLess: t('showLess'),
  }
}

export interface CodeTextCopyActionProps {
  readonly identity: readonly string[]
  readonly text: string
  readonly source: string
  readonly owner?: object | undefined
  readonly labels: HbarCodeBlockLabels
  readonly clipboard?: MessageClipboardPort | null | undefined
}
type CodeCopyActionMessages = Pick<
  HbarCodeBlockLabels,
  'copy' | 'copying' | 'copied' | 'failed' | 'unavailable' | 'tooLarge' | 'retry'
>
const { Provider: CodeCopyMessagesProvider, useMessages: useCodeCopyMessages } =
  createMessageScope<CodeCopyActionMessages>()
interface CodeBlockCopyActionProps extends CodeBlockCopyInput, Omit<CodeTextCopyActionProps, 'identity' | 'text'> {}

type CopyStatus = 'idle' | 'copying' | 'copied' | 'failed' | 'unavailable'

function platformClipboard(): MessageClipboardPort | null {
  try {
    return typeof navigator === 'undefined' ? null : (navigator.clipboard ?? null)
  } catch {
    return null
  }
}

function CopyAction({
  clipboard,
  source,
  owner,
  text,
}: Omit<CodeTextCopyActionProps, 'labels' | 'identity'> & { readonly identity: readonly string[] }) {
  const { t } = useCodeCopyMessages()
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
  }, [source, owner, text])
  const tooLarge = text.length > MAX_CODE_BLOCK_COPY_CHARACTERS
  if (!tooLarge && !/\S/u.test(text)) return null
  const failure = status === 'failed' || status === 'unavailable'
  const notice = tooLarge
    ? t('tooLarge')(MAX_CODE_BLOCK_COPY_CHARACTERS)
    : failure
      ? status === 'unavailable'
        ? t('unavailable')
        : t('failed')
      : null
  const copy = () => {
    if (pending.current || tooLarge) return
    const captured = ++generation.current
    pending.current = true
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    setStatus('copying')
    void copyCodeText(text, clipboard === undefined ? platformClipboard() : clipboard).then((result) => {
      if (generation.current !== captured) return
      pending.current = false
      if (result === 'empty' || result === 'too_large') {
        setStatus('idle')
        return
      }
      setStatus(result)
      if (result === 'copied')
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
        <LumenContentText context="control.label" aria-live="polite">
          {status === 'copied' ? t('copied') : status === 'copying' ? t('copying') : failure ? t('retry') : t('copy')}
        </LumenContentText>
      </LumenButton>
      {notice && (
        <LumenContentText
          context="message.inline"
          id={noticeId}
          role={failure ? 'alert' : 'status'}
          tone={failure ? 'danger' : 'muted'}
        >
          {notice}
        </LumenContentText>
      )}
    </LumenFrame>
  )
}

export function CodeBlockCopyAction(props: CodeBlockCopyActionProps) {
  const { sessionId, messageId, segmentId, occurrenceId, ...copyProps } = props
  return <CodeTextCopyAction identity={[sessionId, messageId, segmentId, occurrenceId]} {...copyProps} />
}

/** A semantic source identity, not a fabricated message target for file code. */
export function CodeTextCopyAction(props: CodeTextCopyActionProps) {
  const { labels, ...copy } = props
  const messages: CodeCopyActionMessages = {
    copy: labels.copy,
    copying: labels.copying,
    copied: labels.copied,
    failed: labels.failed,
    unavailable: labels.unavailable,
    tooLarge: labels.tooLarge,
    retry: labels.retry,
  }
  return (
    <CodeCopyMessagesProvider messages={messages}>
      <CopyAction key={JSON.stringify(props.identity)} {...copy} />
    </CodeCopyMessagesProvider>
  )
}
