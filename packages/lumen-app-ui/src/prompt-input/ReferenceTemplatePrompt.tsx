'use client'

import * as React from 'react'
import type { LumenPromptReferenceViewProps, LumenPromptTemplateReferenceContent } from './reference-content'
import { PromptFrame, uniquePromptItems } from './primitives'
import './reference-template.css'

export function ReferenceTemplatePrompt({
  variantId,
  className,
  viewModel,
  onAction,
}: LumenPromptReferenceViewProps<LumenPromptTemplateReferenceContent>) {
  const { content } = viewModel
  const idPrefix = React.useId()
  const variables = uniquePromptItems(content.variables)
  const variablesById = new Map(variables.map((variable) => [variable.id, variable]))
  const missingCount = variables.filter((variable) => !variable.value.trim()).length
  const canRun = missingCount === 0
  const reportAction = viewModel.onAction ?? onAction

  return (
    <PromptFrame content={content} variantId={variantId} className={className}>
      <div className="lumen-prompt-template-reference">
        <p className="lumen-prompt-template-reference-sentence">
          {content.parts.map((part, index) => {
            if (part.kind === 'text') {
              return <React.Fragment key={index}>{part.text}</React.Fragment>
            }
            const variable = variablesById.get(part.variableId)
            if (!variable) {
              return null
            }
            return (
              <span
                className="lumen-prompt-template-reference-token"
                data-missing={!variable.value.trim() || undefined}
                key={`${part.variableId}-${index}`}
              >
                {variable.value.trim() ? variable.value : variable.label}
              </span>
            )
          })}
        </p>

        <div className="lumen-prompt-template-reference-fields">
          {variables.map((variable, index) => {
            const fieldId = `${idPrefix}-variable-${index}`
            return (
              <div className="lumen-prompt-template-reference-field" key={variable.id}>
                <label htmlFor={fieldId}>{variable.label}</label>
                <input
                  id={fieldId}
                  type="text"
                  value={variable.value}
                  placeholder={variable.placeholder}
                  readOnly={!viewModel.onVariableChange}
                  onChange={(event) => viewModel.onVariableChange?.(variable.id, event.currentTarget.value)}
                />
              </div>
            )
          })}
        </div>

        <footer className="lumen-prompt-template-reference-footer">
          <p className="lumen-prompt-template-reference-status" role="status">
            <span aria-hidden="true" data-ready={missingCount === 0 || undefined} />
            {content.labels.status(missingCount)}
          </p>
          <button
            className="lumen-prompt-template-reference-run"
            type="button"
            disabled={!canRun || !reportAction}
            onClick={() => reportAction?.({ actionId: 'run-template' })}
          >
            {content.labels.run}
          </button>
        </footer>
      </div>
    </PromptFrame>
  )
}

export default ReferenceTemplatePrompt
