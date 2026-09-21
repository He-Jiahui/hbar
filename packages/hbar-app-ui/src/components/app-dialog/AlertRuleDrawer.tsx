import { LumenButton, LumenInput, LumenTextarea, LumenSelect } from '@lumen/app-ui'
import {useState} from 'react'
import {DialogBackdrop, DialogButton, DialogCloseButton, DialogField, DialogFrame, reportDialogAction, type AppDialogProps} from './DialogPrimitives'

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
            <aside className="hbar-app-ui-side-panel hbar-app-ui-side-panel-alert" role="dialog" aria-modal="true" aria-labelledby={`${spec.id}-title`}>
                <header className="hbar-app-ui-side-panel-header"><h2 id={`${spec.id}-title`}>Edit alert rule</h2><DialogCloseButton onClose={close}/></header>
                <div className="hbar-app-ui-side-panel-body">
                    <div className="hbar-app-ui-side-readonly-field"><span>Rule name</span>
                        <div>Error rate spike</div>
                    </div>
                    <DialogField label="Deliver to"><LumenSelect defaultValue="Slack" aria-label="Deliver to">
                        <option>Email</option>
                        <option>Slack</option>
                        <option>PagerDuty</option>
                        <option>Webhook</option>
                    </LumenSelect></DialogField>
                    <DialogField label="Trigger threshold"><LumenInput defaultValue="5% / 5 min"
                                                                  aria-label="Trigger threshold"/></DialogField>
                    <DialogField label="Note"><LumenTextarea defaultValue="Page the on-call engineer when errors climb."
                                                        aria-label="Note"/></DialogField>
                    <label className="hbar-app-ui-side-toggle-row"><span><strong>Rule enabled</strong><small>Turn off to pause without deleting.</small></span>
                        <LumenButton type="button" role="switch" aria-checked={enabled} className={enabled ? 'is-on' : ''}
                                onClick={() => {
                                    setEnabled((current) => !current)
                                    reportDialogAction(onAction, spec, 'toggle', enabled ? 'disabled' : 'enabled')
                                }}><i/></LumenButton>
                    </label>
                </div>
                <footer className="hbar-app-ui-dialog-footer hbar-app-ui-side-panel-footer"><DialogButton onClick={close}>Cancel</DialogButton><DialogButton tone="accent" onClick={() => {
                    setOpen(false)
                    reportDialogAction(onAction, spec, 'save')
                }}>Save changes</DialogButton></footer>
            </aside>
        </DialogBackdrop>}
    </DialogFrame>
}
