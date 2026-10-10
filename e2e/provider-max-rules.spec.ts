import { expect, test } from '@playwright/test'
import { createConfigurationCommandClient } from '@hbar/client'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startMaxModeFixture } from './support/max-mode-fixture'

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`MAX pricing editor persists multiple tiers and keeps desktop and narrow fields accessible: ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(120_000)
    const host = await startMaxModeFixture()
    const context = await browser.newContext({ locale, colorScheme: 'dark', viewport: { width: 1440, height: 960 } })
    try {
      const configuration = createConfigurationCommandClient(host.client)
      const copy = getShellCopy(locale)
      const labels = copy.providers.dialog.contextPricing
      expect(
        (await context.request.post(`${host.ready.url}/auth/token`, { data: { token: host.ready.token } })).ok(),
      ).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(host.ready.url)
      await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
      await page
        .getByRole('button', { name: copy.settings.resolve('i18n:settings.groups.providers'), exact: true })
        .click()
      await page.getByRole('button', { name: copy.providers.list.edit('MAX fixture provider'), exact: true }).click()
      const dialog = page.locator('.hbar-app-react-provider-dialog')
      const rules = dialog.locator('.hbar-provider-context-rules')
      const disclosure = rules.getByRole('button', { name: labels.title, exact: true })
      await disclosure.focus()
      await disclosure.press('Enter')
      const tiers = rules.locator('.hbar-provider-context-tier')
      await expect(tiers).toHaveCount(1)
      await rules.getByRole('button', { name: labels.add, exact: true }).click()
      await expect(tiers).toHaveCount(2)
      const second = tiers.nth(1)
      await second
        .getByRole('spinbutton', { name: labels.field('i18n:settings.providers.context.expanded'), exact: true })
        .fill('32768')
      await second
        .getByRole('spinbutton', { name: labels.field('i18n:settings.providers.context.threshold'), exact: true })
        .fill('16384')
      await second
        .getByRole('spinbutton', { name: labels.field('i18n:settings.providers.context.input'), exact: true })
        .fill('8')
      await second
        .getByRole('spinbutton', { name: labels.field('i18n:settings.providers.context.output'), exact: true })
        .fill('20')
      const cache = second.getByRole('spinbutton', {
        name: labels.field('i18n:settings.providers.context.cacheRead'),
        exact: true,
      })
      await cache.fill('0.8')
      await cache.fill('')
      await rules
        .getByRole('spinbutton', { name: labels.field('i18n:settings.providers.context.multiplier'), exact: true })
        .fill('1.2')
      for (const viewport of [
        { width: 1440, height: 960 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport)
        await second.scrollIntoViewIfNeeded()
        expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
        await expect(
          second.getByRole('spinbutton', { name: labels.field('i18n:settings.providers.context.input'), exact: true }),
        ).toHaveValue('8')
        await page.screenshot({ path: info.outputPath(`max-rules-${locale}-${viewport.width}.png`) })
      }
      await dialog.getByRole('button', { name: copy.providers.dialog.save, exact: true }).click()
      await expect(dialog).toHaveCount(0)
      const saved = (await configuration.execute('provider.list', {}))
        .find((item) => item.provider.id === 'max-fixture')
        ?.provider.models?.find((model) => model.id === 'large')
      expect(saved?.contextTiers).toHaveLength(2)
      expect(saved?.contextTiers?.[1]).toMatchObject({
        contextWindow: 32768,
        inputTokensAbove: 16384,
        inputPrice: 8,
        outputPrice: 20,
      })
      expect(saved?.contextTiers?.[1]?.cacheReadPrice).toBeUndefined()
      expect(saved?.maxModePricingMultiplier).toBe(1.2)
      await page.setViewportSize({ width: 1440, height: 960 })
      await page.reload()
      await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
      await page
        .getByRole('button', { name: copy.settings.resolve('i18n:settings.groups.providers'), exact: true })
        .click()
      await page.getByRole('button', { name: copy.providers.list.edit('MAX fixture provider'), exact: true }).click()
      await disclosure.click()
      await expect(tiers).toHaveCount(2)
      await expect(
        rules.getByRole('spinbutton', {
          name: labels.field('i18n:settings.providers.context.multiplier'),
          exact: true,
        }),
      ).toHaveValue('1.2')
      expect(errors).toEqual([])
    } finally {
      await context.close()
      await host.close()
    }
  })
}
