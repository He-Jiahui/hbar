import { useId, useMemo, useState } from 'react'
import { LumenContentText, LumenButton, LumenFrame, LumenText } from '@lumen/app-ui'
import type { MessageClipboardPort } from './message-copy'
import { toolInputText, type SessionToolRow } from './session-message-model'
import { ToolResultCopyAction, type HbarToolResultCopyLabels } from './tool-result-copy-action'
import { HbarLumenDisclosure } from './lumen-disclosure'
import { sessionToolOutcome } from './session-tool-outcome-model'
import { commandOutputWindow } from './session-command-output-model'
import { projectCommandReading } from './session-command-reading-model'
import './session-command-details.css'
import { MarkdownCodeContent } from './markdown-code-content'
import { serializedReadingLanguage } from './plain-code-tokens'
import { HbarToolResultImages } from './session-images'
import { ToolOutputImageLinks } from './tool-output-image-links'
import { createMessageScope } from './messages'

function SourceText({
  text,
  language,
  owner,
}: {
  readonly text: string
  readonly language?: string | null | undefined
  readonly owner?: object | undefined
}) {
  return (
    <MarkdownCodeContent
      source={text}
      language={language ?? serializedReadingLanguage(text)}
      owner={owner}
      previewEnd={text.length}
      collapsible={false}
      expanded
    />
  )
}

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
  readonly liveOutputReset: (reason: 'gap' | 'retention' | 'limited') => string
}

const { Provider: ToolDetailsMessagesProvider, useMessages: useToolDetailsMessages } =
  createMessageScope<HbarToolDetailsLabels>()

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
  command = false,
  language,
  owner,
}: {
  readonly text: string
  readonly command?: boolean
  readonly language?: string | null | undefined
  readonly owner?: object | undefined
}) {
  const { t } = useToolDetailsMessages()
  const [full, setFull] = useState(false)
  const long = text.length > DETAIL_PREVIEW_CHARACTERS
  return (
    <LumenFrame className="hbar-session-detail-text" data-format={command ? 'command' : undefined}>
      <LumenText as="pre" tabIndex={0}>
        <SourceText
          text={long && !full ? `${text.slice(0, DETAIL_PREVIEW_CHARACTERS)}…` : text}
          language={language}
          owner={owner}
        />
      </LumenText>
      {long ? (
        <LumenButton variant="text" indicator="none" size="s" onClick={() => setFull(!full)} aria-expanded={full}>
          {full ? t('showLessContent') : t('showFullContent')}
        </LumenButton>
      ) : null}
    </LumenFrame>
  )
}

function CommandDetails({
  row,
  command,
  sessionId,
  messageId,
  clipboard,
  copyOwner,
  liveOutput,
}: {
  readonly row: SessionToolRow
  readonly command: string
  readonly sessionId: string
  readonly messageId: string
  readonly clipboard?: MessageClipboardPort | null | undefined
  readonly copyOwner?: object | undefined
  readonly liveOutput?: import('@hbar/contracts').ToolOutputNotification | undefined
}) {
  const { t } = useToolDetailsMessages()
  const [expanded, setExpanded] = useState(false)
  const [rawView, setRawView] = useState(false)
  const outputId = useId()
  const outcome = sessionToolOutcome(row.result)
  const failed = outcome === 'failed' || outcome === 'legacy-error'
  // An unknown/interrupted/denied result is not a successful stdout log. Keep
  // all its diagnostic content readable without another preview disclosure.
  const success = outcome === 'succeeded' || outcome === 'legacy-result'
  const output = row.result ? row.result.text : (liveOutput?.text ?? '')
  const reading = useMemo(() => projectCommandReading(output), [output])
  const visible = rawView ? output : reading.text
  const window = commandOutputWindow(visible)
  const folded = success && window.collapsible && !expanded
  return (
    <LumenFrame className="hbar-session-command" data-outcome={outcome}>
      <LumenFrame className="hbar-session-command-input">
        <LumenContentText context="message.inline" className="hbar-session-tool-heading">
          {t('command')}
        </LumenContentText>
        <DetailText text={command} language="shellscript" owner={copyOwner} />
      </LumenFrame>
      {row.result || liveOutput?.text || liveOutput?.reset ? (
        <LumenFrame
          className="hbar-session-tool-section hbar-session-command-output"
          data-tool-call-id={row.result?.callId ?? row.call?.callId}
          data-tool-name={row.result?.name ?? row.call?.name}
          data-content-kind="output"
        >
          <LumenFrame className="hbar-session-tool-result-heading">
            <LumenContentText context="message.inline" className="hbar-session-tool-heading">
              {row.result && failed ? t('errorOutput') : t('output')}
            </LumenContentText>
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
                  {rawView ? t('showReadingOutput') : t('showRawOutput')}
                </LumenButton>
              )}
              {row.result ? (
                <ToolResultCopyAction
                  sessionId={sessionId}
                  messageId={messageId}
                  callId={row.result.callId}
                  toolName={row.result.name}
                  text={output}
                  labels={t('toolResultCopy')}
                  clipboard={clipboard}
                />
              ) : null}
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
                <SourceText text={success ? visible.slice(0, window.previewEnd) : visible} owner={copyOwner} />
                {success && window.collapsible && (
                  <LumenContentText context="message.inline" data-command-output-tail="" hidden={folded}>
                    <SourceText text={visible.slice(window.previewEnd)} owner={copyOwner} />
                  </LumenContentText>
                )}
              </>
            ) : reading.changed && !rawView ? (
              t('emptyReadingOutput')
            ) : (
              t('emptyOutput')
            )}
          </LumenText>
          {!row.result && liveOutput?.reason ? (
            <LumenContentText context="control.status" className="hbar-session-tool-output-status">
              {t('liveOutputReset')(liveOutput.reason)}
            </LumenContentText>
          ) : null}
          {row.result ? <HbarToolResultImages sessionId={sessionId} messageId={messageId} result={row.result} /> : null}
          <ToolOutputImageLinks text={output} />
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
                ? t('showLessContent')
                : window.hiddenLines
                  ? t('showMoreOutput')(window.hiddenLines)
                  : t('showFullContent')}
            </LumenButton>
          )}
        </LumenFrame>
      ) : null}
      {row.call && (
        <HbarLumenDisclosure label={t('originalInput')} className="hbar-session-command-original">
          <DetailText text={toolInputText(row.call.args, t('unavailableInput'))} language="json" owner={copyOwner} />
        </HbarLumenDisclosure>
      )}
    </LumenFrame>
  )
}

/** Mounted only after disclosure. Preview capacity never changes the copied original output. */
function SessionToolDetailsView({
  row,
  presentation,
  sessionId,
  messageId,
  clipboard,
  copyOwner,
  liveOutput,
}: {
  readonly row: SessionToolRow
  readonly presentation?: HbarMessageToolPresentation | undefined
  readonly sessionId: string
  readonly messageId: string
  readonly clipboard?: MessageClipboardPort | null | undefined
  readonly copyOwner?: object | undefined
  readonly liveOutput?: import('@hbar/contracts').ToolOutputNotification | undefined
}) {
  const { t } = useToolDetailsMessages()
  if (row.call && presentation?.command !== undefined)
    return (
      <CommandDetails
        row={row}
        command={presentation.command}
        sessionId={sessionId}
        messageId={messageId}
        clipboard={clipboard}
        copyOwner={copyOwner}
        liveOutput={liveOutput}
      />
    )
  return (
    <>
      {row.call ? (
        <LumenFrame className="hbar-session-tool-section" data-content-kind="input">
          <LumenContentText context="message.inline" className="hbar-session-tool-heading">
            {t('input')}
          </LumenContentText>
          <DetailText
            text={presentation?.input?.text ?? toolInputText(row.call.args, t('unavailableInput'))}
            command={presentation?.input?.format === 'command'}
            language={presentation?.input ? (presentation.input.format === 'command' ? 'shellscript' : null) : 'json'}
            owner={copyOwner}
          />
        </LumenFrame>
      ) : null}
      {row.result || liveOutput?.text || liveOutput?.reset ? (
        <LumenFrame
          className="hbar-session-tool-section"
          data-tool-call-id={row.result?.callId ?? row.call?.callId}
          data-tool-name={row.result?.name ?? row.call?.name}
          data-content-kind="output"
        >
          <LumenFrame className="hbar-session-tool-result-heading">
            <LumenContentText context="message.inline" className="hbar-session-tool-heading">
              {t('output')}
            </LumenContentText>
            {row.result ? (
              <ToolResultCopyAction
                sessionId={sessionId}
                messageId={messageId}
                callId={row.result.callId}
                toolName={row.result.name}
                text={row.result.text}
                labels={t('toolResultCopy')}
                clipboard={clipboard}
              />
            ) : null}
          </LumenFrame>
          <DetailText
            text={row.result ? row.result.text || t('emptyOutput') : liveOutput?.text || t('emptyOutput')}
            command={presentation?.input?.format === 'command'}
            owner={copyOwner}
          />
          {!row.result && liveOutput?.reason ? (
            <LumenContentText context="control.status" className="hbar-session-tool-output-status">
              {t('liveOutputReset')(liveOutput.reason)}
            </LumenContentText>
          ) : null}
          {row.result ? <HbarToolResultImages sessionId={sessionId} messageId={messageId} result={row.result} /> : null}
          <ToolOutputImageLinks text={row.result?.text ?? liveOutput?.text ?? ''} />
        </LumenFrame>
      ) : null}
    </>
  )
}

/** The legacy labels prop remains the host adapter for existing SDK callers. */
export function SessionToolDetails(props: {
  readonly row: SessionToolRow
  readonly presentation?: HbarMessageToolPresentation | undefined
  readonly labels: HbarToolDetailsLabels
  readonly sessionId: string
  readonly messageId: string
  readonly clipboard?: MessageClipboardPort | null | undefined
  readonly copyOwner?: object | undefined
  readonly liveOutput?: import('@hbar/contracts').ToolOutputNotification | undefined
}) {
  const { labels, ...details } = props
  return (
    <ToolDetailsMessagesProvider messages={labels}>
      <SessionToolDetailsView {...details} />
    </ToolDetailsMessagesProvider>
  )
}
