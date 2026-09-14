import type {HbarAppUiVariantProps} from '../types'
import {ActivityFeedMobile} from './mobile/ActivityFeedMobile'
import {HomeFeedMobile} from './mobile/HomeFeedMobile'
import {OrdersMobile} from './mobile/OrdersMobile'
import {RunListMobile} from './mobile/RunListMobile'
import {TaskInboxMobile} from './mobile/TaskInboxMobile'
import './mobile/MobileSurface.css'

type MobileProps = HbarAppUiVariantProps

export function Mobile({spec, onAction}: MobileProps) {
    switch (spec.variant) {
        case 1:
            return <ActivityFeedMobile spec={spec} onAction={onAction}/>;
        case 2:
            return <TaskInboxMobile spec={spec} onAction={onAction}/>;
        case 3:
            return <HomeFeedMobile spec={spec} onAction={onAction}/>;
        case 4:
            return <OrdersMobile spec={spec} onAction={onAction}/>;
        case 5:
            return <RunListMobile spec={spec} onAction={onAction}/>;
        default:
            return <ActivityFeedMobile spec={spec} onAction={onAction}/>
    }
}
