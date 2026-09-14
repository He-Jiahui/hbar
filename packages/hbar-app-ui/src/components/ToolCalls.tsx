import {useState} from 'react'
import {
    Check,
    ChevronDown,
    Clock3,
    Code2,
    FileCode2,
    Filter,
    Globe2,
    KeyRound,
    RotateCcw,
    ShieldCheck
} from 'lucide-react'
import {HbarAppUiButton, HbarAppUiSpotlight, HbarAppUiStatus, HbarAppUiTabs, HbarAppUiToolbar} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'

type ToolProps = HbarAppUiVariantProps

function ToolCallCard({spec, onAction}: ToolProps) {
    const [open, setOpen] = useState(true)
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-tool-call-variant-1"><HbarAppUiToolbar title="Tool call"
                                                                                             detail="Arguments, result and timing"/><HbarAppUiStatus
        value="Complete" tone="positive"/><HbarAppUiSpotlight className="hbar-app-ui-tool-card">
        <button type="button" className="hbar-app-ui-tool-card-heading" onClick={() => setOpen((value) => !value)}>
            <Code2 size={15}/><strong>file.read</strong><span>240ms</span><ChevronDown size={14}/></button>
        {open && <div className="hbar-app-ui-tool-card-body">
            <div><small>Arguments</small>
                <pre>{'{"path":"src/App.tsx","encoding":"utf8"}'}</pre>
            </div>
            <div><small>Result</small>
                <pre>{'{"ok":true,"bytes":4832}'}</pre>
            </div>
            <span><Clock3 size={12}/>Started just now · 240ms</span></div>}</HbarAppUiSpotlight></ActionSurfaceFrame>
}

function ToolCallList({spec, onAction}: ToolProps) {
    const [retrying, setRetrying] = useState<number | undefined>()
    const calls = [{name: 'file.read', state: 'Pending'}, {name: 'file.write', state: 'Success'}, {
        name: 'test.run',
        state: 'Failed'
    }, {name: 'lint.run', state: 'Success'}]
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-tool-call-variant-2"><HbarAppUiToolbar title="Tool call queue"
                                                                                             detail="Pending, success and failure states"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'filter'})}><Filter size={13}/>Filter</HbarAppUiButton>
        <div
            className="hbar-app-ui-tool-list">{calls.slice(0, Math.max(2, Math.min(calls.length, spec.profile.itemCount + 1))).map((call, index) =>
            <HbarAppUiSpotlight key={call.name}>
                <div>
                    <strong>{call.name}</strong><small>{call.state === 'Failed' ? 'exit code 1 · stderr available' : call.state === 'Pending' ? 'Waiting for worker' : 'Completed successfully'}</small>
                </div>
                <HbarAppUiStatus value={retrying === index ? 'Retrying' : call.state}
                                 tone={call.state === 'Success' ? 'positive' : call.state === 'Failed' ? 'danger' : 'warning'}/>{call.state === 'Failed' &&
                <HbarAppUiButton onClick={() => {
                    setRetrying(index);
                    onAction?.({variantId: spec.id, actionId: 'retry', value: call.name})
                }}><RotateCcw size={13}/>Retry</HbarAppUiButton>}</HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function DiffResult({spec, onAction}: ToolProps) {
    const [tab, setTab] = useState('diff')
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-tool-call-variant-3"><HbarAppUiToolbar title="File edit result"
                                                                                             detail="12 additions · 4 removals"/><HbarAppUiTabs
        label="Edit result" value={tab} options={[{id: 'diff', label: 'Diff'}, {id: 'files', label: 'Files'}]}
        onChange={(value) => {
            setTab(value);
            onAction?.({variantId: spec.id, actionId: 'tabs', value})
        }}/><HbarAppUiSpotlight className="hbar-app-ui-diff-panel">
        <div className="hbar-app-ui-diff-file"><FileCode2
            size={14}/><strong>src/ActivityPanel.tsx</strong><span>+12 −4</span></div>
        {tab === 'diff' ?
            <pre className="hbar-app-ui-diff-code"><span className="is-removed">− const state = 'idle'</span><span
                className="is-added">+ const state = 'running'</span><span>  renderActivity(state)</span><span
                className="is-added">+ onStop(() =&gt; setState('stopped'))</span></pre> : <ul>
                <li>src/ActivityPanel.tsx</li>
                <li>src/ActivityPanel.test.tsx</li>
            </ul>}<HbarAppUiButton tone="accent" onClick={() => onAction?.({
        variantId: spec.id,
        actionId: 'open',
        value: 'diff'
    })}><Check size={13}/>Apply review</HbarAppUiButton></HbarAppUiSpotlight></ActionSurfaceFrame>
}

function WebSearchResult({spec, onAction}: ToolProps) {
    const sources = ['Internal API reference', 'Workspace runbook', 'TypeScript handbook', 'Release notes']
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-tool-call-variant-4"><HbarAppUiToolbar title="Web search"
                                                                                             detail="Ranked sources · relevance metadata"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'search', value: 'workspace sync'})}><Globe2
        size={13}/>Search again</HbarAppUiButton>
        <div
            className="hbar-app-ui-search-results">{sources.slice(0, Math.max(2, Math.min(sources.length, spec.profile.itemCount + 1))).map((source, index) =>
            <HbarAppUiSpotlight key={source}><span className="hbar-app-ui-result-rank">{index + 1}</span>
                <div><strong>{source}</strong><p>Guidance for keeping the workspace state and event stream
                    consistent.</p><small>{(0.98 - index * 0.07).toFixed(2)} relevance · 2 min read</small></div>
            </HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function CodeExecution({spec, onAction}: ToolProps) {
    const [tab, setTab] = useState('stdout')
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-tool-call-variant-5"><HbarAppUiToolbar title="Code execution"
                                                                                             detail="bun test · exit code 0"/><HbarAppUiStatus
        value="0" tone="positive"/><HbarAppUiButton onClick={() => onAction?.({variantId: spec.id, actionId: 'retry'})}><RotateCcw
        size={13}/>Run again</HbarAppUiButton><HbarAppUiTabs label="Execution output" value={tab}
                                                             options={[{id: 'stdout', label: 'stdout'}, {
                                                                 id: 'stderr',
                                                                 label: 'stderr'
                                                             }]} onChange={(value) => {
        setTab(value);
        onAction?.({variantId: spec.id, actionId: 'tabs', value})
    }}/>
        <pre
            className="hbar-app-ui-terminal-output">{tab === 'stdout' ? '✓ 24 tests passed\n✓ workspace sync complete\n\nDone in 1.18s' : 'No stderr output.'}</pre>
    </ActionSurfaceFrame>
}

function PermissionRow({spec, onAction}: ToolProps) {
    const [enabled, setEnabled] = useState<Record<string, boolean>>({
        'file.read': true,
        'file.write': false,
        'network.fetch': false
    })
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-tool-call-variant-6"><HbarAppUiToolbar title="Tool permissions"
                                                                                             detail="Enable tools and disclose scope"/><HbarAppUiStatus
        value="Scoped to this workspace"/>
        <div className="hbar-app-ui-permission-list">{Object.entries(enabled).map(([name, value]) => <HbarAppUiSpotlight
            key={name}>
            <div><KeyRound
                size={14}/><strong>{name}</strong><small>{value ? 'Read/write access granted' : 'Not enabled'}</small>
            </div>
            <button type="button" className={`hbar-app-ui-switch ${value ? 'is-on' : ''}`} role="switch"
                    aria-checked={value} onClick={() => {
                setEnabled((current) => ({...current, [name]: !value}));
                onAction?.({variantId: spec.id, actionId: 'permission', value: `${name}:${!value}`})
            }}><i/></button>
            <ChevronDown size={13}/></HbarAppUiSpotlight>)}</div>
        <div className="hbar-app-ui-scope-note"><ShieldCheck size={14}/>Changes apply only to this seeded demo.</div>
    </ActionSurfaceFrame>
}

export function ToolCalls({spec, onAction}: ToolProps) {
    switch (spec.variant) {
        case 1:
            return <ToolCallCard spec={spec} onAction={onAction}/>
        case 2:
            return <ToolCallList spec={spec} onAction={onAction}/>
        case 3:
            return <DiffResult spec={spec} onAction={onAction}/>
        case 4:
            return <WebSearchResult spec={spec} onAction={onAction}/>
        case 5:
            return <CodeExecution spec={spec} onAction={onAction}/>
        case 6:
            return <PermissionRow spec={spec} onAction={onAction}/>
        default:
            return <ToolCallCard spec={spec} onAction={onAction}/>
    }
}
