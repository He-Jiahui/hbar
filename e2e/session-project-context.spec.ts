import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createModelCommandClient,
  createRunCommandClient,
  createSessionLaunchTargetReader,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { COMMAND_PROTOCOL_VERSION, createCommandClient } from '@hbar/commands'
import { sessionGitCommands } from '@hbar/contracts/commands/git'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { sessionContextCopy } from '../apps/web/src/session-context-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { removeOwnedTempDirectory } from './support/owned-temp-directory'
import { expectComposerText } from './support/composer-text'

const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 48729}`
const git = (root: string, ...args: string[]) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim()

async function showSidebar(page: Page, locale: ShellLocale) {
  const shell = page.locator('[data-hbar-sidebar-expanded]')
  await expect(shell).toBeAttached()
  const show = page.getByRole('button', { name: getShellCopy(locale).shell.showSidebar, exact: true })
  if ((await shell.getAttribute('data-hbar-sidebar-expanded')) !== 'true') await show.click()
  await expect(shell).toHaveAttribute('data-hbar-sidebar-expanded', 'true')
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`read-only composer context follows real Git and the original session at four widths: ${locale}`, async ({
    browser,
  }, info) => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-session-context-'))
    const secondaryPath = join(root, 'project-B-很长的工程名称')
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      await mkdir(secondaryPath)
      await writeFile(join(secondaryPath, 'entry.md'), '# second project\n')
      git(secondaryPath, 'init')
      git(secondaryPath, 'config', 'user.email', 'fixture@hbar.invalid')
      git(secondaryPath, 'config', 'user.name', 'Fixture')
      git(secondaryPath, 'add', 'entry.md')
      git(secondaryPath, 'commit', '-m', 'secondary fixture')
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 48717),
        goalAutoContinue: false,
        budgetAutoContinue: false,
      })
      const directory = createWorkspaceSessionCommandClient(host.client)
      const secondary = await directory.execute('workspace.create', { path: secondaryPath })
      const secondSession = await directory.execute(
        'session.create',
        {
          workspaceId: secondary.id,
          title: 'Second session — branch belongs here',
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      const models = createModelCommandClient(host.client)
      const runs = createRunCommandClient(host.client)
      const fixture = host
      const targets = createSessionLaunchTargetReader(fixture.client)
      const sessionGit = createCommandClient(sessionGitCommands, {
        execute(commandId, input, options) {
          return fixture.client.call('command.execute', {
            protocol: COMMAND_PROTOCOL_VERSION,
            requestId: options?.requestId ?? crypto.randomUUID(),
            commandId,
            commandVersion: options?.version ?? 1,
            input,
          })
        },
      })
      for (const sessionId of [host.ready.sessionId, secondSession.id]) {
        const currentModel = await models.execute('session.getModel', { sessionId })
        await models.execute(
          'session.setModel',
          { sessionId, modelId: 'local-fixture', baselineRevisions: currentModel.revisions },
          { idempotencyKey: crypto.randomUUID() },
        )
        // Empty sessions correctly show their launch-location controls. Confirm a
        // local fixture run before asserting the read-only project/Git content.
        await runs.execute(
          'run.submit',
          {
            sessionId,
            modelId: 'local-fixture',
            input: { text: 'Establish confirmed project context', images: [], approval: 'deny' },
          },
          { idempotencyKey: crypto.randomUUID() },
        )
        await expect
          .poll(async () =>
            (await fixture.client.call('session.snapshot', { sessionId })).runs.some(
              (run) => run.status === 'completed',
            ),
          )
          .toBe(true)
      }
      const confirmedFirstSession = await directory.execute('session.get', { sessionId: host.ready.sessionId })
      if (!confirmedFirstSession) throw new Error('Missing original session after confirmed fixture run')
      const firstBranch = git(root, 'branch', '--show-current')
      const secondBranch = git(secondaryPath, 'branch', '--show-current')
      const nextBranch = 'feature/context-read-only-with-a-long-branch-name'
      expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const shell = getShellCopy(locale).shell
      const copy = sessionContextCopy(locale)
      await page.goto(`${base()}/apps/web/`)
      await showSidebar(page, locale)
      await page.getByTitle(shell.workspaceActions(host.ready.workspaceName), { exact: true }).waitFor()
      const firstToggle = page.getByRole('treeitem', { name: host.ready.workspaceName, exact: true })
      if ((await firstToggle.getAttribute('aria-expanded')) === 'false') {
        await firstToggle.focus()
        await page.keyboard.press('ArrowRight')
      }
      await expect(firstToggle).toHaveAttribute('aria-expanded', 'true')
      const firstRow = page.getByRole('treeitem', { name: confirmedFirstSession.title, exact: true })
      await firstRow.focus()
      await page.keyboard.press('Enter')
      await expect(firstRow).toHaveAttribute('aria-selected', 'true')
      const firstContext = page.getByRole('group', { name: copy.project(host.ready.workspaceName), exact: true })
      await expect(firstContext.getByTitle(copy.branch(firstBranch), { exact: true })).toBeVisible()

      git(root, 'switch', '-c', nextBranch)
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      await expect(firstContext.getByTitle(copy.branch(nextBranch), { exact: true })).toBeVisible()
      await expect(firstContext.getByTitle(copy.branch(firstBranch), { exact: true })).toHaveCount(0)

      await showSidebar(page, locale)
      const secondaryToggle = page.getByRole('treeitem', { name: secondary.name, exact: true })
      if ((await secondaryToggle.getAttribute('aria-expanded')) === 'false') {
        await secondaryToggle.focus()
        await page.keyboard.press('ArrowRight')
      }
      await expect(secondaryToggle).toHaveAttribute('aria-expanded', 'true')
      const secondRow = page.getByRole('treeitem', { name: secondSession.title, exact: true })
      await secondRow.focus()
      await page.keyboard.press('Enter')
      const secondaryContext = page.getByRole('group', { name: copy.project(secondary.name), exact: true })
      await expect(secondaryContext.getByTitle(copy.branch(secondBranch), { exact: true })).toBeVisible()
      await expect(secondaryContext.getByTitle(copy.branch(nextBranch), { exact: true })).toHaveCount(0)
      await showSidebar(page, locale)
      await firstRow.focus()
      await page.keyboard.press('Enter')
      await expect(firstContext.getByTitle(copy.branch(nextBranch), { exact: true })).toBeVisible()

      const afterRunBranch = 'feature/branch-after-a-real-completed-run'
      git(root, 'switch', '-c', afterRunBranch)
      const prompt = page.getByRole('textbox', { name: getShellCopy(locale).session.prompt.input, exact: true })
      await prompt.click()
      await expect(prompt).toBeFocused()
      await page.keyboard.insertText('Confirm this run without changing the project context')
      await expectComposerText(prompt, 'Confirm this run without changing the project context')
      await page.getByRole('button', { name: getShellCopy(locale).session.prompt.send, exact: true }).click()
      await expect(page.getByText('Received: Confirm this run without changing the project context')).toBeVisible()
      await expect
        .poll(
          async () =>
            (await fixture.client.call('session.snapshot', { sessionId: fixture.ready.sessionId })).runs.filter(
              (run) => run.status === 'completed',
            ).length,
        )
        .toBe(2)
      const currentTarget = await targets.read(fixture.ready.sessionId)
      const ownedGit = await sessionGit.execute('sessionGit.info', {
        sessionId: currentTarget.sessionId,
        workspaceId: currentTarget.workspaceId,
        expectedRevision: currentTarget.revision,
      })
      await writeFile(
        info.outputPath('owned-branch-facts.json'),
        JSON.stringify({
          sessionId: currentTarget.sessionId,
          workspaceId: currentTarget.workspaceId,
          revision: currentTarget.revision,
          branch: ownedGit.branch,
          repositoryBranch: git(root, 'branch', '--show-current'),
          displayedBranch: await firstContext.locator('.hbar-session-project-context-branch bdi').allTextContents(),
        }),
      )
      if (!ownedGit.branch) throw new Error('The confirmed session fixture has no branch')
      const confirmedBranch = ownedGit.branch
      await expect(firstContext.getByTitle(copy.branch(confirmedBranch), { exact: true })).toBeVisible()
      await expect(firstContext.getByRole('button')).toHaveCount(0)

      for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: width > 1000 ? 960 : 844 })
        await expect(firstContext).toBeVisible()
        await expect(
          page.getByRole('group', { name: copy.project(host.ready.workspaceName), exact: true }),
        ).toHaveCount(1)
        const toolbar = page.locator('.hbar-session-project-context-toolbar')
        const below = page.locator('.hbar-session-project-context-below')
        if (width >= 900) {
          await expect(toolbar).toBeVisible()
          await expect(below).toBeHidden()
          const permissionBox = await page.locator('.hbar-composer-permission-trigger').boundingBox()
          const contextBox = await toolbar.boundingBox()
          expect(
            Math.abs(
              (permissionBox ? permissionBox.y + permissionBox.height / 2 : 0) -
                (contextBox ? contextBox.y + contextBox.height / 2 : 0),
            ),
          ).toBeLessThanOrEqual(8)
        } else {
          await expect(toolbar).toBeHidden()
          await expect(below).toBeVisible()
        }
        for (const selector of ['.hbar-composer-permission-trigger', '.hbar-composer-model-trigger']) {
          const button = page.locator(selector)
          await expect(button).toBeVisible()
          const controlBox = await button.boundingBox()
          expect(controlBox?.x).toBeGreaterThanOrEqual(0)
          expect((controlBox?.x ?? 0) + (controlBox?.width ?? 0)).toBeLessThanOrEqual(width + 1)
        }
        await expect(
          page.getByRole('button', { name: getShellCopy(locale).session.prompt.send, exact: true }),
        ).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        const box = await firstContext.getByTitle(copy.branch(confirmedBranch), { exact: true }).boundingBox()
        expect(box?.width).toBeGreaterThanOrEqual(width >= 900 ? 70 : 100)
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width + 1)
        await page.screenshot({ path: `artifacts/session-project-context/context-${locale}-${width}.png` })
        if (width === 1440 || width === 320) {
          for (const selector of ['.hbar-composer-permission-trigger', '.hbar-composer-model-trigger']) {
            const trigger = page.locator(selector)
            await trigger.click()
            await expect(trigger).toHaveAttribute('aria-expanded', 'true')
            await page.keyboard.press('Escape')
            await expect(trigger).toHaveAttribute('aria-expanded', 'false')
          }
          await page.evaluate(() => {
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
          })
        }
      }
      await stopWebSessionHost(host)
      host = undefined
      await expect(firstContext.getByText(copy.disconnected, { exact: true })).toBeVisible()
      await expect(firstContext.getByTitle(copy.branch(confirmedBranch), { exact: true })).toHaveCount(0)
      expect(errors).toEqual([])
    } finally {
      try {
        await context.close()
      } finally {
        try {
          if (host) await stopWebSessionHost(host)
        } finally {
          await removeOwnedTempDirectory(root, 'hbar-session-context-')
        }
      }
    }
  })
}
