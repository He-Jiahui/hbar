import type {HbarAppUiVariantProps} from '../types'
import {ToolActivity} from './tool-calls/ToolActivity'
import {
    HbarAppUiToolCallsProvider,
    useHbarAppUiToolCallsContent,
    type HbarAppUiToolCallsContent,
} from './tool-calls/ToolCallsContent'
import {ToolCallsFrame} from './tool-calls/ToolCallsPrimitives'
import {ToolCommandOutput} from './tool-calls/ToolCommandOutput'
import {ToolDiffResult} from './tool-calls/ToolDiffResult'
import {ToolPermissions} from './tool-calls/ToolPermissions'
import {ToolSearchResults} from './tool-calls/ToolSearchResults'
import {ToolTrace} from './tool-calls/ToolTrace'
import './tool-calls/ToolCallsSurface.css'

export type HbarAppUiToolCallsProps = HbarAppUiVariantProps & {
    /** Direct content injection for one surface; catalog hosts normally use the provider. */
    readonly toolCallsContent?: HbarAppUiToolCallsContent | undefined
}

export {HbarAppUiToolCallsProvider}
export type {
    HbarAppUiToolCallsActivityContent,
    HbarAppUiToolCallsActivityFilter,
    HbarAppUiToolCallsActivityItem,
    HbarAppUiToolCallsCommandContent,
    HbarAppUiToolCallsContent,
    HbarAppUiToolCallsDiffContent,
    HbarAppUiToolCallsDiffFile,
    HbarAppUiToolCallsDiffLine,
    HbarAppUiToolCallsDiffLineKind,
    HbarAppUiToolCallsListStrategy,
    HbarAppUiToolCallsOutputTab,
    HbarAppUiToolCallsPermissionAction,
    HbarAppUiToolCallsPermissionGroup,
    HbarAppUiToolCallsPermissionItem,
    HbarAppUiToolCallsPermissionItemKind,
    HbarAppUiToolCallsPermissionsContent,
    HbarAppUiToolCallsProviderProps,
    HbarAppUiToolCallsSearchContent,
    HbarAppUiToolCallsSearchResult,
    HbarAppUiToolCallsState,
    HbarAppUiToolCallsTraceContent,
    HbarAppUiToolCallsTraceItem,
} from './tool-calls/ToolCallsContent'
export {selectHbarAppUiToolCallsItem, uniqueHbarAppUiToolCallsItems} from './tool-calls/ToolCallsContent'

function emptyToolCallsSurface({spec, onAction}: HbarAppUiVariantProps) {
    return <ToolCallsFrame spec={spec} onAction={onAction} className="hbar-app-ui-tool-calls-empty">{null}</ToolCallsFrame>
}

/** Category dispatcher; every public pattern has an independent TSX surface. */
export function ToolCalls({spec, onAction, toolCallsContent}: HbarAppUiToolCallsProps) {
    const providerContent = useHbarAppUiToolCallsContent()
    const content = toolCallsContent ?? providerContent

    switch (spec.variant) {
        case 1:
            return content?.trace ? <ToolTrace spec={spec} onAction={onAction} content={content.trace}/> : emptyToolCallsSurface({spec, onAction})
        case 2:
            return content?.activity ? <ToolActivity spec={spec} onAction={onAction} content={content.activity}/> : emptyToolCallsSurface({spec, onAction})
        case 3:
            return content?.diff ? <ToolDiffResult spec={spec} onAction={onAction} content={content.diff}/> : emptyToolCallsSurface({spec, onAction})
        case 4:
            return content?.search ? <ToolSearchResults spec={spec} onAction={onAction} content={content.search}/> : emptyToolCallsSurface({spec, onAction})
        case 5:
            return content?.command ? <ToolCommandOutput spec={spec} onAction={onAction} content={content.command}/> : emptyToolCallsSurface({spec, onAction})
        case 6:
            return content?.permissions ? <ToolPermissions spec={spec} onAction={onAction} content={content.permissions}/> : emptyToolCallsSurface({spec, onAction})
        default:
            return emptyToolCallsSurface({spec, onAction})
    }
}
