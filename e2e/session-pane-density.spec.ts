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
        const objective =
          locale === 'zh-CN'
            ? '检查工作台的导航、会话阅读区、输入框和右侧工具面板，使长目标、步骤和模型状态保持清楚且紧凑。保留用户输入、原始消息及每一个步骤的执行状态。'
            : 'Review navigation, the conversation, composer and right tool pane. Keep long objectives, execution steps and model status readable and compact while preserving the original content and controlled state.'
        const stepText =
          locale === 'zh-CN'
            ? '检查布局与状态契约，验证长文本和窄屏可以自然换行'
            : 'Inspect layout and status contracts, preserving long text and narrow content flow'
        await goals.execute('goal.create', { sessionId: host.ready.sessionId, objective })
        await goals.execute('plan.update', {
          sessionId: host.ready.sessionId,
          explanation: objective,
          plan: Array.from({ length: 5 }, (_, index) => ({
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
          await expect(pane.locator('.hbar-app-react-plan-summary li')).toHaveCount(5)
          await expect(pane.locator('.hbar-app-react-goal-objective')).toHaveText(objective)
          const geometry = await pane.evaluate((element) => {
            const objective = element.querySelector('.hbar-app-react-goal-objective')!
            const step = element.querySelector('.hbar-app-react-plan-summary strong')!
            const metrics = element.querySelector('.lumen-compact-metrics')!
            const fontProbe = document.createElement('span')
            fontProbe.style.fontSize = 'var(--lumen-font-size, 1rem)'
            element.appendChild(fontProbe)
            const rootSize = Number.parseFloat(getComputedStyle(fontProbe).fontSize)
            fontProbe.remove()
            return {
              objectiveSize: parseFloat(getComputedStyle(objective).fontSize),
              stepSize: parseFloat(getComputedStyle(step).fontSize),
              rootSize,
              metricsHeight: metrics.getBoundingClientRect().height,
              metricsFlow: getComputedStyle(metrics).flexDirection,
              scrollWidth: element.scrollWidth,
              width: element.clientWidth,
            }
          })
          expect(geometry.objectiveSize).toBeGreaterThanOrEqual(12)
          expect(geometry.objectiveSize).toBeLessThanOrEqual(geometry.rootSize * 0.95)
          expect(geometry.stepSize).toBeLessThanOrEqual(geometry.rootSize * 0.95)
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
