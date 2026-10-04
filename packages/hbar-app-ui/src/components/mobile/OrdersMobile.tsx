import {
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenText,
 LumenButton } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../../icon'
import {useState} from 'react'
import {Box, ChevronRight, ChevronUp, Home, MessageSquare} from 'lucide-react'
import {
    MobileAvatar,
    MobileBottomTabs,
    MobileFrame,
    MobilePhone,
    type MobileSurfaceProps,
    reportMobileAction
} from './MobilePrimitives'

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
        <LumenFrame as="header" className="hbar-app-ui-mobile-phone-header"><LumenText as="p" className="hbar-app-ui-mobile-phone-title">Northwind
            Supply</LumenText>
            <LumenFrame className="hbar-app-ui-mobile-header-actions"><MobileAvatar>NS</MobileAvatar></LumenFrame>
        </LumenFrame>
        <LumenFrame as="main" className="hbar-app-ui-mobile-phone-content hbar-app-ui-mobile-orders-content"><LumenText as="p"
            className="hbar-app-ui-mobile-eyebrow">Recent orders</LumenText>
            <LumenCollection as="ul" className="hbar-app-ui-mobile-orders-list">{orders.map((order) => <LumenCollectionItem key={order.id}>
                <LumenButton type="button" aria-label={`${order.account}, ${order.detail}`}
                        onClick={() => reportMobileAction(onAction, spec, 'open', order.id)}>
                    <LumenText as="span"><LumenText as="strong">{order.account}</LumenText><LumenText as="small">{order.detail}</LumenText></LumenText><HbarAppUiIcon icon={ChevronRight} tier="md"
                                                                                                            strokeWidth={1.5}
                                                                                                            aria-hidden="true"/>
                </LumenButton>
            </LumenCollectionItem>)}</LumenCollection>
        </LumenFrame>
        <MobileBottomTabs tabs={tabs} value={activeTab} label="Order navigation" onChange={(value) => {
            setActiveTab(value)
            reportMobileAction(onAction, spec, 'tabs', value)
        }}/>
    </MobilePhone></MobileFrame>
}
