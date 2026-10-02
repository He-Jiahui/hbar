import { messageLiteralSegments } from './message-literal-text-model'
import { LumenFrame, LumenText } from '@lumen/app-ui'
import { splitMessageFileReferences } from './message-file-reference-model'
import { MessageFileReferenceLink, type MessageFileReferenceContext } from './message-file-reference'

/** Operator prompts are literal text, not Markdown documents or code previews. */
export function MessageLiteralText({
  text,
  fileReferences,
}: {
  readonly text: string
  readonly fileReferences?: MessageFileReferenceContext | undefined
}) {
  return (
    <LumenText as="p" className="hbar-session-message-literal">
      {messageLiteralSegments(text).map((segment, index) =>
        segment.kind === 'url' ? (
          <LumenFrame as="a" key={index} href={segment.value} target="_blank" rel="noreferrer noopener">
            {segment.value}
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
    </LumenText>
  )
}
