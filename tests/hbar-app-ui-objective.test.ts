import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarAppUiObjectiveForm } from '../packages/hbar-app-ui/src/forms'
import { getGoalCopy } from '../apps/web/src/goal-locale'
import { MAX_GOAL_OBJECTIVE_LENGTH } from '@hbar/contracts'
import { HbarAppUiButton } from '../packages/hbar-app-ui/src/production'

test('secondary app-ui buttons cannot implicitly submit their surrounding form', () => {
  expect(renderToStaticMarkup(createElement(HbarAppUiButton, { children: 'Pause' }))).toContain('type="button"')
  expect(renderToStaticMarkup(createElement(HbarAppUiButton, { type: 'submit', children: 'Save' }))).toContain(
    'type="submit"',
  )
})
test('objective form renders host locale, invalid draft and stale controls without internal business state', () => {
  for (const locale of ['zh-CN', 'en-US'] as const) {
    const labels = getGoalCopy(locale),
      objective = '长目标 '.repeat(MAX_GOAL_OBJECTIVE_LENGTH)
    const html = renderToStaticMarkup(
      createElement(HbarAppUiObjectiveForm, {
        labels,
        objective,
        objectiveMaximum: MAX_GOAL_OBJECTIVE_LENGTH,
        budget: '-1',
        busy: false,
        canSave: true,
        stale: true,
        error: labels.invalidBudget,
        onObjectiveChange() {},
        onBudgetChange() {},
        onSave() {},
        onReset() {},
      }),
    )
    expect(html).toContain(objective)
    expect(html).toContain(`maxLength="${MAX_GOAL_OBJECTIVE_LENGTH}"`)
    expect(html).toContain(labels.stale)
    expect(html).toContain('role="alert"')
    expect(html).toContain('disabled=""')
  }
})
