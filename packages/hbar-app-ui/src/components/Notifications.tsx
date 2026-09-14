import type {HbarAppUiVariantProps} from '../types'
import {ActivityInbox} from './notifications/ActivityInbox'
import {AppBarBell} from './notifications/AppBarBell'
import {DeliveryPreferences} from './notifications/DeliveryPreferences'
import {NotificationCenter} from './notifications/NotificationCenter'
import {SystemMessages} from './notifications/SystemMessages'
import {ToastStack} from './notifications/ToastStack'
import './notifications/NotificationsSurface.css'

type NotificationProps = HbarAppUiVariantProps

/** Category dispatcher; each notification surface owns an independent module. */
export function Notifications({spec, onAction}: NotificationProps) {
    switch (spec.variant) {
        case 1:
            return <NotificationCenter spec={spec} onAction={onAction}/>
        case 2:
            return <ToastStack spec={spec} onAction={onAction}/>
        case 3:
            return <DeliveryPreferences spec={spec} onAction={onAction}/>
        case 4:
            return <ActivityInbox spec={spec} onAction={onAction}/>
        case 5:
            return <SystemMessages spec={spec} onAction={onAction}/>
        case 6:
            return <AppBarBell spec={spec} onAction={onAction}/>
        default:
            return <NotificationCenter spec={spec} onAction={onAction}/>
    }
}
