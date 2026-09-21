import { LumenButton } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../../icon'
import {useEffect, useMemo, useState} from 'react'
import {Menu, Play, Plus, X} from 'lucide-react'
import {MobileFrame, MobileIconButton, MobilePhone, reportMobileAction, type MobileSurfaceProps} from './MobilePrimitives'

type Run = {
    readonly id: string
    readonly title: string
    readonly detail: string
    readonly state: 'Queue' | 'Running' | 'Done'
}

const runs: readonly Run[] = [
    {id: 'warehouse-sync', title: 'Warehouse sync', detail: 'Running · 4m 12s elapsed', state: 'Running'},
    {id: 'contact-dedupe', title: 'Contact dedupe', detail: 'Running · 58s elapsed', state: 'Running'},
    {id: 'harbor-import', title: 'Harbor Coffee import', detail: 'Running · 2m 04s elapsed', state: 'Running'},
    {id: 'usage-rollup', title: 'Usage rollup', detail: 'Running · 6m 41s elapsed', state: 'Running'},
    {id: 'invoice-pdf', title: 'Invoice PDF batch', detail: 'Running · 1m 19s elapsed', state: 'Running'},
    {id: 'northwind-mapping', title: 'Northwind field mapping', detail: 'Running · 3m 55s elapsed', state: 'Running'},
    {id: 'alert-evaluation', title: 'Alert rule evaluation', detail: 'Running · 22s elapsed', state: 'Running'},
    {id: 'ledger-checksum', title: 'Ledger checksum', detail: 'Running · 8m 02s elapsed', state: 'Running'},
]

const tabs = ['Queue', 'Running', 'Done'] as const

export function RunListMobile({spec, onAction}: MobileSurfaceProps): React.JSX.Element {
    const [activeTab, setActiveTab] = useState<Run['state']>('Running')
    const [menuOpen, setMenuOpen] = useState(false)
    const [queuedRuns, setQueuedRuns] = useState<readonly Run[]>([])
    const visibleRuns = useMemo(() => [...runs, ...queuedRuns].filter((run) => run.state === activeTab), [activeTab, queuedRuns])

    useEffect(() => {
        if (!menuOpen) return undefined
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setMenuOpen(false)
        }
        document.addEventListener('keydown', closeOnEscape)
        return () => document.removeEventListener('keydown', closeOnEscape)
    }, [menuOpen])

    const createRun = () => {
        const id = `queued-run-${queuedRuns.length + 1}`
        setQueuedRuns((current) => [...current, {id, title: 'New workspace run', detail: 'Queued · Ready to start', state: 'Queue'}])
        setActiveTab('Queue')
        reportMobileAction(onAction, spec, 'open', id)
    }

    const selectTab = (tab: Run['state']) => {
        setActiveTab(tab)
        reportMobileAction(onAction, spec, 'tabs', tab)
    }

    return <MobileFrame spec={spec} onAction={onAction} className="hbar-app-ui-mobile-runs-surface"><MobilePhone className="hbar-app-ui-mobile-runs-phone">
        <header className="hbar-app-ui-mobile-phone-header hbar-app-ui-mobile-runs-header"><MobileIconButton label="Open menu" onClick={() => {
            setMenuOpen(true)
            reportMobileAction(onAction, spec, 'expand', 'menu')
        }}><HbarAppUiIcon icon={Menu} tier="lg"  strokeWidth={1.7}/></MobileIconButton><p className="hbar-app-ui-mobile-phone-title">Runs</p>
            <MobileIconButton label="New run" onClick={createRun}><HbarAppUiIcon icon={Plus} tier="lg"  strokeWidth={1.7}/></MobileIconButton>
        </header>
        <nav className="hbar-app-ui-mobile-run-tabs" role="tablist" aria-label="Run status">{tabs.map((tab) => <LumenButton
            type="button" role="tab" aria-selected={activeTab === tab}
            className={activeTab === tab ? 'is-selected' : ''} key={tab}
            onClick={() => selectTab(tab)}>{tab}</LumenButton>)}</nav>
        <main className="hbar-app-ui-mobile-phone-content hbar-app-ui-mobile-runs-content">{visibleRuns.length ?
            <ul className="hbar-app-ui-mobile-runs-list">{visibleRuns.map((run) => <li key={run.id}>
                <LumenButton type="button" onClick={() => reportMobileAction(onAction, spec, 'open', run.id)}><span
                    className="hbar-app-ui-mobile-run-icon" aria-hidden="true"><HbarAppUiIcon icon={Play} tier="md"
                                                                                     strokeWidth={1.5}/></span><span><strong>{run.title}</strong><small><i
                    aria-hidden="true"/>{run.detail}</small></span></LumenButton>
            </li>)}</ul> : <section className="hbar-app-ui-mobile-route-empty"><h1>{activeTab}</h1>
                <p>{activeTab === 'Queue' ? 'Create a run to add it to the queue.' : 'No completed runs are available yet.'}</p>
            </section>}</main>
        {menuOpen && <section className="hbar-app-ui-mobile-runs-menu" role="dialog" aria-modal="true"
                              aria-label="Run navigation">
            <header><p className="hbar-app-ui-mobile-phone-title">Menu</p><MobileIconButton label="Close menu"
                                                                                            onClick={() => {
                                                                                                setMenuOpen(false)
                                                                                                reportMobileAction(onAction, spec, 'close', 'menu')
                                                                                            }}><HbarAppUiIcon icon={X} tier="lg"
                                                                                                  strokeWidth={1.7}/></MobileIconButton>
            </header>
            <div>
                <LumenButton type="button" onClick={() => {
                    setMenuOpen(false)
                    selectTab('Running')
                }}>Active runs
                </LumenButton>
                <LumenButton type="button" onClick={() => {
                    setMenuOpen(false)
                    selectTab('Queue')
                }}>Queued runs
                </LumenButton>
                <LumenButton type="button" onClick={() => {
                    setMenuOpen(false)
                    selectTab('Done')
                }}>Completed runs
                </LumenButton>
            </div>
        </section>}
    </MobilePhone></MobileFrame>
}
