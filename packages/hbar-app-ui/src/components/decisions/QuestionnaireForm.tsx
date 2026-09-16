import { Check, LoaderCircle } from 'lucide-react'
import { HbarAppUiIcon } from '../../icon'
import { HbarAppUiButton, HbarAppUiSpotlight, HbarAppUiStatus } from '../../primitives'
import { uniqueItems } from '../../collection'
import type { HbarAppUiQuestionnaireProps } from '../../decision-types'

export function HbarAppUiQuestionnaire({
  requestId,
  questions,
  answers,
  labels,
  state,
  onAnswer,
  onSubmit,
}: HbarAppUiQuestionnaireProps) {
  const disabled = state.status !== 'idle'
  const records = uniqueItems(questions)
  return (
    <HbarAppUiSpotlight
      as="section"
      className="hbar-app-ui-questionnaire"
      aria-label={labels.title}
      aria-busy={state.status === 'pending'}
    >
      <header className="hbar-app-ui-questionnaire-heading">
        <strong>{labels.title}</strong>
        <HbarAppUiStatus
          value={state.status === 'complete' ? labels.submittedLabel : labels.countLabel(records.length)}
          tone={state.status === 'complete' ? 'positive' : 'neutral'}
        />
      </header>
      <div className="hbar-app-ui-questionnaire-questions">
        {records.map((question) => {
          const answer = answers[question.id]
          const hasOptions = Boolean(question.options?.length)
          const options = [...new Map((question.options ?? []).map((option) => [option.value, option])).values()]
          return (
            <fieldset key={question.id} disabled={disabled}>
              <legend>
                <span>{question.header}</span>
                {question.prompt}
              </legend>
              <div className="hbar-app-ui-questionnaire-options">
                {options.map((option) => (
                  <label className="hbar-app-ui-questionnaire-option" key={option.value}>
                    <input
                      type="radio"
                      name={`${requestId}:${question.id}`}
                      value={option.value}
                      checked={answer?.kind === 'option' && answer.value === option.value}
                      onChange={() => onAnswer(requestId, question.id, { kind: 'option', value: option.value })}
                    />
                    <span>
                      <strong>{option.label}</strong>
                      {option.description && <small>{option.description}</small>}
                    </span>
                  </label>
                ))}
                {hasOptions && question.acceptsCustomAnswer && (
                  <label className="hbar-app-ui-questionnaire-option">
                    <input
                      type="radio"
                      name={`${requestId}:${question.id}`}
                      checked={answer?.kind === 'custom'}
                      onChange={() => onAnswer(requestId, question.id, { kind: 'custom', value: '' })}
                    />
                    <span>
                      <strong>{labels.customAnswerLabel}</strong>
                      {answer?.kind === 'custom' && (
                        <input
                          aria-label={`${question.header} ${labels.customAnswerLabel}`}
                          type={question.secret ? 'password' : 'text'}
                          value={answer.value}
                          placeholder={labels.customAnswerPlaceholder}
                          onChange={(event) =>
                            onAnswer(requestId, question.id, { kind: 'custom', value: event.target.value })
                          }
                        />
                      )}
                    </span>
                  </label>
                )}
                {!hasOptions && (
                  <label className="hbar-app-ui-questionnaire-option hbar-app-ui-questionnaire-freeform">
                    <span>
                      <strong>{labels.freeformLabel}</strong>
                      <input
                        aria-label={`${question.header} ${labels.freeformLabel}`}
                        type={question.secret ? 'password' : 'text'}
                        value={answer?.value ?? ''}
                        onChange={(event) =>
                          onAnswer(requestId, question.id, { kind: 'custom', value: event.target.value })
                        }
                      />
                    </span>
                  </label>
                )}
              </div>
            </fieldset>
          )
        })}
      </div>
      {state.error && (
        <p className="hbar-app-ui-questionnaire-feedback" role="alert">
          {state.error}
        </p>
      )}
      <footer className="hbar-app-ui-questionnaire-actions">
        <HbarAppUiButton
          type="button"
          tone="accent"
          disabled={disabled || !records.length}
          onClick={() => onSubmit(requestId)}
        >
          <HbarAppUiIcon icon={state.status === 'pending' ? LoaderCircle : Check} tier="sm" />
          {state.status === 'complete'
            ? labels.submittedLabel
            : state.status === 'pending'
              ? labels.submittingLabel
              : labels.submitLabel}
        </HbarAppUiButton>
      </footer>
    </HbarAppUiSpotlight>
  )
}
