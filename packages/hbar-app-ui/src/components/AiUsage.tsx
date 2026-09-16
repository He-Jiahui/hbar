import { HbarAppUiIcon } from '../icon'
import {useState} from 'react'
import {ArrowDown, ArrowUp, ChevronDown, Gauge, Search, SlidersHorizontal} from 'lucide-react'
import {
    HbarAppUiButton,
    HbarAppUiMetricStrip,
    HbarAppUiProgress,
    HbarAppUiSpotlight,
    HbarAppUiStatus,
    HbarAppUiTabs,
    HbarAppUiToolbar
} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'
import {seededNumber} from './helpers'

type UsageProps = HbarAppUiVariantProps

function UsageOverview({spec, onAction}: UsageProps) {
    const [range, setRange] = useState('7d')
    const input = seededNumber(spec.profile.seed, 24, 52)
    const output = seededNumber(Math.floor(spec.profile.seed / 3), 16, 38)
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-usage-variant-1"><HbarAppUiToolbar
        title="Token usage" detail={`${range} · input and output`}/><HbarAppUiTabs label="Usage range" value={range}
                                                                                   options={[{
                                                                                       id: '24h',
                                                                                       label: '24h'
                                                                                   }, {
                                                                                       id: '7d',
                                                                                       label: '7d'
                                                                                   }, {id: '30d', label: '30d'}]}
                                                                                   onChange={(value) => {
                                                                                       setRange(value);
                                                                                       onAction?.({
                                                                                           variantId: spec.id,
                                                                                           actionId: 'tabs',
                                                                                           value
                                                                                       })
                                                                                   }}/><HbarAppUiMetricStrip
        metrics={[{label: 'Total tokens', value: `${input + output}k`}, {
            label: 'Input',
            value: `${input}k`,
            detail: `${Math.round(input / (input + output) * 100)}%`
        }, {
            label: 'Output',
            value: `${output}k`,
            detail: `${Math.round(output / (input + output) * 100)}%`
        }]}/><HbarAppUiSpotlight className="hbar-app-ui-stacked-bars">
        <div><span>Input tokens</span><b>{input}k</b></div>
        <HbarAppUiProgress value={input / (input + output) * 100} label="Input token share" tone="accent"/>
        <div><span>Output tokens</span><b>{output}k</b></div>
        <HbarAppUiProgress value={output / (input + output) * 100} label="Output token share"
                           tone="positive"/></HbarAppUiSpotlight></ActionSurfaceFrame>
}

function SpendByModel({spec, onAction}: UsageProps) {
    const models = ['Balanced assistant', 'Fast assistant', 'Reasoning assistant', 'Embedding worker']
    const [sort, setSort] = useState('Spend')
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-usage-variant-2"><HbarAppUiToolbar
        title="Spend by model" detail="Share bars · period deltas"/><HbarAppUiButton onClick={() => {
        setSort(sort === 'Spend' ? 'Delta' : 'Spend');
        onAction?.({variantId: spec.id, actionId: 'sort', value: sort})
    }}><HbarAppUiIcon icon={SlidersHorizontal} tier="sm" />Sort: {sort}</HbarAppUiButton>
        <div className="hbar-app-ui-model-spend-table">
            <div className="hbar-app-ui-table-heading">
                <span>Model</span><span>Share</span><span>Spend</span><span>Delta</span></div>
            {models.slice(0, Math.max(2, Math.min(models.length, spec.profile.itemCount + 1))).map((model, index) =>
                <div className="hbar-app-ui-model-spend-row" key={model}><strong>{model}</strong><HbarAppUiProgress
                    value={72 - index * 13} label={`${model} share`}/><span>${(12.4 - index * 2.1).toFixed(2)}</span><b
                    className={index === 2 ? 'is-down' : 'is-up'}>{index === 2 ? <HbarAppUiIcon icon={ArrowDown} tier="xs" /> :
                    <HbarAppUiIcon icon={ArrowUp} tier="xs" />} {index === 2 ? '4%' : `${8 - index}%`}</b></div>)}</div>
    </ActionSurfaceFrame>
}

function RateLimits({spec, onAction}: UsageProps) {
    const [tier, setTier] = useState('Team')
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-usage-variant-3"><HbarAppUiToolbar
        title="Rate limits" detail="Utilisation per window"/><select aria-label="Rate limit tier" value={tier}
                                                                     onChange={(event) => {
                                                                         setTier(event.target.value);
                                                                         onAction?.({
                                                                             variantId: spec.id,
                                                                             actionId: 'picker',
                                                                             value: event.target.value
                                                                         })
                                                                     }}>
        <option>Starter</option>
        <option>Team</option>
        <option>Enterprise</option>
    </select>
        <div className="hbar-app-ui-rate-limits">{[{
            label: 'Per minute',
            value: 62,
            reset: 'resets in 38s'
        }, {label: 'Per hour', value: 44, reset: 'resets in 22m'}, {
            label: 'Per day',
            value: 78,
            reset: 'resets tomorrow'
        }].map((meter) => <HbarAppUiSpotlight key={meter.label}>
            <div><HbarAppUiIcon icon={Gauge} tier="sm" /><strong>{meter.label}</strong><span>{meter.value}%</span></div>
            <HbarAppUiProgress value={meter.value} label={`${meter.label} utilisation`}
                               tone={meter.value > 70 ? 'warning' : 'accent'}/><small>{meter.reset} · {tier} tier</small></HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function PerSeatUsage({spec, onAction}: UsageProps) {
    const [query, setQuery] = useState('')
    const people = ['Avery Chen', 'Mina Patel', 'Jon Bell', 'Sam Rivera', 'Lee Wong']
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-usage-variant-4"><HbarAppUiToolbar
        title="Per-seat usage" detail="Team filters and individual caps"/>
        <div className="hbar-app-ui-inline-search"><HbarAppUiIcon icon={Search} tier="sm" /><input value={query}
                                                                             onChange={(event) => setQuery(event.target.value)}
                                                                             placeholder="Search people"
                                                                             aria-label="Search people"/></div>
        <HbarAppUiButton onClick={() => onAction?.({variantId: spec.id, actionId: 'filter', value: 'team'})}>Team
            filter</HbarAppUiButton>
        <div
            className="hbar-app-ui-seat-list">{people.filter((person) => person.toLowerCase().includes(query.toLowerCase())).slice(0, Math.max(2, Math.min(people.length, spec.profile.itemCount + 1))).map((person, index) =>
            <HbarAppUiSpotlight key={person}><span className="hbar-app-ui-avatar">{person[0]}</span>
                <div><strong>{person}</strong><small>{index % 2 ? 'Engineering' : 'Product'} · cap
                    ${20 + index * 10}</small></div>
                <HbarAppUiProgress value={34 + index * 11}
                                   label={`${person} usage`}/><b>${(8.2 + index * 2.4).toFixed(2)}</b></HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function BudgetSettings({spec, onAction}: UsageProps) {
    const [cap, setCap] = useState(60)
    const [hardStop, setHardStop] = useState(true)
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-usage-variant-5"><HbarAppUiToolbar
        title="Budget settings" detail="Monthly cap and alert thresholds"/><HbarAppUiStatus
        value={cap > 80 ? 'Near cap' : 'Within budget'} tone={cap > 80 ? 'warning' : 'positive'}/>
        <div className="hbar-app-ui-budget-form"><label>Monthly cap <output>${cap}</output><input type="range" min="10"
                                                                                                  max="100" value={cap}
                                                                                                  onChange={(event) => setCap(Number(event.target.value))}/></label><label>Alert
            threshold <select defaultValue="80">
                <option value="60">60%</option>
                <option value="80">80%</option>
                <option value="95">95%</option>
            </select></label><label className="hbar-app-ui-toggle-row"><span>Hard stop at cap</span>
            <button type="button" role="switch" aria-checked={hardStop}
                    className={`hbar-app-ui-switch ${hardStop ? 'is-on' : ''}`}
                    onClick={() => setHardStop((value) => !value)}><i/></button>
        </label><HbarAppUiButton tone="accent" onClick={() => onAction?.({
            variantId: spec.id,
            actionId: 'save',
            value: `${cap}:${hardStop}`
        })}>Save budget</HbarAppUiButton></div>
    </ActionSurfaceFrame>
}

function OverageNotice({spec, onAction}: UsageProps) {
    const [plan, setPlan] = useState('Pro')
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-usage-variant-6"><HbarAppUiToolbar
        title="Usage overage" detail="Included versus billed"/><HbarAppUiStatus value="Review required" tone="warning"/>
        <div className="hbar-app-ui-overage-split"><HbarAppUiSpotlight><span>Included</span><strong>100k tokens</strong><small>Used
            100%</small><HbarAppUiProgress value={100} label="Included usage"
                                           tone="positive"/></HbarAppUiSpotlight><HbarAppUiSpotlight><span>Billed overage</span><strong>24k
            tokens</strong><small>$4.80 estimated</small><HbarAppUiProgress value={24} label="Billed overage"
                                                                            tone="warning"/></HbarAppUiSpotlight></div>
        <label className="hbar-app-ui-plan-picker">Upgrade plan<select value={plan} onChange={(event) => {
            setPlan(event.target.value);
            onAction?.({variantId: spec.id, actionId: 'picker', value: event.target.value})
        }}>
            <option>Pro</option>
            <option>Team</option>
            <option>Enterprise</option>
        </select></label><HbarAppUiButton tone="accent" onClick={() => onAction?.({
            variantId: spec.id,
            actionId: 'open',
            value: plan
        })}>Review {plan}</HbarAppUiButton></ActionSurfaceFrame>
}

function RequestLog({spec, onAction}: UsageProps) {
    const [open, setOpen] = useState<string | undefined>()
    const requests = ['req_91a2', 'req_91a3', 'req_91a4', 'req_91a5']
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-usage-variant-7"><HbarAppUiToolbar
        title="Request log" detail="Tokens · latency · cost"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'filter'})}>Filter log</HbarAppUiButton>
        <div
            className="hbar-app-ui-request-log">{requests.slice(0, Math.max(2, Math.min(requests.length, spec.profile.itemCount))).map((request, index) =>
            <div className={`hbar-app-ui-request-row ${open === request ? 'is-open' : ''}`} key={request}>
                <button type="button" onClick={() => setOpen(open === request ? undefined : request)}><HbarAppUiIcon icon={ChevronDown} tier="sm"
                    /><code>{request}</code><span>{420 + index * 88} tokens</span><span>{180 + index * 34}ms</span><b>${(0.03 + index * 0.01).toFixed(2)}</b>
                </button>
                {open === request &&
                    <pre>{`model=balanced\ninput=${240 + index * 20}\noutput=${180 + index * 12}`}</pre>}</div>)}</div>
    </ActionSurfaceFrame>
}

function CompactUsage({spec, onAction}: UsageProps) {
    const value = seededNumber(spec.profile.seed, 42, 44)
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-usage-variant-8"><HbarAppUiToolbar
        title="Plan usage" detail="Compact overview"/><HbarAppUiButton tone="accent" onClick={() => onAction?.({
        variantId: spec.id,
        actionId: 'open',
        value: 'upgrade'
    })}>Upgrade</HbarAppUiButton>
        <div className="hbar-app-ui-compact-usage">
            <div className="hbar-app-ui-sparkline">{Array.from({length: 18}, (_, index) => <i
                style={{height: `${16 + ((value + index * 9) % 34)}px`}} key={index}/>)}</div>
            <strong>{value}%</strong><small>of monthly allowance</small><HbarAppUiProgress value={value}
                                                                                           label="Plan usage"
                                                                                           tone={value > 75 ? 'warning' : 'accent'}/>
            <div className="hbar-app-ui-secondary-meters"><span>Requests <b>{2_418 + value}</b></span><span>Seats <b>8 / 12</b></span>
            </div>
        </div>
    </ActionSurfaceFrame>
}

export function AiUsage({spec, onAction}: UsageProps) {
    switch (spec.variant) {
        case 1:
            return <UsageOverview spec={spec} onAction={onAction}/>
        case 2:
            return <SpendByModel spec={spec} onAction={onAction}/>
        case 3:
            return <RateLimits spec={spec} onAction={onAction}/>
        case 4:
            return <PerSeatUsage spec={spec} onAction={onAction}/>
        case 5:
            return <BudgetSettings spec={spec} onAction={onAction}/>
        case 6:
            return <OverageNotice spec={spec} onAction={onAction}/>
        case 7:
            return <RequestLog spec={spec} onAction={onAction}/>
        case 8:
            return <CompactUsage spec={spec} onAction={onAction}/>
        default:
            return <UsageOverview spec={spec} onAction={onAction}/>
    }
}
