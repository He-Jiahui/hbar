import { expect, test } from 'bun:test'
import { LumenAgentActivityProvider, selectLumenAgentActivityItem, uniqueLumenAgentActivityItems } from '@lumen/app-ui'
import {
  HbarAppUiAgentActivityProvider,
  selectHbarAppUiAgentActivityItem,
  uniqueHbarAppUiAgentActivityItems,
} from '../packages/hbar-app-ui/src/index'

test('agent activity compatibility exports are canonical Lumen contracts', () => {
  expect(HbarAppUiAgentActivityProvider).toBe(LumenAgentActivityProvider)
  expect(selectHbarAppUiAgentActivityItem).toBe(selectLumenAgentActivityItem)
  expect(uniqueHbarAppUiAgentActivityItems).toBe(uniqueLumenAgentActivityItems)
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
