import { expect, test } from '@playwright/test'
import { createNodeCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { selectLumenOption } from './support/lumen-controls'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

test.use({ trace: 'off' })

test('Nodes settings invites against the real Host and remains readable at narrow width', async ({ browser }) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-management-e2e-'))
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 960 } })
  const copy = getShellCopy('en-US')
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
      nodeManagementSeedCount: 0,
    })
    const commands = createNodeCommandClient(host.client)
    expect(await commands.execute('node.list', { limit: 20 })).toEqual({ items: [], nextCursor: null })
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)

    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    await expect(page.getByRole('complementary', { name: copy.shell.projectsAndSessions })).toContainText(
      copy.shell.connected,
    )
    await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: copy.settings.pageTitle })).toBeVisible()
    const settingsScope = page.getByRole('combobox', { name: 'Settings scope' })
    if (await settingsScope.count()) await settingsScope.selectOption('global')
    const groupPicker = page.getByRole('combobox', { name: copy.settings.groups, exact: true })
    if (await groupPicker.isVisible()) await selectLumenOption(groupPicker, 'nodes')
    else
      await page
        .getByRole('navigation', { name: copy.settings.groups })
        .getByRole('button', { name: copy.nodes.title, exact: true })
        .click()

    const region = page.getByRole('region', { name: copy.nodes.title })
    await expect(region.getByText(copy.nodes.empty, { exact: true })).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: copy.settings.pageTitle })).toBeVisible()
    await expect(
      page.getByRole('region', { name: copy.nodes.title }).getByText(copy.nodes.empty, { exact: true }),
    ).toBeVisible()
    await mkdir('artifacts/node-management', { recursive: true })
    await page.screenshot({ path: 'artifacts/node-management/empty-1440.png', fullPage: true })
    await region.getByRole('textbox', { name: copy.nodes.inviteName }).fill('e2e remote runner')
    await region.getByRole('button', { name: copy.nodes.invite, exact: true }).click()
    await expect(region.getByText(copy.nodes.inviteCreated, { exact: true })).toBeVisible()
    const code = region.locator('.hbar-node-management-invite-value code').first()
    const fingerprint = region.locator('.hbar-node-management-invite-value code').nth(1)
    await expect(code).toHaveText(/^\d{8}$/)
    await expect(fingerprint).toHaveText(/^SHA256:[A-Za-z0-9_-]{43}$/)
    await expect(region.getByText(/^Expires at /)).toBeVisible()
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await region.getByRole('button', { name: copy.nodes.copyCode, exact: true }).click()
    await expect(region.getByRole('button', { name: copy.nodes.copied, exact: true })).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await code.textContent())
    await region.getByRole('button', { name: copy.nodes.copyFingerprint, exact: true }).click()
    await expect(region.getByRole('button', { name: copy.nodes.copied, exact: true })).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await fingerprint.textContent())

    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await mkdir('artifacts/node-management', { recursive: true })
    await page.screenshot({ path: 'artifacts/node-management/invite-390.png', fullPage: true })
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})

test('Nodes settings pages the real registry and confirms a targeted revocation', async ({ browser }) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-registry-e2e-'))
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 960 } })
  const copy = getShellCopy('en-US')
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
      nodeManagementSeedCount: 21,
    })
    const commands = createNodeCommandClient(host.client)
    const firstPage = await commands.execute('node.list', { limit: 20 })
    expect(firstPage.items).toHaveLength(20)
    expect(firstPage.nextCursor).not.toBeNull()
    const target = firstPage.items[0]
    if (!target) throw new Error('The E2E node page did not include its first persisted node')
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)

    const page = await context.newPage()
    await page.goto(base)
    await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
    const settingsScope = page.getByRole('combobox', { name: 'Settings scope' })
    if (await settingsScope.count()) await settingsScope.selectOption('global')
    const groupPicker = page.getByRole('combobox', { name: copy.settings.groups, exact: true })
    if (await groupPicker.isVisible()) await selectLumenOption(groupPicker, 'nodes')
    else
      await page
        .getByRole('navigation', { name: copy.settings.groups })
        .getByRole('button', { name: copy.nodes.title, exact: true })
        .click()

    const region = page.getByRole('region', { name: copy.nodes.title })
    const rows = region.getByRole('listitem')
    await expect(rows).toHaveCount(20)
    await expect(region.getByText(copy.nodes.nodeCount(20), { exact: true })).toBeVisible()
    await region.getByRole('button', { name: copy.nodes.loadMore, exact: true }).click()
    await expect(rows).toHaveCount(21)

    const row = rows.filter({ hasText: target.name })
    if (!target.capabilities) throw new Error('The seeded node did not retain its capability snapshot')
    await expect(row.getByText(copy.nodes.capabilitySummary(target.capabilities), { exact: true })).toBeVisible()
    await expect(row.getByText(copy.nodes.rootsSummary(target.capabilities.roots), { exact: true })).toBeVisible()
    await expect(row.getByText(copy.nodes.offline, { exact: true })).toBeVisible()
    await row.getByRole('button', { name: copy.nodes.revoke, exact: true }).click()
    await expect(row.getByText(copy.nodes.revokeConfirm(target.name), { exact: true })).toBeVisible()
    await row.getByRole('button', { name: copy.nodes.cancel, exact: true }).click()
    await expect(row.getByText(copy.nodes.revokeConfirm(target.name), { exact: true })).toHaveCount(0)
    await row.getByRole('button', { name: copy.nodes.revoke, exact: true }).click()
    await expect(row.getByText(copy.nodes.revokeConfirm(target.name), { exact: true })).toBeVisible()
    await row.getByRole('button', { name: copy.nodes.confirmRevoke, exact: true }).click()
    await expect(row.getByText(copy.nodes.revoked, { exact: true })).toBeVisible()
    const persisted = (await commands.execute('node.list', { limit: 100 })).items.find(
      (item) => item.nodeId === target.nodeId,
    )
    if (!persisted) throw new Error('The revoked node was missing from the Host registry')
    expect(persisted.revokedAt).not.toBeNull()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await mkdir('artifacts/node-management', { recursive: true })
    await page.screenshot({ path: 'artifacts/node-management/registry-21-revoked.png', fullPage: true })
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})

test('Nodes settings language copy is host owned and readable at a narrow viewport', async ({ browser }) => {
  test.setTimeout(120_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-localized-e2e-'))
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 960 } })
  const copy = getShellCopy('zh-CN')
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
      nodeManagementSeedCount: 0,
    })
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    await page.goto(base)
    await page.getByRole('button', { name: getShellCopy('en-US').shell.settings, exact: true }).click()
    const english = getShellCopy('en-US')
    await page
      .getByRole('navigation', { name: english.settings.groups })
      .getByRole('button', { name: english.general.group, exact: true })
      .click()
    await page.getByRole('radio', { name: '简体中文', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
    const groupPicker = page.getByRole('combobox', { name: copy.settings.groups, exact: true })
    if (await groupPicker.isVisible()) await selectLumenOption(groupPicker, 'nodes')
    else
      await page
        .getByRole('navigation', { name: copy.settings.groups })
        .getByRole('button', { name: copy.nodes.title, exact: true })
        .click()
    await page.setViewportSize({ width: 390, height: 844 })
    const region = page.getByRole('region', { name: getShellCopy('en-US').nodes.title })
    await expect(region.getByRole('heading', { name: copy.nodes.title, exact: true })).toBeVisible()
    await expect(region.getByText(copy.nodes.description, { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await expect(region.getByText(copy.nodes.empty, { exact: true })).toBeVisible()
    await mkdir('artifacts/node-management', { recursive: true })
    await page.screenshot({ path: 'artifacts/node-management/empty-zh-390.png', fullPage: true })
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})
