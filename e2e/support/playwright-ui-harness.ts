import type { Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { UiInteractionCoverage, type UiInteractionLocator } from './ui-interaction-coverage.ts'
import type { ProductionUiInteraction, ProductionUiPlatform } from './production-ui-interactions.ts'

export type UiHarnessAssertion = Readonly<{
  description: string
  passed: boolean
}>

export type UiHarnessActionResult = Readonly<{
  ui: readonly UiHarnessAssertion[]
  host?: readonly UiHarnessAssertion[]
  hostFact?: unknown
}>

export type UiHarnessOptions = Readonly<{
  page: Page
  platform: Exclude<ProductionUiPlatform, 'both'>
  artifactDirectory: string
  locale: 'zh-CN' | 'en-US'
  theme: 'system' | 'light' | 'dark'
  runtimeErrorPolicy?: 'fail' | 'record'
}>

export type CapturedInteractiveControl = Readonly<{
  role: string
  name: string
  disabled: boolean
  expanded: boolean | null
  pressed: boolean | null
  current: string | null
  checked: boolean | 'mixed' | null
  selected: boolean | null
  visible: boolean
  box: Readonly<{ x: number; y: number; width: number; height: number }>
}>

export type UiStateSnapshot = Readonly<{
  interactionId: string
  stage: 'before' | 'after' | 'failure'
  url: string
  title: string
  configuredLocale: 'zh-CN' | 'en-US'
  configuredTheme: 'system' | 'light' | 'dark'
  locale: string
  theme: string
  colorScheme: string
  reducedMotion: boolean
  hover: boolean
  viewport: Readonly<{ width: number; height: number }>
  devicePixelRatio: number
  horizontalOverflow: boolean
  activeElement: Readonly<{ role: string; name: string }> | null
  controls: readonly CapturedInteractiveControl[]
  regions: Readonly<
    Record<string, Readonly<{ x: number; y: number; width: number; height: number; display: string; position: string }>>
  >
}>

function safeSegment(value: string): string {
  const safe = value.replaceAll(/[^a-zA-Z0-9._-]+/g, '-').replaceAll(/^-+|-+$/g, '')
  if (!safe) throw new Error(`Cannot create an evidence path from ${JSON.stringify(value)}`)
  return safe
}

function formatCoverageMarkdown(report: ReturnType<UiInteractionCoverage['report']>): string {
  const lines = [
    '# Production UI interaction coverage',
    '',
    `- Platform: ${report.platform}`,
    `- Generated: ${report.generatedAt}`,
    `- Registered: ${report.registered}`,
    `- Applicable: ${report.applicable}`,
    `- Executed: ${report.executed}`,
    `- Passed: ${report.passed}`,
    `- Failed: ${report.failed}`,
    `- Uncovered: ${report.uncovered.length}`,
    '',
    '| Interaction | Status | Locator | Evidence |',
    '| --- | --- | --- | --- |',
  ]
  for (const entry of report.entries) {
    const evidence = Object.values(entry.evidence).join('<br>')
    lines.push(
      `| ${entry.interactionId} | ${entry.status} | ${entry.locator.description.replaceAll('|', '\\|')} | ${evidence} |`,
    )
  }
  if (report.uncovered.length > 0) lines.push('', '## Uncovered', '', ...report.uncovered.map((id) => `- ${id}`))
  return `${lines.join('\n')}\n`
}

export class PlaywrightUiHarness {
  readonly #coverage: UiInteractionCoverage
  readonly #page: Page
  readonly #artifactDirectory: string
  readonly #locale: UiHarnessOptions['locale']
  readonly #theme: UiHarnessOptions['theme']
  readonly #runtimeErrorPolicy: NonNullable<UiHarnessOptions['runtimeErrorPolicy']>
  readonly #consoleErrors: string[] = []
  readonly #pageErrors: string[] = []

  constructor(options: UiHarnessOptions) {
    this.#coverage = new UiInteractionCoverage(options.platform)
    this.#page = options.page
    this.#artifactDirectory = options.artifactDirectory
    this.#locale = options.locale
    this.#theme = options.theme
    this.#runtimeErrorPolicy = options.runtimeErrorPolicy ?? 'fail'
    this.#page.on('console', (message) => {
      if (message.type() === 'error') this.#consoleErrors.push(message.text())
    })
    this.#page.on('pageerror', (error) => this.#pageErrors.push(error.message))
  }

  async exercise(
    interactionId: string,
    locator: UiInteractionLocator,
    action: (definition: ProductionUiInteraction) => Promise<UiHarnessActionResult>,
  ): Promise<void> {
    await this.#coverage.exercise(interactionId, locator, async (definition) => {
      const directory = join(this.#artifactDirectory, safeSegment(interactionId))
      await mkdir(directory, { recursive: true })
      const before = await this.#capture(interactionId, 'before')
      const beforeScreenshot = join(directory, 'before.png')
      await this.#page.screenshot({ path: beforeScreenshot, fullPage: false })
      await writeFile(join(directory, 'before.json'), `${JSON.stringify(before, null, 2)}\n`, 'utf8')

      try {
        const outcome = await action(definition)
        const after = await this.#capture(interactionId, 'after')
        const afterScreenshot = join(directory, 'after.png')
        const ariaPath = join(directory, 'aria.json')
        const geometryPath = join(directory, 'geometry.json')
        await this.#page.screenshot({ path: afterScreenshot, fullPage: false })
        await Promise.all([
          writeFile(ariaPath, `${JSON.stringify(after.controls, null, 2)}\n`, 'utf8'),
          writeFile(
            geometryPath,
            `${JSON.stringify(
              {
                viewport: after.viewport,
                devicePixelRatio: after.devicePixelRatio,
                horizontalOverflow: after.horizontalOverflow,
                activeElement: after.activeElement,
                regions: after.regions,
              },
              null,
              2,
            )}\n`,
            'utf8',
          ),
          writeFile(join(directory, 'after.json'), `${JSON.stringify(after, null, 2)}\n`, 'utf8'),
        ])

        const hostFactPath = join(directory, 'host-fact.json')
        if (definition.result.host && outcome.hostFact !== undefined) {
          await writeFile(hostFactPath, `${JSON.stringify(outcome.hostFact, null, 2)}\n`, 'utf8')
        }

        return {
          assertions: [
            ...outcome.ui.map((assertion) => ({ kind: 'ui' as const, ...assertion })),
            ...(outcome.host ?? []).map((assertion) => ({ kind: 'host' as const, ...assertion })),
          ],
          evidence: {
            'before-screenshot': beforeScreenshot,
            'after-screenshot': afterScreenshot,
            aria: ariaPath,
            geometry: geometryPath,
            ...(definition.result.host && outcome.hostFact !== undefined ? { 'host-fact': hostFactPath } : {}),
          },
        }
      } catch (error) {
        const failure = await this.#capture(interactionId, 'failure').catch(() => undefined)
        await this.#page.screenshot({ path: join(directory, 'failure.png'), fullPage: false }).catch(() => undefined)
        if (failure)
          await writeFile(join(directory, 'failure.json'), `${JSON.stringify(failure, null, 2)}\n`, 'utf8').catch(
            () => undefined,
          )
        throw error
      }
    })
  }

  async writeReport(options: Readonly<{ requireComplete: boolean; generatedAt?: string }>): Promise<void> {
    await mkdir(this.#artifactDirectory, { recursive: true })
    const report = options.requireComplete
      ? this.#coverage.assertComplete()
      : this.#coverage.report(options.generatedAt ?? new Date().toISOString())
    await Promise.all([
      writeFile(join(this.#artifactDirectory, 'coverage.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
      writeFile(join(this.#artifactDirectory, 'coverage.md'), formatCoverageMarkdown(report), 'utf8'),
      writeFile(
        join(this.#artifactDirectory, 'runtime-errors.json'),
        `${JSON.stringify({ console: this.#consoleErrors, pageerror: this.#pageErrors }, null, 2)}\n`,
        'utf8',
      ),
    ])
    if (this.#runtimeErrorPolicy === 'fail' && (this.#consoleErrors.length > 0 || this.#pageErrors.length > 0)) {
      throw new Error(
        `Browser runtime errors: ${JSON.stringify({ console: this.#consoleErrors, pageerror: this.#pageErrors })}`,
      )
    }
  }

  async #capture(interactionId: string, stage: UiStateSnapshot['stage']): Promise<UiStateSnapshot> {
    const pageFacts = await this.#page.evaluate(() => {
      const roleOf = (element: Element): string => {
        const explicit = element.getAttribute('role')
        if (explicit) return explicit
        if (element instanceof HTMLButtonElement) return 'button'
        if (element instanceof HTMLAnchorElement) return 'link'
        if (element instanceof HTMLSelectElement) return 'combobox'
        if (element instanceof HTMLTextAreaElement) return 'textbox'
        if (element instanceof HTMLInputElement) {
          if (element.type === 'checkbox') return 'checkbox'
          if (element.type === 'radio') return 'radio'
          if (element.type === 'range') return 'slider'
          if (element.type === 'search') return 'searchbox'
          if (['button', 'submit', 'reset'].includes(element.type)) return 'button'
          return 'textbox'
        }
        if (element instanceof HTMLElement && element.tagName === 'SUMMARY') return 'button'
        return 'generic'
      }
      const nameOf = (element: Element): string => {
        const labelledBy = element.getAttribute('aria-labelledby')
        const referenced = labelledBy
          ?.split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
          .filter(Boolean)
          .join(' ')
        const input = element instanceof HTMLInputElement ? element.value : ''
        return (
          element.getAttribute('aria-label') ??
          referenced ??
          element.getAttribute('title') ??
          element.getAttribute('alt') ??
          (element.textContent?.trim() || input)
        ).replaceAll(/\s+/g, ' ')
      }
      const booleanAttribute = (element: Element, name: string): boolean | null => {
        const value = element.getAttribute(name)
        return value === null ? null : value === 'true'
      }
      const controls = [
        ...document.querySelectorAll(
          'a[href], button, input:not([type="hidden"]), select, textarea, details > summary, [role], [tabindex]:not([tabindex="-1"])',
        ),
      ].map((element) => {
        const bounds = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        const checked = element.getAttribute('aria-checked')
        const nativeChecked =
          element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type) ? element.checked : null
        return {
          role: roleOf(element),
          name: nameOf(element),
          disabled:
            element.getAttribute('aria-disabled') === 'true' ||
            ((element instanceof HTMLButtonElement ||
              element instanceof HTMLInputElement ||
              element instanceof HTMLSelectElement ||
              element instanceof HTMLTextAreaElement) &&
              element.disabled),
          expanded: booleanAttribute(element, 'aria-expanded'),
          pressed: booleanAttribute(element, 'aria-pressed'),
          current: element.getAttribute('aria-current'),
          checked: checked === 'mixed' ? ('mixed' as const) : checked === null ? nativeChecked : checked === 'true',
          selected: booleanAttribute(element, 'aria-selected'),
          visible:
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            bounds.width > 0 &&
            bounds.height > 0 &&
            bounds.bottom > 0 &&
            bounds.right > 0 &&
            bounds.top < window.innerHeight &&
            bounds.left < window.innerWidth,
          box: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
        }
      })
      const regionSelectors = {
        shell: '[data-hbar-app-ui-shell="app"]',
        sidebar: '.hbar-app-ui-app-sidebar-drawer',
        frame: '.hbar-app-ui-app-frame',
        session: '.hbar-app-react-session-main',
        conversation: '.hbar-app-ui-conversation',
        timeline: '.hbar-app-ui-conversation-content',
        composer: '.hbar-app-react-session-footer',
        tool: '.hbar-app-react-tool-pane',
        dialog: '[role="dialog"]',
        menu: '[role="menu"]',
      }
      const regions: Record<
        string,
        { x: number; y: number; width: number; height: number; display: string; position: string }
      > = {}
      for (const [name, selector] of Object.entries(regionSelectors)) {
        const element = document.querySelector(selector)
        if (!element) continue
        const bounds = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        regions[name] = {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          display: style.display,
          position: style.position,
        }
      }
      const active = document.activeElement
      return {
        title: document.title,
        locale: document.documentElement.lang,
        theme: document.documentElement.dataset.theme ?? '',
        colorScheme: getComputedStyle(document.documentElement).colorScheme,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        hover: matchMedia('(hover: hover)').matches,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        devicePixelRatio: window.devicePixelRatio,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
        activeElement: active ? { role: roleOf(active), name: nameOf(active) } : null,
        controls,
        regions,
      }
    })
    return {
      interactionId,
      stage,
      url: this.#page.url(),
      configuredLocale: this.#locale,
      configuredTheme: this.#theme,
      ...pageFacts,
    }
  }
}
