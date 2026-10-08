import { expect, test, type Browser, type Page } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { build, preview, type PreviewServer } from 'vite'
import { createServer } from 'node:net'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { codeBlockCopyLabels } from '../apps/web/src/code-block-copy-labels'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'

const root = join(process.cwd(), 'artifacts/code-block-copy/lifecycle')
const evidence = join(root, 'evidence')
const base = 'http://127.0.0.1:45544'
const repeated = 'const repeated = true\nconsole.log(repeated)'
const longCode = Array.from({ length: 25 }, (_, index) => `line-${String(index + 1).padStart(2, '0')}`).join('\n')
let server: PreviewServer | undefined
test.beforeAll(async () => {
  test.setTimeout(90_000)
  await new Promise<void>((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(45544, '127.0.0.1', () => probe.close((error) => (error ? reject(error) : resolve())))
  })
  await mkdir(evidence, { recursive: true })
  await writeFile(
    join(root, 'index.html'),
    '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>.code-copy-fixture{display:flex;flex-direction:column;gap:1rem;padding:1rem;min-inline-size:0;box-sizing:border-box}.code-copy-fixture-controls{display:flex;flex-wrap:wrap;gap:.5rem}.code-copy-fixture-controls button{white-space:normal;min-inline-size:0;max-inline-size:100%}.code-copy-fixture-writes{display:flex;flex-direction:column;min-inline-size:0}.code-copy-fixture-writes pre{overflow:auto;max-inline-size:100%}</style></head><body><div id="root"></div><script type="module" src="../../../tests/fixtures/code-block-copy-browser.tsx"></script></body></html>',
  )
  await build({
    configFile: false,
    root,
    plugins: [react()],
    resolve: { dedupe: ['react', 'react-dom'] },
    build: { outDir: join(root, 'web'), emptyOutDir: true },
  })
  server = await preview({
    configFile: false,
    root,
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port: 45544, strictPort: true },
  })
})
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
})
async function open(browser: Browser, locale: ShellLocale, longLabels = false, filePreview = false) {
  const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
  const errors: string[] = []
  const forbidden: string[] = []
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== base || /^\/(api|auth|rpc)(\/|$)/.test(url.pathname)) {
      forbidden.push(url.href)
      return route.abort()
    }
    return route.continue()
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') errors.push(`${message.type()}: ${message.text()}`)
  })
  await page.goto(`${base}/?${longLabels ? 'long-labels&' : ''}${filePreview ? 'file-preview' : ''}`)
  await expect(page.locator('[data-fixture-output]')).toBeVisible()
  return { page, context, errors, forbidden }
}

test('syntax reading keeps one source, whole comment state, Copy and live Find remapping', async ({
  browser,
}, info) => {
  const f = await open(browser, 'en-US')
  try {
    const labels = codeBlockCopyLabels('en-US')
    await action(f.page, 'highlight-stream')
    const block = f.page.locator('.hbar-message-code')
    const source = `/*\n${Array.from({ length: 22 }, (_, i) => `const hidden${i} = "still comment"`).join('\n')}\n*/\nexport const ready = true\nconsole.log("完成 👩‍💻", 42)`
    await expect(block.locator('code')).toHaveAttribute('data-code-highlight', 'plain')
    await expect(block.locator('code')).toHaveText(`${source}\n`)
    await expect(block.locator('[data-code-tail]')).toBeHidden()
    await action(f.page, 'find')
    const activeText = () =>
      f.page.evaluate(() =>
        [...(CSS.highlights.get('hbar-session-find-active') ?? [])].map((range) => range.toString()).join(''),
      )
    await expect.poll(activeText).toBe('const hidden21')
    await expect(block.locator('[data-code-tail]')).toBeVisible()
    // Settling streaming inserts token spans. A live observer must remap an
    // already active Find range, not only succeed on a new Find operation.
    await action(f.page, 'highlight')
    await expect(block.locator('code')).toHaveAttribute('data-code-highlight', 'ready')
    await expect(block.locator('code')).toHaveText(`${source}\n`)
    await f.page.evaluate(async () => {
      for (let i = 0; i < 3; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    })
    await expect.poll(activeText).toBe('const hidden21')
    await expect(
      block.locator('[data-code-tail] [data-code-token="comment"]').filter({ hasText: 'const hidden21' }),
    ).toHaveCount(1)
    await expect(block.locator('[data-code-token="keyword"]').filter({ hasText: 'export' })).toHaveCount(1)
    await copy(f.page)
    await expect(f.page.locator('[data-write-index="0"]')).toHaveText(source)
    await action(f.page, 'resolve')
    await expect(block.getByRole('button', { name: labels.copied, exact: true })).toBeVisible()
    await f.page.screenshot({ path: info.outputPath('highlight-reading-find-copy-en-US.png') })
    const keyword = block.locator('[data-code-token="keyword"]').first()
    const lightColor = await keyword.evaluate((element) => getComputedStyle(element).color)
    expect(lightColor).not.toBe(await block.locator('pre').evaluate((element) => getComputedStyle(element).color))
    await f.page.evaluate(() => {
      const provider = document.querySelector<HTMLElement>('[data-lumen-mode="light"]')
      if (!provider) throw new Error('Missing owned light provider')
      provider.dataset.lumenMode = 'dark'
    })
    const darkColor = await keyword.evaluate((element) => getComputedStyle(element).color)
    expect(darkColor).not.toBe(lightColor)
    expect(darkColor).not.toBe(await block.locator('pre').evaluate((element) => getComputedStyle(element).color))
    await action(f.page, 'b')
    await expect(block.locator('code')).toHaveText('const source = "B"\n')
    await expect(block.locator('code')).toHaveAttribute('data-code-highlight', 'ready')
    await expect(block.locator('[data-code-token="comment"]')).toHaveCount(0)
    expect(f.errors).toEqual([])
    expect(f.forbidden).toEqual([])
  } finally {
    await f.context.close()
  }
})

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`file code Copy retains the original source and pane-owned actions: ${locale}`, async ({ browser }) => {
    const f = await open(browser, locale, true, true)
    try {
      const labels = codeBlockCopyLabels(locale)
      await expect(copies(f.page)).toHaveCount(2)
      await copy(f.page)
      await copy(f.page, 1)
      await count(f.page, 2)
      await expect(f.page.locator('[data-write-index="0"]')).toHaveText(repeated)
      await expect(f.page.locator('[data-write-index="1"]')).toHaveText(repeated)
      await action(f.page, 'b')
      await action(f.page, 'a')
      await action(f.page, 'resolve')
      await action(f.page, 'reject')
      await status(f.page, 'idle')
      await status(f.page, 'idle', 1)
      await copy(f.page)
      await action(f.page, 'reject')
      await expect(copies(f.page).first().getByRole('alert')).toBeVisible()
      await copies(f.page).first().getByRole('button', { name: labels.retry, exact: true }).click()
      await count(f.page, 4)
      await action(f.page, 'owner')
      await action(f.page, 'resolve')
      await status(f.page, 'idle')
      await action(f.page, 'unavailable')
      await copies(f.page).first().getByRole('button').click()
      await status(f.page, 'unavailable')
      await count(f.page, 4)
      await action(f.page, 'available')
      await action(f.page, 'long')
      const block = f.page.locator('.hbar-file-markdown-code')
      await expect(block.locator('[data-code-tail]')).toBeHidden()
      await copy(f.page)
      await expect(f.page.locator('[data-write-index]').last()).toHaveText(longCode)
      await action(f.page, 'resolve')
      await status(f.page, 'copied')
      const more = block.getByRole('button', { name: labels.showMore(5), exact: true })
      await more.focus()
      await more.press('Enter')
      await expect(block.getByRole('button', { name: labels.showLess, exact: true })).toBeFocused()
      await expect(block.locator('[data-code-tail]')).toBeVisible()
      await f.page.setViewportSize({ width: locale === 'zh-CN' ? 320 : 1440, height: 960 })
      expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await block.screenshot({ path: join(evidence, `file-code-${locale}.png`) })
      expect(f.errors).toEqual([])
      expect(f.forbidden).toEqual([])
    } finally {
      await f.context.close()
    }
  })
  test(`PlanExit code Copy stays readable across decisions, offline and owner lifetimes: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const f = await open(browser, locale)
    try {
      const labels = getShellCopy(locale).session.decisions.planExit
      const codeLabels = codeBlockCopyLabels(locale)
      const change = (name: string) => f.page.locator(`[data-plan-exit-action="${name}"]`).click()
      await action(f.page, 'plan-exit')
      const card = f.page.locator('[data-decision-kind="planExit"]')
      const long = card.locator('.hbar-message-code').nth(1)
      const feedback = card.getByRole('textbox', { name: labels.feedback, exact: true })
      const draft = `Unsubmitted PlanExit feedback — ${locale}`
      await feedback.fill(draft)
      await expect(copies(f.page)).toHaveCount(2)
      await expect(card).toHaveAttribute('data-decision-id', 'plan-exit-a')
      await expect(long.locator('[data-code-tail]')).toBeHidden()
      await copy(f.page)
      expect(await f.page.locator('[data-write-index]').last().textContent()).toBe('const currentApproval = true;')
      await action(f.page, 'resolve')
      await status(f.page, 'copied')
      await expect(feedback).toHaveValue(draft)
      await copy(f.page, 1)
      expect(await f.page.locator('[data-write-index]').last().textContent()).toBe(longCode)
      await action(f.page, 'reject')
      await status(f.page, 'failed', 1)
      await expect(feedback).toHaveValue(draft)
      await copies(f.page).nth(1).getByRole('button', { name: codeLabels.retry, exact: true }).click()
      await status(f.page, 'copying', 1)
      await action(f.page, 'resolve')
      await status(f.page, 'copied', 1)
      await expect(feedback).toHaveValue(draft)
      for (const width of [1440, 320]) {
        await f.page.setViewportSize({ width, height: 960 })
        expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await card.screenshot({ path: join(evidence, `plan-exit-pending-${locale}-${width}.png`) })
      }

      await change('offline')
      await expect(feedback).toBeDisabled()
      await expect(feedback).toHaveValue(draft)
      await expect(card.getByRole('button', { name: labels.implement, exact: true })).toBeDisabled()
      await status(f.page, 'idle')
      await copy(f.page)
      expect(await f.page.locator('[data-write-index]').last().textContent()).toBe('const currentApproval = true;')
      await action(f.page, 'resolve')
      await status(f.page, 'copied')
      await expect(feedback).toHaveValue(draft)
      await card.screenshot({ path: join(evidence, `plan-exit-offline-${locale}-320.png`) })

      for (const decision of ['allowed', 'denied'] as const) {
        await change(decision)
        await expect(card).toHaveAttribute('data-complete', 'true')
        await expect(feedback).toHaveCount(0)
        await expect(card.getByRole('button', { name: labels.implement, exact: true })).toHaveCount(0)
        await status(f.page, 'idle')
        await copy(f.page)
        expect(await f.page.locator('[data-write-index]').last().textContent()).toBe('const currentApproval = true;')
        await action(f.page, 'resolve')
        await status(f.page, 'copied')
        if (decision === 'denied') await expect(card.locator('.hbar-plan-exit-confirmed-feedback')).toHaveText(draft)
        await card.screenshot({ path: join(evidence, `plan-exit-${decision}-${locale}-320.png`) })
      }

      await change('pending')
      await change('online')
      await expect(feedback).toHaveValue(draft)
      await long.getByRole('button', { name: codeLabels.showMore(5), exact: true }).click()
      await expect(long).toHaveAttribute('data-expanded', 'true')
      await status(f.page, 'idle')
      await copy(f.page)
      await change('owner')
      await status(f.page, 'idle')
      await expect(long).toHaveAttribute('data-expanded', 'false')
      await expect(long.locator('[data-code-tail]')).toBeHidden()
      await action(f.page, 'resolve')
      await status(f.page, 'idle')
      await expect(copies(f.page).first()).not.toContainText(codeLabels.copied)
      await expect(feedback).toHaveValue(draft)

      await copy(f.page)
      await change('replacement')
      await expect(card).toHaveAttribute('data-decision-id', 'plan-exit-b')
      await expect(feedback).toHaveValue('')
      const replacementDraft = `Independent replacement feedback — ${locale}`
      await feedback.fill(replacementDraft)
      await action(f.page, 'resolve')
      await status(f.page, 'idle')
      await expect(feedback).toHaveValue(replacementDraft)
      await expect(copies(f.page).first()).not.toContainText(codeLabels.copied)
      await copy(f.page)
      expect(await f.page.locator('[data-write-index]').last().textContent()).toBe('const replacementApproval = true;')
      await action(f.page, 'resolve')
      await status(f.page, 'copied')
      await expect(feedback).toHaveValue(replacementDraft)
      await expect(f.page.locator('[data-plan-exit-fixture]')).toHaveAttribute(
        'data-plan-exit-effects',
        JSON.stringify({ planExit: 0, decision: 0, reconcile: 0, answer: 0, submit: 0 }),
      )
      await card.screenshot({ path: join(evidence, `plan-exit-replacement-${locale}-320.png`) })

      // A same-owner append is intentionally different from the owner-only
      // replacement above: adding prose must not refold the existing code.
      await action(f.page, 'long')
      const ordinary = f.page.locator('[data-fixture-output] .hbar-message-code')
      await ordinary.getByRole('button', { name: codeLabels.showMore(5), exact: true }).click()
      await expect(ordinary).toHaveAttribute('data-expanded', 'true')
      await action(f.page, 'long-stream')
      await expect(ordinary).toHaveAttribute('data-expanded', 'true')
      await expect(ordinary.locator('[data-code-tail]')).toBeVisible()
      expect(f.errors).toEqual([])
      expect(f.forbidden).toEqual([])
      await writeFile(
        join(evidence, `plan-exit-observation-${locale}.json`),
        JSON.stringify(
          {
            actualHost: false,
            actualComponents: ['HbarSessionDecision', 'HbarPlanExitDecision', 'MessageMarkdown'],
            controlledClipboard: true,
            strictMode: true,
            statuses: ['pending', 'allowed', 'denied'],
            connectedFalseReadable: true,
            originalFeedbackPreserved: true,
            replacedDecisionFeedbackNotInherited: true,
            oldOwnerAndDecisionReceiptIgnored: true,
            ownerChangeRefolds: true,
            sourceAppendKeepsExpanded: true,
            businessCallbacks: { planExit: 0, decision: 0, reconcile: 0, answer: 0, submit: 0 },
            errors: f.errors,
            forbidden: f.forbidden,
          },
          null,
          2,
        ),
      )
    } finally {
      await f.context.close()
    }
  })
}
async function action(page: Page, name: string) {
  await page.locator(`[data-fixture-action="${name}"]`).click()
}
function copies(page: Page) {
  return page.locator('[data-fixture-output] .hbar-message-code-copy')
}
async function status(page: Page, value: string, index = 0) {
  await expect(copies(page).nth(index)).toHaveAttribute('data-copy-status', value)
}
async function count(page: Page, value: number) {
  await expect(page.locator('[data-write-count]')).toHaveAttribute('data-write-count', String(value))
}
async function copy(page: Page, index = 0) {
  await copies(page).nth(index).getByRole('button').focus()
  await page.keyboard.press('Enter')
  await status(page, 'copying', index)
  await expect(copies(page).nth(index).getByRole('button')).toBeDisabled()
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  for (const filePreview of [false, true]) {
    test(`semantic code readers keep full metadata and original source ${locale} ${filePreview ? 'file' : 'message'}`, async ({
      browser,
    }, info) => {
      const f = await open(browser, locale, true, filePreview)
      try {
        const block = f.page.locator('.hbar-message-code')
        for (const mode of ['light', 'dark'] as const) {
          await f.page.goto(`${base}/?long-labels&${filePreview ? 'file-preview&' : ''}mode=${mode}&large-text`)
          await action(f.page, 'long')
          await f.page.evaluate(() => {
            document.documentElement.style.zoom = '1.25'
          })
          for (const width of [1440, 1100, 900, 390, 320]) {
            await f.page.setViewportSize({ width, height: 1000 })
            const readers = block.locator(
              '.hbar-message-code-metadata, .hbar-message-code-copy, .hbar-message-code-footer',
            )
            await expect(readers).toHaveCount(3)
            for (const reader of await readers.all()) {
              await expect(reader).toHaveAttribute('role', 'group')
              await expect(reader).toHaveAttribute('aria-label', /\S/)
              await reader.focus()
              await expect(reader).toBeFocused()
              await reader.evaluate((node) => {
                node.scrollLeft = 0
              })
              if (await reader.evaluate((node) => node.scrollWidth > node.clientWidth)) {
                await reader.press('ArrowRight')
                await expect.poll(() => reader.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
              }
            }
            await expect(block.locator('pre[data-text-context="code.block"]')).toHaveText(`${longCode}\n`)
            await expect(block.locator('[data-text-context="metadata"]')).toHaveCount(2)
            const metadata = await block.locator('.hbar-message-code-metadata').textContent()
            const copy = codeBlockCopyLabels(locale)
            expect(metadata).toBe(copy.language('typescript').repeat(8) + copy.lines(25).repeat(8))
            const geometry = await f.page.evaluate(() => ({
              width: innerWidth,
              documentWidth: document.documentElement.scrollWidth,
              scrollX,
              offenders: [...document.querySelectorAll<HTMLElement>('*')]
                .filter(
                  (node) =>
                    !node.closest(
                      '.hbar-message-code-metadata, .hbar-message-code-copy, .hbar-message-code-footer, .hbar-message-code-body',
                    ),
                )
                .map((node) => ({
                  tag: node.tagName,
                  class: node.className,
                  right: node.getBoundingClientRect().right,
                  width: node.getBoundingClientRect().width,
                  overflow: getComputedStyle(node).overflowX,
                  text: node.textContent?.slice(0, 48),
                }))
                .filter((node) => node.right + scrollX > innerWidth + 1)
                .slice(0, 12),
            }))
            expect(geometry.documentWidth, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.width + 1)
            if (width === 1440 || width === 320)
              await block.screenshot({ path: info.outputPath(`code-reader-${mode}-${width}.png`) })
          }
        }
        await copy(f.page)
        await expect(f.page.locator('[data-write-index="0"]')).toHaveText(longCode)
        await action(f.page, 'reject')
        await expect(block.getByRole('alert')).toBeVisible()
        await expect(block.getByRole('alert')).toHaveAttribute('data-text-context', 'feedback.detail')
        await block.getByRole('button', { name: codeBlockCopyLabels(locale).retry, exact: true }).click()
        await expect(f.page.locator('[data-write-index="1"]')).toHaveText(longCode)
        await action(f.page, 'resolve')
        await expect(block.locator('[data-copy-status]')).toHaveAttribute('data-copy-status', 'copied')
        expect(f.errors).toEqual([])
        expect(f.forbidden).toEqual([])
      } finally {
        await f.context.close()
      }
    })
  }
  test(`code clipboard target lifetimes and repeat requests remain independent: ${locale}`, async ({ browser }) => {
    const f = await open(browser, locale)
    try {
      await expect(f.page.locator('[data-code-occurrence]')).toHaveCount(2)
      const ids = await f.page
        .locator('[data-code-occurrence]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-code-occurrence')))
      expect(new Set(ids).size).toBe(2)
      await copy(f.page)
      await copies(f.page)
        .first()
        .getByRole('button')
        .evaluate((button) => {
          button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        })
      await count(f.page, 1)
      await copy(f.page, 1)
      await count(f.page, 2)
      await expect(f.page.locator('[data-write-index="0"]')).toHaveText(repeated)
      await expect(f.page.locator('[data-write-index="1"]')).toHaveText(repeated)
      await action(f.page, 'resolve')
      await status(f.page, 'copied')
      await status(f.page, 'copying', 1)
      await action(f.page, 'reject')
      await status(f.page, 'failed', 1)
      const labels = codeBlockCopyLabels(locale)
      await expect(copies(f.page).nth(1).getByRole('alert')).toHaveText(labels.failed)
      await copies(f.page).nth(1).getByRole('button', { name: labels.retry }).click()
      await count(f.page, 3)
      await action(f.page, 'resolve')
      await status(f.page, 'copied', 1)
      await status(f.page, 'idle')
      await status(f.page, 'idle', 1)
      for (const transition of ['b', 'replacement', 'segment', 'owner', 'stream', 'unmounted']) {
        await action(f.page, 'a')
        await copy(f.page)
        await action(f.page, transition)
        if (transition === 'unmounted') await expect(f.page.locator('[data-fixture-output]')).toHaveCount(0)
        else await status(f.page, 'idle')
        await action(f.page, 'a')
        await action(f.page, 'resolve')
        await status(f.page, 'idle')
        await expect(f.page.locator('[data-fixture-output]')).not.toContainText(labels.copied)
      }
      await count(f.page, 9)
      await expect(f.page.locator('[data-fixture-output]')).not.toContainText('PRIVATE_INJECTED_CLIPBOARD_FAILURE')
      expect(f.errors).toEqual([])
      expect(f.forbidden).toEqual([])
    } finally {
      await f.context.close()
    }
  })

  test(`clipboard unavailable, exact feedback timeout and one-million capacity: ${locale}`, async ({ browser }) => {
    const f = await open(browser, locale)
    try {
      const labels = codeBlockCopyLabels(locale)
      await action(f.page, 'unavailable')
      await copies(f.page).first().getByRole('button').click()
      await status(f.page, 'unavailable')
      await count(f.page, 0)
      await expect(copies(f.page).first().getByRole('alert')).toHaveText(labels.unavailable)
      await action(f.page, 'available')
      await f.page.clock.install({ time: new Date('2026-09-26T12:00:00Z') })
      await f.page.clock.pauseAt(new Date('2026-09-26T12:00:10Z'))
      await copies(f.page).first().getByRole('button', { name: labels.retry }).click()
      await action(f.page, 'resolve')
      await status(f.page, 'copied')
      await f.page.clock.fastForward(1499)
      await status(f.page, 'copied')
      await f.page.clock.fastForward(1)
      await status(f.page, 'idle')
      await action(f.page, 'empty')
      await expect(copies(f.page)).toHaveCount(0)
      for (const [scenario, length] of [
        ['below', 999999],
        ['limit', 1000000],
      ] as const) {
        await action(f.page, scenario)
        await copy(f.page)
        await expect(f.page.locator('[data-write-index]').last()).toHaveAttribute('data-write-length', String(length))
        await action(f.page, 'resolve')
        await status(f.page, 'copied')
      }
      await count(f.page, 3)
      await action(f.page, 'over')
      await status(f.page, 'too_large')
      await expect(copies(f.page).getByRole('button')).toBeDisabled()
      await expect(copies(f.page).getByRole('status')).toHaveText(labels.tooLarge(1000000))
      await count(f.page, 3)
      expect(f.errors).toEqual([])
      expect(f.forbidden).toEqual([])
    } finally {
      await f.context.close()
    }
  })

  test(`folding, actual message and current/history Plan paths stay local and readable: ${locale}`, async ({
    browser,
  }) => {
    const f = await open(browser, locale, true)
    try {
      const labels = codeBlockCopyLabels(locale)
      await action(f.page, 'long')
      const block = f.page.locator('[data-code-occurrence]')
      await expect(block).toHaveAttribute('data-expanded', 'false')
      await expect(block.locator('[data-code-tail]')).toBeHidden()
      await copy(f.page)
      await expect(f.page.locator('[data-write-index="0"]')).toHaveText(longCode)
      await action(f.page, 'resolve')
      await status(f.page, 'copied')
      const more = block.getByRole('button', { name: labels.showMore(5), exact: true })
      await more.focus()
      await f.page.keyboard.press('Enter')
      const less = block.getByRole('button', { name: labels.showLess, exact: true })
      await expect(less).toBeFocused()
      await expect(block.locator('[data-code-tail]')).toBeVisible()
      await f.page.keyboard.press('Enter')
      await expect(more).toBeFocused()
      await expect(block.locator('[data-code-tail]')).toBeHidden()
      for (const width of [1440, 320]) {
        await f.page.setViewportSize({ width, height: 960 })
        await status(f.page, 'idle')
        const button = copies(f.page).getByRole('button')
        await button.focus()
        await f.page.keyboard.press('Tab')
        await f.page.keyboard.press('Shift+Tab')
        await expect(button).toBeFocused()
        expect(await button.evaluate((node) => node.matches(':focus-visible'))).toBe(true)
        expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await block.screenshot({ path: join(evidence, `long-idle-${locale}-${width}.png`) })
      }
      await f.page.emulateMedia({ forcedColors: 'active' })
      await copy(f.page)
      await action(f.page, 'reject')
      await status(f.page, 'failed')
      await expect(copies(f.page).getByRole('alert')).toBeVisible()
      expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await block.screenshot({ path: join(evidence, `long-failure-forced-${locale}-320.png`) })
      await f.page.emulateMedia({ forcedColors: 'none' })
      await action(f.page, 'normal')
      await expect(copies(f.page)).toHaveCount(2)
      await action(f.page, 'no-context')
      await expect(copies(f.page)).toHaveCount(0)
      for (const scenario of ['proposal', 'history']) {
        await action(f.page, scenario)
        await expect(copies(f.page)).toHaveCount(3)
        await expect(f.page.locator('[data-fixture-output]')).not.toContainText('<proposed_plan>')
        for (const [index, text] of ['before-code', 'plan-code', 'after-code'].entries()) {
          await copy(f.page, index)
          await expect(f.page.locator('[data-write-index]').last()).toHaveText(text)
          await action(f.page, 'resolve')
          await status(f.page, 'copied', index)
        }
        await f.page
          .locator('[data-fixture-output]')
          .screenshot({ path: join(evidence, `${scenario}-${locale}-320.png`) })
      }
      expect(f.errors).toEqual([])
      expect(f.forbidden).toEqual([])
      await writeFile(
        join(evidence, `observation-${locale}.json`),
        JSON.stringify(
          {
            actualHost: false,
            controlledClipboard: true,
            forcedColors: true,
            errors: f.errors,
            forbidden: f.forbidden,
          },
          null,
          2,
        ),
      )
    } finally {
      await f.context.close()
    }
  })
}
