import { Fragment, useRef, useState } from 'react'
import { ArrowRight, ArrowUp, Check, ChevronDown, FileText, Palette, Paperclip, Plus, Send, Sparkles, Upload, Wrench, X } from 'lucide-react'
import { FloatingSurface } from '../../FloatingLayer'
import type { ReferenceFixtureProps } from './reference-types'
import { ReferenceBlueprint } from './ReferenceBlueprints'
import { ReferenceButton } from './primitives/ReferencePrimitives'
import { reportFixtureClick } from './reference-interactions'
import { CHAT_PREVIEWS, PROMPT_PREVIEWS } from './reference-preview-data'

type ReferenceModelDetail = {
  readonly provider: string
  readonly context: string
  readonly speed: string
  readonly cost: string
  readonly description: string
  readonly reasoning: 'Brief' | 'Balanced' | 'Detailed' | 'Not supported'
  readonly reasoningLevels: readonly ('Brief' | 'Balanced' | 'Detailed')[]
  readonly reasoningNote: string
}

const referenceModelDetails: Record<string, ReferenceModelDetail> = {
  Auto: {
    provider: 'Northwind AI',
    context: '200K tokens',
    speed: 'Varies by turn',
    cost: 'Metered',
    description: 'Routes every turn to whichever model fits the request best.',
    reasoning: 'Balanced',
    reasoningLevels: ['Brief', 'Balanced', 'Detailed'],
    reasoningNote: 'Thinks through the request before answering.',
  },
  Atlas: {
    provider: 'Meridian Labs',
    context: '200K tokens',
    speed: 'Standard',
    cost: '4 credits per turn',
    description: 'The strongest general model. Best for multi-step work that spans several files.',
    reasoning: 'Balanced',
    reasoningLevels: ['Brief', 'Balanced', 'Detailed'],
    reasoningNote: 'Thinks through the request before answering.',
  },
  'Atlas Long': {
    provider: 'Meridian Labs',
    context: '1M tokens',
    speed: 'Slower to first token',
    cost: '9 credits per turn',
    description: 'Atlas with a one million token window for whole repositories and long transcripts.',
    reasoning: 'Detailed',
    reasoningLevels: ['Detailed'],
    reasoningNote: 'Plans at length and checks its own work.',
  },
  Quill: {
    provider: 'Meridian Labs',
    context: '128K tokens',
    speed: 'Fast',
    cost: '2 credits per turn',
    description: 'Tuned for drafting and rewriting prose. Keeps tone and structure steady.',
    reasoning: 'Not supported',
    reasoningLevels: [],
    reasoningNote: 'This model answers directly and has no thinking budget to set.',
  },
  Ember: {
    provider: 'Orbital',
    context: '64K tokens',
    speed: 'Fastest',
    cost: '1 credit per turn',
    description: 'Quick and inexpensive. Good for small edits and short answers.',
    reasoning: 'Brief',
    reasoningLevels: ['Brief', 'Balanced'],
    reasoningNote: 'Answers immediately with little planning.',
  },
  Wren: {
    provider: 'Orbital',
    context: '32K tokens',
    speed: 'Depends on hardware',
    cost: 'Free',
    description: 'Runs locally. Nothing in the conversation leaves this machine.',
    reasoning: 'Not supported',
    reasoningLevels: [],
    reasoningNote: 'This model answers directly and has no thinking budget to set.',
  },
}

const referenceModelOptions: readonly [name: string, badge: string, provider: string][] = [
  ['Auto', 'Recommended', 'Northwind AI'],
  ['Atlas', '', 'Meridian Labs'],
  ['Atlas Long', '1M context', 'Meridian Labs'],
  ['Quill', '', 'Meridian Labs'],
  ['Ember', '', 'Orbital'],
  ['Wren', 'On device', 'Orbital'],
]

export function ChatReferenceFixture({ definition, onInteraction }: ReferenceFixtureProps) {
  const [modelOpen, setModelOpen] = useState(false)
  const modelTrigger = useRef<HTMLButtonElement>(null)
  const [message, setMessage] = useState('')
  const [selectedModel, setSelectedModel] = useState('Atlas')
  const [reasoning, setReasoning] = useState('Balanced')
  const [artifactTab, setArtifactTab] = useState('Preview')
  const [approvalDecision, setApprovalDecision] = useState<'pending' | 'approved' | 'kept'>('pending')
  const selectedModelDetail: ReferenceModelDetail = referenceModelDetails[selectedModel] ?? referenceModelDetails.Atlas!
  const variant = definition.variantSlug
  const config = CHAT_PREVIEWS[variant] ?? {
    heading: definition.title,
    model: 'Atlas',
    userMessages: ['Ask the assistant to inspect the current workspace.'],
    assistantMessages: ['The fixture is ready to show the next response state.'],
    composerPlaceholder: 'Message',
  }
  const selectedModelSummary = selectedModelDetail.reasoning === 'Not supported' ? 'Not supported' : reasoning
  const selectModel = (name: string) => {
    setSelectedModel(name)
    const next = referenceModelDetails[name]
    if (next && next.reasoningLevels.length > 0) setReasoning(next.reasoning)
  }
  if (config.empty) return <div className="rb-reference-chat rb-reference-chat-empty" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><div className="rb-reference-empty-icon"><Sparkles size={20} /></div><strong>{config.heading}</strong><p>{config.subheading ?? 'Choose a suggestion or type a request to begin.'}</p><div className="rb-reference-chip-row">{(config.labels ?? []).map((label) => <button type="button" key={label} onClick={() => setMessage(label)}>{label}</button>)}</div><footer className="rb-reference-composer"><textarea aria-label="Message" placeholder={config.composerPlaceholder} value={message} onChange={(event) => setMessage(event.target.value)} /></footer></div>
  return (
    <div className={`rb-reference-chat rb-reference-chat-${variant}`} onClickCapture={(event) => reportFixtureClick(event, onInteraction)}>
      <header className="rb-reference-chat-header">
        <div><strong>{config.heading}</strong>{variant !== 'ai-chat-9' && <small>{config.status ?? config.model}</small>}</div>
        {config.modelPicker ? <span className="rb-reference-model-summary">{variant !== 'ai-chat-9' && <Sparkles size={13} />} {selectedModel} · {selectedModelSummary}</span> : <span className="rb-reference-model-summary"><Sparkles size={13} /> {config.model}{config.status ? ` · ${config.status}` : ''}</span>}
      </header>
      {config.pinnedContext && <div className="rb-reference-pinned-context"><span aria-hidden="true">◆</span> {config.pinnedContext}<span>Workspace context</span></div>}
      {config.usage && <div className="rb-reference-usage-strip"><span>Live context</span><strong>{config.usage}</strong><i><b /></i></div>}
      <div className="rb-reference-chat-body">
        {config.userMessages.map((userMessage, index) => <Fragment key={`${userMessage}-${index}`}><div className="rb-reference-message rb-reference-message-user">{userMessage}</div>{config.assistantMessages[index] && <div className="rb-reference-message rb-reference-message-assistant"><span className="rb-reference-avatar">{config.assistantAvatar === 'spark' ? <Sparkles size={12} /> : config.model.slice(0, 1)}</span><div><strong>{config.model}</strong>{config.reasoningDisclosure && index === 0 && <details open className="rb-reference-reasoning"><summary>Thought for 4s</summary><p>Checked the relevant workspace assumptions before answering.</p></details>}<p>{config.assistantMessages[index]}</p>{config.toolLabel && index === 0 && <div className="rb-reference-tool-row"><Wrench size={13} /> {config.toolLabel}</div>}</div></div>}</Fragment>)}
        {config.sourceLabels && <div className="rb-reference-source-block"><small>Sources</small>{config.sourceLabels.map((source) => <span key={source}>{source}</span>)}</div>}
        {config.artifact && <aside className="rb-reference-artifact-panel"><header><strong>{config.artifact.title}</strong><button type="button" aria-label="Close artifact"><X size={13} /></button></header><nav>{config.artifact.versions.map((tab) => <button type="button" className={artifactTab === tab ? 'selected' : ''} key={tab} onClick={() => setArtifactTab(tab)}>{tab}</button>)}</nav><pre>{artifactTab === 'Preview' || artifactTab === 'v3' ? config.artifact.code : `${config.artifact.title}\n// ${artifactTab} snapshot`}</pre></aside>}
        {config.voice && <div className="rb-reference-voice-card"><div className="rb-reference-waveform">{Array.from({ length: 22 }, (_, index) => <i key={index} style={{ height: `${18 + (index * 17) % 55}%` }} />)}</div><strong>{config.voice.status} · {config.voice.duration}</strong><small>Tap to stop</small></div>}
        {config.approval && <div className={`rb-reference-approval-card ${approvalDecision !== 'pending' ? 'resolved' : ''}`}><div><strong>{approvalDecision === 'pending' ? config.approval.title : approvalDecision === 'approved' ? 'Approved' : 'Kept for review'}</strong><p>{config.approval.description}</p></div>{approvalDecision === 'pending' ? <><button type="button" className="danger" onClick={() => setApprovalDecision('kept')}>{config.approval.secondary}</button><button type="button" className="primary" onClick={() => setApprovalDecision('approved')}>{config.approval.primary}</button></> : <ReferenceButton variant="secondary" onClick={() => setApprovalDecision('pending')}>Show request</ReferenceButton>}</div>}
      </div>
      <footer className="rb-reference-composer">{config.attachmentLabels && <div className="rb-reference-attachment-tray"><FileText size={13} /> {config.attachmentLabels.join(' · ')} <button type="button" aria-label="Remove attachment"><X size={12} /></button></div>}<textarea aria-label="Message" placeholder={config.composerPlaceholder} value={message} onChange={(event) => setMessage(event.target.value)} /><div className="rb-reference-composer-actions">{config.modelPicker && <button ref={modelTrigger} className="rb-reference-model-trigger rb-reference-composer-model" onClick={() => setModelOpen((open) => !open)} aria-expanded={modelOpen} aria-haspopup="listbox"><Sparkles size={13} /> {selectedModel} <ChevronDown size={12} /></button>}<button type="button" aria-label="Attach a file">{variant === 'ai-chat-9' ? <Paperclip size={14} /> : <FileText size={14} />}</button>{variant !== 'ai-chat-9' && <span>⌘ Enter to send</span>}<button type="button" className="rb-reference-send" disabled={!message.trim()} aria-label="Send">{variant === 'ai-chat-9' ? <ArrowUp size={14} /> : <Send size={14} />}</button></div></footer>
      {config.footerNote && <p className="rb-reference-chat-footer-note">{config.footerNote}</p>}
      {config.themeControl && <button type="button" className="rb-reference-theme-control" aria-label="Theme"><Palette size={14} /> Theme</button>}
      {config.modelPicker && <FloatingSurface
        mode="anchored"
        anchorRef={modelTrigger}
        open={modelOpen}
        onClose={() => setModelOpen(false)}
        placement="above"
        nested
        className="rb-reference-model-menu rb-reference-model-menu-rich"
        role="dialog"
        aria-label="Model"
      >
        <div className="rb-reference-model-options"><small>MODEL</small>{referenceModelOptions.map(([name, badge, provider]) => <button type="button" role="option" aria-selected={selectedModel === name} className={selectedModel === name ? 'selected' : ''} key={name} onClick={() => { selectModel(name); setModelOpen(false) }}><span><strong>{name}</strong>{badge && <em>{badge}</em>}<small>{provider}</small></span>{selectedModel === name && <Check size={13} />}</button>)}</div>
        <div className="rb-reference-model-detail"><strong>{selectedModel}</strong><small>{selectedModelDetail.provider}</small><p>{selectedModelDetail.description}</p><dl><div><dt>Context</dt><dd>{selectedModelDetail.context}</dd></div><div><dt>Speed</dt><dd>{selectedModelDetail.speed}</dd></div><div><dt>Cost</dt><dd>{selectedModelDetail.cost}</dd></div></dl><div className="rb-reference-reasoning-control"><header><span>REASONING</span><strong>{selectedModelDetail.reasoning === 'Not supported' ? 'Not supported' : reasoning}</strong></header>{selectedModelDetail.reasoningLevels.length > 0 && <><div className="rb-reference-reasoning-meter">{['Brief', 'Balanced', 'Detailed'].map((level) => <i className={selectedModelDetail.reasoningLevels.includes(level as 'Brief' | 'Balanced' | 'Detailed') ? 'enabled' : ''} key={level} />)}</div><div className="rb-reference-reasoning-options">{['Brief', 'Balanced', 'Detailed'].map((level) => <label key={level}><input type="radio" name="reference-reasoning" checked={reasoning === level} disabled={!selectedModelDetail.reasoningLevels.includes(level as 'Brief' | 'Balanced' | 'Detailed')} onChange={() => setReasoning(level)} />{level}</label>)}</div></>}<p>{selectedModelDetail.reasoningNote}</p></div></div>
      </FloatingSurface>}
    </div>
  )
}

export default function ReferenceVariant(props: ReferenceFixtureProps) {
  if (props.definition.category === 'ai-chat' || props.definition.category === 'chat') return <ChatReferenceFixture {...props} />
  if (props.definition.category === 'prompt-input') return <PromptReferenceFixture {...props} />
  return <ReferenceBlueprint {...props} />
}

export function PromptReferenceFixture({ definition, onInteraction }: ReferenceFixtureProps) {
  const variant = Number(definition.variantSlug.match(/-(\d+)$/)?.[1] ?? 1)
  const config: import('./reference-preview-data').PromptPreviewConfig = PROMPT_PREVIEWS[definition.variantSlug] ?? { heading: definition.title, subheading: definition.description, placeholder: 'Message', labels: [] }
  const [mode, setMode] = useState(config.modes?.[0] ?? 'Compose')
  const [text, setText] = useState('')
  const [dropActive, setDropActive] = useState(false)
  const modes = config.modes ?? []
  const isHero = Boolean(config.empty)
  return <div className={`rb-reference-prompt rb-reference-prompt-${variant}`} onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><header><div><strong>{config.heading}</strong><small>{config.subheading}</small></div>{modes.length > 0 && <div className="rb-reference-prompt-mode">{modes.map((item) => <button type="button" key={item} className={mode === item ? 'selected' : ''} onClick={() => setMode(item)}>{item}</button>)}</div>}</header>{isHero ? <div className="rb-reference-prompt-hero"><Sparkles size={20} /><strong>{config.heading}</strong><p>{config.subheading}</p><div className="rb-reference-chip-row">{config.labels.map((label) => <button type="button" key={label} onClick={() => setText(label)}>{label}</button>)}</div><div className="rb-reference-recent"><small>Recent prompts</small><button type="button" onClick={() => setText('Review the latest run')}>Review the latest run <ArrowRightIcon /></button></div></div> : <div className={`rb-reference-prompt-box${dropActive ? ' drop-active' : ''}`} onDragEnter={(event) => { event.preventDefault(); setDropActive(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDropActive(false)} onDrop={(event) => { event.preventDefault(); setDropActive(false) }}><textarea aria-label="Prompt" placeholder={config.placeholder} value={text} onChange={(event) => setText(event.target.value)} />{config.labels.length > 0 && config.showLabelsInTray !== false && <div className="rb-reference-upload-row"><FileText size={13} /> {config.labels.join(' · ')}</div>}{config.dropzone && <div className="rb-reference-upload-row"><Upload size={13} /> {config.dropzone}</div>}{config.contextPills && <div className="rb-reference-context-pills">{config.contextPills.map((pill) => <span key={pill}>{pill}</span>)}</div>}{config.helper && <div className="rb-reference-slash-hint"><span>{config.helperPrefix ?? '/'}</span> {config.helper}</div>}{config.tokens && <div className="rb-reference-token-counter">{config.tokens} <span>Tools enabled</span></div>}<footer><ReferenceButton variant="ghost"><Plus size={13} /> Attach</ReferenceButton><ReferenceButton variant="primary" disabled={!text.trim()}><ArrowRightIcon /> {config.submitLabel ?? 'Run'}</ReferenceButton></footer></div>}</div>
}

function ArrowRightIcon() { return <ArrowRight size={12} /> }
