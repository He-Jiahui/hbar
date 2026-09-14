import {useState} from 'react'
import {AlertTriangle, Check, ChevronDown, FileCode2, Filter, KeyRound, ShieldAlert, ShieldCheck, X} from 'lucide-react'
import {
    HbarAppUiButton,
    HbarAppUiDialog,
    HbarAppUiProgress,
    HbarAppUiSpotlight,
    HbarAppUiStatus,
    HbarAppUiToolbar
} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'
import {seededNumber} from './helpers'

type ApprovalProps = HbarAppUiVariantProps

function InlineApproval({spec, onAction}: ApprovalProps) {
    const [decision, setDecision] = useState<'pending' | 'allowed' | 'denied'>('pending')
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-approval-variant-1"><HbarAppUiToolbar title="Approval required"
                                                                                            detail="Review the impact before continuing"/><HbarAppUiStatus
        value={decision === 'pending' ? 'Waiting for you' : decision}
        tone={decision === 'allowed' ? 'positive' : decision === 'denied' ? 'danger' : 'warning'}/><HbarAppUiSpotlight
        className="hbar-app-ui-approval-card"><ShieldAlert size={20}/>
        <div><strong>Remove archived workspace data</strong><p>This will delete 18 files and cannot be undone.</p>
            <dl>
                <div>
                    <dt>Scope</dt>
                    <dd>archive/</dd>
                </div>
                <div>
                    <dt>Estimate</dt>
                    <dd>2.4 seconds</dd>
                </div>
            </dl>
        </div>
        <div className="hbar-app-ui-approval-actions"><HbarAppUiButton disabled={decision !== 'pending'} tone="accent"
                                                                       onClick={() => {
                                                                           setDecision('allowed');
                                                                           onAction?.({
                                                                               variantId: spec.id,
                                                                               actionId: 'confirm',
                                                                               value: 'allow'
                                                                           })
                                                                       }}><Check size={13}/>Allow once</HbarAppUiButton><HbarAppUiButton
            disabled={decision !== 'pending'} onClick={() => {
            setDecision('denied');
            onAction?.({variantId: spec.id, actionId: 'confirm', value: 'deny'})
        }}><X size={13}/>Deny</HbarAppUiButton></div>
    </HbarAppUiSpotlight></ActionSurfaceFrame>
}

function ApprovalDialog({spec, onAction}: ApprovalProps) {
    const [open, setOpen] = useState(false)
    const close = () => setOpen(false)
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-approval-variant-2"><HbarAppUiToolbar title="Protected action"
                                                                                            detail="A diff is available before approval"/><HbarAppUiButton
        tone="accent" onClick={() => {
        setOpen(true);
        onAction?.({variantId: spec.id, actionId: 'open'})
    }}><ShieldCheck size={14}/>Review diff</HbarAppUiButton><HbarAppUiSpotlight
        className="hbar-app-ui-approval-summary"><FileCode2 size={17}/>
        <div><strong>Update workspace permissions</strong><small>3 files · 2 additions · 1 removal</small></div>
        <HbarAppUiStatus value="Needs decision" tone="warning"/></HbarAppUiSpotlight><HbarAppUiDialog open={open}
                                                                                                      title="Approve workspace change"
                                                                                                      onClose={close}
                                                                                                      footer={<>
                                                                                                          <HbarAppUiButton
                                                                                                              onClick={close}>Deny</HbarAppUiButton><HbarAppUiButton
                                                                                                          tone="accent"
                                                                                                          onClick={() => {
                                                                                                              close();
                                                                                                              onAction?.({
                                                                                                                  variantId: spec.id,
                                                                                                                  actionId: 'confirm',
                                                                                                                  value: 'allow-once'
                                                                                                              })
                                                                                                          }}>Allow
                                                                                                          once</HbarAppUiButton><HbarAppUiButton
                                                                                                          onClick={() => {
                                                                                                              close();
                                                                                                              onAction?.({
                                                                                                                  variantId: spec.id,
                                                                                                                  actionId: 'confirm',
                                                                                                                  value: 'always-allow'
                                                                                                              })
                                                                                                          }}>Always
                                                                                                          allow</HbarAppUiButton></>}>
        <pre className="hbar-app-ui-diff-code"><span className="is-removed">− permissions: read</span><span
            className="is-added">+ permissions: read, write</span></pre>
    </HbarAppUiDialog></ActionSurfaceFrame>
}

function BatchApproval({spec, onAction}: ApprovalProps) {
    const items = ['Delete archive/2025', 'Run migration.sql', 'Publish release notes', 'Upload diagnostic bundle']
    const [selected, setSelected] = useState<string[]>(items.slice(0, 2))
    const toggle = (item: string) => setSelected((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-approval-variant-3"><HbarAppUiToolbar title="Approval queue"
                                                                                            detail={`${selected.length} selected · risk is shown per item`}/><label
        className="hbar-app-ui-select-all"><input type="checkbox" checked={selected.length === items.length}
                                                  onChange={() => setSelected(selected.length === items.length ? [] : items)}/>Select
        all</label><HbarAppUiButton tone="accent" disabled={!selected.length} onClick={() => onAction?.({
        variantId: spec.id,
        actionId: 'confirm',
        value: `${selected.length} approved`
    })}><Check size={13}/>Approve selected</HbarAppUiButton>
        <div
            className="hbar-app-ui-approval-queue">{items.slice(0, Math.max(2, Math.min(items.length, spec.profile.itemCount))).map((item, index) =>
            <HbarAppUiSpotlight key={item}><input type="checkbox" checked={selected.includes(item)}
                                                  onChange={() => toggle(item)} aria-label={`Select ${item}`}/>
                <div><strong>{item}</strong><small>Requested by hbar · scope {index + 1}</small></div>
                <HbarAppUiStatus value={index % 2 ? 'Medium risk' : 'High risk'}
                                 tone={index % 2 ? 'warning' : 'danger'}/><ChevronDown
                    size={13}/></HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function PermissionRequest({spec, onAction}: ApprovalProps) {
    const scopes = ['Read workspace files', 'Write generated artifacts', 'Access external API', 'View run history']
    const [granted, setGranted] = useState<string[]>(scopes.slice(0, 2))
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-approval-variant-4"><HbarAppUiToolbar title="Permission request"
                                                                                            detail="External tool access is itemised"/><HbarAppUiStatus
        value="Awaiting consent" tone="warning"/><HbarAppUiSpotlight
        className="hbar-app-ui-permission-request"><KeyRound size={19}/>
        <div><strong>Browser automation tool</strong><p>Requesting scoped access for this
            workspace.</p>{scopes.slice(0, Math.max(2, Math.min(scopes.length, spec.profile.itemCount))).map((scope) =>
            <label key={scope}><input type="checkbox" checked={granted.includes(scope)}
                                      onChange={() => setGranted((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope])}/>{scope}
            </label>)}</div>
        <HbarAppUiButton tone="accent" onClick={() => onAction?.({
            variantId: spec.id,
            actionId: 'confirm',
            value: granted.join(',')
        })}>Grant {granted.length} scopes</HbarAppUiButton></HbarAppUiSpotlight></ActionSurfaceFrame>
}

function CostApproval({spec, onAction}: ApprovalProps) {
    const [approved, setApproved] = useState(false)
    const estimate = seededNumber(spec.profile.seed, 8, 34)
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-approval-variant-5"><HbarAppUiToolbar title="High-cost operation"
                                                                                            detail="Review the estimate breakdown"/><HbarAppUiStatus
        value={approved ? 'Queued' : 'Approval needed'} tone={approved ? 'positive' : 'warning'}/><HbarAppUiSpotlight
        className="hbar-app-ui-cost-approval"><AlertTriangle size={19}/>
        <div><strong>Generate a full workspace report</strong><p>Long-running work will use the shared budget.</p>
            <HbarAppUiProgress value={estimate} label="Estimated budget usage" tone="warning"/>
            <dl>
                <div>
                    <dt>Estimated time</dt>
                    <dd>{estimate + 4}s</dd>
                </div>
                <div>
                    <dt>Estimated credits</dt>
                    <dd>{estimate / 2} units</dd>
                </div>
                <div>
                    <dt>Concurrent workers</dt>
                    <dd>3</dd>
                </div>
            </dl>
        </div>
        <HbarAppUiButton tone="accent" disabled={approved} onClick={() => {
            setApproved(true);
            onAction?.({variantId: spec.id, actionId: 'confirm', value: 'queue'})
        }}>{approved ? 'Queued' : 'Approve run'}</HbarAppUiButton></HbarAppUiSpotlight></ActionSurfaceFrame>
}

function AuditApprovals({spec, onAction}: ApprovalProps) {
    const [filter, setFilter] = useState('All')
    const rows = [{action: 'Read workspace files', result: 'Allowed', when: '2m ago'}, {
        action: 'Delete archive/2025',
        result: 'Denied',
        when: '18m ago'
    }, {action: 'Publish release notes', result: 'Allowed', when: '1h ago'}, {
        action: 'Access external API',
        result: 'Denied',
        when: 'Yesterday'
    }]
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-approval-variant-6"><HbarAppUiToolbar title="Approval audit"
                                                                                            detail="Previously allowed and denied actions"/>
        <div className="hbar-app-ui-log-filters">{['All', 'Allowed', 'Denied'].map((option) => <HbarAppUiButton
            key={option} className={filter === option ? 'is-selected' : ''} onClick={() => {
            setFilter(option);
            onAction?.({variantId: spec.id, actionId: 'filter', value: option})
        }}><Filter size={12}/>{option}</HbarAppUiButton>)}</div>
        <div
            className="hbar-app-ui-audit-list">{rows.filter((row) => filter === 'All' || row.result === filter).map((row) =>
            <HbarAppUiSpotlight key={row.action}>
                <div><strong>{row.action}</strong><small>{row.when}</small></div>
                <HbarAppUiStatus value={row.result} tone={row.result === 'Allowed' ? 'positive' : 'danger'}/>
                <button type="button"
                        onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: row.action})}>Details
                </button>
            </HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

export function AgentApproval({spec, onAction}: ApprovalProps) {
    switch (spec.variant) {
        case 1:
            return <InlineApproval spec={spec} onAction={onAction}/>
        case 2:
            return <ApprovalDialog spec={spec} onAction={onAction}/>
        case 3:
            return <BatchApproval spec={spec} onAction={onAction}/>
        case 4:
            return <PermissionRequest spec={spec} onAction={onAction}/>
        case 5:
            return <CostApproval spec={spec} onAction={onAction}/>
        case 6:
            return <AuditApprovals spec={spec} onAction={onAction}/>
        default:
            return <InlineApproval spec={spec} onAction={onAction}/>
    }
}
