import { chromium, type Page } from '@playwright/test'
import { HBAR_APP_UI_VARIANT_SPECS } from '../packages/hbar-app-ui/src/index'

const port = 5191
const baseUrl = `http://127.0.0.1:${port}`
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

type Target = Readonly<{
  id: string
  fixture?: string
  path?: string
  root: string
  surfaces?: readonly string[]
  requireRootBoundary?: boolean
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
    surfaces: ['.lumen-ai-chat-approval-surface'],
  },
  {
    id: 'hbar-app-ui-agent-approval-4',
    fixture: 'agentApprovalFixture',
    root: '[data-hbar-app-ui-component="hbar-app-ui-agent-approval-4"]',
    surfaces: ['.hbar-app-ui-agent-approval-card'],
  },
  {
    id: 'form-controls-audit',
    path: '/form-controls-audit.html',
    root: '.form-controls-audit-host',
    requireRootBoundary: false,
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
  return page.evaluate(
    ({ rootSelector, surfaceSelectors, requireRootBoundary }) => {
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
        ...root.querySelectorAll<HTMLElement>(
          'button, input:not([type="file"]):not([type="hidden"]), select, textarea',
        ),
      ].filter((element) => getComputedStyle(element).display !== 'none')
      const missingBoundary = controls.filter((element) => {
        if (element.matches('button')) return !element.querySelector('[data-edge]')
        if (element.closest('[data-boundary]')) return false
        if (element.matches('input[type="checkbox"], input[type="radio"], [role="switch"]'))
          return !element.closest('.lumen-checkbox-control, .lumen-toggle-control')
        return true
      })
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
      const surfaces = surfaceSelectors.map((selector) => {
        const element = root.querySelector<HTMLElement>(selector)
        return element
          ? {
              selector,
              boundary: element.dataset.boundary,
              visibleBorder: visibleBorder(element),
            }
          : { selector, missing: true }
      })
      return {
        missingRoot: false,
        rootBoundary: root.dataset.boundary,
        requireRootBoundary,
        rootVisibleBorder: visibleBorder(root),
        documentOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        rootOverflow: root.scrollWidth > root.clientWidth + 1,
        lampCount: root.querySelectorAll('[data-edge]').length,
        controlCount: controls.length,
        closedControlCount: controls.filter(visibleBorder).length,
        missingBoundaryCount: missingBoundary.length,
        focusShift,
        surfaces,
      } as const
    },
    {
      rootSelector: target.root,
      surfaceSelectors: target.surfaces ?? [],
      requireRootBoundary: target.requireRootBoundary !== false,
    },
  )
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
            waitUntil: 'networkidle',
          })
          const audit = await inspect(page, target)
          const caseId = `${item.width}x${item.height}-${item.theme}-${item.localized ? 'localized' : 'default'}`
          assert(!audit.missingRoot, `${target.id} ${caseId}: root is missing`)
          assert(!audit.documentOverflow, `${target.id} ${caseId}: document overflowed horizontally`)
          assert(!audit.rootOverflow, `${target.id} ${caseId}: root overflowed horizontally`)
          assert(!audit.rootVisibleBorder, `${target.id} ${caseId}: root regained a closed border`)
          if (audit.requireRootBoundary) {
            assert(audit.rootBoundary === 'horizontal', `${target.id} ${caseId}: root lamp boundary is missing`)
          }
          assert(audit.lampCount > 0, `${target.id} ${caseId}: no Lumen lamps rendered`)
          assert(audit.closedControlCount === 0, `${target.id} ${caseId}: a control regained a closed border`)
          assert(audit.missingBoundaryCount === 0, `${target.id} ${caseId}: a control bypassed its Lumen boundary`)
          assert(audit.focusShift <= 0.25, `${target.id} ${caseId}: focus moved or resized content`)
          for (const surface of audit.surfaces) {
            assert(!('missing' in surface), `${target.id} ${caseId}: ${surface.selector} is missing`)
            assert(surface.boundary === 'horizontal', `${target.id} ${caseId}: ${surface.selector} lacks lamps`)
            assert(!surface.visibleBorder, `${target.id} ${caseId}: ${surface.selector} regained a closed border`)
          }
          const screenshot = await page.screenshot({ fullPage: false })
          assert(screenshot.byteLength > 0, `${target.id} ${caseId}: screenshot capture failed`)
          results.push({ target: target.id, case: caseId, controls: audit.controlCount, lamps: audit.lampCount })
        }
      }

      await page.setViewportSize({ width: 1280, height: 720 })
      for (const spec of HBAR_APP_UI_VARIANT_SPECS) {
        const parameters = new URLSearchParams({ variant: spec.id, mode: 'isolated', theme: 'dark' })
        await page.goto(`${baseUrl}/?${parameters.toString()}`, { waitUntil: 'domcontentloaded' })
        const audit = await inspect(page, {
          id: spec.id,
          root: `[data-hbar-app-ui-component="${spec.id}"]`,
        })
        assert(!audit.missingRoot, `${spec.id}: catalog root is missing`)
        assert(!audit.rootVisibleBorder, `${spec.id}: catalog root regained a closed border`)
        assert(audit.rootBoundary === 'horizontal', `${spec.id}: catalog root lamp boundary is missing`)
        assert(audit.lampCount > 0, `${spec.id}: catalog surface rendered no Lumen lamps`)
        assert(audit.closedControlCount === 0, `${spec.id}: a catalog control regained a closed border`)
        assert(audit.missingBoundaryCount === 0, `${spec.id}: a catalog control bypassed its Lumen boundary`)
        catalogControls += audit.controlCount
        catalogLamps += audit.lampCount
      }
    } finally {
      await browser.close()
    }
    console.log(
      JSON.stringify({
        cases: results.length,
        catalog: {
          variants: HBAR_APP_UI_VARIANT_SPECS.length,
          controls: catalogControls,
          lamps: catalogLamps,
        },
        results,
      }),
    )
  } finally {
    server?.kill()
    await server?.exited
  }
}

await run()
