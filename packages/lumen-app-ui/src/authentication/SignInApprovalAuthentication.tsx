import { Check, Laptop as ReferenceLaptop, MapPin, ShieldAlert, X } from 'lucide-react'
import { LumenButton } from '../primitives'
import { Laptop } from './glyphs'
import { useMemo, useState } from 'react'
import { type LumenAuthCompositionProps, AuthButton, AuthCard, AuthFrame, AuthIcon, AuthMetaRows } from './primitives'
import { type LumenAuthApprovalContent, uniqueLumenAuthItems } from './content'

export function SignInApprovalAuthentication(
  props: LumenAuthCompositionProps & {
    readonly content: LumenAuthApprovalContent
  },
) {
  return props.content.referenceFlow ? (
    <ReferenceSignInApprovalAuthentication {...props} />
  ) : (
    <LegacySignInApprovalAuthentication {...props} />
  )
}

function ReferenceSignInApprovalAuthentication({
  spec,
  onAction,
  content,
}: LumenAuthCompositionProps & { readonly content: LumenAuthApprovalContent }) {
  const flow = content.referenceFlow
  if (!flow) return null
  const recent = uniqueLumenAuthItems(content.recent)
  const rows = [
    { label: content.labels.device, value: content.request.device },
    { label: content.labels.location, value: content.request.location },
    { label: content.labels.ipAddress, value: content.request.ipAddress },
    { label: content.labels.requested, value: content.request.requested },
  ]
  return (
    <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-approval-reference">
      <div className="hbar-app-ui-auth-centered hbar-app-ui-full-canvas-owner">
        <AuthCard className="hbar-app-ui-auth-approval-reference-card">
          {flow.phase === 'pending' ? (
            <>
              <span className="hbar-app-ui-auth-approval-reference-emblem">
                <AuthIcon tier="md">
                  <ReferenceLaptop />
                </AuthIcon>
              </span>
              <h1>{content.labels.title}</h1>
              <p className="hbar-app-ui-auth-approval-reference-description">
                {flow.labels.descriptionBeforeEmail}
                <span className="is-emphasized">{content.email}</span>
                {flow.labels.descriptionAfterEmail}
              </p>
              <div className="hbar-app-ui-auth-approval-reference-request">
                {rows.map((row, index) => (
                  <div key={row.label}>
                    <span className={index === 2 ? 'is-ip-address' : ''}>{row.label}</span>
                    <span className={index === 2 ? 'is-ip-value' : ''}>{row.value}</span>
                  </div>
                ))}
              </div>
              <p className="hbar-app-ui-auth-approval-reference-expiry">{content.request.expiry}</p>
              <div className="hbar-app-ui-auth-approval-reference-actions">
                <LumenButton
                  type="button"
                  indicator="none"
                  onClick={() => {
                    flow.onApprove()
                    onAction?.({ variantId: spec.id, actionId: 'approve' })
                  }}
                >
                  {content.labels.approve}
                </LumenButton>
                <LumenButton
                  type="button"
                  indicator="none"
                  onClick={() => {
                    flow.onDeny()
                    onAction?.({ variantId: spec.id, actionId: 'deny' })
                  }}
                >
                  {content.labels.deny}
                </LumenButton>
              </div>
            </>
          ) : flow.phase === 'approved' ? (
            <>
              <span className="hbar-app-ui-auth-approval-reference-result-icon">
                <AuthIcon tier="xl">
                  <Check />
                </AuthIcon>
              </span>
              <h1>{flow.labels.approvedTitle}</h1>
              <p className="hbar-app-ui-auth-approval-reference-description">{flow.labels.approvedDescription}</p>
              <LumenButton
                type="button"
                indicator="none"
                className="hbar-app-ui-auth-approval-reference-back"
                onClick={flow.onBack}
              >
                {flow.labels.backToRequest}
              </LumenButton>
            </>
          ) : (
            <>
              <span className="hbar-app-ui-auth-approval-reference-result-icon is-blocked">
                <AuthIcon tier="xl">
                  <ShieldAlert />
                </AuthIcon>
              </span>
              <h1>{flow.labels.blockedTitle}</h1>
              <p className="hbar-app-ui-auth-approval-reference-description">{flow.labels.blockedDescription}</p>
              <ol className="hbar-app-ui-auth-approval-reference-steps">
                {flow.labels.blockedSteps.map((step, index) => (
                  <li key={step}>
                    <span aria-hidden="true">{index + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
              <div className="hbar-app-ui-auth-approval-reference-actions">
                <LumenButton type="button" indicator="none" onClick={flow.onChangePassword}>
                  {flow.labels.changePassword}
                </LumenButton>
                <LumenButton type="button" indicator="none" onClick={flow.onBack}>
                  {flow.labels.backToRequest}
                </LumenButton>
              </div>
            </>
          )}
        </AuthCard>
        <section
          className="hbar-app-ui-auth-recent-list hbar-app-ui-auth-approval-reference-recent"
          data-hbar-app-ui-list-strategy={content.listStrategy.kind}
        >
          <p>{content.labels.recent}</p>
          <ul>
            {recent.map((item) => (
              <li className="hbar-app-ui-auth-recent-row" key={item.id}>
                <span
                  className={`hbar-app-ui-auth-approval-reference-dot ${item.attention ? 'is-attention' : ''}`}
                  aria-hidden="true"
                />
                <span className="hbar-app-ui-auth-approval-reference-device">{item.device}</span>
                <span className="hbar-app-ui-auth-approval-reference-location">
                  <AuthIcon tier="xs">{item.attention ? <X /> : <MapPin />}</AuthIcon>
                  {item.location}
                </span>
                <small>{item.time}</small>
              </li>
            ))}
          </ul>
          {!recent.length && <p className="hbar-app-ui-auth-empty">{content.labels.emptyRecentSignIns}</p>}
        </section>
      </div>
    </AuthFrame>
  )
}

function LegacySignInApprovalAuthentication({
  spec,
  onAction,
  content,
}: LumenAuthCompositionProps & {
  readonly content: LumenAuthApprovalContent
}) {
  const [decision, setDecision] = useState<'pending' | 'approved' | 'denied'>('pending')
  const decide = (next: 'approved' | 'denied') => {
    setDecision(next)
    onAction?.({ variantId: spec.id, actionId: next === 'approved' ? 'approve' : 'deny' })
  }
  const recent = useMemo(() => uniqueLumenAuthItems(content.recent), [content.recent])
  return (
    <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-approval-surface">
      <div className="hbar-app-ui-auth-centered">
        <AuthCard className="hbar-app-ui-auth-check-card hbar-app-ui-auth-approval-card">
          <AuthIcon tier="lg">
            <Laptop />
          </AuthIcon>
          <h1>{content.labels.title}</h1>
          <p>{content.labels.description(content.email)}</p>
          <AuthMetaRows
            rows={[
              { label: content.labels.device, value: content.request.device },
              {
                label: content.labels.location,
                value: content.request.location,
              },
              {
                label: content.labels.ipAddress,
                value: content.request.ipAddress,
              },
              { label: content.labels.requested, value: content.request.requested },
              {
                label: content.labels.expiry,
                value: content.request.expiry,
              },
            ]}
          />
          <div className="hbar-app-ui-auth-decision">
            <AuthButton
              type="button"
              tone="accent"
              disabled={decision !== 'pending'}
              onClick={() => decide('approved')}
            >
              {content.labels.approve}
            </AuthButton>
            <AuthButton type="button" disabled={decision !== 'pending'} onClick={() => decide('denied')}>
              {content.labels.deny}
            </AuthButton>
          </div>
          {decision !== 'pending' && (
            <p className="hbar-app-ui-auth-footer-note">
              {decision === 'approved' ? content.labels.approve : content.labels.deny}
            </p>
          )}
        </AuthCard>
        <section
          className={`hbar-app-ui-auth-recent-list ${content.listStrategy.kind === 'pane-scroll' ? 'hbar-app-ui-auth-list-scroll' : ''}`}
          data-hbar-app-ui-list-strategy={content.listStrategy.kind}
        >
          <span className="hbar-app-ui-auth-recent-heading">{content.labels.recent}</span>
          {recent.map((item) => (
            <div className="hbar-app-ui-auth-recent-row" key={item.id}>
              <AuthIcon>
                <Laptop />
              </AuthIcon>
              <span className="hbar-app-ui-auth-recent-copy">
                <strong>{item.device}</strong>
                <small>{item.location}</small>
              </span>
              <small>{item.time}</small>
            </div>
          ))}
          {!recent.length && <p className="hbar-app-ui-auth-empty">{content.labels.emptyRecentSignIns}</p>}
        </section>
      </div>
    </AuthFrame>
  )
}
;('use client')
