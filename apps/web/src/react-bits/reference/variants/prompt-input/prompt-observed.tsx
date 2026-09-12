import { useState } from 'react'
import { ArrowUp, AtSign, ChevronDown, FileText, Mic, Paperclip, Search, SlidersHorizontal, Upload, X } from 'lucide-react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './prompt-observed.css'

export type PromptObservedVariant = 'prompt-input-1' | 'prompt-input-2' | 'prompt-input-5' | 'prompt-input-6' | 'prompt-input-7'

const initialPrompt = 'Refactor the checkout flow to use the new pricing service.\nKeep the existing analytics events intact, add a feature flag for a 10% rollout, and write a short migration note for the on-call engineer covering the rollback steps.'

function Control({ children, label, className = '', onClick }: { children: React.ReactNode; label: string; className?: string; onClick?: () => void }) {
  return <button type="button" aria-label={label} className={`rb-observed-prompt-control ${className}`} onClick={onClick}>{children}</button>
}

function ModelControl({ label = 'Atlas' }: { label?: string }) {
  return <Control label={label}><span>{label}</span><ChevronDown size={12} /></Control>
}

function PromptBox({ variant, text, setText }: { variant: PromptObservedVariant; text: string; setText: (value: string) => void }) {
  const [mode, setMode] = useState<'Ask' | 'Agent' | 'Edit'>('Agent')
  const isLong = variant === 'prompt-input-2' || variant === 'prompt-input-7'
  return <div className={`rb-observed-prompt-box rb-observed-prompt-box-${variant}`}>
    <textarea aria-label="Prompt" placeholder="Ask anything" value={text} onChange={(event) => setText(event.target.value)} />
    <footer>
      {variant === 'prompt-input-1' && <><Control label="Attach a file"><Paperclip size={15} /></Control><ModelControl /></>}
      {variant === 'prompt-input-2' && <><ModelControl /><Control label="Search" className="active"><Search size={14} />Search</Control><span className="rb-observed-prompt-counter">356 / 8K</span></>}
      {variant === 'prompt-input-6' && <Control label="Add context" className="active"><AtSign size={14} />Add context</Control>}
      {variant === 'prompt-input-7' && <><div className="rb-observed-prompt-modes">{(['Ask', 'Agent', 'Edit'] as const).map((item) => <button type="button" className={mode === item ? 'selected' : ''} key={item} onClick={() => setMode(item)}>{item}</button>)}</div><Control label="Scope: Local"><SlidersHorizontal size={13} />Local<ChevronDown size={12} /></Control><ModelControl /></>}
      {variant !== 'prompt-input-1' && variant !== 'prompt-input-2' && variant !== 'prompt-input-6' && variant !== 'prompt-input-7' && <Control label="Attach a file"><Paperclip size={15} /></Control>}
      {variant === 'prompt-input-1' && <div className="rb-observed-prompt-footer-spacer" />}
      {variant === 'prompt-input-1' && <Control label="Reasoning effort: Medium"><SlidersHorizontal size={14} /></Control>}
      {variant === 'prompt-input-1' && <Control label="Record voice"><Mic size={14} /></Control>}
      <Control label="Send" className={`send ${text.trim() ? 'enabled' : ''}`}>{isLong ? <ArrowUp size={15} /> : <ArrowUp size={15} />}</Control>
    </footer>
  </div>
}

function FilePill({ name, size, onRemove }: { name: string; size?: string; onRemove?: () => void }) {
  return <div className="rb-observed-prompt-file"><FileText size={13} /><strong>{name}</strong>{size && <small>{size}</small>}{onRemove && <button type="button" aria-label={`Remove ${name}`} onClick={onRemove}><X size={12} /></button>}</div>
}

function UploadQueue() {
  const [failed, setFailed] = useState(false)
  return <div className="rb-observed-prompt-queue">
    <FilePill name="brand-guidelines.pdf" size="3.4 MB" />
    <FilePill name="q3-campaign-metrics.csv" size="68%" />
    <div className="rb-observed-prompt-file failed"><FileText size={13} /><strong>product-shot-hero.png</strong><small>{failed ? 'Retrying' : 'Connection lost'}</small><button type="button" aria-label="Retry product-shot-hero.png" onClick={() => setFailed(true)}>{failed ? <Upload size={12} /> : <span>↻</span>}</button><button type="button" aria-label="Remove product-shot-hero.png"><X size={12} /></button></div>
  </div>
}

export function PromptObserved({ variant, onInteraction }: { variant: PromptObservedVariant; onInteraction?: ReferenceFixtureProps['onInteraction'] }) {
  const [text, setText] = useState(variant === 'prompt-input-2' ? initialPrompt : '')
  const title = variant === 'prompt-input-2' ? 'Responses can be inaccurate: check anything important.' : variant === 'prompt-input-6' ? 'Type @ to pull a file, person, or channel into context.' : variant === 'prompt-input-7' ? 'Plan and run tools to work through the task end to end.' : variant === 'prompt-input-1' ? 'Type / to run a command, or drop a file to attach it.' : ''
  return <section className={`rb-observed-prompt-surface rb-observed-prompt-surface-${variant}`} onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><div className="rb-observed-prompt-center">
    {variant === 'prompt-input-5' ? <><PromptBox variant={variant} text={text} setText={setText} /><UploadQueue /><button type="button" className="rb-observed-prompt-drop"><Upload size={15} />Drag files here, or browse</button></> : <><div className="rb-observed-prompt-context-box">{variant === 'prompt-input-1' && <div className="rb-observed-prompt-pills"><FilePill name="auth-service.ts" size="12 KB" /><FilePill name="billing-invoice-4021.pdf" size="1.2 MB" /></div>}{variant === 'prompt-input-6' && <div className="rb-observed-prompt-pills"><FilePill name="auth-service.ts" onRemove={() => undefined} /><FilePill name="billing" onRemove={() => undefined} /><FilePill name="Dana Whitfield" onRemove={() => undefined} /></div>}<PromptBox variant={variant} text={text} setText={setText} /></div>{title && <p className="rb-observed-prompt-note">{title}{variant === 'prompt-input-7' && <><br /><kbd>Enter</kbd> to send&nbsp;&nbsp; <kbd>Shift Enter</kbd> for a new line</>}</p>}</>}
  </div></section>
}
