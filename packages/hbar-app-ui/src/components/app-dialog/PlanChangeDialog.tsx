import { LumenButton } from '@lumen/app-ui'
import {useState} from 'react'
import {DialogBackdrop, DialogButton, DialogCloseButton, DialogFrame, reportDialogAction, type AppDialogProps} from './DialogPrimitives'

type PlanRow = {
    readonly label: string
    readonly from: string
    readonly to: string
}

const planRows: readonly PlanRow[] = [
    {label: 'Plan', from: 'Team', to: 'Scale'},
    {label: 'Seats', from: '24', to: '40'},
    {label: 'Monthly total', from: '$1,440.00', to: '$2,600.00'},
    {label: 'Support', from: 'Business hours', to: '24/7 priority'},
    {label: 'Audit log retention', from: '30 days', to: '1 year'},
]

export function PlanChangeDialog({spec, onAction}: AppDialogProps): React.JSX.Element {
    const [open, setOpen] = useState(true)
    const close = () => {
        setOpen(false)
        reportDialogAction(onAction, spec, 'close')
    }
    return <DialogFrame spec={spec} onAction={onAction} className="hbar-app-ui-dialog-variant-1">
        <LumenButton type="button" className={`hbar-app-ui-dialog-trigger ${open ? 'is-hidden' : ''}`} onClick={() => {
            setOpen(true)
            reportDialogAction(onAction, spec, 'open')
        }}>Change plan
        </LumenButton>
        {open && <DialogBackdrop>
            <section className="hbar-app-ui-dialog-panel hbar-app-ui-dialog-panel-plan" role="dialog" aria-modal="true" aria-labelledby={`${spec.id}-title`}>
                <header className="hbar-app-ui-dialog-header">
                    <div><h2 id={`${spec.id}-title`}>Apply plan change</h2><p>Your workspace moves to the Scale plan at the next renewal on Jul 1. Nothing is charged today.</p></div>
                    <DialogCloseButton onClose={close}/>
                </header>
                <div className="hbar-app-ui-dialog-content hbar-app-ui-dialog-plan-content">
                    <dl className="hbar-app-ui-dialog-plan-rows">
                        {planRows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd><s>{row.from}</s><span aria-hidden="true">→</span><strong>{row.to}</strong></dd></div>)}
                    </dl>
                </div>
                <footer className="hbar-app-ui-dialog-footer">
                    <DialogButton onClick={close}>Cancel</DialogButton>
                    <DialogButton tone="accent" onClick={() => {
                        setOpen(false)
                        reportDialogAction(onAction, spec, 'confirm', 'plan-change')
                    }}>Apply change</DialogButton>
                </footer>
            </section>
        </DialogBackdrop>}
    </DialogFrame>
}
