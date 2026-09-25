import { chromium } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { HBAR_APP_UI_CATEGORIES, HBAR_APP_UI_VARIANT_SPECS } from '../packages/hbar-app-ui/src/index'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5180'
const artifactRoot = 'artifacts/hbar-app-ui'

type VariantCheck = {
  readonly id: string
  readonly category: string
  readonly mounted: boolean
  readonly contractVisible: boolean
  readonly interactiveControlCount: number
  readonly profileKey: string | null
  readonly profileState: string | null
  readonly profileSurface: string | null
  readonly profileControlCount: number
  readonly actionEvent: boolean
  readonly domSignature: string
  readonly localScreenshot: string
}

type VisualComparison = {
  readonly id: string
  readonly sourceScreenshot: string
  readonly localScreenshot: string
  readonly sourceSha256: string | null
  readonly localSha256: string
  readonly sameBytes: boolean
}

type ViewportThemeCheck = {
  readonly category: string
  readonly variantId: string
  readonly viewport: 'desktop' | 'tablet' | 'mobile'
  readonly theme: 'dark' | 'light'
  readonly viewportWidth: number
  readonly frameWidth: number
  readonly themeApplied: boolean
  readonly noHorizontalOverflow: boolean
}

const viewportChecks = [
  { id: 'desktop', width: 1440, height: 900 },
  { id: 'tablet', width: 768, height: 1024 },
  { id: 'mobile', width: 390, height: 844 },
] as const

async function waitForPreview() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      // The local preview may need a few hundred milliseconds to bind its port.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Preview is not reachable at ${baseUrl}`)
}

async function ensurePreview() {
  try {
    await waitForPreview()
    return undefined
  } catch {
    const server = Bun.spawn(['bun', 'run', 'app-ui:preview', '--', '--host', '127.0.0.1'], {
      stdout: 'ignore',
      stderr: 'ignore',
    })
    await waitForPreview()
    return server
  }
}

async function sha256(path: string): Promise<string | null> {
  const file = Bun.file(path)
  if (!(await file.exists())) return null
  return createHash('sha256')
    .update(new Uint8Array(await file.arrayBuffer()))
    .digest('hex')
}

async function run() {
  const server = await ensurePreview()
  await mkdir(artifactRoot, { recursive: true })
  const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.setDefaultNavigationTimeout(60_000)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const checks: VariantCheck[] = []
  const viewportThemeChecks: ViewportThemeCheck[] = []
  const visualComparisons: VisualComparison[] = []

  try {
    for (const spec of HBAR_APP_UI_VARIANT_SPECS) {
      await page.goto(`${baseUrl}/?variant=${encodeURIComponent(spec.id)}`, { waitUntil: 'domcontentloaded' })
      const variantSelector = `.hbar-app-ui-preview-component-canvas[data-hbar-app-ui-variant="${spec.id}"]`
      const mounted = (await page.locator(variantSelector).count()) === 1
      const contractVisible = await page.locator('.hbar-app-ui-preview-contract').isVisible()
      const variant = page.locator(variantSelector)
      const component = variant.locator('[data-hbar-app-ui-component]').first()
      const harness = page.locator(`[data-hbar-app-ui-harness="${spec.id}"]`)
      const interactiveControlCount = await component.locator('button, textarea, input, select').count()
      const profileKey = await variant.getAttribute('data-hbar-app-ui-profile')
      const profileState = await variant.getAttribute('data-hbar-app-ui-state')
      const profileSurface = await variant.getAttribute('data-hbar-app-ui-surface')
      const profileControlCount = await harness.locator('[data-hbar-app-ui-control]').count()
      const domSignature = await variant.evaluate((element) =>
        JSON.stringify({
          profile: element.getAttribute('data-hbar-app-ui-profile'),
          state: element.getAttribute('data-hbar-app-ui-state'),
          surface: element.getAttribute('data-hbar-app-ui-surface'),
          controls: [...element.querySelectorAll('[data-hbar-app-ui-control]')].map((control) =>
            control.getAttribute('data-hbar-app-ui-control'),
          ),
          headings: [...element.querySelectorAll('h1,h2,h3,strong')]
            .slice(0, 5)
            .map((heading) => heading.textContent?.trim()),
        }),
      )
      const localScreenshot = `${artifactRoot}/local/${spec.id}.png`
      await mkdir(`${artifactRoot}/local`, { recursive: true })
      await component.screenshot({ path: localScreenshot })
      const sourceScreenshot = `${artifactRoot}/source/${spec.category}-${spec.variant}.png`
      const localSha256 = await sha256(localScreenshot)
      if (!localSha256) throw new Error(`Missing local screenshot for ${spec.id}`)
      const sourceSha256 = await sha256(sourceScreenshot)
      visualComparisons.push({
        id: spec.id,
        sourceScreenshot,
        localScreenshot,
        sourceSha256,
        localSha256,
        sameBytes: sourceSha256 === localSha256,
      })
      const firstProfileControl = harness.locator('[data-hbar-app-ui-control]').first()
      await firstProfileControl.dispatchEvent('click')
      const expectedAction = spec.profile.controls[0] ?? ''
      const actionEvent = await page
        .waitForFunction(
          (action) => document.querySelector('.hbar-app-ui-preview-events')?.textContent?.includes(action),
          expectedAction,
          { timeout: 2_000 },
        )
        .then(() => true)
        .catch(() => false)
      if (
        !mounted ||
        !contractVisible ||
        profileKey !== spec.profile.key ||
        profileState !== spec.profile.initialState ||
        profileSurface !== spec.profile.surface ||
        profileControlCount !== spec.profile.controls.length ||
        !actionEvent
      )
        throw new Error(
          `Incomplete profile preview for ${spec.id}: ${JSON.stringify({
            mounted,
            contractVisible,
            interactiveControlCount,
            profileKey,
            expectedProfileKey: spec.profile.key,
            profileState,
            expectedProfileState: spec.profile.initialState,
            profileSurface,
            expectedProfileSurface: spec.profile.surface,
            profileControlCount,
            expectedProfileControlCount: spec.profile.controls.length,
            actionEvent,
            expectedAction,
          })}`,
        )
      checks.push({
        id: spec.id,
        category: spec.category,
        mounted,
        contractVisible,
        interactiveControlCount,
        profileKey,
        profileState,
        profileSurface,
        profileControlCount,
        actionEvent,
        domSignature,
        localScreenshot,
      })
    }

    for (const category of HBAR_APP_UI_CATEGORIES) {
      const categoryChecks = checks.filter((check) => check.category === category)
      if (new Set(categoryChecks.map((check) => check.domSignature)).size !== categoryChecks.length)
        throw new Error(`Duplicate observable profile markup in ${category}`)
    }

    const categoryScreenshots: string[] = []
    for (const category of HBAR_APP_UI_CATEGORIES) {
      const spec = HBAR_APP_UI_VARIANT_SPECS.find((item) => item.category === category)
      if (!spec) throw new Error(`Missing first variant for ${category}`)
      await page.goto(`${baseUrl}/?variant=${encodeURIComponent(spec.id)}`, { waitUntil: 'networkidle' })
      const path = `${artifactRoot}/${category}.png`
      await page.screenshot({ path, fullPage: true })
      categoryScreenshots.push(path)

      for (const viewport of viewportChecks) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        for (const theme of ['dark', 'light'] as const) {
          await page.goto(`${baseUrl}/?variant=${encodeURIComponent(spec.id)}`, { waitUntil: 'networkidle' })
          if (theme === 'light')
            await page.getByRole('button', { name: 'Use light theme', exact: true }).dispatchEvent('click')
          const themeApplied = (await page.locator(`[data-hbar-app-ui-theme="${theme}"]`).count()) === 1
          const frame = page.locator('.hbar-app-ui-preview-frame')
          const frameWidth = await frame.evaluate((element) => Math.round(element.getBoundingClientRect().width))
          const noHorizontalOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1,
          )
          viewportThemeChecks.push({
            category,
            variantId: spec.id,
            viewport: viewport.id,
            theme,
            viewportWidth: viewport.width,
            frameWidth,
            themeApplied,
            noHorizontalOverflow,
          })
          if (!themeApplied || !noHorizontalOverflow || frameWidth > viewport.width)
            throw new Error(`Viewport/theme check failed for ${spec.id} (${viewport.id}, ${theme})`)
        }
      }
    }

    const observationLines = HBAR_APP_UI_CATEGORIES.flatMap((category) => {
      const spec = HBAR_APP_UI_VARIANT_SPECS.find((item) => item.category === category)
      if (!spec) return []
      const categoryCheck = viewportThemeChecks.find((check) => check.category === category)
      return [
        `## ${category}`,
        `- entry: ${spec.id}`,
        `- actions: ${spec.actions.map((action) => action.id).join(', ')}`,
        `- behavior: ${spec.behavior.join(' | ')}`,
        `- observation: ${spec.observation.join(' | ')}`,
        `- visual validation: ${spec.visualValidation.join(' | ')}`,
        `- viewport sample: ${categoryCheck?.viewport ?? 'not recorded'} / ${categoryCheck?.theme ?? 'not recorded'}`,
        `- screenshot: ${artifactRoot}/${category}.png`,
        '',
      ]
    }).join('\n')
    await writeFile(
      `${artifactRoot}/observations.md`,
      `# hbar-app-ui local acceptance observations\n\n${observationLines}`,
    )

    await page.goto(`${baseUrl}/?variant=hbar-app-ui-agent-activity-1`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    const stopEvent = (await page.locator('.hbar-app-ui-preview-events').innerText()).includes('stop')

    await page.goto(`${baseUrl}/?variant=hbar-app-ui-prompt-input-7`, { waitUntil: 'networkidle' })
    await page
      .locator('[data-hbar-app-ui-component="hbar-app-ui-prompt-input-7"] .lumen-prompt-input-tabs button')
      .nth(1)
      .click()
    const modeEvent = (await page.locator('.hbar-app-ui-preview-events').innerText()).includes('mode')

    await page.goto(`${baseUrl}/?variant=hbar-app-ui-chat-1`, { waitUntil: 'networkidle' })
    await page.getByPlaceholder('Message operations').fill('acceptance smoke')
    await page.getByPlaceholder('Message operations').press('Enter')
    const chatEvent = (await page.locator('.hbar-app-ui-preview-events').innerText()).includes('send')

    await page.goto(`${baseUrl}/?variant=hbar-app-ui-agent-approval-2`, { waitUntil: 'networkidle' })
    const showDiff = page.getByRole('button', { name: 'Show diff', exact: true })
    const diffInitiallyCollapsed =
      (await showDiff.getAttribute('aria-expanded')) === 'false' &&
      (await page.locator('.hbar-app-ui-agent-approval-diff-payload').count()) === 0
    await showDiff.click()
    const hideDiff = page.getByRole('button', { name: 'Hide diff', exact: true })
    const diffExpanded =
      (await hideDiff.getAttribute('aria-expanded')) === 'true' &&
      (await page.locator('.hbar-app-ui-agent-approval-diff-payload').count()) === 1
    await hideDiff.click()
    const diffCollapsed =
      (await showDiff.getAttribute('aria-expanded')) === 'false' &&
      (await page.locator('.hbar-app-ui-agent-approval-diff-payload').count()) === 0
    const approveDiff = page.getByRole('button', { name: 'Approve', exact: true })
    await approveDiff.click()
    const diffAction = (await page.locator('.hbar-app-ui-preview-events').innerText()).includes('decide-diff-approval')
    const diffDecisionLocked =
      (await approveDiff.count()) === 0 && (await page.locator('.hbar-app-ui-agent-approval-diff-result').count()) === 1

    await writeFile(
      `${artifactRoot}/report.json`,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          expectedVariants: HBAR_APP_UI_VARIANT_SPECS.length,
          mountedVariants: checks.length,
          categories: HBAR_APP_UI_CATEGORIES.length,
          pageErrors,
          categoryScreenshots,
          viewportThemeChecks,
          visualComparisons,
          interactions: {
            stopEvent,
            modeEvent,
            chatEvent,
            diffInitiallyCollapsed,
            diffExpanded,
            diffCollapsed,
            diffAction,
            diffDecisionLocked,
          },
          checks,
        },
        null,
        2,
      ),
    )

    if (
      pageErrors.length ||
      !stopEvent ||
      !modeEvent ||
      !chatEvent ||
      !diffInitiallyCollapsed ||
      !diffExpanded ||
      !diffCollapsed ||
      !diffAction ||
      !diffDecisionLocked
    )
      throw new Error('One or more interaction checks failed')
    console.log(
      JSON.stringify({
        expected: HBAR_APP_UI_VARIANT_SPECS.length,
        mounted: checks.length,
        categories: HBAR_APP_UI_CATEGORIES.length,
        pageErrors: pageErrors.length,
        interactions: {
          stopEvent,
          modeEvent,
          chatEvent,
          diffInitiallyCollapsed,
          diffExpanded,
          diffCollapsed,
          diffAction,
          diffDecisionLocked,
        },
      }),
    )
  } finally {
    await browser.close()
    server?.kill()
  }
}

await run()
