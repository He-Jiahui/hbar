import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { sessionContextCopy } from '../apps/web/src/session-context-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const prefix = 'hbar-composer-active-location-order-'
const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 48729}`
const colorScheme = process.env.HBAR_E2E_COMPOSER_SCHEME ?? 'light'
if (colorScheme !== 'light' && colorScheme !== 'dark')
  throw new Error('Composer capture color scheme must be light or dark')

async function removeOwnedFixture(root: string) {
  const absoluteRoot = resolve(root)
  if (dirname(absoluteRoot) !== resolve(tmpdir()) || !basename(absoluteRoot).startsWith(prefix))
    throw new Error('Refusing to remove an unowned composer-location E2E directory')
  await rm(absoluteRoot, { recursive: true, force: true })
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`active project and branch context keeps its composer order at responsive widths (${locale})`, async ({
    browser,
  }) => {
    test.setTimeout(60_000)
    const root = await mkdtemp(join(tmpdir(), prefix))
    const context = await browser.newContext({ locale, colorScheme, viewport: { width: 1440, height: 900 } })
    const screenshotDirectory = resolve(
      'artifacts/composer-active-location-order',
      colorScheme === 'dark' ? 'dark' : '',
      locale,
    )
    let host: WebSessionHost | undefined
    try {
      await mkdir(screenshotDirectory, { recursive: true })
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_ACTIVE_LOCATION_HOST_PORT ?? (locale === 'en-US' ? 48739 : 48740)),
      })
      const branch = execFileSync('git', ['branch', '--show-current'], {
        cwd: root,
        encoding: 'utf8',
        windowsHide: true,
      }).trim()
      expect(branch).not.toBe('')

      expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const copy = getShellCopy(locale)
      const contextCopy = sessionContextCopy(locale)
      await page.goto(`${base()}/apps/web/`)
      await page.getByTitle(copy.shell.workspaceActions(host.ready.workspaceName), { exact: true }).waitFor()
      const expand = page.getByRole('button', {
        name: copy.shell.expandWorkspace(host.ready.workspaceName),
        exact: true,
      })
      if (await expand.isVisible()) await expand.click()
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      await expect(page.locator('html')).toHaveAttribute('data-lumen-mode', colorScheme)

      const project = page.getByRole('group', {
        name: contextCopy.project(host.ready.workspaceName),
        exact: true,
      })
      await expect(project).toBeVisible()
      await expect(project.getByTitle(contextCopy.branch(branch), { exact: true })).toBeVisible()
      await expect(project.locator('button')).toHaveCount(0)

      const toolbarContext = page.locator('.hbar-session-project-context-toolbar')
      const belowContext = page.locator('.hbar-session-project-context-below')
      const controls = page.locator('.hbar-session-composer-controls')
      const permission = controls.locator('.hbar-composer-permission-picker')
      const intent = controls.locator('.hbar-composer-intents')
      const usage = page.locator('.hbar-session-usage-control')
      const modelPicker = page.locator('.hbar-composer-model-picker')
      const send = page.getByRole('button', { name: copy.session.prompt.send, exact: true })
      const intentLabels = copy.session.intent
      const addMenuTrigger = page.getByRole('button', { name: copy.session.addMenu.open, exact: true })
      const addMenu = page.getByRole('group', { name: copy.session.addMenu.menu, exact: true })
      // Desktop order follows the verified full-ChatInput CC capture; narrow widths are regression-only
      // because no matching narrow active Git-chip capture is available.
      const viewports = [
        { name: 'desktop-1440x900', width: 1440, height: 900, wide: true },
        { name: 'desktop-900x900', width: 900, height: 900, wide: true },
        { name: 'narrow-390x844', width: 390, height: 844, wide: false },
        { name: 'narrow-320x844', width: 320, height: 844, wide: false },
      ] as const

      let goalSelected = false
      for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await expect(project).toBeVisible()
        await expect(project.getByTitle(contextCopy.branch(branch), { exact: true })).toBeVisible()
        await expect(project.locator('button')).toHaveCount(0)
        await expect(modelPicker).toBeVisible()
        await expect(send).toBeVisible()

        if (viewport.wide) {
          await expect(permission).toBeVisible()
          await expect(usage).toBeVisible()
          await expect(toolbarContext).toBeVisible()
          await expect(controls.locator('.hbar-session-project-context-toolbar')).toHaveCount(1)
          await expect(
            page.locator('.hbar-session-composer-options .hbar-session-project-context-toolbar'),
          ).toHaveCount(0)
          await expect(belowContext).toBeHidden()
          const placement = await page.evaluate(() => {
            const leading = document.querySelector('.hbar-session-composer-controls')
            const contextChip = leading?.querySelector('.hbar-session-project-context-toolbar')
            const permissionPicker = leading?.querySelector('.hbar-composer-permission-picker')
            const usageControl = document.querySelector('.hbar-session-usage-control')
            const follows = (before: Element | null | undefined, after: Element | null | undefined) =>
              Boolean(
                before && after && (before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
              )
            return {
              contextInLeadingControls: Boolean(contextChip && leading?.contains(contextChip)),
              followsApprovalAndPlan: Boolean(permissionPicker && follows(permissionPicker, contextChip)),
              precedesUsage: follows(contextChip, usageControl),
            }
          })
          expect(placement).toEqual({
            contextInLeadingControls: true,
            followsApprovalAndPlan: true,
            precedesUsage: true,
          })

          if (viewport.name === 'desktop-1440x900') {
            // Default Goal is portalled into the closed More-actions menu, so it is intentionally
            // excluded from the default visible-order check above.
            await page.screenshot({
              path: join(screenshotDirectory, 'desktop-1440x900-default.png'),
              fullPage: true,
            })
            await addMenuTrigger.click()
            await expect(addMenu).toBeVisible()
            const goalChoice = addMenu.getByRole('button', { name: intentLabels.goalMenu, exact: true })
            await expect(goalChoice).toBeVisible()
            const goalIsBlocked =
              !(await goalChoice.isEnabled()) || (await goalChoice.getAttribute('aria-haspopup')) === 'dialog'
            if (goalIsBlocked) {
              test.info().annotations.push({
                type: 'goal-placement-evidence',
                description:
                  'The local Host fixture blocks Goal intent; wide order evidence covers visible default controls only.',
              })
              await page.keyboard.press('Escape')
              await expect(addMenu).toBeHidden()
            } else {
              await goalChoice.click()
              await expect(addMenu).toBeHidden()
              await expect(intent).toBeVisible()
              await expect(intent.getByRole('button', { name: intentLabels.cancelGoal, exact: true })).toHaveAttribute(
                'aria-pressed',
                'true',
              )
              goalSelected = true
            }
          }

          if (goalSelected) {
            await expect(intent).toBeVisible()
            await expect(intent.getByRole('button', { name: intentLabels.cancelGoal, exact: true })).toHaveAttribute(
              'aria-pressed',
              'true',
            )
            const activePlacement = await page.evaluate(() => {
              const leading = document.querySelector('.hbar-session-composer-controls')
              const contextChip = leading?.querySelector('.hbar-session-project-context-toolbar')
              const permissionPicker = leading?.querySelector('.hbar-composer-permission-picker')
              const goalControl = leading?.querySelector('.hbar-composer-intents')
              const usageControl = document.querySelector('.hbar-session-usage-control')
              const follows = (before: Element | null | undefined, after: Element | null | undefined) =>
                Boolean(
                  before && after && (before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
                )
              return {
                followsApprovalAndPlan: Boolean(permissionPicker && follows(permissionPicker, contextChip)),
                goalFollowsContext: follows(contextChip, goalControl),
                goalPrecedesUsage: follows(goalControl, usageControl),
              }
            })
            expect(activePlacement).toEqual({
              followsApprovalAndPlan: true,
              goalFollowsContext: true,
              goalPrecedesUsage: true,
            })
          }
        } else {
          await expect(toolbarContext).toBeHidden()
          await expect(belowContext).toBeVisible()
        }

        const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
        expect(documentWidth).toBeLessThanOrEqual(viewport.width + 1)
        await page.screenshot({
          path: join(screenshotDirectory, `${viewport.name}.png`),
          fullPage: true,
        })
      }
      expect(errors).toEqual([])
      await writeFile(
        join(screenshotDirectory, 'capture-metadata.json'),
        JSON.stringify(
          {
            capturedAt: new Date().toISOString(),
            source: 'production Web with an owned temporary Host and local-fixture model',
            buildSourceCommit: process.env.HBAR_E2E_CAPTURE_BUILD_COMMIT ?? null,
            locale,
            colorScheme,
            actualLumenMode: await page.locator('html').getAttribute('data-lumen-mode'),
            browserVersion: browser.version(),
            goalSelected,
            viewports,
            pageErrors: errors,
            boundaries: {
              nativeDesktop: false,
              messagesLoaded: false,
              sendClicked: false,
              hostGoalCreated: false,
              launchSelectionChanged: false,
              userPreferencesChanged: false,
              narrowReferenceParity: false,
            },
          },
          null,
          2,
        ),
      )
    } finally {
      try {
        await context.close()
      } finally {
        try {
          if (host) await stopWebSessionHost(host)
        } finally {
          await removeOwnedFixture(root)
        }
      }
    }
  })
}
