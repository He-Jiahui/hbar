import { LumenButton, LumenSelect } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../icon'
import {useState} from 'react'
import {ChevronDown, GripVertical, MessageCircle, MoreHorizontal, Palette, Paperclip, Plus, ShieldAlert} from 'lucide-react'
import {
    HbarAppUiButton,
    HbarAppUiMetricStrip,
    HbarAppUiProgress,
    HbarAppUiSpotlight,
    HbarAppUiStatus,
    HbarAppUiTabs,
    HbarAppUiToolbar
} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'
import './KanbanSurface.css'

type KanbanProps = HbarAppUiVariantProps

type StatusColumn = 'Backlog' | 'In progress' | 'In review' | 'Done'

type StatusCard = {
    readonly id: string
    readonly title: string
    readonly tag: string
    readonly comments?: number
    readonly files?: number
    readonly avatar: string
}

const statusColumns: readonly StatusColumn[] = ['Backlog', 'In progress', 'In review', 'Done']

const initialStatusCards: Readonly<Record<StatusColumn, readonly StatusCard[]>> = {
    Backlog: [
        {id: 'HAL-241', title: 'Retry billing webhooks that fail on timeout', tag: 'Billing', comments: 4, files: 1, avatar: 'AR'},
        {id: 'HAL-229', title: 'Deprecate the v1 usage endpoint', tag: 'API', comments: 1, avatar: 'SA'},
        {id: 'HAL-214', title: 'Backfill workspace regions for EU tenants', tag: 'Platform', avatar: 'WC'},
    ],
    'In progress': [
        {id: 'HAL-238', title: 'Seat count drifts after a downgrade', tag: 'Billing', comments: 2, avatar: 'PN'},
        {id: 'HAL-221', title: 'Cache invalidation on role change is slow', tag: 'Platform', comments: 8, avatar: 'MS'},
        {id: 'HAL-233', title: 'Add SCIM group mapping to the admin console', tag: 'Identity', comments: 6, files: 2, avatar: 'WC'},
    ],
    'In review': [
        {id: 'HAL-236', title: 'Audit log export times out past 90 days', tag: 'Platform', files: 3, avatar: 'MS'},
        {id: 'HAL-208', title: 'Rotate signing keys without downtime', tag: 'Identity', comments: 5, files: 1, avatar: 'SA'},
    ],
    Done: [
        {id: 'HAL-226', title: 'Rework the empty state on first workspace', tag: 'Growth', comments: 3, files: 1, avatar: 'AR'},
        {id: 'HAL-217', title: 'Ship the invoice PDF redesign', tag: 'Billing', comments: 2, files: 4, avatar: 'PN'},
    ],
}

function StatusBoard({spec, onAction}: KanbanProps) {
    const [columns, setColumns] = useState<Readonly<Record<StatusColumn, readonly StatusCard[]>>>(initialStatusCards)
    const [selected, setSelected] = useState<string>()
    const [subdued, setSubdued] = useState(false)
    const itemCount = statusColumns.reduce((count, column) => count + columns[column].length, 0)

    const moveCard = (cardId: string, from: StatusColumn) => {
        const destination = statusColumns[statusColumns.indexOf(from) + 1]
        const card = columns[from].find((item) => item.id === cardId)
        if (!destination || !card) return
        setColumns((current) => ({
            ...current,
            [from]: current[from].filter((item) => item.id !== cardId),
            [destination]: [...current[destination], card],
        }))
        onAction?.({variantId: spec.id, actionId: 'drag', value: `${cardId}:${from}:${destination}`})
    }

    const addCard = (column: StatusColumn) => {
        setColumns((current) => {
            const nextNumber = 200 + statusColumns.reduce((count, item) => count + current[item].length, 0) + 1
            const card: StatusCard = {
                id: `HAL-${nextNumber}`,
                title: 'New work item awaiting details',
                tag: 'Workspace',
                avatar: 'HB',
            }
            return {...current, [column]: [...current[column], card]}
        })
        onAction?.({variantId: spec.id, actionId: 'open', value: `add:${column}`})
    }

    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className={`hbar-app-ui-kanban-variant-1${subdued ? ' is-subdued' : ''}`}>
        <header className="hbar-app-ui-kanban-header">
            <div><h2>Platform board</h2><p>{itemCount} open items. Drag a card, or focus one and press space to move it with the arrow keys.</p></div>
            <div className="hbar-app-ui-kanban-people" aria-label="Board participants"><i>AR</i><i>PN</i><i>MS</i><i>WC</i></div>
        </header>
        <main className="hbar-app-ui-kanban-board" aria-label="Platform board columns">
            {statusColumns.map((column) => <section className="hbar-app-ui-kanban-column" key={column}>
                <header><h3>{column}</h3>
                    <span>{column === 'In progress' ? `${columns[column].length}/4` : column === 'In review' ? `${columns[column].length}/3` : columns[column].length}</span>
                    <LumenButton
                        type="button" aria-label={`Add a card to ${column}`} onClick={() => addCard(column)}><HbarAppUiIcon icon={Plus} tier="sm"
                        /></LumenButton>
                </header>
                <ul className="hbar-app-ui-kanban-cards">{columns[column].map((card, index) => <li key={card.id}>
                    <LumenButton type="button" draggable
                            className={`hbar-app-ui-kanban-card${selected === card.id ? ' is-selected' : ''}`}
                            aria-label={`${card.id}: ${card.title}`} onClick={() => {
                        setSelected(card.id)
                        onAction?.({variantId: spec.id, actionId: 'open', value: card.id})
                    }} onDragEnd={() => moveCard(card.id, column)} onKeyDown={(event) => {
                        if (event.key === ' ' || event.key === 'ArrowRight') {
                            event.preventDefault()
                            moveCard(card.id, column)
                        }
                    }}>
                        <span className="hbar-app-ui-kanban-card-top"><i className={index === 0 ? 'is-current' : ''}/><span>{card.id}</span><HbarAppUiIcon icon={GripVertical} tier="sm" /></span>
                        <strong>{card.title}</strong>
                        <footer><span>{card.tag}</span>{card.comments !== undefined &&
                            <small><HbarAppUiIcon icon={MessageCircle} tier="xs" />{card.comments}</small>}{card.files !== undefined &&
                            <small><HbarAppUiIcon icon={Paperclip} tier="xs" />{card.files}</small>}<i>{card.avatar}</i></footer>
                    </LumenButton>
                </li>)}</ul>
            </section>)}
        </main>
        <LumenButton type="button" className="hbar-app-ui-kanban-theme" onClick={() => {
            setSubdued((value) => !value)
            onAction?.({variantId: spec.id, actionId: 'theme', value: subdued ? 'standard' : 'subdued'})
        }}><HbarAppUiIcon icon={Palette} tier="sm" />{subdued ? 'Standard' : 'Theme'}</LumenButton>
    </ActionSurfaceFrame>
}

function Swimlanes({spec, onAction}: KanbanProps) {
    const [open, setOpen] = useState<Record<string, boolean>>({Core: true, Growth: true});
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-kanban-variant-2"><HbarAppUiToolbar title="Swimlane board"
                                                                                          detail="Sticky stage header · drag across lanes"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'drag', value: 'lane'})}>Move card</HbarAppUiButton>
        <div className="hbar-app-ui-swimlanes">
            <header><span>Workstream</span><span>Todo</span><span>Doing</span><span>Done</span></header>
            {Object.keys(open).map((lane) => <div className="hbar-app-ui-swimlane" key={lane}>
                <LumenButton type="button" onClick={() => setOpen((current) => ({...current, [lane]: !current[lane]}))}>
                    <HbarAppUiIcon icon={ChevronDown} tier="sm"  className={open[lane] ? '' : 'is-collapsed'}/>{lane}</LumenButton>
                {open[lane] && <>
                    <HbarAppUiSpotlight><span>{lane} discovery</span></HbarAppUiSpotlight><HbarAppUiSpotlight><span>{lane} implementation</span></HbarAppUiSpotlight><HbarAppUiSpotlight><span>{lane} shipped</span></HbarAppUiSpotlight></>}
            </div>)}</div>
    </ActionSurfaceFrame>
}

function Regroupable({spec, onAction}: KanbanProps) {
    const [group, setGroup] = useState('Status');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-kanban-variant-3"><HbarAppUiToolbar title="Regroupable board"
                                                                                          detail="Drop sets status, assignee or priority"/><HbarAppUiTabs
        label="Group by" value={group} options={['Status', 'Assignee', 'Priority'].map((id) => ({id, label: id}))}
        onChange={(value) => {
            setGroup(value);
            onAction?.({variantId: spec.id, actionId: 'group', value})
        }}/>
        <div className="hbar-app-ui-regroup-board">{['Review API', 'Update docs', 'Fix latency'].map((item, index) =>
            <HbarAppUiSpotlight draggable key={item} onDragEnd={() => onAction?.({
                variantId: spec.id,
                actionId: 'drop',
                value: `${item}:${group}`
            })}><HbarAppUiIcon icon={GripVertical} tier="sm"
                /><strong>{item}</strong><span>{group === 'Status' ? ['Todo', 'Doing', 'Done'][index] : group === 'Assignee' ? ['Avery', 'Mina', 'Jon'][index] : ['High', 'Medium', 'Low'][index]}</span></HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function DetailBoard({spec, onAction}: KanbanProps) {
    const [selected, setSelected] = useState('Build activity panel');
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-kanban-variant-4">
        <div className="hbar-app-ui-kanban-detail">
            <main><HbarAppUiToolbar title="Work board" detail="Select a card for details"/><HbarAppUiButton
                onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: 'new'})}><HbarAppUiIcon icon={Plus} tier="sm" />Add
                card</HbarAppUiButton>{['Build activity panel', 'Validate response', 'Publish notes'].map((item) =>
                <LumenButton type="button" className={selected === item ? 'is-selected' : ''} key={item}
                        onClick={() => setSelected(item)}><strong>{item}</strong><small>In progress</small></LumenButton>)}
            </main>
            <aside><HbarAppUiToolbar title={selected} detail="Properties and activity"/><HbarAppUiStatus
                value="In progress" tone="warning"/><label>Assignee<LumenSelect defaultValue="Avery">
                <option>Avery</option>
                <option>Mina</option>
            </LumenSelect></label><label>Priority<LumenSelect defaultValue="High">
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
            </LumenSelect></label><p>Activity · moved to In progress 4m ago</p><HbarAppUiButton tone="accent"
                                                                                           onClick={() => onAction?.({
                                                                                               variantId: spec.id,
                                                                                               actionId: 'save',
                                                                                               value: selected
                                                                                           })}>Save
                changes</HbarAppUiButton></aside>
        </div>
    </ActionSurfaceFrame>
}

function SprintBoard({spec, onAction}: KanbanProps) {
    const [movedCard, setMovedCard] = useState<string | undefined>()
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-kanban-variant-5"><HbarAppUiToolbar title="Sprint board"
                                                                                          detail="Points, capacity and blocked flags"/><HbarAppUiMetricStrip
        metrics={[{label: 'Points', value: '42 / 60'}, {
            label: 'Capacity',
            value: '70%',
            tone: 'positive'
        }, {label: 'Blocked', value: '2', tone: 'warning'}]}/>
        <div className="hbar-app-ui-sprint-columns">{['Backlog', 'Doing', 'Done'].map((column, index) => <section
            key={column}>
            <header><strong>{column}</strong><span>{index * 4 + 6} pts</span></header>
            <HbarAppUiProgress value={index === 1 ? 76 : index === 2 ? 100 : 36} label={`${column} capacity`}
                               tone={index === 1 ? 'warning' : 'accent'}/>{['Review contract', 'Ship editor', 'Resolve incident'].slice(0, index + 1).map((item, itemIndex) =>
            <HbarAppUiSpotlight draggable key={item} onDragEnd={() => {
                setMovedCard(item)
                onAction?.({variantId: spec.id, actionId: 'drag', value: item})
            }}><strong>{item}</strong><small>{itemIndex === 0 && index === 0 ? <>
                <HbarAppUiIcon icon={ShieldAlert} tier="xs" /> Blocked</> : `${itemIndex + 2} pts`}</small><HbarAppUiButton type="button"
                                                                                                      onClick={() => {
                                                                                                          setMovedCard(item)
                                                                                                          onAction?.({
                                                                                                              variantId: spec.id,
                                                                                                              actionId: 'drag',
                                                                                                              value: item
                                                                                                          })
                                                                                                      }}>{movedCard === item ? 'Moved to next stage' : 'Move to next stage'}</HbarAppUiButton></HbarAppUiSpotlight>)}
        </section>)}</div>
    </ActionSurfaceFrame>
}

function CompactBoard({spec, onAction}: KanbanProps) {
    const [column, setColumn] = useState('Todo');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-kanban-variant-6"><HbarAppUiToolbar title="Compact task board"
                                                                                          detail="Segmented column pager"/><HbarAppUiTabs
        label="Column" value={column} options={['Todo', 'Doing', 'Done'].map((id) => ({id, label: id}))}
        onChange={setColumn}/>
        <div className="hbar-app-ui-compact-column">
            <HbarAppUiSpotlight><strong>{column === 'Todo' ? 'Review API contract' : column === 'Doing' ? 'Build activity panel' : 'Create workspace'}</strong><small>Step
                controls · 3 steps</small>
                <div><HbarAppUiButton onClick={() => onAction?.({variantId: spec.id, actionId: 'step', value: column})}>Next
                    step</HbarAppUiButton><HbarAppUiButton><HbarAppUiIcon icon={MoreHorizontal} tier="sm" /></HbarAppUiButton></div>
            </HbarAppUiSpotlight></div>
    </ActionSurfaceFrame>
}

export function Kanban({spec, onAction}: KanbanProps) {
    switch (spec.variant) {
        case 1:
            return <StatusBoard spec={spec} onAction={onAction}/>;
        case 2:
            return <Swimlanes spec={spec} onAction={onAction}/>;
        case 3:
            return <Regroupable spec={spec} onAction={onAction}/>;
        case 4:
            return <DetailBoard spec={spec} onAction={onAction}/>;
        case 5:
            return <SprintBoard spec={spec} onAction={onAction}/>;
        case 6:
            return <CompactBoard spec={spec} onAction={onAction}/>;
        default:
            return <StatusBoard spec={spec} onAction={onAction}/>
    }
}
