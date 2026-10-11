import { expect, test } from '@playwright/test'
import { createRunCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
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
        budgetAutoContinue: false,
      })
      // Keep a stable, narrowed reference for callbacks that run after the
      // assignment. TypeScript cannot retain the narrowing of the mutable
      // outer `host` variable inside the polling callback.
      const activeHost = host
      const branch = execFileSync('git', ['branch', '--show-current'], {
        cwd: root,
        encoding: 'utf8',
        windowsHide: true,
      }).trim()
      expect(branch).not.toBe('')
      const directory = createWorkspaceSessionCommandClient(activeHost.client)
      const shortName = 'Location fixture'
      const longName = locale === 'zh-CN' ? `${'长期工程名称'.repeat(13)}甲乙` : `${'Long workspace '.repeat(5)}ABCDE`
      let displayName = shortName
      const initialNames = await directory.execute('workspaceDisplayNames.get', {})
      await directory.execute(
        'workspaceDisplayNames.apply',
        {
          expectedRevision: initialNames.revision,
          workspaceId: activeHost.ready.workspaceId,
          expectedDisplayName:
            initialNames.entries.find((entry) => entry.workspaceId === activeHost.ready.workspaceId)?.displayName ??
            null,
          displayName,
        },
        { idempotencyKey: crypto.randomUUID() },
      )

      expect(
        (await context.request.post(`${base()}/auth/token`, { data: { token: activeHost.ready.token } })).ok(),
      ).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const copy = getShellCopy(locale)
      const contextCopy = sessionContextCopy(locale)
      await page.goto(`${base()}/apps/web/`)
      await page.getByTitle(copy.shell.workspaceActions(displayName), { exact: true }).waitFor()
      const expand = page.getByRole('treeitem', { expanded: false, name: displayName, exact: true })
      if (await expand.isVisible()) await expand.click()
      await page.getByRole('treeitem', { name: activeHost.ready.sessionTitle, exact: true }).click()
      await expect(page.locator('html')).toHaveAttribute('data-lumen-mode', colorScheme)

      // Empty sessions expose the launch-location picker. Establish one local
      // fixture run before checking the confirmed Git context and branch target.
      const runs = createRunCommandClient(activeHost.client)
      const submitted = await runs.execute(
        'run.submit',
        {
          sessionId: activeHost.ready.sessionId,
          modelId: 'local-fixture',
          input: { text: 'Confirm the active composer location', images: [], approval: 'deny' },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: submitted.operationId })).status)
        .toBe('completed')
      expect(
        (await activeHost.client.call('session.snapshot', { sessionId: activeHost.ready.sessionId })).runs,
      ).toHaveLength(1)

      let project = page.getByRole('group', {
        name: contextCopy.project(displayName),
        exact: true,
      })
      await expect(project).toBeVisible()
      await expect(project.getByTitle(contextCopy.branch(branch), { exact: true })).toBeVisible()
      await expect(project.getByRole('button', { name: contextCopy.branch(branch), exact: true })).toHaveAttribute(
        'aria-haspopup',
        'dialog',
      )

      const toolbarContext = page.locator('.hbar-session-project-context-toolbar')
      const belowContext = page.locator('.hbar-session-project-context-below')
      const controls = page.locator('.hbar-session-composer-controls')
      const permission = controls.locator('.hbar-composer-permission-picker')
      const intent = controls.locator('.hbar-composer-intents')
      const usage = page.locator('.hbar-session-usage-control')
      const modelPicker = page.locator('.hbar-composer-model-picker')
      const send = page.getByRole('button', { name: copy.session.prompt.send, exact: true })
      const editor = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const intentLabels = copy.session.intent
      const addMenuTrigger = page.getByRole('button', { name: copy.session.addMenu.open, exact: true })
      const addMenu = page.getByRole('group', { name: copy.session.addMenu.menu, exact: true })
      const actionsDock = page.locator('[data-toolbar-item="actions"]')
      const modelDock = page.locator('[data-toolbar-item="model"]')
      const overflowTrigger = page.getByRole('button', { name: copy.session.addMenu.menu, exact: true })
      const overflow = page.getByRole('dialog', { name: copy.session.addMenu.menu, exact: true })
      // Measured controls may overflow at desktop widths with a long project name.
      // The project must remain directly visible while More is closed in every case.
      const viewports = [
        { name: 'desktop-1920x900', width: 1920, height: 900, projectName: shortName },
        { name: 'desktop-1440x900', width: 1440, height: 900, projectName: shortName },
        { name: 'desktop-900x900', width: 900, height: 900, projectName: shortName },
        { name: 'narrow-390x844', width: 390, height: 844, projectName: shortName },
        { name: 'narrow-320x844', width: 320, height: 844, projectName: shortName },
        { name: 'long-project-1440x900', width: 1440, height: 900, projectName: longName },
        { name: 'long-project-320x844', width: 320, height: 844, projectName: longName },
      ] as const

      let goalSelected = false
      const placements: Array<{
        viewport: string
        stage: 'default' | 'after-interactions'
        context: 'inline' | 'below'
        actionsOverflowed: boolean
        modelOverflowed: boolean
        goalSelected: boolean
      }> = []
      for (const viewport of viewports) {
        await editor.focus()
        await expect(editor).toBeFocused()
        if (displayName !== viewport.projectName) {
          const names = await directory.execute('workspaceDisplayNames.get', {})
          const receipt = await directory.execute(
            'workspaceDisplayNames.apply',
            {
              expectedRevision: names.revision,
              workspaceId: activeHost.ready.workspaceId,
              expectedDisplayName: displayName,
              displayName: viewport.projectName,
            },
            { idempotencyKey: crypto.randomUUID() },
          )
          expect(receipt.changed).toBe(true)
          displayName = viewport.projectName
          project = page.getByRole('group', { name: contextCopy.project(displayName), exact: true })
        }
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await page.evaluate(
          () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
        )
        // Resizing can reveal a focused overflow control. Close that real surface
        // before checking the default, closed-menu project presentation.
        if ((await overflowTrigger.isVisible()) && (await overflowTrigger.getAttribute('aria-expanded')) === 'true') {
          await page.keyboard.press('Escape')
          await editor.focus()
        }
        await expect(project).toBeVisible()
        await expect(project.getByTitle(contextCopy.branch(branch), { exact: true })).toBeVisible()
        await expect(project.getByRole('button', { name: contextCopy.branch(branch), exact: true })).toHaveCount(1)
        await expect(send).toBeVisible()

        const actionsOverflowed = await actionsDock.evaluate((element) => element.hasAttribute('hidden'))
        const modelOverflowed = await modelDock.evaluate((element) => element.hasAttribute('hidden'))
        if (actionsOverflowed || modelOverflowed) {
          await expect(overflowTrigger).toBeVisible()
          await expect(overflowTrigger).toHaveAttribute('aria-expanded', 'false')
          await expect(overflow).toBeHidden()
          await expect(project).toBeVisible()
          await overflowTrigger.click()
          await expect(overflow).toBeVisible()
          await expect(project).toBeVisible()
          await expect(project).toHaveCount(1)
          if (actionsOverflowed) await expect(permission).toBeVisible()
          if (modelOverflowed) await expect(modelPicker).toBeVisible()
          await page.keyboard.press('Escape')
          await editor.focus()
          await expect(editor).toBeFocused()
          await expect(overflow).toBeHidden()
          await expect(project).toBeVisible()
        }
        if (!modelOverflowed) await expect(modelPicker).toBeVisible()

        if (await toolbarContext.isVisible()) {
          expect(actionsOverflowed).toBe(false)
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

          if (viewport.name === 'desktop-1920x900') {
            // Keep the verified default state: preparing a Goal may legitimately
            // move the larger controls group into overflow at the same width.
            placements.push({
              viewport: viewport.name,
              stage: 'default',
              context: 'inline',
              actionsOverflowed,
              modelOverflowed,
              goalSelected,
            })
            // Default Goal is portalled into the closed More-actions menu, so it is intentionally
            // excluded from the default visible-order check above.
            await page.screenshot({
              path: join(screenshotDirectory, 'desktop-1920x900-default.png'),
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
              const goalOverflowed = await actionsDock.evaluate((element) => element.hasAttribute('hidden'))
              if (goalOverflowed && !(await overflow.isVisible())) await overflowTrigger.click()
              await expect(intent).toBeVisible()
              await expect(intent.getByRole('button', { name: intentLabels.cancelGoal, exact: true })).toHaveAttribute(
                'aria-pressed',
                'true',
              )
              goalSelected = true
              if (goalOverflowed) {
                if (await overflow.isVisible()) await page.keyboard.press('Escape')
                await editor.focus()
                await expect(overflow).toBeHidden()
                await expect(project).toBeVisible()
              }
            }
          }

          if (goalSelected && (await toolbarContext.isVisible())) {
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

        placements.push({
          viewport: viewport.name,
          stage: 'after-interactions',
          context: (await toolbarContext.isVisible()) ? 'inline' : 'below',
          actionsOverflowed: await actionsDock.evaluate((element) => element.hasAttribute('hidden')),
          modelOverflowed: await modelDock.evaluate((element) => element.hasAttribute('hidden')),
          goalSelected,
        })

        const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
        expect(documentWidth).toBeLessThanOrEqual(viewport.width + 1)
        await page.screenshot({
          path: join(screenshotDirectory, `${viewport.name}.png`),
          fullPage: true,
        })
      }
      expect(placements.some((placement) => placement.context === 'inline')).toBe(true)
      expect(placements.some((placement) => placement.context === 'below' && placement.actionsOverflowed)).toBe(true)
      expect(goalSelected).toBe(true)
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
            placements,
            pageErrors: errors,
            boundaries: {
              nativeDesktop: false,
              messagesLoaded: true,
              sdkFixtureRunSubmitted: true,
              sendClicked: false,
              hostGoalCreated: false,
              launchSelectionChanged: false,
              temporaryWorkspaceDisplayNameChanged: true,
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
