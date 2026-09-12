import { useState } from 'react'
import { Activity, ArrowUp, Copy, FileText, Paperclip, Palette, PanelRight, Search, Send, Square, X } from 'lucide-react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './observed-chat.css'

type ChatVariant = 'ai-chat-1' | 'ai-chat-2' | 'ai-chat-3' | 'ai-chat-4' | 'ai-chat-5' | 'ai-chat-6' | 'ai-chat-7' | 'ai-chat-8'
type Message = { kind: 'user' | 'assistant'; text: string; label?: string }

const messages: Record<ChatVariant, readonly Message[]> = {
  'ai-chat-1': [
    { kind: 'user', text: 'Why did refunds spike last week?' },
    { kind: 'assistant', text: 'Refunds rose 38% week over week, from $6,730 to $9,290. Almost all of the increase came from failed renewals after the card-retry window was shortened on the 12th. Downgrade credits were flat, and duplicate charges stayed in the single digits.' },
    { kind: 'user', text: 'Break it down by plan tier.' },
    { kind: 'assistant', text: 'By plan, Growth accounted for $5,180 of the refunds and Scale for $3,240, with Starter under $900.' },
  ],
  'ai-chat-2': [
    { kind: 'user', text: 'Build a three-tier pricing table component for the marketing site.' },
    { kind: 'assistant', text: 'Here is a responsive pricing table with Starter, Growth, and Scale. It maps over a plans array so you can edit copy without touching markup.', label: 'pricing-table.tsx' },
    { kind: 'user', text: 'Add a short plan description under each price.' },
    { kind: 'assistant', text: 'Done. I added a description line beneath each price and wrote the copy for all three tiers. This is version 3, so compare it against the earlier versions from the panel.' },
    { kind: 'user', text: 'Can you make the middle plan stand out?' },
    { kind: 'assistant', text: 'I marked Growth as the recommended plan without leaning on colour: it carries a small “Recommended” label.' },
  ],
  'ai-chat-3': [
    { kind: 'user', text: 'Summarize the latest release notes' },
    { kind: 'assistant', text: 'Version 2.4 focused on the new filter panel, faster search indexing, and keyboard-navigation fixes.' },
    { kind: 'user', text: 'What changed in the filter panel?' },
    { kind: 'assistant', text: 'It moved into a docked sidebar, gained saved views, and now remembers your last query per project.' },
    { kind: 'user', text: 'Draft acceptance criteria for the new filter' },
    { kind: 'assistant', text: 'Filters apply instantly, saved views persist per project, and every control stays reachable by keyboard.' },
  ],
  'ai-chat-4': [
    { kind: 'user', text: 'Compare our onboarding completion rate to last quarter.' },
    { kind: 'assistant', text: 'Completion rose to 71%, up from 63% last quarter. The largest gain came from the shortened setup step, which cut median time to first project from nine minutes to five.' },
    { kind: 'user', text: 'Where do people still drop off?' },
    { kind: 'assistant', text: 'The biggest remaining drop is at the invite-teammates step, where 22% leave without adding anyone. Making that step optional would likely lift completion by another three to four points based on the last experiment.' },
    { kind: 'user', text: 'Draft a one-line summary for the weekly update.' },
    { kind: 'assistant', text: 'Onboarding completion reached 71% this quarter, up eight points year over year.' },
  ],
  'ai-chat-5': [
    { kind: 'user', text: 'Clean up the staging environment before tomorrow’s demo.' },
    { kind: 'assistant', text: 'I scanned the staging project and found two preview databases that have not been queried in 30 days and three API keys with no recent requests. I’ll remove them in a few steps so you can approve each one.' },
  ],
  'ai-chat-6': [
    { kind: 'user', text: 'Put together a competitive brief on the top three note-taking apps.' },
    { kind: 'assistant', text: 'I’ll split this into two parts. Researcher will gather pricing and the core feature set for each app, then Writer will turn that into a one-page brief.', label: 'PLANNER' },
    { kind: 'assistant', text: 'All three offer a free tier. Paid plans are $8, $10, and $12 per seat each month. The clearest differences are offline sync and end-to-end encryption, which only one app includes.', label: 'RESEARCHER' },
    { kind: 'user', text: 'Which one fits a small, privacy-focused team best?' },
    { kind: 'assistant', text: 'For a small team that puts privacy first, the encrypted app is the pick. It runs a small footprint and keeps the workspace local.', label: 'WRITER' },
  ],
  'ai-chat-7': [
    { kind: 'user', text: 'Summarize why net revenue retention dropped in Q3.' },
    { kind: 'assistant', text: 'Net revenue retention fell to 104% from 111% the prior quarter.¹ The decline is concentrated in the mid-market segment, where two large accounts downgraded after a reorganization.² Expansion held up in enterprise, but new upsells slowed after the pricing change.³' },
    { kind: 'user', text: 'What would recover it fastest?' },
    { kind: 'assistant', text: 'The quickest lever is re-engaging the two downgraded mid-market accounts, which together account for four of the seven points lost.² A targeted win-back offer before renewal would address most of the gap, and reversing the upsell slowdown means revisiting the new tiers.³' },
    { kind: 'user', text: 'Which segment held up best?' },
    { kind: 'assistant', text: 'Enterprise held up best: expansion there was roughly flat, so almost all of the drag is coming from mid-market rather than a broad-based decline.³ Gross retention in enterprise actually improved slightly, which is why the net number did not fall further.⁴' },
  ],
  'ai-chat-8': [{ kind: 'user', text: 'Pull the three designs from the shared folder and tell me which one' }],
}

const pinnedSources = [
  ['q3-board-deck.pdf', 'PDF · 24 pages'], ['revenue-model.xlsx', 'Spreadsheet · updated Oct 2'], ['churn-analysis.md', 'Note · 1,200 words'], ['renewals-export.csv', 'Data · 8,400 rows'], ['qbr-notes.md', 'Note · 640 words'], ['pricing-change-brief.pdf', 'PDF · 6 pages'], ['support-tickets.csv', 'Data · 2,100 rows'], ['win-back-playbook.md', 'Note · 900 words'], ['exec-summary.docx', 'Doc · 3 pages'], ['segment-cohorts.xlsx', 'Spreadsheet · 14 tabs'],
] as const
const activityItems = [
  ['Planner', 'Split the task into research + writing'], ['Researcher', 'Pulled pricing for 3 apps'], ['Researcher', 'Compared offline-sync support'], ['Researcher', 'Checked encryption coverage'], ['Researcher', 'Noted free-tier limits'], ['Writer', 'Outlined the one-page brief'], ['Writer', 'Drafted the comparison'], ['Researcher', 'Summarized review sentiment'], ['Planner', 'Flagged the price trade-off'], ['Planner', 'Reviewed for a privacy angle'], ['Writer', 'Recommending an option'],
] as const

function Header({ title, detail, compact = false }: { title: string; detail: string; compact?: boolean }) {
  return <header className={`rb-observed-chat-header${compact ? ' compact' : ''}`}><strong>{title}</strong><span>{detail}</span></header>
}

function Composer({ placeholder = 'Ask anything', stop = false, attachment = false, onInteraction: _onInteraction }: { placeholder?: string; stop?: boolean; attachment?: boolean; onInteraction?: ReferenceFixtureProps['onInteraction'] }) {
  const [text, setText] = useState('')
  return <footer className="rb-observed-composer"><div className="rb-observed-composer-input">{attachment && <div className="rb-observed-attachment"><FileText size={13} /> refunds-week-24.csv <button type="button" aria-label="Remove attachment"><X size={12} /></button></div>}<textarea aria-label="Message" placeholder={placeholder} value={text} onChange={(event) => setText(event.target.value)} /></div><div className="rb-observed-composer-actions"><button type="button" aria-label="Add attachment"><Paperclip size={15} /></button><span>⌘ Enter to send</span><button type="button" className={stop ? 'stop' : ''} aria-label={stop ? 'Stop generating' : 'Send'}>{stop ? <Square size={14} /> : <ArrowUp size={15} />}</button></div></footer>
}

function AssistantMessage({ message, tool, reasoning, approval, artifact, sources }: { message: Message; tool?: string; reasoning?: boolean; approval?: boolean; artifact?: boolean; sources?: readonly string[] }) {
  return <article className="rb-observed-message assistant"><div className="rb-observed-message-copy">{message.label && (artifact ? <button type="button" className="rb-observed-artifact-link"><FileText size={13} /><span>{message.label}</span><small>Open in panel</small><ArrowUp size={13} /></button> : <span className="rb-observed-label">{message.label}</span>)}{reasoning && <details className="rb-observed-reasoning"><summary>Thought for 4s</summary></details>}{tool && !approval && <button type="button" className="rb-observed-tool"><Search size={13} />{tool}<small>Done</small><time>1.2s</time></button>}<p>{message.text}</p>{tool && approval && <button type="button" className="rb-observed-tool"><Search size={13} />{tool}<small>Done</small><time>0.9s</time></button>}{sources && <div className="rb-observed-sources"><span>Sources</span>{sources.map((source) => <span key={source}>{source}</span>)}</div>}{approval && <><div className="rb-observed-status-lines"><span>● Approved · Deleted 2 preview databases</span><span>● Approved · Cleared 5 idle sessions</span></div><div className="rb-observed-approval"><strong><i />Needs approval</strong><p>Delete 3 unused API keys from the staging project. Any service still using them will start returning 401 errors. This cannot be undone.</p><div><button type="button">Delete keys</button><button type="button" className="primary">Keep them</button></div></div></>}</div></article>
}

function MessageStream({ variant }: { variant: ChatVariant }) {
  const stream = messages[variant]
  return <div className={`rb-observed-stream stream-${variant}`}>{stream.map((message, index) => {
    if (message.kind === 'user') return <div className="rb-observed-message user" key={`${message.text}-${index}`}>{message.text}</div>
    const assistantProps = { message, reasoning: variant === 'ai-chat-1' && index === 1, approval: variant === 'ai-chat-5' }
    if (variant === 'ai-chat-1' && index === 1) return <AssistantMessage key={`${message.text}-${index}`} {...assistantProps} tool="Searched 1,284 refunds" sources={['Billing events', 'Pricing change · Jun 12']} />
    if (variant === 'ai-chat-2' && index === 1) return <AssistantMessage key={`${message.text}-${index}`} {...assistantProps} artifact />
    if (variant === 'ai-chat-5' && index === 1) return <AssistantMessage key={`${message.text}-${index}`} {...assistantProps} tool="Scanned staging resources" />
    return <AssistantMessage key={`${message.text}-${index}`} {...assistantProps} />
  })}</div>
}

function StandardChat({ variant, onInteraction }: { variant: ChatVariant; onInteraction?: ReferenceFixtureProps['onInteraction'] }) {
  const titles: Record<ChatVariant, [string, string]> = {
    'ai-chat-1': ['Revenue assistant', 'Atlas'], 'ai-chat-4': ['Onboarding analysis', 'Atlas'], 'ai-chat-5': ['Staging cleanup', 'Atlas · Needs review'], 'ai-chat-6': ['Competitive brief', 'Planner · 3 agents'], 'ai-chat-7': ['Q3 retention review', '6 sources · cited'], 'ai-chat-2': ['Build assistant', 'Draft'], 'ai-chat-3': ['Assistant', 'Ready'], 'ai-chat-8': ['Voice message', 'Listening · 0:15'],
  }
  const [title, detail] = titles[variant]
  return <div className={`rb-observed-chat rb-observed-${variant}`} onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><Header title={title} detail={detail} />{variant === 'ai-chat-4' && <div className="rb-observed-usage"><span>Live context</span><strong>12.4k / 32k tokens</strong><i><b /></i></div>}<main className="rb-observed-column"><MessageStream variant={variant} /></main><Composer stop={variant !== 'ai-chat-5'} attachment={variant === 'ai-chat-1'} />{<button type="button" className="rb-observed-theme" aria-label="Theme"><Palette size={14} /> Theme</button>}</div>
}

function ArtifactChat({ onInteraction }: { onInteraction?: ReferenceFixtureProps['onInteraction'] }) {
  const [tab, setTab] = useState('Code')
  const [version, setVersion] = useState('v3')
  return <div className="rb-observed-chat rb-observed-ai-chat-2" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><div className="rb-observed-artifact-main"><Header title="Build assistant" detail="Draft" /><main className="rb-observed-column"><MessageStream variant="ai-chat-2" /></main><Composer placeholder="Ask for another revision" stop onInteraction={onInteraction} /></div><aside className="rb-observed-artifact"><header><strong>pricing-table.tsx</strong><div><button type="button" aria-label="Copy artifact"><Copy size={15} /></button><button type="button" aria-label="Download artifact"><ArrowUp size={15} /></button></div></header><nav><div>{['Code', 'Document'].map((item) => <button type="button" className={tab === item ? 'selected' : ''} key={item} onClick={() => setTab(item)}>{item}</button>)}</div><div>{['v3', 'v2', 'v1'].map((item) => <button type="button" className={version === item ? 'selected' : ''} key={item} onClick={() => setVersion(item)}>{item}</button>)}</div></nav><pre>{tab === 'Code' ? `type Plan = {\n  name: string\n  price: string\n  period: string\n  cta: string\n}\n\nexport function PricingTable({ plans }: { plans: Plan[] }) {\n  return (\n    <div className="grid gap-4">\n      {plans.map((plan) => (\n        <article key={plan.name}>\n          <h3>{plan.name}</h3>\n          <p>{plan.price}</p>\n          <span>{plan.period}</span>\n          <button>{plan.cta}</button>\n        </article>\n      ))}\n    </div>\n  )\n}` : `${version} · pricing table document`}</pre><button type="button" className="rb-observed-theme" aria-label="Theme"><Palette size={14} /> Theme</button></aside></div>
}

function CompactChat({ onInteraction }: { onInteraction?: ReferenceFixtureProps['onInteraction'] }) {
  return <div className="rb-observed-chat rb-observed-ai-chat-3" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><div className="rb-observed-compact-card"><Header title="Assistant" detail="● Ready" compact /><main className="rb-observed-compact-body"><MessageStream variant="ai-chat-3" /></main><Composer placeholder="Ask anything" onInteraction={onInteraction} /></div></div>
}

function ActivityChat({ onInteraction }: { onInteraction?: ReferenceFixtureProps['onInteraction'] }) {
  return <div className="rb-observed-chat rb-observed-ai-chat-6" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><div className="rb-observed-artifact-main"><Header title="Competitive brief" detail="Planner · 3 agents" /><main className="rb-observed-column"><MessageStream variant="ai-chat-6" /></main><Composer stop onInteraction={onInteraction} /></div><aside className="rb-observed-activity"><h2>Activity</h2><div>{activityItems.map(([who, text]) => <article key={`${who}-${text}`}><i /><strong>{who}</strong><span>Done</span><small>{text}</small></article>)}</div><button type="button" className="rb-observed-theme" aria-label="Theme"><Palette size={14} /> Theme</button></aside></div>
}

function PinnedChat({ onInteraction }: { onInteraction?: ReferenceFixtureProps['onInteraction'] }) {
  return <div className="rb-observed-chat rb-observed-ai-chat-7" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><aside className="rb-observed-pinned"><h2><PanelRight size={14} /> Pinned sources</h2><div>{pinnedSources.map(([name, meta], index) => <button type="button" key={name}><b>{index + 1}</b><span><strong>{name}</strong><small>{meta}</small></span></button>)}</div></aside><div className="rb-observed-artifact-main"><Header title="Q3 retention review" detail="6 sources · cited" /><main className="rb-observed-column"><MessageStream variant="ai-chat-7" /></main><Composer onInteraction={onInteraction} /></div><button type="button" className="rb-observed-theme" aria-label="Theme"><Palette size={14} /> Theme</button></div>
}

function VoiceChat({ onInteraction }: { onInteraction?: ReferenceFixtureProps['onInteraction'] }) {
  const [recording, setRecording] = useState(true)
  return <div className="rb-observed-chat rb-observed-ai-chat-8" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><div className="rb-observed-voice-column"><Header title="Voice message" detail="● Listening · 0:15" /><p className="rb-observed-voice-prompt">Pull the three designs from the shared folder and tell me which one</p><div className="rb-observed-waveform">{Array.from({ length: 32 }, (_, index) => <i key={index} style={{ height: `${18 + ((index * 13) % 42)}px` }} />)}</div><div className="rb-observed-voice-composer"><div className="rb-observed-file-pills"><span>▧ hero-option-a.png <button type="button" aria-label="Remove hero-option-a.png"><X size={12} /></button></span><span>▧ hero-option-b.png <button type="button" aria-label="Remove hero-option-b.png"><X size={12} /></button></span><span>⌕ brand-guidelines.pdf <button type="button" aria-label="Remove brand-guidelines.pdf"><X size={12} /></button></span></div><div><button type="button" className={recording ? 'recording' : ''} onClick={() => setRecording((value) => !value)} aria-label={recording ? 'Stop recording' : 'Start recording'}>{recording ? <Square size={15} /> : <Activity size={15} />}</button><span>{recording ? 'Tap to stop' : 'Tap to record'}</span><button type="button" aria-label="Send"><Send size={15} /></button></div></div></div></div>
}

export function ObservedChat({ variant, onInteraction }: { variant: ChatVariant; onInteraction?: ReferenceFixtureProps['onInteraction'] }) {
  if (variant === 'ai-chat-2') return <ArtifactChat onInteraction={onInteraction} />
  if (variant === 'ai-chat-3') return <CompactChat onInteraction={onInteraction} />
  if (variant === 'ai-chat-6') return <ActivityChat onInteraction={onInteraction} />
  if (variant === 'ai-chat-7') return <PinnedChat onInteraction={onInteraction} />
  if (variant === 'ai-chat-8') return <VoiceChat onInteraction={onInteraction} />
  return <StandardChat variant={variant} onInteraction={onInteraction} />
}

export type { ChatVariant }
