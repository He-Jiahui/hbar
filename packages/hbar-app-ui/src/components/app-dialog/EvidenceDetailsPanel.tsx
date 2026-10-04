import {
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenText,
 LumenButton } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../../icon'
import {useState} from 'react'
import {Archive, Download} from 'lucide-react'
import {
    type AppDialogProps,
    DialogBackdrop,
    DialogButton,
    DialogCloseButton,
    DialogFrame,
    reportDialogAction
} from './DialogPrimitives'

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
        <LumenButton type="button"
                className={`hbar-app-ui-dialog-trigger hbar-app-ui-side-trigger ${open ? 'is-hidden' : ''}`}
                onClick={() => {
                    setOpen(true)
                    reportDialogAction(onAction, spec, 'open')
                }}>View evidence details
        </LumenButton>
        {open && <DialogBackdrop className="hbar-app-ui-dialog-side-backdrop">
            <LumenFrame as="aside" className="hbar-app-ui-side-panel hbar-app-ui-side-panel-evidence" role="dialog" aria-modal="true"
                   aria-labelledby={`${spec.id}-title`}>
                <LumenFrame as="header" className="hbar-app-ui-side-panel-header"><LumenText as="h2" id={`${spec.id}-title`}>SOC 2 Type II report</LumenText>
                    <DialogCloseButton onClose={close}/></LumenFrame>
                <LumenFrame className="hbar-app-ui-side-panel-body">
                    <LumenText as="p" className="hbar-app-ui-evidence-status"><LumenFrame as="i" aria-hidden="true"/><LumenText as="span">Current <LumenText as="b"
                        aria-hidden="true">·</LumenText> SOC2-2024</LumenText></LumenText>
                    <LumenText as="p" className="hbar-app-ui-evidence-description">Independent audit of security, availability, and
                        confidentiality controls for the 2024 reporting period.</LumenText>
                    <LumenCollection as="dl" className="hbar-app-ui-evidence-details">{evidenceDetails.map(([label, value]) => <LumenFrame
                        key={label}>
                        <LumenCollectionItem as="dt">{label}</LumenCollectionItem>
                        <LumenCollectionItem as="dd">{value}</LumenCollectionItem>
                    </LumenFrame>)}</LumenCollection>
                    <LumenFrame as="section" className="hbar-app-ui-evidence-controls"><LumenText as="h3">Controls covered</LumenText>
                        <LumenFrame>{controls.map(([code, label]) => <LumenText as="span"
                            key={code}><LumenText as="strong">{code}</LumenText> {label}</LumenText>)}</LumenFrame>
                    </LumenFrame>
                    <LumenFrame as="section" className="hbar-app-ui-evidence-history"><LumenText as="h3">History</LumenText>
                        <LumenText as="p">
                            <LumenText as="time">Jun 18, 2024</LumenText>
                            <LumenText as="span">Report uploaded by Priya Raman</LumenText></LumenText>
                    </LumenFrame>
                </LumenFrame>
                <LumenFrame as="footer" className="hbar-app-ui-dialog-footer hbar-app-ui-side-panel-footer"><DialogButton
                    onClick={() => reportDialogAction(onAction, spec, 'archive')}><HbarAppUiIcon icon={Archive} tier="md"
                    />Archive</DialogButton><DialogButton tone="accent"
                                                                   onClick={() => reportDialogAction(onAction, spec, 'download')}><HbarAppUiIcon icon={Download} tier="md"
                    />Download</DialogButton></LumenFrame>
            </LumenFrame>
        </DialogBackdrop>}
    </DialogFrame>
}
