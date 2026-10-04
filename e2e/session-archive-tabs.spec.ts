import { expect, test, type Page } from '@playwright/test'
import { createRunCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { workspaceTabsCopy } from '../apps/web/src/workspace-tabs-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const evidence = 'artifacts/desktop-entry-matrix/archive'
const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 44925}`
const rpc = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    params: z.object({ commandId: z.string().optional() }).passthrough().optional(),
  })
  .passthrough()
async function showSidebar(page: Page, locale: ShellLocale) {
  const labels = getShellCopy(locale).shell
  const sidebar = page.getByRole('complementary', { name: labels.projectsAndSessions, exact: true })
  if (!(await sidebar.isVisible())) await page.getByRole('button', { name: labels.showSidebar, exact: true }).click()
  return sidebar
}
async function beginArchive(page: Page, locale: ShellLocale, sessionId: string) {
  await showSidebar(page, locale)
  const row = page.locator(`[data-session-id="${sessionId}"]`)
  await row.locator('summary').click()
  await row.getByRole('menuitem', { name: getShellCopy(locale).shell.archiveSession, exact: true }).click()
  return row
}
async function waitSavedEmptyWorkspace(page: Page, workspaceId: string) {
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          Object.values(localStorage).some((value) => {
            try {
              const data: unknown = JSON.parse(String(value))
              if (!data || typeof data !== 'object' || !('value' in data)) return false
              const prefs = data.value
              if (!prefs || typeof prefs !== 'object' || !('workspaceTabs' in prefs)) return false
              const tabs = prefs.workspaceTabs
              return (
                !!tabs &&
                typeof tabs === 'object' &&
                'activeWorkspaceId' in tabs &&
                'activeId' in tabs &&
                tabs.activeId === null &&
                tabs.activeWorkspaceId === id
              )
            } catch {
              return false
            }
          }),
        workspaceId,
      ),
    )
    .toBe(true)
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`confirmed archive retires only A; unknown retains A until reconciliation; restore does not navigate: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(100_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-archive-tabs-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      await mkdir(evidence, { recursive: true })
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 44923),
        goalAutoContinue: false,
      })
      const commands = createWorkspaceSessionCommandClient(host.client)
      const title = '原归档目标 A — A long original target with history and an unsent draft'
      await commands.execute('session.rename', { sessionId: host.ready.sessionId, title })
      const b = await commands.execute(
        'session.create',
        { workspaceId: host.ready.workspaceId, title: 'Active B — 保持焦点与草稿' },
        { idempotencyKey: crypto.randomUUID() },
      )
      const copy = getShellCopy(locale)
      const labels = copy.shell.archive
      expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const pending = new Set<string | number>()
      let unknown = false
      let writes = 0
      await page.routeWebSocket('**/rpc', (socket) => {
        const server = socket.connectToServer()
        socket.onMessage((message) => {
          if (typeof message === 'string') {
            const value = rpc.safeParse(JSON.parse(message))
            if (value.success && value.data.id !== undefined && value.data.params?.commandId === 'session.archive') {
              pending.add(value.data.id)
              writes++
            }
          }
          server.send(message)
        })
        server.onMessage((message) => {
          if (typeof message === 'string') {
            const value = rpc.safeParse(JSON.parse(message))
            if (value.success && value.data.id !== undefined && pending.delete(value.data.id) && unknown) {
              socket.send(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: value.data.id,
                  error: { code: -32603, message: 'Fixture lost accepted archive reply', data: 'CONNECTION_CLOSED' },
                }),
              )
              return
            }
          }
          socket.send(message)
        })
      })
      await page.goto(base())
      await page.getByRole('button', { name: copy.shell.openSession(title), exact: true }).click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await expect(prompt).toBeEditable()
      await prompt.fill('Unsent A — 不清除原始草稿')
      await expectComposerText(prompt, 'Unsent A — 不清除原始草稿')
      await page.getByRole('button', { name: copy.shell.openSession(b.title), exact: true }).click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(b.title)
      await expect(prompt).toBeEditable()
      await prompt.fill('Unsent B — 不抢当前输入')
      await expectComposerText(prompt, 'Unsent B — 不抢当前输入')
      const row = await beginArchive(page, locale, host.ready.sessionId)
      const confirm = page.getByRole('group', { name: labels.confirmTitle(title), exact: true })
      await expect(confirm).toContainText(labels.description)
      await expect(confirm.getByRole('button', { name: labels.cancel, exact: true })).toBeFocused()
      for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: width > 900 ? 960 : 844 })
        await showSidebar(page, locale)
        await expect(confirm).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `${evidence}/confirm-${locale}-${width}.png` })
      }
      await page.setViewportSize({ width: 1440, height: 960 })
      await confirm.getByRole('button', { name: labels.confirm, exact: true }).click()
      await expect(row).toHaveCount(0)
      await expect(page.getByRole('tab', { name: title, exact: true })).toHaveCount(0)
      await expect(page.getByRole('tab', { name: b.title, exact: true })).toHaveAttribute('aria-selected', 'true')
      await expectComposerText(prompt, 'Unsent B — 不抢当前输入')
      expect((await commands.execute('session.get', { sessionId: host.ready.sessionId }))?.archived).toBe(true)
      await page.screenshot({ path: `${evidence}/confirmed-${locale}-1440.png` })
      await page.getByRole('button', { name: labels.dismiss, exact: true }).click()
      await page.getByTitle(copy.shell.workspaceActions(host.ready.workspaceName), { exact: true }).click()
      await page.getByRole('menuitem', { name: labels.openList(host.ready.workspaceName), exact: true }).click()
      const list = page.getByRole('region', { name: labels.listTitle(host.ready.workspaceName), exact: true })
      await list.getByRole('button', { name: labels.restoreSession(title), exact: true }).click()
      await expect(row).toBeVisible()
      await expect(page.getByRole('tab', { name: title, exact: true })).toHaveCount(0)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(b.title)
      await list.getByRole('button', { name: labels.close, exact: true }).click()
      await row.locator('.hbar-app-react-session-target').click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
      await expectComposerText(prompt, 'Unsent A — 不清除原始草稿')
      await page.getByRole('tab', { name: b.title, exact: true }).click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(b.title)
      await expectComposerText(prompt, 'Unsent B — 不抢当前输入')
      unknown = true
      await beginArchive(page, locale, host.ready.sessionId)
      await confirm.getByRole('button', { name: labels.confirm, exact: true }).click()
      await expect(confirm.getByRole('alert')).toHaveText(labels.unknown)
      await expect(page.getByRole('tab', { name: title, exact: true })).toHaveCount(1)
      await expectComposerText(prompt, 'Unsent B — 不抢当前输入')
      expect((await commands.execute('session.get', { sessionId: host.ready.sessionId }))?.archived).toBe(true)
      unknown = false
      await confirm.getByRole('button', { name: labels.reconcile, exact: true }).click()
      await expect(page.getByRole('tab', { name: title, exact: true })).toHaveCount(0)
      await expect(page.getByRole('tab', { name: b.title, exact: true })).toHaveAttribute('aria-selected', 'true')
      await expectComposerText(prompt, 'Unsent B — 不抢当前输入')
      expect(writes).toBe(3)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })

  test(`archiving source A preserves the selected dirty Files Workbench without cancelling a Run: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-archive-workbench-'))
    const filename = 'unsaved-file-workbench-original-target.md'
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      await writeFile(join(root, filename), '# original disk\n')
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 44923),
        goalAutoContinue: false,
      })
      const copy = getShellCopy(locale)
      const tabs = workspaceTabsCopy((zh, en) => (locale === 'zh-CN' ? zh : en))
      expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const cancelled: string[] = []
      page.on('websocket', (socket) =>
        socket.on('framesent', ({ payload }) => {
          if (typeof payload !== 'string') return
          const value = rpc.safeParse(JSON.parse(payload))
          if (value.success && value.data.params?.commandId === 'run.cancel')
            cancelled.push(value.data.params.commandId)
        }),
      )
      await page.goto(base())
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      await page.getByRole('textbox', { name: copy.session.prompt.input, exact: true }).fill('Source A memory draft')
      await page.getByRole('button', { name: copy.session.tools.files, exact: true }).click()
      const dock = page.locator('.hbar-app-react-file-workspace:not(.hbar-app-react-file-workbench)')
      await dock.getByRole('button', { name: filename, exact: true }).click()
      await dock.getByRole('button', { name: copy.files.edit, exact: true }).click()
      await dock.getByRole('textbox', { name: filename, exact: true }).fill('# unsaved editor draft')
      await dock.getByRole('button', { name: copy.files.expandWorkbench, exact: true }).click()
      const workbench = page.getByRole('tab', { name: tabs.workbenchTitle, exact: true })
      const expanded = page.locator('.hbar-app-react-file-workbench')
      await expect(workbench).toHaveAttribute('aria-selected', 'true')
      const row = await beginArchive(page, locale, host.ready.sessionId)
      await row.getByRole('button', { name: copy.shell.archive.confirm, exact: true }).click()
      await expect(page.getByRole('tab', { name: host.ready.sessionTitle, exact: true })).toHaveCount(0)
      await expect(workbench).toHaveAttribute('aria-selected', 'true')
      await page.getByRole('button', { name: copy.shell.archive.dismiss, exact: true }).click()
      for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: width > 900 ? 960 : 844 })
        const sidebar = page.getByRole('complementary', { name: copy.shell.projectsAndSessions, exact: true })
        if (width < 1024 && (await sidebar.isVisible()))
          await page.getByRole('button', { name: copy.shell.hideSidebar, exact: true }).first().click()
        await expect(expanded.getByRole('textbox', { name: filename, exact: true })).toHaveValue(
          '# unsaved editor draft',
        )
        await expect(workbench).toHaveAttribute('aria-selected', 'true')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `${evidence}/workbench-${locale}-${width}.png` })
      }
      expect(await readFile(join(root, filename), 'utf8')).toBe('# original disk\n')
      expect(cancelled).toEqual([])
      expect(
        (
          await createWorkspaceSessionCommandClient(host.client).execute('session.get', {
            sessionId: host.ready.sessionId,
          })
        )?.archived,
      ).toBe(true)
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}

test('external active archive retires its tab observationally; the loaded view stays and Host rejects new submission', async ({
  browser,
}) => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-external-active-archive-'))
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 960 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 44923),
      goalAutoContinue: false,
    })
    const other = await createWorkspaceSessionCommandClient(host.client).execute(
      'session.create',
      { workspaceId: host.ready.workspaceId, title: 'Explicit B — Reload only after user selection' },
      { idempotencyKey: crypto.randomUUID() },
    )
    const copy = getShellCopy('en-US')
    expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    await page.goto(base())
    await page.getByRole('button', { name: copy.shell.openSession(other.title), exact: true }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(other.title)
    await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(host.ready.sessionTitle)
    const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    await prompt.fill('Loaded A remains — 不抢导航')
    await createWorkspaceSessionCommandClient(host.client).execute('session.archive', {
      sessionId: host.ready.sessionId,
      archived: true,
    })
    await page.getByTitle(copy.shell.workspaceActions(host.ready.workspaceName), { exact: true }).click()
    await page
      .getByRole('menuitem', { name: copy.shell.roster.refreshWorkspace(host.ready.workspaceName), exact: true })
      .click()
    await expect(page.getByRole('tab', { name: host.ready.sessionTitle, exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(host.ready.sessionTitle)
    await expectComposerText(prompt, 'Loaded A remains — 不抢导航')
    await expect(
      createRunCommandClient(host.client).execute(
        'run.submit',
        { sessionId: host.ready.sessionId, modelId: 'local-fixture', input: { text: 'must be rejected', images: [] } },
        { idempotencyKey: crypto.randomUUID() },
      ),
    ).rejects.toMatchObject({ code: 'ARCHIVED' })
    await expect(page.getByRole('button', { name: copy.session.prompt.send, exact: true })).toBeDisabled()
    await expect(page.locator('[data-session-execution-access="archived"]')).toBeVisible()
    await page.screenshot({ path: `${evidence}/external-active-boundary-1440.png` })
    await waitSavedEmptyWorkspace(page, host.ready.workspaceId)
    await page.reload()
    await expect(page.getByRole('heading', { name: copy.preSession.hero.title, exact: true })).toBeVisible()
    await expect(page.getByRole('tab', { name: other.title, exact: true })).toHaveAttribute('aria-selected', 'false')
    await page.screenshot({ path: `${evidence}/external-empty-reload-1440.png` })
    await page.getByRole('button', { name: copy.shell.openSession(other.title), exact: true }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(other.title)
    await expect(page.getByRole('tab', { name: other.title, exact: true })).toHaveAttribute('aria-selected', 'true')
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(other.title)
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})

test('archiving selected A preserves empty workspace across reload instead of silently choosing B', async ({
  browser,
}) => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-current-archive-reload-'))
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 960 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 44923),
      sessionCount: 2,
      goalAutoContinue: false,
    })
    const other = (
      await createWorkspaceSessionCommandClient(host.client).execute('session.list', {
        workspaceId: host.ready.workspaceId,
        limit: 10,
      })
    ).items.find((item) => item.id !== host!.ready.sessionId)
    if (!other) throw new Error('Fixture needs a surviving Session distinct from its ready target')
    const copy = getShellCopy('en-US')
    expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    await page.goto(base())
    await page.getByRole('button', { name: copy.shell.openSession(other.title), exact: true }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(other.title)
    await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(host.ready.sessionTitle)
    await page.getByRole('textbox', { name: copy.session.prompt.input, exact: true }).fill('Original A memory draft')
    const row = await beginArchive(page, 'en-US', host.ready.sessionId)
    await row.getByRole('button', { name: copy.shell.archive.confirm, exact: true }).click()
    await expect(page.getByRole('tab', { name: host.ready.sessionTitle, exact: true })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: other.title, exact: true })).toHaveAttribute('aria-selected', 'false')
    await expect(page.getByRole('heading', { name: copy.preSession.hero.title, exact: true })).toBeVisible()
    await waitSavedEmptyWorkspace(page, host.ready.workspaceId)
    await page.reload()
    await expect(page.getByRole('tab', { name: other.title, exact: true })).toHaveAttribute('aria-selected', 'false')
    await expect(page.getByRole('heading', { name: copy.preSession.hero.title, exact: true })).toBeVisible()
    await page.screenshot({ path: `${evidence}/local-current-empty-reload-1440.png` })
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})
