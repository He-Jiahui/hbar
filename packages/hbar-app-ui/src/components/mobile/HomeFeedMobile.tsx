import {
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenText,
 LumenButton } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../../icon'
import {useState} from 'react'
import {Archive, ArrowUpRight, BarChart3, CalendarDays, Home, Search} from 'lucide-react'
import {
    MobileAvatar,
    MobileFrame,
    MobileIconButton,
    MobilePhone,
    type MobileSurfaceProps,
    reportMobileAction
} from './MobilePrimitives'

type FeedCard = {
    readonly id: string
    readonly title: string
    readonly description: string
    readonly detail: string
}

const cards: readonly FeedCard[] = [
    {
        id: 'alder-pilot',
        title: 'Alder Group signed the pilot',
        description: 'Two regions go live on Monday. Provisioning is already queued.',
        detail: 'Deals · 14m ago'
    },
    {
        id: 'latency',
        title: 'Latency back under target',
        description: 'The eu-west read replica caught up after the reindex finished.',
        detail: 'Platform · 1h ago'
    },
    {
        id: 'digest',
        title: 'Weekly digest is ready',
        description: 'Retention held at 94% and three accounts moved into expansion.',
        detail: 'Reports · 3h ago'
    },
    {
        id: 'harbor-reply',
        title: 'Harbor Coffee replied',
        description: 'They want the invoice split across two cost centres from July.',
        detail: 'Support · 5h ago'
    },
    {
        id: 'cedar-seats',
        title: 'Two seats freed on the Cedar Labs plan',
        description: 'Both were dormant for 60 days, so the July invoice drops by $180.',
        detail: 'Billing · 8h ago'
    },
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

    return <MobileFrame spec={spec} onAction={onAction} className="hbar-app-ui-mobile-home-surface"><MobilePhone
        className="hbar-app-ui-mobile-home-phone">
        <LumenFrame as="header" className="hbar-app-ui-mobile-phone-header"><LumenText as="p" className="hbar-app-ui-mobile-phone-title">Home</LumenText>
            <LumenFrame className="hbar-app-ui-mobile-header-actions"><MobileAvatar>AR</MobileAvatar></LumenFrame>
        </LumenFrame>
        <LumenFrame as="main" className="hbar-app-ui-mobile-phone-content hbar-app-ui-mobile-home-content">
            <LumenCollection as="ul" className="hbar-app-ui-mobile-home-list">{cards.map((card) => <LumenCollectionItem key={card.id}>
                <LumenButton type="button" aria-label={`${card.title}, ${card.detail}`}
                        onClick={() => reportMobileAction(onAction, spec, 'open', card.id)}><LumenText as="span"
                    className="hbar-app-ui-mobile-card-title"><LumenText as="strong">{card.title}</LumenText><HbarAppUiIcon icon={ArrowUpRight} tier="md"
                                                                                                         strokeWidth={1.5}
                                                                                                         aria-hidden="true"/></LumenText><LumenText as="span"
                    className="hbar-app-ui-mobile-card-description">{card.description}</LumenText><LumenText as="small">{card.detail}</LumenText>
                </LumenButton>
            </LumenCollectionItem>)}</LumenCollection>
        </LumenFrame>
        <LumenFrame as="nav" className="hbar-app-ui-mobile-home-dock" aria-label="Primary navigation">{tabs.map(({
                                                                                                     id,
                                                                                                     label,
                                                                                                     icon: Icon
                                                                                                 }) => <MobileIconButton
            key={id} label={label} pressed={activeTab === id} onClick={() => {
            setActiveTab(id)
            reportMobileAction(onAction, spec, 'tabs', id)
        }}><HbarAppUiIcon icon={Icon} tier="md"  strokeWidth={1.7}/></MobileIconButton>)}</LumenFrame>
    </MobilePhone></MobileFrame>
}
