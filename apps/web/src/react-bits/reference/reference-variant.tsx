import { useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Code2, Copy, FileText, Gauge, Lock, Play, Search, Send, Sparkles, Terminal, Wrench, X } from 'lucide-react'
import { FloatingSurface } from '../../FloatingLayer'
import type { ReferenceFixtureProps } from './reference-types'

const CATEGORY_LABELS: Record<string, string> = {
  'ai-chat': 'AI Chat',
  'prompt-input': 'Prompt Input',
  'agent-activity': 'Agent Activity',
  'tool-calls': 'Tool Calls',
  'agent-approval': 'Agent Approval',
  'agent-plan': 'Agent Plan',
  'ai-usage': 'AI Usage',
  'app-shell': 'App Shell',
  'app-sidebar': 'App Sidebar',
  'command-menu': 'Command Menu',
  navbar: 'Navbar',
  mobile: 'Mobile',
  'data-table': 'Data Table',
  dashboard: 'Dashboard',
  analytics: 'Analytics',
  list: 'List',
  filtering: 'Filtering',
  'file-manager': 'File Manager',
  monitoring: 'Monitoring',
  'empty-state': 'Empty State',
  'settings-form': 'Settings Form',
  forms: 'Forms',
  'app-dialog': 'App Dialog',
  notifications: 'Notifications',
  onboarding: 'Onboarding',
  paywall: 'Paywall',
  authentication: 'Authentication',
  kanban: 'Kanban',
  wizard: 'Wizard',
  comments: 'Comments',
  scheduling: 'Scheduling',
  integrations: 'Integrations',
  editor: 'Editor',
  feedback: 'Feedback',
  support: 'Support',
  billing: 'Billing',
  chat: 'Chat',
}

function ChatFixture({ definition }: ReferenceFixtureProps) {
  const [modelOpen, setModelOpen] = useState(false)
  const modelTrigger = useRef<HTMLButtonElement>(null)
  const [message, setMessage] = useState('')
  const variant = definition.variantSlug
  const isEmpty = variant === 'ai-chat-3' || variant === 'prompt-input-3'
  const isApproval = variant === 'ai-chat-5'
  const isArtifact = variant === 'ai-chat-2'
  const isPinned = variant === 'ai-chat-7'
  const isUsage = variant === 'ai-chat-4' || variant === 'prompt-input-2'
  const isReasoning = variant === 'ai-chat-1'
  const isAttachment = variant === 'ai-chat-1' || variant === 'prompt-input-1' || variant === 'prompt-input-5'
  if (isEmpty) return <div className="rb-reference-chat rb-reference-chat-empty"><div className="rb-reference-empty-icon"><Sparkles size={20} /></div><strong>Start a new conversation</strong><p>Choose a suggested prompt or type a request to begin.</p><div className="rb-reference-chip-row"><button>Inspect workspace</button><button>Summarize changes</button><button>Draft a plan</button></div><footer className="rb-reference-composer"><textarea aria-label="Message" placeholder="Message" /></footer></div>
  return (
    <div className="rb-reference-chat">
      <header className="rb-reference-chat-header">
        <div><strong>{definition.title}</strong><small>Depot capacity model</small></div>
        <button ref={modelTrigger} className="rb-reference-model-trigger" onClick={() => setModelOpen((open) => !open)} aria-expanded={modelOpen}>
          <Sparkles size={14} /> Atlas · Balanced <ChevronDown size={13} />
        </button>
        <FloatingSurface
          mode="anchored"
          anchorRef={modelTrigger}
          open={modelOpen}
          onClose={() => setModelOpen(false)}
          placement="below"
          nested
          className="rb-reference-model-menu"
          role="menu"
          aria-label="模型选择"
        >
          <button role="menuitem" onClick={() => setModelOpen(false)}><Sparkles size={13} /> Atlas · Balanced <Check size={13} /></button>
          <button role="menuitem" onClick={() => setModelOpen(false)}><Gauge size={13} /> Atlas · Fast</button>
        </FloatingSurface>
      </header>
      {variant === 'ai-chat-9' && <div className="rb-reference-model-details"><div className="rb-reference-provider-list"><strong>Providers</strong><button className="selected"><Sparkles size={13} /> Atlas <small>Balanced</small></button><button><Gauge size={13} /> Nova <small>Reasoning</small></button></div><div className="rb-reference-detail-grid"><div><small>Context</small><strong>128k</strong></div><div><small>Cost</small><strong>$0.42 / 1M</strong></div><div><small>Reasoning effort</small><strong>Balanced</strong></div></div></div>}
      {isPinned && <div className="rb-reference-pinned-context"><span aria-hidden="true">◆</span> Pinned context <span>Workspace · 4 files</span></div>}
      {isUsage && <div className="rb-reference-usage-strip"><span>Live context</span><strong>18.4k / 128k tokens</strong><i><b /></i></div>}
      <div className="rb-reference-chat-body">
        <div className="rb-reference-message rb-reference-message-user">Model depot capacity for the next release window.</div>
        {isArtifact && <aside className="rb-reference-artifact-panel"><header><strong>Capacity model</strong><button aria-label="Close artifact"><X size={13} /></button></header><nav><button className="selected">Preview</button><button>Code</button><button>Document</button></nav><pre>{'capacity = demand * safetyFactor\nreturn capacity.withinRange()'}</pre></aside>}
        <div className="rb-reference-message rb-reference-message-assistant"><span className="rb-reference-avatar">A</span><div><strong>Atlas</strong>{isReasoning && <details open className="rb-reference-reasoning"><summary>Reasoning complete</summary><p>Checked demand, safety margin, and workspace assumptions.</p></details>}<p>Capacity is projected to remain within the balanced operating range. I can break down the assumptions or inspect the attached context.</p><div className="rb-reference-tool-row"><Wrench size={13} /> Context analysis <span>complete</span></div></div></div>
        {isApproval && <div className="rb-reference-approval-card"><div><strong>Allow workspace write?</strong><p>This action will update the capacity model file in the selected workspace.</p></div><button className="danger">Deny</button><button className="primary">Approve</button></div>}
      </div>
      <footer className="rb-reference-composer">{isAttachment && <div className="rb-reference-attachment-tray"><FileText size={13} /> workspace/context.md <button aria-label="Remove attachment"><X size={12} /></button></div>}<textarea aria-label="Message" placeholder="Message" value={message} onChange={(event) => setMessage(event.target.value)} /><div className="rb-reference-composer-actions"><button aria-label="Attach a file"><FileText size={14} /></button><span>⌘ Enter to send</span><button className="rb-reference-send" disabled={!message.trim()} aria-label="Send"><Send size={14} /></button></div></footer>
    </div>
  )
}

function ActivityFixture({ definition }: ReferenceFixtureProps) {
  const [expanded, setExpanded] = useState(true)
  return <div className="rb-reference-activity"><header><div><strong>{definition.title}</strong><small>Live run activity</small></div><button className="rb-reference-icon-button" aria-label="Pause"><Terminal size={14} /></button></header><div className="rb-reference-activity-summary"><span className="rb-reference-status-dot running" /> Running <span>00:18</span><button onClick={() => setExpanded((value) => !value)}>{expanded ? 'Collapse' : 'Expand'}</button></div>{expanded && <ol className="rb-reference-timeline"><li className="done"><Check size={13} /><div><strong>Parse request</strong><small>2.1s · completed</small></div></li><li className="running"><Play size={13} /><div><strong>Inspect workspace</strong><small>working · 3 tools</small></div></li><li><span className="rb-reference-timeline-empty" /><div><strong>Compose response</strong><small>queued</small></div></li></ol>}</div>
}

function DataFixture({ definition }: ReferenceFixtureProps) {
  const rows = useMemo(() => ['Atlas / Balanced', 'Atlas / Fast', 'Nova / Reasoning'], [])
  return <div className="rb-reference-data"><header><div><strong>{definition.title}</strong><small>Reference data surface</small></div><div className="rb-reference-inline-actions"><button><Search size={13} /> Filter</button><button><Copy size={13} /> Export</button></div></header><div className="rb-reference-metric-grid"><div><small>Requests</small><strong>12,482</strong><span>+8.4%</span></div><div><small>Tokens</small><strong>1.8M</strong><span>within quota</span></div><div><small>Latency</small><strong>1.24s</strong><span>−12ms</span></div></div><div className="rb-reference-table">{rows.map((row, index) => <div className="rb-reference-table-row" key={row}><span>{index + 1}</span><strong>{row}</strong><small>{index === 0 ? 'active' : 'available'}</small><button aria-label={`Open ${row}`}><ChevronDown size={13} /></button></div>)}</div></div>
}

function EmptyFixture({ definition }: ReferenceFixtureProps) {
  return <div className="rb-reference-empty"><div className="rb-reference-empty-icon"><Sparkles size={20} /></div><strong>{definition.title}</strong><p>Start with a prompt or choose a suggested action to see results here.</p><div className="rb-reference-chip-row"><button>Inspect workspace</button><button>Summarize changes</button></div></div>
}

function GenericFixture({ definition }: ReferenceFixtureProps) {
  const [selected, setSelected] = useState('Overview')
  const tabs = ['Overview', 'Details', 'Activity']
  return <div className="rb-reference-generic"><header><div><strong>{definition.title}</strong><small>{CATEGORY_LABELS[definition.category] ?? definition.category} · {definition.variantSlug}</small></div><button className="rb-reference-icon-button" aria-label="Close"><X size={14} /></button></header><nav className="rb-reference-tabs">{tabs.map((tab) => <button key={tab} className={selected === tab ? 'selected' : ''} onClick={() => setSelected(tab)}>{tab}</button>)}</nav><div className="rb-reference-generic-content"><div className="rb-reference-card"><div className="rb-reference-card-icon"><Code2 size={15} /></div><div><strong>{selected}</strong><p>Composable surface with deterministic loading, empty, success and error states.</p></div><button className="rb-reference-primary"><Send size={13} /> Run</button></div><div className="rb-reference-card secondary"><Lock size={14} /><span>Fixture-only preview · production adapter is explicitly tracked in the registry.</span></div></div></div>
}

export default function ReferenceVariant(props: ReferenceFixtureProps) {
  if (props.definition.category === 'ai-chat' || props.definition.category === 'prompt-input' || props.definition.category === 'chat') return <ChatFixture {...props} />
  if (props.definition.category === 'agent-activity' || props.definition.category === 'tool-calls' || props.definition.category === 'monitoring') return <ActivityFixture {...props} />
  if (['card', 'data-table', 'dashboard', 'analytics', 'list', 'filtering', 'file-manager', 'ai-usage', 'billing'].includes(props.definition.category)) return <DataFixture {...props} />
  if (['empty-state', 'onboarding', 'paywall'].includes(props.definition.category)) return <EmptyFixture {...props} />
  return <GenericFixture {...props} />
}
