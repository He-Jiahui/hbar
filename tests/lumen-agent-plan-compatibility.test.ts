import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAgentPlan01, LumenPlanEditor } from '@lumen/app-ui'
import { LumenAgentPlan06, LumenAgentPlanProvider, selectLumenAgentPlanItem, uniqueLumenAgentPlanItems } from '@lumen/app-ui/catalog'
import { getLumenVariantComponent } from '@lumen/app-ui/catalog'
import {
  HbarAppUiAgentPlanProvider,
  selectHbarAppUiAgentPlanItem,
  uniqueHbarAppUiAgentPlanItems,
} from '../packages/hbar-app-ui/src/index'
import { HbarAppUiPlanEditor } from '../packages/hbar-app-ui/src/plan-editor'
import { HBAR_APP_UI_AGENT_PLAN_FIXTURES } from './fixtures/hbar-app-ui-agent-plan-fixtures'

test('agent plan compatibility exports are canonical Lumen contracts', () => {
  expect(HbarAppUiAgentPlanProvider).toBe(LumenAgentPlanProvider)
  expect(HbarAppUiPlanEditor).toBe(LumenPlanEditor)
  expect(selectHbarAppUiAgentPlanItem).toBe(selectLumenAgentPlanItem)
  expect(uniqueHbarAppUiAgentPlanItems).toBe(uniqueLumenAgentPlanItems)
  expect(getLumenVariantComponent('hbar-app-ui-agent-plan-6')).toBe(LumenAgentPlan06)
})

test('the canonical Lumen entry renders planning content and controls', () => {
  const markup = renderToStaticMarkup(
    createElement(LumenAgentPlanProvider, {
      content: HBAR_APP_UI_AGENT_PLAN_FIXTURES,
      children: createElement(LumenAgentPlan01),
    }),
  )

  expect(markup).toContain('data-lumen-component="agent-plan"')
  expect(markup).toContain('hbar-app-ui-agent-plan-checklist')
  expect(markup).toContain('Fix billing entitlements')
  expect(markup).toContain('data-lumen-variant=')
})

test('the legacy agent plan implementation and stylesheets are retired', async () => {
  const retired = [
    'AgentPlanPrimitives.tsx',
    'AgentPlanSurface.css',
    'ChecklistPlan.tsx',
    'EditablePlan.tsx',
    'PlanActual.tsx',
    'PlanBoard.tsx',
    'PlanEditor.css',
    'PlanSummary.tsx',
    'PlanTree.tsx',
  ]

  for (const file of retired) {
    expect(await Bun.file(`packages/hbar-app-ui/src/components/agent-plan/${file}`).exists()).toBe(false)
  }
})
