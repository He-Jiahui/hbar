import {
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenText,
 LumenInput } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../../icon'
import {useState} from 'react'
import {ArrowLeft, Check, Pencil} from 'lucide-react'
import {
    reportWizardAction,
    WizardButton,
    WizardFooter,
    WizardFrame,
    WizardStepRail,
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

    return <WizardFrame spec={spec} onAction={onAction} className="hbar-app-ui-wizard-review"><WizardStepRail
        steps={steps} current={3} onSelect={(index) => reportWizardAction(onAction, spec, 'step', String(index + 1))}/>
        <LumenFrame as="main" className="hbar-app-ui-wizard-review-main">
            <LumenFrame as="header"><LumenText as="h1">Review before sending</LumenText><LumenText as="p">Nothing sends until you confirm. Each section can still be
                changed.</LumenText></LumenFrame>
            <LumenFrame className="hbar-app-ui-wizard-review-sections">{reviewSections.map((section) => <LumenFrame as="section"
                key={section.id}>
                <LumenFrame as="header"><LumenText as="h2">{section.title}</LumenText><WizardButton
                    onClick={() => reportWizardAction(onAction, spec, 'edit', section.id)}><HbarAppUiIcon icon={Pencil} tier="sm"
                    />Edit</WizardButton></LumenFrame>
                <LumenCollection as="dl">{section.rows.map(([label, value]) => <LumenFrame key={label}>
                    <LumenCollectionItem as="dt">{label}</LumenCollectionItem>
                    <LumenCollectionItem as="dd">{value}</LumenCollectionItem>
                </LumenFrame>)}</LumenCollection>
            </LumenFrame>)}</LumenFrame>
            <LumenFrame as="label" className="hbar-app-ui-wizard-confirm"><LumenInput type="checkbox" checked={confirmed} onChange={() => {
                setConfirmed((current) => !current)
                reportWizardAction(onAction, spec, 'confirm-check', String(!confirmed))
            }}/><LumenText as="span">I have checked the audience and schedule. Sending to 18,204 contacts cannot be undone once delivery starts.</LumenText></LumenFrame>
        </LumenFrame>
        <WizardFooter><WizardButton onClick={() => reportWizardAction(onAction, spec, 'back')}><HbarAppUiIcon icon={ArrowLeft} tier="sm" />Back</WizardButton><WizardButton
            tone="light" disabled={!confirmed}
            onClick={() => reportWizardAction(onAction, spec, 'schedule-send')}><HbarAppUiIcon icon={Check} tier="sm" />Schedule
            send</WizardButton></WizardFooter></WizardFrame>
}
