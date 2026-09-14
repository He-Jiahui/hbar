import {useState} from 'react'
import {DialogBackdrop, DialogButton, DialogCloseButton, DialogField, DialogFrame, reportDialogAction, type AppDialogProps} from './DialogPrimitives'

export function WorkspaceWizardDialog({spec, onAction}: AppDialogProps): React.JSX.Element {
    const [open, setOpen] = useState(true)
    const [step, setStep] = useState(1)
    const close = () => {
        setOpen(false)
        reportDialogAction(onAction, spec, 'close')
    }
    const continueStep = () => {
        if (step === 3) {
            setOpen(false)
            reportDialogAction(onAction, spec, 'confirm', 'workspace')
            return
        }
        setStep((current) => current + 1)
        reportDialogAction(onAction, spec, 'next', String(step + 1))
    }
    return <DialogFrame spec={spec} onAction={onAction} className="hbar-app-ui-dialog-variant-4">
        <button type="button" className={`hbar-app-ui-dialog-trigger ${open ? 'is-hidden' : ''}`} onClick={() => {
            setOpen(true)
            reportDialogAction(onAction, spec, 'open')
        }}>New workspace</button>
        {open && <DialogBackdrop>
            <section className="hbar-app-ui-dialog-panel hbar-app-ui-dialog-panel-wizard" role="dialog" aria-modal="true" aria-labelledby={`${spec.id}-title`}>
                <header className="hbar-app-ui-dialog-header">
                    <div><p className="hbar-app-ui-dialog-step">Step {step} of 3</p><h2 id={`${spec.id}-title`}>{step === 1 ? 'Workspace' : step === 2 ? 'Environment' : 'Review'}</h2></div>
                    <DialogCloseButton onClose={close}/>
                </header>
                <div className="hbar-app-ui-dialog-content hbar-app-ui-dialog-wizard-content">
                    <div className="hbar-app-ui-dialog-progress" aria-label={`Step ${step} of 3`}>{[1, 2, 3].map((part) => <span className={part <= step ? 'is-active' : ''} key={part}/>)}</div>
                    {step === 1 && <div className="hbar-app-ui-dialog-wizard-body">
                        <DialogField label="Workspace name"><input defaultValue="Northwind" aria-label="Workspace name"/></DialogField>
                        <div className="hbar-app-ui-dialog-readonly-field"><span>Workspace URL</span><div><span>northwind.app/</span><strong>northwind</strong></div><small>You can change this later in settings.</small></div>
                    </div>}
                    {step === 2 && <div className="hbar-app-ui-dialog-wizard-body"><DialogField label="Default environment"><select defaultValue="Production" aria-label="Default environment"><option>Production</option><option>Staging</option><option>Development</option></select></DialogField><p className="hbar-app-ui-dialog-note">You can add more environments later.</p></div>}
                    {step === 3 && <div className="hbar-app-ui-dialog-wizard-body"><p className="hbar-app-ui-dialog-review-line"><span>Workspace</span><strong>Northwind</strong></p><p className="hbar-app-ui-dialog-review-line"><span>URL</span><strong>northwind.app/northwind</strong></p></div>}
                </div>
                <footer className="hbar-app-ui-dialog-footer">
                    <DialogButton onClick={close}>Cancel</DialogButton>
                    <DialogButton tone="accent" onClick={continueStep}>{step === 3 ? 'Create workspace' : 'Continue'}</DialogButton>
                </footer>
            </section>
        </DialogBackdrop>}
    </DialogFrame>
}
