import {useState} from 'react'
import {AtSign, Check, Command, FileText, Hash, Paperclip, Plus, Sparkles, Square, WandSparkles, X} from 'lucide-react'
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

type PromptProps = HbarAppUiVariantProps

function PromptInputOne({spec, onAction}: PromptProps) {
    const [running, setRunning] = useState(false)
    const [attachments, setAttachments] = useState<string[]>(['brief.md'])
    const [commandsOpen, setCommandsOpen] = useState(false)
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-prompt-variant-1"><HbarAppUiToolbar title="Prompt composer"
                                                                                          detail="Slash commands · attachments · run state"/><HbarAppUiButton
        onClick={() => setCommandsOpen((value) => !value)}><Command
        size={14}/>Commands</HbarAppUiButton><HbarAppUiStatus value={running ? 'Running' : 'Ready'}
                                                              tone={running ? 'warning' : 'positive'}/>{commandsOpen &&
        <HbarAppUiSpotlight className="hbar-app-ui-slash-menu">
            <button type="button" onClick={() => onAction?.({
                variantId: spec.id,
                actionId: 'command',
                value: '/summarize'
            })}>/summarize <small>Summarise context</small></button>
            <button type="button" onClick={() => onAction?.({
                variantId: spec.id,
                actionId: 'command',
                value: '/review'
            })}>/review <small>Review the current diff</small></button>
        </HbarAppUiSpotlight>}
        <div className="hbar-app-ui-composer-shell">
            <div className="hbar-app-ui-attachment-tray">{attachments.map((file) => <button type="button" key={file}
                                                                                            onClick={() => setAttachments((current) => current.filter((item) => item !== file))}>
                <FileText size={13}/>{file}<X size={12}/></button>)}<HbarAppUiButton
                onClick={() => setAttachments((current) => [...current, `context-${current.length + 1}.md`])}><Paperclip
                size={13}/>Attach</HbarAppUiButton></div>
            <HbarAppUiComposer placeholder="Type a prompt or /command" onSubmit={(value) => {
                setRunning(true);
                onAction?.({variantId: spec.id, actionId: 'send', value})
            }}/><HbarAppUiButton tone="danger" disabled={!running} onClick={() => {
            setRunning(false);
            onAction?.({variantId: spec.id, actionId: 'stop'})
        }}><Square size={14}/>Stop</HbarAppUiButton></div>
    </ActionSurfaceFrame>
}

function PromptInputTwo({spec, onAction}: PromptProps) {
    const [model, setModel] = useState('Balanced')
    const [tools, setTools] = useState(['Search'])
    const tokenCount = seededNumber(spec.profile.seed, 420, 420)
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-prompt-variant-2"><HbarAppUiToolbar title="Prompt box"
                                                                                          detail={`${tokenCount} tokens estimated`}/><select
        aria-label="Model selector" value={model} onChange={(event) => {
        setModel(event.target.value);
        onAction?.({variantId: spec.id, actionId: 'model', value: event.target.value})
    }}>
        <option>Fast</option>
        <option>Balanced</option>
        <option>Reasoning</option>
    </select><span className="hbar-app-ui-token-count">{tokenCount} / 8k</span>
        <div className="hbar-app-ui-tool-toggles">{['Search', 'Browser', 'Files'].map((tool) => <HbarAppUiButton
            key={tool} className={tools.includes(tool) ? 'is-selected' : ''}
            onClick={() => setTools((current) => current.includes(tool) ? current.filter((item) => item !== tool) : [...current, tool])}>{tools.includes(tool) ?
            <Check size={13}/> : <Plus size={13}/>}{tool}</HbarAppUiButton>)}</div>
        <HbarAppUiComposer placeholder="Ask with tools enabled" onSubmit={(value) => onAction?.({
            variantId: spec.id,
            actionId: 'send',
            value
        })}/></ActionSurfaceFrame>
}

function PromptInputThree({spec, onAction}: PromptProps) {
    const suggestions = ['Plan a release', 'Summarise activity', 'Find risky changes', 'Draft a reply']
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-prompt-variant-3">
        <div className="hbar-app-ui-prompt-hero"><Sparkles size={24}/><h2>Start with a prompt</h2><p>Turn a short
            request into a focused workspace action.</p>
            <div
                className="hbar-app-ui-suggestion-grid">{suggestions.slice(0, Math.max(2, Math.min(suggestions.length, spec.profile.itemCount + 1))).map((suggestion) =>
                <HbarAppUiButton key={suggestion} onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'suggestion',
                    value: suggestion
                })}>{suggestion}<WandSparkles size={13}/></HbarAppUiButton>)}</div>
            <HbarAppUiComposer placeholder="Describe what you need"
                               onSubmit={(value) => onAction?.({variantId: spec.id, actionId: 'send', value})}/>
            <div className="hbar-app-ui-recent-prompts"><strong>Recent prompts</strong>
                <button type="button">Review yesterday's run</button>
                <button type="button">Prepare a handoff note</button>
            </div>
        </div>
    </ActionSurfaceFrame>
}

function PromptInputFour({spec, onAction}: PromptProps) {
    const [valid, setValid] = useState(false)
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-prompt-variant-4"><HbarAppUiToolbar title="Prompt template"
                                                                                          detail="Variables are validated inline"/><HbarAppUiButton
        tone="accent" onClick={() => {
        setValid(true);
        onAction?.({variantId: spec.id, actionId: 'save'})
    }}><Check size={14}/>Save template</HbarAppUiButton>
        <div className="hbar-app-ui-template-editor"><label>Template name<input defaultValue="Release summary"/></label><label>Prompt<textarea
            defaultValue="Summarise {{workspace}} for {{audience}} by {{deadline}}."
            onChange={(event) => setValid(event.target.value.includes('{{') && event.target.value.includes('}}'))}/></label>
            <div className="hbar-app-ui-variable-list">
                <strong>Variables</strong>{['workspace', 'audience', 'deadline'].map((variable) => <span key={variable}><Hash
                size={12}/>{variable}<HbarAppUiStatus value={valid ? 'Valid' : 'Needs value'}
                                                      tone={valid ? 'positive' : 'warning'}/></span>)}</div>
        </div>
    </ActionSurfaceFrame>
}

function PromptInputFive({spec, onAction}: PromptProps) {
    const [dragging, setDragging] = useState(false)
    const [progress, setProgress] = useState(38)
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-prompt-variant-5"><HbarAppUiToolbar
        title="Drop files into your prompt" detail="Each attachment reports its upload state"/><HbarAppUiButton
        onClick={() => setProgress((value) => Math.min(100, value + 20))}><Plus size={14}/>Add file</HbarAppUiButton>
        <div className={`hbar-app-ui-dropzone ${dragging ? 'is-dragging' : ''}`} onDragEnter={() => setDragging(true)}
             onDragLeave={() => setDragging(false)} onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            setProgress(100);
            onAction?.({variantId: spec.id, actionId: 'upload', value: 'drop'})
        }} onDragOver={(event) => event.preventDefault()}><Paperclip
            size={20}/><strong>{dragging ? 'Release to upload' : 'Drag files here'}</strong><small>or choose a file from
            this device</small></div>
        <HbarAppUiSpotlight className="hbar-app-ui-upload-row">
            <div><FileText
                size={15}/><span>requirements.pdf<small>2.1 MB · {progress === 100 ? 'Uploaded' : 'Uploading'}</small></span>
            </div>
            <HbarAppUiProgress value={progress} label="requirements upload"
                               tone={progress === 100 ? 'positive' : 'accent'}/><span>{progress}%</span></HbarAppUiSpotlight><HbarAppUiComposer
            placeholder="Add context for the files"
            onSubmit={(value) => onAction?.({variantId: spec.id, actionId: 'send', value})}/></ActionSurfaceFrame>
}

function PromptInputSix({spec, onAction}: PromptProps) {
    const [mentionOpen, setMentionOpen] = useState(false)
    const [scope, setScope] = useState('Workspace')
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-prompt-variant-6"><HbarAppUiToolbar title="Scoped prompt bar"
                                                                                          detail="Mention a source to narrow context"/><HbarAppUiButton
        onClick={() => setMentionOpen((value) => !value)}><AtSign size={14}/>Mention</HbarAppUiButton><select
        aria-label="Context scope" value={scope} onChange={(event) => {
        setScope(event.target.value);
        onAction?.({variantId: spec.id, actionId: 'picker', value: event.target.value})
    }}>
        <option>Workspace</option>
        <option>Current file</option>
        <option>Selected run</option>
    </select>{mentionOpen && <HbarAppUiSpotlight className="hbar-app-ui-mention-menu">
        <button type="button" onClick={() => setMentionOpen(false)}><AtSign size={13}/>activity.log</button>
        <button type="button" onClick={() => setMentionOpen(false)}><AtSign size={13}/>README.md</button>
    </HbarAppUiSpotlight>}
        <div className="hbar-app-ui-source-pills"><span><FileText size={12}/>{scope}</span><span><FileText size={12}/>run-2026-09</span>
            <button type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'clear-context'})}><X
                size={12}/>Clear
            </button>
        </div>
        <HbarAppUiComposer placeholder="Ask with scoped context" onSubmit={(value) => onAction?.({
            variantId: spec.id,
            actionId: 'send',
            value
        })}/></ActionSurfaceFrame>
}

function PromptInputSeven({spec, onAction}: PromptProps) {
    const [mode, setMode] = useState('ask')
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-prompt-variant-7"><HbarAppUiToolbar title="Prompt input"
                                                                                          detail="Switch modes without losing your draft"/><HbarAppUiTabs
        label="Prompt mode" value={mode}
        options={[{id: 'ask', label: 'Ask'}, {id: 'agent', label: 'Agent'}, {id: 'edit', label: 'Edit'}]}
        onChange={(value) => {
            setMode(value);
            onAction?.({variantId: spec.id, actionId: 'mode', value})
        }}/><HbarAppUiComposer placeholder={`Describe a task in ${mode} mode`}
                               onSubmit={(value) => onAction?.({variantId: spec.id, actionId: 'send', value})}/>
        <div className="hbar-app-ui-keyboard-hints">
            <span><kbd>Enter</kbd> send</span><span><kbd>Shift</kbd> + <kbd>Enter</kbd> newline</span><span><kbd>/</kbd> commands</span>
        </div>
    </ActionSurfaceFrame>
}

export function PromptInput({spec, onAction}: PromptProps) {
    switch (spec.variant) {
        case 1:
            return <PromptInputOne spec={spec} onAction={onAction}/>
        case 2:
            return <PromptInputTwo spec={spec} onAction={onAction}/>
        case 3:
            return <PromptInputThree spec={spec} onAction={onAction}/>
        case 4:
            return <PromptInputFour spec={spec} onAction={onAction}/>
        case 5:
            return <PromptInputFive spec={spec} onAction={onAction}/>
        case 6:
            return <PromptInputSix spec={spec} onAction={onAction}/>
        case 7:
            return <PromptInputSeven spec={spec} onAction={onAction}/>
        default:
            return <PromptInputOne spec={spec} onAction={onAction}/>
    }
}
