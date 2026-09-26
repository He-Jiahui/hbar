import { expect, test } from '@playwright/test'
import { readFile, rm } from 'node:fs/promises'
import { PlaywrightUiHarness } from './support/playwright-ui-harness.ts'

test('records real shell interaction evidence and flow geometry', async ({ browser }) => {
  const artifactDirectory = 'artifacts/production-ui/web/harness-foundation'
  await rm(artifactDirectory, { recursive: true, force: true })
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 900, height: 600 } })
  const page = await context.newPage()
  const harness = new PlaywrightUiHarness({
    page,
    platform: 'web',
    artifactDirectory,
    locale: 'en-US',
    theme: 'system',
    runtimeErrorPolicy: 'record',
  })
  try {
    await page.goto(`http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`)
    await expect(page.locator('[data-hbar-app-ui-shell="app"]')).toBeVisible()

    await harness.exercise(
      'shell.sidebar.show',
      { role: 'button', name: 'Show projects and sessions sidebar', description: 'sidebar show button' },
      async () => {
        const frameBefore = await page.locator('.hbar-app-ui-app-frame').boundingBox()
        await page.getByRole('button', { name: 'Show projects and sessions sidebar' }).click()
        const sidebar = page.getByRole('complementary', { name: 'Projects and sessions' })
        await expect(sidebar).toBeVisible()
        const [sidebarBox, separatorBox, frameAfter] = await Promise.all([
          page.locator('.hbar-app-ui-app-sidebar-drawer').boundingBox(),
          page.locator('.lumen-app-sidebar-separator').boundingBox(),
          page.locator('.hbar-app-ui-app-frame').boundingBox(),
        ])
        const pushesContent =
          frameBefore !== null &&
          sidebarBox !== null &&
          separatorBox !== null &&
          frameAfter !== null &&
          separatorBox.width > 0 &&
          Math.abs(sidebarBox.x + sidebarBox.width - separatorBox.x) <= 1 &&
          Math.abs(separatorBox.x + separatorBox.width - frameAfter.x) <= 1 &&
          frameAfter.width < frameBefore.width
        return {
          ui: [
            { description: 'sidebar is visible', passed: await sidebar.isVisible() },
            { description: 'sidebar pushes the frame in normal flow', passed: pushesContent },
          ],
        }
      },
    )

    await harness.exercise(
      'shell.sidebar.hide',
      { role: 'button', name: 'Hide projects and sessions sidebar', description: 'sidebar hide button' },
      async () => {
        await page.getByRole('button', { name: 'Hide projects and sessions sidebar' }).click()
        const sidebar = page.getByRole('complementary', { name: 'Projects and sessions' })
        await expect(sidebar).toBeHidden()
        return { ui: [{ description: 'sidebar is hidden', passed: !(await sidebar.isVisible()) }] }
      },
    )

    await harness.exercise('shell.commands.open-shortcut', { description: 'Control+K' }, async () => {
      await page.keyboard.press('Control+K')
      const dialog = page.getByRole('dialog', { name: 'Command catalog' })
      await expect(dialog).toBeVisible()
      return {
        ui: [
          { description: 'command catalog is visible', passed: await dialog.isVisible() },
          {
            description: 'command search receives focus',
            passed: await dialog
              .getByRole('searchbox', { name: 'Search commands' })
              .evaluate((element) => element === document.activeElement),
          },
        ],
      }
    })

    await harness.exercise('commands.close', { description: 'Escape from command catalog' }, async () => {
      await page.keyboard.press('Escape')
      const dialog = page.getByRole('dialog', { name: 'Command catalog' })
      await expect(dialog).toBeHidden()
      return { ui: [{ description: 'command catalog is hidden', passed: !(await dialog.isVisible()) }] }
    })

    await harness.writeReport({ requireComplete: false, generatedAt: '2026-09-20T00:00:00.000Z' })
    const report = JSON.parse(await readFile(`${artifactDirectory}/coverage.json`, 'utf8')) as {
      executed: number
      passed: number
      failed: number
      entries: Array<{ evidence: Record<string, string> }>
    }
    expect(report).toMatchObject({ executed: 4, passed: 4, failed: 0 })
    for (const entry of report.entries) {
      expect(entry.evidence['before-screenshot']).toMatch(/before\.png$/)
      expect(entry.evidence['after-screenshot']).toMatch(/after\.png$/)
      expect(entry.evidence.aria).toMatch(/aria\.json$/)
      expect(entry.evidence.geometry).toMatch(/geometry\.json$/)
    }
    const runtimeErrors = JSON.parse(await readFile(`${artifactDirectory}/runtime-errors.json`, 'utf8')) as {
      pageerror: string[]
    }
    expect(runtimeErrors.pageerror).toEqual([])
  } finally {
    await context.close()
  }
})
