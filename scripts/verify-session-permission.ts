import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect, type Page } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import type { SessionPermissionFixtureInput } from '../tests/fixtures/session-permission-browser'
import { verifyReadableText } from './support/verify-readable-text'

function fixture(locale: ShellLocale, mode: 'light' | 'dark' = 'light'): SessionPermissionFixtureInput {
  return {
    locale,
    mode,
    sessionId: 'a',
    sessionLabel: 'Original session 原会话 A',
    entry: { sessionId: 'a', choice: 'inherit', revision: 3, status: 'idle', locked: false, error: null },
    hostDefault: { status: 'ready', mode: 'ask', error: null },
    connected: true,
    disabled: false,
    canPrepare: true,
    plan: { entry: { sessionId: 'a', mode: 'default', revision: 9, status: 'ready', error: null } },
    copy: {
      outside: locale === 'zh-CN' ? '会话原草稿' : 'Original session draft',
      draft: '原始未发送草稿 — complete original draft',
      attachment: 'original-attachment-id',
    },
  }
}
const output = resolve('artifacts/desktop-elements/session-permission')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/session-permission-browser.tsx'),
      name: 'SessionPermissionFixture',
      formats: ['iife'],
      fileName: 'permission',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/permission.css')).text()
const script = await Bun.file(resolve(output, 'bundle/permission.iife.js')).text()
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const errors: string[] = []
let scenarios = 0
async function mount(page: Page, input: SessionPermissionFixtureInput, width = 1440): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>
    html { font-size:${width < 400 ? 20 : 16}px; } body { margin:0; color:var(--lumen-ink); background:var(--lumen-canvas); }
    .session-permission-fixture { display:flex; flex-direction:column; min-inline-size:0; min-block-size:100dvh; padding:1rem; box-sizing:border-box; }
    .session-permission-fixture-main { min-inline-size:0; flex:1 1 auto; }
    .session-permission-fixture-rail { display:flex; min-inline-size:0; overflow-x:auto; }
  </style><div id="session-permission-fixture"></div>`)
  await page.addScriptTag({ content: script })
  await page.evaluate((value) => window.mountSessionPermissionFixture(value), input)
}
async function open(page: Page) {
  const trigger = page.locator('.hbar-composer-permission-trigger')
  await trigger.click()
  const menu = page.getByRole('dialog')
  await expect(menu).toBeVisible()
  await expect(menu).toHaveAttribute('data-positioned', 'true')
  return { trigger, menu }
}
async function intact(page: Page, input: SessionPermissionFixtureInput) {
  await expect(page.getByRole('textbox', { name: input.copy.outside })).toHaveValue(input.copy.draft)
  await expect(page.getByTestId('fixture-attachment')).toHaveText(input.copy.attachment)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
}
try {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const labels = getShellCopy(locale).session.permissionPicker
    for (const mode of ['light', 'dark'] as const) {
      for (const coarse of [false, true]) {
        const context = await browser.newContext({ hasTouch: coarse, reducedMotion: 'reduce' })
        try {
          const page = await context.newPage()
          page.on('pageerror', (error) => errors.push(error.message))
          for (const width of [1440, 1100, 900, 390, 320]) {
            for (const withPlan of [false, true]) {
              const original = fixture(locale, mode)
              const input = withPlan ? original : { ...original, plan: undefined }
              await mount(page, input, width)
              const { trigger, menu } = await open(page)
              await expect(menu).toHaveAccessibleName(labels.title)
              await expect(menu.getByRole('menuitemradio')).toHaveCount(withPlan ? 6 : 5)
              expect(
                await menu
                  .getByRole('menuitemradio')
                  .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-choice'))),
              ).toEqual(
                withPlan
                  ? ['ask', 'deny', 'sandbox', 'allow', 'plan', 'inherit']
                  : ['ask', 'deny', 'sandbox', 'allow', 'inherit'],
              )
              await expect(menu.getByRole('menuitemradio', { checked: true })).toHaveCount(1)
              if (coarse && width < 400) await expect(menu).toBeFocused()
              else await expect(menu.locator('[data-choice="inherit"]')).toBeFocused()
              await expect(menu).toContainText(labels.scopeHint)
              await expect(menu.locator('[data-choice="sandbox"]')).toContainText(labels.options.sandbox.description)
              if (withPlan && width >= 900)
                await expect(menu.locator('[data-choice="plan"]')).toBeInViewport({ ratio: 1 })
              expect(await menu.evaluate((node) => node.parentElement === document.body)).toBe(true)
              const style = await menu.evaluate((node) => ({
                blur: getComputedStyle(node).backdropFilter,
                align: getComputedStyle(node).textAlign,
                top: node.getAttribute('data-top-layer'),
              }))
              expect(style.blur).toContain('blur(')
              expect(style.align).toBe('start')
              expect(style.top).toBe('true')
              const bounds = await menu.boundingBox()
              if (!bounds) throw new Error('Visible permission menu has no bounds')
              expect(bounds.x).toBeGreaterThanOrEqual(0)
              expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1)
              expect(bounds.y + bounds.height).toBeLessThanOrEqual(901)
              if (width < 400) await expect(menu).toHaveAttribute('data-mobile-sheet', 'true')
              else {
                const anchor = await trigger.boundingBox()
                if (!anchor) throw new Error('Permission trigger has no bounds')
                expect(Math.abs(bounds.x - anchor.x)).toBeLessThanOrEqual(1)
                expect(bounds.y + bounds.height).toBeLessThan(anchor.y)
              }
              await menu.locator('[data-choice="inherit"]').focus()
              await page.keyboard.press('Home')
              await expect(menu.locator('[data-choice="ask"]')).toBeFocused()
              await page.keyboard.press('End')
              await expect(menu.locator('[data-choice="inherit"]')).toBeFocused()
              await menu.locator('[data-choice="inherit"]').evaluate((node) => {
                node.dispatchEvent(
                  new KeyboardEvent('keydown', { key: 'ArrowUp', isComposing: true, keyCode: 229, bubbles: true }),
                )
              })
              await expect(menu.locator('[data-choice="inherit"]')).toBeFocused()
              await menu.locator('[data-choice="allow"]').click()
              await expect(menu).toHaveAccessibleName(labels.confirmTitle)
              await expect(menu.getByRole('button', { name: labels.cancel, exact: true })).toBeFocused()
              await expect(menu).toContainText(labels.confirmBody(input.sessionLabel))
              await menu.getByRole('button', { name: labels.cancel, exact: true }).click()
              await expect(menu.locator('[data-choice="allow"]')).toBeFocused()
              await page.keyboard.press('Escape')
              await expect(menu).toHaveCount(0)
              await expect(trigger).toBeFocused()
              await trigger.click()
              if (width < 400) await menu.getByRole('button', { name: labels.close, exact: true }).click()
              else await trigger.click()
              await expect(menu).toHaveCount(0)
              await trigger.click()
              await menu.locator('[data-choice="inherit"]').click()
              await expect(menu).toHaveCount(0)
              expect(await page.evaluate(() => window.sessionPermissionCalls())).toEqual([])
              await intact(page, input)
              scenarios++
            }
          }
        } finally {
          await context.close()
        }
      }
    }
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    try {
      const page = await context.newPage()
      page.on('pageerror', (error) => errors.push(error.message))
      const base = fixture(locale)
      const states = [
        undefined,
        { sessionId: 'a', mode: null, revision: 9, status: 'loading', error: null },
        { sessionId: 'a', mode: null, revision: 9, status: 'pending', error: null },
        { sessionId: 'a', mode: null, revision: 9, status: 'pending', reading: true, error: null },
        { sessionId: 'a', mode: null, revision: 9, status: 'unknown', error: 'RESULT_UNKNOWN' },
        { sessionId: 'a', mode: null, revision: 9, status: 'unknown', reading: true, error: null },
        { sessionId: 'a', mode: 'default', revision: 9, status: 'failed', error: 'PRIVATE_HOST_PAYLOAD' },
        { sessionId: 'b', mode: 'plan', revision: 9, status: 'ready', error: null },
      ] as const
      for (const entry of states) {
        const input: SessionPermissionFixtureInput = { ...base, plan: { entry }, disabled: true, canPrepare: false }
        await mount(page, input, 320)
        const { trigger, menu } = await open(page)
        await expect(menu.getByRole('menuitemradio')).toHaveCount(6)
        await expect(menu.getByRole('menuitemradio', { checked: true })).toHaveCount(0)
        for (const option of await menu.getByRole('menuitemradio').all()) await expect(option).toBeDisabled()
        await expect(menu).toContainText(labels.execution.approvalFrozen)
        await expect(menu).not.toContainText('PRIVATE_HOST_PAYLOAD')
        const recoveryRegion = menu.locator('[data-execution-recovery-region]')
        await expect(recoveryRegion).toHaveCount(1)
        expect(
          await recoveryRegion.evaluate((node) => {
            const options = node.parentElement?.querySelector('[role="menu"]')
            return Boolean(options && node.compareDocumentPosition(options) & Node.DOCUMENT_POSITION_FOLLOWING)
          }),
        ).toBe(true)
        await expect(menu).toContainText(labels.plan.scope)
        await expect(menu.getByRole('button', { name: labels.close, exact: true })).toBeEnabled()
        if (entry?.status === 'unknown' || entry?.status === 'failed' || !entry || entry.sessionId !== 'a') {
          const recovery = menu.locator('[data-execution-recovery]')
          await expect(recovery).toHaveCount(1)
          if (entry && 'reading' in entry && entry.reading)
            await expect(recovery).toHaveAttribute('aria-disabled', 'true')
          else await expect(recovery).toBeEnabled()
        }
        await page.keyboard.press('Escape')
        await expect(trigger).toBeFocused()
        expect(await page.evaluate(() => window.sessionPermissionCalls())).toEqual([])
        await intact(page, input)
        scenarios++
      }
      for (const width of [1440, 320]) {
        for (const path of ['removed', 'escape', 'later', 'failure', 'closed-failure'] as const) {
          const input: SessionPermissionFixtureInput = {
            ...base,
            plan: { ...base.plan, entry: base.plan?.entry, disabled: true, goalRevision: 7 },
            behavior: { goal: 'deferred' },
          }
          await mount(page, input, width)
          const { trigger, menu } = await open(page)
          await expect(menu.locator('[data-choice="plan"]')).toBeDisabled()
          await expect(menu.locator('[data-choice="plan"]')).toHaveAttribute('aria-describedby', /.+/)
          await menu.getByRole('button', { name: labels.plan.cancelGoalPreparation, exact: true }).click()
          const pending = menu.getByRole('button', { name: labels.plan.cancellingGoalPreparation, exact: true })
          await expect(pending).toBeFocused()
          await expect(pending).toHaveAttribute('aria-busy', 'true')
          await page.keyboard.press('Enter')
          await expect
            .poll(() => page.evaluate(() => window.sessionPermissionCalls()))
            .toEqual([{ kind: 'goal', target: { sessionId: 'a', expectedRevision: 7 } }])
          if (path === 'escape' || path === 'closed-failure') {
            await page.keyboard.press('Escape')
            await expect(trigger).toBeFocused()
          } else if (path === 'later') await page.getByRole('textbox', { name: input.copy.outside }).focus()
          const outcome: 'resolve' | 'reject' = path === 'failure' || path === 'closed-failure' ? 'reject' : 'resolve'
          await page.evaluate((value) => window.settleSessionPermissionFixture(value), outcome)
          if (path === 'removed') {
            await expect(menu.locator('[data-choice="plan"]')).toBeFocused()
            await expect(menu.locator('[data-choice="plan"]')).toBeEnabled()
            await expect(
              menu.getByRole('button', { name: labels.plan.cancelGoalPreparation, exact: true }),
            ).toHaveCount(0)
          } else if (path === 'escape' || path === 'closed-failure') {
            await expect(menu).toHaveCount(0)
            await expect(trigger).toBeFocused()
            if (path === 'closed-failure')
              await expect(page.getByRole('alert')).toHaveText(labels.error('EXECUTION_FAILED'))
          } else if (path === 'later')
            await expect(page.getByRole('textbox', { name: input.copy.outside })).toBeFocused()
          else {
            await expect(menu).toContainText(labels.error('EXECUTION_FAILED'))
            await expect(
              menu.getByRole('button', { name: labels.plan.cancelGoalPreparation, exact: true }),
            ).toBeFocused()
          }
          expect(await page.evaluate(() => window.sessionPermissionCalls())).toHaveLength(1)
          await intact(page, input)
          scenarios++
        }
      }
      for (const source of ['default', 'plan'] as const) {
        const input: SessionPermissionFixtureInput = {
          ...base,
          plan: { entry: { sessionId: 'a', mode: source, revision: 9, status: 'ready', error: null } },
          behavior: { approval: 'deferred' },
        }
        await mount(page, input)
        const { trigger, menu } = await open(page)
        if (source === 'plan') {
          await expect(menu.locator('[data-plan-exit]')).toBeFocused()
          await expect(menu.locator('[data-choice="plan"]')).toBeInViewport({ ratio: 1 })
          await expect(menu).toContainText(labels.plan.scope)
          await expect(menu).not.toContainText(labels.scopeHint)
          await expect(menu.locator('[data-choice="plan"]')).toHaveAttribute('aria-checked', 'true')
          await expect(menu.locator('[data-choice="plan"]')).toContainText(labels.plan.selected)
          await expect(menu.locator('[data-plan-exit]')).toContainText(labels.plan.exitDescription)
        }
        await menu.locator('[data-choice="allow"]').click()
        await menu.getByRole('button', { name: labels.confirmAllow, exact: true }).click()
        await expect
          .poll(() => page.evaluate(() => window.sessionPermissionCalls()))
          .toEqual([
            {
              kind: 'approval',
              target: { sessionId: 'a', choice: 'allow', expectedRevision: 3, confirmAllow: true },
              ...(source === 'plan' ? { modeRevision: 9 } : {}),
            },
          ])
        await page.keyboard.press('Escape')
        await expect(trigger).toBeFocused()
        await trigger.click()
        await expect(menu).toBeVisible()
        await page.evaluate(() => window.settleSessionPermissionFixture('resolve'))
        await expect(trigger).not.toHaveAttribute('aria-busy', 'true')
        await expect(menu).toBeVisible()
        await intact(page, input)
        scenarios++
      }
      const readInput: SessionPermissionFixtureInput = {
        ...base,
        plan: { entry: { sessionId: 'a', mode: null, revision: 9, status: 'unknown', error: 'RESULT_UNKNOWN' } },
        behavior: { read: 'deferred' },
        readResult: { planEntry: { sessionId: 'a', mode: 'default', revision: 10, status: 'ready', error: null } },
      }
      await mount(page, readInput)
      const reading = await open(page)
      const recovery = reading.menu.locator('[data-execution-recovery]')
      await expect(recovery).toBeFocused()
      await recovery.click()
      await expect(recovery).toBeFocused()
      await expect(recovery).toHaveAttribute('aria-busy', 'true')
      await page.keyboard.press('Enter')
      expect(await page.evaluate(() => window.sessionPermissionCalls())).toEqual([
        { kind: 'read', sessionId: 'a', owner: 'plan', reconcile: true },
      ])
      await page.evaluate(() => window.settleSessionPermissionFixture('resolve'))
      await expect(reading.menu.locator('[data-choice="inherit"]')).toBeFocused()
      await intact(page, readInput)
      scenarios++
      const late: SessionPermissionFixtureInput = { ...base, behavior: { approval: 'deferred' } }
      await mount(page, late)
      const writing = await open(page)
      await writing.menu.locator('[data-choice="deny"]').click()
      await expect.poll(() => page.evaluate(() => window.sessionPermissionCalls().length)).toBe(1)
      await page.evaluate(() =>
        window.updateSessionPermissionFixture({
          sessionId: 'b',
          sessionLabel: 'Later session B',
          entry: { sessionId: 'b', choice: 'ask', revision: 12, status: 'idle', locked: false, error: null },
          plan: { entry: { sessionId: 'b', mode: 'default', revision: 15, status: 'ready', error: null } },
        }),
      )
      await expect(writing.menu).toHaveCount(0)
      const draft = page.getByRole('textbox', { name: base.copy.outside })
      await draft.fill('Later B draft 后续草稿')
      await page.evaluate(() => window.settleSessionPermissionFixture('reject'))
      await expect(draft).toBeFocused()
      await expect(draft).toHaveValue('Later B draft 后续草稿')
      await expect(page.getByRole('alert')).toHaveCount(0)
      expect(await page.evaluate(() => window.sessionPermissionCalls())).toEqual([
        { kind: 'approval', target: { sessionId: 'a', choice: 'deny', expectedRevision: 3 } },
      ])
      scenarios++
      const long =
        locale === 'zh-CN'
          ? '保留完整原始内容并在受限阅读区域通过键盘读取所有本地化说明。'.repeat(20)
          : 'Keep the full original localized content readable with real keyboard navigation. '.repeat(20)
      const longInput: SessionPermissionFixtureInput = {
        ...base,
        copy: {
          ...base.copy,
          title: long,
          confirmTitle: long,
          confirmBody: long.repeat(8),
          cancel: long,
          confirmAllow: long,
          optionSuffix: long,
        },
      }
      await mount(page, longInput, 320)
      const longMenu = await open(page)
      const title = longMenu.menu.locator('[data-text-context="popover.title"]')
      await verifyReadableText(title, long, true)
      const titleReading = longMenu.menu.locator('.hbar-composer-permission-title-reading')
      expect(
        await titleReading.evaluate((node) => node.scrollHeight > node.clientHeight),
        'Long title has a vertical reader',
      ).toBe(true)
      await titleReading.focus()
      await page.keyboard.press('End')
      await expect
        .poll(() => titleReading.evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop))
        .toBeLessThanOrEqual(1)
      await longMenu.menu.locator('[data-choice="allow"]').click()
      await verifyReadableText(title, long, true)
      const body = longMenu.menu.locator('.hbar-composer-permission-body')
      await expect(body).toHaveText(long.repeat(8))
      expect(
        await body.evaluate((node) => node.scrollHeight > node.clientHeight),
        'Long confirmation body has a vertical reader',
      ).toBe(true)
      await body.focus()
      await page.keyboard.press('End')
      await expect
        .poll(() => body.evaluate((node) => node.scrollTop >= node.scrollHeight - node.clientHeight - 2))
        .toBe(true)
      await expect(longMenu.menu.getByRole('button', { name: long, exact: true })).toHaveCount(2)
      expect(
        await longMenu.menu
          .locator('.hbar-composer-permission-actions')
          .evaluate((node) => node.scrollWidth > node.clientWidth),
      ).toBe(true)
      await page.screenshot({ path: resolve(output, `long-${locale}-320.png`) })
      await intact(page, longInput)
      scenarios++
    } finally {
      await context.close()
    }
  }
  expect(errors).toEqual([])
  await Bun.write(resolve(output, 'results.json'), JSON.stringify({ scenarios, errors }, null, 2))
  console.log(`${scenarios} actual session permission scenarios passed.`)
} catch (reason) {
  await Bun.write(
    resolve(output, 'failure.json'),
    JSON.stringify({ scenarios, errors, reason: String(reason) }, null, 2),
  )
  console.error({ scenarios, errors })
  throw reason
} finally {
  await browser.close()
}
