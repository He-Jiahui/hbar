import { chromium, type Browser, type Frame, type Locator, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { HBAR_APP_UI_VARIANT_SPECS } from '../packages/hbar-app-ui/src/specs'
import type {
  HbarAppUiCategory,
  HbarAppUiInteractionCapability,
  HbarAppUiVariantSpec,
} from '../packages/hbar-app-ui/src/types'

export const REACTBITS_PRO_APPLICATION_UI_URL =
  process.env.HBAR_APP_UI_REFERENCE_URL ?? 'https://pro.reactbits.dev/docs/app-ui'

export const REACTBITS_PRO_VIEWPORTS = [
  { id: 'desktop', width: 1440, height: 900 },
  { id: 'tablet', width: 1024, height: 768 },
  { id: 'mobile', width: 390, height: 844 },
  { id: 'stress', width: 320, height: 720 },
] as const

export const REACTBITS_PRO_THEMES = ['dark', 'light'] as const

type AuditTheme = (typeof REACTBITS_PRO_THEMES)[number]
type AuditViewport = (typeof REACTBITS_PRO_VIEWPORTS)[number]

const SOURCE_CATALOG_PATH = resolve('hbar-ui/packages/lumen-app-ui/src/source-catalog.json')

export type ReactBitsProReferenceVariant = Readonly<{
  id: string
  sourceId: string
  category: HbarAppUiCategory
  variant: number
  url: string
  title: string
  description: string
  sourceStatus: number
  sourceHash: string
}>

export type ReactBitsProInventory = Readonly<{
  schemaVersion: 1
  sourceUrl: string
  generatedAt: string
  categories: readonly string[]
  categoryCounts: Readonly<Record<string, number>>
  localCategoryCounts: Readonly<Record<string, number>>
  sourceDirectoryHash: string
  variants: readonly ReactBitsProReferenceVariant[]
  localVariantCount: number
}>

type ControlSnapshot = Readonly<{
  index: number
  tag: string
  role: string | null
  type: string | null
  name: string
  disabled: boolean
  expanded: string | null
  pressed: string | null
  selected: string | null
  state: string | null
  stablePath: string
  labelFor: string | null
  describedBy: string | null
  capabilities: readonly HbarAppUiInteractionCapability[]
  options: readonly string[]
}>

export type SemanticSnapshot = Readonly<{
  rootTag: string
  rootRect: Readonly<{ width: number; height: number }>
  bodyTextLength: number
  textLineCount: number
  truncatedTextCount: number
  horizontalOverflow: boolean
  axSnapshot: string
  tree: readonly Readonly<{
    tag: string
    role: string | null
    textKind: string
    rect: Readonly<{ x: number; y: number; width: number; height: number }>
    display: string
    flexDirection: string
    childCount: number
  }>[]
  controls: readonly ControlSnapshot[]
}>

type CaptureRecord = Readonly<{
  kind: 'source' | 'local'
  id: string
  sourceId: string
  category: string
  theme: AuditTheme
  viewport: string
  width: number
  height: number
  sourceUrl: string
  contextScreenshot: string
  screenshot: string
  snapshot: string
  errors: readonly string[]
}>

type StructureComparison = Readonly<{
  id: string
  theme: AuditTheme
  viewport: string
  source: Readonly<Record<string, string>>
  local: Readonly<Record<string, string>>
  structure: Readonly<{
    controlCountMatched: boolean
    controlShapeMatched: boolean
    truncationFree: boolean
    overflowFree: boolean
    errors: readonly string[]
    [key: string]: unknown
  }>
}>

type InteractionCase = Readonly<{
  id: string
  action: HbarAppUiInteractionCapability
  key?: 'Enter' | 'Space' | 'Escape' | 'ArrowRight' | 'ArrowLeft' | 'Home' | 'End' | undefined
  control: ControlSnapshot
}>

type AuditOptions = Readonly<{
  command: 'discover' | 'capture' | 'interactions' | 'compare' | 'audit'
  variants: readonly string[]
  categories: readonly string[]
  viewports: readonly AuditViewport[]
  themes: readonly AuditTheme[]
  outputRoot: string
  referenceRoot: string | undefined
  offline: boolean
  workers: number
  strict: boolean
}>

const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const localPreviewUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5180'

function sourceIdFor(spec: HbarAppUiVariantSpec): string {
  return `${spec.category}-${spec.variant}`
}

function parseViewports(value: string | undefined): readonly AuditViewport[] {
  const requested = parseList(value)
  if (requested.length === 0) return REACTBITS_PRO_VIEWPORTS
  const selected = REACTBITS_PRO_VIEWPORTS.filter((viewport) => requested.includes(viewport.id))
  if (selected.length !== requested.length) {
    throw new Error(
      `Unknown audit viewport. Expected one of: ${REACTBITS_PRO_VIEWPORTS.map((item) => item.id).join(', ')}`,
    )
  }
  return selected
}

function parseThemes(value: string | undefined): readonly AuditTheme[] {
  const requested = parseList(value)
  if (requested.length === 0) return REACTBITS_PRO_THEMES
  const selected = REACTBITS_PRO_THEMES.filter((theme) => requested.includes(theme))
  if (selected.length !== requested.length) throw new Error('Unknown audit theme. Expected dark or light')
  return selected
}

function parseList(value: string | undefined): readonly string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function optionValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name)
  const value = index >= 0 ? args[index + 1] : undefined
  return value && !value.startsWith('--') ? value : undefined
}

function parseOptions(): AuditOptions {
  const [commandArg, ...args] = process.argv.slice(2)
  const command = (commandArg ?? 'audit') as AuditOptions['command']
  if (!['discover', 'capture', 'interactions', 'compare', 'audit'].includes(command)) {
    throw new Error(`Unknown React Bits audit command: ${command}`)
  }
  const variants = parseList(optionValue(args, '--variants') ?? process.env.HBAR_APP_UI_VARIANTS)
  const categories = parseList(
    optionValue(args, '--categories') ?? optionValue(args, '--category') ?? process.env.HBAR_APP_UI_CATEGORIES,
  )
  const viewports = parseViewports(optionValue(args, '--viewports') ?? process.env.HBAR_APP_UI_VIEWPORTS)
  const themes = parseThemes(optionValue(args, '--themes') ?? process.env.HBAR_APP_UI_THEMES)
  const outputRoot = resolve(
    optionValue(args, '--output') ??
      process.env.HBAR_APP_UI_AUDIT_OUTPUT_ROOT ??
      'artifacts/reactbits-pro-visual-audit/latest',
  )
  const workersRaw = optionValue(args, '--workers') ?? process.env.HBAR_APP_UI_AUDIT_WORKERS ?? '2'
  const workers = Math.max(1, Number.parseInt(workersRaw, 10) || 2)
  return {
    command,
    variants,
    categories,
    viewports,
    themes,
    outputRoot,
    referenceRoot: optionValue(args, '--reference-root') ?? process.env.HBAR_APP_UI_REFERENCE_ROOT,
    offline:
      args.includes('--offline') || process.env.HBAR_APP_UI_OFFLINE === '1' || process.env.HBAR_APP_UI_OFFLINE === 'true',
    workers,
    strict: args.includes('--strict') || command === 'audit',
  }
}

function selectedLocalSpecs(options: AuditOptions): readonly HbarAppUiVariantSpec[] {
  const variants = new Set(options.variants)
  const categories = new Set(options.categories)
  const selected = HBAR_APP_UI_VARIANT_SPECS.filter((spec) => {
    if (variants.size > 0 && !variants.has(spec.id) && !variants.has(sourceIdFor(spec))) return false
    if (categories.size > 0 && !categories.has(spec.category)) return false
    return true
  })
  if (selected.length === 0) throw new Error('No local variants matched the requested filters')
  return selected
}

async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await ensureDirectory(resolve(path, '..'))
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function readJson<T>(path: string): Promise<T> {
  return (await Bun.file(path).json()) as T
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

async function localCategoryCounts(): Promise<Readonly<Record<string, number>>> {
  const catalog = await readJson<readonly { readonly category: string }[]>(SOURCE_CATALOG_PATH)
  return Object.fromEntries(
    [...new Set(catalog.map((entry) => entry.category))]
      .sort()
      .map((category) => [category, catalog.filter((entry) => entry.category === category).length]),
  )
}

async function writeLocalInventory(outputRoot: string): Promise<void> {
  const categoryCounts = await localCategoryCounts()
  await writeJson(join(outputRoot, 'local-inventory.json'), {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    categories: Object.keys(categoryCounts).sort(),
    categoryCounts,
    variants: HBAR_APP_UI_VARIANT_SPECS.map((spec) => ({
      id: spec.id,
      category: spec.category,
      variant: spec.variant,
      title: spec.title,
      description: spec.description,
    })),
  })
}

function inventoryPath(options: AuditOptions): string {
  return join(options.outputRoot, 'source-inventory.json')
}

async function discoverReferenceInventory(browser: Browser, options: AuditOptions): Promise<ReactBitsProInventory> {
  const outputRoot = options.outputRoot
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  try {
    const rootResponse = await page.goto(REACTBITS_PRO_APPLICATION_UI_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })
    const rootStatus = rootResponse?.status() ?? 0
    if (rootStatus < 200 || rootStatus >= 400) throw new Error(`React Bits directory returned HTTP ${rootStatus}`)
    const categoryLinks = await page.locator('a[href*="/docs/app-ui/"]').evaluateAll((elements) =>
      [
        ...new Set(
          elements
            .map((element) => (element as HTMLAnchorElement).href)
            .map((href) => new URL(href).pathname)
            .filter((pathname) => /^\/docs\/app-ui\/[^/]+$/.test(pathname)),
        ),
      ].sort(),
    )
    const variants: ReactBitsProReferenceVariant[] = []
    for (const categoryPath of categoryLinks) {
      const categoryUrl = new URL(categoryPath, REACTBITS_PRO_APPLICATION_UI_URL).href
      const categoryResponse = await page.goto(categoryUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      })
      const categoryStatus = categoryResponse?.status() ?? 0
      if (categoryStatus < 200 || categoryStatus >= 400)
        throw new Error(`React Bits category ${categoryPath} returned HTTP ${categoryStatus}`)
      const category = categoryPath.split('/').at(-1) ?? ''
      const categoryVariants = await page.locator(`a[href*="/docs/app-ui/${category}/"]`).evaluateAll(
        (elements, categoryName) =>
          elements
            .map((element) => {
              const href = new URL((element as HTMLAnchorElement).href)
              const sourceId = href.pathname.split('/').at(-1) ?? ''
              const text = (element.textContent ?? '').trim().replaceAll(/\s+/g, ' ')
              const title = text.split(/\s{2,}/)[0] || sourceId
              return { sourceId, href: href.href, text, title }
            })
            .filter((item) => new RegExp(`^${categoryName}-\\d+$`).test(item.sourceId)),
        category,
      )
      for (const item of categoryVariants) {
        const variantText = item.sourceId.replace(`${category}-`, '')
        const variant = Number.parseInt(variantText, 10)
        variants.push({
          id: `hbar-app-ui-${item.sourceId}`,
          sourceId: item.sourceId,
          category: category as HbarAppUiCategory,
          variant,
          url: item.href,
          title: item.title,
          description: item.text.slice(item.title.length).trim(),
          sourceStatus: categoryStatus,
          sourceHash: stableHash({
            url: item.href,
            title: item.title,
            description: item.text.slice(item.title.length).trim(),
          }),
        })
      }
    }
    const unique = [...new Map(variants.map((variant) => [variant.id, variant])).values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    )
    const localIds = new Set(HBAR_APP_UI_VARIANT_SPECS.map((spec) => spec.id))
    const referenceIds = new Set(unique.map((variant) => variant.id))
    const missingReference = [...localIds].filter((id) => !referenceIds.has(id))
    const missingLocal = [...referenceIds].filter((id) => !localIds.has(id))
    const categories = [...new Set(unique.map((variant) => variant.category))].sort()
    const categoryCounts = Object.fromEntries(
      categories.map((category) => [category, unique.filter((variant) => variant.category === category).length]),
    )
    const localCounts = await localCategoryCounts()
    const categoryCountMismatches = categories.filter((category) => categoryCounts[category] !== localCounts[category])
    if (
      unique.length !== 300 ||
      categories.length !== 38 ||
      missingReference.length ||
      missingLocal.length ||
      categoryCountMismatches.length
    ) {
      throw new Error(
        `React Bits inventory mismatch: ${JSON.stringify({
          referenceVariants: unique.length,
          referenceCategories: categories.length,
          categoryCountMismatches,
          categoryCounts,
          localCounts,
          missingReference,
          missingLocal,
        })}`,
      )
    }
    const inventory: ReactBitsProInventory = {
      schemaVersion: 1,
      sourceUrl: REACTBITS_PRO_APPLICATION_UI_URL,
      generatedAt: new Date().toISOString(),
      categories,
      categoryCounts,
      localCategoryCounts: localCounts,
      sourceDirectoryHash: stableHash({ rootStatus, categoryLinks, variants: unique }),
      variants: unique,
      localVariantCount: HBAR_APP_UI_VARIANT_SPECS.length,
    }
    await writeJson(join(outputRoot, 'source-inventory.json'), inventory)
    return inventory
  } finally {
    await context.close()
  }
}

async function loadOrDiscoverInventory(browser: Browser, options: AuditOptions): Promise<ReactBitsProInventory> {
  const cachedPath = inventoryPath(options)
  if (options.offline) {
    const offlinePath = options.referenceRoot
      ? join(resolve(options.referenceRoot), 'source-inventory.json')
      : cachedPath
    if (!(await Bun.file(offlinePath).exists()))
      throw new Error(`Offline reference inventory is missing: ${offlinePath}`)
    const inventory = await readJson<ReactBitsProInventory>(offlinePath)
    if (offlinePath !== cachedPath) await writeJson(cachedPath, inventory)
    return inventory
  }
  return discoverReferenceInventory(browser, options)
}

async function waitForLocalPreview(): Promise<ReturnType<typeof Bun.spawn> | undefined> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(localPreviewUrl)
      if (response.ok) return undefined
    } catch {
      // The local preview may still be starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200))
  }
  const server = Bun.spawn(['bun', 'run', 'app-ui:preview', '--', '--host', '127.0.0.1', '--port', '5180'], {
    stdout: 'ignore',
    stderr: 'ignore',
  })
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(localPreviewUrl)
      if (response.ok) return server
    } catch {
      // Keep waiting for Vite to bind.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250))
  }
  server.kill()
  throw new Error(`Local preview is not reachable at ${localPreviewUrl}`)
}

async function enforceReferenceTheme(page: Page, theme: AuditTheme): Promise<void> {
  const dark = await page.locator('html').evaluate((element) => element.classList.contains('dark'))
  const shouldBeDark = theme === 'dark'
  if (dark !== shouldBeDark) {
    const toggle = page.getByRole('button', { name: 'Toggle theme' })
    if ((await toggle.count()) !== 1) throw new Error('React Bits theme toggle was not found')
    await toggle.click()
  }
  const after = await page.locator('html').evaluate((element) => element.classList.contains('dark'))
  if (after !== shouldBeDark) throw new Error(`Could not set React Bits theme to ${theme}`)
}

async function previewFrame(page: Page): Promise<Frame> {
  const iframe = page.locator('iframe[title="Preview"]')
  await iframe.waitFor({ state: 'visible', timeout: 30_000 })
  const handle = await iframe.elementHandle()
  if (!handle) throw new Error('Preview iframe element handle is unavailable')
  const frame = await handle.contentFrame()
  if (!frame) throw new Error('Preview iframe content frame is unavailable')
  await frame.locator('#preview-root').waitFor({ state: 'attached', timeout: 30_000 })
  return frame
}

async function componentSelector(container: Locator | Page | Frame, rootSelector: string): Promise<string> {
  const selection = await container
    .locator(rootSelector)
    .first()
    .evaluate((root) => {
      const rootTextLength = (root.textContent ?? '').trim().length
      if (rootTextLength === 0) return { path: [], useRoot: false }
      const rootRect = root.getBoundingClientRect()
      const candidates = [...root.querySelectorAll('*')]
        .map((element) => {
          const rect = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          const textLength = (element.textContent ?? '').trim().length
          const semanticSignal =
            element.matches('[data-lumen-component], [class*="lumen-"], article, main, form, nav, [role]')
          const path: number[] = []
          let current: Element | null = element
          while (current && current !== root) {
            const parent: HTMLElement | null = current.parentElement
            if (!parent) break
            path.unshift(Array.from(parent.children).indexOf(current))
            current = parent
          }
          return { rect, style, textLength, path, semanticSignal }
        })
        .filter(
          (candidate) =>
            candidate.textLength >= rootTextLength * 0.5 &&
            candidate.rect.width > 0 &&
            candidate.rect.height > 0 &&
            (candidate.rect.width < rootRect.width * 0.95 || candidate.semanticSignal) &&
            candidate.rect.height < rootRect.height * 0.95 &&
            candidate.style.position !== 'fixed',
        )
        .sort(
          (left, right) =>
            Number(right.semanticSignal) - Number(left.semanticSignal) ||
            left.path.length - right.path.length ||
            right.textLength - left.textLength,
        )
      return {
        path: candidates[0]?.path ?? [],
        useRoot: candidates.length === 0 && root.hasAttribute('data-lumen-component'),
      }
    })
  const path = selection.path
  if (selection.useRoot) return rootSelector
  if (path.length === 0) return `${rootSelector} > :not([aria-hidden='true']):not(svg)`
  return `${rootSelector}${path.map((index) => ` > :nth-child(${index + 1})`).join('')}`
}

type SnapshotWithoutAx = Omit<SemanticSnapshot, 'axSnapshot'>

async function snapshotLocator(locator: Locator, bodyOverflow: boolean): Promise<SnapshotWithoutAx> {
  return locator.evaluate((element, shouldCheckBody) => {
    const rectOf = (value: Element) => {
      const rect = value.getBoundingClientRect()
      return {
        x: Math.round(rect.x * 100) / 100,
        y: Math.round(rect.y * 100) / 100,
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
      }
    }
    const textKind = (value: Element): string => {
      const text = (value.textContent ?? '').trim()
      if (!text) return 'none'
      if (value.matches('h1,h2,h3,h4,h5,h6')) return 'heading'
      if (value.matches('button,a,input,select,textarea,[role]')) return 'control'
      if (/^[\d$€£%.,:+\-/ ]+$/.test(text)) return 'numeric'
      return 'text'
    }
    const tree: Array<{
      tag: string
      role: string | null
      textKind: string
      rect: ReturnType<typeof rectOf>
      display: string
      flexDirection: string
      childCount: number
    }> = []
    const walk = (value: Element, depth: number) => {
      if (depth > 4) return
      const style = getComputedStyle(value)
      tree.push({
        tag: value.tagName.toLowerCase(),
        role: value.getAttribute('role'),
        textKind: textKind(value),
        rect: rectOf(value),
        display: style.display,
        flexDirection: style.flexDirection,
        childCount: value.children.length,
      })
      for (const child of [...value.children]) walk(child, depth + 1)
    }
    walk(element, 0)
    const stablePathOf = (control: Element): string => {
      const parts: string[] = []
      let current: Element | null = control
      while (current && current !== element) {
        const parent: HTMLElement | null = current.parentElement
        if (!parent) break
        const currentTag = current.tagName
        const siblings = [...parent.children].filter((child) => child.tagName === currentTag)
        parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(current) + 1})`)
        current = parent
      }
      return parts.join(' > ')
    }
    const capabilitiesOf = (control: Element): HbarAppUiInteractionCapability[] => {
      const capabilities: HbarAppUiInteractionCapability[] = ['hover', 'focus']
      const tag = control.tagName.toLowerCase()
      const role = control.getAttribute('role')
      const type = control.getAttribute('type')
      if (tag === 'button' || tag === 'a' || role === 'button' || role === 'menuitem' || role === 'tab')
        capabilities.push('click', 'press')
      if (tag === 'input' || tag === 'textarea') capabilities.push('fill')
      if (tag === 'select' || role === 'combobox' || role === 'listbox') capabilities.push('select')
      if (type === 'checkbox' || type === 'radio' || role === 'switch') capabilities.push('toggle')
      if (role === 'tab') capabilities.push('tab')
      if (role === 'menu' || role === 'menuitem') capabilities.push('menu')
      if (control.hasAttribute('aria-expanded')) capabilities.push('expand')
      if (control.hasAttribute('download') || /download/i.test(control.textContent ?? '')) capabilities.push('download')
      if (control.hasAttribute('draggable') || control.getAttribute('data-draggable') === 'true')
        capabilities.push('drag')
      if (capabilities.length === 2) capabilities.push('no-op')
      return [...new Set(capabilities)]
    }
    const controls = [...element.querySelectorAll('button,a,input,select,textarea,[role]')].map((control, index) => ({
      index,
      tag: control.tagName.toLowerCase(),
      role: control.getAttribute('role'),
      type: control.getAttribute('type'),
      name:
        control.getAttribute('aria-label') ?? (control.textContent ?? '').trim().replaceAll(/\s+/g, ' ').slice(0, 160),
      disabled: control.matches(':disabled') || control.getAttribute('aria-disabled') === 'true',
      expanded: control.getAttribute('aria-expanded'),
      pressed: control.getAttribute('aria-pressed'),
      selected: control.getAttribute('aria-selected'),
      state: control.getAttribute('data-state'),
      stablePath: stablePathOf(control),
      labelFor: control.getAttribute('id')
        ? (element.ownerDocument
            .querySelector(`label[for="${CSS.escape(control.getAttribute('id') ?? '')}"]`)
            ?.textContent?.trim() ?? null)
        : null,
      describedBy: control.getAttribute('aria-describedby'),
      capabilities: capabilitiesOf(control),
      options: [...control.querySelectorAll('option')]
        .map((option) => option.textContent?.trim() ?? '')
        .filter(Boolean),
    }))
    const rootRect = element.getBoundingClientRect()
    const body = element.ownerDocument.body
    const lineElements = [...element.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,dt,dd,button,label')]
    const textLineCount = lineElements.reduce(
      (total, value) => Math.max(total, Math.round(value.getBoundingClientRect().height / 16)),
      0,
    )
    const truncatedTextCount = [...element.querySelectorAll('*')].filter(
      (value) => value.scrollWidth > value.clientWidth + 1,
    ).length
    return {
      rootTag: element.tagName.toLowerCase(),
      rootRect: { width: Math.round(rootRect.width), height: Math.round(rootRect.height) },
      bodyTextLength: (element.textContent ?? '').trim().length,
      textLineCount,
      truncatedTextCount,
      horizontalOverflow: shouldCheckBody
        ? Math.max(element.scrollWidth, body?.scrollWidth ?? 0) > (body?.clientWidth ?? 0) + 1
        : element.scrollWidth > element.clientWidth + 1,
      tree,
      controls,
    }
  }, bodyOverflow)
}

async function snapshotRoot(frame: Frame, selector: string): Promise<SemanticSnapshot> {
  const locator = frame.locator(selector).first()
  return {
    ...(await snapshotLocator(locator, true)),
    axSnapshot: await locator.ariaSnapshot(),
  }
}

async function localSnapshot(page: Page, selector: string): Promise<SemanticSnapshot> {
  const locator = page.locator(selector).first()
  return {
    ...(await snapshotLocator(locator, false)),
    axSnapshot: await locator.ariaSnapshot(),
  }
}

function referencePageUrl(reference: ReactBitsProReferenceVariant, options: AuditOptions): string {
  if (!options.offline) return reference.url
  if (!options.referenceRoot) throw new Error('HBAR_APP_UI_REFERENCE_ROOT is required in offline mode')
  const root = resolve(options.referenceRoot)
  const candidates = [join(root, `${reference.sourceId}.html`), join(root, reference.sourceId, 'index.html')]
  const cached = candidates.find((candidate) => Bun.file(candidate).size > 0)
  if (!cached) throw new Error(`Offline React Bits page is missing for ${reference.sourceId} under ${root}`)
  return pathToFileURL(cached).href
}

async function screenshotStable(locator: Locator, path: string): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await locator.screenshot({ path, animations: 'disabled' })
      return
    } catch (error) {
      lastError = error
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 150 * (attempt + 1)))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Could not capture stable screenshot: ${path}`)
}

async function captureSource(
  page: Page,
  reference: ReactBitsProReferenceVariant,
  options: AuditOptions,
  viewport: AuditViewport,
  theme: AuditTheme,
  outputRoot: string,
  pageErrors: string[] = [],
): Promise<CaptureRecord> {
  const errorStart = pageErrors.length
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  const referenceUrl = referencePageUrl(reference, options)
  await page.goto(referenceUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await enforceReferenceTheme(page, theme)
  const frame = await previewFrame(page)
  const selector = await componentSelector(frame, '#preview-root')
  const root = frame.locator(selector).first()
  await root.waitFor({ state: 'visible', timeout: 30_000 })
  const directory = join(outputRoot, 'source', reference.id, theme)
  await ensureDirectory(directory)
  const screenshot = join(directory, `${viewport.id}.png`)
  const contextScreenshot = join(directory, `${viewport.id}-context.png`)
  const snapshot = join(directory, `${viewport.id}.json`)
  await screenshotStable(root, screenshot)
  await page.screenshot({ path: contextScreenshot, animations: 'disabled' })
  const semantic = await snapshotRoot(frame, selector)
  await writeJson(snapshot, semantic)
  return {
    kind: 'source',
    id: reference.id,
    sourceId: reference.sourceId,
    category: reference.category,
    theme,
    viewport: viewport.id,
    width: viewport.width,
    height: viewport.height,
    sourceUrl: referenceUrl,
    contextScreenshot,
    screenshot,
    snapshot,
    errors: pageErrors.slice(errorStart),
  }
}

async function captureLocal(
  page: Page,
  spec: HbarAppUiVariantSpec,
  viewport: AuditViewport,
  theme: AuditTheme,
  outputRoot: string,
  pageErrors: string[] = [],
): Promise<CaptureRecord> {
  const errorStart = pageErrors.length
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  const target = `${localPreviewUrl}/?mode=isolated&theme=${theme}&variant=${encodeURIComponent(spec.id)}`
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  const rootSelector = `[data-hbar-app-ui-component="${spec.id}"]`
  const selector = await componentSelector(page, rootSelector)
  const root = page.locator(selector).first()
  await root.waitFor({ state: 'visible', timeout: 30_000 })
  const directory = join(outputRoot, 'local', spec.id, theme)
  await ensureDirectory(directory)
  const screenshot = join(directory, `${viewport.id}.png`)
  const contextScreenshot = join(directory, `${viewport.id}-context.png`)
  const snapshot = join(directory, `${viewport.id}.json`)
  await screenshotStable(root, screenshot)
  await page.screenshot({ path: contextScreenshot, animations: 'disabled' })
  const semantic = await localSnapshot(page, selector)
  await writeJson(snapshot, semantic)
  return {
    kind: 'local',
    id: spec.id,
    sourceId: sourceIdFor(spec),
    category: spec.category,
    theme,
    viewport: viewport.id,
    width: viewport.width,
    height: viewport.height,
    sourceUrl: target,
    contextScreenshot,
    screenshot,
    snapshot,
    errors: pageErrors.slice(errorStart),
  }
}

function interactionCases(snapshot: SemanticSnapshot, variantId: string): readonly InteractionCase[] {
  const cases: InteractionCase[] = []
  for (const control of snapshot.controls) {
    const prefix = `${variantId}:${control.index}`
    for (const capability of control.capabilities) {
      if (capability === 'no-op' || capability === 'download') continue
      if (capability === 'press') {
        for (const key of ['Enter', 'Space'] as const)
          cases.push({ id: `${prefix}:press-${key.toLowerCase()}`, action: 'press', key, control })
        continue
      }
      if (capability === 'tab') {
        cases.push({ id: `${prefix}:tab-arrowright`, action: 'press', key: 'ArrowRight', control })
        continue
      }
      cases.push({ id: `${prefix}:${capability}`, action: capability, control })
    }
  }
  return cases
}

async function controlLocator(root: Locator, control: ControlSnapshot) {
  const controls = root.locator('button,a,input,select,textarea,[role]')
  const count = await controls.count()
  if (control.index >= count) return undefined
  return controls.nth(control.index)
}

async function applyInteraction(control: Locator, interaction: InteractionCase): Promise<void> {
  if (interaction.action === 'hover') await control.hover()
  if (interaction.action === 'focus') await control.focus()
  if (interaction.action === 'click') await control.click({ timeout: 10_000 })
  if (interaction.action === 'fill') await control.fill('audit sample')
  if (interaction.action === 'select') {
    const values = await control
      .locator('option')
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))
    if (values[0] !== undefined) await control.selectOption(values[0])
  }
  if (interaction.action === 'toggle') await control.click({ timeout: 10_000 })
  if (interaction.action === 'expand' || interaction.action === 'menu') await control.click({ timeout: 10_000 })
  if (interaction.action === 'drag') await control.dragTo(control)
  if (interaction.action === 'press') {
    await control.focus()
    await control.press(interaction.key ?? 'Enter')
  }
}

type InteractionCapture = Readonly<{
  id: string
  status: 'captured' | 'missing'
  directory: string
  before: string
  after: string | null
  beforeSnapshot: string
  afterSnapshot: string | null
  reason?: string
}>

async function interactionDelta(
  capture: InteractionCapture,
): Promise<Readonly<{ changed: boolean; signature: string }> | null> {
  if (capture.status !== 'captured' || !capture.afterSnapshot) return null
  const before = await readJson<SemanticSnapshot>(capture.beforeSnapshot)
  const after = await readJson<SemanticSnapshot>(capture.afterSnapshot)
  const state = (snapshot: SemanticSnapshot) => ({
    bodyTextLength: snapshot.bodyTextLength,
    horizontalOverflow: snapshot.horizontalOverflow,
    controls: snapshot.controls.map((control) => ({
      index: control.index,
      name: control.name,
      disabled: control.disabled,
      expanded: control.expanded,
      pressed: control.pressed,
      selected: control.selected,
      state: control.state,
    })),
  })
  const beforeState = state(before)
  const afterState = state(after)
  const changes = {
    bodyTextLengthDelta: afterState.bodyTextLength - beforeState.bodyTextLength,
    horizontalOverflowChanged: afterState.horizontalOverflow !== beforeState.horizontalOverflow,
    controls: afterState.controls.map((control, index) => ({
      index,
      before: beforeState.controls[index],
      after: control,
    })),
  }
  const signature = JSON.stringify(changes)
  return { changed: JSON.stringify(beforeState) !== JSON.stringify(afterState), signature }
}

async function replayInteraction(
  page: Page,
  spec: HbarAppUiVariantSpec,
  theme: AuditTheme,
  viewport: AuditViewport,
  interaction: InteractionCase,
  outputRoot: string,
): Promise<InteractionCapture> {
  const target = `${localPreviewUrl}/?mode=isolated&theme=${theme}&variant=${encodeURIComponent(spec.id)}`
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  const selector = await componentSelector(page, `[data-hbar-app-ui-component="${spec.id}"]`)
  const root = page.locator(selector).first()
  await root.waitFor({ state: 'visible', timeout: 30_000 })
  const control = await controlLocator(root, interaction.control)
  const directory = join(
    outputRoot,
    'interactions',
    spec.id,
    theme,
    viewport.id,
    interaction.id.replaceAll(':', '_'),
    'local',
  )
  await ensureDirectory(directory)
  const before = join(directory, 'before.png')
  const after = join(directory, 'after.png')
  const beforeSnapshot = join(directory, 'before.json')
  const afterSnapshot = join(directory, 'after.json')
  await screenshotStable(root, before)
  await writeJson(beforeSnapshot, await localSnapshot(page, selector))
  if (!control) {
    return {
      id: interaction.id,
      status: 'missing',
      directory,
      before,
      after: null,
      beforeSnapshot,
      afterSnapshot: null,
      reason: 'control-index-not-found',
    }
  }
  await applyInteraction(control, interaction)
  await page.waitForTimeout(120)
  await screenshotStable(root, after)
  await writeJson(afterSnapshot, await localSnapshot(page, selector))
  return { id: interaction.id, status: 'captured', directory, before, after, beforeSnapshot, afterSnapshot }
}

async function replayReferenceInteraction(
  page: Page,
  reference: ReactBitsProReferenceVariant,
  options: AuditOptions,
  theme: AuditTheme,
  viewport: AuditViewport,
  interaction: InteractionCase,
  outputRoot: string,
): Promise<InteractionCapture> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  await page.goto(referencePageUrl(reference, options), { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await enforceReferenceTheme(page, theme)
  const frame = await previewFrame(page)
  const selector = await componentSelector(frame, '#preview-root')
  const root = frame.locator(selector).first()
  await root.waitFor({ state: 'visible', timeout: 30_000 })
  const control = await controlLocator(root, interaction.control)
  const directory = join(
    outputRoot,
    'interactions',
    reference.id,
    theme,
    viewport.id,
    interaction.id.replaceAll(':', '_'),
    'source',
  )
  await ensureDirectory(directory)
  const before = join(directory, 'before.png')
  const after = join(directory, 'after.png')
  const beforeSnapshot = join(directory, 'before.json')
  const afterSnapshot = join(directory, 'after.json')
  await screenshotStable(root, before)
  await writeJson(beforeSnapshot, await snapshotRoot(frame, selector))
  if (!control) {
    return {
      id: interaction.id,
      status: 'missing',
      directory,
      before,
      after: null,
      beforeSnapshot,
      afterSnapshot: null,
      reason: 'control-index-not-found',
    }
  }
  await applyInteraction(control, interaction)
  await page.waitForTimeout(120)
  await screenshotStable(root, after)
  await writeJson(afterSnapshot, await snapshotRoot(frame, selector))
  return { id: interaction.id, status: 'captured', directory, before, after, beforeSnapshot, afterSnapshot }
}

async function runCapture(options: AuditOptions, browser: Browser, inventory: ReactBitsProInventory): Promise<void> {
  const selected = selectedLocalSpecs(options)
  await writeLocalInventory(options.outputRoot)
  const references = new Map(inventory.variants.map((reference) => [reference.id, reference]))
  const server = await waitForLocalPreview()
  const records: CaptureRecord[] = []
  let cursor = 0
  const worker = async () => {
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    const sourcePage = await context.newPage()
    const localPage = await context.newPage()
    const sourceErrors: string[] = []
    const localErrors: string[] = []
    sourcePage.on('pageerror', (error) => sourceErrors.push(error.message))
    sourcePage.on('console', (message) => {
      if (message.type() === 'error') sourceErrors.push(message.text())
    })
    localPage.on('pageerror', (error) => localErrors.push(error.message))
    localPage.on('console', (message) => {
      if (message.type() === 'error') localErrors.push(message.text())
    })
    try {
      while (cursor < selected.length) {
        const index = cursor
        cursor += 1
        const spec = selected[index]
        if (!spec) continue
        const reference = references.get(spec.id)
        if (!reference) throw new Error(`Missing React Bits reference for ${spec.id}`)
        for (const viewport of options.viewports) {
          for (const theme of options.themes) {
            records.push(
              await captureSource(sourcePage, reference, options, viewport, theme, options.outputRoot, sourceErrors),
            )
            records.push(await captureLocal(localPage, spec, viewport, theme, options.outputRoot, localErrors))
          }
        }
      }
    } finally {
      await context.close()
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(options.workers, selected.length) }, () => worker()))
  } finally {
    server?.kill()
  }
  await writeJson(join(options.outputRoot, 'capture-manifest.json'), {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    selected: selected.map((spec) => spec.id),
    viewports: options.viewports,
    themes: options.themes,
    sourceDirectoryHash: inventory.sourceDirectoryHash,
    combinations: records.length,
    records: records.sort((a, b) =>
      `${a.id}/${a.theme}/${a.viewport}`.localeCompare(`${b.id}/${b.theme}/${b.viewport}`),
    ),
  })
  await writeJson(join(options.outputRoot, 'manifest.json'), {
    schemaVersion: 1,
    runId: options.outputRoot.split(/[\\/]/).at(-1) ?? 'audit',
    generatedAt: new Date().toISOString(),
    sourceUrl: inventory.sourceUrl,
    sourceDirectoryHash: inventory.sourceDirectoryHash,
    selected: selected.map((spec) => spec.id),
    categories: [...new Set(selected.map((spec) => spec.category))].sort(),
    viewports: options.viewports,
    themes: options.themes,
    staticCombinations: records.length / 2,
  })
  console.log(
    JSON.stringify({
      command: 'capture',
      variants: selected.length,
      combinations: records.length,
      outputRoot: options.outputRoot,
    }),
  )
}

async function _runInteractionsLegacy(
  options: AuditOptions,
  browser: Browser,
  inventory: ReactBitsProInventory,
): Promise<void> {
  const selected = selectedLocalSpecs(options)
  const references = new Map(inventory.variants.map((reference) => [reference.id, reference]))
  const server = await waitForLocalPreview()
  const results: Record<string, unknown>[] = []
  try {
    for (const spec of selected) {
      const reference = references.get(spec.id)
      if (!reference) throw new Error(`Missing React Bits reference for ${spec.id}`)
      const context = await browser.newContext({ reducedMotion: 'reduce' })
      try {
        const sourcePage = await context.newPage()
        const localPage = await context.newPage()
        for (const viewport of options.viewports) {
          for (const theme of options.themes) {
            await sourcePage.setViewportSize({ width: viewport.width, height: viewport.height })
            await sourcePage.goto(referencePageUrl(reference, options), {
              waitUntil: 'domcontentloaded',
              timeout: 60_000,
            })
            await enforceReferenceTheme(sourcePage, theme)
            const frame = await previewFrame(sourcePage)
            const sourceSelector = await componentSelector(frame, '#preview-root')
            const sourceSnapshot = await snapshotRoot(frame, sourceSelector)
            const cases = interactionCases(sourceSnapshot, spec.id)
            for (const interaction of cases) {
              const source = await replayReferenceInteraction(
                sourcePage,
                reference,
                options,
                theme,
                viewport,
                interaction,
                options.outputRoot,
              )
              const local = await replayInteraction(localPage, spec, theme, viewport, interaction, options.outputRoot)
              const sourceDelta = await interactionDelta(source)
              const localDelta = await interactionDelta(local)
              const status =
                local.status === 'missing'
                  ? 'missing'
                  : sourceDelta?.changed === false && localDelta?.changed === false
                    ? 'source-no-op'
                    : sourceDelta?.signature === localDelta?.signature
                      ? 'matched'
                      : 'lumen-different'
              const result = {
                id: interaction.id,
                action: interaction.action,
                capability: interaction.action,
                viewport: viewport.id,
                theme,
                control: interaction.control,
                source,
                local,
                status,
                feedback: {
                  sourceChanged: sourceDelta?.changed ?? false,
                  localChanged: localDelta?.changed ?? false,
                  deltaMatched: sourceDelta?.signature === localDelta?.signature,
                  sourceDelta,
                  localDelta,
                },
              }
              await writeJson(join(dirname(source.directory), 'source-state.json'), {
                before: source.beforeSnapshot,
                after: source.afterSnapshot,
                status: source.status,
              })
              await writeJson(join(dirname(source.directory), 'lumen-state.json'), {
                before: local.beforeSnapshot,
                after: local.afterSnapshot,
                status: local.status,
              })
              await writeJson(join(dirname(source.directory), 'comparison.json'), result)
              results.push(result)
            }
          }
        }
        await sourcePage.close()
        await localPage.close()
      } finally {
        await context.close()
      }
    }
  } finally {
    server?.kill()
  }
  await writeJson(join(options.outputRoot, 'interaction-report.json'), {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    selected: selected.map((spec) => spec.id),
    discovered: results.length,
    results,
  })
  console.log(
    JSON.stringify({
      command: 'interactions',
      variants: selected.length,
      cases: results.length,
      outputRoot: options.outputRoot,
    }),
  )
}

void _runInteractionsLegacy

async function runInteractionsParallel(
  options: AuditOptions,
  browser: Browser,
  inventory: ReactBitsProInventory,
): Promise<void> {
  const selected = selectedLocalSpecs(options)
  const references = new Map(inventory.variants.map((reference) => [reference.id, reference]))
  const server = await waitForLocalPreview()
  const results: Record<string, unknown>[] = []
  let cursor = 0
  const worker = async () => {
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    const sourcePage = await context.newPage()
    const localPage = await context.newPage()
    try {
      while (cursor < selected.length) {
        const index = cursor
        cursor += 1
        const spec = selected[index]
        if (!spec) continue
        const reference = references.get(spec.id)
        if (!reference) throw new Error(`Missing React Bits reference for ${spec.id}`)
        for (const viewport of options.viewports) {
          for (const theme of options.themes) {
            await sourcePage.setViewportSize({ width: viewport.width, height: viewport.height })
            await sourcePage.goto(referencePageUrl(reference, options), { waitUntil: 'domcontentloaded', timeout: 60_000 })
            await enforceReferenceTheme(sourcePage, theme)
            const frame = await previewFrame(sourcePage)
            const sourceSelector = await componentSelector(frame, '#preview-root')
            const sourceSnapshot = await snapshotRoot(frame, sourceSelector)
            for (const interaction of interactionCases(sourceSnapshot, spec.id)) {
              const source = await replayReferenceInteraction(sourcePage, reference, options, theme, viewport, interaction, options.outputRoot)
              const local = await replayInteraction(localPage, spec, theme, viewport, interaction, options.outputRoot)
              const sourceDelta = await interactionDelta(source)
              const localDelta = await interactionDelta(local)
              const status = local.status === 'missing'
                ? 'missing'
                : sourceDelta?.changed === false && localDelta?.changed === false
                  ? 'source-no-op'
                  : sourceDelta?.signature === localDelta?.signature
                    ? 'matched'
                    : 'lumen-different'
              const result = {
                id: interaction.id,
                action: interaction.action,
                capability: interaction.action,
                viewport: viewport.id,
                theme,
                control: interaction.control,
                source,
                local,
                status,
                feedback: {
                  sourceChanged: sourceDelta?.changed ?? false,
                  localChanged: localDelta?.changed ?? false,
                  deltaMatched: sourceDelta?.signature === localDelta?.signature,
                  sourceDelta,
                  localDelta,
                },
              }
              await writeJson(join(dirname(source.directory), 'source-state.json'), {
                before: source.beforeSnapshot,
                after: source.afterSnapshot,
                status: source.status,
              })
              await writeJson(join(dirname(source.directory), 'lumen-state.json'), {
                before: local.beforeSnapshot,
                after: local.afterSnapshot,
                status: local.status,
              })
              await writeJson(join(dirname(source.directory), 'comparison.json'), result)
              results.push(result)
            }
          }
        }
      }
    } finally {
      await context.close()
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(options.workers, selected.length) }, () => worker()))
  } finally {
    server?.kill()
  }
  await writeJson(join(options.outputRoot, 'interaction-report.json'), {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    selected: selected.map((spec) => spec.id),
    discovered: results.length,
    results,
  })
  console.log(JSON.stringify({ command: 'interactions', variants: selected.length, cases: results.length, outputRoot: options.outputRoot }))
}

async function runCompare(options: AuditOptions): Promise<void> {
  const capturePath = join(options.outputRoot, 'capture-manifest.json')
  if (!(await Bun.file(capturePath).exists())) throw new Error(`Missing capture manifest: ${capturePath}`)
  const manifest = await readJson<{ records: readonly CaptureRecord[] }>(capturePath)
  const comparisons: StructureComparison[] = []
  for (const record of manifest.records) {
    const localRecord = manifest.records.find(
      (candidate) =>
        candidate.kind === 'local' &&
        candidate.id === record.id &&
        candidate.theme === record.theme &&
        candidate.viewport === record.viewport,
    )
    if (record.kind !== 'source' || !localRecord) continue
    const sourceSnapshot = await readJson<SemanticSnapshot>(record.snapshot)
    const localSnapshotValue = await readJson<SemanticSnapshot>(localRecord.snapshot)
    comparisons.push({
      id: record.id,
      theme: record.theme,
      viewport: record.viewport,
      source: {
        screenshot: record.screenshot,
        contextScreenshot: record.contextScreenshot,
        snapshot: record.snapshot,
      },
      local: {
        screenshot: localRecord.screenshot,
        contextScreenshot: localRecord.contextScreenshot,
        snapshot: localRecord.snapshot,
      },
      structure: {
        sourceRootRect: sourceSnapshot.rootRect,
        localRootRect: localSnapshotValue.rootRect,
        widthDelta: localSnapshotValue.rootRect.width - sourceSnapshot.rootRect.width,
        heightDelta: localSnapshotValue.rootRect.height - sourceSnapshot.rootRect.height,
        sourceControls: sourceSnapshot.controls.length,
        localControls: localSnapshotValue.controls.length,
        sourceTextLength: sourceSnapshot.bodyTextLength,
        localTextLength: localSnapshotValue.bodyTextLength,
        sourceTextLineCount: sourceSnapshot.textLineCount,
        localTextLineCount: localSnapshotValue.textLineCount,
        sourceTruncatedTextCount: sourceSnapshot.truncatedTextCount,
        localTruncatedTextCount: localSnapshotValue.truncatedTextCount,
        sourceAxSnapshot: sourceSnapshot.axSnapshot,
        localAxSnapshot: localSnapshotValue.axSnapshot,
        sourceTreeNodes: sourceSnapshot.tree.length,
        localTreeNodes: localSnapshotValue.tree.length,
        sourceTreeTags: sourceSnapshot.tree.map((node) => node.tag),
        localTreeTags: localSnapshotValue.tree.map((node) => node.tag),
        sourceOverflow: sourceSnapshot.horizontalOverflow,
        localOverflow: localSnapshotValue.horizontalOverflow,
        errors: [...record.errors, ...localRecord.errors],
        controlShapeMatched: sourceSnapshot.controls.every((control, index) => {
          const localControl = localSnapshotValue.controls[index]
          return (
            localControl?.tag === control.tag &&
            localControl.role === control.role &&
            localControl.type === control.type
          )
        }),
        controlCountMatched: sourceSnapshot.controls.length === localSnapshotValue.controls.length,
        truncationFree: localSnapshotValue.truncatedTextCount <= sourceSnapshot.truncatedTextCount,
        truncationMatched: sourceSnapshot.truncatedTextCount === localSnapshotValue.truncatedTextCount,
        overflowFree: !sourceSnapshot.horizontalOverflow && !localSnapshotValue.horizontalOverflow,
      },
    })
  }
  const structuralFailures: Array<{ id: string; theme: string; viewport: string; reason: string }> =
    comparisons.flatMap((comparison) => {
      const failures: string[] = []
      if (!comparison.structure.controlCountMatched) failures.push('control-count-mismatch')
      if (!comparison.structure.controlShapeMatched) failures.push('control-shape-mismatch')
      if (!comparison.structure.truncationFree) failures.push('text-truncation')
      if (!comparison.structure.overflowFree) failures.push('horizontal-overflow')
      if (comparison.structure.errors.length > 0) failures.push('page-or-console-error')
      return failures.map((reason) => ({
        id: comparison.id,
        theme: comparison.theme,
        viewport: comparison.viewport,
        reason,
      }))
    })
  const expectedComparisons = manifest.records.filter((record) => record.kind === 'source').length
  if (comparisons.length !== expectedComparisons) {
    structuralFailures.push({
      id: '*',
      theme: '*',
      viewport: '*',
      reason: `missing-paired-comparisons:${expectedComparisons - comparisons.length}`,
    })
  }
  await writeJson(join(options.outputRoot, 'structure-report.json'), {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    strict: options.strict,
    failures: structuralFailures,
    comparisons,
  })
  const visualDiff = Bun.spawn(
    ['python', resolve('scripts/compare-reactbits-pro-visuals.py'), '--root', options.outputRoot],
    { stdout: 'inherit', stderr: 'inherit' },
  )
  const visualExitCode = await visualDiff.exited
  if (visualExitCode !== 0) throw new Error(`Visual comparison failed with exit code ${visualExitCode}`)
  const inventory = await readJson<ReactBitsProInventory>(inventoryPath(options))
  const interactionPath = join(options.outputRoot, 'interaction-report.json')
  const interactionReport = (await Bun.file(interactionPath).exists())
    ? await readJson<{ results: readonly { id: string; status?: string }[] }>(interactionPath)
    : { results: [] }
  const selectedIds = [...new Set(manifest.records.map((record) => record.id))]
  const ledger = selectedIds.map((id) => {
    const staticRows = comparisons.filter((comparison) => comparison.id === id)
    const interactionRows = interactionReport.results.filter((result) => result.id.startsWith(`${id}:`))
    const failures = structuralFailures.filter((failure) => failure.id === id).map((failure) => failure.reason)
    const interactionFailures = interactionRows
      .filter((result) => result.status === 'missing' || result.status === 'lumen-different')
      .map((result) => `${result.id}:${result.status}`)
    const status = failures.length || interactionFailures.length ? 'needs-fix' : 'passed'
    return {
      id,
      category: inventory.variants.find((variant) => variant.id === id)?.category ?? 'unknown',
      staticCombinations: staticRows.length,
      interactionCases: interactionRows.length,
      status,
      failures: [...failures, ...interactionFailures],
      manualReview: false,
      lastVerified: new Date().toISOString(),
    }
  })
  await writeJson(join(options.outputRoot, 'review-ledger.json'), {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    categories: inventory.categories,
    variants: ledger,
    summary: {
      variants: ledger.length,
      passed: ledger.filter((entry) => entry.status === 'passed').length,
      needsFix: ledger.filter((entry) => entry.status === 'needs-fix').length,
      staticCombinations: comparisons.length,
      interactionCases: interactionReport.results.length,
    },
  })
  const reportRows = ledger
    .map(
      (entry) =>
        `<tr><td>${entry.category}</td><td>${entry.id}</td><td>${entry.staticCombinations}</td><td>${entry.interactionCases}</td><td>${entry.status}</td><td>${entry.failures.join(', ')}</td></tr>`,
    )
    .join('')
  await writeFile(
    join(options.outputRoot, 'report.html'),
    `<!doctype html><meta charset="utf-8"><title>React Bits Pro visual audit</title><style>body{font:14px system-ui;margin:2rem;background:#111;color:#eee}table{border-collapse:collapse;width:100%}td,th{border:1px solid #555;padding:.4rem;text-align:left}td:nth-child(5){font-weight:700}</style><h1>React Bits Pro ↔ lumen-app-ui audit</h1><p>${ledger.length} variants · ${comparisons.length} static pairs · ${interactionReport.results.length} interaction cases</p><table><thead><tr><th>Category</th><th>Variant</th><th>Static</th><th>Interactions</th><th>Status</th><th>Failures</th></tr></thead><tbody>${reportRows}</tbody></table>`,
    'utf8',
  )
  const existingManifest = (await Bun.file(join(options.outputRoot, 'manifest.json')).exists())
    ? await readJson<Record<string, unknown>>(join(options.outputRoot, 'manifest.json'))
    : {}
  await writeJson(join(options.outputRoot, 'manifest.json'), {
    ...existingManifest,
    schemaVersion: 1,
    runId: options.outputRoot.split(/[\\/]/).at(-1) ?? 'audit',
    reference: {
      url: inventory.sourceUrl,
      generatedAt: inventory.generatedAt,
      sourceDirectoryHash: inventory.sourceDirectoryHash,
    },
    categories: inventory.categories,
    variants: inventory.variants,
    viewports: options.viewports,
    themes: options.themes,
    staticCombinations: comparisons.length,
    interactionCases: interactionReport.results.length,
    errors: structuralFailures,
  })
  if (options.strict && structuralFailures.length > 0) {
    throw new Error(`React Bits structural audit failed: ${JSON.stringify(structuralFailures.slice(0, 20))}`)
  }
  console.log(JSON.stringify({ command: 'compare', comparisons: comparisons.length, outputRoot: options.outputRoot }))
}

async function main(): Promise<void> {
  const options = parseOptions()
  await ensureDirectory(options.outputRoot)
  const browser = await chromium.launch({ headless: true, executablePath })
  try {
    if (options.command === 'discover') {
      const inventory = options.offline
        ? await loadOrDiscoverInventory(browser, options)
        : await discoverReferenceInventory(browser, options)
      await writeLocalInventory(options.outputRoot)
      console.log(
        JSON.stringify({
          command: 'discover',
          variants: inventory.variants.length,
          categories: inventory.categories.length,
        }),
      )
      return
    }
    const inventory =
      options.command === 'audit' && !options.offline
        ? await discoverReferenceInventory(browser, options)
        : await loadOrDiscoverInventory(browser, options)
    if (options.command === 'capture' || options.command === 'audit') await runCapture(options, browser, inventory)
    if (options.command === 'interactions' || options.command === 'audit')
      await runInteractionsParallel(options, browser, inventory)
    if (options.command === 'compare' || options.command === 'audit') await runCompare(options)
  } finally {
    await browser.close()
  }
}

if (import.meta.main) await main()
