import { chromium, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { HBAR_APP_UI_VARIANT_SPECS } from '../packages/hbar-app-ui/src/index'
import { visualLanguageCopy } from '../tests/fixtures/lumen-visual-language-copy'

const port = 5191
const baseUrl = `http://127.0.0.1:${port}`
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const artifactRoot = 'artifacts/ui-redesign/catalog'

type Target = Readonly<{
  id: string
  fixture?: string
  path?: string
  root: string
}>

const targets: readonly Target[] = [
  {
    id: 'hbar-app-ui-prompt-input-3',
    fixture: 'promptInputFixture',
    root: '[data-hbar-app-ui-component="hbar-app-ui-prompt-input-3"]',
  },
  {
    id: 'hbar-app-ui-prompt-input-7',
    fixture: 'promptInputFixture',
    root: '[data-hbar-app-ui-component="hbar-app-ui-prompt-input-7"]',
  },
  {
    id: 'hbar-app-ui-ai-chat-5',
    fixture: 'aiChatFixture',
    root: '[data-hbar-app-ui-component="hbar-app-ui-ai-chat-5"]',
  },
  {
    id: 'hbar-app-ui-agent-approval-4',
    fixture: 'agentApprovalFixture',
    root: '[data-hbar-app-ui-component="hbar-app-ui-agent-approval-4"]',
  },
  {
    id: 'visual-language',
    path: '/visual-language.html',
    root: '.lumen-visual-language',
  },
  ...['chat', 'app-sidebar', 'command-menu', 'agent-activity', 'app-dialog'].map((category) => ({
    id: `hbar-app-ui-${category}-1`,
    root: `[data-hbar-app-ui-component="hbar-app-ui-${category}-1"]`,
  })),
  {
    id: 'form-controls-audit',
    path: '/form-controls-audit.html',
    root: '.form-controls-audit-host',
  },
]

const matrix = [
  { width: 1280, height: 720, theme: 'dark', localized: false },
  { width: 1280, height: 720, theme: 'light', localized: true },
  { width: 768, height: 900, theme: 'light', localized: false },
  { width: 768, height: 900, theme: 'dark', localized: true },
  { width: 390, height: 844, theme: 'dark', localized: false },
  { width: 390, height: 844, theme: 'light', localized: true },
  { width: 320, height: 720, theme: 'light', localized: false },
  { width: 320, height: 720, theme: 'dark', localized: true },
] as const

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function waitForPreview(): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      // The local preview may still be starting.
    }
    await Bun.sleep(200)
  }
  throw new Error(`Preview did not start at ${baseUrl}`)
}

async function inspect(page: Page, target: Target) {
  return page.evaluate((rootSelector) => {
    const root = document.querySelector<HTMLElement>(rootSelector)
    if (!root) return { missingRoot: true } as const
    const visibleBorder = (element: Element) => {
      const style = getComputedStyle(element)
      const widths = [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth]
      const styles = [style.borderTopStyle, style.borderRightStyle, style.borderBottomStyle, style.borderLeftStyle]
      const colors = [style.borderTopColor, style.borderRightColor, style.borderBottomColor, style.borderLeftColor]
      return (
        widths.every((value) => Number.parseFloat(value) > 0) &&
        styles.every((value) => value !== 'none') &&
        colors.every((value) => value !== 'transparent' && !/rgba\([^)]*,\s*0\s*\)$/.test(value))
      )
    }
    const controls = [
      ...root.querySelectorAll<HTMLElement>('button, input:not([type="file"]):not([type="hidden"]), select, textarea'),
    ].filter((element) => getComputedStyle(element).display !== 'none')
    const shapeViolations = controls
      .filter(
        (element) =>
          element.matches('.lumen-action[data-lumen-variant="outlined"]:not(.lumen-toggle-control)') &&
          !visibleBorder(element),
      )
      .map((element) => ({ variant: element.dataset.lumenVariant, className: element.className }))
    const fillViolations = controls
      .filter((element) => {
        if (!element.matches('.lumen-action[data-lumen-variant="contained"]')) return false
        const color = getComputedStyle(element).backgroundColor
        if (color === 'transparent') return true
        const slashAlpha = color.match(/\/\s*([\d.]+)\s*\)$/)?.[1]
        const commaAlpha = color.startsWith('rgba') ? color.match(/,\s*([\d.]+)\s*\)$/)?.[1] : undefined
        return Number(slashAlpha ?? commaAlpha ?? 1) < 0.99
      })
      .map((element) => ({ variant: element.dataset.lumenVariant, className: element.className }))
    const fieldViolations = [...root.querySelectorAll('.lumen-outlined-field, .lumen-input-group')].filter(
      (element) => !visibleBorder(element),
    ).length
    const before = controls.find((element) => element.matches('input:not([type="checkbox"]), select, textarea'))
    const beforeRect = before?.getBoundingClientRect()
    before?.focus()
    const afterRect = before?.getBoundingClientRect()
    const focusShift =
      beforeRect && afterRect
        ? Math.max(
            Math.abs(beforeRect.x - afterRect.x),
            Math.abs(beforeRect.y - afterRect.y),
            Math.abs(beforeRect.width - afterRect.width),
            Math.abs(beforeRect.height - afterRect.height),
          )
        : 0
    return {
      missingRoot: false,
      documentOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      rootOverflow: root.scrollWidth > root.clientWidth + 1,
      lampCount: root.querySelectorAll('[data-edge]').length,
      controlCount: controls.length,
      shapeViolations,
      fillViolations,
      fieldViolations,
      focusShift,
    } as const
  }, target.root)
}

async function run(): Promise<void> {
  let server: ReturnType<typeof Bun.spawn> | undefined
  try {
    const build = Bun.spawn(['bun', 'run', 'app-ui:build'], { stdout: 'inherit', stderr: 'inherit' })
    assert((await build.exited) === 0, 'The app-ui preview build failed')
    server = Bun.spawn(
      [
        'node',
        'node_modules/vite/bin/vite.js',
        'preview',
        '--config',
        'apps/hbar-app-ui-preview/vite.config.ts',
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
      ],
      { stdout: 'ignore', stderr: 'ignore' },
    )
    await waitForPreview()
    const browser = await chromium.launch({ headless: true, executablePath })
    const page = await browser.newPage()
    const results: Array<{ target: string; case: string; controls: number; lamps: number }> = []
    const failures: string[] = []
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await mkdir(artifactRoot, { recursive: true })
    let catalogControls = 0
    let catalogLamps = 0
    try {
      for (const item of matrix) {
        await page.setViewportSize({ width: item.width, height: item.height })
        for (const target of targets) {
          const parameters = new URLSearchParams({ theme: item.theme })
          if (target.path) {
            parameters.set('locale', item.localized ? 'zh-CN' : 'en-US')
            parameters.set('open', '1')
          } else {
            parameters.set('variant', target.id)
            parameters.set('mode', 'isolated')
            if (item.localized && target.fixture) parameters.set(target.fixture, 'localized')
          }
          await page.goto(`${baseUrl}${target.path ?? '/'}?${parameters.toString()}`, {
            waitUntil: 'domcontentloaded',
          })
          await page.locator(target.root).first().waitFor({ state: 'visible' })
          const audit = await inspect(page, target)
          const caseId = `${item.width}x${item.height}-${item.theme}-${item.localized ? 'localized' : 'default'}`
          assert(!audit.missingRoot, `${target.id} ${caseId}: root is missing`)
          assert(!audit.documentOverflow, `${target.id} ${caseId}: document overflowed horizontally`)
          assert(!audit.rootOverflow, `${target.id} ${caseId}: root overflowed horizontally`)
          assert(audit.lampCount === 0, `${target.id} ${caseId}: an edge lamp remains`)
          if (audit.shapeViolations.length || audit.fillViolations.length || audit.fieldViolations)
            failures.push(
              `${target.id} ${caseId}: ${JSON.stringify({ actions: audit.shapeViolations, fills: audit.fillViolations, fields: audit.fieldViolations })}`,
            )
          assert(audit.focusShift <= 0.25, `${target.id} ${caseId}: focus moved or resized content`)
          const screenshot = await page.screenshot({
            path: `${artifactRoot}/${target.id}-${caseId}.png`,
            fullPage: false,
          })
          assert(screenshot.byteLength > 0, `${target.id} ${caseId}: screenshot capture failed`)
          results.push({ target: target.id, case: caseId, controls: audit.controlCount, lamps: audit.lampCount })
        }
      }

      await page.setViewportSize({ width: 1280, height: 720 })
      await page.goto(`${baseUrl}/visual-language.html?locale=zh-CN&theme=dark`)
      const copy = visualLanguageCopy['zh-CN']
      await page.getByTestId('preview-contained').waitFor({ state: 'visible' })
      assert((await page.locator('.lumen-action[aria-busy="true"]').count()) === 3, 'Preview busy actions are missing')
      await page.getByRole('button', { name: copy.finish, exact: true }).click()
      assert(
        (await page.locator('.lumen-action[aria-busy="true"]').count()) === 0,
        'Preview completion did not clear busy state',
      )
      await page.getByRole('button', { name: copy.focus, exact: true }).click()
      assert(
        await page.getByTestId('preview-contained').evaluate((element) => element === document.activeElement),
        'Preview ref did not focus the primary action',
      )
      await page.locator('#preview-input').fill(`${copy.value} - 完整说明`)
      assert(
        (await page.locator('#preview-input').inputValue()) === `${copy.value} - 完整说明`,
        'Preview input did not keep the edited value',
      )
      await page.getByLabel(copy.size, { exact: true }).selectOption('l')
      assert(
        (await page.getByTestId('preview-contained').evaluate((element) => getComputedStyle(element).fontSize)) ===
          '16px',
        'Preview did not apply global large text',
      )
      await page.getByRole('switch', { name: copy.motion, exact: true }).uncheck()
      assert(
        (await page
          .getByTestId('preview-contained')
          .evaluate((element) => getComputedStyle(element).transitionProperty)) === 'none',
        'Preview motion switch did not stop transitions',
      )
      await page.getByRole('switch', { name: copy.glow, exact: true }).uncheck()
      assert(
        (await page
          .getByTestId('preview-contained')
          .evaluate((element) => Number(getComputedStyle(element).getPropertyValue('--lumen-glow')))) === 0,
        'Preview glow switch did not apply',
      )
      await page.getByRole('button', { name: copy.theme, exact: true }).click()
      assert(
        (await page.locator('html').getAttribute('data-lumen-mode')) === 'light',
        'Preview theme switch did not apply',
      )
      for (const spec of HBAR_APP_UI_VARIANT_SPECS) {
        const parameters = new URLSearchParams({ variant: spec.id, mode: 'isolated', theme: 'dark' })
        await page.goto(`${baseUrl}/?${parameters.toString()}`, { waitUntil: 'domcontentloaded' })
        await page.locator(`[data-hbar-app-ui-component="${spec.id}"]`).first().waitFor({ state: 'visible' })
        const audit = await inspect(page, {
          id: spec.id,
          root: `[data-hbar-app-ui-component="${spec.id}"]`,
        })
        assert(!audit.missingRoot, `${spec.id}: catalog root is missing`)
        assert(audit.lampCount === 0, `${spec.id}: catalog rendered an edge lamp`)
        if (audit.shapeViolations.length || audit.fillViolations.length || audit.fieldViolations)
          failures.push(
            `${spec.id}: ${JSON.stringify({ actions: audit.shapeViolations, fills: audit.fillViolations, fields: audit.fieldViolations })}`,
          )
        catalogControls += audit.controlCount
        catalogLamps += audit.lampCount
      }
    } finally {
      await browser.close()
    }
    const report = {
      cases: results.length,
      catalog: { variants: HBAR_APP_UI_VARIANT_SPECS.length, controls: catalogControls, lamps: catalogLamps },
      pageErrors,
      failures,
      results,
    }
    await writeFile(`${artifactRoot}/report.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    assert(!pageErrors.length, `Preview raised ${pageErrors.length} browser errors: ${pageErrors.join('; ')}`)
    assert(
      !failures.length,
      `Visual shapes failed: ${failures.slice(0, 10).join('; ')}. Full report: ${artifactRoot}/report.json`,
    )
    console.log(
      JSON.stringify({
        cases: results.length,
        catalog: {
          variants: HBAR_APP_UI_VARIANT_SPECS.length,
          controls: catalogControls,
          lamps: catalogLamps,
        },
        interactivePreview: true,
        pageErrors: pageErrors.length,
        shapeFailures: failures.length,
      }),
    )
  } finally {
    server?.kill()
    await server?.exited
  }
}

await run()
