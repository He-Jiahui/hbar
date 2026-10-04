import { LumenCollection, LumenCollectionItem, LumenFrame, LumenText } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../../icon'
import {useState} from 'react'
import {AlertTriangle, Check, Circle, LoaderCircle} from 'lucide-react'
import {reportWizardAction, WizardButton, WizardFooter, WizardFrame, type WizardSurfaceProps,} from './WizardPrimitives'

type MigrationState = 'complete' | 'active' | 'pending' | 'warning'

const migrationSteps: readonly {
    readonly id: string;
    readonly label: string;
    readonly detail: string;
    readonly state: MigrationState
}[] = [
    {id: 'snapshot', label: 'Snapshot source database', detail: '4.2 GB · 38s', state: 'complete'},
    {id: 'schema', label: 'Rebuild schema and indexes', detail: '126 tables · 1m 04s', state: 'complete'},
    {id: 'rows', label: 'Copy rows', detail: '8.4M of 12.1M rows', state: 'active'},
    {id: 'attachments', label: 'Transfer attachments', detail: 'Queued · 61,208 files', state: 'pending'},
    {id: 'search', label: 'Rebuild search index', detail: 'Two entries need review', state: 'warning'},
    {id: 'traffic', label: 'Switch traffic to the new cluster', detail: 'Waiting for approval', state: 'pending'},
]

function MigrationIcon({state}: { readonly state: MigrationState }) {
    if (state === 'complete') return <HbarAppUiIcon icon={Check} tier="sm"  strokeWidth={2}/>
    if (state === 'active') return <HbarAppUiIcon icon={LoaderCircle} tier="sm"  strokeWidth={1.7}/>
    if (state === 'warning') return <HbarAppUiIcon icon={AlertTriangle} tier="sm"  strokeWidth={1.7}/>
    return <HbarAppUiIcon icon={Circle} tier="xs"  strokeWidth={1.5}/>
}

export function MigrationWizard({spec, onAction}: WizardSurfaceProps) {
    const [cancelled, setCancelled] = useState(false)
    const [reviewed, setReviewed] = useState(false)

    return <WizardFrame spec={spec} onAction={onAction} className="hbar-app-ui-wizard-migration">
        <LumenFrame as="main" className="hbar-app-ui-wizard-migration-card">
            <LumenFrame as="header">
                <LumenFrame><LumenText as="h1">{cancelled ? 'Migration paused' : 'Migrating workspace'}</LumenText>
                    <LumenText as="p">{cancelled ? 'The source workspace remains read-only until you resume.' : 'Step 3 of 4. You can leave this running and come back.'}</LumenText>
                </LumenFrame>
                <LumenText as="span">{cancelled ? 'Paused' : '~6 min left'}</LumenText></LumenFrame>
            <LumenFrame as="section" className="hbar-app-ui-wizard-migration-body">
                <LumenFrame className="hbar-app-ui-wizard-migration-progress"><LumenText as="span"><LumenFrame as="i"
                    style={{inlineSize: cancelled ? '52%' : '66%'}}/></LumenText><LumenText as="strong">{cancelled ? '52%' : '66%'}</LumenText>
                </LumenFrame>
                <LumenCollection as="ol" className="hbar-app-ui-wizard-migration-list">{migrationSteps.map((item) => <LumenCollectionItem key={item.id}
                                                                                                    className={`is-${item.state}`}>
                    <LumenText as="span" className="hbar-app-ui-wizard-migration-icon"><MigrationIcon state={item.state}/></LumenText><LumenText as="span"><LumenText as="strong">{item.label}</LumenText><LumenText as="small">{item.detail}</LumenText></LumenText>{item.state === 'warning' &&
                    <WizardButton onClick={() => {
                        setReviewed(true)
                        reportWizardAction(onAction, spec, 'review', item.id)
                    }}>{reviewed ? 'Reviewed' : 'Review'}</WizardButton>}</LumenCollectionItem>)}</LumenCollection>
                <LumenText as="p" className="hbar-app-ui-wizard-migration-note">The source workspace stays read-only until cutover.
                    Nothing is deleted, so a failed step can be retried without starting over.</LumenText></LumenFrame>
        </LumenFrame>
        <WizardFooter><WizardButton onClick={() => {
            setCancelled(true)
            reportWizardAction(onAction, spec, 'cancel')
        }} disabled={cancelled}>Cancel migration</WizardButton><WizardButton tone="light"
                                                                             onClick={() => reportWizardAction(onAction, spec, 'background')}>Run
            in background</WizardButton></WizardFooter></WizardFrame>
}
