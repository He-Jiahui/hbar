import {Check, LoaderCircle, ShieldCheck, X} from 'lucide-react'
import {useState} from 'react'
import {HbarAppUiButton, HbarAppUiSpotlight, HbarAppUiStatus} from '../primitives'
import type {HbarAppUiApprovalDecision, HbarAppUiApprovalRequestProps} from '../types'

function failureMessage(cause: unknown): string {
    return cause instanceof Error && cause.message ? cause.message : 'Unable to save the approval decision.'
}

/**
 * Product-neutral approval surface with locally owned pending, completion and
 * failure feedback. The host supplies the real decision operation.
 */
export function HbarAppUiApprovalRequest({
    tool,
    summary,
    onDecision,
    title = 'Approval required',
    details,
    detailsLabel = 'Review details',
    statusLabel = 'Decision required',
    denyLabel = 'Deny',
    allowLabel = 'Allow',
    allowAlwaysLabel,
    savingLabel = 'Saving decision',
    completeLabel = 'Decision saved'
}: HbarAppUiApprovalRequestProps) {
    const [pendingDecision, setPendingDecision] = useState<HbarAppUiApprovalDecision | undefined>()
    const [completedDecision, setCompletedDecision] = useState<HbarAppUiApprovalDecision | undefined>()
    const [error, setError] = useState<string | undefined>()
    const disabled = pendingDecision !== undefined || completedDecision !== undefined

    async function decide(decision: HbarAppUiApprovalDecision) {
        if (disabled) return
        setError(undefined)
        setPendingDecision(decision)
        try {
            await onDecision(decision)
            setCompletedDecision(decision)
        } catch (cause) {
            setError(failureMessage(cause))
        } finally {
            setPendingDecision(undefined)
        }
    }

    return <HbarAppUiSpotlight as="section" className="hbar-app-ui-approval-request" aria-label={title}
                               aria-busy={pendingDecision !== undefined}>
        <header className="hbar-app-ui-approval-request-heading">
            <ShieldCheck size={16}/>
            <div><strong>{title}</strong><code>{tool}</code></div>
            <HbarAppUiStatus value={completedDecision ? completeLabel : pendingDecision ? savingLabel : statusLabel}
                             tone={completedDecision ? 'positive' : pendingDecision ? 'warning' : 'warning'}/>
        </header>
        <div className="hbar-app-ui-approval-request-target">
            <strong>{summary}</strong>
            {details && <details>
                <summary>{detailsLabel}</summary>
                <pre>{details}</pre>
            </details>}
        </div>
        {error && <p className="hbar-app-ui-approval-request-feedback" role="alert">{error}</p>}
        <footer className="hbar-app-ui-approval-request-actions">
            <HbarAppUiButton type="button" disabled={disabled} onClick={() => void decide('deny')}><X
                size={14}/>{pendingDecision === 'deny' ? <LoaderCircle size={13} className="hbar-app-ui-spin"/> : denyLabel}</HbarAppUiButton>
            <HbarAppUiButton type="button" tone="accent" disabled={disabled} onClick={() => void decide('allow')}><Check
                size={14}/>{pendingDecision === 'allow' ? <LoaderCircle size={13} className="hbar-app-ui-spin"/> : allowLabel}</HbarAppUiButton>
            {allowAlwaysLabel && <HbarAppUiButton type="button" tone="positive" disabled={disabled}
                                                   onClick={() => void decide('allow_always')}><ShieldCheck
                size={14}/>{pendingDecision === 'allow_always' ? <LoaderCircle size={13}
                                                                                 className="hbar-app-ui-spin"/> : allowAlwaysLabel}</HbarAppUiButton>}
        </footer>
    </HbarAppUiSpotlight>
}
