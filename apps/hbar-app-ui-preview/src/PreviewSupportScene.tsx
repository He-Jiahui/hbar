import { SupportTicketPreviewHost } from './SupportTicketPreviewHost'
import { SupportThreadPreviewHost } from './SupportThreadPreviewHost'
import { SupportReferencePreviewHost } from './SupportReferencePreviewHost'
import type { PreviewHostProps } from './preview-scene-contract'
export function PreviewSupportScene({ selected, onAction, fixtures, children }: PreviewHostProps) {
  const {
    supportLocale,
    supportContent,
    supportTicketCopy,
    supportThreadCopy,
    supportReplyOutcome,
    supportAssistantOutcome,
    supportTicketOutcome,
  } = fixtures
  return (
    <SupportReferencePreviewHost
      content={supportContent}
      spec={selected.spec}
      onAction={onAction}
      locale={supportLocale}
      assistantOutcome={supportAssistantOutcome}
    >
      <SupportThreadPreviewHost
        content={supportContent}
        spec={selected.spec}
        onAction={onAction}
        labels={supportThreadCopy}
        replyPreviewOutcome={supportReplyOutcome}
      >
        <SupportTicketPreviewHost
          content={supportContent}
          spec={selected.spec}
          onAction={onAction}
          labels={supportTicketCopy}
          submitPreviewOutcome={supportTicketOutcome}
        >
          {children}
        </SupportTicketPreviewHost>
      </SupportThreadPreviewHost>
    </SupportReferencePreviewHost>
  )
}
