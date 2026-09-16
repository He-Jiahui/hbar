import {Laptop} from 'lucide-react'
import {useMemo, useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import {type HbarAppUiAuthApprovalContent, uniqueHbarAppUiAuthItems} from './AuthContent'
import {AuthButton, AuthCard, AuthFrame, AuthIcon, AuthMetaRows} from './AuthPrimitives'

export function SignInApprovalAuthentication({spec, onAction, content}: HbarAppUiVariantProps & {
    readonly content: HbarAppUiAuthApprovalContent
}) {
    const [decision, setDecision] = useState<'pending' | 'approved' | 'denied'>('pending')
    const decide = (next: 'approved' | 'denied') => {
        setDecision(next);
        onAction?.({variantId: spec.id, actionId: next === 'approved' ? 'approve' : 'deny'})
    }
    const recent = useMemo(() => uniqueHbarAppUiAuthItems(content.recent), [content.recent])
    return <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-approval-surface">
        <div className="hbar-app-ui-auth-centered"><AuthCard
            className="hbar-app-ui-auth-check-card hbar-app-ui-auth-approval-card"><AuthIcon
            tier="lg"><Laptop/></AuthIcon><h1>{content.labels.title}</h1>
            <p>{content.labels.description(content.email)}</p><AuthMetaRows
                rows={[{label: content.labels.device, value: content.request.device}, {
                    label: content.labels.location,
                    value: content.request.location
                }, {
                    label: content.labels.ipAddress,
                    value: content.request.ipAddress
                }, {label: content.labels.requested, value: content.request.requested}, {
                    label: content.labels.expiry,
                    value: content.request.expiry
                }]}/>
            <div className="hbar-app-ui-auth-decision"><AuthButton type="button" tone="accent"
                                                                   disabled={decision !== 'pending'}
                                                                   onClick={() => decide('approved')}>{content.labels.approve}</AuthButton><AuthButton
                type="button" disabled={decision !== 'pending'}
                onClick={() => decide('denied')}>{content.labels.deny}</AuthButton></div>
            {decision !== 'pending' &&
                <p className="hbar-app-ui-auth-footer-note">{decision === 'approved' ? content.labels.approve : content.labels.deny}</p>}
        </AuthCard>
            <section
                className={`hbar-app-ui-auth-recent-list ${content.listStrategy.kind === 'pane-scroll' ? 'hbar-app-ui-auth-list-scroll' : ''}`}
                data-hbar-app-ui-list-strategy={content.listStrategy.kind}><span
                className="hbar-app-ui-auth-recent-heading">{content.labels.recent}</span>{recent.map((item) => <div
                className="hbar-app-ui-auth-recent-row" key={item.id}><AuthIcon><Laptop/></AuthIcon><span
                className="hbar-app-ui-auth-recent-copy"><strong>{item.device}</strong><small>{item.location}</small></span><small>{item.time}</small>
            </div>)}{!recent.length && <p className="hbar-app-ui-auth-empty">{content.labels.emptyRecentSignIns}</p>}
            </section>
        </div>
    </AuthFrame>
}
