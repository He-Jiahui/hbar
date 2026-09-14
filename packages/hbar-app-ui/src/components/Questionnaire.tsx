import {Check, LoaderCircle} from 'lucide-react'
import {useState} from 'react'
import {HbarAppUiButton, HbarAppUiSpotlight, HbarAppUiStatus} from '../primitives'
import type {
    HbarAppUiQuestionnaireProps,
    HbarAppUiQuestionnaireQuestion
} from '../types'

const customValue = '__hbar_app_ui_custom__'

function failureMessage(cause: unknown): string {
    return cause instanceof Error && cause.message ? cause.message : 'Unable to submit your answers.'
}

function answerFor(question: HbarAppUiQuestionnaireQuestion, selected: Readonly<Record<string, string>>, custom: Readonly<Record<string, string>>): string {
    if (!question.options?.length) return custom[question.id] ?? ''
    return selected[question.id] === customValue ? custom[question.id] ?? '' : selected[question.id] ?? ''
}

/**
 * A data-driven answer form for a host-owned request. The host owns request
 * identity and transport while this component owns local validation feedback.
 */
export function HbarAppUiQuestionnaire({
    requestId,
    questions,
    onSubmit,
    title = 'Your input is needed',
    countLabel = (count) => `${count} ${count === 1 ? 'question' : 'questions'}`,
    customAnswerLabel = 'Other',
    customAnswerPlaceholder = 'Enter another answer',
    freeformLabel = 'Your answer',
    submitLabel = 'Submit answers',
    submittingLabel = 'Submitting answers',
    submittedLabel = 'Answers submitted',
    incompleteMessage = 'Answer every question before submitting.',
    rejectedMessage = 'This request is no longer available.'
}: HbarAppUiQuestionnaireProps) {
    const [selected, setSelected] = useState<Record<string, string>>({})
    const [custom, setCustom] = useState<Record<string, string>>({})
    const [saving, setSaving] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [error, setError] = useState<string | undefined>()

    async function submit() {
        if (saving || submitted) return
        const answers = Object.fromEntries(questions.map((question) => [question.id, answerFor(question, selected, custom).trim()]))
        if (questions.some((question) => !answers[question.id])) {
            setError(incompleteMessage)
            return
        }
        setError(undefined)
        setSaving(true)
        try {
            const result = await onSubmit(answers)
            if (result && !result.accepted) {
                setError(result.error ?? rejectedMessage)
                return
            }
            setSubmitted(true)
        } catch (cause) {
            setError(failureMessage(cause))
        } finally {
            setSaving(false)
        }
    }

    return <HbarAppUiSpotlight as="section" className="hbar-app-ui-questionnaire" aria-label={title}
                               aria-busy={saving}>
        <header className="hbar-app-ui-questionnaire-heading">
            <strong>{title}</strong>
            <HbarAppUiStatus value={submitted ? submittedLabel : countLabel(questions.length)}
                             tone={submitted ? 'positive' : 'neutral'}/>
        </header>
        <div className="hbar-app-ui-questionnaire-questions">
            {questions.map((question) => {
                const hasOptions = Boolean(question.options?.length)
                const choice = selected[question.id]
                return <fieldset key={question.id} disabled={saving || submitted}>
                    <legend><span>{question.header}</span>{question.prompt}</legend>
                    <div className="hbar-app-ui-questionnaire-options">
                        {question.options?.map((option) => <label className="hbar-app-ui-questionnaire-option"
                                                                   key={option.value}>
                            <input type="radio" name={`${requestId}:${question.id}`} value={option.value}
                                   checked={choice === option.value}
                                   onChange={() => setSelected((current) => ({...current, [question.id]: option.value}))}/>
                            <span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
                        </label>)}
                        {hasOptions && question.acceptsCustomAnswer && <label className="hbar-app-ui-questionnaire-option">
                            <input type="radio" name={`${requestId}:${question.id}`} value={customValue}
                                   checked={choice === customValue}
                                   onChange={() => setSelected((current) => ({...current, [question.id]: customValue}))}/>
                            <span><strong>{customAnswerLabel}</strong>{choice === customValue && <input autoFocus
                                                                                                          aria-label={`${question.header} ${customAnswerLabel}`}
                                                                                                          type={question.secret ? 'password' : 'text'}
                                                                                                          value={custom[question.id] ?? ''}
                                                                                                          placeholder={customAnswerPlaceholder}
                                                                                                          onChange={(event) => setCustom((current) => ({...current, [question.id]: event.target.value}))}/>}</span>
                        </label>}
                        {!hasOptions && <label className="hbar-app-ui-questionnaire-option hbar-app-ui-questionnaire-freeform">
                            <span><strong>{freeformLabel}</strong><input aria-label={`${question.header} ${freeformLabel}`}
                                                                         type={question.secret ? 'password' : 'text'}
                                                                         value={custom[question.id] ?? ''}
                                                                         onChange={(event) => setCustom((current) => ({...current, [question.id]: event.target.value}))}/></span>
                        </label>}
                    </div>
                </fieldset>
            })}
        </div>
        {error && <p className="hbar-app-ui-questionnaire-feedback" role="alert">{error}</p>}
        <footer className="hbar-app-ui-questionnaire-actions">
            <HbarAppUiButton type="button" tone="accent" disabled={saving || submitted} onClick={() => void submit()}>
                {saving ? <LoaderCircle size={14} className="hbar-app-ui-spin"/> : <Check size={14}/>}
                {submitted ? submittedLabel : saving ? submittingLabel : submitLabel}
            </HbarAppUiButton>
        </footer>
    </HbarAppUiSpotlight>
}
