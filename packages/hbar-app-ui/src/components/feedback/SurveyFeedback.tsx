import {X} from 'lucide-react'
import {useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiFeedbackSurveyContent} from './FeedbackContent'
import {FeedbackButton, FeedbackFrame} from './FeedbackPrimitives'

export function SurveyFeedback({spec, onAction, content}: HbarAppUiVariantProps & {readonly content: HbarAppUiFeedbackSurveyContent}) {
    const [score, setScore] = useState<number | undefined>(content.initialScore)
    const [reasons, setReasons] = useState<ReadonlySet<string>>(() => new Set())
    const [comment, setComment] = useState('')
    const [submitted, setSubmitted] = useState(false)

    const toggleReason = (id: string) => {
        setReasons((current) => new Set(current.has(id) ? [...current].filter((value) => value !== id) : [...current, id]))
        onAction?.({variantId: spec.id, actionId: 'toggle-reason', value: id})
    }

    return <FeedbackFrame spec={spec} onAction={onAction} className="hbar-app-ui-feedback-survey-surface">
        <section className="hbar-app-ui-feedback-survey" aria-labelledby={`${spec.id}-title`}>
            <header className="hbar-app-ui-feedback-survey-header"><div><p className="hbar-app-ui-feedback-eyebrow">{content.labels.eyebrow}</p><h2 id={`${spec.id}-title`}>{content.labels.question}</h2></div><FeedbackButton className="hbar-app-ui-feedback-icon-button" type="button" aria-label={content.labels.close} onClick={() => onAction?.({variantId: spec.id, actionId: 'close'})}><X className="hbar-app-ui-feedback-icon hbar-app-ui-icon-sm" aria-hidden="true" /></FeedbackButton></header>
            {submitted ? <section className="hbar-app-ui-feedback-submitted" aria-live="polite"><p>{content.labels.submitted}</p></section> : <>
                <fieldset className="hbar-app-ui-feedback-score-fieldset"><legend>{content.labels.scoreGroup}</legend><div className="hbar-app-ui-feedback-score-scale">{content.scores.map((value) => <button type="button" className={score === value ? 'is-selected' : ''} aria-label={content.labels.scoreAccessible(value)} aria-pressed={score === value} key={value} onClick={() => {setScore(value); onAction?.({variantId: spec.id, actionId: 'select-score', value: String(value)})}}>{value}</button>)}</div><div className="hbar-app-ui-feedback-score-range"><span>{content.labels.scoreLow}</span><span>{content.labels.scoreHigh}</span></div></fieldset>
                <section className="hbar-app-ui-feedback-reasons" aria-label={content.labels.reasonGroup}><h3>{content.labels.scorePrompt}</h3><div>{content.reasons.map((reason) => <button type="button" disabled={score === undefined} className={reasons.has(reason.id) ? 'is-selected' : ''} aria-pressed={reasons.has(reason.id)} key={reason.id} onClick={() => toggleReason(reason.id)}>{reason.label}</button>)}</div></section>
                <textarea className="hbar-app-ui-feedback-comment" value={comment} onChange={(event) => setComment(event.target.value)} placeholder={content.labels.commentPlaceholder} aria-label={content.labels.commentPlaceholder} />
                <footer className="hbar-app-ui-feedback-survey-footer"><p>{content.labels.note}</p><div><FeedbackButton type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'later'})}>{content.labels.later}</FeedbackButton><FeedbackButton tone="accent" type="button" disabled={score === undefined} onClick={() => {setSubmitted(true); onAction?.({variantId: spec.id, actionId: 'submit', value: String(score)})}}>{content.labels.submit}</FeedbackButton></div></footer>
            </>}
        </section>
    </FeedbackFrame>
}
