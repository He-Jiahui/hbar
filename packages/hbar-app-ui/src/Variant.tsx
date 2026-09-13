import { useMemo, useState, type ReactNode } from 'react'
import { Check, Clock3, Filter, Menu, Search, ShieldCheck, Square } from 'lucide-react'
import { HbarAppUiButton, HbarAppUiComposer, HbarAppUiDataTable, HbarAppUiDialog, HbarAppUiEmptyState, HbarAppUiMetricStrip, HbarAppUiProgress, HbarAppUiSpotlight, HbarAppUiStatus, HbarAppUiTabs, HbarAppUiTimeline, HbarAppUiToolbar } from './primitives'
import type { HbarAppUiDataRow, HbarAppUiTimelineStep, HbarAppUiVariantProps } from './types'

const rows: readonly HbarAppUiDataRow[] = [
  { id: 'alpha', name: 'Workspace sync', status: 'Healthy', value: '98.4%', detail: 'Updated 2m ago' },
  { id: 'bravo', name: 'Agent queue', status: 'Running', value: '24 jobs', detail: '3 active workers' },
  { id: 'charlie', name: 'Review gate', status: 'Blocked', value: '4 items', detail: 'Needs approval' },
  { id: 'delta', name: 'Archive export', status: 'Complete', value: '1.2 GB', detail: 'Ready to download' },
]

const steps: readonly HbarAppUiTimelineStep[] = [
  { id: 'one', label: 'Load workspace context', detail: '0.4s', status: 'complete' },
  { id: 'two', label: 'Inspect the current task', detail: '1.3s', status: 'complete' },
  { id: 'three', label: 'Apply the requested change', detail: 'Running 12.8s', status: 'active' },
  { id: 'four', label: 'Validate the result', detail: 'Waiting', status: 'pending' },
  { id: 'five', label: 'Prepare the handoff', detail: 'Waiting', status: 'pending' },
]

function ActivityVariant({ spec, onAction }: HbarAppUiVariantProps) {
  const [running, setRunning] = useState(true)
  const currentSteps = useMemo(() => steps.map((step) => running ? step : step.id === 'three' ? { ...step, status: 'failed' as const, detail: 'Stopped' } : step), [running])
  return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title="Reconcile workspace task" detail={`${running ? 'Running' : 'Stopped'} · ${running ? '165.5s' : '254.6s'}`}><HbarAppUiButton tone="danger" disabled={!running} onClick={() => { setRunning(false); onAction?.({ variantId: spec.id, actionId: 'cancel' }) }}><Square size={13} />Stop</HbarAppUiButton></HbarAppUiToolbar><HbarAppUiSpotlight className="hbar-app-ui-activity-card"><div className="hbar-app-ui-activity-heading"><div><strong>Reconcile workspace task</strong><HbarAppUiStatus value={running ? 'Running' : 'Stopped'} tone={running ? 'warning' : 'danger'} /></div><Clock3 size={15} /></div><HbarAppUiTimeline steps={currentSteps} /></HbarAppUiSpotlight></HbarAppUiSurfaceFrame>
}

function ConversationVariant({ spec, onAction }: HbarAppUiVariantProps) {
  const [messages, setMessages] = useState(['I can help inspect the current workspace.', 'The latest run is ready for review.'])
  return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title="Workspace assistant" detail="Ready · Local session"><HbarAppUiButton tone="accent" onClick={() => onAction?.({ variantId: spec.id, actionId: 'open' })}><Menu size={14} />Context</HbarAppUiButton></HbarAppUiToolbar><div className="hbar-app-ui-conversation">{messages.map((message, index) => <HbarAppUiSpotlight className={`hbar-app-ui-message ${index === messages.length - 1 ? 'is-highlighted' : ''}`} key={`${message}-${index}`}><span className="hbar-app-ui-avatar">{index % 2 ? 'h' : 'U'}</span><div><strong>{index % 2 ? 'hbar' : 'You'}</strong><p>{message}</p><small>Today · {index + 1}:2{index}</small></div></HbarAppUiSpotlight>)}</div><HbarAppUiComposer placeholder="Ask about the current workspace" onSubmit={(value) => { setMessages((current) => [...current, value]); onAction?.({ variantId: spec.id, actionId: 'send', value }) }} /></HbarAppUiSurfaceFrame>
}

function TableVariant({ spec, onAction }: HbarAppUiVariantProps) {
  const [selected, setSelected] = useState('')
  return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title="Workspace records" detail={`${rows.length} records`}><HbarAppUiButton onClick={() => onAction?.({ variantId: spec.id, actionId: 'filter' })}><Filter size={13} />Filter</HbarAppUiButton><HbarAppUiButton tone="accent" onClick={() => onAction?.({ variantId: spec.id, actionId: 'open' })}>New record</HbarAppUiButton></HbarAppUiToolbar><div className="hbar-app-ui-table-tools"><div><Search size={14} /><input aria-label="Search records" placeholder="Search records" /></div><span>{selected ? `Selected: ${selected}` : 'No selection'}</span></div><HbarAppUiDataTable rows={rows} selected={selected} onSelect={(id) => { setSelected(id); onAction?.({ variantId: spec.id, actionId: 'open', value: id }) }} /></HbarAppUiSurfaceFrame>
}

function DashboardVariant({ spec, onAction }: HbarAppUiVariantProps) {
  const metrics = [{ label: 'Active runs', value: '24', detail: '+12% this period', tone: 'positive' as const }, { label: 'Input tokens', value: '128k', detail: 'Within budget' }, { label: 'Queue time', value: '1.8s', detail: '-0.4s improvement', tone: 'positive' as const }, { label: 'Needs review', value: '04', detail: 'Two high priority', tone: 'warning' as const }]
  return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title="Operations overview" detail="Updated just now"><HbarAppUiTabs label="Range" value="7d" options={[{ id: '24h', label: '24h' }, { id: '7d', label: '7d' }, { id: '30d', label: '30d' }]} onChange={(value) => onAction?.({ variantId: spec.id, actionId: 'filter', value })} /></HbarAppUiToolbar><HbarAppUiMetricStrip metrics={metrics} /><div className="hbar-app-ui-dashboard-grid"><HbarAppUiSpotlight><h3>Execution pace</h3><div className="hbar-app-ui-chart"><span style={{ height: '38%' }} /><span style={{ height: '56%' }} /><span style={{ height: '48%' }} /><span style={{ height: '74%' }} /><span style={{ height: '66%' }} /><span style={{ height: '88%' }} /><span style={{ height: '80%' }} /></div></HbarAppUiSpotlight><HbarAppUiSpotlight><h3>Capacity</h3><HbarAppUiProgress value={72} label="Capacity 72 percent" tone="positive" /><p className="hbar-app-ui-note">72% of the current execution window is available.</p><HbarAppUiButton tone="accent" onClick={() => onAction?.({ variantId: spec.id, actionId: 'open' })}>View details</HbarAppUiButton></HbarAppUiSpotlight></div></HbarAppUiSurfaceFrame>
}

function FormVariant({ spec, onAction }: HbarAppUiVariantProps) {
  const [saved, setSaved] = useState(false)
  return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title="Workspace settings" detail="Local scope"><HbarAppUiStatus value={saved ? 'Saved' : 'Unsaved changes'} tone={saved ? 'positive' : 'warning'} /></HbarAppUiToolbar><div className="hbar-app-ui-form"><label>Workspace name<input defaultValue="hbar development" onChange={() => setSaved(false)} /></label><label>Default model<select defaultValue="local"><option value="local">Local fixture</option><option value="balanced">Balanced assistant</option><option value="fast">Fast assistant</option></select></label><label>Run budget<input type="range" min="1" max="100" defaultValue="64" /></label><div className="hbar-app-ui-form-actions"><HbarAppUiButton onClick={() => { setSaved(false); onAction?.({ variantId: spec.id, actionId: 'reset' }) }}>Reset</HbarAppUiButton><HbarAppUiButton tone="accent" onClick={() => { setSaved(true); onAction?.({ variantId: spec.id, actionId: 'save' }) }}><Check size={14} />Save changes</HbarAppUiButton></div></div></HbarAppUiSurfaceFrame>
}

function OverlayVariant({ spec, onAction }: HbarAppUiVariantProps) {
  const [open, setOpen] = useState(false)
  return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiEmptyState icon={<ShieldCheck size={20} />} title="Review required" description="Open the detail surface to inspect the requested action and choose the next step." action={<HbarAppUiButton tone="accent" onClick={() => { setOpen(true); onAction?.({ variantId: spec.id, actionId: 'open' }) }}>Open detail</HbarAppUiButton>} /><HbarAppUiDialog open={open} title="Review requested action" onClose={() => setOpen(false)} footer={<><HbarAppUiButton onClick={() => setOpen(false)}>Cancel</HbarAppUiButton><HbarAppUiButton tone="accent" onClick={() => { setOpen(false); onAction?.({ variantId: spec.id, actionId: 'confirm' }) }}>Confirm</HbarAppUiButton></>}><div className="hbar-app-ui-review"><HbarAppUiStatus value="Needs your decision" tone="warning" /><p>This action changes the selected workspace state. Review the scope before continuing.</p><code>scope: current workspace</code></div></HbarAppUiDialog></HbarAppUiSurfaceFrame>
}

function WorkflowVariant({ spec, onAction }: HbarAppUiVariantProps) {
  const [current, setCurrent] = useState(2)
  return <HbarAppUiSurfaceFrame spec={spec}><HbarAppUiToolbar title="Execution plan" detail={`${current} of 5 steps active`}><HbarAppUiButton tone="accent" onClick={() => { setCurrent((value) => Math.min(5, value + 1)); onAction?.({ variantId: spec.id, actionId: 'open' }) }}>Continue</HbarAppUiButton></HbarAppUiToolbar><div className="hbar-app-ui-plan"><HbarAppUiProgress value={current * 20} label="Plan progress" /><HbarAppUiTimeline steps={steps.map((step, index) => ({ ...step, status: index < current - 1 ? 'complete' : index === current - 1 ? 'active' : 'pending' }))} /></div></HbarAppUiSurfaceFrame>
}

function HbarAppUiSurfaceFrame({ spec, children }: { readonly spec: HbarAppUiVariantProps['spec']; readonly children: ReactNode }) {
  return <article className={`hbar-app-ui-variant hbar-app-ui-density-${spec.density}`} data-hbar-app-ui-variant={spec.id}><div className="hbar-app-ui-variant-label"><span>{spec.title}</span><small>{spec.description}</small></div>{children}</article>
}

export default function HbarAppUiVariant(props: HbarAppUiVariantProps) {
  if (props.spec.layout === 'activity') return <ActivityVariant {...props} />
  if (props.spec.layout === 'conversation' || props.spec.layout === 'composer') return <ConversationVariant {...props} />
  if (props.spec.layout === 'table') return <TableVariant {...props} />
  if (props.spec.layout === 'dashboard') return <DashboardVariant {...props} />
  if (props.spec.layout === 'form') return <FormVariant {...props} />
  if (props.spec.layout === 'overlay') return <OverlayVariant {...props} />
  return <WorkflowVariant {...props} />
}
