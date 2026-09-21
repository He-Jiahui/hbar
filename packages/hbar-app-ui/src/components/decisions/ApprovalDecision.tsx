import { Check, ShieldCheck, X } from 'lucide-react'
import { LumenDisclosure } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../../icon'
import { HbarAppUiButton, HbarAppUiSpotlight, HbarAppUiStatus } from '../../primitives'
import type { HbarAppUiApprovalRequestProps } from '../../decision-types'

/** All completion and failure states are confirmed by the owning host. */
export function HbarAppUiApprovalRequest({
  id,
  tool,
  summary,
  details,
  labels,
  state,
  onDecision,
}: HbarAppUiApprovalRequestProps) {
  const disabled = state.status !== 'idle'
  return (
    <HbarAppUiSpotlight
      as="section"
      className="hbar-app-ui-approval-request"
      aria-label={labels.title}
      aria-busy={state.status === 'pending'}
    >
      <header className="hbar-app-ui-approval-request-heading">
        <HbarAppUiIcon icon={ShieldCheck} />
        <div>
          <strong>{labels.title}</strong>
          <code>{tool}</code>
        </div>
        <HbarAppUiStatus
          value={
            state.status === 'complete'
              ? labels.completeLabel
              : state.status === 'pending'
                ? labels.savingLabel
                : labels.statusLabel
          }
          tone={state.status === 'complete' ? 'positive' : 'warning'}
        />
      </header>
      <div className="hbar-app-ui-approval-request-target">
        <strong>{summary}</strong>
        {details && (
          <LumenDisclosure summary={labels.detailsLabel}>
            <pre>{details}</pre>
          </LumenDisclosure>
        )}
      </div>
      {state.error && (
        <p className="hbar-app-ui-approval-request-feedback" role="alert">
          {state.error}
        </p>
      )}
      <footer className="hbar-app-ui-approval-request-actions">
        <HbarAppUiButton type="button" disabled={disabled} onClick={() => onDecision(id, 'deny')}>
          <HbarAppUiIcon icon={X} tier="sm" />
          {labels.denyLabel}
        </HbarAppUiButton>
        <HbarAppUiButton type="button" tone="accent" disabled={disabled} onClick={() => onDecision(id, 'allow')}>
          <HbarAppUiIcon icon={Check} tier="sm" />
          {labels.allowLabel}
        </HbarAppUiButton>
        {labels.allowAlwaysLabel && (
          <HbarAppUiButton
            type="button"
            tone="positive"
            disabled={disabled}
            onClick={() => onDecision(id, 'allow_always')}
          >
            <HbarAppUiIcon icon={ShieldCheck} tier="sm" />
            {labels.allowAlwaysLabel}
          </HbarAppUiButton>
        )}
      </footer>
    </HbarAppUiSpotlight>
  )
}
