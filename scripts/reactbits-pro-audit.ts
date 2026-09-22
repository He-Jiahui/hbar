import { chromium, type Browser, type Frame, type Locator, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { HBAR_APP_UI_VARIANT_SPECS } from '../packages/hbar-app-ui/src/specs'
import type { HbarAppUiCategory, HbarAppUiVariantSpec } from '../packages/hbar-app-ui/src/types'

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

export type ReactBitsProReferenceVariant = Readonly<{
  id: string
  sourceId: string
  category: HbarAppUiCategory
  variant: number
  url: string
  title: string
  description: string
}>

export type ReactBitsProInventory = Readonly<{
  schemaVersion: 1
  sourceUrl: string
  generatedAt: string
  categories: readonly string[]
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
}>

export type SemanticSnapshot = Readonly<{
  rootTag: string
  rootRect: Readonly<{ width: number; height: number }>
  bodyTextLength: number
  horizontalOverflow: boolean
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
  screenshot: string
  snapshot: string
  errors: readonly string[]
}>

type InteractionCase = Readonly<{
  id: string
  action: 'hover' | 'focus' | 'click' | 'fill' | 'press'
  control: ControlSnapshot
}>

type AuditOptions = Readonly<{
  command: 'discover' | 'capture' | 'interactions' | 'compare' | 'audit'
  variants: readonly string[]
  categories: readonly string[]
  outputRoot: string
  workers: number
  strict: boolean
}>

const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const localPreviewUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5180'

function sourceIdFor(spec: HbarAppUiVariantSpec): string {
  return `${spec.category}-${spec.variant}`
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
  const categories = parseList(optionValue(args, '--categories') ?? process.env.HBAR_APP_UI_CATEGORIES)
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
    outputRoot,
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

async function discoverReferenceInventory(browser: Browser, outputRoot: string): Promise<ReactBitsProInventory> {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  try {
    await page.goto(REACTBITS_PRO_APPLICATION_UI_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
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
      await page.goto(new URL(categoryPath, REACTBITS_PRO_APPLICATION_UI_URL).href, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      })
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
    if (unique.length !== 300 || categories.length !== 38 || missingReference.length || missingLocal.length) {
      throw new Error(
        `React Bits inventory mismatch: ${JSON.stringify({
          referenceVariants: unique.length,
          referenceCategories: categories.length,
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
  const inventoryPath = join(options.outputRoot, 'source-inventory.json')
  if (await Bun.file(inventoryPath).exists()) return readJson<ReactBitsProInventory>(inventoryPath)
  return discoverReferenceInventory(browser, options.outputRoot)
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
  const path = await container
    .locator(rootSelector)
    .first()
    .evaluate((root) => {
      const rootTextLength = (root.textContent ?? '').trim().length
      if (rootTextLength === 0) return []
      const rootRect = root.getBoundingClientRect()
      const candidates = [...root.querySelectorAll('*')]
        .map((element) => {
          const rect = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          const textLength = (element.textContent ?? '').trim().length
          const path: number[] = []
          let current: Element | null = element
          while (current && current !== root) {
            const parent: HTMLElement | null = current.parentElement
            if (!parent) break
            path.unshift(Array.from(parent.children).indexOf(current))
            current = parent
          }
          return { rect, style, textLength, path }
        })
        .filter(
          (candidate) =>
            candidate.textLength >= rootTextLength * 0.8 &&
            candidate.rect.width > 0 &&
            candidate.rect.height > 0 &&
            candidate.rect.width < rootRect.width * 0.95 &&
            candidate.rect.height < rootRect.height * 0.95 &&
            candidate.style.position !== 'fixed',
        )
        .sort((left, right) => left.path.length - right.path.length || right.textLength - left.textLength)
      return candidates[0]?.path ?? []
    })
  if (path.length === 0) return `${rootSelector} > *`
  return `${rootSelector}${path.map((index) => ` > :nth-child(${index + 1})`).join('')}`
}

async function snapshotRoot(frame: Frame, selector: string): Promise<SemanticSnapshot> {
  return frame.locator(selector).evaluate((element) => {
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
    }))
    const rootRect = element.getBoundingClientRect()
    const body = element.ownerDocument.body
    return {
      rootTag: element.tagName.toLowerCase(),
      rootRect: { width: Math.round(rootRect.width), height: Math.round(rootRect.height) },
      bodyTextLength: (element.textContent ?? '').trim().length,
      horizontalOverflow: Math.max(element.scrollWidth, body?.scrollWidth ?? 0) > (body?.clientWidth ?? 0) + 1,
      tree,
      controls,
    }
  })
}

async function localSnapshot(page: Page, selector: string): Promise<SemanticSnapshot> {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => {
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
      const controls = [...element.querySelectorAll('button,a,input,select,textarea,[role]')].map((control, index) => ({
        index,
        tag: control.tagName.toLowerCase(),
        role: control.getAttribute('role'),
        type: control.getAttribute('type'),
        name:
          control.getAttribute('aria-label') ??
          (control.textContent ?? '').trim().replaceAll(/\s+/g, ' ').slice(0, 160),
        disabled: control.matches(':disabled') || control.getAttribute('aria-disabled') === 'true',
        expanded: control.getAttribute('aria-expanded'),
        pressed: control.getAttribute('aria-pressed'),
        selected: control.getAttribute('aria-selected'),
        state: control.getAttribute('data-state'),
      }))
      const rootRect = element.getBoundingClientRect()
      return {
        rootTag: element.tagName.toLowerCase(),
        rootRect: { width: Math.round(rootRect.width), height: Math.round(rootRect.height) },
        bodyTextLength: (element.textContent ?? '').trim().length,
        horizontalOverflow: element.scrollWidth > element.clientWidth + 1,
        tree,
        controls,
      }
    })
}

async function captureSource(
  page: Page,
  reference: ReactBitsProReferenceVariant,
  viewport: AuditViewport,
  theme: AuditTheme,
  outputRoot: string,
): Promise<CaptureRecord> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  await page.goto(reference.url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await enforceReferenceTheme(page, theme)
  const frame = await previewFrame(page)
  const selector = await componentSelector(frame, '#preview-root')
  const root = frame.locator(selector).first()
  await root.waitFor({ state: 'visible', timeout: 30_000 })
  const directory = join(outputRoot, 'source', reference.id, theme)
  await ensureDirectory(directory)
  const screenshot = join(directory, `${viewport.id}.png`)
  const snapshot = join(directory, `${viewport.id}.json`)
  await root.screenshot({ path: screenshot, animations: 'disabled' })
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
    sourceUrl: reference.url,
    screenshot,
    snapshot,
    errors: [],
  }
}

async function captureLocal(
  page: Page,
  spec: HbarAppUiVariantSpec,
  viewport: AuditViewport,
  theme: AuditTheme,
  outputRoot: string,
): Promise<CaptureRecord> {
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
  const snapshot = join(directory, `${viewport.id}.json`)
  await root.screenshot({ path: screenshot, animations: 'disabled' })
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
    screenshot,
    snapshot,
    errors: [],
  }
}

function interactionCases(snapshot: SemanticSnapshot, variantId: string): readonly InteractionCase[] {
  const cases: InteractionCase[] = []
  for (const control of snapshot.controls) {
    const prefix = `${variantId}:${control.index}`
    cases.push({ id: `${prefix}:hover`, action: 'hover', control })
    cases.push({ id: `${prefix}:focus`, action: 'focus', control })
    if (!control.disabled) {
      cases.push({ id: `${prefix}:click`, action: 'click', control })
      if (control.tag === 'input' || control.tag === 'textarea') {
        cases.push({ id: `${prefix}:fill`, action: 'fill', control })
      }
      if (control.tag === 'button' || control.role === 'button' || control.role === 'menuitem') {
        cases.push({ id: `${prefix}:press`, action: 'press', control })
      }
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
  if (interaction.action === 'press') {
    await control.focus()
    await control.press('Enter')
  }
}

type InteractionCapture = Readonly<{
  id: string
  status: 'captured' | 'missing'
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
  await root.screenshot({ path: before, animations: 'disabled' })
  await writeJson(beforeSnapshot, await localSnapshot(page, selector))
  if (!control) {
    return {
      id: interaction.id,
      status: 'missing',
      before,
      after: null,
      beforeSnapshot,
      afterSnapshot: null,
      reason: 'control-index-not-found',
    }
  }
  await applyInteraction(control, interaction)
  await page.waitForTimeout(120)
  await root.screenshot({ path: after, animations: 'disabled' })
  await writeJson(afterSnapshot, await localSnapshot(page, selector))
  return { id: interaction.id, status: 'captured', before, after, beforeSnapshot, afterSnapshot }
}

async function replayReferenceInteraction(
  page: Page,
  reference: ReactBitsProReferenceVariant,
  theme: AuditTheme,
  viewport: AuditViewport,
  interaction: InteractionCase,
  outputRoot: string,
): Promise<InteractionCapture> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  await page.goto(reference.url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
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
  await root.screenshot({ path: before, animations: 'disabled' })
  await writeJson(beforeSnapshot, await snapshotRoot(frame, selector))
  if (!control) {
    return {
      id: interaction.id,
      status: 'missing',
      before,
      after: null,
      beforeSnapshot,
      afterSnapshot: null,
      reason: 'control-index-not-found',
    }
  }
  await applyInteraction(control, interaction)
  await page.waitForTimeout(120)
  await root.screenshot({ path: after, animations: 'disabled' })
  await writeJson(afterSnapshot, await snapshotRoot(frame, selector))
  return { id: interaction.id, status: 'captured', before, after, beforeSnapshot, afterSnapshot }
}

async function runCapture(options: AuditOptions, browser: Browser, inventory: ReactBitsProInventory): Promise<void> {
  const selected = selectedLocalSpecs(options)
  const references = new Map(inventory.variants.map((reference) => [reference.id, reference]))
  const server = await waitForLocalPreview()
  const records: CaptureRecord[] = []
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
        for (const viewport of REACTBITS_PRO_VIEWPORTS) {
          for (const theme of REACTBITS_PRO_THEMES) {
            records.push(await captureSource(sourcePage, reference, viewport, theme, options.outputRoot))
            records.push(await captureLocal(localPage, spec, viewport, theme, options.outputRoot))
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
    combinations: records.length,
    records: records.sort((a, b) =>
      `${a.id}/${a.theme}/${a.viewport}`.localeCompare(`${b.id}/${b.theme}/${b.viewport}`),
    ),
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

async function runInteractions(
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
        for (const viewport of REACTBITS_PRO_VIEWPORTS) {
          for (const theme of REACTBITS_PRO_THEMES) {
            await sourcePage.setViewportSize({ width: viewport.width, height: viewport.height })
            await sourcePage.goto(reference.url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
            await enforceReferenceTheme(sourcePage, theme)
            const frame = await previewFrame(sourcePage)
            const sourceSelector = await componentSelector(frame, '#preview-root')
            const sourceSnapshot = await snapshotRoot(frame, sourceSelector)
            const cases = interactionCases(sourceSnapshot, spec.id)
            for (const interaction of cases) {
              const source = await replayReferenceInteraction(
                sourcePage,
                reference,
                theme,
                viewport,
                interaction,
                options.outputRoot,
              )
              const local = await replayInteraction(localPage, spec, theme, viewport, interaction, options.outputRoot)
              const sourceDelta = await interactionDelta(source)
              const localDelta = await interactionDelta(local)
              results.push({
                id: interaction.id,
                action: interaction.action,
                viewport: viewport.id,
                theme,
                control: interaction.control,
                source,
                local,
                feedback: {
                  sourceChanged: sourceDelta?.changed ?? false,
                  localChanged: localDelta?.changed ?? false,
                  deltaMatched: sourceDelta?.signature === localDelta?.signature,
                  sourceDelta,
                  localDelta,
                },
              })
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

async function runCompare(options: AuditOptions): Promise<void> {
  const capturePath = join(options.outputRoot, 'capture-manifest.json')
  if (!(await Bun.file(capturePath).exists())) throw new Error(`Missing capture manifest: ${capturePath}`)
  const manifest = await readJson<{ records: readonly CaptureRecord[] }>(capturePath)
  const comparisons = []
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
      source: { screenshot: record.screenshot, snapshot: record.snapshot },
      local: { screenshot: localRecord.screenshot, snapshot: localRecord.snapshot },
      structure: {
        sourceRootRect: sourceSnapshot.rootRect,
        localRootRect: localSnapshotValue.rootRect,
        widthDelta: localSnapshotValue.rootRect.width - sourceSnapshot.rootRect.width,
        heightDelta: localSnapshotValue.rootRect.height - sourceSnapshot.rootRect.height,
        sourceControls: sourceSnapshot.controls.length,
        localControls: localSnapshotValue.controls.length,
        sourceTextLength: sourceSnapshot.bodyTextLength,
        localTextLength: localSnapshotValue.bodyTextLength,
        sourceTreeNodes: sourceSnapshot.tree.length,
        localTreeNodes: localSnapshotValue.tree.length,
        sourceTreeTags: sourceSnapshot.tree.map((node) => node.tag),
        localTreeTags: localSnapshotValue.tree.map((node) => node.tag),
        sourceOverflow: sourceSnapshot.horizontalOverflow,
        localOverflow: localSnapshotValue.horizontalOverflow,
        controlCountMatched: sourceSnapshot.controls.length === localSnapshotValue.controls.length,
        overflowFree: !sourceSnapshot.horizontalOverflow && !localSnapshotValue.horizontalOverflow,
      },
    })
  }
  const structuralFailures: Array<{ id: string; theme: string; viewport: string; reason: string }> =
    comparisons.flatMap((comparison) => {
      const failures: string[] = []
      if (!comparison.structure.controlCountMatched) failures.push('control-count-mismatch')
      if (!comparison.structure.overflowFree) failures.push('horizontal-overflow')
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
      const inventory = await discoverReferenceInventory(browser, options.outputRoot)
      console.log(
        JSON.stringify({
          command: 'discover',
          variants: inventory.variants.length,
          categories: inventory.categories.length,
        }),
      )
      return
    }
    const inventory = await loadOrDiscoverInventory(browser, options)
    if (options.command === 'capture' || options.command === 'audit') await runCapture(options, browser, inventory)
    if (options.command === 'interactions' || options.command === 'audit')
      await runInteractions(options, browser, inventory)
    if (options.command === 'compare' || options.command === 'audit') await runCompare(options)
  } finally {
    await browser.close()
  }
}

if (import.meta.main) await main()
