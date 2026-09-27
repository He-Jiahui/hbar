import { useState } from 'react'
import { LumenButton, LumenFrame, LumenText } from '@lumen/app-ui'
import type { MessageClipboardPort } from './message-copy'
import { toolInputText, type SessionToolRow } from './session-message-model'
import { ToolResultCopyAction, type HbarToolResultCopyLabels } from './tool-result-copy-action'

export interface HbarToolDetailsLabels {
  readonly input: string
  readonly output: string
  readonly toolResultCopy: HbarToolResultCopyLabels
  readonly emptyOutput: string
  readonly unavailableInput: string
  readonly showFullContent: string
  readonly showLessContent: string
}

export interface HbarMessageToolPresentation {
  readonly icon: 'file' | 'file-write' | 'file-edit' | 'directory' | 'terminal' | 'search' | 'tool'
  /** Host-localized action; the original tool name remains the row's identity. */
  readonly label?: string
  readonly summary?: string
  readonly summaryFormat?: 'code' | 'text'
  /** Host-owned, bounded requested-input context; never a file navigation action. */
  readonly title?: string
  readonly input?: { readonly format: 'command' | 'text'; readonly text: string }
}

const DETAIL_PREVIEW_CHARACTERS = 12_000

function DetailText({
  text,
  labels,
  command = false,
}: {
  readonly text: string
  readonly labels: HbarToolDetailsLabels
  readonly command?: boolean
}) {
  const [full, setFull] = useState(false)
  const long = text.length > DETAIL_PREVIEW_CHARACTERS
  return (
    <LumenFrame className="hbar-session-detail-text" data-format={command ? 'command' : undefined}>
      <LumenText as="pre" tabIndex={0}>
        {long && !full ? `${text.slice(0, DETAIL_PREVIEW_CHARACTERS)}…` : text}
      </LumenText>
      {long ? (
        <LumenButton variant="text" indicator="none" size="s" onClick={() => setFull(!full)} aria-expanded={full}>
          {full ? labels.showLessContent : labels.showFullContent}
        </LumenButton>
      ) : null}
    </LumenFrame>
  )
}

/** Mounted only after disclosure. Preview capacity never changes the copied original output. */
export function SessionToolDetails({
  row,
  presentation,
  labels,
  sessionId,
  messageId,
  clipboard,
}: {
  readonly row: SessionToolRow
  readonly presentation?: HbarMessageToolPresentation | undefined
  readonly labels: HbarToolDetailsLabels
  readonly sessionId: string
  readonly messageId: string
  readonly clipboard?: MessageClipboardPort | null | undefined
}) {
  return (
    <>
      {row.call ? (
        <LumenFrame className="hbar-session-tool-section">
          <LumenText as="span" className="hbar-session-tool-heading">
            {labels.input}
          </LumenText>
          <DetailText
            text={presentation?.input?.text ?? toolInputText(row.call.args, labels.unavailableInput)}
            labels={labels}
            command={presentation?.input?.format === 'command'}
          />
        </LumenFrame>
      ) : null}
      {row.result ? (
        <LumenFrame
          className="hbar-session-tool-section"
          data-tool-call-id={row.result.callId}
          data-tool-name={row.result.name}
        >
          <LumenFrame className="hbar-session-tool-result-heading">
            <LumenText as="span" className="hbar-session-tool-heading">
              {labels.output}
            </LumenText>
            <ToolResultCopyAction
              sessionId={sessionId}
              messageId={messageId}
              callId={row.result.callId}
              toolName={row.result.name}
              text={row.result.text}
              labels={labels.toolResultCopy}
              clipboard={clipboard}
            />
          </LumenFrame>
          <DetailText
            text={row.result.text || labels.emptyOutput}
            labels={labels}
            command={presentation?.input?.format === 'command'}
          />
        </LumenFrame>
      ) : null}
    </>
  )
}
