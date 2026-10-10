import { expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

test('the workbench reconnects after the first handshake fails without a reload or manual reconnect', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-web-connect-recovery-'))
  let host: WebSessionHost | undefined
  let attempts = 0
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await page.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    await page.routeWebSocket('**/rpc', async (route) => {
      attempts++
      if (attempts === 1) await route.close({ code: 1011, reason: 'Injected initial handshake failure' })
      else route.connectToServer()
    })
    await page.goto(base)
    await expect(page.locator('[data-hbar-app-ui-shell="app"]')).toBeVisible()
    await expect(page.getByRole('treeitem', { name: host.ready.workspaceName })).toBeVisible({ timeout: 20_000 })
    expect(attempts).toBeGreaterThanOrEqual(2)
    expect(errors).toEqual([])
    await page.screenshot({ path: 'artifacts/connection-recovery/initial-handshake.png' })
  } finally {
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})
