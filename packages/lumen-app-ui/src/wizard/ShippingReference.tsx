'use client'

import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import type { LumenWizardContent } from '../wizard'

export default function ShippingReference({ content }: { readonly content: LumenWizardContent }) {
  const flow = content.referenceShipping
  if (!flow) {
    return null
  }
  const questions = flow.questions.filter(
    (question, index) => flow.questions.findIndex((other) => other.id === question.id) === index,
  )
  const currentIndex = Math.max(
    0,
    questions.findIndex((question) => question.id === flow.currentQuestionId),
  )
  const question = questions[currentIndex]
  if (!question) {
    return (
      <section className="hbar-app-ui-wizard-shipping-card">
        <p className="hbar-app-ui-wizard-shipping-empty">{flow.labels.empty}</p>
      </section>
    )
  }
  const options = question.options.filter(
    (option, index) => question.options.findIndex((other) => other.id === option.id) === index,
  )
  const selectedId = flow.selectedOptionIds[question.id]
  const selected = options.some((option) => option.id === selectedId)
  const move = (index: number) => {
    const next = questions[index]
    if (next) {
      flow.onQuestionChange(next.id)
    }
  }
  return (
    <section className="hbar-app-ui-wizard-shipping-card">
      <div className="hbar-app-ui-wizard-shipping-progress">
        <ol>
          {questions.map((item, index) => {
            let className = ''
            if (index === currentIndex) {
              className = 'is-current'
            } else if (index < currentIndex) {
              className = 'is-past'
            }
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={className}
                  aria-label={flow.labels.question(index + 1)}
                  onClick={() => move(index)}
                />
              </li>
            )
          })}
        </ol>
        <p>{flow.labels.progress(currentIndex + 1, questions.length)}</p>
      </div>
      <h2>{question.title}</h2>
      <p className="hbar-app-ui-wizard-shipping-detail">{question.detail}</p>
      <div
        className="hbar-app-ui-wizard-shipping-options"
        role="radiogroup"
        aria-label={question.title}
        data-hbar-app-ui-list-strategy={flow.listStrategy.kind}
        data-hbar-app-ui-overbound={options.length > 8}
      >
        {options.map((option) => (
          <button
            type="button"
            role="radio"
            aria-checked={option.id === selectedId}
            key={option.id}
            onClick={() => flow.onOptionChange(question.id, option.id)}
          >
            <span aria-hidden="true">{option.id === selectedId && <Check />}</span>
            <span className="hbar-app-ui-wizard-shipping-option-label">{option.label}</span>
          </button>
        ))}
      </div>
      <div className="hbar-app-ui-wizard-shipping-actions">
        <button
          type="button"
          aria-label={flow.labels.previous}
          disabled={currentIndex === 0}
          onClick={() => move(currentIndex - 1)}
        >
          <ArrowLeft aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={!selected}
          onClick={() => selected && move(Math.min(questions.length - 1, currentIndex + 1))}
        >
          {currentIndex === questions.length - 1 ? flow.labels.finish : flow.labels.continue}
          {currentIndex < questions.length - 1 && <ArrowRight aria-hidden="true" />}
        </button>
      </div>
      <button type="button" className="hbar-app-ui-wizard-shipping-skip">
        {flow.labels.skip}
      </button>
    </section>
  )
}
