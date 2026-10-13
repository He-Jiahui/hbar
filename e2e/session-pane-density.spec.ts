import { expect, test } from '@playwright/test'
import { createGoalPlanCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { openSessionTool } from './support/session-tools-menu'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['zh-CN', 'en-US'] as const) {
  for (const theme of ['dark', 'light'] as const) {
    test(`goal and status panes keep dense readable flow: ${locale} ${theme}`, async ({ browser }, testInfo) => {
      test.setTimeout(90_000)
      const root = await mkdtemp(join(tmpdir(), 'hbar-session-density-'))
      const context = await browser.newContext({ locale, colorScheme: theme })
      let host: WebSessionHost | undefined
      try {
        host = await startWebSessionHost({
          root,
          port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
          goalAutoContinue: false,
        })
        const goals = createGoalPlanCommandClient(host.client)
        const objectiveParagraph =
          locale === 'zh-CN'
            ? '检查工作台的导航、会话阅读区、输入框和右侧工具面板，使长目标、步骤和模型状态保持清楚且紧凑。保留用户输入、原始消息及每一个步骤的执行状态。'
            : 'Review navigation, the conversation, composer and right tool pane. Keep long objectives, execution steps and model status readable and compact while preserving the original content and controlled state.'
        const objective = Array.from({ length: 4 }, () => objectiveParagraph).join('\n')
        const stepCount = 14
        const stepText =
          locale === 'zh-CN'
            ? '检查布局与状态契约，验证长文本和窄屏可以自然换行'
            : 'Inspect layout and status contracts, preserving long text and narrow content flow'
        await goals.execute('goal.create', { sessionId: host.ready.sessionId, objective })
        await goals.execute('plan.update', {
          sessionId: host.ready.sessionId,
          explanation: objective,
          plan: Array.from({ length: stepCount }, (_, index) => ({
            step: `${index + 1}. ${stepText}`,
            status: index === 0 ? ('completed' as const) : ('pending' as const),
          })),
        })
        const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
        expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
          true,
        )
        const page = await context.newPage()
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        await page.goto(base)
        const session = await host.client.call('session.get', { sessionId: host.ready.sessionId })
        if (!session) throw new Error('Fixture session disappeared')
        await page.getByRole('treeitem', { name: session.title, exact: true }).click()
        await expect(page.locator('html')).toHaveAttribute('data-lumen-mode', theme)
        const copy = getShellCopy(locale)
        for (const width of [1440, 900, 390]) {
          await page.setViewportSize({ width, height: 960 })
          await openSessionTool(page, copy.session.tools, 'goals')
          const pane = page.locator('.hbar-app-react-goal-plan-workspace')
          await expect(pane).toBeVisible()
          await expect(pane.locator('.hbar-app-react-plan-summary li')).toHaveCount(stepCount)
          await expect(pane.locator('.hbar-app-react-plan-summary li').first()).toContainText(stepText)
          await expect(pane.locator('.hbar-app-react-plan-summary li').first()).toContainText(
            copy.goals.plan.statuses.completed,
          )
          await expect(pane.locator('.hbar-app-react-plan-summary li').nth(1)).toContainText(
            copy.goals.plan.statuses.pending,
          )
          await expect(pane.locator('.hbar-app-react-goal-objective')).toHaveText(objective)
          const placement = await pane.evaluate((element) => {
            const owner = element.closest('[data-lumen-floating-surface]') ?? element.closest('.lumen-app-tool-drawer')
            const body = document.querySelector('.lumen-app-body')
            const main = body?.querySelector('.lumen-app-main')
            const mode = body?.getAttribute('data-tool-presentation')
            if (!owner || !body || !main || (mode !== 'split' && mode !== 'drawer' && mode !== 'page'))
              throw new Error('Goal pane has no workbench tool owner')
            const rect = (node: Element) => {
              const value = node.getBoundingClientRect()
              return { x: value.x, y: value.y, right: value.right, bottom: value.bottom, width: value.width }
            }
            return {
              mode,
              pane: rect(element),
              body: rect(body),
              main: rect(main),
              viewport: { x: 0, y: 0, right: innerWidth, bottom: innerHeight },
              modal: owner.getAttribute('aria-modal'),
              topLayer: (owner.closest('[data-lumen-floating-root]') ?? owner).matches(':popover-open'),
              scrollY: window.scrollY,
            }
          })
          const bounds = placement.mode === 'drawer' ? placement.viewport : placement.body
          expect(placement.pane.x).toBeGreaterThanOrEqual(bounds.x - 1)
          expect(placement.pane.y).toBeGreaterThanOrEqual(bounds.y - 1)
          expect(placement.pane.right).toBeLessThanOrEqual(bounds.right + 1)
          expect(placement.pane.bottom).toBeLessThanOrEqual(bounds.bottom + 1)
          if (placement.mode === 'drawer') {
            expect(placement.modal).toBe('true')
            expect(placement.topLayer).toBe(true)
          }
          if (placement.mode === 'split') expect(placement.pane.x).toBeGreaterThanOrEqual(placement.main.right - 1)
          expect(placement.scrollY).toBe(0)
          const geometry = await pane.evaluate((element) => {
            const objective = element.querySelector('.hbar-app-react-goal-objective')!
            const step = element.querySelector('.hbar-app-react-plan-summary [data-text-context="record.title"]')!
            const metrics = element.querySelector('.lumen-compact-metrics')!
            const fontProbe = document.createElement('span')
            fontProbe.style.fontSize = 'var(--lumen-font-size, 1rem)'
            element.appendChild(fontProbe)
            const rootSize = Number.parseFloat(getComputedStyle(fontProbe).fontSize)
            fontProbe.remove()
            const objectiveStyle = getComputedStyle(objective)
            const densityAncestors = [objective, objective.parentElement, element, document.documentElement]
              .filter((node): node is Element => node !== null)
              .map((node) => {
                const style = getComputedStyle(node)
                return {
                  tag: node.tagName.toLowerCase(),
                  className: typeof node.className === 'string' ? node.className.slice(0, 100) : '',
                  textContext: node.getAttribute('data-text-context'),
                  variant: node.getAttribute('data-variant'),
                  fontSize: style.fontSize,
                  lumenFontSize: style.getPropertyValue('--lumen-font-size').trim(),
                  bodyToken: style.getPropertyValue('--hbar-session-pane-body-size').trim(),
                }
              })
            return {
              objectiveSize: parseFloat(objectiveStyle.fontSize),
              stepSize: parseFloat(getComputedStyle(step).fontSize),
              objectiveWeight: parseFloat(getComputedStyle(objective).fontWeight),
              stepWeight: parseFloat(getComputedStyle(step).fontWeight),
              stepContext: step.getAttribute('data-text-context'),
              objectiveContext: objective.getAttribute('data-text-context'),
              objectiveVariant: objective.getAttribute('data-variant'),
              densityAncestors,
              rootSize,
              metricsHeight: metrics.getBoundingClientRect().height,
              metricsFlow: getComputedStyle(metrics).flexDirection,
              scrollWidth: element.scrollWidth,
              width: element.clientWidth,
            }
          })
          if (
            geometry.objectiveSize < 12 ||
            geometry.objectiveSize > geometry.rootSize * 0.95 ||
            geometry.stepSize > geometry.rootSize * 0.95
          ) {
            await testInfo.attach(`density-geometry-${locale}-${theme}-${width}.json`, {
              body: Buffer.from(JSON.stringify(geometry, null, 2)),
              contentType: 'application/json',
            })
          }
          expect(geometry.objectiveSize).toBeGreaterThanOrEqual(12)
          expect(geometry.objectiveSize).toBeLessThanOrEqual(geometry.rootSize * 0.95)
          expect(geometry.stepSize).toBeLessThanOrEqual(geometry.rootSize * 0.95)
          expect(geometry.stepSize).toBeLessThanOrEqual(geometry.objectiveSize)
          expect(geometry.stepWeight).toBeLessThanOrEqual(geometry.objectiveWeight)
          expect(geometry.stepContext).toBe('record.title')
          expect(geometry.objectiveContext).toBe('section.description')
          expect(geometry.metricsHeight).toBeLessThan(110)
          expect(geometry.metricsFlow).toBe('column')
          expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width + 1)
          await pane.evaluate((element) => element.style.setProperty('--lumen-font-size', '1rem'))
          expect(
            await pane
              .locator('.hbar-app-react-goal-objective')
              .evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
          ).toBeGreaterThan(geometry.objectiveSize)
          await pane.evaluate((element) => element.style.removeProperty('--lumen-font-size'))
          await pane.screenshot({ path: testInfo.outputPath(`goals-${locale}-${theme}-${width}.png`) })
          await page.screenshot({ path: testInfo.outputPath(`workbench-goals-${locale}-${theme}-${width}.png`) })
          const lastStep = pane.locator('.hbar-app-react-plan-summary li').last()
          await lastStep.scrollIntoViewIfNeeded()
          await expect(lastStep).toBeInViewport()
          await expect(lastStep).toContainText(`${stepCount}. ${stepText}`)
          expect(await page.evaluate(() => window.scrollY)).toBe(0)
          await pane.getByRole('button', { name: copy.goals.close, exact: true }).click()
        }
        expect(errors).toEqual([])
      } finally {
        await context.close()
        if (host) await stopWebSessionHost(host)
        await rm(root, { recursive: true, force: true })
      }
    })
  }
}
