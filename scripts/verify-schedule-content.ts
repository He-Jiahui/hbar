import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { chromium, expect, type Locator } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { scheduleCopy } from '../apps/web/src/schedule-copy'
import type { ScheduleContentInput } from '../tests/fixtures/schedule-content-browser'
import {
  scheduleContentName,
  scheduleContentProvider,
  scheduleContentModel,
} from '../tests/fixtures/schedule-content-data'
import { verifyReadableText } from './support/verify-readable-text'
const output = resolve('artifacts/desktop-elements/schedule-content')
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
      entry: resolve('tests/fixtures/schedule-content-browser.tsx'),
      name: 'ScheduleContent',
      formats: ['iife'],
      fileName: 'schedule-content',
    },
  },
})
const css = await Bun.file(resolve(output, 'bundle/schedule-content.css')).text()
const script = await Bun.file(resolve(output, 'bundle/schedule-content.iife.js')).text()
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage()
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/*', (route) => route.abort())
await page.route('http://localhost/schedule-content', (route) =>
  route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }),
)
await page.goto('http://localhost/schedule-content')
const suffix = ' 完整排期说明 Complete schedule explanation'.repeat(3)
let current: (ScheduleContentInput & { readonly width: number }) | undefined
let scenarios = 0
const mount = async (input: ScheduleContentInput, width = 320) => {
  current = { ...input, width }
  await page.evaluate(() => window.disposeScheduleContent?.())
  await page.setViewportSize({ width, height: 900 })
  await page.mouse.move(0, 0)
  await page.setContent(
    `<style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0;color:var(--lumen-ink);background:var(--lumen-canvas)}*{box-sizing:border-box}#schedule-content-fixture{display:flex;min-inline-size:0;min-block-size:0;block-size:100dvh}.schedule-fixture-provider{display:flex;min-inline-size:0;min-block-size:0;flex:1}</style><div id="schedule-content-fixture"></div>`,
  )
  await page.addScriptTag({ content: script })
  await page.evaluate((value) => window.mountScheduleContent(value), input)
  if (input.state !== 'loading' && input.state !== 'unavailable')
    await expect.poll(() => page.evaluate(() => window.scheduleContentState().state?.status)).not.toBe('loading')
  const root = page.locator('.hbar-schedule-page')
  if (input.state !== 'unavailable') await expect(root).toBeVisible()
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
    const base = scheduleCopy(locale)
    for (const mode of ['light', 'dark'] as const)
      for (const width of [1440, 1100, 900, 390, 320]) {
        const root = await mount({ locale, mode, state: 'edit', count: 1, suffix }, width)
        await verifyReadableText(
          root.locator(':scope > header [data-text-context="section.title"]'),
          base.title + suffix,
          width < 400,
        )
        const row = root.locator('.hbar-schedule-list article')
        await verifyReadableText(
          row.locator('[data-text-context="collection.title"]'),
          scheduleContentName(0),
          width < 400,
        )
        await verifyReadableText(
          row.locator('header [data-text-context="collection.detail"]'),
          base.enabled + suffix,
          width < 400,
        )
        await verifyReadableText(
          row.locator(':scope > [data-text-context="collection.description"]'),
          base.summary(base.kinds.daily, 'UTC') + suffix,
          width < 400,
        )
        const model = root.getByRole('combobox', { name: base.model, exact: true })
        await model.click()
        const option = page.getByRole('option', {
          name: base.modelLabel(scheduleContentProvider, scheduleContentModel),
          exact: true,
        })
        await verifyReadableText(
          option.locator('.lumen-popup-select-option-label'),
          base.modelLabel(scheduleContentProvider, scheduleContentModel),
          width < 400,
        )
        await option.click()
        await verifyReadableText(
          model.locator('.lumen-popup-select-label'),
          base.modelLabel(scheduleContentProvider, scheduleContentModel),
          width < 400,
        )
        await root.getByRole('button', { name: base.preview + suffix, exact: true }).click()
        const preview = root.getByRole('region', { name: base.previewTitle + suffix, exact: true })
        await verifyReadableText(preview.getByRole('heading'), base.previewTitle + suffix, width < 400)
        await expect(preview.getByRole('listitem')).toHaveCount(5)
        if (width < 400) {
          await read(root.getByRole('region', { name: base.name + suffix, exact: true }))
          await read(row.locator('.hbar-schedule-secondary-actions'))
        }
        expect(await root.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: resolve(output, `${locale}-${mode}-${width}.png`) })
        scenarios++
      }
    for (const count of [0, 1, 7, 100, 101, 400, 401]) {
      const root = await mount({ locale, mode: 'light', state: 'list', count, suffix })
      await expect(root.locator('.hbar-schedule-list article')).toHaveCount(Math.min(count, 100))
      while ((await page.evaluate(() => window.scheduleContentState().state?.next)) !== null)
        await root
          .locator('.hbar-schedule-list > .hbar-schedule-action-group')
          .getByRole('button', { name: base.more, exact: true })
          .click()
      await expect(root.locator('.hbar-schedule-list article')).toHaveCount(Math.min(count, 400))
      if (count === 0)
        await verifyReadableText(
          root.locator('.hbar-schedule-list [data-text-context="empty.description"]'),
          base.empty + suffix,
          true,
        )
      if (count > 400) await expect(root.getByRole('status')).toHaveText(base.capacity)
      scenarios++
    }
    for (const invalid of ['duplicate', 'foreign', 'oversizedPage'] as const) {
      const root = await mount({
        locale,
        mode: 'dark',
        state: 'list',
        count: invalid === 'oversizedPage' ? 101 : 2,
        suffix,
        [invalid]: true,
      })
      await expect(root.getByRole('alert')).toBeVisible()
      await expect(root.locator('.hbar-schedule-list article')).toHaveCount(0)
      scenarios++
    }
    for (const nameLength of [200, 201]) {
      const root = await mount({ locale, mode: 'light', state: 'list', count: 1, suffix, nameLength })
      if (nameLength === 200)
        await verifyReadableText(
          root.locator('.hbar-schedule-list [data-text-context="collection.title"]'),
          scheduleContentName(0),
          true,
        )
      else await expect(root.getByRole('alert')).toBeVisible()
      scenarios++
    }
    for (const state of ['loading', 'load-error', 'save-error', 'unknown', 'unavailable'] as const) {
      const root = await mount({ locale, mode: 'dark', state, count: 1, suffix })
      if (state === 'loading') {
        await expect(root).toHaveAttribute('aria-busy', 'true')
        await page.evaluate(() => window.repairScheduleContent())
        await expect(root.locator('.hbar-schedule-list article')).toHaveCount(1)
      }
      if (state === 'load-error') {
        await expect(root.getByRole('alert')).toContainText('Owned schedule read failure')
        await page.evaluate(() => window.repairScheduleContent())
        await root.getByRole('button', { name: base.refresh + suffix, exact: true }).click()
        await expect(root.locator('.hbar-schedule-list article')).toHaveCount(1)
      }
      if (state === 'unavailable')
        await verifyReadableText(
          page.locator('[data-text-context="feedback.paragraph"]'),
          base.unavailable + suffix,
          true,
        )
      if (state === 'save-error' || state === 'unknown') {
        const prompt = root.getByRole('textbox', { name: base.prompt, exact: true })
        await expect(prompt).toHaveValue('Original prompt 原始提示词')
        await prompt.fill('Preserved original edited prompt 原始编辑提示词')
        await root.getByRole('button', { name: base.save + suffix, exact: true }).click()
        await expect(root.getByRole('alert').first()).toBeVisible()
        await expect(prompt).toHaveValue('Preserved original edited prompt 原始编辑提示词')
        if (state === 'unknown') {
          await expect(root.getByRole('button', { name: base.save + suffix, exact: true })).toBeDisabled()
          await root.getByRole('button', { name: base.reconcile, exact: true }).click()
        } else {
          await page.evaluate(() => window.repairScheduleContent())
          await root.getByRole('button', { name: base.save + suffix, exact: true }).click()
        }
        await expect(root.locator('.hbar-schedule-feedback')).toHaveText(base.saved + suffix)
        const captured = await page.evaluate(() => window.scheduleContentState())
        expect(captured.calls.filter((call) => call.name === 'schedule.update')).toHaveLength(
          state === 'unknown' ? 1 : 2,
        )
        expect(captured.state?.schedules[0]).toMatchObject({
          id: 'original-schedule-0',
          input: 'Preserved original edited prompt 原始编辑提示词',
        })
      }
      scenarios++
    }
    const noModels = await mount({ locale, mode: 'light', state: 'list', count: 0, suffix, noModels: true })
    await verifyReadableText(
      noModels.locator('.hbar-schedule-form [data-text-context="empty.description"]'),
      base.noModels + suffix,
      true,
    )
    scenarios++
    for (const occurrenceCount of [0, 1, 7, 100, 101, 400, 401]) {
      const root = await mount({ locale, mode: 'dark', state: 'list', count: 1, suffix, occurrenceCount })
      const row = root.locator('.hbar-schedule-list article')
      await row.getByRole('button', { name: base.occurrences, exact: true }).click()
      await expect
        .poll(() =>
          page.evaluate(() => window.scheduleContentState().state?.occurrences['original-schedule-0']?.length),
        )
        .toBe(Math.min(occurrenceCount, 100))
      while (
        (await page.evaluate(() => window.scheduleContentState().state?.occurrenceNext['original-schedule-0'])) !== null
      )
        await row.getByRole('button', { name: base.more, exact: true }).click()
      await expect(row.getByRole('listitem')).toHaveCount(Math.min(occurrenceCount, 400))
      if (occurrenceCount === 1)
        await verifyReadableText(row.getByRole('alert'), `Original execution failure 原始执行错误 ${suffix}`, true)
      scenarios++
    }
    const mutation = await mount({ locale, mode: 'light', state: 'list', count: 7, suffix })
    const original = mutation.locator('.hbar-schedule-list article').filter({ hasText: scheduleContentName(0) })
    await original.getByRole('button', { name: base.delete + suffix, exact: true }).click()
    await page.evaluate(() => window.reorderScheduleContent())
    const confirm = original.getByRole('group', { name: base.deleteConfirm(scheduleContentName(0)), exact: true })
    await verifyReadableText(
      confirm.locator('[data-text-context="feedback.paragraph"]'),
      base.deleteConfirm(scheduleContentName(0)),
      true,
    )
    await confirm.getByRole('button', { name: base.delete + suffix, exact: true }).click()
    await expect(original).toHaveCount(0)
    expect(
      (await page.evaluate(() => window.scheduleContentState())).calls.find((call) => call.name === 'schedule.delete')
        ?.input,
    ).toMatchObject({ scheduleId: 'original-schedule-0', expectedRevision: 3 })
    scenarios++
    for (const kind of ['once', 'daily', 'weekly', 'cron'] as const) {
      const root = await mount({ locale, mode: 'dark', state: 'edit', count: 1, suffix, kind })
      await expect(root.getByRole('combobox', { name: base.type, exact: true })).toHaveAttribute('data-value', kind)
      if (kind === 'weekly') {
        const days = root.getByRole('group', { name: base.weekdays, exact: true })
        await expect(days.getByRole('button')).toHaveCount(7)
        await days.getByRole('button').nth(2).click()
        await expect(days.getByRole('button').nth(2)).toHaveAttribute('aria-pressed', 'true')
      }
      if (kind === 'cron') {
        const expression = root.getByRole('textbox', { name: base.cron, exact: true })
        await expression.fill('*'.repeat(128))
        await expression.focus()
        await expression.press('End')
        await page.keyboard.insertText('x')
        expect((await expression.inputValue()).length).toBe(128)
      }
      scenarios++
    }
    const bounded = await mount({ locale, mode: 'light', state: 'edit', count: 1, suffix, promptLength: 200000 })
    const prompt = bounded.getByRole('textbox', { name: base.prompt, exact: true })
    await expect(prompt).toHaveValue('原'.repeat(200000))
    await prompt.focus()
    await prompt.press('Control+End')
    await page.keyboard.insertText('x')
    expect((await prompt.inputValue()).length).toBe(200000)
    const name = bounded.getByRole('textbox', { name: base.name + suffix, exact: true })
    await name.focus()
    await name.press('End')
    await page.keyboard.insertText('x')
    expect((await name.inputValue()).length).toBe(200)
    const timezone = bounded.getByRole('textbox', { name: base.timezone, exact: true })
    await timezone.fill('U'.repeat(80))
    await timezone.focus()
    await timezone.press('End')
    await page.keyboard.insertText('x')
    expect((await timezone.inputValue()).length).toBe(80)
    scenarios++
  }
  expect(errors).toEqual([])
  console.log(`${scenarios} actual schedule Chrome scenarios passed.`)
} catch (error) {
  console.error('Failed owned schedule case', current, errors)
  await page.screenshot({ path: resolve(output, 'client-failure.png') })
  throw error
} finally {
  await page.evaluate(() => window.disposeScheduleContent?.()).catch(() => {})
  await browser.close()
}
