import { HbarAppUiIcon } from '../../icon'
import {useState} from 'react'
import {Archive, Download} from 'lucide-react'
import {DialogBackdrop, DialogButton, DialogCloseButton, DialogFrame, reportDialogAction, type AppDialogProps} from './DialogPrimitives'

const evidenceDetails = [
    ['Owner', 'Priya Raman'],
    ['File', 'PDF · 4.2 MB'],
    ['Updated', 'Jun 18, 2024'],
    ['Source', 'Vanta'],
    ['Retention', '7 years'],
] as const

const controls = [
    ['AC-2', 'Account management'],
    ['CC6.1', 'Logical access controls'],
    ['CC7.2', 'Security monitoring'],
    ['A1.2', 'Availability commitments'],
] as const

export function EvidenceDetailsPanel({spec, onAction}: AppDialogProps): React.JSX.Element {
    const [open, setOpen] = useState(true)
    const close = () => {
        setOpen(false)
        reportDialogAction(onAction, spec, 'close')
    }
    return <DialogFrame spec={spec} onAction={onAction} className="hbar-app-ui-dialog-variant-6">
        <button type="button" className={`hbar-app-ui-dialog-trigger hbar-app-ui-side-trigger ${open ? 'is-hidden' : ''}`} onClick={() => {
            setOpen(true)
            reportDialogAction(onAction, spec, 'open')
        }}>View evidence details</button>
        {open && <DialogBackdrop className="hbar-app-ui-dialog-side-backdrop">
            <aside className="hbar-app-ui-side-panel hbar-app-ui-side-panel-evidence" role="dialog" aria-modal="true" aria-labelledby={`${spec.id}-title`}>
                <header className="hbar-app-ui-side-panel-header"><h2 id={`${spec.id}-title`}>SOC 2 Type II report</h2><DialogCloseButton onClose={close}/></header>
                <div className="hbar-app-ui-side-panel-body">
                    <p className="hbar-app-ui-evidence-status"><i aria-hidden="true"/><span>Current <b aria-hidden="true">·</b> SOC2-2024</span></p>
                    <p className="hbar-app-ui-evidence-description">Independent audit of security, availability, and confidentiality controls for the 2024 reporting period.</p>
                    <dl className="hbar-app-ui-evidence-details">{evidenceDetails.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
                    <section className="hbar-app-ui-evidence-controls"><h3>Controls covered</h3><div>{controls.map(([code, label]) => <span key={code}><strong>{code}</strong> {label}</span>)}</div></section>
                    <section className="hbar-app-ui-evidence-history"><h3>History</h3><p><time>Jun 18, 2024</time><span>Report uploaded by Priya Raman</span></p></section>
                </div>
                <footer className="hbar-app-ui-dialog-footer hbar-app-ui-side-panel-footer"><DialogButton onClick={() => reportDialogAction(onAction, spec, 'archive')}><HbarAppUiIcon icon={Archive} tier="md" />Archive</DialogButton><DialogButton tone="accent" onClick={() => reportDialogAction(onAction, spec, 'download')}><HbarAppUiIcon icon={Download} tier="md" />Download</DialogButton></footer>
            </aside>
        </DialogBackdrop>}
    </DialogFrame>
}
