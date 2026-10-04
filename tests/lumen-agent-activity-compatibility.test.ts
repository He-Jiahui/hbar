import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  LumenAgentActivity01,
  LumenAgentActivityProvider,
  selectLumenAgentActivityItem,
  uniqueLumenAgentActivityItems,
} from '@lumen/app-ui'
import {
  HbarAppUiAgentActivityProvider,
  selectHbarAppUiAgentActivityItem,
  uniqueHbarAppUiAgentActivityItems,
} from '../packages/hbar-app-ui/src/index'
import { HBAR_APP_UI_AGENT_ACTIVITY_FIXTURES } from './fixtures/hbar-app-ui-agent-activity-fixtures'

test('agent activity compatibility exports are canonical Lumen contracts', () => {
  expect(HbarAppUiAgentActivityProvider).toBe(LumenAgentActivityProvider)
  expect(selectHbarAppUiAgentActivityItem).toBe(selectLumenAgentActivityItem)
  expect(uniqueHbarAppUiAgentActivityItems).toBe(uniqueLumenAgentActivityItems)
})

test('the canonical Lumen entry renders the family without the compatibility implementation', () => {
  const markup = renderToStaticMarkup(
    createElement(LumenAgentActivityProvider, {
      content: HBAR_APP_UI_AGENT_ACTIVITY_FIXTURES,
      children: createElement(LumenAgentActivity01),
    }),
  )

  expect(markup).toContain('data-lumen-component="agent-activity"')
  expect(markup).toContain('hbar-app-ui-agent-activity-live')
  expect(markup).toContain('data-lumen-variant="1"')
  const controls = [...markup.matchAll(/<button\b[^>]*>/g)].map((match) => match[0])
  expect(controls.length).toBeGreaterThan(0)
  for (const control of controls) {
    expect(control).toContain('data-lumen-variant=')
    expect(control).toContain('data-size=')
    expect(control).toContain('type="button"')
  }
})

test('the legacy agent activity implementations and visual stylesheet are retired', async () => {
  const retired = [
    'AgentActivityContent.tsx',
    'AgentActivityPrimitives.tsx',
    'AgentActivitySurface.css',
    'DeploymentActivity.tsx',
    'FailureActivity.tsx',
    'HistoryActivity.tsx',
    'LiveActivity.tsx',
    'LogActivity.tsx',
    'NestedActivity.tsx',
    'WorkersActivity.tsx',
  ]

  for (const file of retired) {
    expect(await Bun.file(`packages/hbar-app-ui/src/components/agent-activity/${file}`).exists()).toBe(false)
  }
})
