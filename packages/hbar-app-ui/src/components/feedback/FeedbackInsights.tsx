import {useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiFeedbackInsightsContent} from './FeedbackContent'
import {FeedbackFrame} from './FeedbackPrimitives'

export function FeedbackInsights({spec, onAction, content}: HbarAppUiVariantProps & {readonly content: HbarAppUiFeedbackInsightsContent}) {
    const [periodId, setPeriodId] = useState(content.initialPeriodId)
    const boundedSentiment = content.sentiment.map((item) => ({...item, percent: Math.max(0, Math.min(100, item.percent))}))
    const maxThemeProgress = Math.max(1, ...content.themes.map((theme) => theme.progress))
    const maxVolume = Math.max(1, ...content.volume.map((point) => point.value))

    return <FeedbackFrame spec={spec} onAction={onAction} className="hbar-app-ui-feedback-insights-surface">
        <section className="hbar-app-ui-feedback-insights" aria-labelledby={`${spec.id}-title`}>
            <header className="hbar-app-ui-feedback-insights-header"><div><h2 id={`${spec.id}-title`}>{content.labels.title}</h2><p>{content.labels.description}</p></div><div className="hbar-app-ui-feedback-period-tabs" role="radiogroup" aria-label={content.labels.periodGroup}>{content.periods.map((period) => <button type="button" role="radio" aria-checked={period.id === periodId} className={period.id === periodId ? 'is-selected' : ''} key={period.id} onClick={() => {setPeriodId(period.id); onAction?.({variantId: spec.id, actionId: 'change-period', value: period.id})}}>{period.label}</button>)}</div></header>
            <section className="hbar-app-ui-feedback-metric-strip">{content.metrics.map((metric) => <article key={metric.id}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></article>)}<article className="hbar-app-ui-feedback-sentiment-card"><span>{content.labels.sentiment}</span><div className="hbar-app-ui-feedback-sentiment-bar">{boundedSentiment.map((item) => <span key={item.id} style={{inlineSize: `${item.percent}%`}} />)}</div><div className="hbar-app-ui-feedback-sentiment-legend">{boundedSentiment.map((item) => <span key={item.id}><i aria-hidden="true" />{item.label} <strong>{item.value}</strong></span>)}</div></article></section>
            <div className="hbar-app-ui-feedback-insights-body"><section className="hbar-app-ui-feedback-themes" aria-label={content.labels.topThemes}><header><h3>{content.labels.topThemes}</h3><span>{content.labels.mentionsPeriod}</span></header>{content.themes.map((theme) => <div className="hbar-app-ui-feedback-theme" key={theme.id}><div><span>{theme.label}</span><strong>{theme.mentions}</strong><small>{theme.changeLabel}</small></div><progress max={maxThemeProgress} value={Math.max(0, Math.min(maxThemeProgress, theme.progress))} /></div>)}</section><section className="hbar-app-ui-feedback-volume" aria-label={content.labels.weeklyVolume}><h3>{content.labels.weeklyVolume}</h3><p>{content.labels.responsesPerDay}</p><div className="hbar-app-ui-feedback-volume-chart">{content.volume.map((point) => <span key={point.id} style={{blockSize: `${Math.max(0, Math.min(100, point.value / maxVolume * 100))}%`}} title={point.label} />)}</div><footer><span>{content.labels.periodStart}</span><strong>{content.labels.periodEnd}</strong></footer></section></div>
        </section>
    </FeedbackFrame>
}
