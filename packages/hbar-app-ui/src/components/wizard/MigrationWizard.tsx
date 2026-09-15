import {useState} from 'react'
import {AlertTriangle, Check, Circle, LoaderCircle} from 'lucide-react'
import {
    WizardButton,
    WizardFooter,
    WizardFrame,
    reportWizardAction,
    type WizardSurfaceProps,
} from './WizardPrimitives'

type MigrationState = 'complete' | 'active' | 'pending' | 'warning'

const migrationSteps: readonly {readonly id: string; readonly label: string; readonly detail: string; readonly state: MigrationState}[] = [
    {id: 'snapshot', label: 'Snapshot source database', detail: '4.2 GB · 38s', state: 'complete'},
    {id: 'schema', label: 'Rebuild schema and indexes', detail: '126 tables · 1m 04s', state: 'complete'},
    {id: 'rows', label: 'Copy rows', detail: '8.4M of 12.1M rows', state: 'active'},
    {id: 'attachments', label: 'Transfer attachments', detail: 'Queued · 61,208 files', state: 'pending'},
    {id: 'search', label: 'Rebuild search index', detail: 'Two entries need review', state: 'warning'},
    {id: 'traffic', label: 'Switch traffic to the new cluster', detail: 'Waiting for approval', state: 'pending'},
]

function MigrationIcon({state}: {readonly state: MigrationState}) {
    if (state === 'complete') return <Check size={14} strokeWidth={2}/>
    if (state === 'active') return <LoaderCircle size={14} strokeWidth={1.7}/>
    if (state === 'warning') return <AlertTriangle size={14} strokeWidth={1.7}/>
    return <Circle size={10} strokeWidth={1.5}/>
}

export function MigrationWizard({spec, onAction}: WizardSurfaceProps) {
    const [cancelled, setCancelled] = useState(false)
    const [reviewed, setReviewed] = useState(false)

    return <WizardFrame spec={spec} onAction={onAction} className="hbar-app-ui-wizard-migration"><main className="hbar-app-ui-wizard-migration-card"><header><div><h1>{cancelled ? 'Migration paused' : 'Migrating workspace'}</h1><p>{cancelled ? 'The source workspace remains read-only until you resume.' : 'Step 3 of 4. You can leave this running and come back.'}</p></div><span>{cancelled ? 'Paused' : '~6 min left'}</span></header><section className="hbar-app-ui-wizard-migration-body"><div className="hbar-app-ui-wizard-migration-progress"><span><i style={{inlineSize: cancelled ? '52%' : '66%'}}/></span><strong>{cancelled ? '52%' : '66%'}</strong></div><ol className="hbar-app-ui-wizard-migration-list">{migrationSteps.map((item) => <li key={item.id} className={`is-${item.state}`}><span className="hbar-app-ui-wizard-migration-icon"><MigrationIcon state={item.state}/></span><span><strong>{item.label}</strong><small>{item.detail}</small></span>{item.state === 'warning' && <WizardButton onClick={() => {
        setReviewed(true)
        reportWizardAction(onAction, spec, 'review', item.id)
    }}>{reviewed ? 'Reviewed' : 'Review'}</WizardButton>}</li>)}</ol><p className="hbar-app-ui-wizard-migration-note">The source workspace stays read-only until cutover. Nothing is deleted, so a failed step can be retried without starting over.</p></section></main><WizardFooter><WizardButton onClick={() => {
        setCancelled(true)
        reportWizardAction(onAction, spec, 'cancel')
    }} disabled={cancelled}>Cancel migration</WizardButton><WizardButton tone="light" onClick={() => reportWizardAction(onAction, spec, 'background')}>Run in background</WizardButton></WizardFooter></WizardFrame>
}
