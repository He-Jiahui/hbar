import {useState} from 'react'
import {DialogBackdrop, DialogButton, DialogCloseButton, DialogField, DialogFrame, reportDialogAction, type AppDialogProps} from './DialogPrimitives'

const projectMetrics = [
    ['1,204', 'Deployments'],
    ['38', 'Environment variables'],
    ['3', 'Custom domains'],
    ['11', 'Team members'],
] as const

export function DeleteProjectDialog({spec, onAction}: AppDialogProps): React.JSX.Element {
    const [open, setOpen] = useState(true)
    const [confirmation, setConfirmation] = useState('')
    const close = () => {
        setOpen(false)
        reportDialogAction(onAction, spec, 'close')
    }
    return <DialogFrame spec={spec} onAction={onAction} className="hbar-app-ui-dialog-variant-2">
        <button type="button" className={`hbar-app-ui-dialog-trigger ${open ? 'is-hidden' : ''}`} onClick={() => {
            setOpen(true)
            reportDialogAction(onAction, spec, 'open')
        }}>Delete project</button>
        {open && <DialogBackdrop>
            <section className="hbar-app-ui-dialog-panel hbar-app-ui-dialog-panel-delete" role="dialog" aria-modal="true" aria-labelledby={`${spec.id}-title`}>
                <header className="hbar-app-ui-dialog-header">
                    <div><h2 id={`${spec.id}-title`}>Delete atlas-production?</h2><p>This permanently removes the project and everything in it. It can't be undone.</p></div>
                    <DialogCloseButton onClose={close}/>
                </header>
                <div className="hbar-app-ui-dialog-content hbar-app-ui-dialog-delete-content">
                    <dl className="hbar-app-ui-dialog-metrics">
                        {projectMetrics.map(([value, label]) => <div key={label}><dd>{value}</dd><dt>{label}</dt></div>)}
                    </dl>
                    <div className="hbar-app-ui-dialog-delete-form">
                        <DialogField label={<>Type <strong>atlas-production</strong> to confirm</>}>
                            <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="atlas-production" aria-label="atlas-production"/>
                        </DialogField>
                    </div>
                </div>
                <footer className="hbar-app-ui-dialog-footer">
                    <DialogButton onClick={close}>Cancel</DialogButton>
                    <DialogButton tone="danger" onClick={() => {
                        setOpen(false)
                        reportDialogAction(onAction, spec, 'confirm', confirmation === 'atlas-production' ? 'delete' : 'delete-unverified')
                    }}>Delete project</DialogButton>
                </footer>
            </section>
        </DialogBackdrop>}
    </DialogFrame>
}
