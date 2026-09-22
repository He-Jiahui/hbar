import {
  LumenFrame,
  LumenOption,
  LumenText,
 LumenButton, LumenInput, LumenTextarea, LumenSelect, LumenToggleControl } from '@lumen/app-ui'
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

export function AlertRuleDrawer({spec, onAction}: AppDialogProps): React.JSX.Element {
    const [open, setOpen] = useState(true)
    const [enabled, setEnabled] = useState(true)
    const close = () => {
        setOpen(false)
        reportDialogAction(onAction, spec, 'close')
    }
    return <DialogFrame spec={spec} onAction={onAction} className="hbar-app-ui-dialog-variant-5">
        <LumenButton type="button"
                className={`hbar-app-ui-dialog-trigger hbar-app-ui-side-trigger ${open ? 'is-hidden' : ''}`}
                onClick={() => {
                    setOpen(true)
                    reportDialogAction(onAction, spec, 'open')
                }}>Edit alert rule
        </LumenButton>
        {open && <DialogBackdrop className="hbar-app-ui-dialog-side-backdrop">
            <LumenFrame as="aside" className="hbar-app-ui-side-panel hbar-app-ui-side-panel-alert" role="dialog" aria-modal="true"
                   aria-labelledby={`${spec.id}-title`}>
                <LumenFrame as="header" className="hbar-app-ui-side-panel-header"><LumenText as="h2" id={`${spec.id}-title`}>Edit alert rule</LumenText>
                    <DialogCloseButton onClose={close}/></LumenFrame>
                <LumenFrame className="hbar-app-ui-side-panel-body">
                    <LumenFrame className="hbar-app-ui-side-readonly-field"><LumenText as="span">Rule name</LumenText>
                        <LumenFrame>Error rate spike</LumenFrame>
                    </LumenFrame>
                    <DialogField label="Deliver to"><LumenSelect defaultValue="Slack" aria-label="Deliver to">
                        <LumenOption>Email</LumenOption>
                        <LumenOption>Slack</LumenOption>
                        <LumenOption>PagerDuty</LumenOption>
                        <LumenOption>Webhook</LumenOption>
                    </LumenSelect></DialogField>
                    <DialogField label="Trigger threshold"><LumenInput defaultValue="5% / 5 min"
                                                                  aria-label="Trigger threshold"/></DialogField>
                    <DialogField label="Note"><LumenTextarea defaultValue="Page the on-call engineer when errors climb."
                                                        aria-label="Note"/></DialogField>
                    <LumenFrame as="label" className="hbar-app-ui-side-toggle-row"><LumenText as="span"><LumenText as="strong">Rule enabled</LumenText><LumenText as="small">Turn off to pause without deleting.</LumenText></LumenText>
                        <LumenToggleControl checked={enabled} aria-label="Rule enabled"
                                onChange={(event) => {
                                    const next = event.currentTarget.checked
                                    setEnabled(next)
                                    reportDialogAction(onAction, spec, 'toggle', next ? 'enabled' : 'disabled')
                                }}/>
                    </LumenFrame>
                </LumenFrame>
                <LumenFrame as="footer" className="hbar-app-ui-dialog-footer hbar-app-ui-side-panel-footer"><DialogButton
                    onClick={close}>Cancel</DialogButton><DialogButton tone="accent" onClick={() => {
                    setOpen(false)
                    reportDialogAction(onAction, spec, 'save')
                }}>Save changes</DialogButton></LumenFrame>
            </LumenFrame>
        </DialogBackdrop>}
    </DialogFrame>
}
