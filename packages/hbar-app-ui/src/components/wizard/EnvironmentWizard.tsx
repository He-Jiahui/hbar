import { HbarAppUiIcon } from '../../icon'
import {useState} from 'react'
import {ArrowLeft, Archive, Check, Database, FolderArchive, Gauge, HardDrive, Layers3, Search, ServerCog, Zap} from 'lucide-react'
import {
    WizardButton,
    WizardFrame,
    WizardStepRail,
    reportWizardAction,
    type WizardSurfaceProps,
} from './WizardPrimitives'

const steps = [
    {id: 'region', label: 'Region'},
    {id: 'services', label: 'Services'},
    {id: 'limits', label: 'Limits'},
    {id: 'review', label: 'Review'},
] as const

const services = [
    {id: 'postgres', label: 'Managed Postgres', detail: 'Primary store with nightly snapshots.', Icon: Database},
    {id: 'cache', label: 'In-memory cache', detail: 'Shared key store for sessions.', Icon: Zap},
    {id: 'storage', label: 'Object storage', detail: 'Buckets for uploads and exports.', Icon: FolderArchive},
    {id: 'queue', label: 'Background queue', detail: 'Retries and dead-letter handling.', Icon: Layers3},
    {id: 'scheduled', label: 'Scheduled jobs', detail: 'Cron runners with a shared log.', Icon: ServerCog},
    {id: 'search', label: 'Search index', detail: 'Rebuilt from Postgres on write.', Icon: Search},
    {id: 'metrics', label: 'Metrics pipeline', detail: 'Request, queue, and job counters.', Icon: Gauge},
    {id: 'retention', label: 'Log retention', detail: 'Thirty days of searchable output.', Icon: Archive},
] as const

export function EnvironmentWizard({spec, onAction}: WizardSurfaceProps) {
    const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(['postgres', 'cache', 'queue']))
    const [step, setStep] = useState(1)
    const toggle = (id: string) => {
        setSelected((current) => {
            const next = new Set(current)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
        reportWizardAction(onAction, spec, 'service', id)
    }

    return <WizardFrame spec={spec} onAction={onAction} className="hbar-app-ui-wizard-environment"><header className="hbar-app-ui-wizard-environment-header"><div className="hbar-app-ui-wizard-environment-title"><WizardButton aria-label="Back to region" title="Back to region" className="hbar-app-ui-wizard-environment-back" onClick={() => {
        setStep(0)
        reportWizardAction(onAction, spec, 'back')
    }}><HbarAppUiIcon icon={ArrowLeft} tier="md" /></WizardButton><div><h1>New environment</h1><p>staging · eu-west</p></div></div><WizardButton onClick={() => reportWizardAction(onAction, spec, 'save-exit')}>Save and exit</WizardButton><WizardStepRail steps={steps} current={step} onSelect={(index) => {
        setStep(index)
        reportWizardAction(onAction, spec, 'step', String(index + 1))
    }}/></header><main className="hbar-app-ui-wizard-environment-main"><header><h2>Pick the services this environment runs</h2><p>Anything left out can be attached later without a rebuild.</p></header><div className="hbar-app-ui-wizard-service-grid" role="group" aria-label="Environment services">{services.map((service) => {
        const isSelected = selected.has(service.id)
        const Icon = service.Icon
        return <button type="button" role="checkbox" aria-checked={isSelected} className={isSelected ? 'is-selected' : ''} key={service.id} onClick={() => toggle(service.id)}><span className="hbar-app-ui-wizard-service-icon"><HbarAppUiIcon icon={Icon} tier="md"  strokeWidth={1.6}/></span><span className="hbar-app-ui-wizard-service-check" aria-hidden="true">{isSelected && <HbarAppUiIcon icon={Check} tier="xs"  strokeWidth={2}/>}</span><strong>{service.label}</strong><small>{service.detail}</small></button>
    })}</div><aside className="hbar-app-ui-wizard-environment-note"><HbarAppUiIcon icon={HardDrive} tier="md"  aria-hidden="true"/><p>Every selected service is provisioned inside the same private network. Nothing is exposed publicly until you add a route.</p></aside></main><footer className="hbar-app-ui-wizard-environment-footer"><div><strong>{selected.size} of 8 selected</strong><small>Adds about 24s to each deploy</small></div><WizardButton tone="light" onClick={() => {
        setStep(2)
        reportWizardAction(onAction, spec, 'limits')
    }}>Set limits</WizardButton></footer></WizardFrame>
}
