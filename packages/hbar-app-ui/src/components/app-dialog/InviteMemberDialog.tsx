import { LumenButton, LumenInput, LumenSelect } from '@lumen/app-ui'
import {useState} from 'react'
import {DialogBackdrop, DialogButton, DialogCloseButton, DialogField, DialogFrame, reportDialogAction, type AppDialogProps} from './DialogPrimitives'

export function InviteMemberDialog({spec, onAction}: AppDialogProps): React.JSX.Element {
    const [open, setOpen] = useState(true)
    const close = () => {
        setOpen(false)
        reportDialogAction(onAction, spec, 'close')
    }
    return <DialogFrame spec={spec} onAction={onAction} className="hbar-app-ui-dialog-variant-3">
        <LumenButton type="button" className={`hbar-app-ui-dialog-trigger ${open ? 'is-hidden' : ''}`} onClick={() => {
            setOpen(true)
            reportDialogAction(onAction, spec, 'open')
        }}>Invite member
        </LumenButton>
        {open && <DialogBackdrop>
            <section className="hbar-app-ui-dialog-panel hbar-app-ui-dialog-panel-invite" role="dialog" aria-modal="true" aria-labelledby={`${spec.id}-title`}>
                <header className="hbar-app-ui-dialog-header">
                    <div><h2 id={`${spec.id}-title`}>Invite a member</h2><p>They'll get an email invite to join the Northwind workspace.</p></div>
                    <DialogCloseButton onClose={close}/>
                </header>
                <div className="hbar-app-ui-dialog-content hbar-app-ui-dialog-form-body">
                    <DialogField label="Full name"><LumenInput placeholder="Jordan Ellis"
                                                          aria-label="Full name"/></DialogField>
                    <DialogField label="Work email" hint="Invites expire after 7 days."><LumenInput type="email"
                                                                                               placeholder="name@northwind.io"
                                                                                               aria-label="Work email"/></DialogField>
                    <DialogField label="Role" hint="Editors can change content but not billing.">
                        <LumenSelect defaultValue="Editor" aria-label="Role">
                            <option>Admin</option>
                            <option>Editor</option>
                            <option>Viewer</option>
                            <option>Billing</option>
                        </LumenSelect>
                    </DialogField>
                </div>
                <footer className="hbar-app-ui-dialog-footer">
                    <DialogButton onClick={close}>Cancel</DialogButton>
                    <DialogButton tone="accent" onClick={() => {
                        setOpen(false)
                        reportDialogAction(onAction, spec, 'confirm', 'invite')
                    }}>Send invite</DialogButton>
                </footer>
            </section>
        </DialogBackdrop>}
    </DialogFrame>
}
