import {
    type ButtonHTMLAttributes,
    type ElementType,
    type HTMLAttributes,
    type ReactNode,
    useEffect,
    useState
} from 'react'
import type {HbarAppUiDataRow, HbarAppUiMetric, HbarAppUiOption, HbarAppUiTimelineStep} from './types'

export function HbarAppUiSurface({className = '', children, ...props}: HTMLAttributes<HTMLDivElement>) {
    return <div {...props} className={`hbar-app-ui-surface${className ? ` ${className}` : ''}`}>{children}</div>
}

type HbarAppUiSpotlightProps = HTMLAttributes<HTMLElement> & { readonly as?: 'div' | 'form' | 'section' }

export function HbarAppUiSpotlight({as = 'div', className = '', children, ...props}: HbarAppUiSpotlightProps) {
    const Element: ElementType = as
    return (
        <Element
            {...props}
            className={`hbar-app-ui-spotlight${className ? ` ${className}` : ''}`}
            onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                event.currentTarget.style.setProperty('--hbar-app-ui-x', `${event.clientX - rect.left}px`)
                event.currentTarget.style.setProperty('--hbar-app-ui-y', `${event.clientY - rect.top}px`)
                props.onPointerMove?.(event)
            }}
        >
            {children}
        </Element>
    )
}

export function HbarAppUiButton({
                                    tone = 'neutral',
                                    className = '',
                                    children,
                                    ...props
                                }: ButtonHTMLAttributes<HTMLButtonElement> & {
    readonly tone?: 'neutral' | 'accent' | 'positive' | 'warning' | 'danger'
}) {
    return <button {...props}
                   className={`hbar-app-ui-button hbar-app-ui-button-${tone}${className ? ` ${className}` : ''}`}>{children}</button>
}

export function HbarAppUiIconButton({
                                        label,
                                        className = '',
                                        children,
                                        ...props
                                    }: ButtonHTMLAttributes<HTMLButtonElement> & { readonly label: string }) {
    return <HbarAppUiButton {...props} className={`hbar-app-ui-icon-button${className ? ` ${className}` : ''}`}
                            aria-label={props['aria-label'] ?? label}
                            title={props.title ?? label}>{children}</HbarAppUiButton>
}

export function HbarAppUiTabs({options, value, onChange, label}: {
    readonly options: readonly HbarAppUiOption[];
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly label: string
}) {
    return (
        <div className="hbar-app-ui-tabs" role="group" aria-label={label}>
            {options.map((option) => <HbarAppUiButton key={option.id} type="button" aria-pressed={value === option.id}
                                                      className={value === option.id ? 'is-selected' : ''}
                                                      onClick={() => onChange(option.id)}>{option.label}</HbarAppUiButton>)}
        </div>
    )
}

export function HbarAppUiMetricStrip({metrics}: { readonly metrics: readonly HbarAppUiMetric[] }) {
    return <dl className="hbar-app-ui-metrics">{metrics.map((metric) => <div
        className={`hbar-app-ui-metric hbar-app-ui-metric-${metric.tone ?? 'neutral'}`} key={metric.label}>
        <dt>{metric.label}</dt>
        <dd>{metric.value}</dd>
        {metric.detail && <small>{metric.detail}</small>}</div>)}</dl>
}

export function HbarAppUiProgress({value, label, tone = 'accent'}: {
    readonly value: number;
    readonly label?: string;
    readonly tone?: 'accent' | 'positive' | 'warning' | 'danger'
}) {
    const bounded = Math.max(0, Math.min(100, value))
    return <div className="hbar-app-ui-progress" aria-label={label} aria-valuemin={0} aria-valuemax={100}
                aria-valuenow={bounded} role="progressbar"><span
        className={`hbar-app-ui-progress-fill hbar-app-ui-progress-${tone}`} style={{width: `${bounded}%`}}/></div>
}

export function HbarAppUiTimeline({steps}: { readonly steps: readonly HbarAppUiTimelineStep[] }) {
    return <ol className="hbar-app-ui-timeline">{steps.map((step) => <li
        className={`hbar-app-ui-timeline-step hbar-app-ui-timeline-${step.status}`} key={step.id}><span
        className="hbar-app-ui-timeline-marker" aria-hidden="true"/>
        <div><strong>{step.label}</strong>{step.detail && <small>{step.detail}</small>}</div>
    </li>)}</ol>
}

export function HbarAppUiEmptyState({icon, title, description, action}: {
    readonly icon?: ReactNode;
    readonly title: string;
    readonly description: string;
    readonly action?: ReactNode
}) {
    return <div className="hbar-app-ui-empty"><span className="hbar-app-ui-empty-icon"
                                                    aria-hidden="true">{icon ?? '·'}</span><strong>{title}</strong>
        <p>{description}</p>{action}</div>
}

export function HbarAppUiStatus({value, tone = 'neutral'}: {
    readonly value: string;
    readonly tone?: 'neutral' | 'positive' | 'warning' | 'danger'
}) {
    return <span className={`hbar-app-ui-status hbar-app-ui-status-${tone}`}><i aria-hidden="true"/>{value}</span>
}

export function HbarAppUiToolbar({title, detail, children}: {
    readonly title: string;
    readonly detail?: string;
    readonly children?: ReactNode
}) {
    return <header className="hbar-app-ui-toolbar">
        <div><strong>{title}</strong>{detail && <small>{detail}</small>}</div>
        <div className="hbar-app-ui-toolbar-actions">{children}</div>
    </header>
}

export function HbarAppUiDataTable({rows, selected, onSelect}: {
    readonly rows: readonly HbarAppUiDataRow[];
    readonly selected?: string;
    readonly onSelect: (id: string) => void
}) {
    return <div className="hbar-app-ui-table-wrap">
        <table className="hbar-app-ui-table">
            <thead>
            <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Value</th>
                <th>Details</th>
            </tr>
            </thead>
            <tbody>{rows.map((row) => <tr className={selected === row.id ? 'is-selected' : ''} key={row.id}
                                          onClick={() => onSelect(row.id)} tabIndex={0} onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(row.id)
                }
            }}>
                <td>{row.name}</td>
                <td><HbarAppUiStatus value={row.status}
                                     tone={row.status === 'Healthy' || row.status === 'Complete' ? 'positive' : row.status === 'Blocked' || row.status === 'Failed' ? 'danger' : 'warning'}/>
                </td>
                <td>{row.value}</td>
                <td>{row.detail}</td>
            </tr>)}</tbody>
        </table>
    </div>
}

export function HbarAppUiComposer({placeholder = 'Write a message', onSubmit}: {
    readonly placeholder?: string;
    readonly onSubmit?: (value: string) => void
}) {
    const [value, setValue] = useState('')
    const submit = () => {
        const next = value.trim();
        if (!next) return;
        onSubmit?.(next);
        setValue('')
    }
    return <form className="hbar-app-ui-composer" onSubmit={(event) => {
        event.preventDefault();
        submit()
    }}><textarea value={value} placeholder={placeholder} onChange={(event) => setValue(event.target.value)}
                 onKeyDown={(event) => {
                     if (event.key === 'Enter' && !event.shiftKey) {
                         event.preventDefault();
                         submit()
                     }
                 }}/>
        <div><span>{value.length} characters</span><HbarAppUiButton type="submit" tone="accent"
                                                                    disabled={!value.trim()}>Send</HbarAppUiButton>
        </div>
    </form>
}

export function HbarAppUiDialog({open, title, children, onClose, footer}: {
    readonly open: boolean;
    readonly title: string;
    readonly children: ReactNode;
    readonly onClose: () => void;
    readonly footer?: ReactNode
}) {
    useEffect(() => {
        if (!open) return;
        const handler = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose()
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler)
    }, [onClose, open])
    if (!open) return null
    return <div className="hbar-app-ui-dialog-backdrop" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
    }}>
        <section className="hbar-app-ui-dialog" role="dialog" aria-modal="true" aria-label={title}>
            <header><strong>{title}</strong><HbarAppUiIconButton label="Close" onClick={onClose}>×</HbarAppUiIconButton>
            </header>
            <div className="hbar-app-ui-dialog-body">{children}</div>
            {footer && <footer>{footer}</footer>}</section>
    </div>
}
