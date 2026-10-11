import { expect, test } from '@playwright/test'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSystemCommandClient } from '@hbar/client'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['zh-CN', 'en-US'] as const)
  test(`live runtime updates and recovery preserve the workbench connection: ${locale}`, async ({ browser }) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-runtime-status-ui-'))
    const context = await browser.newContext({ locale })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        fixture: 'runtime-status',
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
      })
      const system = createSystemCommandClient(host.client)
      const before = await system.execute('system.runtime.get', {})
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      const labels = getShellCopy(locale).diagnostics.runtime
      const artifactSetId = before.preparedArtifactSets.at(-1)
      if (!artifactSetId) throw new Error('Prepared Controller fixture artifact is missing')
      await expect(page.getByText(getShellCopy(locale).shell.brand, { exact: true }).first()).toBeVisible()
      await system.execute('system.runtime.reload', { artifactSetId, unitIds: ['controller'] })
      await expect(page.getByText(labels.phases.preparing, { exact: true }).first()).toBeVisible()
      await page.getByRole('button', { name: labels.diagnostics, exact: true }).click()
      const region = page.getByRole('region', { name: labels.title })
      await expect(region).toBeVisible()
      await expect(region.getByText(labels.generation(2, labels.roles.default), { exact: true }).first()).toBeVisible({
        timeout: 30_000,
      })
      host.child.stdin?.write('crash-controller\n')
      await expect(
        page.locator('.hbar-runtime-status-notice').getByText(labels.phases.recovering, { exact: true }),
      ).toBeVisible({ timeout: 15_000 })
      await expect(region.getByText(labels.phases.serving, { exact: true })).toBeVisible({ timeout: 30_000 })
      const after = await system.execute('system.runtime.get', {})
      expect(after.instanceId).toBe(before.instanceId)
      expect(host.client.connectionStatus()).toBe('connected')
      for (const unit of before.units.filter((unit) => unit.descriptor.id !== 'controller'))
        expect(after.units.find((value) => value.descriptor.id === unit.descriptor.id)?.generations[0]?.pid).toBe(
          unit.generations[0]?.pid,
        )
      await mkdir('artifacts/runtime-status-ui', { recursive: true })
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await expect(region).toBeVisible()
        await page.screenshot({ path: `artifacts/runtime-status-ui/${locale}-${width}.png`, fullPage: true })
        if (width === 320)
          await region.getByRole('heading').evaluate((node) => {
            node.textContent = '服务运行状态与恢复诊断🛰️'.repeat(30)
          })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        if (width === 320) {
          await page.screenshot({ path: `artifacts/runtime-status-ui/${locale}-320-long.png`, fullPage: true })
          const last = after.units.at(-1)
          if (!last) throw new Error('Confirmed runtime units are missing')
          const row = region.getByText(labels.unit(labels.kinds[last.descriptor.kind], last.descriptor.id), {
            exact: true,
          })
          await row.scrollIntoViewIfNeeded()
          await expect(row).toBeVisible()
        }
      }
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
