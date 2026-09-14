import type {HbarAppUiVariantProps} from '../types'
import {AssistantChat} from './support/AssistantChat'
import {HelpCenter} from './support/HelpCenter'
import {RequestList} from './support/RequestList'
import {TicketForm} from './support/TicketForm'
import {TicketThread} from './support/TicketThread'
import './support/SupportSurface.css'

type SupportProps = HbarAppUiVariantProps


export function Support({spec, onAction}: SupportProps) {
    switch (spec.variant) {
        case 1:
            return <HelpCenter spec={spec} onAction={onAction}/>;
        case 2:
            return <TicketForm spec={spec} onAction={onAction}/>;
        case 3:
            return <TicketThread spec={spec} onAction={onAction}/>;
        case 4:
            return <AssistantChat spec={spec} onAction={onAction}/>;
        case 5:
            return <RequestList spec={spec} onAction={onAction}/>;
        default:
            return <HelpCenter spec={spec} onAction={onAction}/>
    }
}
