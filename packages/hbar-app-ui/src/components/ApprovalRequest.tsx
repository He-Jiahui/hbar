import {Check, LoaderCircle, ShieldCheck, X} from 'lucide-react'
import {useState} from 'react'
import {HbarAppUiButton, HbarAppUiSpotlight, HbarAppUiStatus} from '../primitives'
import type {
    HbarAppUiApprovalDecision,
    HbarAppUiApprovalRequestProps,
    HbarAppUiFailureMessage,
} from '../types'

function failureMessage(cause: unknown, localized: HbarAppUiFailureMessage | undefined): string {
    if (typeof localized === 'function') return localized(cause)
    if (typeof localized === 'string') return localized
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
    labels,
    title,
    details,
    detailsLabel,
    statusLabel,
    denyLabel,
    allowLabel,
    allowAlwaysLabel,
    savingLabel,
    completeLabel
}: HbarAppUiApprovalRequestProps) {
    const resolvedTitle = title ?? labels?.title ?? 'Approval required'
    const resolvedDetailsLabel = detailsLabel ?? labels?.detailsLabel ?? 'Review details'
    const resolvedStatusLabel = statusLabel ?? labels?.statusLabel ?? 'Decision required'
    const resolvedDenyLabel = denyLabel ?? labels?.denyLabel ?? 'Deny'
    const resolvedAllowLabel = allowLabel ?? labels?.allowLabel ?? 'Allow'
    const resolvedAllowAlwaysLabel = allowAlwaysLabel ?? labels?.allowAlwaysLabel
    const resolvedSavingLabel = savingLabel ?? labels?.savingLabel ?? 'Saving decision'
    const resolvedCompleteLabel = completeLabel ?? labels?.completeLabel ?? 'Decision saved'
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
            setError(failureMessage(cause, labels?.failureMessage))
        } finally {
            setPendingDecision(undefined)
        }
    }

    return <HbarAppUiSpotlight as="section" className="hbar-app-ui-approval-request" aria-label={resolvedTitle}
                               aria-busy={pendingDecision !== undefined}>
        <header className="hbar-app-ui-approval-request-heading">
            <ShieldCheck size={16}/>
            <div><strong>{resolvedTitle}</strong><code>{tool}</code></div>
            <HbarAppUiStatus value={completedDecision ? resolvedCompleteLabel : pendingDecision ? resolvedSavingLabel : resolvedStatusLabel}
                             tone={completedDecision ? 'positive' : pendingDecision ? 'warning' : 'warning'}/>
        </header>
        <div className="hbar-app-ui-approval-request-target">
            <strong>{summary}</strong>
            {details && <details>
                <summary>{resolvedDetailsLabel}</summary>
                <pre>{details}</pre>
            </details>}
        </div>
        {error && <p className="hbar-app-ui-approval-request-feedback" role="alert">{error}</p>}
        <footer className="hbar-app-ui-approval-request-actions">
            <HbarAppUiButton type="button" disabled={disabled} onClick={() => void decide('deny')}><X
                size={14}/>{pendingDecision === 'deny' ? <LoaderCircle size={13} className="hbar-app-ui-spin"/> : resolvedDenyLabel}</HbarAppUiButton>
            <HbarAppUiButton type="button" tone="accent" disabled={disabled} onClick={() => void decide('allow')}><Check
                size={14}/>{pendingDecision === 'allow' ? <LoaderCircle size={13} className="hbar-app-ui-spin"/> : resolvedAllowLabel}</HbarAppUiButton>
            {resolvedAllowAlwaysLabel && <HbarAppUiButton type="button" tone="positive" disabled={disabled}
                                                   onClick={() => void decide('allow_always')}><ShieldCheck
                size={14}/>{pendingDecision === 'allow_always' ? <LoaderCircle size={13}
                                                                                 className="hbar-app-ui-spin"/> : resolvedAllowAlwaysLabel}</HbarAppUiButton>}
        </footer>
    </HbarAppUiSpotlight>
}
