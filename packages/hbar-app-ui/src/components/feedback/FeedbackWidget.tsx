import {Bug, Check, Heart, ImagePlus, Lightbulb, X} from 'lucide-react'
import {useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiFeedbackType, HbarAppUiFeedbackWidgetContent} from './FeedbackContent'
import {FeedbackButton, FeedbackFrame, FeedbackIcon} from './FeedbackPrimitives'

function TypeIcon({kind}: {readonly kind: HbarAppUiFeedbackType}) {
    switch (kind) {
        case 'idea':
            return <FeedbackIcon icon={Lightbulb} tier="sm" />
        case 'issue':
            return <FeedbackIcon icon={Bug} tier="sm" />
        case 'praise':
            return <FeedbackIcon icon={Heart} tier="sm" />
    }
}

export function FeedbackWidget({spec, onAction, content}: HbarAppUiVariantProps & {readonly content: HbarAppUiFeedbackWidgetContent}) {
    const [typeId, setTypeId] = useState<HbarAppUiFeedbackType>(content.initialTypeId)
    const [draft, setDraft] = useState('')
    const [sent, setSent] = useState(false)
    const selectedType = content.types.find((type) => type.id === typeId) ?? content.types[0]

    const send = () => {
        setSent(true)
        onAction?.({variantId: spec.id, actionId: 'send', value: typeId})
    }

    return <FeedbackFrame spec={spec} onAction={onAction} className="hbar-app-ui-feedback-widget-surface">
        <section className="hbar-app-ui-feedback-modal" role="dialog" aria-labelledby={`${spec.id}-title`}>
            <header className="hbar-app-ui-feedback-modal-header">
                <div><h2 id={`${spec.id}-title`}>{content.labels.title}</h2><p>{content.labels.description}</p></div>
                <FeedbackButton className="hbar-app-ui-feedback-icon-button" type="button" aria-label={content.labels.close} onClick={() => onAction?.({variantId: spec.id, actionId: 'close'})}><X className="hbar-app-ui-feedback-icon hbar-app-ui-icon-sm" aria-hidden="true" /></FeedbackButton>
            </header>
            {sent ? <section className="hbar-app-ui-feedback-sent" aria-live="polite"><Check className="hbar-app-ui-feedback-icon hbar-app-ui-icon-lg" aria-hidden="true" /><h3>{content.labels.sentTitle}</h3><p>{content.labels.sentDescription(selectedType?.label ?? '')}</p><FeedbackButton tone="accent" type="button" onClick={() => {setSent(false); setDraft('')}}>{content.labels.sendAnother}</FeedbackButton></section> : <>
                <div className="hbar-app-ui-feedback-type-tabs" role="radiogroup" aria-label={content.labels.typeGroup}>
                    {content.types.map((type) => <button type="button" role="radio" aria-checked={type.id === typeId} className={type.id === typeId ? 'is-selected' : ''} key={type.id} onClick={() => {setTypeId(type.id); onAction?.({variantId: spec.id, actionId: 'change-type', value: type.id})}}><TypeIcon kind={type.id} /><span>{type.label}</span></button>)}
                </div>
                <label className="hbar-app-ui-feedback-textarea-wrap"><span>{content.labels.prompt}</span><textarea value={draft} maxLength={content.maximumCharacters} onChange={(event) => setDraft(event.target.value)} placeholder={content.labels.promptPlaceholder} /><div className="hbar-app-ui-feedback-textarea-footer"><FeedbackButton type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'attach', value: content.attachment.name})}><ImagePlus className="hbar-app-ui-feedback-icon hbar-app-ui-icon-sm" aria-hidden="true" />{content.labels.attachment}</FeedbackButton><small>{content.labels.characterCount(draft.length, content.maximumCharacters)}</small></div></label>
                <p className="hbar-app-ui-feedback-privacy">{content.labels.privacyNotice}</p>
                <footer className="hbar-app-ui-feedback-modal-footer"><FeedbackButton type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'cancel'})}>{content.labels.cancel}</FeedbackButton><FeedbackButton tone="accent" type="button" disabled={!draft.trim()} onClick={send}>{content.labels.send}</FeedbackButton></footer>
            </>}
        </section>
    </FeedbackFrame>
}
