import {ChevronRight} from 'lucide-react'
import type {HbarAppUiToolCallsPermissionsContent} from './ToolCallsContent'
import {uniqueHbarAppUiToolCallsItems} from './ToolCallsContent'
import {reportToolCallsAction, ToolCallsButton, ToolCallsFrame, ToolCallsGlyph, ToolCallsToggle, type ToolCallsSurfaceProps} from './ToolCallsPrimitives'

export function ToolPermissions({spec, onAction, content}: ToolCallsSurfaceProps & {readonly content: HbarAppUiToolCallsPermissionsContent}) {
    const groups = uniqueHbarAppUiToolCallsItems(content.groups)
    return <ToolCallsFrame spec={spec} onAction={onAction} className="hbar-app-ui-tool-calls-permissions">
        <header><h2>{content.title}</h2><span>{content.pendingLabel}</span></header>
        <main data-hbar-app-ui-expected-maximum={content.groupStrategy.expectedMaximum} data-hbar-app-ui-list-strategy={content.groupStrategy.kind}>
            {groups.map((group) => <section key={group.id}><h3>{group.label}</h3><ul>{uniqueHbarAppUiToolCallsItems(group.items).map((item) => {
                const statusAfterActions = item.kind === 'request' && item.statusLabel !== undefined && (item.actions?.length ?? 0) > 0
                return <li className={`is-${item.kind}`} key={item.id}>
                    <div><strong>{item.name}</strong><small>{item.description}</small>{item.statusLabel && !statusAfterActions && <span>{item.statusLabel}</span>}</div>
                    {item.kind === 'request' && item.actions && <nav>{item.actions.map((action) => <ToolCallsButton className={action.tone ? `is-${action.tone}` : ''} key={action.id}
                                                                                                                        onClick={() => reportToolCallsAction(onAction, spec, 'permission-request-action', `${item.id}:${action.id}`)}>
                        {action.id === 'view' && <ToolCallsGlyph icon={ChevronRight} tier="sm"/>}{action.label}
                    </ToolCallsButton>)}</nav>}
                    {statusAfterActions && <span className="hbar-app-ui-tool-calls-request-status">{item.statusLabel}</span>}
                    {item.kind === 'toggle' && item.enabled !== undefined && item.toggleLabel ? (
                        <ToolCallsToggle
                            checked={item.enabled}
                            label={item.toggleLabel}
                            onClick={() => reportToolCallsAction(onAction, spec, 'toggle-permission', `${item.id}:${!item.enabled}`)}
                        />
                    ) : null}
                </li>
            })}</ul></section>)}
        </main>
    </ToolCallsFrame>
}
