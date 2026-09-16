import {Star} from 'lucide-react'
import {useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiFeedbackPostResolutionContent} from './FeedbackContent'
import {FeedbackAvatar, FeedbackButton, FeedbackFrame} from './FeedbackPrimitives'

export function PostResolutionFeedback({spec, onAction, content}: HbarAppUiVariantProps & {readonly content: HbarAppUiFeedbackPostResolutionContent}) {
    const [rating, setRating] = useState(0)
    const [reason, setReason] = useState<string | undefined>()
    const [comment, setComment] = useState('')
    const [submitted, setSubmitted] = useState(false)
    const selectedRating = content.ratings.find((option) => option.value === rating)

    return <FeedbackFrame spec={spec} onAction={onAction} className="hbar-app-ui-feedback-post-resolution-surface">
        <section className="hbar-app-ui-feedback-post-resolution" aria-labelledby={`${spec.id}-title`}>
            <article className="hbar-app-ui-feedback-ticket"><FeedbackAvatar initials={content.ticket.initials} /><div><strong>{content.ticket.header}</strong><p>{content.ticket.summary}</p></div></article>
            {submitted ? <p className="hbar-app-ui-feedback-submitted">{content.labels.submitted}</p> : <>
                <h2 id={`${spec.id}-title`}>{content.labels.question}</h2>
                <fieldset className="hbar-app-ui-feedback-rating-fieldset"><legend>{content.labels.ratingGroup}</legend><div>{content.ratings.map((option) => <button type="button" className={rating >= option.value ? 'is-selected' : ''} aria-label={option.label} aria-pressed={rating === option.value} key={option.value} onClick={() => {setRating(option.value); onAction?.({variantId: spec.id, actionId: 'select-rating', value: String(option.value)})}}><Star className="hbar-app-ui-feedback-icon hbar-app-ui-icon-lg" fill={rating >= option.value ? 'currentColor' : 'none'} aria-hidden="true" /></button>)}</div></fieldset>
                <section className="hbar-app-ui-feedback-reasons" aria-label={content.labels.reasonGroup}><h3>{selectedRating?.label ?? content.labels.reasonGroup}</h3><div>{content.reasons.map((item) => <button type="button" disabled={!rating} className={reason === item.id ? 'is-selected' : ''} aria-pressed={reason === item.id} key={item.id} onClick={() => {setReason(item.id); onAction?.({variantId: spec.id, actionId: 'select-reason', value: item.id})}}>{item.label}</button>)}</div></section>
                <textarea className="hbar-app-ui-feedback-comment" value={comment} onChange={(event) => setComment(event.target.value)} placeholder={content.labels.commentPlaceholder} aria-label={content.labels.commentPlaceholder} />
                <footer className="hbar-app-ui-feedback-actions"><FeedbackButton type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'no-thanks'})}>{content.labels.noThanks}</FeedbackButton><FeedbackButton tone="accent" type="button" disabled={!rating} onClick={() => {setSubmitted(true); onAction?.({variantId: spec.id, actionId: 'submit', value: `${rating}:${reason ?? ''}`})}}>{content.labels.submit}</FeedbackButton></footer>
            </>}
        </section>
    </FeedbackFrame>
}
