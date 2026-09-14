import type {HbarAppUiVariantProps} from '../types'
import {AssistantCommandPalette} from './command-menu/AssistantCommandPalette'
import {GroupedCommandPalette} from './command-menu/GroupedCommandPalette'
import {InviteCommandDialog} from './command-menu/InviteCommandDialog'
import {QuickCommandPalette} from './command-menu/QuickCommandPalette'
import {RoomCommandPalette} from './command-menu/RoomCommandPalette'
import {SearchEverythingPalette} from './command-menu/SearchEverythingPalette'
import './command-menu/CommandMenuSurface.css'

/**
 * The catalog entry is intentionally only a variant dispatcher. Each command
 * state owns its own semantic markup and interaction model in a separate view.
 */
export function CommandMenu({spec, onAction}: HbarAppUiVariantProps): React.JSX.Element {
    switch (spec.variant) {
        case 1:
            return <GroupedCommandPalette spec={spec} onAction={onAction}/>
        case 2:
            return <QuickCommandPalette spec={spec} onAction={onAction}/>
        case 3:
            return <SearchEverythingPalette spec={spec} onAction={onAction}/>
        case 4:
            return <InviteCommandDialog spec={spec} onAction={onAction}/>
        case 5:
            return <AssistantCommandPalette spec={spec} onAction={onAction}/>
        case 6:
            return <RoomCommandPalette spec={spec} onAction={onAction}/>
        default:
            return <GroupedCommandPalette spec={spec} onAction={onAction}/>
    }
}
