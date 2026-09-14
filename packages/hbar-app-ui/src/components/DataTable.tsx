import {useMemo, useState} from 'react'
import {Check, ChevronRight, Columns3, Edit3, LoaderCircle, Search, SlidersHorizontal, X} from 'lucide-react'
import {HbarAppUiButton, HbarAppUiDataTable, HbarAppUiSpotlight, HbarAppUiStatus, HbarAppUiToolbar} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'
import {workspaceRows} from './data'

type TableProps = HbarAppUiVariantProps

function FacetedTable({spec, onAction}: TableProps) {
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('All');
    const [columns, setColumns] = useState('All');
    const rows = workspaceRows.filter((row) => (filter === 'All' || row.status === filter) && `${row.name} ${row.detail}`.toLowerCase().includes(query.toLowerCase()));
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-table-variant-1"><HbarAppUiToolbar
        title="Records" detail="Faceted filters and column visibility"/>
        <div className="hbar-app-ui-inline-search"><Search size={13}/><input value={query}
                                                                             onChange={(event) => setQuery(event.target.value)}
                                                                             placeholder="Search records"/></div>
        <select aria-label="Status filter" value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option>All</option>
            <option>Healthy</option>
            <option>Running</option>
            <option>Blocked</option>
        </select><HbarAppUiButton onClick={() => setColumns(columns === 'All' ? 'Compact' : 'All')}><Columns3
            size={13}/>{columns} columns</HbarAppUiButton><HbarAppUiDataTable
            rows={columns === 'Compact' ? rows.map((row) => ({...row, detail: ''})) : rows}
            onSelect={(id) => onAction?.({variantId: spec.id, actionId: 'open', value: id})}/></ActionSurfaceFrame>
}

function SelectableTable({spec, onAction}: TableProps) {
    const [selected, setSelected] = useState<string[]>([]);
    const [page, setPage] = useState(1);
    const rows = workspaceRows.slice((page - 1) * 3, page * 3);
    const all = selected.length === rows.length;
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-table-variant-2"><HbarAppUiToolbar
        title="Selectable records" detail={`${selected.length} selected`}/><label><input type="checkbox" checked={all}
                                                                                         onChange={() => setSelected(all ? [] : rows.map((row) => row.id))}/>Select
        page</label>{selected.length > 0 && <div className="hbar-app-ui-bulk-bar"><HbarAppUiButton onClick={() => {
        onAction?.({variantId: spec.id, actionId: 'archive', value: String(selected.length)});
        setSelected([])
    }}>Archive</HbarAppUiButton><HbarAppUiButton onClick={() => setSelected([])}><X size={13}/>Clear</HbarAppUiButton>
    </div>}
        <div className="hbar-app-ui-simple-table">{rows.map((row) => <label key={row.id}><input type="checkbox"
                                                                                                checked={selected.includes(row.id)}
                                                                                                onChange={() => setSelected((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])}/><span><strong>{row.name}</strong><small>{row.detail}</small></span><HbarAppUiStatus
            value={row.status}
            tone={row.status === 'Healthy' ? 'positive' : row.status === 'Blocked' ? 'danger' : 'warning'}/></label>)}</div>
        <div className="hbar-app-ui-pagination"><HbarAppUiButton disabled={page === 1}
                                                                 onClick={() => setPage(1)}>Previous</HbarAppUiButton><span>Page {page} of 2</span><HbarAppUiButton
            disabled={page === 2} onClick={() => setPage(2)}>Next</HbarAppUiButton></div>
    </ActionSurfaceFrame>
}

function InlineEditTable({spec, onAction}: TableProps) {
    const [editing, setEditing] = useState<string | undefined>();
    const [saved, setSaved] = useState<string[]>([]);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-table-variant-3"><HbarAppUiToolbar
        title="Inline editing" detail="Optimistic save states"/><HbarAppUiStatus
        value={saved.length ? `${saved.length} saved` : 'No pending changes'}
        tone={saved.length ? 'positive' : 'neutral'}/>
        <div className="hbar-app-ui-inline-edit-table">{workspaceRows.slice(0, 4).map((row) => <div key={row.id}>
            <span><strong>{row.name}</strong><small>{row.status}</small></span>{editing === row.id ? <><input
            defaultValue={row.value} aria-label={`${row.name} value`}/><HbarAppUiButton tone="accent" onClick={() => {
            setSaved((current) => [...current, row.id]);
            setEditing(undefined);
            onAction?.({variantId: spec.id, actionId: 'save', value: row.id})
        }}><Check size={13}/>Save</HbarAppUiButton></> : <><b>{row.value}</b><HbarAppUiButton
            onClick={() => setEditing(row.id)}><Edit3 size={13}/>Edit</HbarAppUiButton></>}</div>)}</div>
    </ActionSurfaceFrame>
}

function ExpandableTable({spec, onAction}: TableProps) {
    const [open, setOpen] = useState<string | undefined>();
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-table-variant-4"><HbarAppUiToolbar
        title="Expandable records" detail="Details open in place"/><HbarAppUiButton onClick={() => setOpen(undefined)}>Collapse
        all</HbarAppUiButton>
        <div className="hbar-app-ui-expandable-table">{workspaceRows.slice(0, 5).map((row) => <div key={row.id}>
            <button type="button" onClick={() => setOpen(open === row.id ? undefined : row.id)}><ChevronRight size={14}
                                                                                                              className={open === row.id ? 'is-open' : ''}/><strong>{row.name}</strong><HbarAppUiStatus
                value={row.status} tone={row.status === 'Healthy' ? 'positive' : 'warning'}/><span>{row.value}</span>
            </button>
            {open === row.id &&
                <HbarAppUiSpotlight><p>{row.detail}</p><code>record:{row.id} · updated just now</code><HbarAppUiButton
                    onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: row.id})}>Open
                    detail</HbarAppUiButton></HbarAppUiSpotlight>}</div>)}</div>
    </ActionSurfaceFrame>
}

function GroupedTable({spec, onAction}: TableProps) {
    const [density, setDensity] = useState('comfortable');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className={`hbar-app-ui-table-variant-5 hbar-app-ui-table-density-${density}`}><HbarAppUiToolbar
        title="Grouped records" detail="Sticky header and density control"/><HbarAppUiButton
        onClick={() => setDensity(density === 'compact' ? 'comfortable' : density === 'comfortable' ? 'spacious' : 'compact')}><SlidersHorizontal
        size={13}/>{density}</HbarAppUiButton>
        <div className="hbar-app-ui-grouped-table">
            <header><span>Name</span><span>Status</span><span>Value</span></header>
            {['Operations', 'Operations', 'Review', 'Review', 'Archive'].map((group, index) => <div
                key={`${group}-${index}`}>
                <strong>{index === 0 || group !== ['Operations', 'Operations', 'Review', 'Review', 'Archive'][index - 1] ? group : ''}</strong><span>{workspaceRows[index]?.name}</span><HbarAppUiStatus
                value={workspaceRows[index]?.status ?? 'Healthy'}
                tone="positive"/><span>{workspaceRows[index]?.value}</span></div>)}</div>
    </ActionSurfaceFrame>
}

function MasterDetailTable({spec, onAction}: TableProps) {
    const [selected, setSelected] = useState(workspaceRows[0]?.id ?? '');
    const row = workspaceRows.find((item) => item.id === selected) ?? workspaceRows[0];
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-table-variant-6">
        <div className="hbar-app-ui-master-detail">
            <aside><HbarAppUiToolbar title="Records" detail="Select one to inspect"/>{workspaceRows.map((item) =>
                <button type="button" className={item.id === selected ? 'is-selected' : ''} key={item.id}
                        onClick={() => {
                            setSelected(item.id);
                            onAction?.({variantId: spec.id, actionId: 'open', value: item.id})
                        }}>{item.name}<small>{item.status}</small></button>)}</aside>
            <main><HbarAppUiToolbar title={row?.name ?? 'Record'} detail="Synchronized detail panel"/><HbarAppUiStatus
                value={row?.status ?? 'Unknown'} tone="positive"/><HbarAppUiSpotlight><strong>{row?.value}</strong>
                <p>{row?.detail}</p><HbarAppUiButton tone="accent" onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'edit',
                    value: selected
                })}>Edit record</HbarAppUiButton></HbarAppUiSpotlight></main>
        </div>
    </ActionSurfaceFrame>
}

function StateTable({spec, onAction}: TableProps) {
    const [state, setState] = useState<'empty' | 'loading' | 'error'>('loading');
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-table-variant-7"><HbarAppUiToolbar
        title="Stateful table" detail="Empty, loading and error states"/>
        <div className="hbar-app-ui-state-switch"><HbarAppUiButton className={state === 'empty' ? 'is-selected' : ''}
                                                                   onClick={() => setState('empty')}>Empty</HbarAppUiButton><HbarAppUiButton
            className={state === 'loading' ? 'is-selected' : ''}
            onClick={() => setState('loading')}>Loading</HbarAppUiButton><HbarAppUiButton
            className={state === 'error' ? 'is-selected' : ''} onClick={() => setState('error')}>Error</HbarAppUiButton>
        </div>
        {state === 'empty' &&
            <div className="hbar-app-ui-empty-table"><strong>No records yet</strong><p>Create a record to see it
                here.</p><HbarAppUiButton tone="accent" onClick={() => onAction?.({
                variantId: spec.id,
                actionId: 'open',
                value: 'create'
            })}>Create record</HbarAppUiButton></div>}{state === 'loading' &&
            <div className="hbar-app-ui-skeleton-table">{[1, 2, 3, 4].map((item) => <span
                key={item}><i/><i/><i/></span>)}<LoaderCircle className="is-spinning" size={17}/>
            </div>}{state === 'error' &&
            <div className="hbar-app-ui-error-table"><strong>Could not load records</strong><p>Request timed out while
                reading the local projection.</p><HbarAppUiButton tone="accent" onClick={() => {
                setState('loading');
                onAction?.({variantId: spec.id, actionId: 'retry'})
            }}>Retry</HbarAppUiButton></div>}</ActionSurfaceFrame>
}

function WideTable({spec, onAction}: TableProps) {
    const [query, setQuery] = useState('');
    const rows = useMemo(() => workspaceRows.filter((row) => row.name.toLowerCase().includes(query.toLowerCase())), [query]);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-table-variant-8"><HbarAppUiToolbar
        title="Wide data table" detail="Sticky first column · horizontal scroll"/>
        <div className="hbar-app-ui-inline-search"><Search size={13}/><input value={query}
                                                                             onChange={(event) => setQuery(event.target.value)}
                                                                             placeholder="Search"/></div>
        <HbarAppUiButton onClick={() => onAction?.({variantId: spec.id, actionId: 'scroll'})}>Show scroll
            hint</HbarAppUiButton>
        <div className="hbar-app-ui-wide-table-wrap">
            <table>
                <thead>
                <tr>
                    <th>Name</th>
                    <th>Owner</th>
                    <th>Region</th>
                    <th>Updated</th>
                    <th>Cost</th>
                    <th>Latency</th>
                </tr>
                </thead>
                <tbody>{rows.map((row, index) => <tr key={row.id}>
                    <th>{row.name}</th>
                    <td>Avery</td>
                    <td>{index % 2 ? 'EU' : 'US'}</td>
                    <td>{row.detail}</td>
                    <td>$0.{index + 8}</td>
                    <td>{120 + index * 20}ms</td>
                </tr>)}</tbody>
            </table>
        </div>
    </ActionSurfaceFrame>
}

export function DataTable({spec, onAction}: TableProps) {
    switch (spec.variant) {
        case 1:
            return <FacetedTable spec={spec} onAction={onAction}/>;
        case 2:
            return <SelectableTable spec={spec} onAction={onAction}/>;
        case 3:
            return <InlineEditTable spec={spec} onAction={onAction}/>;
        case 4:
            return <ExpandableTable spec={spec} onAction={onAction}/>;
        case 5:
            return <GroupedTable spec={spec} onAction={onAction}/>;
        case 6:
            return <MasterDetailTable spec={spec} onAction={onAction}/>;
        case 7:
            return <StateTable spec={spec} onAction={onAction}/>;
        case 8:
            return <WideTable spec={spec} onAction={onAction}/>;
        default:
            return <FacetedTable spec={spec} onAction={onAction}/>
    }
}
