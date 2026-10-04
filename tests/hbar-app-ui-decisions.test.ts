import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarAppUiApprovalRequest, HbarAppUiQuestionnaire } from '../packages/hbar-app-ui/src/production'
import { APPROVAL_LABELS, QUESTION_LABELS } from './fixtures/hbar-app-ui-decision-fixtures'

describe('host-controlled decisions', () => {
  test('approval stays pending until the host confirms and renders host failures locally', () => {
    const base = { id: 'approval', tool: 'write', summary: 'README.md', labels: APPROVAL_LABELS, onDecision() {} }
    const pending = renderToStaticMarkup(
      createElement(HbarAppUiApprovalRequest, { ...base, state: { status: 'pending' } }),
    )
    expect(pending).toContain('Saving decision')
    expect(pending).not.toContain('Decision saved')
    expect(pending.match(/disabled=""/g)).toHaveLength(2)
    const failed = renderToStaticMarkup(
      createElement(HbarAppUiApprovalRequest, { ...base, state: { status: 'idle', error: 'Permission changed' } }),
    )
    expect(failed).toContain('role="alert"')
    expect(failed).toContain('Permission changed')
    expect(failed).not.toContain('disabled=""')
  })
  test('question answers survive errors and a custom-like option value is treated as an actual option', () => {
    const markup = renderToStaticMarkup(
      createElement(HbarAppUiQuestionnaire, {
        requestId: 'request',
        labels: QUESTION_LABELS,
        state: { status: 'idle', error: 'Retry this request' },
        questions: [
          {
            id: 'choice',
            header: 'Choice',
            prompt: 'Choose one',
            acceptsCustomAnswer: true,
            options: [{ value: '__hbar_app_ui_custom__', label: 'A legitimate option' }],
          },
        ],
        answers: { choice: { kind: 'option', value: '__hbar_app_ui_custom__' } },
        onAnswer() {},
        onSubmit() {},
      }),
    )
    expect(markup).toContain('A legitimate option')
    expect(markup.match(/checked=""/g)).toHaveLength(1)
    expect(markup).toContain('Retry this request')
  })
})
