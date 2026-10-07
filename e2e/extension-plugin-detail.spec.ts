import { expect, test } from '@playwright/test'
import { createExtensionCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { removeOwnedPluginFixture } from './support/plugin-fixture-cleanup'
import { verifyReadableText } from '../scripts/support/verify-readable-text'

const envelope = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    params: z.object({ commandId: z.string().optional() }).passthrough().optional(),
  })
  .passthrough()

for (const locale of ['en-US', 'zh-CN'] as const)
  test(`extensions inspect real Host contributions and return to the filtered row with keyboard: ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-plugin-detail-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 45417),
        goalAutoContinue: false,
        budgetAutoContinue: false,
      })
      const extensions = createExtensionCommandClient(host.client)
      const source = join(root, 'fixture-plugin')
      await mkdir(source)
      const name = 'Review fixture — 当前插件能力与超长本地化名称检验'
      await writeFile(
        join(source, 'package.json'),
        JSON.stringify({
          name: 'detail-fixture',
          version: '1.2.3',
          type: 'module',
          hbar: {
            apiVersion: '^1.0.0',
            scope: 'global',
            host: './index.js',
            contributes: {
              commands: Array.from({ length: 21 }, (_, index) => ({
                id: `fixture.review-${index}`,
                title: `Review contribution ${index}`,
                description: `Read-only declared command ${index}`,
                usage: `/fixture.review-${index}`,
                group: 'extensions',
              })),
              panels: [
                {
                  id: 'fixture.panel',
                  title: 'Declared review panel',
                  kind: 'markdown',
                  content: 'Original declared review fixture',
                },
              ],
              renderers: [{ id: 'fixture.renderer' }],
            },
          },
        }),
      )
      await writeFile(
        join(source, 'index.js'),
        `export default { manifest: { id: 'fixture', name: ${JSON.stringify(name)}, version: '0.0.0', apiVersion: '^1.0.0', description: 'A test plugin with public command and UI declarations.', scope: 'host', permissions: [] }, apply() {} }`,
      )
      await extensions.execute('plugin.install', { path: source }).catch((reason: unknown) => {
        if (reason && typeof reason === 'object' && 'code' in reason)
          throw new Error(`Owned declaration install failed: ${String(reason.code)}`, { cause: reason })
        throw reason
      })
      const installed = await extensions.execute('plugin.inspect', { id: 'detail-fixture' })
      expect(installed?.contributes?.commands).toHaveLength(21)
      const required = (await extensions.execute('plugin.list', {})).find((plugin) => plugin.required)
      if (!required) throw new Error('Real Host fixture must include a required plugin')
      const copy = getShellCopy(locale)
      const labels = copy.extensions
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 45429}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      let failRead = true
      let reads = 0
      await page.routeWebSocket('**/rpc', (socket) => {
        const server = socket.connectToServer()
        socket.onMessage((message) => {
          if (typeof message === 'string') {
            const parsed = envelope.safeParse(JSON.parse(message))
            if (parsed.success && parsed.data.params?.commandId === 'plugin.inspect') {
              reads += 1
              if (failRead) {
                failRead = false
                socket.send(
                  JSON.stringify({
                    jsonrpc: '2.0',
                    id: parsed.data.id,
                    error: { code: -32603, message: 'Fixture read failure', data: 'DISCONNECTED' },
                  }),
                )
                return
              }
            }
          }
          server.send(message)
        })
        server.onMessage((message) => socket.send(message))
      })
      await page.goto(base)
      await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
      await page
        .getByRole('navigation', { name: copy.settings.groups })
        .getByRole('button', { name: copy.settings.resolve('i18n:settings.groups.extensions'), exact: true })
        .click()
      const workspace = page.locator('.hbar-app-react-extension-workspace')
      const filter = workspace.getByRole('textbox', { name: labels.navigation.plugins.filter, exact: true })
      await filter.fill('detail-fixture')
      const opener = workspace.getByRole('button', { name: labels.inspect(name), exact: true })
      await opener.focus()
      await page.keyboard.press('Enter')
      const detail = workspace.locator('.hbar-app-react-plugin-detail')
      await expect(detail.getByRole('alert')).toContainText('DISCONNECTED')
      await expect(detail.getByRole('button', { name: labels.detail.back })).toBeFocused()
      await detail.getByRole('button', { name: labels.detail.retry }).click()
      await expect(detail.getByRole('heading', { name, exact: true })).toBeVisible()
      expect(reads).toBe(2)
      await expect(detail).toContainText('Review contribution 0')
      await expect(detail).not.toContainText('Review contribution 20')
      await detail.getByRole('button', { name: labels.pagination.next }).click()
      await expect(detail).toContainText('Review contribution 20')
      await expect(detail).not.toContainText('Review contribution 0')
      await expect(detail).toContainText('Declared review panel')
      await expect(detail).toContainText('fixture.renderer')
      await expect(detail).toContainText(labels.detail.readOnly)
      for (const width of [1440, 1100, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await expect(detail).toBeVisible()
        await verifyReadableText(detail.getByRole('heading', { name, exact: true }), name, width <= 390)
        expect(await workspace.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: info.outputPath(`plugin-detail-${locale}-${width}.png`) })
      }
      await detail.getByRole('button', { name: labels.detail.back }).focus()
      await page.keyboard.press('Enter')
      await expect(filter).toHaveValue('detail-fixture')
      await expect(opener).toBeFocused()
      await expect(opener).toHaveAttribute('aria-current', 'true')
      await page.screenshot({ path: info.outputPath(`plugin-list-${locale}-320.png`) })
      await filter.fill(required.id)
      await workspace.getByRole('button', { name: labels.inspect(required.name), exact: true }).click()
      await expect(detail).toContainText(labels.detail.required)
      await expect(detail.getByRole('button', { name: labels.disable, exact: true })).toHaveCount(0)
      await detail.getByRole('button', { name: labels.detail.back }).click()
      await filter.fill('no-such-extension')
      await expect(
        workspace.locator('[data-extension-collection="plugins"]').getByText(labels.noMatchingPlugins, { exact: true }),
      ).toBeVisible()
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeOwnedPluginFixture(root, 'hbar-plugin-detail-')
    }
  })
