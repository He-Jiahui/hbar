import { HbarAppUiIcon } from '../../icon'
import {useState} from 'react'
import {ArrowLeft, Check, Pencil} from 'lucide-react'
import {
    WizardButton,
    WizardFooter,
    WizardFrame,
    WizardStepRail,
    reportWizardAction,
    type WizardSurfaceProps,
} from './WizardPrimitives'

const steps = [
    {id: 'details', label: 'Details'},
    {id: 'schedule', label: 'Schedule'},
    {id: 'recipients', label: 'Recipients'},
    {id: 'review', label: 'Review'},
] as const

const reviewSections = [
    {
        id: 'campaign',
        title: 'Campaign details',
        rows: [
            ['Name', 'Spring product update'],
            ['Sender', 'Kepler Works <news@kepler.works>'],
            ['Reply-to', 'support@kepler.works'],
        ],
    },
    {
        id: 'schedule',
        title: 'Schedule',
        rows: [
            ['Send at', '24 April 2026, 09:00'],
            ['Timezone', 'Europe/Lisbon'],
            ['Throttle', '5,000 per hour'],
        ],
    },
    {
        id: 'recipients',
        title: 'Recipients',
        rows: [
            ['Audience', 'Product subscribers'],
            ['Size', '18,204 contacts'],
            ['Suppressed', '412 unsubscribed'],
        ],
    },
] as const

export function ReviewWizard({spec, onAction}: WizardSurfaceProps) {
    const [confirmed, setConfirmed] = useState(false)

    return <WizardFrame spec={spec} onAction={onAction} className="hbar-app-ui-wizard-review"><WizardStepRail steps={steps} current={3} onSelect={(index) => reportWizardAction(onAction, spec, 'step', String(index + 1))}/><main className="hbar-app-ui-wizard-review-main"><header><h1>Review before sending</h1><p>Nothing sends until you confirm. Each section can still be changed.</p></header><div className="hbar-app-ui-wizard-review-sections">{reviewSections.map((section) => <section key={section.id}><header><h2>{section.title}</h2><WizardButton onClick={() => reportWizardAction(onAction, spec, 'edit', section.id)}><HbarAppUiIcon icon={Pencil} tier="sm" />Edit</WizardButton></header><dl>{section.rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>)}</div><label className="hbar-app-ui-wizard-confirm"><input type="checkbox" checked={confirmed} onChange={() => {
        setConfirmed((current) => !current)
        reportWizardAction(onAction, spec, 'confirm-check', String(!confirmed))
    }}/><span>I have checked the audience and schedule. Sending to 18,204 contacts cannot be undone once delivery starts.</span></label></main><WizardFooter><WizardButton onClick={() => reportWizardAction(onAction, spec, 'back')}><HbarAppUiIcon icon={ArrowLeft} tier="sm" />Back</WizardButton><WizardButton tone="light" disabled={!confirmed} onClick={() => reportWizardAction(onAction, spec, 'schedule-send')}><HbarAppUiIcon icon={Check} tier="sm" />Schedule send</WizardButton></WizardFooter></WizardFrame>
}
