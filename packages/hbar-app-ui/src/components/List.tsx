import { LumenButton, LumenInput } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../icon'
import {useState} from 'react'
import {Archive, ChevronDown, ChevronRight, Filter, Inbox, RotateCcw, Search, Undo2} from 'lucide-react'
import {
    HbarAppUiButton,
    HbarAppUiProgress,
    HbarAppUiSpotlight,
    HbarAppUiStatus,
    HbarAppUiTabs,
    HbarAppUiToolbar
} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'

type ListProps = HbarAppUiVariantProps

function ExpandMetrics({spec, onAction}: ListProps) {
    const [open, setOpen] = useState<string | undefined>();
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-list-variant-1"><HbarAppUiToolbar
        title="Defined metrics" detail="Expand a row to see its definition"/>
        <div
            className="hbar-app-ui-metric-rows">{['Active runs', 'Review time', 'Success rate', 'Queue depth'].map((metric, index) =>
            <div key={metric}>
                <LumenButton type="button" onClick={() => setOpen(open === metric ? undefined : metric)}><HbarAppUiIcon icon={ChevronRight} tier="sm"

                    className={open === metric ? 'is-open' : ''}/><strong>{metric}</strong><b>{[24, '2.4h', '98.4%', 8][index]}</b>
                </LumenButton>
                {open === metric &&
                    <HbarAppUiSpotlight><p>Computed from the current workspace projection over the selected period.</p>
                        <code>definition:
                            aggregate({metric.toLowerCase().replace(' ', '_')})</code></HbarAppUiSpotlight>}
            </div>)}</div>
    </ActionSurfaceFrame>
}

function SpendList({spec, onAction}: ListProps) {
    const [period, setPeriod] = useState('7d');
    const [selected, setSelected] = useState('Workspace');
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-list-variant-2"><HbarAppUiToolbar
        title="Ranked spend" detail={period}/><HbarAppUiTabs label="Period" value={period}
                                                             options={[{id: '24h', label: '24h'}, {
                                                                 id: '7d',
                                                                 label: '7d'
                                                             }, {id: '30d', label: '30d'}]}
                                                             onChange={(value) => setPeriod(value)}/>
        <div className="hbar-app-ui-ranked-list">{['Workspace', 'Automation', 'Review', 'Archive'].map((name, index) =>
            <LumenButton type="button" className={selected === name ? 'is-selected' : ''} key={name}
                    onClick={() => setSelected(name)}><span>{index + 1}</span><strong>{name}</strong><HbarAppUiProgress
                value={72 - index * 13} label={`${name} spend`} tone="accent"/><b>${(32 - index * 5.2).toFixed(2)}</b>
            </LumenButton>)}</div>
        <HbarAppUiButton tone="accent" onClick={() => onAction?.({
            variantId: spec.id,
            actionId: 'open',
            value: selected
        })}>Open {selected}</HbarAppUiButton></ActionSurfaceFrame>
}

function SecurityFeed({spec, onAction}: ListProps) {
    const [filter, setFilter] = useState('All');
    const events = [{kind: 'Login', text: 'Avery signed in', tone: 'positive' as const}, {
        kind: 'Policy',
        text: 'Permission changed',
        tone: 'warning' as const
    }, {kind: 'Export', text: 'Report downloaded', tone: 'neutral' as const}, {
        kind: 'Alert',
        text: 'Failed login blocked',
        tone: 'danger' as const
    }];
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-list-variant-3"><HbarAppUiToolbar
        title="Security events" detail="Scroll to reveal older events"/>
        <div className="hbar-app-ui-chip-row">{['All', 'Login', 'Policy', 'Alert'].map((item) => <HbarAppUiButton
            className={filter === item ? 'is-selected' : ''} key={item} onClick={() => {
            setFilter(item);
            onAction?.({variantId: spec.id, actionId: 'filter', value: item})
        }}><HbarAppUiIcon icon={Filter} tier="xs" />{item}</HbarAppUiButton>)}</div>
        <div
            className="hbar-app-ui-security-feed">{events.filter((event) => filter === 'All' || event.kind === filter).map((event) =>
            <HbarAppUiSpotlight key={event.text}><HbarAppUiStatus value={event.kind} tone={event.tone}/>
                <div><strong>{event.text}</strong><small>Today · 10:24</small></div>
                <HbarAppUiIcon icon={ChevronRight} tier="sm" /></HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function ReorderQueue({spec, onAction}: ListProps) {
    const [items, setItems] = useState(['Draft release', 'Review permissions', 'Publish notes']);
    const move = (index: number, direction: number) => {
        const next = [...items];
        const target = index + direction;
        if (target < 0 || target >= next.length) return;
        [next[index], next[target]] = [next[target]!, next[index]!];
        setItems(next);
        onAction?.({variantId: spec.id, actionId: 'drag', value: next.join('|')})
    };
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-list-variant-4"><HbarAppUiToolbar
        title="Publishing queue" detail="Pointer or keyboard reorder"/><HbarAppUiStatus value="Live updates"
                                                                                        tone="positive"/>
        <ol className="hbar-app-ui-reorder-list">{items.map((item, index) => <li key={item}>
            <span>{index + 1}</span><strong>{item}</strong>
            <LumenButton type="button" aria-label={`Move ${item} up`} onClick={() => move(index, -1)}>↑</LumenButton>
            <LumenButton type="button" aria-label={`Move ${item} down`} onClick={() => move(index, 1)}>↓</LumenButton>
        </li>)}</ol>
        <p className="hbar-app-ui-live-note" aria-live="polite">Drag or use the arrow buttons to change order.</p>
    </ActionSurfaceFrame>
}

function AssetLibrary({spec, onAction}: ListProps) {
    const [selected, setSelected] = useState<string[]>([]);
    const assets = ['design.fig', 'report.csv', 'archive.zip', 'brief.md'];
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-list-variant-5"><HbarAppUiToolbar
        title="Asset library" detail={`${selected.length} selected`}/><HbarAppUiButton
        onClick={() => setSelected([])}><HbarAppUiIcon icon={Undo2} tier="sm" />Clear</HbarAppUiButton>
        <div className="hbar-app-ui-asset-list">{assets.map((asset) => <label key={asset}><LumenInput type="checkbox"
                                                                                                 checked={selected.includes(asset)}
                                                                                                 onChange={() => setSelected((current) => current.includes(asset) ? current.filter((item) => item !== asset) : [...current, asset])}/><span>{asset}<small>Updated today</small></span></label>)}</div>
        {selected.length > 0 && <div className="hbar-app-ui-bulk-bar"><HbarAppUiButton onClick={() => onAction?.({
            variantId: spec.id,
            actionId: 'archive',
            value: String(selected.length)
        })}><HbarAppUiIcon icon={Archive} tier="sm" />Archive selected</HbarAppUiButton></div>}</ActionSurfaceFrame>
}

function WebhookLog({spec, onAction}: ListProps) {
    const [open, setOpen] = useState<string | undefined>();
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-list-variant-6"><HbarAppUiToolbar
        title="Webhook deliveries" detail="Outcome and endpoint filters"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'filter', value: 'failed'})}><HbarAppUiIcon icon={Filter} tier="sm" />Failed
        only</HbarAppUiButton>
        <div className="hbar-app-ui-webhook-log">{['delivery_91a2', 'delivery_91a3', 'delivery_91a4'].map((id, index) =>
            <div key={id}>
                <LumenButton type="button" onClick={() => setOpen(open === id ? undefined : id)}><HbarAppUiIcon icon={ChevronDown} tier="sm"
                                                                                                         className={open === id ? 'is-open' : ''}/><code>{id}</code><HbarAppUiStatus
                    value={index === 1 ? 'Failed' : 'Delivered'}
                    tone={index === 1 ? 'danger' : 'positive'}/><span>/events/run.updated</span></LumenButton>
                {open === id && <HbarAppUiSpotlight>
                    <pre>{'{"event":"run.updated","attempt":2,"duration":320}'}</pre>
                    <HbarAppUiButton
                        onClick={() => onAction?.({variantId: spec.id, actionId: 'retry', value: id})}><HbarAppUiIcon icon={RotateCcw} tier="sm"
                        />Replay</HbarAppUiButton></HbarAppUiSpotlight>}</div>)}</div>
    </ActionSurfaceFrame>
}

function SupplierDirectory({spec, onAction}: ListProps) {
    const [query, setQuery] = useState('');
    const suppliers = ['Avery Systems', 'Mina Cloud', 'Jon Logistics', 'Sam Studio'];
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-list-variant-7"><HbarAppUiToolbar
        title="Supplier directory" detail="Search and category filter"/>
        <div className="hbar-app-ui-inline-search"><HbarAppUiIcon icon={Search} tier="sm" /><LumenInput value={query}
                                                                             onChange={(event) => setQuery(event.target.value)}
                                                                             placeholder="Search suppliers"/></div>
        <HbarAppUiButton onClick={() => onAction?.({
            variantId: spec.id,
            actionId: 'filter',
            value: 'category'
        })}>Category</HbarAppUiButton>
        <div className="hbar-app-ui-directory">
            <header><span>Supplier</span><span>Category</span><span>Status</span></header>
            {suppliers.filter((supplier) => supplier.toLowerCase().includes(query.toLowerCase())).map((supplier, index) =>
                <div key={supplier}>
                    <strong>{supplier}</strong><span>{index % 2 ? 'Design' : 'Infrastructure'}</span><HbarAppUiStatus
                    value="Active" tone="positive"/></div>)}</div>
    </ActionSurfaceFrame>
}

function InboxList({spec, onAction}: ListProps) {
    const [archived, setArchived] = useState<string[]>([]);
    const [undo, setUndo] = useState<string | undefined>();
    const messages = ['Workspace sync complete', 'Approval needs your decision', 'Report export ready'];
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-list-variant-8"><HbarAppUiToolbar
        title="Inbox" detail={`${messages.length - archived.length} unread`}/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'filter', value: 'unread'})}><HbarAppUiIcon icon={Inbox} tier="sm"
        />Unread</HbarAppUiButton>
        <div
            className="hbar-app-ui-inbox-list">{messages.filter((message) => !archived.includes(message)).map((message, index) =>
            <HbarAppUiSpotlight key={message}><span className="hbar-app-ui-avatar">{message[0]}</span>
                <div><strong>{message}</strong><small>{index + 1}m ago</small></div>
                <HbarAppUiButton onClick={() => {
                    setArchived((current) => [...current, message]);
                    setUndo(message);
                    onAction?.({variantId: spec.id, actionId: 'archive', value: message})
                }}><HbarAppUiIcon icon={Archive} tier="sm" /></HbarAppUiButton><HbarAppUiButton onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'snooze',
                    value: message
                })}>Snooze</HbarAppUiButton></HbarAppUiSpotlight>)}</div>
        {undo &&
            <div className="hbar-app-ui-undo-bar" aria-live="polite">Archived {undo}<HbarAppUiButton onClick={() => {
                setArchived((current) => current.filter((item) => item !== undo));
                setUndo(undefined)
            }}><HbarAppUiIcon icon={Undo2} tier="sm" />Undo</HbarAppUiButton></div>}</ActionSurfaceFrame>
}

function Contacts({spec, onAction}: ListProps) {
    const [letter, setLetter] = useState('A');
    const contacts = ['Avery Chen', 'Iris Wong', 'Jon Bell', 'Lee Park', 'Mina Patel', 'Sam Rivera'];
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-list-variant-9"><HbarAppUiToolbar
        title="Contacts" detail="Alphabet jump rail"/><HbarAppUiButton onClick={() => onAction?.({
        variantId: spec.id,
        actionId: 'filter',
        value: 'relationship'
    })}>Relationship</HbarAppUiButton>
        <div className="hbar-app-ui-contact-layout">
            <nav>{['A', 'I', 'J', 'L', 'M', 'S'].map((item) => <LumenButton type="button"
                                                                       className={letter === item ? 'is-active' : ''}
                                                                       key={item}
                                                                       onClick={() => setLetter(item)}>{item}</LumenButton>)}</nav>
            <div>{contacts.filter((contact) => contact.startsWith(letter)).map((contact) => <HbarAppUiSpotlight
                key={contact}><span
                className="hbar-app-ui-avatar">{contact[0]}</span><strong>{contact}</strong><small>Teammate</small></HbarAppUiSpotlight>)}</div>
        </div>
    </ActionSurfaceFrame>
}

function Runbook({spec, onAction}: ListProps) {
    const [done, setDone] = useState(2);
    const steps = ['Acknowledge incident', 'Check service health', 'Rollback deployment', 'Notify stakeholders'];
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-list-variant-10"><HbarAppUiToolbar
        title="Incident runbook" detail={`${done} of ${steps.length} complete`}/><HbarAppUiStatus
        value={done === steps.length ? 'Resolved' : 'In progress'}
        tone={done === steps.length ? 'positive' : 'warning'}/><HbarAppUiProgress value={done / steps.length * 100}
                                                                                  label="Runbook progress"/>
        <div className="hbar-app-ui-runbook-list">{steps.map((step, index) => <LumenButton type="button"
                                                                                      className={index < done ? 'is-complete' : ''}
                                                                                      key={step} onClick={() => {
            setDone(Math.max(done, index + 1));
            onAction?.({variantId: spec.id, actionId: 'step', value: step})
        }}>
            <span>{index < done ? '✓' : index + 1}</span><strong>{step}</strong><small>{index < done ? 'Done' : 'Pending'}</small>
        </LumenButton>)}</div>
    </ActionSurfaceFrame>
}

function Leaderboard({spec, onAction}: ListProps) {
    const [measure, setMeasure] = useState('Resolved');
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-list-variant-11"><HbarAppUiToolbar
        title="Support leaderboard" detail="Measure and period"/><HbarAppUiTabs label="Measure" value={measure}
                                                                                options={[{
                                                                                    id: 'Resolved',
                                                                                    label: 'Resolved'
                                                                                }, {
                                                                                    id: 'Speed',
                                                                                    label: 'Speed'
                                                                                }, {id: 'CSAT', label: 'CSAT'}]}
                                                                                onChange={(value) => setMeasure(value)}/>
        <div className="hbar-app-ui-leaderboard">{['Avery', 'Mina', 'Jon', 'Sam'].map((person, index) => <div
            key={person}>
            <span>{index + 1}</span><strong>{person}</strong><b>{measure === 'CSAT' ? `${98 - index * 4}%` : 42 - index * 5}</b><small
            className={index === 2 ? 'is-down' : 'is-up'}>{index === 2 ? '↓ 1' : '↑ 2'}</small></div>)}</div>
    </ActionSurfaceFrame>
}

function FileTree({spec, onAction}: ListProps) {
    const [open, setOpen] = useState<Record<string, boolean>>({src: true, docs: true});
    const toggle = (key: string) => setOpen((current) => ({...current, [key]: !current[key]}));
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-list-variant-12"><HbarAppUiToolbar
        title="File tree" detail="Keyboard traversal and indent guides"/>
        <div className="hbar-app-ui-file-tree">
            <LumenButton type="button" onClick={() => toggle('src')}><HbarAppUiIcon icon={ChevronDown} tier="sm"
                                                                             className={open.src ? '' : 'is-collapsed'}/>src/
            </LumenButton>
            {open.src && <div>
                <LumenButton type="button"
                        onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: 'App.tsx'})}> App.tsx
                </LumenButton>
                <LumenButton type="button"> ActivityPanel.tsx</LumenButton>
            </div>}
            <LumenButton type="button" onClick={() => toggle('docs')}><HbarAppUiIcon icon={ChevronDown} tier="sm"
                                                                              className={open.docs ? '' : 'is-collapsed'}/>docs/
            </LumenButton>
            {open.docs && <div>
                <LumenButton type="button"> architecture.md</LumenButton>
                <LumenButton type="button"> testing.md</LumenButton>
            </div>}</div>
    </ActionSurfaceFrame>
}

export function List({spec, onAction}: ListProps) {
    switch (spec.variant) {
        case 1:
            return <ExpandMetrics spec={spec} onAction={onAction}/>;
        case 2:
            return <SpendList spec={spec} onAction={onAction}/>;
        case 3:
            return <SecurityFeed spec={spec} onAction={onAction}/>;
        case 4:
            return <ReorderQueue spec={spec} onAction={onAction}/>;
        case 5:
            return <AssetLibrary spec={spec} onAction={onAction}/>;
        case 6:
            return <WebhookLog spec={spec} onAction={onAction}/>;
        case 7:
            return <SupplierDirectory spec={spec} onAction={onAction}/>;
        case 8:
            return <InboxList spec={spec} onAction={onAction}/>;
        case 9:
            return <Contacts spec={spec} onAction={onAction}/>;
        case 10:
            return <Runbook spec={spec} onAction={onAction}/>;
        case 11:
            return <Leaderboard spec={spec} onAction={onAction}/>;
        case 12:
            return <FileTree spec={spec} onAction={onAction}/>;
        default:
            return <ExpandMetrics spec={spec} onAction={onAction}/>
    }
}
