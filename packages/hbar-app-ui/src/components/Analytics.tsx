import {useState} from 'react'
import {ArrowDown, ArrowUp, Crosshair, Info, MousePointer2, SlidersHorizontal} from 'lucide-react'
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

type AnalyticsProps = HbarAppUiVariantProps
const values = (seed: number, count: number) => Array.from({length: count}, (_, index) => 18 + ((seed + index * 19) % 76))

function RangeSparklines({spec, onAction}: AnalyticsProps) {
    const [range, setRange] = useState('7d');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-analytics-variant-1"><HbarAppUiToolbar title="Metric strip"
                                                                                             detail="Hover to scrub sparklines"/><HbarAppUiTabs
        label="Range" value={range}
        options={[{id: '24h', label: '24h'}, {id: '7d', label: '7d'}, {id: '30d', label: '30d'}]} onChange={(value) => {
        setRange(value);
        onAction?.({variantId: spec.id, actionId: 'tabs', value})
    }}/><HbarAppUiMetricStrip metrics={['Throughput', 'Quality', 'Latency', 'Cost'].map((label, index) => ({
        label,
        value: index === 2 ? '1.8s' : `${24 + index * 18}`,
        detail: `${range} · +${index + 3}%`,
        tone: index === 2 ? 'warning' : 'positive'
    }))}/>
        <div className="hbar-app-ui-sparkline-grid">{values(spec.profile.seed, 4).map((value, index) => <div key={index}
                                                                                                             className="hbar-app-ui-sparkline">
            <span style={{height: `${value / 2}px`}}/><span style={{height: `${(value + 15) / 2}px`}}/><span
            style={{height: `${(value - 8) / 2}px`}}/></div>)}</div>
    </ActionSurfaceFrame>
}

function AreaChart({spec, onAction}: AnalyticsProps) {
    const [cursor, setCursor] = useState(48);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-analytics-variant-2"><HbarAppUiToolbar title="Area chart"
                                                                                             detail="Crosshair and keyboard cursor"/><HbarAppUiButton
        onClick={() => setCursor((value) => (value + 12) % 100)}><Crosshair size={13}/>Move cursor</HbarAppUiButton>
        <div className="hbar-app-ui-area-chart hbar-app-ui-crosshair-chart">
            <svg viewBox="0 0 360 120" role="img" aria-label="Area chart">
                <path d="M0 90 C40 30 60 80 100 58 S150 82 190 32 S250 70 290 42 S330 55 360 18 V120 H0Z"/>
                <path d="M0 90 C40 30 60 80 100 58 S150 82 190 32 S250 70 290 42 S330 55 360 18"/>
            </svg>
            <i style={{left: `${cursor}%`}}/><span className="hbar-app-ui-crosshair-tip">{cursor} · 128 runs</span>
        </div>
        <HbarAppUiMetricStrip metrics={[{label: 'Total', value: '2,418'}, {label: 'Average', value: '345 / day'}, {
            label: 'Delta',
            value: '+18%',
            tone: 'positive'
        }]}/></ActionSurfaceFrame>
}

function GroupedBars({spec, onAction}: AnalyticsProps) {
    const [series, setSeries] = useState(['Runs', 'Reviews']);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-analytics-variant-3"><HbarAppUiToolbar title="Grouped bars"
                                                                                             detail="Toggle series and follow values"/>
        <div className="hbar-app-ui-series-toggles">{['Runs', 'Reviews', 'Errors'].map((name) => <HbarAppUiButton
            key={name} className={series.includes(name) ? 'is-selected' : ''}
            onClick={() => setSeries((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name])}>{name}</HbarAppUiButton>)}</div>
        <div className="hbar-app-ui-grouped-bars">{values(spec.profile.seed, 8).map((value, index) => <div
            key={index}>{series.map((name, seriesIndex) => <span title={`${name} ${value + seriesIndex * 8}`}
                                                                 style={{height: `${value - seriesIndex * 8}%`}}
                                                                 key={name}/>)}</div>)}</div>
    </ActionSurfaceFrame>
}

function StackedArea({spec, onAction}: AnalyticsProps) {
    const [share, setShare] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-analytics-variant-4"><HbarAppUiToolbar title="Stacked area"
                                                                                             detail="Cumulative totals and share mode"/><HbarAppUiButton
        onClick={() => {
            setShare((value) => !value);
            onAction?.({variantId: spec.id, actionId: 'mode', value: share ? 'total' : 'share'})
        }}>{share ? 'Show totals' : 'Show share'}</HbarAppUiButton>
        <div className="hbar-app-ui-stacked-area"><span style={{height: share ? '58%' : '78%'}}/><span
            style={{height: share ? '38%' : '54%'}}/><span style={{height: share ? '22%' : '32%'}}/></div>
        <div className="hbar-app-ui-legend"><span><i className="is-blue"/>Runs</span><span><i className="is-purple"/>Reviews</span><span><i
            className="is-green"/>Errors</span></div>
    </ActionSurfaceFrame>
}

function DonutAnalytics({spec, onAction}: AnalyticsProps) {
    const [hover, setHover] = useState('Runs');
    const items: readonly [string, string][] = [['Runs', '58%'], ['Reviews', '28%'], ['Errors', '14%']];
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-analytics-variant-5"><HbarAppUiToolbar title="Donut breakdown"
                                                                                             detail="Legend follows the centre total"/>
        <div className="hbar-app-ui-donut-layout">
            <div className="hbar-app-ui-donut">
                <strong>{hover === 'Runs' ? '2,418' : hover === 'Reviews' ? '384' : '62'}</strong><small>{hover}</small>
            </div>
            <div className="hbar-app-ui-donut-legend">{items.map(([name, percent]) => <button type="button"
                                                                                              className={hover === name ? 'is-selected' : ''}
                                                                                              key={name}
                                                                                              onMouseEnter={() => setHover(name)}
                                                                                              onFocus={() => setHover(name)}
                                                                                              onClick={() => onAction?.({
                                                                                                  variantId: spec.id,
                                                                                                  actionId: 'select',
                                                                                                  value: name
                                                                                              })}>
                <i/>{name}<b>{percent}</b></button>)}</div>
        </div>
    </ActionSurfaceFrame>
}

function RankedSources({spec, onAction}: AnalyticsProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-analytics-variant-6"><HbarAppUiToolbar title="Ranked sources"
                                                                                             detail="Composition bars and row sparklines"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'tabs', value: 'source'})}>Source
        view</HbarAppUiButton>
        <div
            className="hbar-app-ui-ranked-sources">{['Workspace', 'Automation', 'External API', 'Manual'].map((source, index) =>
            <HbarAppUiSpotlight key={source}><span className="hbar-app-ui-rank-number">{index + 1}</span>
                <div><strong>{source}</strong><small>{68 - index * 11}% share</small></div>
                <HbarAppUiProgress value={68 - index * 11} label={`${source} share`}
                                   tone={index === 0 ? 'accent' : 'positive'}/>
                <div className="hbar-app-ui-mini-sparkline">{values(spec.profile.seed + index, 5).map((value, point) =>
                    <i style={{height: `${value / 3}px`}} key={point}/>)}</div>
            </HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function SparklineGrid({spec, onAction}: AnalyticsProps) {
    const [detail, setDetail] = useState('Throughput');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-analytics-variant-7"><HbarAppUiToolbar title="Sparkline cards"
                                                                                             detail="Direction-aware deltas"/><HbarAppUiButton
        onClick={() => setDetail(detail === 'Throughput' ? 'Quality' : 'Throughput')}>Promote {detail === 'Throughput' ? 'quality' : 'throughput'}</HbarAppUiButton>
        <div
            className="hbar-app-ui-sparkline-cards">{['Throughput', 'Quality', 'Latency', 'Cost'].map((metric, index) =>
            <button type="button" className={detail === metric ? 'is-selected' : ''} key={metric}
                    onClick={() => setDetail(metric)}>
                <small>{metric}</small><strong>{index === 2 ? '1.8s' : `${24 + index * 15}`}</strong><span
                className={index === 2 ? 'is-down' : 'is-up'}>{index === 2 ? <ArrowDown size={11}/> :
                <ArrowUp size={11}/>} {index + 4}%</span></button>)}</div>
        <HbarAppUiSpotlight><strong>{detail} detail</strong><p>Selected metric is promoted into the detail panel.</p>
        </HbarAppUiSpotlight></ActionSurfaceFrame>
}

function Funnel({spec, onAction}: AnalyticsProps) {
    const stages = [{name: 'Visited', value: 100}, {name: 'Started', value: 72}, {
        name: 'Completed',
        value: 48
    }, {name: 'Retained', value: 31}];
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-analytics-variant-8"><HbarAppUiToolbar title="Conversion funnel"
                                                                                             detail="Drop-off per stage"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'drag', value: 'highlight-worst'})}>Highlight worst
        step</HbarAppUiButton>
        <div className="hbar-app-ui-funnel">{stages.map((stage, index) => <div className={index === 3 ? 'is-worst' : ''}
                                                                               key={stage.name}>
            <span>{stage.name}</span><HbarAppUiProgress value={stage.value} label={`${stage.name} conversion`}
                                                        tone={index === 3 ? 'warning' : 'accent'}/><b>{stage.value}%</b><small>{index ? `−${stages[index - 1]!.value - stage.value}%` : 'entry'}</small>
        </div>)}</div>
    </ActionSurfaceFrame>
}

function Heatmap({spec, onAction}: AnalyticsProps) {
    const [cursor, setCursor] = useState('Wed 18');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-analytics-variant-9"><HbarAppUiToolbar title="Activity heatmap"
                                                                                             detail="Keyboard cursor and day tooltips"/><HbarAppUiButton
        onClick={() => setCursor(cursor === 'Wed 18' ? 'Fri 20' : 'Wed 18')}><MousePointer2 size={13}/>Cursor: {cursor}
    </HbarAppUiButton>
        <div className="hbar-app-ui-heatmap">{Array.from({length: 35}, (_, index) => <button type="button"
                                                                                             className={`heat-${(spec.profile.seed + index) % 5}`}
                                                                                             aria-label={`Day ${index + 1}`}
                                                                                             key={index}
                                                                                             onClick={() => setCursor(`Day ${index + 1}`)}/>)}</div>
        <div className="hbar-app-ui-heatmap-legend"><span>Less</span>{[0, 1, 2, 3, 4].map((level) => <i
            className={`heat-${level}`} key={level}/>)}<span>More</span></div>
        <p className="hbar-app-ui-note">Selected: {cursor}</p></ActionSurfaceFrame>
}

function RadialGoals({spec, onAction}: AnalyticsProps) {
    const goals = ['Activation', 'Retention', 'Quality'];
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-analytics-variant-10"><HbarAppUiToolbar title="Goal gauges"
                                                                                              detail="Target ticks and attainment sweeps"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'animate'})}>Replay sweep</HbarAppUiButton>
        <div className="hbar-app-ui-radial-goals">{goals.map((goal, index) => <div className="hbar-app-ui-radial-gauge"
                                                                                   key={goal}
                                                                                   style={{'--hbar-app-ui-gauge': `${52 + index * 14}%`} as React.CSSProperties}>
            <strong>{52 + index * 14}%</strong><small>{goal}</small><i/></div>)}</div>
    </ActionSurfaceFrame>
}

function CohortMatrix({spec, onAction}: AnalyticsProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-analytics-variant-11"><HbarAppUiToolbar title="Cohort retention"
                                                                                              detail="Pinned labels · value shading"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'tabs', value: 'cohort'})}>Change
        cohort</HbarAppUiButton>
        <div className="hbar-app-ui-cohort-matrix">
            <header><span>Cohort</span>{['W0', 'W1', 'W2', 'W3', 'W4'].map((week) => <span key={week}>{week}</span>)}
            </header>
            {['Sep 01', 'Sep 08', 'Sep 15', 'Sep 22'].map((cohort, row) => <div key={cohort}>
                <strong>{cohort}</strong>{[0, 1, 2, 3, 4].map((column) => <span
                className={`heat-${(row + column + 1) % 5}`}
                key={column}>{Math.max(18, 94 - row * 11 - column * 9)}%</span>)}</div>)}</div>
    </ActionSurfaceFrame>
}

function HorizontalRanking({spec, onAction}: AnalyticsProps) {
    const [sort, setSort] = useState('Value');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-analytics-variant-12"><HbarAppUiToolbar title="Horizontal ranking"
                                                                                              detail="Sortable measures"/><HbarAppUiButton
        onClick={() => {
            setSort(sort === 'Value' ? 'Delta' : 'Value');
            onAction?.({variantId: spec.id, actionId: 'sort', value: sort})
        }}><SlidersHorizontal size={13}/>Sort: {sort}</HbarAppUiButton>
        <div
            className="hbar-app-ui-horizontal-ranking">{['Workspace', 'Automation', 'Review', 'Archive'].map((name, index) =>
            <div key={name}><strong>{name}</strong><span><i
                style={{width: `${82 - index * 14}%`}}/></span><b>{82 - index * 14}</b></div>)}</div>
    </ActionSurfaceFrame>
}

function Candles({spec, onAction}: AnalyticsProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-analytics-variant-13"><HbarAppUiToolbar title="Candlestick chart"
                                                                                              detail="Volume histogram · OHLC tooltip"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'tooltip', value: 'OHLC'})}><Info size={13}/>Show OHLC</HbarAppUiButton>
        <div className="hbar-app-ui-candles">{values(spec.profile.seed, 10).map((value, index) => <div key={index}><i
            style={{height: `${value}px`}}/><b style={{height: `${18 + (value % 30)}px`}}/></div>)}</div>
        <div className="hbar-app-ui-volume-bars">{values(spec.profile.seed + 2, 10).map((value, index) => <i
            style={{height: `${value / 2}px`}} key={index}/>)}</div>
    </ActionSurfaceFrame>
}

function Scatter({spec, onAction}: AnalyticsProps) {
    const [point, setPoint] = useState<number | undefined>();
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-analytics-variant-14"><HbarAppUiToolbar title="Scatter plot"
                                                                                              detail="Quadrants · bubble sizing · hit testing"/><HbarAppUiButton
        onClick={() => {
            setPoint((value) => value === undefined ? 3 : undefined);
            onAction?.({variantId: spec.id, actionId: 'select', value: 'nearest-point'})
        }}><MousePointer2 size={13}/>Nearest point</HbarAppUiButton>
        <div className="hbar-app-ui-scatter-plot"><span className="hbar-app-ui-quadrant-v"/><span
            className="hbar-app-ui-quadrant-h"/>{values(spec.profile.seed, 12).map((value, index) => <button
            type="button" className={point === index ? 'is-selected' : ''} style={{
            left: `${10 + (value + index * 7) % 80}%`,
            top: `${12 + (value * 2 + index * 11) % 72}%`,
            width: `${8 + index % 5}px`,
            height: `${8 + index % 5}px`
        }} aria-label={`Point ${index + 1}`} key={index} onClick={() => setPoint(index)}/>)}</div>
        {point !== undefined && <HbarAppUiStatus value={`Point ${point + 1} selected`} tone="positive"/>}
    </ActionSurfaceFrame>
}

function BulletList({spec, onAction}: AnalyticsProps) {
    const [sort, setSort] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-analytics-variant-15"><HbarAppUiToolbar title="Bullet charts"
                                                                                              detail="Targets, deltas and sortable rows"/><HbarAppUiButton
        onClick={() => {
            setSort((value) => !value);
            onAction?.({variantId: spec.id, actionId: 'sort', value: String(!sort)})
        }}>Sort {sort ? 'target' : 'delta'}</HbarAppUiButton>
        <div className="hbar-app-ui-bullet-list">{['Throughput', 'Quality', 'Coverage', 'Recovery'].map((name, index) =>
            <div key={name}><strong>{name}</strong><span className="hbar-app-ui-bullet-track"><i
                style={{width: `${48 + index * 12}%`}}/><b
                style={{left: `${62 + index * 6}%`}}/></span><small>{48 + index * 12}% /
                target {62 + index * 6}%</small></div>)}</div>
    </ActionSurfaceFrame>
}

function ComboChart({spec, onAction}: AnalyticsProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-analytics-variant-16"><HbarAppUiToolbar title="Bars + trend line"
                                                                                              detail="Dual-axis combo chart"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: 'axis'})}>Inspect axes</HbarAppUiButton>
        <div className="hbar-app-ui-combo-chart">
            <div className="hbar-app-ui-combo-bars">{values(spec.profile.seed, 8).map((value, index) => <i
                style={{height: `${value}%`}} key={index}/>)}</div>
            <svg viewBox="0 0 320 120" role="img" aria-label="Trend line">
                <path d="M0 95 C45 68 74 88 110 58 S172 72 210 38 S270 52 320 20"/>
            </svg>
        </div>
        <div className="hbar-app-ui-axis-labels"><span>Runs</span><span>Conversion %</span></div>
    </ActionSurfaceFrame>
}

export function Analytics({spec, onAction}: AnalyticsProps) {
    switch (spec.variant) {
        case 1:
            return <RangeSparklines spec={spec} onAction={onAction}/>;
        case 2:
            return <AreaChart spec={spec} onAction={onAction}/>;
        case 3:
            return <GroupedBars spec={spec} onAction={onAction}/>;
        case 4:
            return <StackedArea spec={spec} onAction={onAction}/>;
        case 5:
            return <DonutAnalytics spec={spec} onAction={onAction}/>;
        case 6:
            return <RankedSources spec={spec} onAction={onAction}/>;
        case 7:
            return <SparklineGrid spec={spec} onAction={onAction}/>;
        case 8:
            return <Funnel spec={spec} onAction={onAction}/>;
        case 9:
            return <Heatmap spec={spec} onAction={onAction}/>;
        case 10:
            return <RadialGoals spec={spec} onAction={onAction}/>;
        case 11:
            return <CohortMatrix spec={spec} onAction={onAction}/>;
        case 12:
            return <HorizontalRanking spec={spec} onAction={onAction}/>;
        case 13:
            return <Candles spec={spec} onAction={onAction}/>;
        case 14:
            return <Scatter spec={spec} onAction={onAction}/>;
        case 15:
            return <BulletList spec={spec} onAction={onAction}/>;
        case 16:
            return <ComboChart spec={spec} onAction={onAction}/>;
        default:
            return <RangeSparklines spec={spec} onAction={onAction}/>
    }
}
