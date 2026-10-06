import { messageLiteralSegments } from './message-literal-text-model'
import { LumenFrame, LumenContentText, LumenLink } from '@lumen/app-ui'
import { splitMessageFileReferences } from './message-file-reference-model'
import { MessageFileReferenceLink, type MessageFileReferenceContext } from './message-file-reference'
import { MessageImagePreview } from './message-image-preview'
import { imageLinkSource, MAX_MESSAGE_IMAGE_PREVIEWS } from './message-image-preview-model'

/** Operator prompts are literal text, not Markdown documents or code previews. */
export function MessageLiteralText({
  text,
  fileReferences,
}: {
  readonly text: string
  readonly fileReferences?: MessageFileReferenceContext | undefined
}) {
  const parts = messageLiteralSegments(text)
  const previewIndices = new Set(
    parts
      .flatMap((part, index) => (part.kind === 'url' && imageLinkSource(part.value) ? [index] : []))
      .slice(0, MAX_MESSAGE_IMAGE_PREVIEWS),
  )
  return (
    <LumenContentText context="message.body" className="hbar-session-message-literal">
      {parts.map((segment, index) =>
        segment.kind === 'url' ? (
          <LumenFrame
            as="span"
            key={index}
            className={previewIndices.has(index) ? 'hbar-message-image-link' : undefined}
          >
            <LumenLink href={segment.value} target="_blank" rel="noreferrer noopener">
              <LumenContentText context="inline.text">{segment.value}</LumenContentText>
            </LumenLink>
            {previewIndices.has(index) && <MessageImagePreview source={segment.value} />}
          </LumenFrame>
        ) : fileReferences ? (
          splitMessageFileReferences(segment.value).map((part, ordinal) =>
            part.kind === 'file' ? (
              <MessageFileReferenceLink key={ordinal} reference={part.reference} context={fileReferences}>
                {part.value}
              </MessageFileReferenceLink>
            ) : (
              part.value
            ),
          )
        ) : (
          segment.value
        ),
      )}
    </LumenContentText>
  )
}
