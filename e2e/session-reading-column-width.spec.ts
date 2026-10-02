import { expect, test, type Page } from '@playwright/test'
import { createGoalPlanCommandClient, createRunCommandClient } from '@hbar/client'
import { basename, dirname, join, resolve } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { expectComposerText } from './support/composer-text'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { sessionContextCopy } from '../apps/web/src/session-context-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const prefix = 'hbar-session-reading-column-long-workspace-'
const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`

async function removeOwnedFixture(root: string): Promise<void> {
  const absoluteRoot = resolve(root)
  if (dirname(absoluteRoot) !== resolve(tmpdir()) || !basename(absoluteRoot).startsWith(prefix))
    throw new Error('Refusing to remove an unowned session-reading-column E2E directory')
  await rm(absoluteRoot, { recursive: true, force: true })
}

async function readColumnGeometry(page: Page) {
  return page.evaluate(() => {
    const content = document.querySelector<HTMLElement>('.hbar-app-react-session-main .lumen-conversation-content')
    const surface = document.querySelector<HTMLElement>('.hbar-app-react-session-footer .lumen-prompt-composer-surface')
    if (!content || !surface) return null
    const contentRect = content.getBoundingClientRect()
    const surfaceRect = surface.getBoundingClientRect()
    const contentStyle = getComputedStyle(content)
    const contentPaddingStart = Number.parseFloat(contentStyle.paddingInlineStart)
    const contentPaddingEnd = Number.parseFloat(contentStyle.paddingInlineEnd)
    const rootRem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      rootRem,
      contentOuterWidth: contentRect.width,
      contentInnerLeft: contentRect.left + contentPaddingStart,
      contentInnerRight: contentRect.right - contentPaddingEnd,
      contentInnerWidth: contentRect.width - contentPaddingStart - contentPaddingEnd,
      surfaceLeft: surfaceRect.left,
      surfaceRight: surfaceRect.right,
      surfaceWidth: surfaceRect.width,
    }
  })
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`active session messages and composer share a responsive reading column (${locale})`, async ({
    browser,
  }, info) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), prefix))
    const context = await browser.newContext({
      locale,
      colorScheme: 'dark',
      viewport: { width: 1440, height: 900 },
    })
    let host: WebSessionHost | undefined
    try {
      const fixtureHost = await startWebSessionHost({
        root,
        // The production Vite preview proxies /auth, /api, and /rpc to this
        // host port; use its shared configured endpoint for the serial locales.
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
      })
      host = fixtureHost
      expect(fixtureHost.ready.workspaceName.length).toBeGreaterThanOrEqual(40)

      const sessionId = fixtureHost.ready.sessionId
      const runs = createRunCommandClient(fixtureHost.client)
      const goals = createGoalPlanCommandClient(fixtureHost.client)
      await runs.execute(
        'run.submit',
        { sessionId, modelId: 'local-fixture', input: { text: '/demo', images: [] } },
        { idempotencyKey: `reading-column-demo-${locale}` },
      )
      await expect
        .poll(
          async () => {
            const snapshot = await fixtureHost.client.call('session.snapshot', { sessionId })
            return snapshot.messages.some(
              (message) =>
                message.role === 'assistant' &&
                message.content.some(
                  (block) => block.type === 'text' && block.text.includes('const session = await client.call'),
                ),
            )
          },
          { timeout: 30_000 },
        )
        .toBe(true)

      const planStep = 'Confirm the session reading column'
      await runs.execute(
        'run.submit',
        {
          sessionId,
          modelId: 'local-fixture',
          input: {
            text: `/tool update_plan ${JSON.stringify({ plan: [{ step: planStep, status: 'in_progress' }] })}`,
            images: [],
          },
        },
        { idempotencyKey: `reading-column-tool-${locale}` },
      )
      await expect
        .poll(async () => (await goals.execute('plan.get', { sessionId }))?.plan[0]?.step, { timeout: 30_000 })
        .toBe(planStep)
      const currentSession = await fixtureHost.client.call('session.get', { sessionId })
      if (!currentSession) throw new Error('The owned reading-column session disappeared before UI verification')

      const page = await context.newPage()
      page.setDefaultTimeout(15_000)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const copy = getShellCopy(locale)
      const contextCopy = sessionContextCopy(locale)
      expect(
        (
          await context.request.post(`${base()}/auth/token`, {
            data: { token: fixtureHost.ready.token },
          })
        ).ok(),
      ).toBe(true)
      await page.goto(`${base()}/apps/web/`)
      await expect(page.locator('html')).toHaveAttribute('data-lumen-mode', 'dark')

      await page.getByTitle(copy.shell.workspaceActions(fixtureHost.ready.workspaceName), { exact: true }).waitFor()
      const expand = page.getByRole('button', {
        name: copy.shell.expandWorkspace(fixtureHost.ready.workspaceName),
        exact: true,
      })
      if (await expand.isVisible()) await expand.click()
      await page.getByRole('button', { name: copy.shell.openSession(currentSession.title), exact: true }).click()

      const composer = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await expect(composer).toBeVisible()
      const messages = page.locator('.lumen-message-transcript')
      await expect(messages.first()).toBeVisible()
      await expect(
        page.locator('.hbar-message-code-body').filter({ hasText: 'const session = await client.call' }),
      ).toBeVisible()
      await expect(page.locator('.hbar-session-tool').first()).toBeVisible()

      const addMenuTrigger = page.getByRole('button', { name: copy.session.addMenu.open, exact: true })
      const addMenu = page.getByRole('group', { name: copy.session.addMenu.menu, exact: true })
      await addMenuTrigger.click()
      await expect(addMenu).toBeVisible()
      const goalChoice = addMenu.getByRole('button', { name: copy.session.intent.goalMenu, exact: true })
      await expect(goalChoice).toBeEnabled()
      await goalChoice.click()
      await expect(addMenu).toBeHidden()
      const goalControl = page.locator('.hbar-composer-intents')
      await expect(
        goalControl.getByRole('button', { name: copy.session.intent.cancelGoal, exact: true }),
      ).toHaveAttribute('aria-pressed', 'true')

      const controls = page.locator('.hbar-session-composer-controls')
      const permission = controls.locator('.hbar-composer-permission-picker').getByRole('button').first()
      await addMenuTrigger.focus()
      await page.keyboard.press('Tab')
      await expect(permission).toBeFocused()

      const draftText = locale === 'zh-CN' ? '保留未发送的列宽回归草稿' : 'Keep this unsent column-width draft'
      await composer.focus()
      await page.keyboard.insertText(draftText)
      await expectComposerText(composer, draftText)
      await expect(composer).toBeFocused()

      const viewports = [
        { width: 1440, height: 900, wide: true },
        { width: 900, height: 900, wide: true },
        { width: 390, height: 844, wide: false },
        { width: 320, height: 844, wide: false },
        { width: 320, height: 560, wide: false },
      ] as const
      const geometry: Array<NonNullable<Awaited<ReturnType<typeof readColumnGeometry>>>> = []
      const project = page.getByRole('group', {
        name: contextCopy.project(fixtureHost.ready.workspaceName),
        exact: true,
      })
      for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await expect(composer).toBeVisible()
        await expectComposerText(composer, draftText)
        await expect(page.locator('.hbar-composer-model-picker')).toBeVisible()
        await expect(page.getByRole('button', { name: copy.session.prompt.send, exact: true })).toBeVisible()
        await expect(project).toBeVisible()
        await expect(goalControl).toBeVisible()

        const projectToolbar = page.locator('.hbar-session-project-context-toolbar')
        const projectBelow = page.locator('.hbar-session-project-context-below')
        if (viewport.wide) {
          await expect(projectToolbar).toBeVisible()
          await expect(projectBelow).toBeHidden()
          const order = await page.evaluate(() => {
            const controls = document.querySelector('.hbar-session-composer-controls')
            const approval = controls?.querySelector('.hbar-composer-permission-picker')
            const location = controls?.querySelector('.hbar-session-project-context-toolbar')
            const goal = controls?.querySelector('.hbar-composer-intents')
            const usage = document.querySelector('.hbar-session-usage-control')
            const follows = (before: Element | null | undefined, after: Element | null | undefined) =>
              Boolean(
                before && after && (before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
              )
            return {
              approvalBeforeLocation: follows(approval, location),
              locationBeforeGoal: follows(location, goal),
              goalBeforeUsage: follows(goal, usage),
            }
          })
          expect(order).toEqual({
            approvalBeforeLocation: true,
            locationBeforeGoal: true,
            goalBeforeUsage: true,
          })
        } else {
          await expect(projectToolbar).toBeHidden()
          await expect(projectBelow).toBeVisible()
        }

        const current = await readColumnGeometry(page)
        if (!current) throw new Error('The active conversation reading column or composer surface is missing')
        geometry.push(current)
        expect(current.documentWidth).toBeLessThanOrEqual(viewport.width + 1)
        expect(Math.abs(current.contentInnerLeft - current.surfaceLeft)).toBeLessThanOrEqual(1)
        expect(Math.abs(current.contentInnerRight - current.surfaceRight)).toBeLessThanOrEqual(1)
        expect(Math.abs(current.contentInnerWidth - current.surfaceWidth)).toBeLessThanOrEqual(1)

        if (viewport.width === 1440) {
          const gutter = (current.contentOuterWidth - current.contentInnerWidth) / 2
          const remScaledInnerCap = 58.25 * current.rootRem - 2 * gutter
          expect(current.contentInnerWidth).toBeCloseTo(remScaledInnerCap, 0)
          expect(current.surfaceWidth).toBeCloseTo(remScaledInnerCap, 0)
          expect(current.contentInnerWidth).toBeGreaterThanOrEqual(896)
          expect(current.contentInnerWidth).toBeLessThanOrEqual(904)
        }

        await info.attach(`geometry-${viewport.width}x${viewport.height}`, {
          body: Buffer.from(JSON.stringify(current, null, 2)),
          contentType: 'application/json',
        })
        await page.screenshot({
          path: info.outputPath(`reading-column-${viewport.width}x${viewport.height}.png`),
          fullPage: false,
        })
      }

      const snapshot = await fixtureHost.client.call('session.snapshot', { sessionId })
      expect(snapshot.runs).toHaveLength(2)
      expect(errors).toEqual([])
      await info.attach('scope', {
        body: Buffer.from(
          JSON.stringify({
            source: 'production Web + owned temporary Host + local-fixture-only history',
            locale,
            textSize: 'm (default)',
            syntheticContent: ['local-fixture /demo markdown/code', 'local-fixture /tool update_plan'],
            paidProviderRuns: 0,
            sendsFromComposer: 0,
            runs: snapshot.runs.length,
            geometry,
            pageErrors: errors,
          }),
        ),
        contentType: 'application/json',
      })
    } finally {
      try {
        await context.close()
      } finally {
        if (host) await stopWebSessionHost(host)
        await removeOwnedFixture(root)
      }
    }
  })
}
