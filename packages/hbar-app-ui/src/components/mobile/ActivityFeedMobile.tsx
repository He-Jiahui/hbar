import { HbarAppUiIcon } from '../../icon'
import {useMemo, useState} from 'react'
import {Bell, Bookmark, ChevronRight, Home, Search, SlidersHorizontal, UserRound} from 'lucide-react'
import {MobileAvatar, MobileBottomTabs, MobileFrame, MobileIconButton, MobilePhone, reportMobileAction, type MobileSurfaceProps} from './MobilePrimitives'

type ActivityItem = {
    readonly id: string
    readonly title: string
    readonly detail: string
    readonly area: string
}

const items: readonly ActivityItem[] = [
    {id: 'northwind-renewal', title: 'Northwind renewed for 12 months', detail: 'Deals · 8m ago', area: 'Deals'},
    {id: 'weekly-summary', title: 'Weekly summary is ready', detail: 'Reports · 40m ago', area: 'Reports'},
    {id: 'cedar-ticket', title: 'Cedar Labs opened a ticket', detail: 'Support · 1h ago', area: 'Support'},
    {id: 'payout-settled', title: 'Payout of $4,120 settled', detail: 'Billing · 3h ago', area: 'Billing'},
    {id: 'harbor-seats', title: 'Harbor Coffee added two seats', detail: 'Accounts · 5h ago', area: 'Accounts'},
    {id: 'invoices-overdue', title: 'Two invoices moved to overdue', detail: 'Billing · 6h ago', area: 'Billing'},
    {id: 'meridian-pilot', title: 'Meridian pilot enters week three', detail: 'Deals · 9h ago', area: 'Deals'},
]

const tabs = [
    {id: 'Home', label: 'Home', icon: Home},
    {id: 'Search', label: 'Search', icon: Search},
    {id: 'Activity', label: 'Activity', icon: Bell, badge: '3'},
    {id: 'Saved', label: 'Saved', icon: Bookmark},
    {id: 'You', label: 'You', icon: UserRound},
] as const

export function ActivityFeedMobile({spec, onAction}: MobileSurfaceProps): React.JSX.Element {
    const [activeTab, setActiveTab] = useState('Home')
    const [dealsOnly, setDealsOnly] = useState(false)
    const visibleItems = useMemo(() => items.filter((item) => !dealsOnly || item.area === 'Deals'), [dealsOnly])

    const selectTab = (value: string) => {
        setActiveTab(value)
        reportMobileAction(onAction, spec, 'tabs', value)
    }

    return <MobileFrame spec={spec} onAction={onAction} className="hbar-app-ui-mobile-activity-surface"><MobilePhone>
        <header className="hbar-app-ui-mobile-phone-header">
            <p className="hbar-app-ui-mobile-phone-title">Meridian</p>
            <div className="hbar-app-ui-mobile-header-actions"><MobileIconButton label={dealsOnly ? 'Show all activity' : 'Show deal activity'} pressed={dealsOnly} onClick={() => {
                setDealsOnly((value) => !value)
                reportMobileAction(onAction, spec, 'filter', dealsOnly ? 'all' : 'deals')
            }}><HbarAppUiIcon icon={SlidersHorizontal} tier="md"  strokeWidth={1.7}/></MobileIconButton><MobileAvatar>AR</MobileAvatar></div>
        </header>
        <main className="hbar-app-ui-mobile-phone-content hbar-app-ui-mobile-activity-content">
            {activeTab === 'Home' ? <>
                <section className="hbar-app-ui-mobile-activity-heading"><h1>Today</h1><p>{dealsOnly ? 'Deal updates since you last looked' : '4 updates since you last looked'}</p></section>
                <ul className="hbar-app-ui-mobile-activity-list">{visibleItems.map((item) => <li key={item.id}><button type="button" aria-label={`${item.title}, ${item.detail}`} onClick={() => reportMobileAction(onAction, spec, 'open', item.id)}><span><strong>{item.title}</strong><small>{item.detail}</small></span><HbarAppUiIcon icon={ChevronRight} tier="md"  strokeWidth={1.5} aria-hidden="true"/></button></li>)}</ul>
            </> : <section className="hbar-app-ui-mobile-route-empty"><h1>{activeTab}</h1><p>{activeTab === 'Activity' ? 'Three unread updates are ready to review.' : `Open ${activeTab.toLowerCase()} from the mobile workspace.`}</p></section>}
        </main>
        <MobileBottomTabs tabs={tabs} value={activeTab} label="Primary navigation" onChange={selectTab}/>
    </MobilePhone></MobileFrame>
}
