import { useId, useMemo, useState } from 'react'
import { LumenButton, LumenFrame, LumenText } from '@lumen/app-ui'
import type { MessageClipboardPort } from './message-copy'
import { toolInputText, type SessionToolRow } from './session-message-model'
import { ToolResultCopyAction, type HbarToolResultCopyLabels } from './tool-result-copy-action'
import { HbarLumenDisclosure } from './lumen-disclosure'
import { sessionToolOutcome } from './session-tool-outcome-model'
import { commandOutputWindow } from './session-command-output-model'
import { projectCommandReading } from './session-command-reading-model'
import './session-command-details.css'

export interface HbarToolDetailsLabels {
  readonly input: string
  readonly output: string
  readonly toolResultCopy: HbarToolResultCopyLabels
  readonly emptyOutput: string
  readonly unavailableInput: string
  readonly showFullContent: string
  readonly showLessContent: string
  readonly command: string
  readonly originalInput: string
  readonly errorOutput: string
  readonly showMoreOutput: (lines: number) => string
  readonly showRawOutput: string
  readonly showReadingOutput: string
  readonly emptyReadingOutput: string
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
  /** Exact requested command captured by the host adapter, not an executable action. */
  readonly command?: string
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

function CommandDetails({
  row,
  command,
  labels,
  sessionId,
  messageId,
  clipboard,
}: {
  readonly row: SessionToolRow
  readonly command: string
  readonly labels: HbarToolDetailsLabels
  readonly sessionId: string
  readonly messageId: string
  readonly clipboard?: MessageClipboardPort | null | undefined
}) {
  const [expanded, setExpanded] = useState(false)
  const [rawView, setRawView] = useState(false)
  const outputId = useId()
  const outcome = sessionToolOutcome(row.result)
  const failed = outcome === 'failed' || outcome === 'legacy-error'
  // An unknown/interrupted/denied result is not a successful stdout log. Keep
  // all its diagnostic content readable without another preview disclosure.
  const success = outcome === 'succeeded' || outcome === 'legacy-result'
  const output = row.result?.text ?? ''
  const reading = useMemo(() => projectCommandReading(output), [output])
  const visible = rawView ? output : reading.text
  const window = commandOutputWindow(visible)
  const folded = success && window.collapsible && !expanded
  return (
    <LumenFrame className="hbar-session-command" data-outcome={outcome}>
      <LumenFrame className="hbar-session-command-input">
        <LumenText as="span" className="hbar-session-tool-heading">
          {labels.command}
        </LumenText>
        <DetailText text={command} labels={labels} />
      </LumenFrame>
      {row.result && (
        <LumenFrame
          className="hbar-session-tool-section hbar-session-command-output"
          data-tool-call-id={row.result.callId}
          data-tool-name={row.result.name}
        >
          <LumenFrame className="hbar-session-tool-result-heading">
            <LumenText as="span" className="hbar-session-tool-heading">
              {failed ? labels.errorOutput : labels.output}
            </LumenText>
            <LumenFrame className="hbar-session-command-output-actions">
              {reading.changed && (
                <LumenButton
                  type="button"
                  size="s"
                  variant="text"
                  indicator="none"
                  className="hbar-session-command-view-toggle"
                  aria-pressed={rawView}
                  aria-controls={outputId}
                  onClick={() => setRawView((value) => !value)}
                >
                  {rawView ? labels.showReadingOutput : labels.showRawOutput}
                </LumenButton>
              )}
              <ToolResultCopyAction
                sessionId={sessionId}
                messageId={messageId}
                callId={row.result.callId}
                toolName={row.result.name}
                text={output}
                labels={labels.toolResultCopy}
                clipboard={clipboard}
              />
            </LumenFrame>
          </LumenFrame>
          <LumenText
            as="pre"
            tabIndex={0}
            id={outputId}
            className="hbar-session-command-output-text"
            data-command-output=""
            data-command-output-view={rawView || !reading.changed ? 'raw' : 'reading'}
          >
            {visible ? (
              <>
                {success ? visible.slice(0, window.previewEnd) : visible}
                {success && window.collapsible && (
                  <LumenText as="span" data-command-output-tail="" hidden={folded}>
                    {visible.slice(window.previewEnd)}
                  </LumenText>
                )}
              </>
            ) : reading.changed && !rawView ? (
              labels.emptyReadingOutput
            ) : (
              labels.emptyOutput
            )}
          </LumenText>
          {success && window.collapsible && (
            <LumenButton
              type="button"
              size="s"
              variant="text"
              indicator="none"
              className="hbar-session-command-output-toggle"
              aria-controls={outputId}
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded
                ? labels.showLessContent
                : window.hiddenLines
                  ? labels.showMoreOutput(window.hiddenLines)
                  : labels.showFullContent}
            </LumenButton>
          )}
        </LumenFrame>
      )}
      {row.call && (
        <HbarLumenDisclosure label={labels.originalInput} className="hbar-session-command-original">
          <DetailText text={toolInputText(row.call.args, labels.unavailableInput)} labels={labels} />
        </HbarLumenDisclosure>
      )}
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
  if (row.call && presentation?.command !== undefined)
    return (
      <CommandDetails
        row={row}
        command={presentation.command}
        labels={labels}
        sessionId={sessionId}
        messageId={messageId}
        clipboard={clipboard}
      />
    )
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
