import {useState} from 'react'
import {Bold, Check, FileCode2, Heading2, Italic, List, Maximize2, PanelLeft, Save, X} from 'lucide-react'
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

type EditorProps = HbarAppUiVariantProps

function RichText({spec, onAction}: EditorProps) {
    const [saved, setSaved] = useState(true);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-editor-variant-1"><HbarAppUiToolbar title="Rich text editor"
                                                                                          detail="Autosave · word count"/>
        <div className="hbar-app-ui-format-toolbar"><HbarAppUiIconButton label="Bold"><Bold
            size={13}/></HbarAppUiIconButton><HbarAppUiIconButton label="Italic"><Italic
            size={13}/></HbarAppUiIconButton><HbarAppUiIconButton label="Heading"><Heading2
            size={13}/></HbarAppUiIconButton><HbarAppUiIconButton label="List"><List size={13}/></HbarAppUiIconButton>
        </div>
        <HbarAppUiStatus value={saved ? 'Saved' : 'Editing'} tone={saved ? 'positive' : 'warning'}/><textarea
            defaultValue={'# Workspace notes\n\nCapture decisions and context here.'} onChange={() => setSaved(false)}/>
        <div className="hbar-app-ui-editor-footer"><span>42 words</span><HbarAppUiProgress value={saved ? 100 : 62}
                                                                                           label="Autosave status"
                                                                                           tone={saved ? 'positive' : 'accent'}/><HbarAppUiButton
            onClick={() => {
                setSaved(true);
                onAction?.({variantId: spec.id, actionId: 'save'})
            }}><Save size={13}/>Save</HbarAppUiButton></div>
    </ActionSurfaceFrame>
}

function MarkdownSplit({spec, onAction}: EditorProps) {
    const [mode, setMode] = useState('split');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-editor-variant-2"><HbarAppUiToolbar title="Markdown workspace"
                                                                                          detail="Write · split · preview"/><HbarAppUiTabs
        label="Editor mode" value={mode} options={['write', 'split', 'preview'].map((id) => ({id, label: id}))}
        onChange={setMode}/>
        <div className={`hbar-app-ui-markdown-editor hbar-app-ui-markdown-${mode}`}><textarea
            defaultValue={'# Workspace notes\n\nA concise handoff for the next run.'}/>
            <div><small>Preview</small><h2>Workspace notes</h2><p>A concise handoff for the next run.</p>
                <HbarAppUiButton
                    onClick={() => onAction?.({variantId: spec.id, actionId: 'export'})}>Export</HbarAppUiButton></div>
        </div>
    </ActionSurfaceFrame>
}

function CodeEditor({spec, onAction}: EditorProps) {
    const [file, setFile] = useState('ActivityPanel.tsx');
    const files = ['App.tsx', 'ActivityPanel.tsx', 'types.ts'];
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-editor-variant-3"><HbarAppUiToolbar title="Code editor"
                                                                                          detail="Tabs · gutter · minimap"/>
        <div className="hbar-app-ui-code-tabs">{files.map((name) => <button type="button"
                                                                            className={file === name ? 'is-selected' : ''}
                                                                            key={name} onClick={() => setFile(name)}>
            <FileCode2 size={13}/>{name}<X size={11}/></button>)}</div>
        <HbarAppUiStatus value="TypeScript" tone="positive"/>
        <div className="hbar-app-ui-code-editor">
            <ol>{Array.from({length: 12}, (_, index) => <li
                key={index}>{index % 3 === 0 ? 'export function renderActivity() {' : index % 3 === 1 ? '  return <ActivityPanel />' : '}'}</li>)}</ol>
            <pre>{`// ${file}\nexport function renderActivity() {\n  return <ActivityPanel />\n}`}</pre>
            <aside className="hbar-app-ui-minimap">{Array.from({length: 18}, (_, index) => <i
                style={{width: `${24 + (index * 13) % 64}%`}} key={index}/>)}</aside>
        </div>
        <footer className="hbar-app-ui-code-status"><span>Ln 4, Col 2</span><span>UTF-8</span><span>Spaces: 2</span>
        </footer>
    </ActionSurfaceFrame>
}

function SuggestionReview({spec, onAction}: EditorProps) {
    const [accepted, setAccepted] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-editor-variant-4">
        <div className="hbar-app-ui-suggestion-editor">
            <main><HbarAppUiToolbar title="Review suggestions" detail="Inline highlights"/><HbarAppUiStatus
                value={accepted ? 'Applied' : '1 suggestion'} tone={accepted ? 'positive' : 'warning'}/>
                <p>Use the shared <mark>status formatter</mark> so activity rows remain consistent.</p>
                <p className="hbar-app-ui-inline-highlight">Suggested: <code>formatStatus(status)</code></p></main>
            <aside><HbarAppUiSpotlight><strong>Suggested change</strong><p>Replace the raw status with the shared
                formatter.</p><HbarAppUiButton tone="accent" disabled={accepted} onClick={() => {
                setAccepted(true);
                onAction?.({variantId: spec.id, actionId: 'accept'})
            }}><Check size={13}/>Accept</HbarAppUiButton><HbarAppUiButton onClick={() => onAction?.({
                variantId: spec.id,
                actionId: 'dismiss'
            })}>Dismiss</HbarAppUiButton></HbarAppUiSpotlight></aside>
        </div>
    </ActionSurfaceFrame>
}

function LongReader({spec, onAction}: EditorProps) {
    const [focus, setFocus] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className={`hbar-app-ui-editor-variant-5 ${focus ? 'is-focus' : ''}`}><HbarAppUiToolbar
        title="Long document" detail="Outline rail and focus mode"/><HbarAppUiButton
        onClick={() => setFocus((value) => !value)}><Maximize2 size={13}/>{focus ? 'Exit focus' : 'Focus mode'}
    </HbarAppUiButton>
        <div className="hbar-app-ui-reader-layout">
            <aside><PanelLeft size={14}/><strong>Outline</strong>
                <button type="button">Overview</button>
                <button type="button">Activity</button>
                <button type="button">Recovery</button>
            </aside>
            <article><h2>Reliable workspace operations</h2><p>Keep status, action and result close together so the next
                decision is clear.</p><h3>Activity</h3><p>Use a compact timeline for long-running work and preserve the
                path to recovery.</p><h3>Recovery</h3><p>Explain the cause beside the failure and offer one obvious next
                action.</p></article>
        </div>
    </ActionSurfaceFrame>
}

export function Editor({spec, onAction}: EditorProps) {
    switch (spec.variant) {
        case 1:
            return <RichText spec={spec} onAction={onAction}/>;
        case 2:
            return <MarkdownSplit spec={spec} onAction={onAction}/>;
        case 3:
            return <CodeEditor spec={spec} onAction={onAction}/>;
        case 4:
            return <SuggestionReview spec={spec} onAction={onAction}/>;
        case 5:
            return <LongReader spec={spec} onAction={onAction}/>;
        default:
            return <RichText spec={spec} onAction={onAction}/>
    }
}
