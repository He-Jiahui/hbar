import { FileText, MessageSquare, X } from 'lucide-react'
import { LumenButton, LumenDisclosure, LumenFrame, LumenIcon, LumenText } from '@lumen/app-ui'
import type { SessionDraftState } from '@hbar/app-runtime'
import './composer-workspace-contexts.css'

type WorkspaceContext = NonNullable<SessionDraftState['workspaceContexts']>[number]

export interface HbarComposerWorkspaceContextLabels {
  readonly label: string
  readonly kind: (context: WorkspaceContext) => string
  readonly name: (context: WorkspaceContext) => string
  readonly location: (context: WorkspaceContext) => string
  readonly range: (context: WorkspaceContext) => string
  readonly remove: (context: WorkspaceContext) => string
  readonly quoteDisclosure: string
  readonly removeError: string
}

export interface HbarComposerWorkspaceContextsProps {
  readonly contexts: readonly WorkspaceContext[]
  readonly attachments: readonly SessionDraftState['attachments'][number][]
  readonly labels: HbarComposerWorkspaceContextLabels
  readonly removeAttachmentLabel: (attachment: SessionDraftState['attachments'][number]) => string
  readonly removeDisabled: boolean
  readonly error?: string | undefined
  readonly onRemove: (contextId: string) => void
  readonly onRemoveAttachment: (attachment: SessionDraftState['attachments'][number]) => void
}

/** Compact, host-labelled references in canonical draft state; quote text is disclosed only on demand. */
export function HbarComposerWorkspaceContexts({
  contexts,
  attachments,
  labels,
  removeAttachmentLabel,
  removeDisabled,
  error,
  onRemove,
  onRemoveAttachment,
}: HbarComposerWorkspaceContextsProps) {
  if (contexts.length === 0 && attachments.length === 0 && !error) return null

  return (
    <LumenFrame className="hbar-composer-workspace-contexts">
      {error && (
        <LumenText as="p" className="hbar-composer-workspace-context-error" role="alert">
          {error}
        </LumenText>
      )}
      {contexts.length > 0 && (
        <LumenFrame className="hbar-composer-workspace-context-list" role="list" aria-label={labels.label}>
          {contexts.map((context) => {
            const note =
              context.kind === 'chat-selection'
                ? context.quote
                : context.kind === 'source-selection'
                  ? null
                  : context.note
            const icon = context.kind === 'source-selection' ? FileText : MessageSquare
            const range = labels.range(context)
            return (
              <LumenFrame
                key={context.id}
                className="hbar-composer-workspace-context-card"
                data-kind={context.kind}
                role="listitem"
              >
                <LumenIcon icon={icon} tier="sm" className="hbar-composer-workspace-context-icon" />
                <LumenFrame className="hbar-composer-workspace-context-copy">
                  <LumenText as="span" className="hbar-composer-workspace-context-kind">
                    {labels.kind(context)}
                  </LumenText>
                  <LumenFrame className="hbar-composer-workspace-context-address" title={labels.location(context)}>
                    <LumenText as="span" className="hbar-composer-workspace-context-location">
                      {labels.name(context)}
                    </LumenText>
                    {range && (
                      <LumenText as="small" className="hbar-composer-workspace-context-range">
                        {range}
                      </LumenText>
                    )}
                  </LumenFrame>
                  {note && (
                    <LumenText as="span" className="hbar-composer-workspace-context-note" title={note}>
                      {note}
                    </LumenText>
                  )}
                  <LumenDisclosure className="hbar-composer-workspace-context-quote" summary={labels.quoteDisclosure}>
                    <LumenFrame
                      as="div"
                      role="blockquote"
                      className="hbar-composer-workspace-context-quote-text"
                    >
                      {context.quote}
                    </LumenFrame>
                  </LumenDisclosure>
                </LumenFrame>
                <LumenButton
                  type="button"
                  size="s"
                  variant="text"
                  indicator="none"
                  className="hbar-composer-workspace-context-remove"
                  disabled={removeDisabled}
                  aria-label={labels.remove(context)}
                  title={labels.remove(context)}
                  onClick={() => onRemove(context.id)}
                >
                  <LumenIcon icon={X} tier="sm" />
                </LumenButton>
              </LumenFrame>
            )
          })}
        </LumenFrame>
      )}
      {attachments.length > 0 && (
        <LumenFrame className="hbar-composer-workspace-context-attachments" role="list">
          {attachments.map((attachment) => (
            <LumenFrame
              key={`${attachment.kind}:${attachment.artifact.id}`}
              className="hbar-composer-workspace-context-file"
              role="listitem"
            >
              <LumenIcon icon={FileText} tier="sm" />
              <LumenText as="span" title={attachment.artifact.name}>
                {attachment.artifact.name}
              </LumenText>
              <LumenButton
                type="button"
                size="s"
                variant="text"
                indicator="none"
                disabled={removeDisabled}
                aria-label={removeAttachmentLabel(attachment)}
                title={removeAttachmentLabel(attachment)}
                onClick={() => onRemoveAttachment(attachment)}
              >
                <LumenIcon icon={X} tier="sm" />
              </LumenButton>
            </LumenFrame>
          ))}
        </LumenFrame>
      )}
    </LumenFrame>
  )
}
