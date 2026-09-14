import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import {
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Command,
  FileText,
  Filter,
  Folder,
  Gauge,
  GitBranch,
  Inbox,
  KeyRound,
  LayoutDashboard,
  ListFilter,
  LockKeyhole,
  Menu,
  MessageCircle,
  MoreHorizontal,
  PencilLine,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  TicketCheck,
  Upload,
  Users,
  WalletCards,
  Wrench,
  Zap,
} from 'lucide-react'
import {
  HbarAppUiButton,
  HbarAppUiComposer,
  HbarAppUiDataTable,
  HbarAppUiDialog,
  HbarAppUiEmptyState,
  HbarAppUiMetricStrip,
  HbarAppUiProgress,
  HbarAppUiSpotlight,
  HbarAppUiStatus,
  HbarAppUiTabs,
  HbarAppUiTimeline,
  HbarAppUiToolbar,
} from './primitives'
import type { HbarAppUiDataRow, HbarAppUiTimelineStep, HbarAppUiVariantProps } from './types'

const profileActionContext = createContext<HbarAppUiVariantProps['onAction']>(undefined)

const rows: readonly HbarAppUiDataRow[] = [
  { id: 'alpha', name: 'Workspace sync', status: 'Healthy', value: '98.4%', detail: 'Updated 2m ago' },
  { id: 'bravo', name: 'Agent queue', status: 'Running', value: '24 jobs', detail: '3 active workers' },
  { id: 'charlie', name: 'Review gate', status: 'Blocked', value: '4 items', detail: 'Needs approval' },
  { id: 'delta', name: 'Archive export', status: 'Complete', value: '1.2 GB', detail: 'Ready to download' },
]

const fileRows: readonly HbarAppUiDataRow[] = [
  { id: 'src', name: 'src/', status: 'Healthy', value: 'directory', detail: '24 files' },
  { id: 'readme', name: 'README.md', status: 'Complete', value: '8 KB', detail: 'Updated today' },
  { id: 'settings', name: 'settings.json', status: 'Healthy', value: '2 KB', detail: 'Workspace config' },
  { id: 'report', name: 'report.csv', status: 'Running', value: '1.2 MB', detail: 'Uploading' },
]

const steps: readonly HbarAppUiTimelineStep[] = [
  { id: 'one', label: 'Load workspace context', detail: '0.4s', status: 'complete' },
  { id: 'two', label: 'Inspect the current task', detail: '1.3s', status: 'complete' },
  { id: 'three', label: 'Apply the requested change', detail: 'Running 12.8s', status: 'active' },
  { id: 'four', label: 'Validate the result', detail: 'Waiting', status: 'pending' },
  { id: 'five', label: 'Prepare the handoff', detail: 'Waiting', status: 'pending' },
]

function actionText(spec: HbarAppUiVariantProps['spec'], id: string, fallback: string) {
  return spec.actions.find((action) => action.id === id)?.label ?? fallback
}

function profileTone(state: HbarAppUiVariantProps['spec']['profile']['initialState']): 'neutral' | 'positive' | 'warning' | 'danger' {
  if (state === 'success') return 'positive'
  if (state === 'active' || state === 'warning' || state === 'review') return 'warning'
  if (state === 'error') return 'danger'
  return 'neutral'
}

const profileControlLabels: Readonly<Record<HbarAppUiVariantProps['spec']['profile']['controls'][number], string>> = {
  search: 'Search',
  filter: 'Filter',
  tabs: 'Switch view',
  picker: 'Choose',
  attachments: 'Attachments',
  upload: 'Upload',
  retry: 'Retry',
  save: 'Save',
  confirm: 'Confirm',
  sort: 'Sort',
  pagination: 'Next page',
  drag: 'Reorder',
  expand: 'Expand',
  compose: 'Compose',
}

function HbarAppUiProfileControls({ spec }: { readonly spec: HbarAppUiVariantProps['spec'] }) {
  const onAction = useContext(profileActionContext)
  const [activated, setActivated] = useState<string | undefined>()
  return <div className="hbar-app-ui-profile-controls" aria-label="Variant controls">{spec.profile.controls.map((control) => <HbarAppUiButton key={control} type="button" className={activated === control ? 'is-active' : ''} data-hbar-app-ui-control={control} onClick={() => { setActivated(control); onAction?.({ variantId: spec.id, actionId: control, value: spec.profile.initialState }) }}>{profileControlLabels[control]}</HbarAppUiButton>)}</div>
}

function HbarAppUiSurfaceFrame({ spec, children, className = '' }: { readonly spec: HbarAppUiVariantProps['spec']; readonly children: ReactNode; readonly className?: string }) {
  const { profile } = spec
  return <article className={`hbar-app-ui-variant hbar-app-ui-density-${spec.density} hbar-app-ui-surface-${profile.surface} hbar-app-ui-state-${profile.initialState} hbar-app-ui-visual-${profile.visualMode}${className ? ` ${className}` : ''}`} data-hbar-app-ui-variant={spec.id} data-hbar-app-ui-profile={profile.key} data-hbar-app-ui-surface={profile.surface} data-hbar-app-ui-state={profile.initialState} data-hbar-app-ui-controls={profile.controls.join(',')}>
    <div className="hbar-app-ui-variant-label"><span>{spec.title}</span><small>{spec.description}</small></div>
    <div className="hbar-app-ui-profile-meta"><HbarAppUiStatus value={profile.initialState} tone={profileTone(profile.initialState)} /><span>{profile.surface}</span><small>{profile.itemCount} seeded items</small><code>{profile.key}</code></div>
    <HbarAppUiProfileControls spec={spec} />
    {children}
  </article>
}

function AgentActivity({ spec, onAction }: HbarAppUiVariantProps) {
  const [running, setRunning] = useState(spec.profile.initialState === 'active')
  const currentSteps = useMemo(() => steps.slice(0, Math.max(3, Math.min(steps.length, spec.profile.itemCount + 1))).map((step, index) => {
    if (!running && index === 2) return { ...step, status: 'failed' as const, detail: 'Stopped' }
    if (running && index === 2) return { ...step, detail: `Running ${10 + (spec.profile.seed % 40)}s` }
    return step
  }), [running, spec.profile.itemCount, spec.profile.seed])
  const title = spec.profile.scenario.split(/[,.]/)[0] || 'Workspace run'
  return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title={title} detail={`${running ? 'Running' : 'Stopped'} - ${100 + (spec.profile.seed % 180)}s`}><HbarAppUiButton tone="danger" disabled={!running} onClick={() => { setRunning(false); onAction?.({ variantId: spec.id, actionId: 'cancel' }) }}><Square size={13} />{actionText(spec, 'cancel', 'Stop')}</HbarAppUiButton></HbarAppUiToolbar><HbarAppUiSpotlight className="hbar-app-ui-activity-card"><div className="hbar-app-ui-activity-heading"><div><strong>{title}</strong><HbarAppUiStatus value={running ? 'Running' : 'Stopped'} tone={running ? 'warning' : 'danger'} /></div><Clock3 size={15} /></div><HbarAppUiTimeline steps={currentSteps} /></HbarAppUiSpotlight></HbarAppUiSurfaceFrame>
}

function ToolCalls({ spec, onAction }: HbarAppUiVariantProps) {
  const calls = [{ id: 'read', name: 'file.read', detail: 'src/App.tsx', status: 'Complete' }, { id: 'write', name: 'file.write', detail: 'src/ActivityPanel.tsx', status: 'Running' }, { id: 'test', name: 'test.run', detail: 'bun test', status: 'Queued' }, { id: 'lint', name: 'lint.run', detail: 'bun run lint', status: 'Queued' }, { id: 'diff', name: 'diff.inspect', detail: 'working tree', status: 'Complete' }].slice(0, Math.max(2, Math.min(5, spec.profile.itemCount)))
  const [open, setOpen] = useState(calls[spec.profile.seed % calls.length]?.id ?? calls[0]?.id ?? 'read')
  return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title="Tool calls" detail="3 calls in this run"><HbarAppUiButton onClick={() => onAction?.({ variantId: spec.id, actionId: 'filter' })}><Filter size={13} />Filter</HbarAppUiButton><HbarAppUiButton tone="accent" onClick={() => onAction?.({ variantId: spec.id, actionId: 'open' })}><Play size={13} />Replay</HbarAppUiButton></HbarAppUiToolbar><div className="hbar-app-ui-tool-call-list">{calls.map((call) => <HbarAppUiSpotlight className={`hbar-app-ui-tool-call ${open === call.id ? 'is-open' : ''}`} key={call.id} onClick={() => setOpen(call.id)}><div><Wrench size={14} /><strong>{call.name}</strong><code>{call.detail}</code></div><HbarAppUiStatus value={call.status} tone={call.status === 'Complete' ? 'positive' : call.status === 'Running' ? 'warning' : 'neutral'} />{open === call.id && <pre>{call.status === 'Complete' ? '{"ok":true,"files":12}' : 'Awaiting tool output...'}</pre>}</HbarAppUiSpotlight>)}</div></HbarAppUiSurfaceFrame>
}

function Monitoring({ spec, onAction }: HbarAppUiVariantProps) {
  const incidentCount = spec.profile.seed % 4
  const health = 78 + (spec.profile.seed % 20)
  const metrics = [{ label: 'Healthy checks', value: `${health}/100`, tone: health > 88 ? 'positive' as const : 'warning' as const }, { label: 'Open incidents', value: String(incidentCount).padStart(2, '0'), tone: incidentCount ? 'warning' as const : 'positive' as const }, { label: 'Latency p95', value: `${280 + (spec.profile.seed % 260)}ms`, detail: `${spec.profile.itemCount * 2}% budget used` }, { label: 'Last deploy', value: `${2 + (spec.profile.seed % 40)}m ago` }]
  const services = ['API gateway', 'Worker pool', 'Event stream', 'Storage', 'Scheduler'].slice(0, Math.max(3, Math.min(5, spec.profile.itemCount)))
  return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title={spec.profile.scenario.split(/[,.]/)[0] || 'Live monitoring'} detail="Auto-refreshing"><HbarAppUiButton onClick={() => onAction?.({ variantId: spec.id, actionId: 'filter', value: spec.profile.initialState })}><SlidersHorizontal size={13} />Filters</HbarAppUiButton><HbarAppUiStatus value={spec.profile.initialState === 'error' ? 'Degraded' : 'Live'} tone={spec.profile.initialState === 'error' ? 'danger' : 'positive'} /></HbarAppUiToolbar><HbarAppUiMetricStrip metrics={metrics} /><HbarAppUiSpotlight className="hbar-app-ui-monitor-card"><div className="hbar-app-ui-monitor-heading"><strong>Service health</strong><small>Seed {spec.profile.seed % 1000} · updated just now</small></div><HbarAppUiProgress value={health} label={`Service health ${health} percent`} tone={health > 88 ? 'positive' : 'warning'} /><div className="hbar-app-ui-monitor-grid">{services.map((name, index) => <div key={name}><HbarAppUiStatus value={index === spec.profile.seed % services.length ? 'Degraded' : 'Healthy'} tone={index === spec.profile.seed % services.length ? 'warning' : 'positive'} /><span>{name}</span><small>{index === spec.profile.seed % services.length ? '1.8s' : `${120 + index * 17 + (spec.profile.seed % 30)}ms`}</small></div>)}</div></HbarAppUiSpotlight></HbarAppUiSurfaceFrame>
}

function ActivityVariant(props: HbarAppUiVariantProps) {
  if (props.spec.category === 'tool-calls') return <ToolCalls {...props} />
  if (props.spec.category === 'monitoring') return <Monitoring {...props} />
  return <AgentActivity {...props} />
}

function ConversationVariant({ spec, onAction }: HbarAppUiVariantProps) {
  const [messages, setMessages] = useState(() => [`${spec.profile.scenario}`, `Seed ${spec.profile.seed % 1000} is ready with ${spec.profile.itemCount} active items.`])
  const [mode, setMode] = useState(() => ['ask', 'plan', 'edit'][spec.profile.seed % 3] ?? 'ask')
  const send = (value: string) => { setMessages((current) => [...current, value]); onAction?.({ variantId: spec.id, actionId: 'send', value }) }
  if (spec.category === 'app-shell') return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title="Workspace shell" detail="Navigation, context and content"><HbarAppUiButton tone="accent" onClick={() => onAction?.({ variantId: spec.id, actionId: 'open' })}><LayoutDashboard size={14} />Open workspace</HbarAppUiButton></HbarAppUiToolbar><div className="hbar-app-ui-shell-demo"><aside><strong>hbar</strong><span className="is-active">Overview</span><span>Projects</span><span>Settings</span></aside><main><div><small>Workspace / Overview</small><h3>Good afternoon</h3></div><HbarAppUiMetricStrip metrics={[{ label: 'Active tasks', value: '24' }, { label: 'Reviews', value: '04', tone: 'warning' as const }]} /></main></div></HbarAppUiSurfaceFrame>
  if (spec.category === 'app-sidebar') return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title="Application sidebar" detail="Pinned spaces and recent work"><HbarAppUiButton onClick={() => onAction?.({ variantId: spec.id, actionId: 'open' })}><Plus size={14} />Add space</HbarAppUiButton></HbarAppUiToolbar><div className="hbar-app-ui-sidebar-demo"><div className="hbar-app-ui-sidebar-rail"><Sparkles size={15} /><MessageCircle size={15} /><Folder size={15} /><Settings2 size={15} /></div><div><strong>Workspace</strong><span className="is-active">Overview <small>⌘1</small></span><span>Sessions <small>⌘2</small></span><span>Files <small>⌘3</small></span><span>Shared with me <small>⌘4</small></span></div></div></HbarAppUiSurfaceFrame>
  if (spec.category === 'navbar') return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title="Workspace / Sessions" detail="Breadcrumbs and global actions"><HbarAppUiButton onClick={() => onAction?.({ variantId: spec.id, actionId: 'open' })}><Search size={14} />Search</HbarAppUiButton><HbarAppUiButton tone="accent" onClick={() => onAction?.({ variantId: spec.id, actionId: 'open' })}><Plus size={14} />New session</HbarAppUiButton></HbarAppUiToolbar><div className="hbar-app-ui-navbar-demo"><span>hbar</span><ChevronRight size={14} /><strong>Workspace</strong><ChevronRight size={14} /><span>Sessions</span><div /><HbarAppUiStatus value="Connected" tone="positive" /></div></HbarAppUiSurfaceFrame>
  if (spec.category === 'mobile') return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title="Mobile workspace" detail="Compact navigation and sheets"><HbarAppUiStatus value="390px viewport" /></HbarAppUiToolbar><div className="hbar-app-ui-mobile-demo"><div className="hbar-app-ui-mobile-top"><Menu size={17} /><strong>Overview</strong><Bell size={17} /></div><HbarAppUiMetricStrip metrics={[{ label: 'Runs', value: '24' }, { label: 'Reviews', value: '04', tone: 'warning' as const }]} /><div className="hbar-app-ui-mobile-list">{['Current task', 'Recent session', 'Open review'].map((item) => <HbarAppUiSpotlight key={item}><span>{item}</span><HbarAppUiButton type="button" onClick={() => onAction?.({ variantId: spec.id, actionId: 'open', value: item })}><ChevronRight size={14} /></HbarAppUiButton></HbarAppUiSpotlight>)}</div><div className="hbar-app-ui-mobile-dock"><MessageCircle size={15} /><Folder size={15} /><Plus size={17} /><Bell size={15} /><Settings2 size={15} /></div></div></HbarAppUiSurfaceFrame>
  if (spec.category === 'comments') return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title="Review thread" detail="3 comments"><HbarAppUiButton tone="positive" onClick={() => onAction?.({ variantId: spec.id, actionId: 'open' })}><CheckCircle2 size={14} />Resolve</HbarAppUiButton></HbarAppUiToolbar><div className="hbar-app-ui-comment-thread">{['Please keep this state local to the session.', 'Agreed. I moved the update beside the action.'].map((message, index) => <HbarAppUiSpotlight key={message}><span className="hbar-app-ui-avatar">{index ? 'h' : 'U'}</span><div><strong>{index ? 'hbar' : 'You'}</strong><p>{message}</p><small>{index ? '2m ago' : '5m ago'}</small></div><MoreHorizontal size={14} /></HbarAppUiSpotlight>)}</div><HbarAppUiComposer placeholder="Reply to this thread" onSubmit={send} /></HbarAppUiSurfaceFrame>
  if (spec.category === 'support') return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title="Support inbox" detail="12 open requests"><HbarAppUiButton tone="accent" onClick={() => onAction?.({ variantId: spec.id, actionId: 'open' })}><TicketCheck size={14} />New ticket</HbarAppUiButton></HbarAppUiToolbar><div className="hbar-app-ui-support-list">{['Unable to connect workspace', 'Question about run budget', 'Export is still processing'].map((item, index) => <HbarAppUiSpotlight key={item}><Inbox size={14} /><div><strong>{item}</strong><small>{index + 1}h ago - {index + 1} replies</small></div><HbarAppUiStatus value={index === 0 ? 'Urgent' : 'Open'} tone={index === 0 ? 'danger' : 'neutral'} /></HbarAppUiSpotlight>)}</div></HbarAppUiSurfaceFrame>
  if (spec.category === 'prompt-input') return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title="Prompt input" detail={`${mode} mode · ${spec.profile.itemCount} context items`}><HbarAppUiTabs label="Prompt mode" value={mode} options={[{ id: 'ask', label: 'Ask' }, { id: 'plan', label: 'Plan' }, { id: 'edit', label: 'Edit' }]} onChange={(value) => { setMode(value); onAction?.({ variantId: spec.id, actionId: 'mode', value }) }} /></HbarAppUiToolbar><div className="hbar-app-ui-prompt-input"><div className="hbar-app-ui-prompt-context"><HbarAppUiStatus value="Workspace context" tone="positive" /><span>{spec.profile.itemCount} files attached</span><HbarAppUiButton onClick={() => onAction?.({ variantId: spec.id, actionId: 'attach' })}><FileText size={13} />Attach</HbarAppUiButton></div><HbarAppUiComposer placeholder="Describe the task for your agent" onSubmit={send} /></div></HbarAppUiSurfaceFrame>
  if (spec.category === 'chat') return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title="Team chat" detail="# operations - 8 members"><HbarAppUiButton tone="accent" onClick={() => onAction?.({ variantId: spec.id, actionId: 'invite' })}><Users size={14} />Invite</HbarAppUiButton></HbarAppUiToolbar><div className="hbar-app-ui-chat-layout"><aside><strong>Channels</strong><span className="is-active"># operations</span><span># releases</span><span># support</span><strong>Direct</strong><span>hbar</span></aside><main><div className="hbar-app-ui-conversation">{messages.slice(-3).map((message, index) => <HbarAppUiSpotlight className="hbar-app-ui-message" key={`${message}-${index}`}><span className="hbar-app-ui-avatar">{index ? 'h' : 'U'}</span><div><strong>{index ? 'hbar' : 'You'}</strong><p>{message}</p><small>Today - 10:2{index}</small></div></HbarAppUiSpotlight>)}</div><HbarAppUiComposer placeholder="Message # operations" onSubmit={send} /></main></div></HbarAppUiSurfaceFrame>
  return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title="Workspace assistant" detail="Ready - local session"><HbarAppUiButton tone="accent" onClick={() => onAction?.({ variantId: spec.id, actionId: 'open' })}><Menu size={14} />Context</HbarAppUiButton></HbarAppUiToolbar><div className="hbar-app-ui-conversation">{messages.map((message, index) => <HbarAppUiSpotlight className={`hbar-app-ui-message ${index === messages.length - 1 ? 'is-highlighted' : ''}`} key={`${message}-${index}`}><span className="hbar-app-ui-avatar">{index % 2 ? 'h' : 'U'}</span><div><strong>{index % 2 ? 'hbar' : 'You'}</strong><p>{message}</p><small>Today - {index + 1}:2{index}</small></div></HbarAppUiSpotlight>)}</div><HbarAppUiComposer placeholder="Ask about the current workspace" onSubmit={send} /></HbarAppUiSurfaceFrame>
}

function TableVariant({ spec, onAction }: HbarAppUiVariantProps) {
  const [selected, setSelected] = useState('')
  const [query, setQuery] = useState('')
  const sourceRows = spec.category === 'file-manager' ? fileRows : rows
  const variantRows = sourceRows.map((row, index) => ({ ...row, id: `${row.id}-${spec.profile.seed % 97}`, name: `${row.name} · ${spec.profile.seed % 100 + index}`, value: index === 0 ? `${spec.profile.itemCount} items` : row.value })).slice(0, Math.max(2, Math.min(sourceRows.length, spec.profile.itemCount)))
  const filteredRows = variantRows.filter((row) => `${row.name} ${row.status} ${row.detail}`.toLowerCase().includes(query.toLowerCase()))
  if (spec.category === 'filtering') return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title={spec.profile.scenario.split(/[,.]/)[0] || 'Refine results'} detail={`Query, facets and ${spec.profile.itemCount} saved results`}><HbarAppUiButton onClick={() => onAction?.({ variantId: spec.id, actionId: 'filter', value: spec.profile.surface })}><ListFilter size={13} />Add filter</HbarAppUiButton><HbarAppUiButton tone="accent" onClick={() => onAction?.({ variantId: spec.id, actionId: 'open' })}>Save view</HbarAppUiButton></HbarAppUiToolbar><div className="hbar-app-ui-filter-layout"><HbarAppUiSpotlight><strong>Status</strong>{['All', 'Healthy', 'Running', 'Blocked'].slice(0, Math.max(2, Math.min(4, spec.profile.itemCount))).map((item) => <label key={item}><input type="checkbox" defaultChecked={item === 'All'} />{item}<small>{(spec.profile.seed + item.length) % 24}</small></label>)}</HbarAppUiSpotlight><div className="hbar-app-ui-filter-results"><div className="hbar-app-ui-filter-query"><Search size={14} /><input placeholder="Filter records" aria-label="Filter records" />{variantRows.slice(0, 3).map((row) => <HbarAppUiSpotlight key={row.id}><span>{row.name}</span><HbarAppUiStatus value={row.status} tone={row.status === 'Healthy' ? 'positive' : 'warning'} /><small>{row.detail}</small></HbarAppUiSpotlight>)}</div></div></div></HbarAppUiSurfaceFrame>
  if (spec.category === 'list') return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title={spec.profile.scenario.split(/[,.]/)[0] || 'Work queue'} detail={`${variantRows.length} items`}><HbarAppUiButton onClick={() => onAction?.({ variantId: spec.id, actionId: 'filter' })}><Filter size={13} />Filter</HbarAppUiButton><HbarAppUiButton tone="accent" onClick={() => onAction?.({ variantId: spec.id, actionId: 'open' })}><Plus size={13} />Add item</HbarAppUiButton></HbarAppUiToolbar><div className="hbar-app-ui-queue-list">{variantRows.map((row, index) => <HbarAppUiSpotlight key={row.id}><span className="hbar-app-ui-queue-index">{String(index + 1).padStart(2, '0')}</span><div><strong>{row.name}</strong><small>{row.detail}</small></div><HbarAppUiStatus value={row.status} tone={row.status === 'Healthy' || row.status === 'Complete' ? 'positive' : 'warning'} /><ChevronRight size={14} /></HbarAppUiSpotlight>)}</div></HbarAppUiSurfaceFrame>
  return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title={spec.category === 'file-manager' ? 'Workspace files' : 'Workspace records'} detail={`${filteredRows.length} records · ${spec.profile.initialState}`}><HbarAppUiButton onClick={() => onAction?.({ variantId: spec.id, actionId: 'filter' })}><Filter size={13} />Filter</HbarAppUiButton><HbarAppUiButton tone="accent" onClick={() => onAction?.({ variantId: spec.id, actionId: 'open' })}><Plus size={13} />{spec.category === 'file-manager' ? 'Upload' : 'New record'}</HbarAppUiButton></HbarAppUiToolbar><div className="hbar-app-ui-table-tools"><div><Search size={14} /><input aria-label="Search records" placeholder={spec.category === 'file-manager' ? 'Search files' : 'Search records'} value={query} onChange={(event) => setQuery(event.target.value)} /></div><span>{selected ? `Selected: ${selected}` : 'No selection'}</span></div><HbarAppUiDataTable rows={filteredRows} selected={selected} onSelect={(id) => { setSelected(id); onAction?.({ variantId: spec.id, actionId: 'open', value: id }) }} /></HbarAppUiSurfaceFrame>
}

function DashboardVariant({ spec, onAction }: HbarAppUiVariantProps) {
  const [range, setRange] = useState(() => ['24h', '7d', '30d'][spec.profile.seed % 3] ?? '7d')
  const base = spec.profile.seed % 70
  if (spec.category === 'ai-usage') return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title="AI usage" detail={`${spec.profile.itemCount} tracked providers · ${range}`}><HbarAppUiTabs label="Usage range" value={range} options={[{ id: '24h', label: '24h' }, { id: '7d', label: '7d' }, { id: '30d', label: '30d' }]} onChange={(value) => { setRange(value); onAction?.({ variantId: spec.id, actionId: 'filter', value }) }} /></HbarAppUiToolbar><HbarAppUiMetricStrip metrics={[{ label: 'Tokens used', value: `${58 + base}k`, detail: `${42 + (base % 35)}% of limit` }, { label: 'Estimated cost', value: `$${(2 + base / 20).toFixed(2)}`, tone: 'positive' as const }, { label: 'Requests', value: `${820 + base * 7}` }, { label: 'Remaining', value: `${120 - base}k`, tone: 'positive' as const }]} /><HbarAppUiSpotlight className="hbar-app-ui-usage-card"><div className="hbar-app-ui-usage-row"><div><strong>Balanced assistant</strong><small>{42 + base}k tokens</small></div><HbarAppUiProgress value={48 + (base % 35)} label="Balanced assistant usage" /><span>{48 + (base % 35)}%</span></div><div className="hbar-app-ui-usage-row"><div><strong>Fast assistant</strong><small>{16 + (base % 30)}k tokens</small></div><HbarAppUiProgress value={22 + (base % 35)} label="Fast assistant usage" tone="positive" /><span>{22 + (base % 35)}%</span></div></HbarAppUiSpotlight></HbarAppUiSurfaceFrame>
  if (spec.category === 'card') return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title={spec.profile.scenario.split(/[,.]/)[0] || 'Summary cards'} detail={`${spec.profile.itemCount} live surfaces`}><HbarAppUiButton onClick={() => onAction?.({ variantId: spec.id, actionId: 'filter' })}><MoreHorizontal size={15} />Customize</HbarAppUiButton></HbarAppUiToolbar><div className="hbar-app-ui-card-grid">{[{ icon: Zap, label: 'Active runs', value: String(18 + (base % 20)), detail: `+${8 + (base % 9)}%` }, { icon: ShieldCheck, label: 'Review gate', value: String(2 + (base % 6)).padStart(2, '0'), detail: `${1 + (base % 3)} urgent` }, { icon: GitBranch, label: 'Branches', value: String(12 + (base % 15)), detail: `${2 + (base % 8)} today` }, { icon: Gauge, label: 'Capacity', value: `${55 + (base % 35)}%`, detail: spec.profile.initialState }].slice(0, Math.max(2, Math.min(4, spec.profile.itemCount))).map(({ icon: Icon, label, value, detail }) => <HbarAppUiSpotlight key={label}><Icon size={16} /><small>{label}</small><strong>{value}</strong><span>{detail}</span></HbarAppUiSpotlight>)}</div></HbarAppUiSurfaceFrame>
  if (spec.category === 'paywall') return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title="Choose a plan" detail={`${spec.profile.itemCount} capabilities in this comparison`}><HbarAppUiStatus value={spec.profile.initialState === 'warning' ? 'Limit reached' : 'Current plan: Starter'} tone={spec.profile.initialState === 'warning' ? 'warning' : 'neutral'} /></HbarAppUiToolbar><div className="hbar-app-ui-plan-grid">{[{ name: 'Starter', price: '$0', detail: 'For trying the workspace' }, { name: 'Pro', price: '$24', detail: 'For daily production work' }, { name: 'Team', price: '$48', detail: 'For shared operations' }].map((plan, index) => <HbarAppUiSpotlight className={index === (spec.profile.seed % 3) ? 'is-featured' : ''} key={plan.name}><strong>{plan.name}</strong><b>{plan.price}<small>/month</small></b><p>{plan.detail}</p><HbarAppUiButton tone={index === (spec.profile.seed % 3) ? 'accent' : 'neutral'} onClick={() => onAction?.({ variantId: spec.id, actionId: 'open', value: plan.name })}>{index === 0 ? 'Current plan' : 'Choose plan'}</HbarAppUiButton></HbarAppUiSpotlight>)}</div></HbarAppUiSurfaceFrame>
  if (spec.category === 'integrations') return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title="Integrations" detail="Connected services"><HbarAppUiButton tone="accent" onClick={() => onAction?.({ variantId: spec.id, actionId: 'open' })}><Plus size={14} />Browse catalog</HbarAppUiButton></HbarAppUiToolbar><div className="hbar-app-ui-integration-grid">{[{ icon: GitBranch, name: 'Git provider', state: 'Connected' }, { icon: Bell, name: 'Notifications', state: 'Connected' }, { icon: WalletCards, name: 'Billing export', state: 'Needs setup' }, { icon: Users, name: 'Team directory', state: 'Connected' }].map(({ icon: Icon, name, state }) => <HbarAppUiSpotlight key={name}><Icon size={17} /><div><strong>{name}</strong><HbarAppUiStatus value={state} tone={state === 'Connected' ? 'positive' : 'warning'} /></div><ChevronRight size={14} /></HbarAppUiSpotlight>)}</div></HbarAppUiSurfaceFrame>
  if (spec.category === 'billing') return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title="Billing overview" detail="September 2026"><HbarAppUiButton onClick={() => onAction?.({ variantId: spec.id, actionId: 'filter' })}><Filter size={13} />Filter</HbarAppUiButton><HbarAppUiButton tone="accent" onClick={() => onAction?.({ variantId: spec.id, actionId: 'open' })}><FileText size={13} />Download</HbarAppUiButton></HbarAppUiToolbar><HbarAppUiMetricStrip metrics={[{ label: 'Current total', value: '$128.40' }, { label: 'Usage', value: '64%', detail: 'Within plan' }, { label: 'Next invoice', value: 'Oct 01' }]} /><div className="hbar-app-ui-invoice-list">{['INV-2026-09', 'INV-2026-08', 'INV-2026-07'].map((invoice, index) => <HbarAppUiSpotlight key={invoice}><FileText size={15} /><div><strong>{invoice}</strong><small>{index ? 'Paid' : 'Due Oct 01'} - Workspace plan</small></div><b>{index ? '$96.00' : '$128.40'}</b><ChevronRight size={14} /></HbarAppUiSpotlight>)}</div></HbarAppUiSurfaceFrame>
  return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title={spec.category === 'analytics' ? 'Analytics overview' : 'Operations overview'} detail={`${spec.profile.scenario.split(/[,.]/)[0] || 'Updated just now'} · ${range}`}><HbarAppUiTabs label="Range" value={range} options={[{ id: '24h', label: '24h' }, { id: '7d', label: '7d' }, { id: '30d', label: '30d' }]} onChange={(value) => { setRange(value); onAction?.({ variantId: spec.id, actionId: 'filter', value }) }} /></HbarAppUiToolbar><HbarAppUiMetricStrip metrics={[{ label: 'Active runs', value: String(16 + (base % 25)), detail: `+${8 + (base % 12)}% this period`, tone: 'positive' as const }, { label: 'Input tokens', value: `${72 + base}k`, detail: 'Within budget' }, { label: 'Queue time', value: `${(1 + (base % 20) / 10).toFixed(1)}s`, detail: `${(base % 5) / 10}s improvement`, tone: 'positive' as const }, { label: 'Needs review', value: String(1 + (base % 7)).padStart(2, '0'), detail: `${1 + (base % 3)} high priority`, tone: 'warning' as const }]} /><div className="hbar-app-ui-dashboard-grid"><HbarAppUiSpotlight><h3>{spec.category === 'analytics' ? 'Throughput trend' : 'Execution pace'}</h3><div className="hbar-app-ui-chart">{Array.from({ length: Math.max(5, Math.min(9, spec.profile.itemCount + 4)) }, (_, index) => <span style={{ height: `${28 + ((base + index * 17) % 65)}%` }} key={index} />)}</div></HbarAppUiSpotlight><HbarAppUiSpotlight><h3>Capacity</h3><HbarAppUiProgress value={48 + (base % 45)} label="Capacity" tone={spec.profile.initialState === 'warning' ? 'warning' : 'positive'} /><p className="hbar-app-ui-note">{spec.profile.itemCount} work surfaces are available in this window.</p><HbarAppUiButton tone="accent" onClick={() => onAction?.({ variantId: spec.id, actionId: 'open', value: spec.profile.surface })}>View details</HbarAppUiButton></HbarAppUiSpotlight></div></HbarAppUiSurfaceFrame>
}

function FormVariant({ spec, onAction }: HbarAppUiVariantProps) {
  const [saved, setSaved] = useState(spec.profile.initialState === 'success')
  const [rating, setRating] = useState((spec.profile.seed % 5) + 1)
  if (spec.category === 'authentication') return <HbarAppUiSurfaceFrame spec={spec}><div className="hbar-app-ui-auth-card"><div className="hbar-app-ui-auth-mark"><KeyRound size={21} /></div><h2>{spec.profile.scenario.split(/[,.]/)[0] || 'Sign in to hbar'}</h2><p>Continue to your local workspace.</p><label>Email<input type="email" placeholder={`member${spec.profile.seed % 100}@workspace.test`} /></label><label>Password<input type="password" placeholder="Enter password" /></label><HbarAppUiButton tone="accent" onClick={() => { setSaved(true); onAction?.({ variantId: spec.id, actionId: 'save', value: spec.profile.initialState }) }}>{saved ? 'Signed in' : 'Sign in'} <ChevronRight size={14} /></HbarAppUiButton><small><LockKeyhole size={12} /> Your credentials stay on this device.</small></div></HbarAppUiSurfaceFrame>
  if (spec.category === 'feedback') return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title="Share feedback" detail={`${spec.profile.itemCount} prompts · help shape the next release`}><HbarAppUiStatus value={saved ? 'Sent' : 'Draft'} tone={saved ? 'positive' : 'neutral'} /></HbarAppUiToolbar><div className="hbar-app-ui-feedback-form"><strong>{spec.profile.scenario.split(/[,.]/)[0] || 'How was this workspace?'}</strong><div className="hbar-app-ui-rating" role="group" aria-label="Rating">{[1, 2, 3, 4, 5].map((value) => <button className={rating >= value ? 'is-selected' : ''} type="button" key={value} onClick={() => setRating(value)} aria-label={`${value} stars`}>*</button>)}</div><textarea placeholder="Tell us what happened" /><label><input type="checkbox" />I am happy to be contacted about this feedback</label><HbarAppUiButton tone="accent" disabled={!rating} onClick={() => { setSaved(true); onAction?.({ variantId: spec.id, actionId: 'save', value: String(rating) }) }}>Send feedback</HbarAppUiButton></div></HbarAppUiSurfaceFrame>
  if (spec.category === 'editor') return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title="Document editor" detail="README.md"><HbarAppUiButton onClick={() => onAction?.({ variantId: spec.id, actionId: 'filter' })}><PencilLine size={14} />Preview</HbarAppUiButton><HbarAppUiButton tone="accent" onClick={() => { setSaved(true); onAction?.({ variantId: spec.id, actionId: 'save' }) }}><Check size={14} />Save</HbarAppUiButton></HbarAppUiToolbar><div className="hbar-app-ui-editor"><textarea defaultValue={'# Workspace notes\n\nCapture decisions and context here.'} /><div><small>Preview</small><h3>Workspace notes</h3><p>Capture decisions and context here.</p></div></div></HbarAppUiSurfaceFrame>
  if (spec.category === 'empty-state') return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiEmptyState icon={<Folder size={20} />} title="No files yet" description="Upload a file or connect a workspace to get started." action={<HbarAppUiButton tone="accent" onClick={() => onAction?.({ variantId: spec.id, actionId: 'recover' })}><Upload size={14} />Upload file</HbarAppUiButton>} /></HbarAppUiSurfaceFrame>
  return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title={spec.category === 'settings-form' ? 'Workspace settings' : 'Request details'} detail={`${spec.profile.itemCount} fields · local scope`}><HbarAppUiStatus value={saved ? 'Saved' : 'Unsaved changes'} tone={saved ? 'positive' : 'warning'} /></HbarAppUiToolbar><div className="hbar-app-ui-form"><label>{spec.category === 'settings-form' ? 'Workspace name' : 'Name'}<input defaultValue={`hbar ${spec.profile.seed % 1000}`} onChange={() => setSaved(false)} /></label><label>{spec.category === 'forms' ? 'Description' : 'Default model'}{spec.category === 'forms' ? <textarea placeholder="Add a short description" /> : <select defaultValue={['local', 'balanced', 'fast'][spec.profile.seed % 3]}><option value="local">Local fixture</option><option value="balanced">Balanced assistant</option><option value="fast">Fast assistant</option></select>}</label><label>Run budget<input type="range" min="1" max="100" defaultValue={String(30 + (spec.profile.seed % 70))} /></label><div className="hbar-app-ui-form-actions"><HbarAppUiButton onClick={() => { setSaved(false); onAction?.({ variantId: spec.id, actionId: 'reset' }) }}>Reset</HbarAppUiButton><HbarAppUiButton tone="accent" onClick={() => { setSaved(true); onAction?.({ variantId: spec.id, actionId: 'save' }) }}><Check size={14} />Save changes</HbarAppUiButton></div></div></HbarAppUiSurfaceFrame>
}

function OverlayVariant({ spec, onAction }: HbarAppUiVariantProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  if (spec.category === 'command-menu') return <HbarAppUiSurfaceFrame spec={spec}><div className="hbar-app-ui-command-menu"><div className="hbar-app-ui-command-search"><Search size={15} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search commands" aria-label="Search commands" /></div>{['Open workspace', 'Run diagnostics', 'Create new session', 'Change theme', 'Review activity', 'Export report'].slice(0, Math.max(3, Math.min(6, spec.profile.itemCount + 1))).filter((item) => item.toLowerCase().includes(query.toLowerCase())).map((item, index) => <button type="button" key={item} onClick={() => onAction?.({ variantId: spec.id, actionId: 'open', value: item })}><span>{index + 1}</span><Command size={14} />{item}<small>⌘{index + 1}</small></button>)}</div></HbarAppUiSurfaceFrame>
  if (spec.category === 'notifications') return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title="Notifications" detail={`${spec.profile.itemCount} unread`}><HbarAppUiButton onClick={() => onAction?.({ variantId: spec.id, actionId: 'filter', value: 'read-all' })}>Mark all read</HbarAppUiButton></HbarAppUiToolbar><div className="hbar-app-ui-notification-list">{[{ title: 'Run completed', detail: 'Workspace sync finished successfully', tone: 'positive' as const }, { title: 'Approval needed', detail: 'A tool call is waiting for your decision', tone: 'warning' as const }, { title: 'Connection restored', detail: 'Local host is ready', tone: 'positive' as const }, { title: 'Budget threshold', detail: 'Usage is approaching the current limit', tone: 'warning' as const }].slice(0, Math.max(2, Math.min(4, spec.profile.itemCount))).map((notification) => <HbarAppUiSpotlight key={notification.title}><Bell size={15} /><div><strong>{notification.title}</strong><small>{notification.detail}</small></div><HbarAppUiStatus value="New" tone={notification.tone} /></HbarAppUiSpotlight>)}</div></HbarAppUiSurfaceFrame>
  return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiEmptyState icon={<ShieldCheck size={20} />} title={spec.profile.initialState === 'error' ? 'Action needs attention' : 'Review required'} description={spec.profile.scenario} action={<HbarAppUiButton tone="accent" onClick={() => { setOpen(true); onAction?.({ variantId: spec.id, actionId: 'open' }) }}>Open detail</HbarAppUiButton>} /><HbarAppUiDialog open={open} title={spec.category === 'agent-approval' ? 'Review requested action' : 'Application dialog'} onClose={() => setOpen(false)} footer={<><HbarAppUiButton onClick={() => setOpen(false)}>Cancel</HbarAppUiButton><HbarAppUiButton tone="accent" onClick={() => { setOpen(false); onAction?.({ variantId: spec.id, actionId: 'confirm' }) }}>Confirm</HbarAppUiButton></>}><div className="hbar-app-ui-review"><HbarAppUiStatus value={spec.profile.initialState === 'error' ? 'Needs recovery' : 'Needs your decision'} tone={spec.profile.initialState === 'error' ? 'danger' : 'warning'} /><p>{spec.profile.scenario}</p><code>scope: seeded surface {spec.profile.seed % 1000}</code></div></HbarAppUiDialog></HbarAppUiSurfaceFrame>
}

function WorkflowVariant({ spec, onAction }: HbarAppUiVariantProps) {
  const [current, setCurrent] = useState(Math.max(1, Math.min(5, (spec.profile.seed % 4) + 1)))
  if (spec.category === 'kanban') return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title={spec.profile.scenario.split(/[,.]/)[0] || 'Work board'} detail={`Grouped by status · ${spec.profile.itemCount} cards`}><HbarAppUiButton tone="accent" onClick={() => onAction?.({ variantId: spec.id, actionId: 'open' })}><Plus size={14} />Add card</HbarAppUiButton></HbarAppUiToolbar><div className="hbar-app-ui-kanban">{[{ title: 'Todo', items: ['Review API contract', 'Update empty state', 'Check permissions'] }, { title: 'In progress', items: ['Build activity panel', 'Validate response'] }, { title: 'Done', items: ['Create workspace', 'Publish notes'] }].map((column, columnIndex) => <div key={column.title}><div><strong>{column.title}</strong><small>{Math.min(column.items.length, Math.max(1, spec.profile.itemCount - columnIndex))}</small></div>{column.items.slice(0, Math.max(1, Math.min(column.items.length, spec.profile.itemCount - columnIndex + 1))).map((item) => <HbarAppUiSpotlight key={item}><strong>{item}</strong><small>Today <MoreHorizontal size={13} /></small></HbarAppUiSpotlight>)}</div>)}</div></HbarAppUiSurfaceFrame>
  if (spec.category === 'onboarding') return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title="Set up your workspace" detail={`${current} of 4 complete`}><HbarAppUiButton tone="accent" onClick={() => { setCurrent((value) => Math.min(4, value + 1)); onAction?.({ variantId: spec.id, actionId: 'open', value: String(current + 1) }) }}>Continue</HbarAppUiButton></HbarAppUiToolbar><div className="hbar-app-ui-onboarding"><HbarAppUiProgress value={current * 25} label="Onboarding progress" />{['Connect a local host', 'Choose a workspace', 'Run your first task', 'Invite a teammate'].map((item, index) => <div className={index < current ? 'is-complete' : ''} key={item}><span>{index < current ? <Check size={13} /> : index + 1}</span><div><strong>{item}</strong><small>{index < current ? 'Complete' : 'Not started'}</small></div><ChevronRight size={14} /></div>)}</div></HbarAppUiSurfaceFrame>
  if (spec.category === 'scheduling') return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title="Schedule a run" detail="Select a time window"><HbarAppUiButton onClick={() => onAction?.({ variantId: spec.id, actionId: 'filter' })}><CalendarDays size={14} />Timezone</HbarAppUiButton><HbarAppUiButton tone="accent" onClick={() => onAction?.({ variantId: spec.id, actionId: 'open' })}>Schedule</HbarAppUiButton></HbarAppUiToolbar><div className="hbar-app-ui-schedule"><div className="hbar-app-ui-calendar"><strong>September 2026</strong>{Array.from({ length: 14 }, (_, index) => <button type="button" className={index === 6 ? 'is-selected' : ''} key={index}>{index + 1}</button>)}</div><div className="hbar-app-ui-time-slots">{['09:00', '11:30', '14:00', '16:30'].map((time, index) => <button type="button" className={index === 1 ? 'is-selected' : ''} key={time} onClick={() => onAction?.({ variantId: spec.id, actionId: 'open', value: time })}><Clock3 size={13} />{time}<small>Available</small></button>)}</div></div></HbarAppUiSurfaceFrame>
  return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title={spec.category === 'wizard' ? 'Create workspace' : 'Execution plan'} detail={`${current} of 5 steps active · ${spec.profile.initialState}`}><HbarAppUiButton tone="accent" onClick={() => { setCurrent((value) => Math.min(5, value + 1)); onAction?.({ variantId: spec.id, actionId: 'open', value: String(current + 1) }) }}>{current >= 5 ? 'Complete' : 'Continue'}</HbarAppUiButton></HbarAppUiToolbar><div className="hbar-app-ui-plan"><HbarAppUiProgress value={current * 20} label="Plan progress" /><HbarAppUiTimeline steps={steps.slice(0, Math.max(3, Math.min(steps.length, spec.profile.itemCount + 1))).map((step, index) => ({ ...step, status: index < current - 1 ? 'complete' : index === current - 1 ? 'active' : 'pending' }))} /></div></HbarAppUiSurfaceFrame>
}

export default function HbarAppUiVariant(props: HbarAppUiVariantProps) {
  const render = props.spec.layout === 'activity'
    ? <ActivityVariant {...props} />
    : props.spec.layout === 'conversation' || props.spec.layout === 'composer'
      ? <ConversationVariant {...props} />
      : props.spec.layout === 'table'
        ? <TableVariant {...props} />
        : props.spec.layout === 'dashboard'
          ? <DashboardVariant {...props} />
          : props.spec.layout === 'form'
            ? <FormVariant {...props} />
            : props.spec.layout === 'overlay'
              ? <OverlayVariant {...props} />
              : <WorkflowVariant {...props} />
  return <profileActionContext.Provider value={props.onAction}>{render}</profileActionContext.Provider>
}
