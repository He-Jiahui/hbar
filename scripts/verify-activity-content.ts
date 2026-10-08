import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { chromium, expect, type Locator } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { ActivityContentInput } from '../tests/fixtures/activity-content-browser'
import {
  activityContentObjective,
  activityContentStep,
  activityContentFocus,
  activityContentPreview,
} from '../tests/fixtures/activity-content-data'
import { verifyReadableText } from './support/verify-readable-text'

const output = resolve('artifacts/desktop-elements/activity-content')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
    lib: {
      entry: resolve('tests/fixtures/activity-content-browser.tsx'),
      name: 'ActivityContent',
      formats: ['iife'],
      fileName: 'activity-content',
    },
  },
})
const css = await Bun.file(resolve(output, 'bundle/activity-content.css')).text()
const script = await Bun.file(resolve(output, 'bundle/activity-content.iife.js')).text()
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage()
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/*', (route) => route.abort())
await page.route('http://localhost/activity-content', (route) =>
  route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }),
)
await page.goto('http://localhost/activity-content')
const suffix = ' 完整活动标题 Complete Activity heading'.repeat(3)
let current: (ActivityContentInput & { readonly width: number }) | undefined
let scenarios = 0
const mount = async (input: ActivityContentInput, width = 320) => {
  current = { ...input, width }
  await page.evaluate(() => window.disposeActivityContent?.())
  await page.setViewportSize({ width, height: 900 })
  await page.setContent(
    `<style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0;overflow:hidden;color:var(--lumen-ink);background:var(--lumen-canvas)}*{box-sizing:border-box}#activity-content-fixture,.owned-activity-pane{display:flex;block-size:100dvh;inline-size:100%;min-inline-size:0;min-block-size:0}.owned-activity-pane>.hbar-session-activity-workspace{flex:1;min-inline-size:0;min-block-size:0;max-inline-size:100%}</style><div id="activity-content-fixture"></div>`,
  )
  await page.addScriptTag({ content: script })
  await page.evaluate((value) => window.mountActivityContent(value), input)
  const root = page.locator('.hbar-session-activity-workspace')
  await expect(root).toBeVisible()
  if (input.state !== 'loading')
    await expect
      .poll(() =>
        page.evaluate(() => {
          const state = window.activityContentState()
          return (
            Object.values(state.activity.entries).some((entry) => entry.status === 'loading') ||
            Object.values(state.activity.agents).some((entry) => entry.status === 'loading') ||
            Object.values(state.workflows.entries).some((entry) => entry.status === 'loading') ||
            state.facts.status === 'loading'
          )
        }),
      )
      .toBe(false)
  return root
}
const read = async (reader: Locator) => {
  await reader.scrollIntoViewIfNeeded()
  await reader.focus()
  expect(await reader.evaluate((node) => node.scrollWidth > node.clientWidth && node.clientWidth > 0)).toBe(true)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => reader.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
}
const base = { runs: 1, agents: 2, steps: 1, delegations: 2, suffix: '' } as const
try {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const labels = getShellCopy(locale).activity
    for (const mode of ['light', 'dark'] as const)
      for (const width of [1440, 1100, 900, 390, 320]) {
        const root = await mount({ ...base, locale, mode, suffix }, width)
        for (const name of [
          labels.title,
          labels.runs,
          labels.agents.title,
          labels.tasks.title,
          labels.workflow.title,
          labels.workflow.other,
        ])
          await verifyReadableText(
            root.getByRole('heading', { name: name + suffix, exact: true }),
            name + suffix,
            width < 400,
          )
        await verifyReadableText(
          root.getByRole('heading', { name: activityContentFocus, exact: true }),
          activityContentFocus,
          width < 400,
        )
        await verifyReadableText(
          root.locator('[data-operation-id="original-run-0"] [data-text-context="collection.title"]'),
          labels.intentPreview(activityContentPreview),
          width < 400,
        )
        await verifyReadableText(
          root.locator('[data-activity-agent-id="original-agent-001"] [data-text-context="collection.title"]'),
          activityContentObjective(1),
          width < 400,
        )
        await verifyReadableText(
          root.locator('[data-activity-delegation-id="original-delegation-0"] [data-text-context="collection.title"]'),
          activityContentObjective(0),
          width < 400,
        )
        await verifyReadableText(
          root.locator('.hbar-activity-task-row [data-text-context="collection.title"]').first(),
          activityContentStep(0),
          width < 400,
        )
        await expect(root.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
        if (width < 400) {
          await read(root.locator('[data-operation-id="original-run-0"] .hbar-activity-reader').first())
          await read(root.locator('[data-operation-id="original-run-0"] .hbar-activity-reader').last())
          await read(root.locator('.hbar-activity-task-progress'))
        }
        expect(await root.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await root.getByRole('heading', { name: labels.workflow.title + suffix, exact: true }).scrollIntoViewIfNeeded()
        await page.screenshot({ path: resolve(output, `${locale}-${mode}-${width}.png`) })
        scenarios++
      }
    for (const runs of [0, 1, 7, 100, 101, 1000, 1001]) {
      const root = await mount({ ...base, locale, mode: 'light', runs, agents: 0, steps: 0, delegations: 0 })
      while (
        await root
          .locator('.hbar-session-activity-runs')
          .getByRole('button', { name: labels.loadMore, exact: true })
          .count()
      )
        await page.evaluate(() => window.loadMoreActivityContent('runs'))
      await expect(root.locator('[data-operation-id]')).toHaveCount(Math.min(runs, 1000))
      if (runs === 0) await expect(root.getByText(labels.empty, { exact: true })).toBeVisible()
      if (runs > 1000) await expect(root.getByText(labels.limitReached, { exact: true })).toBeVisible()
      if (runs >= 100) {
        const body = root.locator('.hbar-session-activity-body')
        expect(await body.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true)
        await root.locator('[data-operation-id]').last().scrollIntoViewIfNeeded()
        await expect(root.locator('[data-operation-id]').last()).toBeInViewport()
      }
      scenarios++
    }
    for (const agents of [0, 1, 7, 50, 51, 200, 201]) {
      const root = await mount({ ...base, locale, mode: 'dark', runs: 0, agents, steps: 0, delegations: 0 })
      while (
        await root
          .locator('.hbar-activity-agents')
          .getByRole('button', { name: labels.agents.loadMore, exact: true })
          .count()
      )
        await page.evaluate(() => window.loadMoreActivityContent('agents'))
      await expect(root.locator('[data-activity-agent-id]')).toHaveCount(Math.min(agents, 200))
      if (agents === 0) await expect(root.locator('.hbar-activity-agents')).toHaveCount(0)
      if (agents > 200) await expect(root.getByText(labels.agents.limitReached, { exact: true })).toBeVisible()
      scenarios++
    }
    for (const steps of [0, 1, 7, 100, 101]) {
      const root = await mount({ ...base, locale, mode: 'light', steps })
      if (steps > 100) await expect(root.locator('.hbar-activity-tasks').getByRole('alert')).toHaveCount(1)
      else await expect(root.locator('.hbar-activity-task-row')).toHaveCount(steps)
      scenarios++
    }
    for (const delegations of [0, 1, 7, 128, 129]) {
      const root = await mount({ ...base, locale, mode: 'light', delegations })
      if (delegations > 128) await expect(root.locator('.hbar-activity-workflow').getByRole('alert')).toHaveCount(1)
      else await expect(root.locator('[data-activity-delegation-id]')).toHaveCount(delegations)
      scenarios++
    }
    for (const invalid of [
      'duplicate-run',
      'foreign-run',
      'oversized-run',
      'duplicate-agent',
      'foreign-agent',
      'duplicate-delegation',
    ] as const) {
      const root = await mount({ ...base, locale, mode: 'light', runs: 100, invalid })
      const surface = invalid.includes('run')
        ? '.hbar-session-activity-runs'
        : invalid.includes('agent')
          ? '.hbar-activity-agents'
          : '.hbar-activity-workflow'
      await expect(root.locator(surface).getByRole('alert')).toHaveCount(1)
      scenarios++
    }
    for (const state of ['error', 'loading', 'offline'] as const) {
      const root = await mount({ ...base, locale, mode: 'light', state })
      if (state === 'offline') {
        await expect(root.getByRole('button', { name: labels.refresh, exact: true })).toBeDisabled()
        await expect(root.getByText(labels.offline, { exact: true })).toBeVisible()
        await expect(root.locator('.hbar-activity-agent-open').first()).toBeDisabled()
      } else {
        if (state === 'error') await expect(root.getByRole('alert')).toHaveCount(4)
        else await expect(root.getByText(labels.loading, { exact: true })).toBeVisible()
        await page.evaluate(() => window.repairActivityContent())
        if (state === 'error') await page.evaluate(() => window.refreshActivityContent())
        await expect(root.locator('[data-operation-id]')).toHaveCount(1)
        await expect(root.getByRole('alert')).toHaveCount(0)
      }
      scenarios++
    }
    {
      const root = await mount({
        ...base,
        locale,
        mode: 'dark',
        objectiveLength: 4000,
        stepLength: 4000,
        focusLength: 4000,
      })
      await verifyReadableText(
        root.locator('.hbar-activity-task-row [data-text-context="collection.title"]').first(),
        activityContentStep(0).padEnd(4000, '原'),
        true,
      )
      await verifyReadableText(
        root.getByRole('heading', { name: activityContentFocus.padEnd(4000, '原'), exact: true }),
        activityContentFocus.padEnd(4000, '原'),
        true,
      )
      await verifyReadableText(
        root.locator('[data-activity-agent-id="original-agent-001"] [data-text-context="collection.title"]'),
        activityContentObjective(1).padEnd(4000, '原'),
        true,
      )
      scenarios++
    }
    {
      const root = await mount({ ...base, locale, mode: 'light' })
      await expect(root.locator('[data-activity-agent-id="original-agent-000"]')).toHaveCount(0)
      await page.evaluate(() => window.reorderActivityContent())
      const open = root
        .locator('[data-activity-agent-id="original-agent-001"]')
        .getByRole('button', { name: labels.agents.open(activityContentObjective(1)), exact: true })
      await open.scrollIntoViewIfNeeded()
      await open.focus()
      await open.press('Enter')
      await expect.poll(() => page.evaluate(() => window.activityContentState().sessionId)).toBe('original-child-1')
      const calls = await page.evaluate(() => window.activityContentState().calls)
      expect(
        calls.some(
          (call) =>
            call.name === 'agent.result.get' &&
            typeof call.input === 'object' &&
            call.input !== null &&
            'agentId' in call.input &&
            call.input.agentId === 'original-agent-001',
        ),
      ).toBe(true)
      scenarios++
    }
    {
      const root = await mount({ ...base, locale, mode: 'light' })
      await page.evaluate(() => window.reorderActivityContent(true))
      await expect(
        root
          .locator('[data-activity-delegation-id="original-delegation-0"]')
          .getByRole('button', { name: labels.workflow.retry, exact: true }),
      ).toBeVisible()
      await expect(
        root.locator('[data-activity-delegation-id="original-delegation-0"] .hbar-activity-agent-open'),
      ).not.toHaveRole('button')
      expect(await page.evaluate(() => window.activityContentState().sessionId)).toBe('original-parent')
      scenarios++
    }
  }
  expect(errors).toEqual([])
  await Bun.write(resolve(output, 'result.json'), JSON.stringify({ scenarios, errors }, null, 2))
  console.log(`Activity content: ${scenarios} Chrome scenarios passed`)
} catch (error) {
  console.error('Current owned Activity scenario', current)
  await page.screenshot({ path: resolve(output, 'failure.png') })
  throw error
} finally {
  await page.evaluate(() => window.disposeActivityContent?.())
  await browser.close()
}
