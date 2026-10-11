import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import { createNotificationCommandClient, createRunCommandClient } from '@hbar/client'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { notificationCopy } from '../apps/web/src/notification-copy'
import { removeOwnedFixtureDirectory } from './support/owned-fixture-directory'
import { startWebSessionHost, stopWebSessionHost } from './support/web-session-host'

async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let index = 0; index < 16; index += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) break
    await page.keyboard.press('Tab')
  }
  await expect(target).toBeFocused()
}

async function capturePreferences(page: Page, info: TestInfo, name: string): Promise<void> {
  const path = info.outputPath(`${name}.png`)
  await page.screenshot({ path })
  await info.attach(name, { path, contentType: 'image/png' })
  const layout = await page.locator('.hbar-web-notifications-page').evaluate((root) =>
    [
      root,
      ...root.querySelectorAll(
        '.lumen-preferences-header, .lumen-notifications-preferences, .lumen-preferences-matrix-viewport, ' +
          '.lumen-preferences-matrix, .lumen-preferences-columns, .lumen-preferences-cell, ' +
          '.lumen-notifications-save, .lumen-notifications-save > *, .lumen-notifications-save button',
      ),
    ]
      .slice(0, 25)
      .map((node) => {
        const box = node.getBoundingClientRect()
        const style = getComputedStyle(node)
        return {
          className: node.getAttribute('class'),
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          clientWidth: node.clientWidth,
          scrollWidth: node.scrollWidth,
          scrollLeft: node.scrollLeft,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
          flex: style.flex,
          flexWrap: style.flexWrap,
        }
      }),
  )
  await info.attach(`${name}-layout`, {
    body: Buffer.from(JSON.stringify({ viewport: page.viewportSize(), nodes: layout }, null, 2)),
    contentType: 'application/json',
  })
}

async function assertFooterFlow(page: Page, info: TestInfo, name: string): Promise<void> {
  const flow = await page.locator('.lumen-notifications-save').evaluate((footer) => {
    const status = footer.querySelector('span[aria-live]')
    if (!status) throw new Error('Preference save status is missing')
    const range = document.createRange()
    range.selectNodeContents(status)
    const statusBox = range.getBoundingClientRect()
    const footerBox = footer.getBoundingClientRect()
    return {
      status: { x: statusBox.x, y: statusBox.y, right: statusBox.right, bottom: statusBox.bottom },
      footer: { x: footerBox.x, right: footerBox.right },
      buttons: [...footer.querySelectorAll('button')].map((button) => {
        const box = button.getBoundingClientRect()
        return {
          x: box.x,
          y: box.y,
          right: box.right,
          bottom: box.bottom,
          hit: button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)),
        }
      }),
    }
  })
  await info.attach(`${name}-footer-flow`, {
    body: Buffer.from(JSON.stringify(flow, null, 2)),
    contentType: 'application/json',
  })
  expect(flow.buttons).toHaveLength(2)
  expect(flow.status.x).toBeGreaterThanOrEqual(flow.footer.x)
  expect(flow.status.right).toBeLessThanOrEqual(flow.footer.right)
  for (const button of flow.buttons) {
    expect(button.x).toBeGreaterThanOrEqual(flow.footer.x)
    expect(button.right).toBeLessThanOrEqual(flow.footer.right)
    expect(button.hit).toBe(true)
    expect(
      flow.status.right <= button.x + 1 ||
        button.right <= flow.status.x + 1 ||
        flow.status.bottom <= button.y + 1 ||
        button.bottom <= flow.status.y + 1,
    ).toBe(true)
  }
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`notification preferences retain their draft through live updates and confirmed saves: ${locale}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(60_000)
    const prefix = 'hbar-notification-preferences-live-'
    const root = await mkdtemp(join(tmpdir(), prefix))
    const host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
      goalAutoContinue: false,
      budgetAutoContinue: false,
    })
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    const copy = notificationCopy(locale)
    const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    try {
      await context.addInitScript((language) => localStorage.setItem('hbar:web:language', language), locale)
      expect((await context.request.post(`${origin}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => {
        if (errors.length < 20) errors.push(error.message.slice(0, 1_000))
      })
      await page.goto(origin)
      const sessionEntry = page.locator(`.hbar-app-react-session-row[data-session-id="${host.ready.sessionId}"]`)
      await expect(sessionEntry).toBeVisible()
      await sessionEntry.click()
      await page.getByRole('button', { name: copy.bell(0), exact: true }).click()
      await page.getByRole('button', { name: copy.preferencesTab, exact: true }).click()
      const toggleName = copy.toggle(copy.eventKinds['run.completed'], copy.inApp)
      const toggle = page.getByRole('switch', { name: toggleName, exact: true })
      const save = page.getByRole('button', { name: copy.save, exact: true })
      await expect(toggle).toBeChecked()
      await toggle.click()
      await expect(toggle).not.toBeChecked()
      await expect(save).toBeEnabled()
      const runs = createRunCommandClient(host.client)
      const receipt = await runs.execute(
        'run.submit',
        {
          sessionId: host.ready.sessionId,
          modelId: 'local-fixture',
          input: { text: 'preferences live update', images: [] },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: receipt.operationId })).status)
        .toBe('completed')
      await expect(page.getByRole('button', { name: copy.bell(1), exact: true })).toBeVisible()
      await expect(toggle).not.toBeChecked()
      await expect(save).toBeEnabled()
      await page.screenshot({ path: testInfo.outputPath('preferences-unsaved-live-1440.png') })
      await save.click()
      const notifications = createNotificationCommandClient(host.client)
      await expect.poll(async () => (await notifications.preferences())['run.completed'].inApp).toBe(false)
      await page.reload()
      await page.getByRole('button', { name: copy.bell(1), exact: true }).click()
      await page.getByRole('button', { name: copy.preferencesTab, exact: true }).click()
      await expect(page.getByRole('switch', { name: toggleName, exact: true })).not.toBeChecked()
      await page.screenshot({ path: testInfo.outputPath('preferences-saved-1440.png') })
      await page.setViewportSize({ width: 320, height: 800 })
      await expect(page.getByRole('switch', { name: toggleName, exact: true })).not.toBeChecked()
      await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 320)
      await capturePreferences(page, testInfo, 'preferences-saved-320')
      await assertFooterFlow(page, testInfo, 'preferences-saved-320')
      await page.getByRole('button', { name: copy.preferencesTab, exact: true }).focus()
      await tabTo(page, toggle)
      const focusedChannel = await toggle.evaluate((element) => {
        const owner = element.closest('.lumen-preferences-matrix-viewport')
        if (!owner) throw new Error('Preference channel scroll owner is missing')
        const box = element.getBoundingClientRect()
        const ownerBox = owner.getBoundingClientRect()
        return {
          x: box.x,
          right: box.right,
          ownerX: ownerBox.x,
          ownerRight: ownerBox.x + owner.clientWidth,
          scrollLeft: owner.scrollLeft,
          clientWidth: owner.clientWidth,
          scrollWidth: owner.scrollWidth,
          overflowX: getComputedStyle(owner).overflowX,
          hit: element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)),
        }
      })
      await testInfo.attach('preferences-keyboard-channel', {
        body: Buffer.from(JSON.stringify(focusedChannel, null, 2)),
        contentType: 'application/json',
      })
      expect(focusedChannel.scrollWidth).toBeGreaterThan(focusedChannel.clientWidth)
      expect(focusedChannel.scrollLeft).toBeGreaterThan(0)
      expect(['auto', 'scroll']).toContain(focusedChannel.overflowX)
      expect(focusedChannel.x).toBeGreaterThanOrEqual(focusedChannel.ownerX)
      expect(focusedChannel.right).toBeLessThanOrEqual(focusedChannel.ownerRight)
      expect(focusedChannel.hit).toBe(true)
      await page.keyboard.press('Space')
      await expect(toggle).toBeChecked()
      await expect(save).toBeEnabled()
      await capturePreferences(page, testInfo, 'preferences-keyboard-draft-320')
      await assertFooterFlow(page, testInfo, 'preferences-keyboard-draft-320')
      await tabTo(page, save)
      await page.keyboard.press('Enter')
      await expect.poll(async () => (await notifications.preferences())['run.completed'].inApp).toBe(true)
      await expect(save).toBeDisabled()
      await capturePreferences(page, testInfo, 'preferences-keyboard-saved-320')
      await assertFooterFlow(page, testInfo, 'preferences-keyboard-saved-320')
      await page.setViewportSize({ width: 1440, height: 960 })
      await page.reload()
      await page.getByRole('button', { name: copy.bell(1), exact: true }).click()
      await page.getByRole('button', { name: copy.preferencesTab, exact: true }).click()
      await expect(toggle).toBeChecked()
      expect(errors).toEqual([])
    } finally {
      await context.close()
      await stopWebSessionHost(host)
      await removeOwnedFixtureDirectory(root, prefix)
    }
  })
}
