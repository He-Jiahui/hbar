import { expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PlaywrightUiHarness } from './support/playwright-ui-harness.ts'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host.ts'

async function closeCommandCatalog(page: import('@playwright/test').Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Command catalog' })
  for (let depth = 0; depth < 3 && (await dialog.isVisible()); depth += 1) await page.keyboard.press('Escape')
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Close command catalog' }).click()
  await expect(dialog).toBeHidden()
}

test('executes shell directory writes against the real Host', async ({ browser }) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-production-shell-'))
  const artifactDirectory = 'artifacts/production-ui/web/shell-directory'
  await rm(artifactDirectory, { recursive: true, force: true })
  let host: WebSessionHost | undefined
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 960 } })
  try {
    host = await startWebSessionHost({ root })
    const authentication = await context.request.post(
      `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}/auth/token`,
      { data: { token: host.ready.token } },
    )
    expect(authentication.ok()).toBe(true)
    const page = await context.newPage()
    const harness = new PlaywrightUiHarness({
      page,
      platform: 'web',
      artifactDirectory,
      locale: 'en-US',
      theme: 'system',
    })
    await page.goto(`http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`)
    await expect(page.locator('footer')).toContainText('Connected')
    const workspaceToggle = page.getByRole('button', { name: `Collapse project ${host.ready.workspaceName}` })

    await harness.exercise(
      'shell.workspace.collapse',
      { role: 'button', name: `Collapse project ${host.ready.workspaceName}`, description: 'workspace disclosure' },
      async () => {
        await workspaceToggle.click()
        const collapsed = page.getByRole('button', { name: `Expand project ${host!.ready.workspaceName}` })
        await expect(collapsed).toHaveAttribute('aria-expanded', 'false')
        return { ui: [{ description: 'workspace row is collapsed', passed: await collapsed.isVisible() }] }
      },
    )

    await harness.exercise(
      'shell.workspace.expand',
      { role: 'button', name: `Expand project ${host.ready.workspaceName}`, description: 'workspace disclosure' },
      async () => {
        const expand = page.getByRole('button', { name: `Expand project ${host!.ready.workspaceName}` })
        await expand.click()
        const row = page.getByRole('button', { name: `Open session ${host!.ready.sessionTitle}` })
        await expect(row).toBeVisible()
        return { ui: [{ description: 'workspace sessions are visible', passed: await row.isVisible() }] }
      },
    )

    await harness.exercise(
      'shell.session.select',
      { role: 'button', name: `Open session ${host.ready.sessionTitle}`, description: 'session row' },
      async () => {
        const row = page.getByRole('button', { name: `Open session ${host!.ready.sessionTitle}` })
        await row.click()
        await expect(row).toHaveAttribute('aria-current', 'page')
        const session = await host!.client.call('session.get', { sessionId: host!.ready.sessionId })
        return {
          ui: [
            {
              description: 'selected session heading is visible',
              passed: await page.getByRole('heading', { level: 1, name: host!.ready.sessionTitle }).isVisible(),
            },
          ],
          host: [
            { description: 'Host returns the selected session id', passed: session?.id === host!.ready.sessionId },
          ],
          hostFact: session,
        }
      },
    )

    await harness.exercise(
      'shell.session.actions.open',
      { role: 'button', name: `Actions for ${host.ready.sessionTitle}`, description: 'session row actions' },
      async () => {
        const trigger = page.getByTitle(`Actions for ${host!.ready.sessionTitle}`)
        await trigger.click()
        const menu = page.getByRole('menu', { name: `Actions for ${host!.ready.sessionTitle}` })
        await expect(menu).toBeVisible()
        return {
          ui: [
            {
              description: 'rename action is visible',
              passed: await menu.getByRole('menuitem', { name: 'Rename' }).isVisible(),
            },
            {
              description: 'archive action is visible',
              passed: await menu.getByRole('menuitem', { name: 'Archive' }).isVisible(),
            },
          ],
        }
      },
    )

    const renamedTitle = 'Production interaction session'
    await harness.exercise(
      'shell.session.rename',
      { role: 'menuitem', name: 'Rename', description: 'rename selected session' },
      async () => {
        const menu = page.getByRole('menu', { name: `Actions for ${host!.ready.sessionTitle}` })
        await menu.getByRole('menuitem', { name: 'Rename' }).click()
        const dialog = page.getByRole('dialog', { name: 'Command catalog' })
        await dialog.getByRole('textbox', { name: 'Title' }).fill(renamedTitle)
        await dialog.getByRole('button', { name: 'Execute command' }).click()
        await expect(dialog.getByText('Command succeeded')).toBeVisible()
        const session = await host!.client.call('session.get', { sessionId: host!.ready.sessionId })
        return {
          ui: [
            {
              description: 'active session heading uses the committed title',
              passed: await page.getByRole('heading', { level: 1, name: renamedTitle }).isVisible(),
            },
            {
              description: 'session row uses the committed title',
              passed: await page.getByRole('button', { name: `Open session ${renamedTitle}` }).isVisible(),
            },
          ],
          host: [
            { description: 'Host session title matches the submitted title', passed: session?.title === renamedTitle },
          ],
          hostFact: session,
        }
      },
    )
    await closeCommandCatalog(page)

    const createdTitle = 'Created through production UI'
    await harness.exercise(
      'shell.session.create-global',
      { role: 'button', name: 'New session', description: 'global new session action' },
      async () => {
        await page.getByRole('button', { name: 'New session', exact: true }).click()
        const dialog = page.getByRole('dialog', { name: 'Command catalog' })
        await dialog.getByRole('textbox', { name: 'Title' }).fill(createdTitle)
        await dialog.getByRole('button', { name: 'Execute command' }).click()
        await expect(dialog).toBeHidden()
        const matches = await host!.client.call('session.list', {
          workspaceId: host!.ready.workspaceId,
          title: createdTitle,
          limit: 2,
        })
        const created = matches.items[0]
        return {
          ui: [
            {
              description: 'created session is selected',
              passed: await page.getByRole('heading', { level: 1, name: createdTitle }).isVisible(),
            },
            {
              description: 'created session row is visible',
              passed: await page.getByRole('button', { name: `Open session ${createdTitle}` }).isVisible(),
            },
          ],
          host: [
            {
              description: 'Host lists exactly one created session in the target workspace',
              passed: matches.items.length === 1 && created?.workspaceId === host!.ready.workspaceId,
            },
          ],
          hostFact: matches,
        }
      },
    )

    await harness.exercise(
      'shell.session.archive',
      { role: 'menuitem', name: 'Archive', description: 'archive current session' },
      async () => {
        await page.getByTitle(`Actions for ${createdTitle}`).click()
        await page
          .getByRole('menu', { name: `Actions for ${createdTitle}` })
          .getByRole('menuitem', { name: 'Archive' })
          .click()
        const dialog = page.getByRole('dialog', { name: 'Command catalog' })
        await dialog.getByRole('button', { name: 'Execute command' }).click()
        await expect(dialog).toBeHidden()
        const all = await host!.client.call('session.list', {
          workspaceId: host!.ready.workspaceId,
          includeArchived: true,
          limit: 100,
        })
        const archived = all.items.find((session) => session.title === createdTitle)
        return {
          ui: [
            {
              description: 'archived session row is absent',
              passed: !(await page.getByRole('button', { name: `Open session ${createdTitle}` }).isVisible()),
            },
            {
              description: 'archiving current session clears selection',
              passed: await page
                .getByRole('heading', { level: 1, name: getShellCopy('en-US').preSession.hero.title })
                .isVisible(),
            },
          ],
          host: [{ description: 'Host marks the exact created session archived', passed: archived?.archived === true }],
          hostFact: archived,
        }
      },
    )

    await harness.writeReport({ requireComplete: false })
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})
