import {useState} from 'react'
import {Box, ChevronRight, ChevronUp, Home, MessageSquare} from 'lucide-react'
import {MobileAvatar, MobileBottomTabs, MobileFrame, MobilePhone, reportMobileAction, type MobileSurfaceProps} from './MobilePrimitives'

type Order = {
    readonly id: string
    readonly account: string
    readonly detail: string
}

const orders: readonly Order[] = [
    {id: '4192', account: 'Northwind', detail: 'Order 4192 · Packed · 3 items'},
    {id: '4188', account: 'Cedar Labs', detail: 'Order 4188 · In transit · 1 item'},
    {id: '4181', account: 'Harbor Coffee', detail: 'Order 4181 · Delivered · 5 items'},
    {id: '4174', account: 'Alder Group', detail: 'Order 4174 · Delivered · 2 items'},
    {id: '4169', account: 'Meridian', detail: 'Order 4169 · Delivered · 4 items'},
    {id: '4162', account: 'Northwind', detail: 'Order 4162 · Returned · 1 item'},
]

const tabs = [
    {id: 'Home', label: 'Home', icon: Home},
    {id: 'Orders', label: 'Orders', icon: Box},
    {id: 'Messages', label: 'Messages', icon: MessageSquare},
    {id: 'More', label: 'More', icon: ChevronUp},
] as const

export function OrdersMobile({spec, onAction}: MobileSurfaceProps): React.JSX.Element {
    const [activeTab, setActiveTab] = useState('Home')

    return <MobileFrame spec={spec} onAction={onAction} className="hbar-app-ui-mobile-orders-surface"><MobilePhone>
        <header className="hbar-app-ui-mobile-phone-header"><p className="hbar-app-ui-mobile-phone-title">Northwind Supply</p><div className="hbar-app-ui-mobile-header-actions"><MobileAvatar>NS</MobileAvatar></div></header>
        <main className="hbar-app-ui-mobile-phone-content hbar-app-ui-mobile-orders-content"><p className="hbar-app-ui-mobile-eyebrow">Recent orders</p><ul className="hbar-app-ui-mobile-orders-list">{orders.map((order) => <li key={order.id}><button type="button" aria-label={`${order.account}, ${order.detail}`} onClick={() => reportMobileAction(onAction, spec, 'open', order.id)}><span><strong>{order.account}</strong><small>{order.detail}</small></span><ChevronRight size={16} strokeWidth={1.5} aria-hidden="true"/></button></li>)}</ul></main>
        <MobileBottomTabs tabs={tabs} value={activeTab} label="Order navigation" onChange={(value) => {
            setActiveTab(value)
            reportMobileAction(onAction, spec, 'tabs', value)
        }}/>
    </MobilePhone></MobileFrame>
}
