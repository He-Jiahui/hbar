import { useRef, useState } from 'react'
import { ArrowRight, Check, ChevronDown, FileText, Plus, Send, Sparkles, Upload, Wrench, X } from 'lucide-react'
import { FloatingSurface } from '../../FloatingLayer'
import type { ReferenceFixtureProps } from './reference-types'
import { ReferenceBlueprint } from './ReferenceBlueprints'
import { ReferenceButton } from './primitives/ReferencePrimitives'
import { reportFixtureClick } from './reference-interactions'

export function ChatReferenceFixture({ definition, onInteraction }: ReferenceFixtureProps) {
  const [modelOpen, setModelOpen] = useState(false)
  const modelTrigger = useRef<HTMLButtonElement>(null)
  const [message, setMessage] = useState('')
  const [selectedModel, setSelectedModel] = useState('Atlas')
  const [reasoning, setReasoning] = useState('Balanced')
  const variant = definition.variantSlug
  const isEmpty = variant === 'ai-chat-3' || variant === 'prompt-input-3'
  const isApproval = variant === 'ai-chat-5'
  const isArtifact = variant === 'ai-chat-2'
  const isPinned = variant === 'ai-chat-7'
  const isUsage = variant === 'ai-chat-4' || variant === 'prompt-input-2'
  const isReasoning = variant === 'ai-chat-1'
  const isAttachment = variant === 'ai-chat-1' || variant === 'prompt-input-1' || variant === 'prompt-input-5'
  if (isEmpty) return <div className="rb-reference-chat rb-reference-chat-empty" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><div className="rb-reference-empty-icon"><Sparkles size={20} /></div><strong>Start a new conversation</strong><p>Choose a suggested prompt or type a request to begin.</p><div className="rb-reference-chip-row"><button>Inspect workspace</button><button>Summarize changes</button><button>Draft a plan</button></div><footer className="rb-reference-composer"><textarea aria-label="Message" placeholder="Message" /></footer></div>
  return (
    <div className="rb-reference-chat" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}>
      <header className="rb-reference-chat-header">
        <div><strong>{definition.title}</strong><small>Depot capacity model</small></div>
        {variant === 'ai-chat-9' ? <span className="rb-reference-model-summary"><Sparkles size={13} /> {selectedModel} · {reasoning}</span> : <button ref={modelTrigger} className="rb-reference-model-trigger" onClick={() => setModelOpen((open) => !open)} aria-expanded={modelOpen}>
          <Sparkles size={14} /> Atlas · Balanced <ChevronDown size={13} />
        </button>}
      </header>
      {isPinned && <div className="rb-reference-pinned-context"><span aria-hidden="true">◆</span> Pinned context <span>Workspace · 4 files</span></div>}
      {isUsage && <div className="rb-reference-usage-strip"><span>Live context</span><strong>18.4k / 128k tokens</strong><i><b /></i></div>}
      <div className="rb-reference-chat-body">
        <div className="rb-reference-message rb-reference-message-user">Model depot capacity for the next release window.</div>
        {isArtifact && <aside className="rb-reference-artifact-panel"><header><strong>Capacity model</strong><button aria-label="Close artifact"><X size={13} /></button></header><nav><button className="selected">Preview</button><button>Code</button><button>Document</button></nav><pre>{'capacity = demand * safetyFactor\nreturn capacity.withinRange()'}</pre></aside>}
        <div className="rb-reference-message rb-reference-message-assistant"><span className="rb-reference-avatar">A</span><div><strong>Atlas</strong>{isReasoning && <details open className="rb-reference-reasoning"><summary>Reasoning complete</summary><p>Checked demand, safety margin, and workspace assumptions.</p></details>}<p>Capacity is projected to remain within the balanced operating range. I can break down the assumptions or inspect the attached context.</p><div className="rb-reference-tool-row"><Wrench size={13} /> Context analysis <span>complete</span></div></div></div>
        {isApproval && <div className="rb-reference-approval-card"><div><strong>Allow workspace write?</strong><p>This action will update the capacity model file in the selected workspace.</p></div><button className="danger">Deny</button><button className="primary">Approve</button></div>}
      </div>
      <footer className="rb-reference-composer">{isAttachment && <div className="rb-reference-attachment-tray"><FileText size={13} /> workspace/context.md <button aria-label="Remove attachment"><X size={12} /></button></div>}<textarea aria-label="Message" placeholder="Message" value={message} onChange={(event) => setMessage(event.target.value)} /><div className="rb-reference-composer-actions">{variant === 'ai-chat-9' && <button ref={modelTrigger} className="rb-reference-model-trigger rb-reference-composer-model" onClick={() => setModelOpen((open) => !open)} aria-expanded={modelOpen}><Sparkles size={13} /> {selectedModel} <ChevronDown size={12} /></button>}<button aria-label="Attach a file"><FileText size={14} /></button><span>⌘ Enter to send</span><button className="rb-reference-send" disabled={!message.trim()} aria-label="Send"><Send size={14} /></button></div></footer>
      {variant === 'ai-chat-9' && <FloatingSurface
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
        <div className="rb-reference-model-options"><small>MODEL</small>{[
          ['Auto', 'Recommended', 'Northwind AI'],
          ['Atlas', '', 'Meridian Labs'],
          ['Atlas Long', '1M context', 'Meridian Labs'],
          ['Quill', '', 'Meridian Labs'],
          ['Ember', '', 'Orbital'],
          ['Wren', 'On device', 'Orbital'],
        ].map(([name, badge, provider]) => name ? <button type="button" role="option" aria-selected={selectedModel === name} className={selectedModel === name ? 'selected' : ''} key={name} onClick={() => { setSelectedModel(name); setModelOpen(false) }}><span><strong>{name}</strong>{badge && <em>{badge}</em>}<small>{provider}</small></span>{selectedModel === name && <Check size={13} />}</button> : null)}</div>
        <div className="rb-reference-model-detail"><strong>{selectedModel}</strong><small>Meridian Labs</small><p>The strongest general model. Best for multi-step work that spans several files.</p><dl><div><dt>Context</dt><dd>200K tokens</dd></div><div><dt>Speed</dt><dd>Standard</dd></div><div><dt>Cost</dt><dd>4 credits per turn</dd></div></dl><div className="rb-reference-reasoning-control"><header><span>REASONING</span><strong>{reasoning}</strong></header><div className="rb-reference-reasoning-meter"><i /><i /><i /><i /></div><div className="rb-reference-reasoning-options">{['Brief', 'Balanced', 'Detailed'].map((level) => <label key={level}><input type="radio" name="reference-reasoning" checked={reasoning === level} onChange={() => setReasoning(level)} />{level}</label>)}</div><p>Thinks through the request before answering.</p></div></div>
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
  const [mode, setMode] = useState(variant === 7 ? 'Ask' : 'Compose')
  const [text, setText] = useState('')
  const [dropActive, setDropActive] = useState(false)
  const modes = variant === 7 ? ['Ask', 'Agent', 'Edit'] : ['Compose', 'Commands', 'Context']
  return <div className={`rb-reference-prompt rb-reference-prompt-${variant}`} onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><header><div><strong>{definition.title}</strong><small>{variant === 3 ? 'Hero launcher · recent prompts' : variant === 5 ? 'Attachment drop zone · transfer state' : 'Prompt input surface'}</small></div><div className="rb-reference-prompt-mode">{modes.map((item) => <button type="button" key={item} className={mode === item ? 'selected' : ''} onClick={() => setMode(item)}>{item}</button>)}</div></header>{variant === 3 ? <div className="rb-reference-prompt-hero"><Sparkles size={20} /><strong>What can I help you ship?</strong><p>Start with a suggestion or bring a recent prompt back into focus.</p><div className="rb-reference-chip-row"><button type="button" onClick={() => setText('Inspect the workspace')}>Inspect workspace</button><button type="button" onClick={() => setText('Summarize changes')}>Summarize changes</button><button type="button" onClick={() => setText('Draft a plan')}>Draft a plan</button></div><div className="rb-reference-recent"><small>Recent prompts</small><button type="button" onClick={() => setText('Review the latest run')}>Review the latest run <ArrowRightIcon /></button></div></div> : <div className={`rb-reference-prompt-box${dropActive ? ' drop-active' : ''}`} onDragEnter={(event) => { event.preventDefault(); setDropActive(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDropActive(false)} onDrop={(event) => { event.preventDefault(); setDropActive(false) }}><textarea aria-label="Prompt" placeholder={variant === 6 ? 'Type @ to add context…' : variant === 4 ? 'Write a reusable template…' : 'Message'} value={text} onChange={(event) => setText(event.target.value)} />{variant === 5 && <div className="rb-reference-upload-row"><Upload size={13} /> Drop files here <span>or browse</span></div>}{variant === 6 && <div className="rb-reference-context-pills"><span>@workspace</span><span>@git diff</span></div>}{variant === 1 && <div className="rb-reference-slash-hint"><span>/</span> commands · ⌘ Enter to send</div>}{variant === 2 && <div className="rb-reference-token-counter">{text.length} / 4,000 tokens <span>Tools enabled</span></div>}<footer><ReferenceButton variant="ghost"><Plus size={13} /> Attach</ReferenceButton><ReferenceButton variant="primary" disabled={!text.trim()}><ArrowRightIcon /> {variant === 1 ? 'Send' : 'Run'}</ReferenceButton></footer></div>}</div>
}

function ArrowRightIcon() { return <ArrowRight size={12} /> }
