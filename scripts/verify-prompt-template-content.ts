import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { chromium, expect, type Locator } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promptTemplateCopy } from '../apps/web/src/prompt-template-copy'
import type { PromptTemplateContentInput } from '../tests/fixtures/prompt-template-content-browser'
import {
  promptTemplateContentName,
  promptTemplateContentDescription,
  promptTemplateContentVariableLabel,
} from '../tests/fixtures/prompt-template-content-data'
import { verifyReadableText } from './support/verify-readable-text'

const output = resolve('artifacts/desktop-elements/prompt-template-content')
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
      entry: resolve('tests/fixtures/prompt-template-content-browser.tsx'),
      name: 'PromptTemplateContent',
      formats: ['iife'],
      fileName: 'prompt-template-content',
    },
  },
})
const css = await Bun.file(resolve(output, 'bundle/prompt-template-content.css')).text()
const script = await Bun.file(resolve(output, 'bundle/prompt-template-content.iife.js')).text()
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage()
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/*', (route) => route.abort())
await page.route('http://localhost/prompt-template-content', (route) =>
  route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }),
)
await page.goto('http://localhost/prompt-template-content')
const suffix = ' 完整模板说明 Complete template explanation'.repeat(3)
let current: (PromptTemplateContentInput & { readonly width: number }) | undefined
let scenarios = 0
const mount = async (input: PromptTemplateContentInput, width = 320) => {
  current = { ...input, width }
  await page.evaluate(() => window.disposePromptTemplateContent?.())
  await page.setViewportSize({ width, height: 900 })
  await page.mouse.move(0, 0)
  await page.setContent(
    `<style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0;color:var(--lumen-ink);background:var(--lumen-canvas)}*{box-sizing:border-box}#prompt-template-content-fixture{display:flex;min-inline-size:0;min-block-size:0;block-size:100dvh}.prompt-template-fixture-provider{display:flex;min-inline-size:0;min-block-size:0;flex:1}</style><div id="prompt-template-content-fixture"></div>`,
  )
  await page.addScriptTag({ content: script })
  await page.evaluate((value) => window.mountPromptTemplateContent(value), input)
  const root = page.locator('.hbar-prompt-templates-page')
  await expect(root).toBeVisible()
  if (input.state !== 'loading')
    await expect
      .poll(() => page.evaluate(() => window.promptTemplateContentState().templates?.status))
      .not.toBe('loading')
  return root
}
const read = async (reader: Locator) => {
  await reader.scrollIntoViewIfNeeded()
  await reader.focus()
  expect(await reader.evaluate((node) => node.scrollWidth > node.clientWidth && node.clientWidth > 0)).toBe(true)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => reader.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
}
try {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const base = promptTemplateCopy(locale)
    for (const mode of ['light', 'dark'] as const)
      for (const width of [1440, 1100, 900, 390, 320]) {
        for (const state of ['list', 'edit'] as const) {
          const root = await mount({ locale, mode, state, count: 1, suffix }, width)
          await verifyReadableText(
            root.locator('[data-text-context="workspace.title"]'),
            base.title + suffix,
            width < 400,
          )
          await verifyReadableText(
            root.locator('[data-text-context="workspace.context"]'),
            base.detail + suffix,
            width < 400,
          )
          await verifyReadableText(
            root.locator('.hbar-prompt-template-list [data-text-context="section.title"]'),
            base.listTitle + suffix,
            width < 400,
          )
          const row = root.locator('.hbar-prompt-template-list article')
          await verifyReadableText(
            row.locator('[data-text-context="collection.title"]'),
            promptTemplateContentName(0),
            width < 400,
          )
          await verifyReadableText(
            row.locator('[data-text-context="collection.detail"]'),
            promptTemplateContentDescription(0),
            true,
          )
          if (state === 'edit') {
            const editor = root.locator('.hbar-prompt-template-editor')
            await verifyReadableText(editor.getByRole('heading'), base.editor.title + suffix, width < 400)
            await verifyReadableText(
              editor.locator('[data-text-context="section.description"]'),
              base.editor.detail + suffix,
              width < 400,
            )
            await verifyReadableText(
              editor.getByRole('listitem').locator('[data-text-context="collection.title"]'),
              promptTemplateContentVariableLabel(0),
              width < 400,
            )
            await verifyReadableText(
              editor.getByRole('listitem').locator('[data-text-context="collection.detail"]'),
              base.editor.valid + suffix,
              width < 400,
            )
            await verifyReadableText(
              root.locator('.hbar-prompt-variables > [data-text-context="section.title"]'),
              base.variables + suffix,
              width < 400,
            )
            if (width < 400) {
              await read(editor.getByRole('region', { name: base.editor.name + suffix, exact: true }))
              await read(editor.getByRole('group', { name: base.editor.title + suffix, exact: true }))
            }
          } else if (width < 400)
            await read(row.getByRole('group', { name: promptTemplateContentName(0), exact: true }))
          expect(await root.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          await page.screenshot({ path: resolve(output, `${locale}-${mode}-${width}-${state}.png`) })
          scenarios++
        }
      }
    const short = await mount({ locale, mode: 'light', state: 'list', count: 1, suffix: '' })
    const headerGap = await short.evaluate((node) => {
      const header = node.querySelector(':scope > header')
      const description = header?.querySelector('[data-text-context="workspace.context"]')
      const actions = header?.lastElementChild
      if (!header || !description || !actions) throw new Error('Missing template header flow')
      return {
        actual: actions.getBoundingClientRect().top - description.getBoundingClientRect().bottom,
        expected:
          parseFloat(getComputedStyle(header).rowGap) + parseFloat(getComputedStyle(description).marginBlockEnd),
      }
    })
    expect(headerGap.actual).toBeLessThanOrEqual(headerGap.expected + 1)
    scenarios++
    for (const count of [0, 1, 7, 50, 51]) {
      const root = await mount({ locale, mode: 'light', state: 'list', count, suffix })
      if (count > 50) {
        await expect(root.getByRole('alert')).toBeVisible()
        await expect(root.locator('.hbar-prompt-template-list article')).toHaveCount(0)
      } else {
        await expect(root.locator('.hbar-prompt-template-list article')).toHaveCount(count)
        if (count === 0)
          await verifyReadableText(root.locator('[data-text-context="empty.description"]'), base.empty + suffix, true)
        if (count === 50) {
          await root.getByRole('button', { name: base.next, exact: true }).click()
          await expect(root.locator('.hbar-prompt-template-list article')).toHaveCount(1)
          await expect(root.getByRole('button', { name: base.next, exact: true })).toBeDisabled()
        }
      }
      scenarios++
    }
    for (const identity of ['duplicate', 'foreign'] as const) {
      const root = await mount({ locale, mode: 'light', state: 'list', count: 2, suffix, [identity]: true })
      await expect(root.getByRole('alert')).toContainText('ambiguous or foreign target')
      await expect(root.locator('.hbar-prompt-template-list article')).toHaveCount(0)
      scenarios++
    }
    for (const nameLength of [160, 161]) {
      const bounded = await mount({ locale, mode: 'dark', state: 'list', count: 1, suffix, nameLength })
      if (nameLength === 160)
        await verifyReadableText(
          bounded.locator('.hbar-prompt-template-list [data-text-context="collection.title"]'),
          promptTemplateContentName(0),
          true,
        )
      else {
        await expect(bounded.getByRole('alert')).toBeVisible()
        await expect(bounded.locator('.hbar-prompt-template-list article')).toHaveCount(0)
      }
      scenarios++
    }
    for (const variableCount of [0, 1, 32, 33]) {
      const root = await mount({ locale, mode: 'dark', state: 'edit', count: 1, suffix, variableCount })
      const editor = root.locator('.hbar-prompt-template-editor')
      await expect(editor.getByRole('listitem')).toHaveCount(variableCount)
      if (variableCount >= 32)
        await expect(root.getByRole('button', { name: base.addVariable, exact: true })).toBeDisabled()
      if (variableCount > 32) {
        await expect(editor.getByRole('alert')).toHaveText(base.validationVariables)
        await expect(editor.getByRole('button', { name: base.editor.save + suffix, exact: true })).toBeDisabled()
      }
      scenarios++
    }
    for (const state of ['loading', 'load-error', 'save-error', 'unknown'] as const) {
      const root = await mount({ locale, mode: 'light', state, count: 1, suffix })
      if (state === 'loading') {
        await verifyReadableText(root.getByRole('status'), base.loading + suffix, true)
        await page.evaluate(() => window.repairPromptTemplateContent())
        await expect(root.locator('.hbar-prompt-template-list article')).toHaveCount(1)
      }
      if (state === 'load-error') {
        await expect(root.getByRole('alert')).toContainText('Owned template read failure')
        await page.evaluate(() => window.repairPromptTemplateContent())
        await root.getByRole('button', { name: base.retry, exact: true }).click()
        await expect(root.locator('.hbar-prompt-template-list article')).toHaveCount(1)
      }
      if (state === 'save-error' || state === 'unknown') {
        const body = root.getByRole('textbox', { name: base.editor.body + suffix, exact: true })
        await body.fill('Preserved edited body 原始编辑草稿')
        await root.getByRole('button', { name: base.editor.save + suffix, exact: true }).click()
        await expect(body).toHaveValue('Preserved edited body 原始编辑草稿')
        if (state === 'unknown') {
          await expect(root.getByRole('button', { name: base.editor.save + suffix, exact: true })).toBeDisabled()
          await root.getByRole('button', { name: base.reconcile, exact: true }).click()
        } else {
          await expect(root.getByRole('alert').last()).toContainText('Owned original template conflict')
          await page.evaluate(() => window.repairPromptTemplateContent())
          await root.getByRole('button', { name: base.editor.save + suffix, exact: true }).click()
        }
        await expect(root.locator('.hbar-prompt-template-editor')).toHaveCount(0)
        const captured = await page.evaluate(() => window.promptTemplateContentState())
        expect(captured.calls.filter((call) => call.name === 'promptTemplate.save')).toHaveLength(
          state === 'unknown' ? 1 : 2,
        )
        expect(captured.templates?.selected).toMatchObject({
          id: 'original-template-0',
          body: 'Preserved edited body 原始编辑草稿',
        })
      }
      scenarios++
    }
    const root = await mount({ locale, mode: 'dark', state: 'list', count: 7, suffix })
    const original = root
      .locator('.hbar-prompt-template-list article')
      .filter({ has: page.getByRole('button', { name: promptTemplateContentName(0), exact: true }) })
    await original.getByRole('button', { name: base.remove + suffix, exact: true }).click()
    await page.evaluate(() => window.reorderPromptTemplateContent())
    const dialog = page.getByRole('dialog')
    await verifyReadableText(dialog.getByRole('heading'), base.confirmDelete(promptTemplateContentName(0)), true)
    await verifyReadableText(
      dialog.locator('[data-text-context="dialog.body"]'),
      promptTemplateContentDescription(0),
      true,
    )
    await dialog.getByRole('button', { name: base.remove + suffix, exact: true }).click()
    await expect(dialog).toHaveCount(0)
    expect(
      (await page.evaluate(() => window.promptTemplateContentState())).calls.find(
        (call) => call.name === 'promptTemplate.delete',
      )?.input,
    ).toMatchObject({ id: 'original-template-0', expectedRevision: 3, workspaceId: 'original-workspace' })
    scenarios++
    for (const staleTarget of [false, true]) {
      const apply = await mount({ locale, mode: 'light', state: 'list', count: 1, suffix, staleTarget })
      await apply.getByRole('button', { name: promptTemplateContentName(0), exact: true }).click()
      await verifyReadableText(
        apply.locator('.hbar-prompt-apply > [data-text-context="section.title"]'),
        base.applyTitle + suffix,
        true,
      )
      const button = apply.getByRole('button', { name: base.apply, exact: true })
      if (staleTarget) await expect(button).toBeDisabled()
      else {
        await button.click()
        await expect
          .poll(() => page.evaluate(() => window.promptTemplateContentState().drafts['original-session']?.text))
          .toBe('Original existing draft 原始草稿\n\nOriginal body 原始正文\noriginal value 0')
      }
      scenarios++
    }
    const editor = await mount({ locale, mode: 'dark', state: 'edit', count: 1, suffix, bodyLength: 200000 })
    const body = editor.getByRole('textbox', { name: base.editor.body + suffix, exact: true })
    await expect(body).toHaveValue('原'.repeat(200000))
    await body.focus()
    await body.press('Control+End')
    await page.keyboard.insertText('x')
    expect((await body.inputValue()).length).toBe(200000)
    const name = editor.getByRole('textbox', { name: base.editor.name + suffix, exact: true })
    await name.focus()
    await name.press('End')
    await page.keyboard.insertText('x')
    expect((await name.inputValue()).length).toBe(160)
    scenarios++
  }
  expect(errors).toEqual([])
  console.log(`${scenarios} actual prompt template Chrome scenarios passed.`)
} catch (error) {
  console.error('Failed owned template case', current, errors)
  await page.screenshot({ path: resolve(output, 'client-failure.png') })
  throw error
} finally {
  await page.evaluate(() => window.disposePromptTemplateContent?.()).catch(() => {})
  await browser.close()
}
