import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { Check, CircleAlert, CircleDashed, CircleDot, LoaderCircle } from 'lucide-react'
import './ReferencePrimitives.css'

export type ReferenceSurfaceKind = 'canvas' | 'panel' | 'card' | 'overlay' | 'code' | 'decision'

export function ReferenceSurface({ kind = 'panel', className = '', children, ...props }: HTMLAttributes<HTMLDivElement> & { kind?: ReferenceSurfaceKind }) {
  return <div {...props} className={`rb-reference-surface rb-reference-surface-${kind}${className ? ` ${className}` : ''}`}>{children}</div>
}

export type ReferenceTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'running'

export function ReferenceBadge({ tone = 'neutral', children, className = '' }: { tone?: ReferenceTone; children: ReactNode; className?: string }) {
  return <span className={`rb-reference-badge rb-reference-badge-${tone}${className ? ` ${className}` : ''}`}><span className="rb-reference-badge-dot" aria-hidden="true" />{children}</span>
}

export type ReferenceButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function ReferenceButton({ variant = 'secondary', className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ReferenceButtonVariant }) {
  return <button {...props} className={`rb-reference-button rb-reference-button-${variant}${className ? ` ${className}` : ''}`}>{children}</button>
}

export function ReferenceTabs({ tabs, value, onChange, className = '' }: { tabs: readonly string[]; value: string; onChange(value: string): void; className?: string }) {
  return <nav className={`rb-reference-tabs-primitive${className ? ` ${className}` : ''}`} role="tablist">{tabs.map((tab) => <button key={tab} type="button" role="tab" aria-selected={value === tab} className={value === tab ? 'selected' : ''} onClick={() => onChange(tab)}>{tab}</button>)}</nav>
}

export function ReferenceMetric({ label, value, detail, tone = 'neutral' }: { label: string; value: string; detail?: string; tone?: ReferenceTone }) {
  return <div className={`rb-reference-metric rb-reference-metric-${tone}`}><small>{label}</small><strong>{value}</strong>{detail && <span>{detail}</span>}</div>
}

export function ReferenceList({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`rb-reference-list${className ? ` ${className}` : ''}`}>{children}</div>
}

export function ReferenceListRow({ title, meta, badge, selected = false, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { title: string; meta?: string; badge?: ReactNode; selected?: boolean }) {
  return <button {...props} className={`rb-reference-list-row${selected ? ' selected' : ''}${className ? ` ${className}` : ''}`}><span className="rb-reference-list-row-main"><strong>{title}</strong>{meta && <small>{meta}</small>}</span>{badge}{children}</button>
}

export type ReferenceTimelineStatus = 'pending' | 'running' | 'success' | 'warning' | 'danger'

export function ReferenceTimeline({ items }: { items: readonly { id: string; title: string; meta: string; status: ReferenceTimelineStatus }[] }) {
  return <ol className="rb-reference-timeline-primitive">{items.map((item) => <li key={item.id} className={`rb-reference-timeline-${item.status}`}><span className="rb-reference-timeline-icon" aria-hidden="true">{item.status === 'success' ? <Check size={12} /> : item.status === 'running' ? <LoaderCircle size={12} /> : item.status === 'danger' ? <CircleAlert size={12} /> : item.status === 'warning' ? <CircleDot size={12} /> : <CircleDashed size={12} />}</span><span><strong>{item.title}</strong><small>{item.meta}</small></span></li>)}</ol>
}

export function ReferenceEmptyState({ title, description, action, icon }: { title: string; description: string; action?: ReactNode; icon?: ReactNode }) {
  return <div className="rb-reference-empty-state"><div className="rb-reference-empty-state-icon">{icon ?? <CircleDashed size={20} />}</div><strong>{title}</strong><p>{description}</p>{action}</div>
}
