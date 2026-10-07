import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect, type Locator } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { GoalWorkspaceContentInput } from '../tests/fixtures/goal-workspace-content-browser'
import { verifyReadableText } from './support/verify-readable-text'

const output = resolve('artifacts/desktop-elements/goal-workspace-content')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/goal-workspace-content-browser.tsx'),
      name: 'GoalWorkspaceContent',
      formats: ['iife'],
      fileName: 'goal-workspace-content',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/goal-workspace-content.css')).text()
const script = await Bun.file(resolve(output, 'bundle/goal-workspace-content.iife.js')).text()
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/*', (route) => route.abort())
await page.route('http://localhost/goal-workspace-content', (route) =>
  route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }),
)
await page.goto('http://localhost/goal-workspace-content')
const suffix = ' 完整说明 Complete host explanation '.repeat(3)
const objective = '完整原始目标 Complete original goal objective '.repeat(8).trim()
const step = '完整原始步骤 Complete original plan step '.repeat(6).trim()
let scenarios = 0
let current: (GoalWorkspaceContentInput & { readonly width: number }) | undefined
const mount = async (input: GoalWorkspaceContentInput, width = 320) => {
  current = { ...input, width }
  await page.evaluate(() => window.disposeGoalWorkspaceContent?.())
  await page.setViewportSize({ width, height: 900 })
  await page.mouse.move(0, 0)
  await page.setContent(
    `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0;color:var(--lumen-ink);background:var(--lumen-canvas)}*{box-sizing:border-box}#goal-workspace-content-fixture{display:flex;min-inline-size:0;min-block-size:0;block-size:100dvh}.goal-workspace-fixture-provider{display:flex;min-inline-size:0;min-block-size:0;flex:1}</style><div id="goal-workspace-content-fixture"></div>`,
  )
  await page.addScriptTag({ content: script })
  await page.evaluate((value) => window.mountGoalWorkspaceContent(value), input)
  const root = page.locator('.hbar-app-react-goal-plan-workspace')
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
    const base = getShellCopy(locale).goals
    const input = { locale, suffix, objective, step, count: 1 }
    for (const mode of ['light', 'dark'] as const) {
      for (const width of [1440, 1100, 900, 390, 320]) {
        const root = await mount({ ...input, mode, state: 'overview' }, width)
        const headings = root.locator('.hbar-goal-plan-heading [data-text-context="section.title"]')
        await verifyReadableText(headings.nth(0), base.goal.title + suffix, width < 400)
        await verifyReadableText(headings.nth(1), base.plan.title + suffix, width < 400)
        await verifyReadableText(root.locator('.hbar-app-react-goal-objective'), objective, true)
        const list = root.getByRole('list', { name: base.plan.title + suffix, exact: true })
        await verifyReadableText(list.locator('[data-text-context="collection.title"]'), step + ' 0', width < 400)
        await verifyReadableText(root.locator('.hbar-app-react-plan-explanation'), suffix, width < 400)
        if (width < 400) {
          await read(root.getByRole('group', { name: base.goal.status, exact: true }))
          await read(list.getByRole('group', { name: base.plan.stepStatus(1), exact: true }))
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: resolve(output, `${locale}-${mode}-${width}.png`) })
        scenarios++
      }
    }
    for (const count of [0, 1, 7, 100, 101]) {
      const root = await mount({ ...input, mode: 'light', state: 'overview', count })
      if (count <= 100) {
        const list = root.getByRole('list', { name: base.plan.title + suffix, exact: true })
        await expect(list.getByRole('listitem')).toHaveCount(count)
        if (count > 1) {
          await verifyReadableText(
            list.locator('[data-text-context="collection.title"]').last(),
            step + ` ${count - 1}`,
            true,
          )
          await page.evaluate(() => window.mutateGoalWorkspaceContent())
          await verifyReadableText(
            list.locator('[data-text-context="collection.title"]').first(),
            step + ` ${count - 1}`,
            true,
          )
        }
      } else await expect(root.getByRole('alert')).toContainText(base.error('INVALID_OUTPUT'))
      scenarios++
    }
    for (const length of [4000, 4001]) {
      const root = await mount({
        ...input,
        mode: 'dark',
        state: 'overview',
        objective: '原始目标'.repeat(1000),
        step: 'x'.repeat(length - 2),
        count: 1,
      })
      if (length === 4000) {
        await verifyReadableText(root.locator('.hbar-app-react-goal-objective'), '原始目标'.repeat(1000), true)
        await verifyReadableText(
          root.locator('.hbar-app-react-plan-summary [data-text-context="collection.title"]'),
          'x'.repeat(length - 2) + ' 0',
          true,
        )
      } else await expect(root.getByRole('alert')).toContainText(base.error('INVALID_OUTPUT'))
      scenarios++
    }
    for (const state of ['empty', 'loading', 'read-error', 'editor', 'failed', 'unknown', 'offline'] as const) {
      const root = await mount({ ...input, mode: 'dark', state })
      if (state === 'empty') {
        await verifyReadableText(
          root.locator('.hbar-app-react-goal-plan-empty').first(),
          base.goal.composerHint + suffix,
          true,
        )
        await verifyReadableText(root.locator('.hbar-app-react-goal-plan-empty').last(), base.plan.empty + suffix, true)
      }
      if (state === 'loading') {
        await verifyReadableText(
          root.getByRole('status').filter({ hasText: base.loading }),
          base.loading + suffix,
          true,
        )
        await page.evaluate(() => window.repairGoalWorkspaceContent())
        await expect.poll(() => page.evaluate(() => window.goalWorkspaceContentState().entry?.status)).toBe('ready')
      }
      if (state === 'read-error') {
        await verifyReadableText(root.getByRole('alert'), base.error('DISCONNECTED') + suffix, true)
        await page.evaluate(() => window.repairGoalWorkspaceContent())
        await root.getByRole('button', { name: base.refresh, exact: true }).click()
        await expect.poll(() => page.evaluate(() => window.goalWorkspaceContentState().entry?.status)).toBe('ready')
      }
      if (state === 'editor' || state === 'failed' || state === 'unknown') {
        const field = root.getByRole('textbox', { name: base.goal.objective, exact: true })
        await expect(field).toHaveValue('Original retained goal draft 原始草稿')
        await verifyReadableText(root.getByRole('note'), base.goal.replacementWarning + suffix, true)
        if (state === 'failed' || state === 'unknown')
          await verifyReadableText(
            root.getByRole('alert'),
            base.error(state === 'unknown' ? 'DISCONNECTED' : 'GOAL_CONFLICT') + suffix,
            true,
          )
        if (state === 'unknown') {
          await expect(root.getByRole('button', { name: base.goal.save, exact: true })).toHaveCount(0)
          await expect(root.getByRole('button', { name: base.goal.reconcile, exact: true })).toBeVisible()
          await root.getByRole('button', { name: base.goal.reconcile, exact: true }).click()
          await expect
            .poll(() => page.evaluate(() => window.goalWorkspaceContentState().entry?.goalAction.status))
            .toBe('idle')
          await expect(field).toHaveValue('Original retained goal draft 原始草稿')
          expect(
            (await page.evaluate(() => window.goalWorkspaceContentState())).calls.filter(
              (call) => call.name === 'goal.set',
            ),
          ).toHaveLength(1)
        } else {
          await page.evaluate(() => window.repairGoalWorkspaceContent())
          if (state === 'editor') {
            await field.fill('')
            await field.focus()
            await page.keyboard.insertText('x'.repeat(4001))
            await expect(field).toHaveValue('x'.repeat(4000))
          }
          await field.fill('Original replacement goal 原始替换目标')
          await root.getByRole('button', { name: base.goal.save, exact: true }).click()
          await expect
            .poll(() => page.evaluate(() => window.goalWorkspaceContentState().entry?.goalAction.status))
            .toBe('succeeded')
          expect((await page.evaluate(() => window.goalWorkspaceContentState())).calls.at(-1)).toMatchObject({
            name: 'goal.set',
            input: {
              sessionId: 'original-session',
              expectedGoalId: 'original-goal',
              objective: 'Original replacement goal 原始替换目标',
            },
          })
        }
      }
      if (state === 'offline')
        await expect(root.getByRole('button', { name: base.goal.edit, exact: true })).toBeDisabled()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      scenarios++
    }
  }
  expect(errors).toEqual([])
  console.log(`${scenarios} actual goal workspace Chrome scenarios passed.`)
} catch (error) {
  console.error(
    'Failed owned goal workspace case',
    current && {
      locale: current.locale,
      mode: current.mode,
      state: current.state,
      count: current.count,
      width: current.width,
      objectiveLength: current.objective.length,
      stepLength: current.step.length,
    },
  )
  console.error(
    await page.evaluate(() =>
      [
        '.hbar-app-react-goal-plan-workspace',
        '.lumen-tool-pane-body',
        '[data-lumen-component="agent-plan"]',
        '.hbar-goal-plan-content',
        '.hbar-app-react-goal-plan-overview',
        '.hbar-app-react-goal-objective',
      ].map((selector) => {
        const node = document.querySelector(selector)
        if (!node) return { selector }
        const style = getComputedStyle(node)
        return {
          selector,
          width: node.clientWidth,
          height: node.clientHeight,
          scroll: node.scrollWidth,
          display: style.display,
          direction: style.flexDirection,
          flex: style.flex,
          overflow: style.overflow,
        }
      }),
    ),
  )
  await page.screenshot({ path: resolve(output, 'client-failure.png') })
  throw error
} finally {
  await page.evaluate(() => window.disposeGoalWorkspaceContent?.()).catch(() => {})
  await browser.close()
}
