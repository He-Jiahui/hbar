import { expect, test } from '@playwright/test'
import { createGoalPlanCommandClient } from '@hbar/client'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { openComposerFeedback, revealComposerControl } from './support/composer-controls'
import { removeOwnedFixtureDirectory } from './support/owned-fixture-directory'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`composer plus opens slash commands in an existing draft without losing content: ${locale}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(90_000)
    const prefix = 'hbar-composer-add-'
    const root = await mkdtemp(join(tmpdir(), prefix))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    const copy = getShellCopy(locale)
    let host: WebSessionHost | undefined
    let outcome: { kind: 'completed' } | { kind: 'failed'; error: unknown }
    try {
      await writeFile(join(root, 'slash-target.txt'), 'slash target\n')
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        goalAutoContinue: false,
        budgetAutoContinue: false,
      })
      await context.addInitScript((language) => localStorage.setItem('hbar:web:language', language), locale)
      expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const errors: string[] = []
      const submitEvents: string[] = []
      page.on('console', (message) => {
        if (message.type() === 'log' && message.text().startsWith('[e2e composer input]') && submitEvents.length < 24)
          submitEvents.push(message.text().slice(0, 3_000))
      })
      page.on('pageerror', (error) => {
        if (errors.length < 20) errors.push(error.message.slice(0, 1_000))
      })
      await page.goto(base())
      const sessionRow = page.locator(`.hbar-app-react-session-row[data-session-id="${host.ready.sessionId}"]`)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      await expect(sessionRow).toHaveAttribute('data-selected', 'true')
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const plus = page.getByRole('button', { name: copy.session.addMenu.open, exact: true })
      const menu = page.getByRole('group', { name: copy.session.addMenu.menu })
      const openAdd = async () => {
        await revealComposerControl(page, plus, copy.session.addMenu)
        await plus.scrollIntoViewIfNeeded()
        const geometry = await plus.evaluate((button) => {
          const inspect = (node: Element) => {
            const box = node.getBoundingClientRect()
            const style = getComputedStyle(node)
            return {
              tag: node.tagName,
              className: node.getAttribute('class'),
              role: node.getAttribute('role'),
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height,
              overflowX: style.overflowX,
              overflowY: style.overflowY,
              display: style.display,
              position: style.position,
              scrollLeft: node.scrollLeft,
              clientWidth: node.clientWidth,
              scrollWidth: node.scrollWidth,
            }
          }
          const box = button.getBoundingClientRect()
          const x = box.x + box.width / 2
          const y = box.y + box.height / 2
          const hit = document.elementFromPoint(x, y)
          const ancestors: ReturnType<typeof inspect>[] = []
          for (let node = button.parentElement; node && ancestors.length < 12; node = node.parentElement)
            ancestors.push(inspect(node))
          return {
            button: inspect(button),
            center: { x, y },
            hit: hit ? inspect(hit) : null,
            hitTested: hit !== null && button.contains(hit),
            ancestors,
            floating: [...document.querySelectorAll('[data-lumen-floating-open="true"]')].slice(0, 8).map(inspect),
          }
        })
        await testInfo.attach(`add-entry-${page.viewportSize()?.width ?? 'unknown'}`, {
          body: Buffer.from(JSON.stringify(geometry, null, 2)),
          contentType: 'application/json',
        })
        expect(geometry.hitTested).toBe(true)
        await plus.click({ timeout: 10_000 })
        await expect(menu).toBeVisible()
      }
      const capture = async (name: string) => {
        const path = testInfo.outputPath(name)
        await page.screenshot({ path })
        await testInfo.attach(name, { path, contentType: 'image/png' })
      }

      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await openAdd()
        await expect(menu).toBeVisible()
        await expect(menu.getByRole('button', { name: copy.session.addMenu.files })).toBeVisible()
        await expect(menu.getByRole('button', { name: copy.session.addMenu.slash })).toBeVisible()
        await expect(menu.getByRole('button', { name: copy.session.intent.goalMenu })).toBeVisible()
        await expect(menu).toBeInViewport()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await capture(`add-menu-${locale}-${width}.png`)
        await page.keyboard.press('Escape')
        await expect(menu).toBeHidden()
        await expect(plus).toBeFocused()
      }

      await page.setViewportSize({ width: 1440, height: 900 })
      await prompt.fill('Keep')
      await prompt.press('End')
      await openAdd()
      await expect(menu.getByRole('button', { name: copy.session.addMenu.slash })).toBeEnabled()
      await menu.getByRole('button', { name: copy.session.addMenu.slash }).click()
      await expectComposerText(prompt, 'Keep /')
      await expect(prompt).toBeFocused()
      const slashMenu = page.getByRole('listbox', { name: copy.session.slash.menu })
      const slashOptions = slashMenu.getByRole('option')
      const slashOptionCount = await slashOptions.count()
      expect(slashOptionCount).toBeGreaterThanOrEqual(copy.session.slash.commands.length)
      expect(slashOptionCount).toBeLessThanOrEqual(24)
      for (const command of copy.session.slash.commands)
        await expect(slashOptions.filter({ hasText: command.label }).first()).toBeVisible()
      await expect(page.locator('.hbar-composer-slash-hint')).toBeVisible()
      await prompt.press('Escape')
      await expect(slashMenu).toBeHidden()
      await expectComposerText(prompt, 'Keep /')
      await expect(prompt).toBeFocused()

      await prompt.fill('Keep @slash-target')
      const mentionMenu = page.getByRole('listbox', { name: copy.session.mentions.menu })
      await expect(mentionMenu.getByRole('option').filter({ hasText: 'slash-target.txt' })).toBeVisible()
      await mentionMenu.getByRole('option').filter({ hasText: 'slash-target.txt' }).click()
      await expectComposerText(prompt, 'Keep @slash-target.txt')
      await expect(page.locator('.hbar-composer-mention-pill')).toHaveText('@slash-target.txt')

      await openAdd()
      const chooserPromise = page.waitForEvent('filechooser')
      await menu.getByRole('button', { name: copy.session.addMenu.files }).click()
      const chooser = await chooserPromise
      await chooser.setFiles({ name: 'add-menu.txt', mimeType: 'text/plain', buffer: Buffer.from('test attachment') })
      await expect(page.locator('.lumen-attachment-chip').filter({ hasText: 'add-menu.txt' })).toBeVisible()

      await page.setViewportSize({ width: 320, height: 900 })
      await prompt.press('Home')
      for (let index = 0; index < 'Keep '.length; index += 1) await prompt.press('ArrowRight')
      await openAdd()
      await expect(menu.getByRole('button', { name: copy.session.addMenu.slash })).toBeEnabled()
      await menu.getByRole('button', { name: copy.session.addMenu.slash }).click()
      await expect(slashMenu).toBeVisible()
      await expect(prompt).toBeFocused()
      await expectComposerText(prompt, 'Keep /@slash-target.txt')
      await expect(page.locator('.hbar-composer-mention-pill')).toHaveText('@slash-target.txt')
      await expect(page.locator('.lumen-attachment-chip').filter({ hasText: 'add-menu.txt' })).toBeVisible()
      await expect(page.locator('.hbar-composer-slash-hint')).toBeHidden()
      await capture(`inline-slash-${locale}-320.png`)
      await prompt.press('Escape')
      await expect(slashMenu).toBeHidden()
      await expect(prompt).toBeFocused()
      await expectComposerText(prompt, 'Keep /@slash-target.txt')
      await expect(page.locator('.hbar-composer-mention-pill')).toHaveText('@slash-target.txt')
      const attachmentChip = page.locator('.lumen-attachment-chip').filter({ hasText: 'add-menu.txt' })
      await expect(attachmentChip).toBeVisible()
      const attachmentBounds = await attachmentChip.boundingBox()
      expect(attachmentBounds).not.toBeNull()
      expect(attachmentBounds!.x).toBeGreaterThanOrEqual(-1)
      expect(attachmentBounds!.x + attachmentBounds!.width).toBeLessThanOrEqual(321)
      await capture(`inline-slash-escaped-${locale}-320.png`)
      const beforeGoal = await host.client.call('session.snapshot', { sessionId: host.ready.sessionId, limit: 20 })
      expect(beforeGoal.runs).toHaveLength(0)

      await prompt.fill('Keep this draft')
      await expectComposerText(prompt, 'Keep this draft')
      await expect(page.locator('.hbar-composer-mention-pill')).toHaveCount(0)
      await openAdd()
      await menu.getByRole('button', { name: copy.session.intent.goalMenu }).focus()
      await page.keyboard.press('Enter')
      await expect(menu).toBeHidden()
      await expect(prompt).toBeFocused()
      const prepared = page.getByRole('button', { name: copy.session.intent.cancelGoal, exact: true })
      await expect(prepared).toContainText(copy.session.intent.goalPrepared)
      await prepared.click()
      await expect(prepared).toHaveCount(0)
      await expectComposerText(prompt, 'Keep this draft')
      await expect(page.locator('.lumen-attachment-chip').filter({ hasText: 'add-menu.txt' })).toBeVisible()
      const snapshot = await host.client.call('session.snapshot', { sessionId: host.ready.sessionId, limit: 20 })
      expect(snapshot.runs).toHaveLength(0)
      await openAdd()
      await menu.getByRole('button', { name: copy.session.intent.goalMenu }).click()
      await expect(prepared).toContainText(copy.session.intent.goalPrepared)
      await expect(prepared).toHaveAttribute('aria-pressed', 'true')
      const send = page.getByRole('button', { name: copy.session.prompt.send, exact: true })
      await expect(send).toBeEnabled()
      const submitEntry = await send.evaluate((button) => {
        if (!(button instanceof HTMLButtonElement)) throw new Error('The Send control must be a native button')
        const readLayout = () => {
          const ancestors: Array<{ className: string | null; y: number; height: number; scrollTop: number }> = []
          for (
            let ancestor = button.parentElement;
            ancestor && ancestors.length < 8;
            ancestor = ancestor.parentElement
          ) {
            const box = ancestor.getBoundingClientRect()
            ancestors.push({
              className: ancestor.getAttribute('class'),
              y: box.y,
              height: box.height,
              scrollTop: ancestor.scrollTop,
            })
          }
          return {
            scrollY,
            documentScrollTop: document.documentElement.scrollTop,
            bodyScrollTop: document.body.scrollTop,
            ancestors,
          }
        }
        for (const event of ['pointerdown', 'pointerup', 'click'])
          button.addEventListener(event, () => console.log(`[e2e composer input] ${event}`))
        for (const event of ['pointerdown', 'pointerup', 'click', 'focusin', 'focusout'])
          window.addEventListener(
            event,
            (input) => {
              const target = input.target instanceof Element ? input.target : null
              const box = button.getBoundingClientRect()
              console.log(
                `[e2e composer input] ${JSON.stringify({
                  event,
                  phase: 'window',
                  target: target?.closest('button')?.getAttribute('aria-label') ?? null,
                  tag: target?.tagName ?? null,
                  className: target?.getAttribute('class') ?? null,
                  clientX: input instanceof MouseEvent ? input.clientX : null,
                  clientY: input instanceof MouseEvent ? input.clientY : null,
                  x: box.x,
                  y: box.y,
                  width: box.width,
                  height: box.height,
                  prepared: document.querySelector('.hbar-composer-intents button[aria-pressed="true"]') !== null,
                  floatingCount: document.querySelectorAll('[data-lumen-floating-open="true"]').length,
                  layout: event === 'pointerdown' ? readLayout() : null,
                })}`,
              )
            },
            { capture: true },
          )
        for (const event of ['pointerdown', 'pointerup', 'click'])
          document.addEventListener(
            event,
            (input) => {
              const target = input.target instanceof Element ? input.target.closest('button') : null
              const rawTarget = input.target instanceof Element ? input.target : null
              const box = button.getBoundingClientRect()
              console.log(
                `[e2e composer input] ${JSON.stringify({
                  event,
                  phase: 'document',
                  target: target?.getAttribute('aria-label') ?? null,
                  tag: rawTarget?.tagName ?? null,
                  className: rawTarget?.getAttribute('class') ?? null,
                  clientX: input instanceof MouseEvent ? input.clientX : null,
                  clientY: input instanceof MouseEvent ? input.clientY : null,
                  sendTarget: target === button,
                  sendConnected: button.isConnected,
                  defaultPrevented: input.defaultPrevented,
                  x: box.x,
                  y: box.y,
                  width: box.width,
                  height: box.height,
                  layout: event === 'pointerdown' ? readLayout() : null,
                  floating: [...document.querySelectorAll('[data-lumen-floating-open="true"]')]
                    .slice(0, 8)
                    .map((surface) => {
                      const bounds = surface.getBoundingClientRect()
                      return {
                        className: surface.className,
                        label: surface.getAttribute('aria-label'),
                        topLayer: surface.getAttribute('data-top-layer'),
                        x: bounds.x,
                        y: bounds.y,
                        width: bounds.width,
                        height: bounds.height,
                      }
                    }),
                })}`,
              )
            },
            { capture: true },
          )
        button.form?.addEventListener('submit', () => console.log('[e2e composer input] submit'), { capture: true })
        return {
          type: button.type,
          formAssociated: Boolean(button.form),
          formClassName: button.form?.className ?? null,
          physicallyInForm: button.closest('form') === button.form,
          y: button.getBoundingClientRect().y,
          height: button.getBoundingClientRect().height,
          layout: readLayout(),
        }
      })
      await testInfo.attach('submit-entry', {
        body: Buffer.from(JSON.stringify(submitEntry)),
        contentType: 'application/json',
      })
      await send.click()
      try {
        await expect
          .poll(
            async () =>
              (await host!.client.call('session.snapshot', { sessionId: host!.ready.sessionId, limit: 20 })).runs
                .length,
          )
          .toBe(1)
      } catch (error) {
        try {
          const currentGoal = await createGoalPlanCommandClient(host.client).execute('goal.get', {
            sessionId: host.ready.sessionId,
          })
          await testInfo.attach('submission-state', {
            body: Buffer.from(
              JSON.stringify({
                selected: await sessionRow.getAttribute('data-selected'),
                goalId: currentGoal.goal?.goalId ?? null,
                goalStatus: currentGoal.goal?.status ?? null,
                preparedVisible: await prepared.isVisible(),
                submitEntry,
                submitEvents,
              }),
            ),
            contentType: 'application/json',
          })
          await openComposerFeedback(page, copy)
          await capture(`submission-feedback-${locale}-320.png`)
          await testInfo.attach('submission-feedback', {
            body: Buffer.from(
              (
                await page
                  .getByRole('dialog', {
                    name: copy.session.composerFeedback.title,
                    exact: true,
                  })
                  .innerText()
              ).slice(0, 2_000),
            ),
            contentType: 'text/plain',
          })
        } catch (diagnosticError) {
          throw new AggregateError([error, diagnosticError], 'Submission and bounded failure diagnostics failed', {
            cause: diagnosticError,
          })
        }
        throw error
      }
      await testInfo.attach('submit-pointer-events', {
        body: Buffer.from(JSON.stringify(submitEvents)),
        contentType: 'application/json',
      })
      const pointerGeometry = z.object({
        event: z.literal('pointerdown'),
        phase: z.enum(['window', 'document']),
        y: z.number(),
        height: z.number(),
        clientY: z.number(),
      })
      const pointerSamples = submitEvents.flatMap((entry) => {
        const encoded = entry.slice('[e2e composer input] '.length)
        if (!encoded.startsWith('{')) return []
        const value: unknown = JSON.parse(encoded)
        const result = pointerGeometry.safeParse(value)
        return result.success ? [result.data] : []
      })
      const beforeDismiss = pointerSamples.find((sample) => sample.phase === 'window')
      const afterDismiss = pointerSamples.find((sample) => sample.phase === 'document')
      expect(beforeDismiss).toBeDefined()
      expect(afterDismiss).toBeDefined()
      if (!beforeDismiss || !afterDismiss) throw new Error('Missing native Send pointer geometry')
      expect(afterDismiss.y).toBeCloseTo(beforeDismiss.y, 1)
      expect(afterDismiss.height).toBeCloseTo(beforeDismiss.height, 1)
      expect(afterDismiss.clientY).toBeGreaterThanOrEqual(afterDismiss.y)
      expect(afterDismiss.clientY).toBeLessThanOrEqual(afterDismiss.y + afterDismiss.height)
      expect(submitEvents).toContain('[e2e composer input] click')
      expect(submitEvents).toContain('[e2e composer input] submit')
      const submitted = await host.client.call('session.snapshot', { sessionId: host.ready.sessionId, limit: 20 })
      const userRuns = submitted.runs.filter((run) => run.input.source === 'user')
      expect(userRuns).toHaveLength(1)
      expect(userRuns[0]?.input.text).toBe('Keep this draft')
      expect(userRuns[0]?.input.files?.map((file) => file.name)).toContain('add-menu.txt')
      const goal = await createGoalPlanCommandClient(host.client).execute('goal.get', {
        sessionId: host.ready.sessionId,
      })
      expect(goal.goal?.objective).toBe('Keep this draft')
      await expect(prepared).toHaveCount(0)
      expect(errors).toEqual([])
      outcome = { kind: 'completed' }
    } catch (error) {
      outcome = { kind: 'failed', error }
    }
    const cleanupErrors: unknown[] = []
    let contextClosed = false
    try {
      await context.close()
      contextClosed = true
    } catch (error) {
      cleanupErrors.push(error)
    }
    let hostStopped = false
    if (host)
      try {
        await stopWebSessionHost(host)
        hostStopped = true
      } catch (error) {
        cleanupErrors.push(error)
      }
    if (contextClosed && hostStopped)
      try {
        await removeOwnedFixtureDirectory(root, prefix)
      } catch (error) {
        cleanupErrors.push(error)
      }
    if (outcome.kind === 'failed') {
      if (cleanupErrors.length)
        throw new AggregateError([outcome.error, ...cleanupErrors], 'Composer run and cleanup failed')
      throw outcome.error
    }
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Composer fixture cleanup failed')
  })
}
