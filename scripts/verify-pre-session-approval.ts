import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect, type Locator, type Page } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { ApprovalFixtureCopy, ApprovalFixtureInput } from '../tests/fixtures/pre-session-approval-browser'

const copies = {
  'en-US': {
    title: 'Execution choices',
    other: 'Other choices',
    close: 'Close choices',
    session: 'Original first-send draft',
    error: 'The execution choice could not be saved. Reopen it to try again.',
    longSuffix: ' — complete original permission description 保留完整权限说明'.repeat(5),
    longActionSuffix: '',
    blocked: 'The Host does not currently support entering Plan.',
  },
  'zh-CN': {
    title: '执行方式选择',
    other: '其他选项',
    close: '关闭选项',
    session: '原始首发草稿',
    error: '执行方式保存失败，请在原始选择附近重试，保留完整错误原因。'.repeat(25),
    longSuffix: ' — 保留完整原始权限说明 complete original permission description'.repeat(5),
    longActionSuffix: '',
    blocked: 'Host 当前不支持进入 Plan，请保留原来的执行方式。',
  },
} as const satisfies { readonly 'en-US': ApprovalFixtureCopy; readonly 'zh-CN': ApprovalFixtureCopy }
const output = resolve('artifacts/desktop-elements/pre-session-approval')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/pre-session-approval-browser.tsx'),
      name: 'ApprovalFixture',
      formats: ['iife'],
      fileName: 'approval-fixture',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/approval-fixture.css')).text()
const script = await Bun.file(resolve(output, 'bundle/approval-fixture.iife.js')).text()
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const outcomes: {
  readonly case: string
  readonly locale: string
  readonly width: number
  readonly mode: string
  readonly coarse: boolean
}[] = []
const choices = ['ask', 'deny', 'sandbox', 'allow', 'inherit'] as const
function inputFor(locale: 'en-US' | 'zh-CN'): ApprovalFixtureInput {
  return {
    locale,
    copy: copies[locale],
    choice: 'inherit',
    planMode: 'default',
    planAvailable: true,
    planBlocked: false,
    draftId: 'original-draft',
    mode: 'light',
    behavior: 'resolve',
  }
}
async function mount(page: Page, input: ApprovalFixtureInput, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>
    html { font-size: ${width < 400 ? 20 : 16}px; }
    body { margin: 0; color: var(--lumen-ink); background: var(--lumen-canvas); }
    .approval-fixture { display: flex; min-inline-size: 0; min-block-size: 100dvh; flex-direction: column; padding: 1rem; box-sizing: border-box; }
    .approval-fixture-main { min-inline-size: 0; flex: 1 1 auto; }
    .approval-fixture-rail { display: flex; min-inline-size: 0; overflow-x: auto; }
  </style><div id="pre-session-approval-fixture"></div>`)
  await page.addScriptTag({ content: script })
  await page.evaluate((value) => window.renderApprovalFixture(value), input)
}
async function readToEnd(page: Page, reading: Locator): Promise<void> {
  await reading.focus()
  await page.keyboard.press('End')
  await expect
    .poll(() => reading.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop))
    .toBeLessThanOrEqual(1)
}
async function expectPointerTarget(control: Locator): Promise<void> {
  await expect
    .poll(() =>
      control.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const hit = element.ownerDocument.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        return hit !== null && element.contains(hit)
      }),
    )
    .toBe(true)
}
try {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const copy = copies[locale]
    const labels = getShellCopy(locale).session.permissionPicker
    for (const mode of ['light', 'dark'] as const) {
      for (const coarse of [false, true]) {
        const context = await browser.newContext({ hasTouch: coarse, reducedMotion: 'reduce' })
        try {
          const page = await context.newPage()
          page.setDefaultTimeout(10000)
          const errors: string[] = []
          page.on('pageerror', (error) => errors.push(error.message))
          await page.route('**/*', (route) => route.abort())
          for (const width of [1440, 1100, 900, 390, 320]) {
            console.log(`Checking ${locale} ${mode} ${coarse ? 'coarse' : 'fine'} ${width}`)
            const input: ApprovalFixtureInput = { ...inputFor(locale), mode }
            await mount(page, input, width)
            const trigger = page.locator('.hbar-pre-session-approval-picker > button')
            const picker = page.locator('.hbar-pre-session-approval-popover')
            await trigger.click()
            await expect(picker).toHaveAccessibleName(labels.title)
            await expect(picker.getByRole('menuitemradio')).toHaveCount(6)
            await expect(picker.locator('[data-choice="plan"] [data-text-context="choice.description"]')).toHaveText(
              labels.plan.description,
            )
            for (const choice of choices) {
              const row = picker.locator(`[data-choice="${choice}"]`)
              await expect(row.locator('[data-text-context="choice.title"]')).toHaveText(labels.options[choice].label)
              await expect(row.locator('[data-text-context="choice.description"]')).toHaveText(
                labels.options[choice].description + copy.longSuffix,
              )
            }
            const geometry = await picker.evaluate((element) => {
              const rect = element.getBoundingClientRect()
              const style = getComputedStyle(element)
              return {
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                width: innerWidth,
                height: innerHeight,
                portal: element.parentElement === document.body,
                blur: style.backdropFilter,
                layer: Number(style.zIndex),
                alignment: [...element.querySelectorAll('[data-text-context]')].map(
                  (text) => getComputedStyle(text).textAlign,
                ),
              }
            })
            expect(geometry.portal).toBe(true)
            expect(geometry.layer).toBeGreaterThanOrEqual(10000)
            expect(geometry.blur).toMatch(/blur\(/)
            expect(geometry.left).toBeGreaterThanOrEqual(0)
            expect(geometry.right).toBeLessThanOrEqual(geometry.width + 1)
            expect(geometry.top).toBeGreaterThanOrEqual(0)
            expect(geometry.bottom).toBeLessThanOrEqual(geometry.height + 1)
            expect(geometry.alignment.every((value) => ['left', 'start'].includes(value))).toBe(true)
            if (coarse && width < 640) await expect(picker).toBeFocused()
            else await expect(picker.locator('[data-choice="inherit"]')).toBeFocused()
            await page.keyboard.press('Home')
            await expect(picker.locator('[data-choice="ask"]')).toBeFocused()
            await page.keyboard.press('End')
            const inherited = picker.locator('[data-choice="inherit"]')
            await expect(inherited).toBeFocused()
            await expect(inherited).toBeInViewport()
            await inherited.dispatchEvent('keydown', { key: 'Home', isComposing: true })
            await expect(inherited).toBeFocused()
            await inherited.dispatchEvent('keydown', { key: 'Home', ctrlKey: true })
            await expect(inherited).toBeFocused()
            const reading = picker.getByRole('region', { name: labels.title, exact: true })
            expect(await reading.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
            await readToEnd(page, reading)
            await expect(reading).toBeFocused()
            await expect(picker.getByRole('button', { name: labels.close, exact: true })).toBeInViewport()
            await picker.locator('[data-choice="allow"]').click()
            await expect(picker).toHaveAccessibleName(labels.confirmTitle)
            const cancel = picker.getByRole('button', { name: labels.cancel, exact: true })
            const confirm = picker.getByRole('button', { name: labels.confirmAllow, exact: true })
            await expect(cancel).toBeFocused()
            const confirmation = picker.getByRole('region', { name: labels.confirmTitle, exact: true })
            await expect(confirmation.locator('[data-text-context="popover.body"]')).toHaveText(
              labels.confirmBody(copy.session) + copy.longSuffix.repeat(8),
            )
            await readToEnd(page, confirmation)
            await expect(cancel).toBeInViewport()
            await expect(confirm).toBeInViewport()
            await expectPointerTarget(confirm)
            if ((width === 1440 || width === 320) && !coarse)
              await page.screenshot({ path: resolve(output, `${locale}-${mode}-${width}.png`) })
            await cancel.click()
            await expect(picker.locator('[data-choice="allow"]')).toBeFocused()
            expect(await page.evaluate(() => window.readApprovalFixtureActions())).toEqual([])
            await page.keyboard.press('Escape')
            await expect(picker).toBeHidden()
            await expect(trigger).toBeFocused()
            await trigger.click()
            await page.locator('body').click({ position: { x: 2, y: 2 } })
            await expect(picker).toBeHidden()
            await trigger.click()
            await page.getByRole('button', { name: copy.other, exact: true }).click()
            await expect(picker).toBeHidden()
            const other = page.getByRole('dialog', { name: copy.other, exact: true })
            await expect(other).toBeVisible()
            await expect(page.locator('[data-lumen-floating-surface]:visible')).toHaveCount(1)
            await other.getByRole('button', { name: copy.close, exact: true }).click()
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
            expect(errors).toEqual([])
            outcomes.push({ case: 'long-options-confirmation-keyboard-surfaces', locale, width, mode, coarse })
            await page.evaluate(() => window.releaseApprovalFixture())
          }
        } finally {
          await context.close()
        }
      }
    }
  }
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  try {
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    await page.route('**/*', (route) => route.abort())
    const locale = 'zh-CN'
    const copy = copies[locale]
    const labels = getShellCopy(locale).session.permissionPicker
    for (const state of ['unsupported', 'available', 'selected', 'blocked', 'unsupported-selected'] as const) {
      console.log(`Checking finite choices ${state}`)
      const input: ApprovalFixtureInput = {
        ...inputFor(locale),
        mode: 'dark',
        planMode: state.endsWith('selected') ? 'plan' : 'default',
        planAvailable: state !== 'unsupported' && state !== 'unsupported-selected',
        planBlocked: state === 'blocked',
      }
      await mount(page, input, 320)
      const trigger = page.locator('.hbar-pre-session-approval-picker > button')
      const picker = page.locator('.hbar-pre-session-approval-popover')
      await trigger.click()
      await expect(picker.getByRole('menuitemradio')).toHaveCount(state === 'unsupported' ? 5 : 6)
      if (state.endsWith('selected')) {
        await expect(picker.getByRole('menuitem')).toHaveCount(1)
        await expect(picker.getByRole('menuitem')).toBeFocused()
        await picker.getByRole('menuitem').click()
        expect(await page.evaluate(() => window.readApprovalFixtureActions())).toEqual([
          { type: 'plan', mode: 'default', draftId: 'original-draft' },
        ])
      } else if (state === 'blocked') {
        await expect(picker.locator('[data-choice="plan"]')).toBeDisabled()
        await expect(picker.locator('[data-choice="plan"]')).toContainText(copy.blocked)
        await page.keyboard.press('End')
        await page.keyboard.press('ArrowUp')
        await expect(picker.locator('[data-choice="allow"]')).toBeFocused()
        expect(await page.evaluate(() => window.readApprovalFixtureActions())).toEqual([])
      } else {
        await picker.locator('[data-choice="inherit"]').click()
        await expect(picker).toBeHidden()
        expect(await page.evaluate(() => window.readApprovalFixtureActions())).toEqual([])
      }
      outcomes.push({ case: `finite-capacity-${state}`, locale, width: 320, mode: 'dark', coarse: false })
      await page.evaluate(() => window.releaseApprovalFixture())
    }
    for (const action of ['permission', 'plan'] as const) {
      for (const result of ['success', 'failure'] as const) {
        console.log(`Checking original target ${action} ${result}`)
        const input: ApprovalFixtureInput = { ...inputFor(locale), behavior: 'defer', mode: 'dark' }
        await mount(page, input, 320)
        const trigger = page.locator('.hbar-pre-session-approval-picker > button')
        const picker = page.locator('.hbar-pre-session-approval-popover')
        await trigger.click()
        await picker.locator(`[data-choice="${action === 'permission' ? 'allow' : 'plan'}"]`).click()
        if (action === 'permission')
          await picker.getByRole('button', { name: labels.confirmAllow, exact: true }).click()
        await expect(trigger).toHaveAttribute('aria-busy', 'true')
        if (action === 'permission')
          await expect(picker.getByRole('button', { name: labels.confirmAllow, exact: true })).toBeDisabled()
        const refreshed: ApprovalFixtureInput = { ...input, choice: 'sandbox', planAvailable: false }
        await page.evaluate((value) => window.renderApprovalFixture(value), refreshed)
        await picker.getByRole('button', { name: labels.close, exact: true }).click()
        await expect(picker).toBeHidden()
        await page.getByRole('button', { name: copy.other, exact: true }).click()
        const other = page.getByRole('dialog', { name: copy.other, exact: true })
        await other.getByRole('button', { name: copy.close, exact: true }).focus()
        await page.evaluate((value) => window.settleApprovalFixture(value), result)
        await expect(trigger).not.toHaveAttribute('aria-busy', 'true')
        await expect(other).toBeVisible()
        await expect(other.getByRole('button', { name: copy.close, exact: true })).toBeFocused()
        expect(await page.evaluate(() => window.readApprovalFixtureActions())).toEqual([
          action === 'permission'
            ? { type: 'permission', choice: 'allow', confirmAllow: true, draftId: 'original-draft' }
            : { type: 'plan', mode: 'plan', draftId: 'original-draft' },
        ])
        if (result === 'failure') await expect(page.getByRole('alert')).toHaveText(copy.error)
        else await expect(page.getByRole('alert')).toHaveCount(0)
        await other.getByRole('button', { name: copy.close, exact: true }).click()
        const retry: ApprovalFixtureInput = { ...input, behavior: 'resolve' }
        await page.evaluate((value) => window.renderApprovalFixture(value), retry)
        await trigger.click()
        await picker.locator('[data-choice="deny"]').click()
        await expect(picker).toBeHidden()
        await expect(page.getByRole('alert')).toHaveCount(0)
        outcomes.push({
          case: `original-target-${action}-${result}-close-later-focus-retry`,
          locale,
          width: 320,
          mode: 'dark',
          coarse: false,
        })
        await page.evaluate(() => window.releaseApprovalFixture())
      }
    }
    const thrown: ApprovalFixtureInput = { ...inputFor(locale), behavior: 'throw' }
    await mount(page, thrown, 320)
    const trigger = page.locator('.hbar-pre-session-approval-picker > button')
    const picker = page.locator('.hbar-pre-session-approval-popover')
    await trigger.click()
    await picker.locator('[data-choice="allow"]').click()
    await picker.getByRole('button', { name: labels.confirmAllow, exact: true }).click()
    await expect(picker.getByRole('alert')).toHaveText(copy.error)
    await expect(picker.getByRole('alert')).toHaveAttribute('data-text-context', 'feedback.paragraph')
    await readToEnd(page, picker.getByRole('region', { name: labels.confirmTitle, exact: true }))
    await expect(picker.getByRole('button', { name: labels.confirmAllow, exact: true })).toBeInViewport()
    const recovered: ApprovalFixtureInput = { ...thrown, behavior: 'resolve' }
    await page.evaluate((value) => window.renderApprovalFixture(value), recovered)
    await picker.getByRole('button', { name: labels.confirmAllow, exact: true }).click()
    await expect(picker).toBeHidden()
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(await page.evaluate(() => window.readApprovalFixtureActions())).toEqual([
      { type: 'permission', choice: 'allow', confirmAllow: true, draftId: 'original-draft' },
      { type: 'permission', choice: 'allow', confirmAllow: true, draftId: 'original-draft' },
    ])
    outcomes.push({
      case: 'allow-confirmation-failure-visible-full-reading-retry',
      locale,
      width: 320,
      mode: 'light',
      coarse: false,
    })
    await page.evaluate(() => window.releaseApprovalFixture())
    for (const locale of ['en-US', 'zh-CN'] as const) {
      const labels = getShellCopy(locale).session.permissionPicker
      const input: ApprovalFixtureInput = {
        ...inputFor(locale),
        copy: { ...copies[locale], longActionSuffix: copies[locale].longSuffix },
      }
      await mount(page, input, 320)
      const picker = page.locator('.hbar-pre-session-approval-popover')
      await page.locator('.hbar-pre-session-approval-picker > button').click()
      await picker.locator('[data-choice="allow"]').click()
      const cancel = picker.getByRole('button', { name: labels.cancel + input.copy.longActionSuffix, exact: true })
      const confirm = picker.getByRole('button', {
        name: labels.confirmAllow + input.copy.longActionSuffix,
        exact: true,
      })
      await confirm.focus()
      await expect
        .poll(() => picker.locator('.hbar-composer-permission-actions').evaluate((element) => element.scrollLeft))
        .toBeGreaterThan(0)
      await confirm.press('Shift+Tab')
      await expect(cancel).toBeFocused()
      await cancel.press('Enter')
      await expect(picker.locator('[data-choice="allow"]')).toBeFocused()
      expect(await page.evaluate(() => window.readApprovalFixtureActions())).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      outcomes.push({
        case: 'long-action-labels-horizontal-reading-keyboard',
        locale,
        width: 320,
        mode: 'light',
        coarse: false,
      })
      await page.evaluate(() => window.releaseApprovalFixture())
    }
  } finally {
    await context.close()
  }
  await Bun.write(resolve(output, 'verification.json'), JSON.stringify(outcomes, null, 2) + '\n')
  console.log(`${outcomes.length} real browser pre-session approval scenarios passed.`)
} finally {
  await browser.close()
}
