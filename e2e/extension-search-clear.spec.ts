import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'
import {
  assertReadOnly,
  capture,
  openSettingsGroup,
  startExtensionCollections,
  stopExtensionCollections,
} from './support/extension-collections-fixture'

const evidence = resolve('artifacts/skills-clear-audit')

for (const locale of ['en-US', 'zh-CN'] as const) {
  for (const width of [1440, 320]) {
    test(`Skills no-match recovery keeps the filter focused and resets its page: ${locale} ${width}`, async ({ browser }) => {
      test.setTimeout(90_000)
      const fixture = await startExtensionCollections(browser, { locale, width, height: 900, skillCount: 21 })
      try {
        await openSettingsGroup(fixture, 'skills')
        const panel = fixture.page.locator('.hbar-app-react-extension-workspace')
        await expect(panel.locator('[data-extension-collection="skills"] [data-collection-status]')).toHaveAttribute(
          'data-collection-status',
          'ready',
        )
        const input = panel.getByRole('textbox', {
          name: fixture.copy.extensions.navigation.skills.filter,
          exact: true,
        })
        const inlineClear = panel
          .locator('.hbar-app-react-extension-filter-control')
          .getByRole('button', { name: fixture.copy.extensions.clearSearch, exact: true })
        await input.fill('no-such-skill')
        await expect(panel).toContainText(fixture.copy.extensions.skillSearchResults(0, 21))
        await expect(panel.locator('.hbar-app-react-extension-skill-list li')).toHaveCount(0)
        const empty = panel.locator('.hbar-app-react-extension-no-matches')
        await expect(empty).toContainText(fixture.copy.extensions.noMatchingSkills)
        await expect(inlineClear).toBeVisible()
        await capture(fixture, evidence, `after-no-match-${locale}-${width}`)
        await empty.getByRole('button', { name: fixture.copy.extensions.clearSearch, exact: true }).click()
        await expect(input).toHaveValue('')
        await expect(input).toBeFocused()
        await expect(panel.locator('.hbar-app-react-extension-skill-list li')).toHaveCount(20)

        await panel.getByRole('button', { name: fixture.copy.extensions.pagination.next, exact: true }).click()
        await expect(panel.locator('.hbar-app-react-extension-skill-list li')).toHaveCount(1)
        await input.fill('no-such-skill')
        await inlineClear.click()
        await expect(input).toHaveValue('')
        await expect(input).toBeFocused()
        await expect(panel.locator('.hbar-app-react-extension-skill-list li')).toHaveCount(20)
        await expect(inlineClear).toHaveCount(0)
        expect(
          await fixture.page
            .locator('.hbar-app-react-settings-scroll')
            .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        ).toBe(true)
        await assertReadOnly(fixture)
      } finally {
        await stopExtensionCollections(fixture)
      }
    })
  }
}
