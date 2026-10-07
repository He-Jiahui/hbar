import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect, type Locator } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { GoalLifecycleContentInput } from '../tests/fixtures/goal-lifecycle-content-browser'
import { verifyReadableText } from './support/verify-readable-text'

const output = resolve('artifacts/desktop-elements/goal-lifecycle-content')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/goal-lifecycle-content-browser.tsx'),
      name: 'GoalLifecycleContent',
      formats: ['iife'],
      fileName: 'goal-lifecycle-content',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/goal-lifecycle-content.css')).text()
const script = await Bun.file(resolve(output, 'bundle/goal-lifecycle-content.iife.js')).text()
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/*', (route) => route.abort())
const suffix = ' 完整历史说明 Complete history explanation'.repeat(3)
const objective = '检查窄屏🚀\n  <script>原始安全内容</script>\n完整原始目标 Original source objective '
  .repeat(5)
  .trim()
let scenarios = 0
let current: (GoalLifecycleContentInput & { readonly width: number }) | undefined
const mount = async (input: GoalLifecycleContentInput, width = 320) => {
  current = { ...input, width }
  await page.evaluate(() => window.disposeGoalLifecycleContent?.())
  await page.setViewportSize({ width, height: 900 })
  await page.mouse.move(0, 0)
  await page.setContent(
    `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0;color:var(--lumen-ink);background:var(--lumen-canvas)}*{box-sizing:border-box}#goal-lifecycle-content-fixture{display:flex;min-inline-size:0;min-block-size:0;block-size:100dvh}.goal-lifecycle-fixture-provider{display:flex;min-inline-size:0;min-block-size:0;flex:1}</style><div id="goal-lifecycle-content-fixture"></div>`,
  )
  await page.addScriptTag({ content: script })
  await page.evaluate((value) => window.mountGoalLifecycleContent(value), input)
  const root = page.locator('.lumen-tool-pane')
  await expect(root).toBeVisible()
  return root
}
const read = async (reader: Locator) => {
  await reader.scrollIntoViewIfNeeded()
  await reader.focus()
  expect(await reader.evaluate((node) => node.clientWidth > 0 && node.scrollWidth > node.clientWidth)).toBe(true)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => reader.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
}
try {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const copy = getShellCopy(locale)
    const base = copy.session.goalLifecycle
    const input = { locale, objective, suffix, count: 1 }
    for (const mode of ['light', 'dark'] as const) {
      for (const width of [1440, 1100, 900, 390, 320]) {
        for (const kind of ['created', 'replaced', 'continuation', 'execution'] as const) {
          const root = await mount({ ...input, mode, kind }, width)
          if (kind === 'created' || kind === 'replaced') {
            const card = root.locator('.hbar-goal-lifecycle')
            await verifyReadableText(
              card.locator('.hbar-goal-lifecycle-title'),
              base.titles[kind] + suffix,
              width < 400,
            )
            await verifyReadableText(
              card.locator('.hbar-goal-lifecycle-status'),
              base.statuses.active + suffix,
              width < 400,
            )
            if (kind === 'created') {
              const full = card.getByRole('button', { name: base.showObjective + suffix, exact: true })
              if (width < 400) await read(card.locator('.hbar-goal-lifecycle-actions'))
              await full.click()
              await verifyReadableText(
                card.locator('.hbar-goal-lifecycle-body > [data-text-context="reading.paragraph"]'),
                base.objective(objective),
                true,
              )
            } else {
              const titles = card.locator('.hbar-goal-diff-label [data-text-context="collection.title"]')
              await verifyReadableText(titles.nth(0), base.previousObjective + suffix, width < 400)
              await verifyReadableText(titles.nth(1), base.nextObjective + suffix, width < 400)
              await card.getByRole('button', { name: base.showComparison + suffix, exact: true }).click()
              const values = card.locator('.hbar-goal-diff-objective')
              await expect(values.nth(0)).toHaveCSS('white-space', 'pre-wrap')
              await expect(values.nth(1)).toHaveCSS('white-space', 'pre-wrap')
              await verifyReadableText(values.nth(0), objective.replace('窄屏🚀', '桌面🧭'), true)
              await verifyReadableText(values.nth(1), objective, true)
              await expect(card.locator('del')).toContainText('桌面🧭')
              await expect(card.locator('ins')).toContainText('窄屏🚀')
              await expect(card.locator('script')).toHaveCount(0)
            }
            if (width < 400) await read(card.locator('.hbar-goal-lifecycle-metadata'))
            const toggle = card.locator('.hbar-goal-lifecycle-heading')
            await toggle.focus()
            await toggle.press('Enter')
            await expect(card.locator('.hbar-goal-lifecycle-body')).toBeHidden()
            await toggle.press('Space')
            await expect(card.locator('.hbar-goal-lifecycle-body')).toBeVisible()
          }
          if (kind === 'continuation') {
            await verifyReadableText(
              root.locator('.hbar-goal-continuation-title'),
              copy.session.goalContinuation.title + suffix,
              width < 400,
            )
            await verifyReadableText(
              root.locator('.hbar-goal-continuation-status'),
              copy.session.goalContinuation.statuses.completed + suffix,
              width < 400,
            )
            await expect(root.getByRole('separator')).toHaveAttribute('data-goal-continuation-run', 'original-run')
            await expect(root.locator('.hbar-goal-continuation').getByRole('button')).toHaveCount(0)
          }
          if (kind === 'execution') {
            const paragraphs = root.locator('.hbar-app-react-goal-execution [data-text-context]')
            const state = copy.goals.goal.execution
            await verifyReadableText(
              paragraphs.filter({ hasText: state.state(state.phases.waiting, state.reasons.retry_wait) }),
              state.state(state.phases.waiting, state.reasons.retry_wait) + suffix,
              width < 400,
            )
            await verifyReadableText(
              root.locator('[data-text-context="feedback.paragraph"]'),
              state.blocker(objective, 3, 3) + suffix,
              true,
            )
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          if (width === 320) await page.screenshot({ path: resolve(output, `${locale}-${mode}-${kind}-320.png`) })
          scenarios++
        }
      }
    }
    for (const length of [1, 240, 241, 4000]) {
      const text = '原'.repeat(length)
      const root = await mount({ ...input, mode: 'light', kind: 'created', objective: text })
      const caption = base.objective(text)
      if (caption.length > 240)
        await root.getByRole('button', { name: base.showObjective + suffix, exact: true }).click()
      await verifyReadableText(
        root.locator('.hbar-goal-lifecycle-body > [data-text-context="reading.paragraph"]'),
        caption,
        length > 240,
      )
      scenarios++
    }
    await expect(mount({ ...input, mode: 'light', kind: 'created', objective: 'x'.repeat(4001) })).rejects.toThrow()
    scenarios++
    await mount({ ...input, mode: 'light', kind: 'created', count: 0 })
    await expect(page.locator('[data-goal-event-id]')).toHaveCount(0)
    scenarios++
    const rows = await mount({ ...input, mode: 'dark', kind: 'created', count: 7 })
    const original = rows.locator('[data-goal-event-id="original-event-0"]')
    await original.locator('.hbar-goal-lifecycle-heading').click()
    await page.evaluate(() => window.reorderGoalLifecycleContent())
    await expect(rows.locator('[data-goal-event-id]')).toHaveCount(7)
    await expect(original.locator('.hbar-goal-lifecycle-body')).toBeHidden()
    await expect(original).toHaveAttribute('data-goal-session-id', 'original-session')
    scenarios++
    const cleared = await mount({ ...input, mode: 'light', kind: 'cleared' })
    await cleared.getByRole('button', { name: base.showObjective + suffix, exact: true }).click()
    await verifyReadableText(
      cleared.locator('.hbar-goal-lifecycle-body > [data-text-context="reading.paragraph"]'),
      base.cleared(objective.replace('窄屏🚀', '桌面🧭')),
      true,
    )
    scenarios++
  }
  expect(errors).toEqual([])
  console.log(`${scenarios} actual goal lifecycle Chrome scenarios passed.`)
} catch (error) {
  console.error(
    'Failed owned lifecycle case',
    current && {
      locale: current.locale,
      mode: current.mode,
      kind: current.kind,
      count: current.count,
      width: current.width,
      objectiveLength: current.objective.length,
    },
  )
  await page.screenshot({ path: resolve(output, 'client-failure.png') })
  throw error
} finally {
  await page.evaluate(() => window.disposeGoalLifecycleContent?.()).catch(() => {})
  await browser.close()
}
