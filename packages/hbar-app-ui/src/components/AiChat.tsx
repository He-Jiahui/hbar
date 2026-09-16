import { HbarAppUiIcon } from '../icon'
import {useState, type ReactNode} from 'react'
import {
    Bot,
    Check,
    ChevronDown,
    FileCode2,
    FileText,
    GitBranch,
    Mic,
    Paperclip,
    Play,
    Send,
    ShieldCheck,
    Sparkles,
    Volume2,
    X
} from 'lucide-react'
import {
    HbarAppUiButton,
    HbarAppUiComposer,
    HbarAppUiProgress,
    HbarAppUiSpotlight,
    HbarAppUiStatus,
    HbarAppUiTabs,
    HbarAppUiToolbar
} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'
import {seededNumber} from './helpers'

type ChatProps = HbarAppUiVariantProps

function ChatBubble({author, children, tone = 'neutral'}: {
    readonly author: string;
    readonly children: ReactNode;
    readonly tone?: 'neutral' | 'positive' | 'warning'
}) {
    return <HbarAppUiSpotlight className={`hbar-app-ui-chat-bubble hbar-app-ui-chat-bubble-${tone}`}><span
        className="hbar-app-ui-avatar">{author.slice(0, 1)}</span>
        <div><strong>{author}</strong><p>{children}</p><small>Today · just now</small></div>
    </HbarAppUiSpotlight>
}

function FullThread({spec, onAction}: ChatProps) {
    const [reasoningOpen, setReasoningOpen] = useState(true)
    const [toolOpen, setToolOpen] = useState(false)
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-ai-chat-thread"><HbarAppUiToolbar
        title="Workspace assistant" detail="Streaming response · local context"/><HbarAppUiButton
        onClick={() => setReasoningOpen((value) => !value)}><HbarAppUiIcon icon={ChevronDown} tier="sm"
        />Reasoning</HbarAppUiButton><HbarAppUiButton tone="accent" onClick={() => onAction?.({
        variantId: spec.id,
        actionId: 'attach'
    })}><HbarAppUiIcon icon={Paperclip} tier="sm" />Attach</HbarAppUiButton>
        <div className="hbar-app-ui-chat-transcript"><ChatBubble author="You">Reconcile the October invoices and flag
            anything unusual.</ChatBubble><HbarAppUiSpotlight className="hbar-app-ui-chat-reasoning">
            <div><HbarAppUiIcon icon={Bot} tier="sm" /><strong>Assistant reasoning</strong><HbarAppUiStatus value="Working" tone="warning"/>
            </div>
            {reasoningOpen && <ol>
                <li>Load the ledger and bank export.</li>
                <li>Match references and currencies.</li>
                <li>Prepare a concise exception list.</li>
            </ol>}</HbarAppUiSpotlight><HbarAppUiSpotlight className="hbar-app-ui-chat-tool">
            <button type="button" onClick={() => setToolOpen((value) => !value)}><HbarAppUiIcon icon={Play} tier="sm"
                /><span><strong>ledger.search</strong><small>Searching 1,284 transactions</small></span><HbarAppUiIcon icon={ChevronDown} tier="sm"
                /></button>
            {toolOpen && <pre>{'{"matches": 1284, "status": "running"}'}</pre>}</HbarAppUiSpotlight><ChatBubble
            author="hbar" tone="positive">I found 12 unmatched entries. I’m grouping them by currency before showing the
            final report.</ChatBubble>
            <div className="hbar-app-ui-chat-sources"><strong>Sources</strong>
                <button type="button"><HbarAppUiIcon icon={FileText} tier="sm" />October ledger.csv</button>
                <button type="button"><HbarAppUiIcon icon={FileText} tier="sm" />Bank export.pdf</button>
            </div>
        </div>
        <HbarAppUiComposer placeholder="Reply to the assistant" onSubmit={(value) => onAction?.({
            variantId: spec.id,
            actionId: 'send',
            value
        })}/></ActionSurfaceFrame>
}

function ArtifactThread({spec, onAction}: ChatProps) {
    const [version, setVersion] = useState('v3')
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-ai-chat-artifact"><HbarAppUiToolbar title="Assistant + artifact"
                                                                                          detail="Generated workspace preview"/><HbarAppUiTabs
        label="Artifact version" value={version}
        options={[{id: 'v1', label: 'v1'}, {id: 'v2', label: 'v2'}, {id: 'v3', label: 'v3'}]} onChange={(value) => {
        setVersion(value);
        onAction?.({variantId: spec.id, actionId: 'tabs', value})
    }}/>
        <div className="hbar-app-ui-artifact-layout">
            <div className="hbar-app-ui-chat-transcript"><ChatBubble author="You">Turn the findings into a handoff
                note.</ChatBubble><ChatBubble author="hbar" tone="positive">I drafted a note and attached a code sample.
                Choose a version to inspect it.</ChatBubble><HbarAppUiComposer placeholder="Ask for another revision"
                                                                               onSubmit={(value) => onAction?.({
                                                                                   variantId: spec.id,
                                                                                   actionId: 'send',
                                                                                   value
                                                                               })}/></div>
            <HbarAppUiSpotlight className="hbar-app-ui-artifact-panel">
                <div className="hbar-app-ui-artifact-tabs"><HbarAppUiIcon icon={FileCode2} tier="sm"
                    /><strong>handoff.ts</strong><span>{version}</span></div>
                <pre>{`export function handoff() {\n  return { status: '${version}', ready: true }\n}`}</pre>
                <div className="hbar-app-ui-artifact-files">
                    <button type="button"><HbarAppUiIcon icon={FileCode2} tier="sm" />Code</button>
                    <button type="button"><HbarAppUiIcon icon={FileText} tier="sm" />Document</button>
                </div>
            </HbarAppUiSpotlight></div>
    </ActionSurfaceFrame>
}

function EmbeddedAssistant({spec, onAction}: ChatProps) {
    const suggestions = ['Summarise this workspace', 'Show blocked runs', 'Draft a status update']
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-ai-chat-embedded"><HbarAppUiToolbar title="Embedded assistant"
                                                                                          detail="Docked to the current panel"/><HbarAppUiStatus
        value="Ready" tone="positive"/>
        <div className="hbar-app-ui-embedded-empty">
            <div className="hbar-app-ui-empty-icon"><HbarAppUiIcon icon={Sparkles} tier="lg" /></div>
            <strong>What would you like to explore?</strong><p>Ask about the selected workspace or choose a suggested
            prompt.</p>
            <div
                className="hbar-app-ui-suggestion-list">{suggestions.slice(0, Math.max(2, Math.min(suggestions.length, spec.profile.itemCount))).map((suggestion) =>
                <HbarAppUiButton key={suggestion} onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'send',
                    value: suggestion
                })}>{suggestion}<HbarAppUiIcon icon={Send} tier="sm" /></HbarAppUiButton>)}</div>
        </div>
        <HbarAppUiComposer placeholder="Ask a quick question" onSubmit={(value) => onAction?.({
            variantId: spec.id,
            actionId: 'send',
            value
        })}/></ActionSurfaceFrame>
}

function ContextChat({spec, onAction}: ChatProps) {
    const [model, setModel] = useState('Balanced assistant')
    const [settingsOpen, setSettingsOpen] = useState(false)
    const used = seededNumber(spec.profile.seed, 34, 42)
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-ai-chat-context"><HbarAppUiToolbar
        title="Context-aware chat" detail={`${model} · ${used}% context used`}/><HbarAppUiButton
        onClick={() => setSettingsOpen((value) => !value)}><HbarAppUiIcon icon={ChevronDown} tier="sm" />Settings</HbarAppUiButton><select
        aria-label="Model" value={model} onChange={(event) => {
        setModel(event.target.value);
        onAction?.({variantId: spec.id, actionId: 'picker', value: event.target.value})
    }}>
        <option>Balanced assistant</option>
        <option>Fast assistant</option>
        <option>Reasoning assistant</option>
    </select>{settingsOpen &&
        <HbarAppUiSpotlight className="hbar-app-ui-chat-popover"><strong>Conversation settings</strong><label><input
            type="checkbox" defaultChecked/>Include workspace context</label><label><input type="checkbox"/>Show tool
            details</label></HbarAppUiSpotlight>}
        <div className="hbar-app-ui-token-meter">
            <div><span>Context window</span><strong>{used}%</strong></div>
            <HbarAppUiProgress value={used} label="Context window usage" tone={used > 75 ? 'warning' : 'accent'}/></div>
        <div className="hbar-app-ui-chat-transcript"><ChatBubble author="hbar" tone="positive">The selected model has
            enough context to answer with citations.</ChatBubble></div>
        <HbarAppUiComposer placeholder="Continue the conversation" onSubmit={(value) => onAction?.({
            variantId: spec.id,
            actionId: 'send',
            value
        })}/></ActionSurfaceFrame>
}

function ApprovalChat({spec, onAction}: ChatProps) {
    const [approved, setApproved] = useState(false)
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-ai-chat-approval"><HbarAppUiToolbar title="Guarded assistant"
                                                                                          detail="A decision is required before the tool runs"/><HbarAppUiStatus
        value={approved ? 'Approved' : 'Awaiting approval'} tone={approved ? 'positive' : 'warning'}/>
        <div className="hbar-app-ui-chat-transcript"><ChatBubble author="You">Clean up the archived
            workspace.</ChatBubble><HbarAppUiSpotlight className="hbar-app-ui-inline-approval"><HbarAppUiIcon icon={ShieldCheck} tier="md" />
            <div><strong>Delete 18 archived files?</strong><p>This action cannot be undone and will affect the shared
                workspace.</p><small>Scope: archive/ · estimated 2.4s</small></div>
            <div><HbarAppUiButton disabled={approved} tone="accent" onClick={() => {
                setApproved(true);
                onAction?.({variantId: spec.id, actionId: 'confirm', value: 'allow'})
            }}>{approved ? 'Allowed' : 'Allow once'}</HbarAppUiButton><HbarAppUiButton disabled={approved}
                                                                                       onClick={() => onAction?.({
                                                                                           variantId: spec.id,
                                                                                           actionId: 'confirm',
                                                                                           value: 'deny'
                                                                                       })}>Deny</HbarAppUiButton></div>
        </HbarAppUiSpotlight><ChatBubble author="hbar"
                                         tone={approved ? 'positive' : 'neutral'}>{approved ? 'Approval received. The cleanup is queued.' : 'I’ll wait for your decision before continuing.'}</ChatBubble>
        </div>
        <HbarAppUiComposer placeholder="Add instructions" onSubmit={(value) => onAction?.({
            variantId: spec.id,
            actionId: 'send',
            value
        })}/></ActionSurfaceFrame>
}

function MultiAgentChat({spec, onAction}: ChatProps) {
    const [agent, setAgent] = useState('Planner')
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-ai-chat-multi"><HbarAppUiToolbar
        title="Multi-agent room" detail="Three agents are coordinating"/><HbarAppUiButton onClick={() => {
        setAgent(agent === 'Planner' ? 'Builder' : agent === 'Builder' ? 'Reviewer' : 'Planner');
        onAction?.({variantId: spec.id, actionId: 'handoff', value: agent})
    }}><HbarAppUiIcon icon={GitBranch} tier="sm" />Handoff</HbarAppUiButton>
        <div className="hbar-app-ui-multi-agent-grid">
            <aside><strong>Agents</strong>{['Planner', 'Builder', 'Reviewer'].map((name) => <button type="button"
                                                                                                    className={agent === name ? 'is-active' : ''}
                                                                                                    key={name}
                                                                                                    onClick={() => setAgent(name)}>
                <span className="hbar-app-ui-avatar">{name[0]}</span>{name}<HbarAppUiStatus
                value={name === agent ? 'Active' : 'Ready'} tone={name === agent ? 'warning' : 'positive'}/></button>)}
            </aside>
            <main className="hbar-app-ui-chat-transcript"><ChatBubble author={agent} tone="positive">I’m handling the
                next part of the task and will hand the result to the reviewer.</ChatBubble><HbarAppUiSpotlight
                className="hbar-app-ui-activity-rail"><strong>Live
                activity</strong><span>Inspecting context</span><span>Preparing handoff</span><span>Waiting for reviewer</span></HbarAppUiSpotlight><HbarAppUiComposer
                placeholder={`Message ${agent}`}
                onSubmit={(value) => onAction?.({variantId: spec.id, actionId: 'send', value})}/></main>
        </div>
    </ActionSurfaceFrame>
}

function CitationChat({spec, onAction}: ChatProps) {
    const citations = ['Run history · 12 matches', 'Workspace policy · v4', 'October ledger.csv · line 82']
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-ai-chat-citations"><HbarAppUiToolbar title="Evidence-linked chat"
                                                                                           detail="Pinned context follows every answer"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: 'context'})}><HbarAppUiIcon icon={FileText} tier="sm" />Context</HbarAppUiButton>
        <div className="hbar-app-ui-pinned-context"><strong>Pinned sources</strong>{citations.map((citation) => <button
            type="button" key={citation}
            onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: citation})}><HbarAppUiIcon icon={FileText} tier="sm"
            />{citation}</button>)}</div>
        <div className="hbar-app-ui-chat-transcript"><ChatBubble author="hbar" tone="positive">The run is ready for
            review <sup>[1]</sup>. The policy permits a retry <sup>[2]</sup> and the unmatched rows begin at line
            82 <sup>[3]</sup>.</ChatBubble></div>
        <HbarAppUiComposer placeholder="Ask about the pinned sources" onSubmit={(value) => onAction?.({
            variantId: spec.id,
            actionId: 'send',
            value
        })}/></ActionSurfaceFrame>
}

function VoiceChat({spec, onAction}: ChatProps) {
    const [recording, setRecording] = useState(false)
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-ai-chat-voice"><HbarAppUiToolbar
        title="Voice + multimodal composer" detail="Capture a note or attach a file"/><HbarAppUiButton
        tone={recording ? 'danger' : 'accent'} onClick={() => {
        setRecording((value) => !value);
        onAction?.({variantId: spec.id, actionId: 'record', value: recording ? 'stop' : 'start'})
    }}>{recording ? <HbarAppUiIcon icon={X} tier="sm" /> : <HbarAppUiIcon icon={Mic} tier="sm" />}{recording ? 'Stop recording' : 'Record voice'}</HbarAppUiButton>
        <div className="hbar-app-ui-waveform"
             aria-label={recording ? 'Recording waveform' : 'Idle waveform'}>{Array.from({length: 28}, (_, index) => <i
            className={recording ? 'is-live' : ''} style={{height: `${12 + ((spec.profile.seed + index * 13) % 34)}px`}}
            key={index}/>)}</div>
        <div className="hbar-app-ui-transcript"><HbarAppUiIcon icon={Volume2} tier="sm"
            /><span>{recording ? 'Listening…' : 'Transcript preview will appear here'}</span></div>
        <div className="hbar-app-ui-attachment-tray"><HbarAppUiButton
            onClick={() => onAction?.({variantId: spec.id, actionId: 'attach', value: 'image.png'})}><HbarAppUiIcon icon={Paperclip} tier="sm"
            />image.png</HbarAppUiButton><HbarAppUiButton
            onClick={() => onAction?.({variantId: spec.id, actionId: 'attach', value: 'notes.md'})}><HbarAppUiIcon icon={FileText} tier="sm"
            />notes.md</HbarAppUiButton></div>
        <HbarAppUiComposer placeholder="Add a caption" onSubmit={(value) => onAction?.({
            variantId: spec.id,
            actionId: 'send',
            value
        })}/></ActionSurfaceFrame>
}

function ModelPickerChat({spec, onAction}: ChatProps) {
    const [provider, setProvider] = useState('Local provider')
    const [effort, setEffort] = useState('Balanced')
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-ai-chat-models"><HbarAppUiToolbar
        title="Choose an assistant" detail="Provider, context, cost and reasoning"/><HbarAppUiButton tone="accent"
                                                                                                     onClick={() => onAction?.({
                                                                                                         variantId: spec.id,
                                                                                                         actionId: 'send',
                                                                                                         value: 'select-model'
                                                                                                     })}><HbarAppUiIcon icon={Check} tier="sm"
        />Use selection</HbarAppUiButton>
        <div className="hbar-app-ui-provider-layout">
            <div className="hbar-app-ui-provider-list">
                <strong>Providers</strong>{['Local provider', 'Cloud balanced', 'Cloud reasoning'].map((name) => <button
                type="button" className={provider === name ? 'is-selected' : ''} key={name} onClick={() => {
                setProvider(name);
                onAction?.({variantId: spec.id, actionId: 'picker', value: name})
            }}><HbarAppUiIcon icon={Bot} tier="sm"
                /><span>{name}<small>{name === 'Local provider' ? 'Private · 0.0 credits' : 'Shared · metered'}</small></span>
            </button>)}</div>
            <HbarAppUiSpotlight className="hbar-app-ui-provider-detail">
                <div><strong>{provider}</strong><HbarAppUiStatus value="Available" tone="positive"/></div>
                <dl>
                    <div>
                        <dt>Context</dt>
                        <dd>{spec.profile.itemCount * 8}k tokens</dd>
                    </div>
                    <div>
                        <dt>Cost</dt>
                        <dd>{provider === 'Local provider' ? 'Free' : '$0.02 / 1k'}</dd>
                    </div>
                </dl>
                <label>Reasoning effort<select value={effort} onChange={(event) => {
                    setEffort(event.target.value);
                    onAction?.({variantId: spec.id, actionId: 'effort', value: event.target.value})
                }}>
                    <option>Fast</option>
                    <option>Balanced</option>
                    <option>Deep</option>
                </select></label></HbarAppUiSpotlight></div>
        <HbarAppUiComposer placeholder="Start with this assistant" onSubmit={(value) => onAction?.({
            variantId: spec.id,
            actionId: 'send',
            value
        })}/></ActionSurfaceFrame>
}

export function AiChat({spec, onAction}: ChatProps) {
    switch (spec.variant) {
        case 1:
            return <FullThread spec={spec} onAction={onAction}/>
        case 2:
            return <ArtifactThread spec={spec} onAction={onAction}/>
        case 3:
            return <EmbeddedAssistant spec={spec} onAction={onAction}/>
        case 4:
            return <ContextChat spec={spec} onAction={onAction}/>
        case 5:
            return <ApprovalChat spec={spec} onAction={onAction}/>
        case 6:
            return <MultiAgentChat spec={spec} onAction={onAction}/>
        case 7:
            return <CitationChat spec={spec} onAction={onAction}/>
        case 8:
            return <VoiceChat spec={spec} onAction={onAction}/>
        case 9:
            return <ModelPickerChat spec={spec} onAction={onAction}/>
        default:
            return <FullThread spec={spec} onAction={onAction}/>
    }
}
