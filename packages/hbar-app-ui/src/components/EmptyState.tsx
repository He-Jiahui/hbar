import {
  LumenFrame,
  LumenText,
 LumenButton, LumenInput } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../icon'
import {useState} from 'react'
import {Check, FileText, FolderOpen, HelpCircle, RefreshCw, Search, Upload, X} from 'lucide-react'
import {HbarAppUiButton, HbarAppUiEmptyState, HbarAppUiSpotlight, HbarAppUiToolbar} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'

type EmptyProps = HbarAppUiVariantProps

function FirstRun({spec, onAction}: EmptyProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-empty-variant-1"><HbarAppUiToolbar
        title="Welcome to your workspace" detail="Choose a starting path"/>
        <LumenFrame className="hbar-app-ui-empty-first-run"><HbarAppUiSpotlight>
            <LumenFrame className="hbar-app-ui-ghost-table"><LumenText as="span"/><LumenText as="span"/><LumenText as="span"/><LumenText as="span"/></LumenFrame>
            <LumenText as="strong">Connect a local host</LumenText><LumenText as="p">Bring an existing workspace into view.</LumenText><HbarAppUiButton
            tone="accent" onClick={() => onAction?.({
            variantId: spec.id,
            actionId: 'connect'
        })}>Connect</HbarAppUiButton></HbarAppUiSpotlight><HbarAppUiSpotlight><HbarAppUiIcon icon={FileText} tier="lg" /><LumenText as="strong">Create a
            project</LumenText><LumenText as="p">Start with a clean project and a guided setup.</LumenText><HbarAppUiButton
            onClick={() => onAction?.({
                variantId: spec.id,
                actionId: 'create'
            })}>Create</HbarAppUiButton></HbarAppUiSpotlight><HbarAppUiSpotlight><HbarAppUiIcon icon={HelpCircle} tier="lg" /><LumenText as="strong">View a
            tour</LumenText><LumenText as="p">Learn where activity, files and settings live.</LumenText><HbarAppUiButton
            onClick={() => onAction?.({variantId: spec.id, actionId: 'tour'})}>Take
            tour</HbarAppUiButton></HbarAppUiSpotlight></LumenFrame>
    </ActionSurfaceFrame>
}

function NoResults({spec, onAction}: EmptyProps) {
    const [query, setQuery] = useState('october');
    const [chips, setChips] = useState(['Status: blocked', 'Owner: me']);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-empty-variant-2"><HbarAppUiToolbar
        title="No results" detail="The query is echoed below"/>
        <LumenFrame className="hbar-app-ui-inline-search"><HbarAppUiIcon icon={Search} tier="sm" /><LumenInput value={query}
                                                                             onChange={(event) => setQuery(event.target.value)}/>
        </LumenFrame>
        <LumenFrame className="hbar-app-ui-no-results"><HbarAppUiIcon icon={Search} tier="xl" /><LumenText as="strong">No matches for “{query}”</LumenText><LumenText as="p">Try a
            broader search or remove one of the filters.</LumenText>
            <LumenFrame className="hbar-app-ui-filter-chips">{chips.map((chip) => <LumenButton type="button" key={chip}
                                                                                   onClick={() => setChips((current) => current.filter((item) => item !== chip))}>{chip}<HbarAppUiIcon icon={X} tier="xs"
                /></LumenButton>)}</LumenFrame>
            <LumenFrame className="hbar-app-ui-suggested-searches"><LumenText as="span">Suggested searches</LumenText>
                <LumenButton type="button" onClick={() => setQuery('workspace')}>workspace</LumenButton>
                <LumenButton type="button" onClick={() => setQuery('review')}>review</LumenButton>
            </LumenFrame>
        </LumenFrame>
    </ActionSurfaceFrame>
}

function CaughtUp({spec, onAction}: EmptyProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-empty-variant-3"><HbarAppUiEmptyState icon={<HbarAppUiIcon icon={Check} tier="lg" />}
                                                                                            title="You're all caught up"
                                                                                            description="No new activity needs your attention today."
                                                                                            action={<LumenFrame
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
                                                                                            </LumenFrame>}/></ActionSurfaceFrame>
}

function LoadFailure({spec, onAction}: EmptyProps) {
    const [retrying, setRetrying] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-empty-variant-4"><HbarAppUiEmptyState
        icon={<HbarAppUiIcon icon={RefreshCw} tier="lg" />} title="Could not load this view"
        description="The local projection timed out while reading the workspace."
        action={<HbarAppUiButton tone="accent" onClick={() => {
            setRetrying(true);
            onAction?.({variantId: spec.id, actionId: 'retry'})
        }}><HbarAppUiIcon icon={RefreshCw} tier="sm" />{retrying ? 'Retrying…' : 'Retry'}</HbarAppUiButton>}/><HbarAppUiSpotlight
        className="hbar-app-ui-request-details"><LumenText as="span">Request ID <LumenText as="code">req_91a2</LumenText></LumenText><LumenText as="span">Trace ID <LumenText as="code">trace_7f12</LumenText></LumenText><LumenText as="span">Last attempt <LumenText as="b">10:24:18</LumenText></LumenText></HbarAppUiSpotlight></ActionSurfaceFrame>
}

function Dropzone({spec, onAction}: EmptyProps) {
    const [dragging, setDragging] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-empty-variant-5"><HbarAppUiToolbar
        title="Empty folder" detail="Drop files to get started"/>
        <LumenFrame className={`hbar-app-ui-empty-dropzone ${dragging ? 'is-dragging' : ''}`}
             onDragEnter={() => setDragging(true)} onDragLeave={() => setDragging(false)}
             onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            onAction?.({variantId: spec.id, actionId: 'upload', value: 'drop'})
        }}><HbarAppUiIcon icon={FolderOpen} tier="xl" /><LumenText as="strong">{dragging ? 'Release to upload' : 'Drop files here'}</LumenText><LumenText as="p">Supported:
            PNG, JPG, PDF, CSV and Markdown</LumenText><HbarAppUiButton tone="accent" onClick={() => onAction?.({
            variantId: spec.id,
            actionId: 'upload',
            value: 'picker'
        })}><HbarAppUiIcon icon={Upload} tier="sm" />Choose files</HbarAppUiButton><LumenText as="small">Storage available · 8.4 GB</LumenText></LumenFrame>
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
