import { expect, test } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createExtensionCommandClient } from '@hbar/client'
import { expectComposerText } from './support/composer-text'
import {
  assertReadOnly,
  capture,
  composer,
  selectExtensionCollection,
  setDraft,
  startExtensionCollections,
  stopExtensionCollections,
} from './support/extension-collections-fixture'

// Two representative complete routes, not a button × viewport matrix.
for (const config of [
  { locale: 'en-US', width: 1440 },
  { locale: 'zh-CN', width: 390 },
] as const) {
  test(`Skills inspect, read files and return to the original row and draft ${config.locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(90_000)
    const fixture = await startExtensionCollections(browser, { ...config, skillCount: 21 })
    try {
      const selected = fixture.ready.skills[20]
      if (!selected) throw new Error('Owned skill page two fixture is missing')
      // These additional sources belong only to this fixture's isolated skill directory.
      await mkdir(join(selected.path, 'references'))
      for (let index = 1; index <= 21; index++)
        await writeFile(
          join(selected.path, 'references', `review-${String(index).padStart(2, '0')}.md`),
          `# Review source ${index}\n\nOwned skill reference proof ${index}.\n`,
        )
      const draft = `Unsent original Skills draft — ${config.locale}`
      await setDraft(fixture, draft)
      const showSidebar = fixture.page.getByRole('button', { name: fixture.copy.shell.showSidebar, exact: true })
      if (await showSidebar.isVisible()) await showSidebar.click()
      const settings = fixture.page.getByRole('button', { name: fixture.copy.shell.settings, exact: true })
      await expect(settings).toBeInViewport()
      await settings.click()
      await selectExtensionCollection(fixture, 'skills')
      const panel = fixture.page.locator('.hbar-app-react-extension-workspace')
      const labels = fixture.copy.extensions
      const input = panel.getByRole('textbox', { name: labels.navigation.skills.filter, exact: true })
      await input.fill('fixture')
      await panel.getByRole('button', { name: labels.pagination.next, exact: true }).click()
      await capture(fixture, resolve('artifacts/skill-detail-core'), `list-${config.locale}`)
      const authoritative = await createExtensionCommandClient(fixture.external).execute('skill.inspect', {
        id: selected.id,
      })
      if (!authoritative) throw new Error('Host did not inspect the discovered owned skill')
      const row = panel.locator(`[data-skill-id="${selected.id}"]`)
      const opener = row.getByRole('button', { name: labels.inspect(selected.id), exact: true })
      await opener.focus()
      await opener.press('Enter')
      const detail = panel.locator('.hbar-app-react-skill-detail')
      await expect(
        detail
          .locator('.hbar-app-react-skill-summary')
          .getByRole('heading', { name: authoritative.displayName, exact: true }),
      ).toBeVisible()
      expect(authoritative.body).toContain('This fixture is only listed.')
      await expect(detail.locator('.hbar-app-react-skill-overview')).toContainText('This fixture is only listed.')
      await capture(fixture, resolve('artifacts/skill-detail-core'), `overview-${config.locale}`)
      const overviewTab = detail.getByRole('tab', { name: labels.skillDetail.overview, exact: true })
      const filesTab = detail.getByRole('tab', { name: labels.skillDetail.files, exact: true })
      await overviewTab.focus()
      await overviewTab.press('ArrowRight')
      await expect(filesTab).toBeFocused()
      await expect(filesTab).toHaveAttribute('aria-selected', 'true')
      await expect(filesTab).toHaveAttribute('data-lumen-state', 'selected')
      expect(
        await filesTab.evaluate((element) => {
          const style = getComputedStyle(element)
          return style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent'
        }),
      ).toBe(true)
      await detail.getByRole('button', { name: 'references/review-01.md', exact: true }).click()
      await expect(detail.locator('.hbar-app-react-skill-file-content')).toContainText('Owned skill reference proof 1.')
      await detail.getByRole('button', { name: labels.pagination.next, exact: true }).click()
      await detail.getByRole('button', { name: 'references/review-21.md', exact: true }).click()
      await expect(detail.locator('.hbar-app-react-skill-file-content')).toContainText(
        'Owned skill reference proof 21.',
      )
      await expect(detail.locator('.hbar-app-react-skill-file-content')).toBeInViewport()
      await capture(fixture, resolve('artifacts/skill-detail-core'), `files-${config.locale}`)
      await selectExtensionCollection(fixture, 'plugins')
      await expect(detail).toHaveCount(0)
      await selectExtensionCollection(fixture, 'skills')
      await expect(detail.locator('.hbar-app-react-skill-file-content')).toContainText(
        'Owned skill reference proof 21.',
      )
      await detail.getByRole('button', { name: labels.skillDetail.back, exact: true }).click()
      await expect(input).toHaveValue('fixture')
      await expect(panel.locator('.hbar-app-react-extension-skill-list li')).toHaveCount(1)
      await expect(opener).toBeFocused()
      expect(await fixture.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await fixture.page.getByRole('button', { name: fixture.copy.settings.back, exact: true }).click()
      await expectComposerText(composer(fixture), draft)
      await assertReadOnly(fixture)
    } finally {
      const cleanup = await stopExtensionCollections(fixture)
      await info.attach('owned-cleanup', { body: JSON.stringify(cleanup, null, 2), contentType: 'application/json' })
      expect(cleanup.removed).toBe(true)
    }
  })
}
