import {useState} from 'react'
import {
    ChevronDown,
    Copy,
    Eye,
    EyeOff,
    Globe2,
    KeyRound,
    Link2,
    Pause,
    Play,
    Plus,
    RefreshCw,
    RotateCcw,
    Search,
    ShieldCheck,
    Trash2
} from 'lucide-react'
import {
    HbarAppUiButton,
    HbarAppUiIconButton,
    HbarAppUiProgress,
    HbarAppUiSpotlight,
    HbarAppUiStatus,
    HbarAppUiTabs,
    HbarAppUiToolbar
} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'

type IntegrationProps = HbarAppUiVariantProps

function Marketplace({spec, onAction}: IntegrationProps) {
    const [tab, setTab] = useState('All');
    const [query, setQuery] = useState('');
    const [connected, setConnected] = useState<string[]>(['Git provider']);
    const apps = ['Git provider', 'Issue tracker', 'Notifications', 'Storage', 'Calendar'];
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-integration-variant-1"><HbarAppUiToolbar
        title="Integration marketplace" detail="Search, categories and connect"/>
        <div className="hbar-app-ui-inline-search"><Search size={13}/><input value={query}
                                                                             onChange={(event) => setQuery(event.target.value)}
                                                                             placeholder="Search integrations"/></div>
        <HbarAppUiTabs label="Category" value={tab}
                       options={['All', 'Developer', 'Productivity'].map((id) => ({id, label: id}))} onChange={setTab}/>
        <div
            className="hbar-app-ui-integration-market">{apps.filter((app) => app.toLowerCase().includes(query.toLowerCase())).map((app) =>
            <HbarAppUiSpotlight key={app}><Globe2 size={17}/>
                <div><strong>{app}</strong><small>{tab === 'All' ? 'Popular integration' : `${tab} tool`}</small></div>
                <HbarAppUiButton tone={connected.includes(app) ? 'positive' : 'accent'} onClick={() => {
                    setConnected((current) => current.includes(app) ? current.filter((item) => item !== app) : [...current, app]);
                    onAction?.({variantId: spec.id, actionId: 'connect', value: app})
                }}>{connected.includes(app) ? 'Connected' : 'Connect'}</HbarAppUiButton></HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function ConnectionDetail({spec, onAction}: IntegrationProps) {
    const [connected, setConnected] = useState(true);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-integration-variant-2"><HbarAppUiToolbar title="Connection detail"
                                                                                               detail="Scope switches and activity feed"/><HbarAppUiStatus
        value={connected ? 'Connected' : 'Disconnected'} tone={connected ? 'positive' : 'neutral'}/><HbarAppUiSpotlight><strong>Git
        provider</strong><p>Project Atlas · connected by Avery</p><label className="hbar-app-ui-toggle-row"><span>Read repositories</span><input
        type="checkbox" defaultChecked/></label><label
        className="hbar-app-ui-toggle-row"><span>Write pull requests</span><input type="checkbox"/></label>
        <div className="hbar-app-ui-connection-actions"><HbarAppUiButton
            onClick={() => onAction?.({variantId: spec.id, actionId: 'sync'})}><RefreshCw size={13}/>Sync
            now</HbarAppUiButton><HbarAppUiButton tone="danger" onClick={() => {
            setConnected(false);
            onAction?.({variantId: spec.id, actionId: 'disconnect'})
        }}>Disconnect</HbarAppUiButton></div>
    </HbarAppUiSpotlight>
        <div className="hbar-app-ui-activity-feed"><span>Repository synced · 2m ago</span><span>Scope updated · yesterday</span>
        </div>
    </ActionSurfaceFrame>
}

function ApiKeyTable({spec, onAction}: IntegrationProps) {
    const [revealed, setRevealed] = useState<string | undefined>();
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-integration-variant-3"><HbarAppUiToolbar
        title="Integration API keys" detail="Reveal, copy, rotate and revoke"/><HbarAppUiButton tone="accent"
                                                                                                onClick={() => onAction?.({
                                                                                                    variantId: spec.id,
                                                                                                    actionId: 'create'
                                                                                                })}><Plus size={13}/>Create
        key</HbarAppUiButton>
        <div className="hbar-app-ui-api-key-table">{['Production', 'Staging', 'Local'].map((name) => <HbarAppUiSpotlight
            key={name}><KeyRound size={14}/>
            <div><strong>{name}</strong><code>{revealed === name ? 'hb_91a2b3c4d5' : 'hb_••••••••••'}</code><small>Last
                used 2m ago</small></div>
            <HbarAppUiIconButton label="Reveal"
                                 onClick={() => setRevealed(revealed === name ? undefined : name)}>{revealed === name ?
                <EyeOff size={13}/> : <Eye size={13}/>}</HbarAppUiIconButton><HbarAppUiIconButton label="Copy"
                                                                                                  onClick={() => onAction?.({
                                                                                                      variantId: spec.id,
                                                                                                      actionId: 'copy',
                                                                                                      value: name
                                                                                                  })}><Copy size={13}/></HbarAppUiIconButton><HbarAppUiButton
                onClick={() => onAction?.({variantId: spec.id, actionId: 'rotate', value: name})}><RotateCcw size={13}/>Rotate</HbarAppUiButton><HbarAppUiButton
                tone="danger" onClick={() => onAction?.({variantId: spec.id, actionId: 'revoke', value: name})}><Trash2
                size={13}/></HbarAppUiButton></HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function Webhooks({spec, onAction}: IntegrationProps) {
    const [open, setOpen] = useState<string | undefined>();
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-integration-variant-4"><HbarAppUiToolbar title="Webhook endpoints"
                                                                                               detail="Delivery log and replay"/><HbarAppUiButton
        tone="accent" onClick={() => onAction?.({variantId: spec.id, actionId: 'create'})}><Plus size={13}/>Add endpoint</HbarAppUiButton>
        <div className="hbar-app-ui-endpoints"><HbarAppUiSpotlight><Link2 size={14}/>
            <div><strong>https://hooks.hbar.local/runs</strong><small>Active · 98.4% delivered</small></div>
            <HbarAppUiStatus value="Active" tone="positive"/></HbarAppUiSpotlight></div>
        <div
            className="hbar-app-ui-delivery-log">{['delivery_91a2', 'delivery_91a3', 'delivery_91a4'].map((id, index) =>
            <div key={id}>
                <button type="button" onClick={() => setOpen(open === id ? undefined : id)}><ChevronDown size={13}
                                                                                                         className={open === id ? 'is-open' : ''}/><code>{id}</code><HbarAppUiStatus
                    value={index === 1 ? 'Failed' : 'Delivered'}
                    tone={index === 1 ? 'danger' : 'positive'}/><span>run.updated</span></button>
                {open === id && <HbarAppUiSpotlight>
                    <pre>{'{"event":"run.updated","attempt":2}'}</pre>
                    <HbarAppUiButton
                        onClick={() => onAction?.({variantId: spec.id, actionId: 'replay', value: id})}><RotateCcw
                        size={13}/>Replay</HbarAppUiButton></HbarAppUiSpotlight>}</div>)}</div>
    </ActionSurfaceFrame>
}

function OAuthConsent({spec, onAction}: IntegrationProps) {
    const [authorized, setAuthorized] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-integration-variant-5"><HbarAppUiSpotlight
        className="hbar-app-ui-oauth-card"><ShieldCheck size={22}/><strong>Authorize Workspace Calendar</strong><p>This
        app requests access to the selected workspace.</p><label>Workspace<select defaultValue="Project Atlas">
        <option>Project Atlas</option>
        <option>Project Nova</option>
    </select></label>
        <ul>
            <li>View calendar events</li>
            <li>Create events for scheduled runs</li>
            <li>Read attendee names</li>
        </ul>
        <HbarAppUiButton tone="accent" disabled={authorized} onClick={() => {
            setAuthorized(true);
            onAction?.({variantId: spec.id, actionId: 'authorize'})
        }}>{authorized ? 'Authorized' : 'Authorize'}</HbarAppUiButton><HbarAppUiButton onClick={() => onAction?.({
            variantId: spec.id,
            actionId: 'deny'
        })}>Cancel</HbarAppUiButton></HbarAppUiSpotlight></ActionSurfaceFrame>
}

function SyncStatus({spec, onAction}: IntegrationProps) {
    const [paused, setPaused] = useState(false);
    const sources = [{name: 'Git provider', value: 92}, {name: 'Issue tracker', value: 64}, {
        name: 'Storage',
        value: 38
    }];
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-integration-variant-6"><HbarAppUiToolbar title="Sync status"
                                                                                               detail="Per-source progress and failure detail"/><HbarAppUiButton
        onClick={() => {
            setPaused((value) => !value);
            onAction?.({variantId: spec.id, actionId: paused ? 'resume' : 'pause'})
        }}>{paused ? <Play size={13}/> : <Pause size={13}/>}{paused ? 'Resume sync' : 'Pause sync'}</HbarAppUiButton>
        <div className="hbar-app-ui-sync-sources">{sources.map((source) => <HbarAppUiSpotlight key={source.name}>
            <div>
                <strong>{source.name}</strong><small>{source.value === 38 ? 'Rate limited · retry in 2m' : paused ? 'Paused' : 'Syncing records'}</small>
            </div>
            <HbarAppUiProgress value={paused ? Math.max(0, source.value - 8) : source.value}
                               label={`${source.name} sync`}
                               tone={source.value === 38 ? 'warning' : 'accent'}/><span>{source.value}%</span>{source.value === 38 &&
            <HbarAppUiButton
                onClick={() => onAction?.({variantId: spec.id, actionId: 'retry', value: source.name})}><RotateCcw
                size={13}/>Retry</HbarAppUiButton>}</HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

export function Integrations({spec, onAction}: IntegrationProps) {
    switch (spec.variant) {
        case 1:
            return <Marketplace spec={spec} onAction={onAction}/>;
        case 2:
            return <ConnectionDetail spec={spec} onAction={onAction}/>;
        case 3:
            return <ApiKeyTable spec={spec} onAction={onAction}/>;
        case 4:
            return <Webhooks spec={spec} onAction={onAction}/>;
        case 5:
            return <OAuthConsent spec={spec} onAction={onAction}/>;
        case 6:
            return <SyncStatus spec={spec} onAction={onAction}/>;
        default:
            return <Marketplace spec={spec} onAction={onAction}/>
    }
}
