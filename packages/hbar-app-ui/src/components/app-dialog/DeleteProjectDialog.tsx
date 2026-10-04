import {
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenText,
 LumenButton, LumenInput } from '@lumen/app-ui'
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
        <LumenButton type="button" className={`hbar-app-ui-dialog-trigger ${open ? 'is-hidden' : ''}`} onClick={() => {
            setOpen(true)
            reportDialogAction(onAction, spec, 'open')
        }}>Delete project
        </LumenButton>
        {open && <DialogBackdrop>
            <LumenFrame as="section" className="hbar-app-ui-dialog-panel hbar-app-ui-dialog-panel-delete" role="dialog"
                     aria-modal="true" aria-labelledby={`${spec.id}-title`}>
                <LumenFrame as="header" className="hbar-app-ui-dialog-header">
                    <LumenFrame><LumenText as="h2" id={`${spec.id}-title`}>Delete atlas-production?</LumenText><LumenText as="p">This permanently removes the
                        project and everything in it. It can't be undone.</LumenText></LumenFrame>
                    <DialogCloseButton onClose={close}/>
                </LumenFrame>
                <LumenFrame className="hbar-app-ui-dialog-content hbar-app-ui-dialog-delete-content">
                    <LumenCollection as="dl" className="hbar-app-ui-dialog-metrics">
                        {projectMetrics.map(([value, label]) => <LumenFrame key={label}>
                            <LumenCollectionItem as="dd">{value}</LumenCollectionItem>
                            <LumenCollectionItem as="dt">{label}</LumenCollectionItem>
                        </LumenFrame>)}
                    </LumenCollection>
                    <LumenFrame className="hbar-app-ui-dialog-delete-form">
                        <DialogField label={<>Type <LumenText as="strong">atlas-production</LumenText> to confirm</>}>
                            <LumenInput value={confirmation} onChange={(event) => setConfirmation(event.target.value)}
                                   placeholder="atlas-production" aria-label="atlas-production"/>
                        </DialogField>
                    </LumenFrame>
                </LumenFrame>
                <LumenFrame as="footer" className="hbar-app-ui-dialog-footer">
                    <DialogButton onClick={close}>Cancel</DialogButton>
                    <DialogButton tone="danger" onClick={() => {
                        setOpen(false)
                        reportDialogAction(onAction, spec, 'confirm', confirmation === 'atlas-production' ? 'delete' : 'delete-unverified')
                    }}>Delete project</DialogButton>
                </LumenFrame>
            </LumenFrame>
        </DialogBackdrop>}
    </DialogFrame>
}
