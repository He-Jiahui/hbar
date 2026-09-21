import {
  LumenFrame,
  LumenOption,
  LumenText,
 LumenButton, LumenInput, LumenSelect } from '@lumen/app-ui'
import {useState} from 'react'
import {
    type AppDialogProps,
    DialogBackdrop,
    DialogButton,
    DialogCloseButton,
    DialogField,
    DialogFrame,
    reportDialogAction
} from './DialogPrimitives'

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
        <LumenButton type="button" className={`hbar-app-ui-dialog-trigger ${open ? 'is-hidden' : ''}`} onClick={() => {
            setOpen(true)
            reportDialogAction(onAction, spec, 'open')
        }}>New workspace
        </LumenButton>
        {open && <DialogBackdrop>
            <LumenFrame as="section" className="hbar-app-ui-dialog-panel hbar-app-ui-dialog-panel-wizard" role="dialog"
                     aria-modal="true" aria-labelledby={`${spec.id}-title`}>
                <LumenFrame as="header" className="hbar-app-ui-dialog-header">
                    <LumenFrame><LumenText as="p" className="hbar-app-ui-dialog-step">Step {step} of 3</LumenText><LumenText as="h2"
                        id={`${spec.id}-title`}>{step === 1 ? 'Workspace' : step === 2 ? 'Environment' : 'Review'}</LumenText>
                    </LumenFrame>
                    <DialogCloseButton onClose={close}/>
                </LumenFrame>
                <LumenFrame className="hbar-app-ui-dialog-content hbar-app-ui-dialog-wizard-content">
                    <LumenFrame className="hbar-app-ui-dialog-progress"
                         aria-label={`Step ${step} of 3`}>{[1, 2, 3].map((part) => <LumenText as="span"
                        className={part <= step ? 'is-active' : ''} key={part}/>)}</LumenFrame>
                    {step === 1 && <LumenFrame className="hbar-app-ui-dialog-wizard-body">
                        <DialogField label="Workspace name"><LumenInput defaultValue="Northwind"
                                                                   aria-label="Workspace name"/></DialogField>
                        <LumenFrame className="hbar-app-ui-dialog-readonly-field"><LumenText as="span">Workspace URL</LumenText>
                            <LumenFrame><LumenText as="span">northwind.app/</LumenText><LumenText as="strong">northwind</LumenText></LumenFrame>
                            <LumenText as="small">You can change this later in settings.</LumenText></LumenFrame>
                    </LumenFrame>}
                    {step === 2 &&
                        <LumenFrame className="hbar-app-ui-dialog-wizard-body"><DialogField label="Default environment"><LumenSelect
                            defaultValue="Production" aria-label="Default environment">
                            <LumenOption>Production</LumenOption>
                            <LumenOption>Staging</LumenOption>
                            <LumenOption>Development</LumenOption>
                        </LumenSelect></DialogField><LumenText as="p" className="hbar-app-ui-dialog-note">You can add more environments
                            later.</LumenText></LumenFrame>}
                    {step === 3 &&
                        <LumenFrame className="hbar-app-ui-dialog-wizard-body"><LumenText as="p" className="hbar-app-ui-dialog-review-line">
                            <LumenText as="span">Workspace</LumenText><LumenText as="strong">Northwind</LumenText></LumenText><LumenText as="p"
                            className="hbar-app-ui-dialog-review-line">
                            <LumenText as="span">URL</LumenText><LumenText as="strong">northwind.app/northwind</LumenText></LumenText></LumenFrame>}
                </LumenFrame>
                <LumenFrame as="footer" className="hbar-app-ui-dialog-footer">
                    <DialogButton onClick={close}>Cancel</DialogButton>
                    <DialogButton tone="accent"
                                  onClick={continueStep}>{step === 3 ? 'Create workspace' : 'Continue'}</DialogButton>
                </LumenFrame>
            </LumenFrame>
        </DialogBackdrop>}
    </DialogFrame>
}
