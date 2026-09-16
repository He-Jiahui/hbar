import { HbarAppUiIcon } from '../../icon'
import {useState} from 'react'
import {ChevronDown} from 'lucide-react'
import {CommandBackdrop, CommandBack, CommandButton, CommandFrame, CommandShortcut, reportCommandAction, type CommandMenuProps, useCommandEscape} from './CommandPrimitives'

export function InviteCommandDialog({spec, onAction}: CommandMenuProps): React.JSX.Element {
    const [email, setEmail] = useState('erin.walsh@northwind.io')
    const [role, setRole] = useState('Editor')
    const [step, setStep] = useState(1)
    const [open, setOpen] = useState(true)
    const close = () => {
        setOpen(false)
        reportCommandAction(onAction, spec, 'close')
    }
    useCommandEscape(open, close)
    return <CommandFrame spec={spec} onAction={onAction} className="hbar-app-ui-command-variant-4">
        <button type="button" className="hbar-app-ui-command-trigger" onClick={() => {setOpen(true); reportCommandAction(onAction, spec, 'open')}}>Run an action</button>
        {open && <CommandBackdrop onClose={close}><section className="hbar-app-ui-command-dialog hbar-app-ui-command-dialog-form" role="dialog" aria-modal="true" aria-label="Invite a teammate">
            <header className="hbar-app-ui-command-form-header"><CommandBack onClick={() => reportCommandAction(onAction, spec, 'back')}/><div><h2>Invite a teammate</h2><span>Step {step} of 2</span></div></header>
            <div className="hbar-app-ui-command-form-body"><label>Email address<input value={email} onChange={(event) => setEmail(event.target.value)} type="email"/></label><label>Role<div className="hbar-app-ui-command-select"><select value={role} onChange={(event) => setRole(event.target.value)}><option>Viewer</option><option>Editor</option><option>Admin</option></select><HbarAppUiIcon icon={ChevronDown} tier="sm" /></div></label></div>
            <footer className="hbar-app-ui-command-footer hbar-app-ui-command-form-footer"><span className="hbar-app-ui-command-footer-shortcuts"><CommandShortcut keys="↵" label="to review"/><CommandShortcut keys="esc" label="to close"/></span><CommandButton tone="accent" onClick={() => {setStep(2); reportCommandAction(onAction, spec, 'review', `${email}:${role}`)}}>Review</CommandButton></footer>
        </section></CommandBackdrop>}
    </CommandFrame>
}
