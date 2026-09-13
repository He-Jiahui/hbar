import { useState } from 'react'
import { Check, LoaderCircle } from 'lucide-react'
import type { UserInputRequest } from '@hbar/contracts'
import GlassSurface from '../GlassSurface'
import GlareButton from '../GlareButton'
import { referenceAttributes } from '../production'

export interface UserInputSurfaceLabels {
  readonly userInputRequired: string
  readonly questionsCount: string
  readonly recommended: string
  readonly other: string
  readonly otherAnswer: string
  readonly fillOtherAnswer: string
  readonly fillAnswer: string
  readonly answer: string
  readonly submitAnswers: string
  readonly answerAllQuestions: string
  readonly inputHandled: string
}

export interface UserInputSurfaceProps {
  readonly request: UserInputRequest
  readonly labels: UserInputSurfaceLabels
  resolve(answers: Record<string, { answers: string[] }>): void | Promise<{ accepted: boolean }>
}

/**
 * ReactBits agent-approval/user-input surface. Local selection state follows
 * the reference's structured question cards; the adapter supplies the live
 * `user_input.resolve` transport.
 *
 * Reference: https://pro.reactbits.dev/docs/app-ui/agent-approval
 */
export default function UserInputSurface({ request, labels, resolve }: UserInputSurfaceProps) {
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [other, setOther] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    const answers = Object.fromEntries(
      request.questions.map((question) => {
        const value = question.options?.length
          ? selected[question.id] === '__other__'
            ? other[question.id]
            : selected[question.id]
          : other[question.id]
        return [question.id, { answers: value?.trim() ? [value.trim()] : [] }]
      }),
    )
    if (request.questions.some((question) => !answers[question.id]?.answers.length)) {
      setError(labels.answerAllQuestions)
      return
    }
    setError('')
    setSaving(true)
    try {
      const result = await resolve(answers)
      if (result && !result.accepted) setError(labels.inputHandled)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/agent-approval', 'approval')}
      className="user-input-prompt rb-decision-surface rb-user-input-surface"
      aria-label={labels.userInputRequired}
      aria-busy={saving}
      data-request-id={request.requestId}
    >
      <GlassSurface className="decision-glass" width="100%" height="100%" aria-hidden="true" />
      <div className="user-input-heading">
        <strong>{labels.userInputRequired}</strong>
        <span>{request.questions.length} {labels.questionsCount}</span>
      </div>
      <div className="user-input-questions">
        {request.questions.map((question) => (
          <fieldset key={question.id}>
            <legend>
              <span>{question.header}</span>
              {question.question}
            </legend>
            <div className="user-input-options">
              {question.options?.map((option) => (
                <label key={option.label} className="user-input-option">
                  <input
                    type="radio"
                    name={`${request.requestId}:${question.id}`}
                    value={option.label}
                    checked={selected[question.id] === option.label}
                    disabled={saving}
                    onChange={() => setSelected((current) => ({ ...current, [question.id]: option.label }))}
                  />
                  <span>
                    <strong>{option.label}{option.recommended ? `（${labels.recommended}）` : ''}</strong>
                    <small>{option.description}</small>
                  </span>
                </label>
              ))}
              {question.options?.length ? (
                question.isOther !== false && (
                  <label className="user-input-option">
                    <input
                      type="radio"
                      name={`${request.requestId}:${question.id}`}
                      value="__other__"
                      checked={selected[question.id] === '__other__'}
                      disabled={saving}
                      onChange={() => setSelected((current) => ({ ...current, [question.id]: '__other__' }))}
                    />
                    <span>
                      <strong>{labels.other}</strong>
                      {selected[question.id] === '__other__' && (
                        <input
                          autoFocus
                          aria-label={`${question.header} ${labels.otherAnswer}`}
                          type={question.isSecret ? 'password' : 'text'}
                          value={other[question.id] ?? ''}
                          disabled={saving}
                          placeholder={labels.fillOtherAnswer}
                          onChange={(event) => setOther((current) => ({ ...current, [question.id]: event.target.value }))}
                        />
                      )}
                    </span>
                  </label>
                )
              ) : (
                <label className="user-input-option user-input-freeform">
                  <span>
                    <strong>{labels.fillAnswer}</strong>
                    <input
                      aria-label={`${question.header} ${labels.answer}`}
                      type={question.isSecret ? 'password' : 'text'}
                      value={other[question.id] ?? ''}
                      disabled={saving}
                      onChange={(event) => setOther((current) => ({ ...current, [question.id]: event.target.value }))}
                    />
                  </span>
                </label>
              )}
            </div>
          </fieldset>
        ))}
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="user-input-actions">
        <GlareButton type="button" className="button primary" disabled={saving} onClick={() => void submit()}>
          {saving ? <LoaderCircle size={14} className="spinning" /> : <Check size={14} />}
          {labels.submitAnswers}
        </GlareButton>
      </div>
    </section>
  )
}
