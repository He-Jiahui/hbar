import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAgentApproval, type LumenAgentApprovalContent } from '@lumen/app-ui/catalog'
import { HBAR_APP_UI_AGENT_APPROVAL_FIXTURES } from './fixtures/hbar-app-ui-agent-approval-fixtures'
import { projectApprovalPreviewCopy } from '../apps/hbar-app-ui-preview/src/approvalPreviewCopy'

function render(variant: number, content: LumenAgentApprovalContent): string {
  return renderToStaticMarkup(
    createElement(LumenAgentApproval, { variant, variantId: `hbar-app-ui-agent-approval-${variant}`, content }),
  )
}

describe('approval controlled and local-copy boundary', () => {
  test('inline and diff show the Host decision without owning a second visible decision', () => {
    const content = projectApprovalPreviewCopy(HBAR_APP_UI_AGENT_APPROVAL_FIXTURES, false)
    if (!content.inline || !content.diff) throw new Error('Required decision fixtures')
    const inline = render(1, {
      ...content,
      inline: { ...content.inline, requestId: 'inline-owner', state: 'approved' },
    })
    expect(inline).toContain(content.inline.outcomes.approved.summary)
    expect(inline).toContain('No projects or build history were deleted.')
    expect(inline).not.toContain('Delete 12 projects</button>')
    const diff = render(2, { ...content, diff: { ...content.diff, requestId: 'diff-owner', state: 'always-allow' } })
    expect(diff).toContain(content.diff.outcomes['always-allow'].summary)
    expect(diff).not.toContain('Always allow</button>')
  })

  test('missing Host callbacks disable controlled decisions; supplied data and legacy defaults remain readable', () => {
    const content = HBAR_APP_UI_AGENT_APPROVAL_FIXTURES
    if (!content.inline || !content.diff) throw new Error('Required decision fixtures')
    const inline = render(1, { ...content, inline: { ...content.inline, requestId: 'inline-owner', state: 'pending' } })
    expect(inline.match(/disabled=""/g)).toHaveLength(2)
    expect(inline).toContain(content.inline.requestDescription)
    const diff = render(2, { ...content, diff: { ...content.diff, requestId: 'diff-owner', state: 'pending' } })
    expect(diff.match(/disabled=""/g)).toHaveLength(3)
    expect(render(1, content)).not.toContain('lumen-agent-approval-preview')
  })

  test('localized presentation notice and outcomes describe preview facts only', () => {
    const source = HBAR_APP_UI_AGENT_APPROVAL_FIXTURES
    if (!source.cost) throw new Error('Required cost fixture')
    const content = projectApprovalPreviewCopy(source, true)
    if (!content.permission || !content.cost) throw new Error('Required fixtures')
    const permission = render(4, {
      ...content,
      presentation: { ownerId: 'localized-owner', notice: 'Lokale Vorschau ohne echte Dienstfreigabe.' },
      permission: { ...content.permission, state: 'approved' },
    })
    expect(permission).toContain('lumen-agent-approval-preview')
    expect(permission).toContain('Lokale Vorschau ohne echte Dienstfreigabe.')
    expect(permission).toContain('3 von 3 Bereichen in der Vorschau ausgewaehlt')
    expect(permission).toContain('Kein Dienstzugriff wurde erteilt.')
    expect(content.cost.outcomes.approved.summary).toContain('keine Modellnutzung berechnet')
    expect(content.history).toBe(source.history)
    expect(content.cost.metrics).toBe(source.cost.metrics)
  })
})
