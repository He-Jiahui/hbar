import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { OnboardingReadinessView, resolveOnboardingVariant } from '../packages/app-react/src/onboarding-readiness'
import { onboardingCopy } from '../apps/web/src/onboarding-copy'

const actions = {
  onConfigure: () => undefined,
  onCreate: () => undefined,
  onPathChange: () => undefined,
  onOpen: () => undefined,
  onBack: () => undefined,
  setupPath: 'D:/projects/sample',
}

test('readiness uses canonical onboarding variants from confirmed facts', () => {
  expect(resolveOnboardingVariant({ connected: false, workspaceCount: 0, modelCount: 0, projectReady: false })).toBe(3)
  expect(resolveOnboardingVariant({ connected: true, workspaceCount: 0, modelCount: 1, projectReady: false })).toBe(7)
  expect(resolveOnboardingVariant({ connected: true, workspaceCount: 1, modelCount: 1, projectReady: true })).toBe(6)
})

test('wizard workspace step renders a host-owned path form in both locales', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const html = renderToStaticMarkup(
      <OnboardingReadinessView
        readiness={{ connected: true, workspaceCount: 0, modelCount: 1, projectReady: false }}
        labels={onboardingCopy(locale)}
        actions={actions}
      />,
    )
    expect(html).toContain('hbar-onboarding-workspace-path')
    expect(html).toContain('D:/projects/sample')
  }
})
