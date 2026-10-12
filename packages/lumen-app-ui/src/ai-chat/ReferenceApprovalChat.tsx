'use client'

import { ReferenceFrame, ReferenceMessages, uniqueReferenceItems } from './primitives'
import type { LumenAiChatApprovalReferenceContent, LumenAiChatReferenceViewProps } from './reference-content'
import './reference-approval.css'

export function ReferenceApprovalChat({
  variantId,
  className,
  viewModel,
  onAction,
}: LumenAiChatReferenceViewProps<LumenAiChatApprovalReferenceContent>) {
  const { content } = viewModel
  const previousApprovals = uniqueReferenceItems(content.previousApprovals)

  return (
    <ReferenceFrame
      content={content}
      variantId={variantId}
      className={`lumen-ai-chat-reference-approval ${className ?? ''}`}
    >
      <ReferenceMessages content={content} onAction={onAction} onSourceSelect={viewModel.onSourceSelect} />

      {previousApprovals.length ? (
        <ul className="lumen-ai-chat-reference-approval-history">
          {previousApprovals.map((item) => (
            <li key={item.id} data-hbar-app-ui-item-id={item.id}>
              <span className="lumen-ai-chat-reference-approval-history-dot" aria-hidden="true" />
              <span className="lumen-ai-chat-reference-approval-history-copy">
                {item.badge ? <strong>{item.badge}</strong> : null}
                <span>{item.label}</span>
                {item.detail ? <small>{item.detail}</small> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <section
        className="lumen-ai-chat-reference-approval-card"
        aria-label={content.approval.status}
        data-hbar-app-ui-item-id={content.approval.id}
      >
        <div className="lumen-ai-chat-reference-approval-summary">
          <span className="lumen-ai-chat-reference-approval-warning-dot" aria-hidden="true" />
          <strong role="status">{content.approval.status}</strong>
        </div>
        <p className="lumen-ai-chat-reference-approval-description">{content.approval.description}</p>
        <div className="lumen-ai-chat-reference-approval-footer">
          <details className="lumen-ai-chat-reference-approval-request">
            <summary>{content.approval.labels.showRequest}</summary>
            <p>{content.approval.request}</p>
          </details>
          <div className="lumen-ai-chat-reference-approval-actions">
            <button
              type="button"
              className="lumen-ai-chat-reference-approval-allow"
              data-hbar-app-ui-action="approve"
              onClick={() => onAction?.({ actionId: 'approve', value: content.approval.id })}
            >
              {content.approval.labels.allow}
            </button>
            <button
              type="button"
              data-hbar-app-ui-action="deny"
              onClick={() => onAction?.({ actionId: 'deny', value: content.approval.id })}
            >
              {content.approval.labels.deny}
            </button>
          </div>
        </div>
      </section>
    </ReferenceFrame>
  )
}

export default ReferenceApprovalChat
