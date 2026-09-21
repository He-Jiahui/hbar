import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  LumenAgentApproval01,
  LumenAgentApproval06,
  LumenAgentApprovalProvider,
  selectLumenAgentApprovalItem,
  uniqueLumenAgentApprovalItems,
} from '@lumen/app-ui'
import { getLumenVariantComponent } from '@lumen/app-ui/catalog'
import {
  HbarAppUiAgentApprovalProvider,
  selectHbarAppUiAgentApprovalItem,
  uniqueHbarAppUiAgentApprovalItems,
} from '../packages/hbar-app-ui/src/index'
import { HBAR_APP_UI_AGENT_APPROVAL_FIXTURES } from './fixtures/hbar-app-ui-agent-approval-fixtures'

test('agent approval compatibility exports are canonical Lumen contracts', () => {
  expect(HbarAppUiAgentApprovalProvider).toBe(LumenAgentApprovalProvider)
  expect(selectHbarAppUiAgentApprovalItem).toBe(selectLumenAgentApprovalItem)
  expect(uniqueHbarAppUiAgentApprovalItems).toBe(uniqueLumenAgentApprovalItems)
  expect(getLumenVariantComponent('hbar-app-ui-agent-approval-6')).toBe(LumenAgentApproval06)
})

test('the canonical Lumen entry renders approval content and controls', () => {
  const markup = renderToStaticMarkup(
    createElement(LumenAgentApprovalProvider, {
      content: HBAR_APP_UI_AGENT_APPROVAL_FIXTURES,
      children: createElement(LumenAgentApproval01),
    }),
  )

  expect(markup).toContain('data-lumen-component="agent-approval"')
  expect(markup).toContain('hbar-app-ui-agent-approval-inline')
  expect(markup).toContain('Delete 12 archived projects and their build history')
  expect(markup).toContain('data-lumen-variant=')
})

test('the legacy agent approval implementation and stylesheet are retired', async () => {
  const retired = [
    'AgentApprovalContent.tsx',
    'AgentApprovalPrimitives.tsx',
    'AgentApprovalSurface.css',
    'CostApproval.tsx',
    'DiffApproval.tsx',
    'HistoryApproval.tsx',
    'InlineApproval.tsx',
    'PermissionApproval.tsx',
    'QueueApproval.tsx',
  ]

  for (const file of retired) {
    expect(await Bun.file(`packages/hbar-app-ui/src/components/agent-approval/${file}`).exists()).toBe(false)
  }
})
