import {useState} from 'react'
import {Check, FileText, FolderOpen, HelpCircle, RefreshCw, Search, Upload, X} from 'lucide-react'
import {HbarAppUiButton, HbarAppUiEmptyState, HbarAppUiSpotlight, HbarAppUiToolbar} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'

type EmptyProps = HbarAppUiVariantProps

function FirstRun({spec, onAction}: EmptyProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-empty-variant-1"><HbarAppUiToolbar
        title="Welcome to your workspace" detail="Choose a starting path"/>
        <div className="hbar-app-ui-empty-first-run"><HbarAppUiSpotlight>
            <div className="hbar-app-ui-ghost-table"><span/><span/><span/><span/></div>
            <strong>Connect a local host</strong><p>Bring an existing workspace into view.</p><HbarAppUiButton
            tone="accent" onClick={() => onAction?.({
            variantId: spec.id,
            actionId: 'connect'
        })}>Connect</HbarAppUiButton></HbarAppUiSpotlight><HbarAppUiSpotlight><FileText size={22}/><strong>Create a
            project</strong><p>Start with a clean project and a guided setup.</p><HbarAppUiButton
            onClick={() => onAction?.({
                variantId: spec.id,
                actionId: 'create'
            })}>Create</HbarAppUiButton></HbarAppUiSpotlight><HbarAppUiSpotlight><HelpCircle size={22}/><strong>View a
            tour</strong><p>Learn where activity, files and settings live.</p><HbarAppUiButton
            onClick={() => onAction?.({variantId: spec.id, actionId: 'tour'})}>Take
            tour</HbarAppUiButton></HbarAppUiSpotlight></div>
    </ActionSurfaceFrame>
}

function NoResults({spec, onAction}: EmptyProps) {
    const [query, setQuery] = useState('october');
    const [chips, setChips] = useState(['Status: blocked', 'Owner: me']);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-empty-variant-2"><HbarAppUiToolbar
        title="No results" detail="The query is echoed below"/>
        <div className="hbar-app-ui-inline-search"><Search size={13}/><input value={query}
                                                                             onChange={(event) => setQuery(event.target.value)}/>
        </div>
        <div className="hbar-app-ui-no-results"><Search size={24}/><strong>No matches for “{query}”</strong><p>Try a
            broader search or remove one of the filters.</p>
            <div className="hbar-app-ui-filter-chips">{chips.map((chip) => <button type="button" key={chip}
                                                                                   onClick={() => setChips((current) => current.filter((item) => item !== chip))}>{chip}<X
                size={11}/></button>)}</div>
            <div className="hbar-app-ui-suggested-searches"><span>Suggested searches</span>
                <button type="button" onClick={() => setQuery('workspace')}>workspace</button>
                <button type="button" onClick={() => setQuery('review')}>review</button>
            </div>
        </div>
    </ActionSurfaceFrame>
}

function CaughtUp({spec, onAction}: EmptyProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-empty-variant-3"><HbarAppUiEmptyState icon={<Check size={22}/>}
                                                                                            title="You're all caught up"
                                                                                            description="No new activity needs your attention today."
                                                                                            action={<div
                                                                                                className="hbar-app-ui-empty-actions">
                                                                                                <HbarAppUiButton
                                                                                                    tone="accent"
                                                                                                    onClick={() => onAction?.({
                                                                                                        variantId: spec.id,
                                                                                                        actionId: 'create'
                                                                                                    })}>Start a new
                                                                                                    task</HbarAppUiButton><HbarAppUiButton
                                                                                                onClick={() => onAction?.({
                                                                                                    variantId: spec.id,
                                                                                                    actionId: 'open',
                                                                                                    value: 'history'
                                                                                                })}>View
                                                                                                history</HbarAppUiButton>
                                                                                            </div>}/></ActionSurfaceFrame>
}

function LoadFailure({spec, onAction}: EmptyProps) {
    const [retrying, setRetrying] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-empty-variant-4"><HbarAppUiEmptyState
        icon={<RefreshCw size={22}/>} title="Could not load this view"
        description="The local projection timed out while reading the workspace."
        action={<HbarAppUiButton tone="accent" onClick={() => {
            setRetrying(true);
            onAction?.({variantId: spec.id, actionId: 'retry'})
        }}><RefreshCw size={14}/>{retrying ? 'Retrying…' : 'Retry'}</HbarAppUiButton>}/><HbarAppUiSpotlight
        className="hbar-app-ui-request-details"><span>Request ID <code>req_91a2</code></span><span>Trace ID <code>trace_7f12</code></span><span>Last attempt <b>10:24:18</b></span></HbarAppUiSpotlight></ActionSurfaceFrame>
}

function Dropzone({spec, onAction}: EmptyProps) {
    const [dragging, setDragging] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-empty-variant-5"><HbarAppUiToolbar
        title="Empty folder" detail="Drop files to get started"/>
        <div className={`hbar-app-ui-empty-dropzone ${dragging ? 'is-dragging' : ''}`}
             onDragEnter={() => setDragging(true)} onDragLeave={() => setDragging(false)}
             onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            onAction?.({variantId: spec.id, actionId: 'upload', value: 'drop'})
        }}><FolderOpen size={28}/><strong>{dragging ? 'Release to upload' : 'Drop files here'}</strong><p>Supported:
            PNG, JPG, PDF, CSV and Markdown</p><HbarAppUiButton tone="accent" onClick={() => onAction?.({
            variantId: spec.id,
            actionId: 'upload',
            value: 'picker'
        })}><Upload size={14}/>Choose files</HbarAppUiButton><small>Storage available · 8.4 GB</small></div>
    </ActionSurfaceFrame>
}

export function EmptyState({spec, onAction}: EmptyProps) {
    switch (spec.variant) {
        case 1:
            return <FirstRun spec={spec} onAction={onAction}/>;
        case 2:
            return <NoResults spec={spec} onAction={onAction}/>;
        case 3:
            return <CaughtUp spec={spec} onAction={onAction}/>;
        case 4:
            return <LoadFailure spec={spec} onAction={onAction}/>;
        case 5:
            return <Dropzone spec={spec} onAction={onAction}/>;
        default:
            return <FirstRun spec={spec} onAction={onAction}/>
    }
}
