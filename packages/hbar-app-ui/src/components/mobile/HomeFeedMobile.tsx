import { HbarAppUiIcon } from '../../icon'
import {useState} from 'react'
import {Archive, ArrowUpRight, BarChart3, CalendarDays, Home, Search} from 'lucide-react'
import {MobileAvatar, MobileFrame, MobileIconButton, MobilePhone, reportMobileAction, type MobileSurfaceProps} from './MobilePrimitives'

type FeedCard = {
    readonly id: string
    readonly title: string
    readonly description: string
    readonly detail: string
}

const cards: readonly FeedCard[] = [
    {id: 'alder-pilot', title: 'Alder Group signed the pilot', description: 'Two regions go live on Monday. Provisioning is already queued.', detail: 'Deals · 14m ago'},
    {id: 'latency', title: 'Latency back under target', description: 'The eu-west read replica caught up after the reindex finished.', detail: 'Platform · 1h ago'},
    {id: 'digest', title: 'Weekly digest is ready', description: 'Retention held at 94% and three accounts moved into expansion.', detail: 'Reports · 3h ago'},
    {id: 'harbor-reply', title: 'Harbor Coffee replied', description: 'They want the invoice split across two cost centres from July.', detail: 'Support · 5h ago'},
    {id: 'cedar-seats', title: 'Two seats freed on the Cedar Labs plan', description: 'Both were dormant for 60 days, so the July invoice drops by $180.', detail: 'Billing · 8h ago'},
]

const tabs = [
    {id: 'Home', label: 'Home', icon: Home},
    {id: 'Inbox', label: 'Inbox', icon: Archive},
    {id: 'Schedule', label: 'Schedule', icon: CalendarDays},
    {id: 'Reports', label: 'Reports', icon: BarChart3},
    {id: 'Search', label: 'Search', icon: Search},
] as const

export function HomeFeedMobile({spec, onAction}: MobileSurfaceProps): React.JSX.Element {
    const [activeTab, setActiveTab] = useState('Home')

    return <MobileFrame spec={spec} onAction={onAction} className="hbar-app-ui-mobile-home-surface"><MobilePhone className="hbar-app-ui-mobile-home-phone">
        <header className="hbar-app-ui-mobile-phone-header"><p className="hbar-app-ui-mobile-phone-title">Home</p><div className="hbar-app-ui-mobile-header-actions"><MobileAvatar>AR</MobileAvatar></div></header>
        <main className="hbar-app-ui-mobile-phone-content hbar-app-ui-mobile-home-content"><ul className="hbar-app-ui-mobile-home-list">{cards.map((card) => <li key={card.id}><button type="button" aria-label={`${card.title}, ${card.detail}`} onClick={() => reportMobileAction(onAction, spec, 'open', card.id)}><span className="hbar-app-ui-mobile-card-title"><strong>{card.title}</strong><HbarAppUiIcon icon={ArrowUpRight} tier="md"  strokeWidth={1.5} aria-hidden="true"/></span><span className="hbar-app-ui-mobile-card-description">{card.description}</span><small>{card.detail}</small></button></li>)}</ul></main>
        <nav className="hbar-app-ui-mobile-home-dock" aria-label="Primary navigation">{tabs.map(({id, label, icon: Icon}) => <MobileIconButton key={id} label={label} pressed={activeTab === id} onClick={() => {
            setActiveTab(id)
            reportMobileAction(onAction, spec, 'tabs', id)
        }}><HbarAppUiIcon icon={Icon} tier="md"  strokeWidth={1.7}/></MobileIconButton>)}</nav>
    </MobilePhone></MobileFrame>
}
