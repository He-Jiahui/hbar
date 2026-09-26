import { chromium, type Browser, type Frame, type Locator, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { renderAuditEvidencePage } from './reactbits-audit-evidence-page'
import { auditSamplingPlan, sampledInteractionIds } from './reactbits-audit-sampling'
import { includesLumenAuditFile, lumenDependencyFiles } from './reactbits-audit-scope'
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

export function referenceAccessBlockReason(status: number, title: string): string | null {
  if (/Vercel Security Checkpoint/i.test(title)) return 'vercel-security-checkpoint'
  if (status === 401 || status === 403) return `http-${status}`
  if (status === 429) return 'http-429-rate-limited'
  return null
}

class ReferenceAccessBlockedError extends Error {
  constructor(
    readonly url: string,
    readonly sourceStatus: number,
    readonly pageTitle: string,
    readonly reason: string,
  ) {
    super(`React Bits reference blocked (${reason}, HTTP ${sourceStatus}) at ${url}`)
  }
}

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

export type ControlSnapshot = Readonly<{
  index: number
  rect: Readonly<{ x: number; y: number; width: number; height: number }>
  tag: string
  role: string | null
  type: string | null
  name: string
  disabled: boolean
  visible?: boolean
  expanded: string | null
  pressed: string | null
  selected: string | null
  state: string | null
  value?: string | null | undefined
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
  observedScroll?: Readonly<{ top: number; left: number; maximum: number }> | undefined
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
  referenceCanvas?: ReferenceCanvas
  errors: readonly string[]
}>

export type ReferenceCanvas = Readonly<{
  width: number
  height: number
  padding: Readonly<{ top: number; right: number; bottom: number; left: number }>
}>

type CanvasPadding = ReferenceCanvas['padding']

export function alignedCanvasPadding(
  reference: CanvasPadding,
  localInset: CanvasPadding,
  fullCanvas = false,
): CanvasPadding {
  if (fullCanvas) return { top: 0, right: 0, bottom: 0, left: 0 }
  return {
    top: Math.max(0, reference.top - localInset.top),
    right: Math.max(0, reference.right - localInset.right),
    bottom: Math.max(0, reference.bottom - localInset.bottom),
    left: Math.max(0, reference.left - localInset.left),
  }
}

type StructureComparison = Readonly<{
  id: string
  theme: AuditTheme
  viewport: string
  source: Readonly<Record<string, string>>
  local: Readonly<Record<string, string>>
  structure: Readonly<{
    controlCountMatched: boolean
    controlShapeMatched: boolean
    rootGeometryMatched: boolean
    truncationFree: boolean
    overflowFree: boolean
    errors: readonly string[]
    [key: string]: unknown
  }>
}>

type InteractionReportRow = Readonly<{
  variantId?: string
  id: string
  theme: string
  viewport: string
  status?: string
  source?: Readonly<{ before?: string | null; after?: string | null }>
  local?: Readonly<{ before?: string | null; after?: string | null }>
}>

export function assessInteractionCoverage(
  expected: readonly string[],
  actual: readonly InteractionReportRow[],
): Readonly<{ missing: readonly string[]; duplicate: readonly string[]; unexpected: readonly string[] }> {
  const expectedSet = new Set(expected)
  const seen = new Set<string>()
  const duplicate: string[] = []
  const unexpected: string[] = []
  for (const row of actual) {
    const key = `${row.theme}/${row.viewport}/${row.id}`
    if (seen.has(key)) duplicate.push(key)
    seen.add(key)
    if (!expectedSet.has(key)) unexpected.push(key)
  }
  return { missing: expected.filter((key) => !seen.has(key)), duplicate, unexpected }
}

export function rootGeometryMatches(
  source: Readonly<{ width: number; height: number }>,
  local: Readonly<{ width: number; height: number }>,
): boolean {
  if (source.width <= 0 || source.height <= 0 || local.width <= 0 || local.height <= 0) return false
  return (
    Math.abs(local.width - source.width) / source.width <= 0.05 &&
    Math.abs(local.height - source.height) / source.height <= 0.08
  )
}

export function interactionFeedbackMatches(sourceChangedPixelRatio: number, localChangedPixelRatio: number): boolean {
  if (!Number.isFinite(sourceChangedPixelRatio) || !Number.isFinite(localChangedPixelRatio)) return false
  if (sourceChangedPixelRatio < 0 || localChangedPixelRatio < 0) return false
  return Math.abs(sourceChangedPixelRatio - localChangedPixelRatio) <= Math.max(0.02, sourceChangedPixelRatio * 0.35)
}

export function fullAuditMatrixSelected(
  viewports: readonly Readonly<{ id: string }>[],
  themes: readonly string[],
): boolean {
  return (
    viewports.length === REACTBITS_PRO_VIEWPORTS.length &&
    themes.length === REACTBITS_PRO_THEMES.length &&
    REACTBITS_PRO_VIEWPORTS.every((viewport) => viewports.some((candidate) => candidate.id === viewport.id)) &&
    REACTBITS_PRO_THEMES.every((theme) => themes.includes(theme))
  )
}

export function interactionWorkersPerVariant(workers: number, selectedVariants: number): number {
  return Math.max(1, Math.floor(workers / Math.max(1, Math.min(workers, selectedVariants))))
}

export const queueApprovalScenarioPlans = [
  { id: 'queue-start-open', decisions: [], expanded: true },
  { id: 'queue-a-closed', decisions: ['Approve'], expanded: false },
  { id: 'queue-a-open', decisions: ['Approve'], expanded: true },
  { id: 'queue-r-closed', decisions: ['Reject'], expanded: false },
  { id: 'queue-r-open', decisions: ['Reject'], expanded: true },
  { id: 'queue-aa-closed', decisions: ['Approve', 'Approve'], expanded: false },
  { id: 'queue-aa-open', decisions: ['Approve', 'Approve'], expanded: true },
  { id: 'queue-ar-closed', decisions: ['Approve', 'Reject'], expanded: false },
  { id: 'queue-ar-open', decisions: ['Approve', 'Reject'], expanded: true },
  { id: 'queue-ra-closed', decisions: ['Reject', 'Approve'], expanded: false },
  { id: 'queue-ra-open', decisions: ['Reject', 'Approve'], expanded: true },
  { id: 'queue-rr-closed', decisions: ['Reject', 'Reject'], expanded: false },
  { id: 'queue-rr-open', decisions: ['Reject', 'Reject'], expanded: true },
] as const

type QueueApprovalScenarioPlan = (typeof queueApprovalScenarioPlans)[number]
export type QueueApprovalScenario = QueueApprovalScenarioPlan['id']
export const permissionApprovalScenarios = ['permission-open', 'permission-partial-open', 'permission-empty'] as const
type PermissionApprovalScenario = (typeof permissionApprovalScenarios)[number]

export type InteractionCase = Readonly<{
  id: string
  action: HbarAppUiInteractionCapability
  scenario?:
    | 'running'
    | 'away'
    | 'retry-queued'
    | 'inline-request-open'
    | 'diff-request-open'
    | 'cost-request-open'
    | 'history-match'
    | 'history-empty'
    | 'plan-paused'
    | 'plan-draft'
    | 'plan-running'
    | 'activity-snooze-menu'
    | 'activity-snoozed'
    | 'activity-archived'
    | 'activity-back'
    | 'system-expanded'
    | 'system-dismissed'
    | 'system-empty'
    | 'bell-open'
    | 'bell-unread'
    | 'bell-unread-empty'
    | 'auth-email-only'
    | 'auth-valid'
    | 'auth-provider-sso'
    | 'auth-provider-sso-valid'
    | 'auth-provider-email-valid'
    | 'auth-two-step-password'
    | 'auth-two-step-invalid'
    | 'auth-magic-form'
    | 'auth-magic-form-invalid'
    | 'auth-code-recovery'
    | 'auth-code-recovery-valid'
    | 'auth-code-five'
    | 'auth-code-verified'
    | 'auth-signup-password'
    | 'auth-signup-complete'
    | 'auth-signup-ready'
    | 'auth-signup-invalid-email'
    | 'auth-enterprise-mismatch'
    | 'auth-passkey-selected'
    | 'auth-passkey-request'
    | 'auth-account-contractor'
    | 'auth-invite-named'
    | 'auth-invite-ready'
    | 'auth-invite-success'
    | 'auth-reset-strong'
    | 'auth-reset-ready'
    | 'auth-reset-ready-no-signout'
    | 'auth-reset-success'
    | 'auth-approval-approved'
    | 'auth-approval-blocked'
    | 'kanban-composer-open'
    | 'kanban-composer-ready'
    | 'kanban-grabbed'
    | 'kanban-grabbed-target'
    | 'tree-shipping-open'
    | 'passive-table-row'
    | 'board-column-scroll'
    | 'board-stack-scroll'
    | 'summary-edit'
    | 'summary-changed'
    | 'summary-empty'
    | 'summary-running'
    | 'usage-month'
    | 'usage-detail'
    | 'usage-model-requests'
    | 'usage-model-row'
    | 'usage-limits-raised'
    | 'usage-members-platform'
    | 'usage-members-empty'
    | 'usage-requests-error'
    | 'usage-requests-error-open'
    | 'shell-account'
    | 'shell-navigation-closed'
    | 'rail-workspace'
    | 'rail-navigation-closed'
    | 'contracts-account'
    | 'contracts-attention'
    | 'contracts-empty'
    | 'contracts-navigation-closed'
    | 'contracts-search'
    | 'contracts-search-query'
    | 'editorial-empty'
    | 'editorial-navigation-closed'
    | 'editorial-schedule'
    | 'inbox-empty'
    | 'inbox-unread'
    | 'inbox-menu'
    | 'inbox-reading'
    | 'inbox-mailboxes'
    | 'documents-closed'
    | 'documents-menu'
    | 'documents-format-menu'
    | 'scope-closed'
    | 'scope-organisation'
    | 'scope-project'
    | 'scope-environment'
    | 'scope-combined'
    | 'scope-account'
    | 'chat-thread-open'
    | 'chat-suggestion'
    | 'sidebar-account-open'
    | 'sidebar-rail-flyout-open'
    | 'sidebar-rail-account-open'
    | 'sidebar-workspace-open'
    | 'sidebar-tree-menu-open'
    | 'sidebar-drawer-closed'
    | 'sidebar-full-closed'
    | 'dialog-plan-closed'
    | 'dialog-delete-valid'
    | 'dialog-delete-closed'
    | 'dialog-invite-empty'
    | 'dialog-invite-invalid'
    | 'dialog-invite-valid'
    | 'dialog-invite-closed'
    | 'dialog-wizard-region'
    | 'dialog-wizard-region-selected'
    | 'dialog-wizard-team'
    | 'dialog-wizard-team-custom'
    | 'dialog-wizard-closed'
    | 'dialog-alert-dirty'
    | 'dialog-alert-guard'
    | 'dialog-alert-closed'
    | 'dialog-evidence-scroll'
    | 'dialog-evidence-closed'
    | 'dialog-menu-export'
    | 'dialog-menu-closed'
    | 'dialog-menu-delete-keyboard'
    | 'toast-success'
    | 'toast-stack'
    | 'preferences-dirty'
    | QueueApprovalScenario
    | PermissionApprovalScenario
    | undefined
  key?: 'Enter' | 'Space' | 'Escape' | 'ArrowRight' | 'ArrowLeft' | 'ArrowDown' | 'ArrowUp' | 'Home' | 'End' | undefined
  control: ControlSnapshot
  wheelDeltaY?: number | undefined
  fillValue?: string | undefined
  /** Keyboard precondition; its real focus/scroll screenshots are saved separately. */
  focusBefore?: boolean | undefined
}>

type AuditOptions = Readonly<{
  command: 'discover' | 'capture' | 'interactions' | 'compare' | 'review' | 'audit'
  variants: readonly string[]
  categories: readonly string[]
  cases: readonly string[]
  viewports: readonly AuditViewport[]
  themes: readonly AuditTheme[]
  outputRoot: string
  referenceRoot: string | undefined
  sourceInventoryPath: string | undefined
  sourceCaptureRoot: string | undefined
  localOnly: boolean
  offline: boolean
  workers: number
  strict: boolean
  exhaustive: boolean
  reviewNote: string | undefined
}>

type ManualReviewEntry = Readonly<{
  fingerprint: string
  reviewedAt: string
  note: string
  staticCombinations: number
  interactionCases: number
}>

type ManualReviewFile = Readonly<{
  schemaVersion: 1
  entries: Readonly<Record<string, ManualReviewEntry>>
}>

export function manualReviewGate(
  machineFailures: readonly string[],
  fingerprint: string,
  review: ManualReviewEntry | undefined,
  staticCombinations: number,
  interactionCases: number,
): Readonly<{ status: 'needs-fix' | 'needs-review' | 'passed'; manualReview: boolean; reason?: string }> {
  if (machineFailures.length > 0) return { status: 'needs-fix', manualReview: false }
  if (!review) return { status: 'needs-review', manualReview: false, reason: 'manual-review-required' }
  if (
    review.fingerprint !== fingerprint ||
    typeof review.note !== 'string' ||
    review.note.trim().length < 12 ||
    typeof review.reviewedAt !== 'string' ||
    Number.isNaN(Date.parse(review.reviewedAt)) ||
    review.staticCombinations !== staticCombinations ||
    review.interactionCases !== interactionCases
  )
    return { status: 'needs-review', manualReview: false, reason: 'manual-review-stale' }
  return { status: 'passed', manualReview: true }
}

const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const localPreviewUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5180'
const browserArguments = auditBrowserArguments(process.env.HBAR_APP_UI_CHROME_HTTP1 === '1')
const captureProtocolVersion = 14
const interactionProtocolVersion = 33

export function auditBrowserArguments(http1: boolean): string[] {
  // A reference React update can repaint unchanged prose from LCD to grayscale
  // antialiasing. Use the same stable rasterization on both sides, not a pixel
  // threshold exception or a stylesheet injected into the reference component.
  return ['--disable-lcd-text', ...(http1 ? ['--disable-http2', '--disable-quic'] : [])]
}
const sourceCanvasSelector = '#preview-root'
const localCanvasSelector = '.hbar-app-ui-isolated-canvas'
export const interactiveControlSelector = [
  'button',
  'a',
  'input',
  'select',
  'textarea',
  'summary',
  '[contenteditable="true"]',
  '[aria-expanded]',
  '[draggable="true"]',
  '[tabindex]:not([role])',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="treeitem"]',
].join(',')

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
    .split(/[\s,]+/)
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
  if (!['discover', 'capture', 'interactions', 'compare', 'review', 'audit'].includes(command)) {
    throw new Error(`Unknown React Bits audit command: ${command}`)
  }
  const variants = parseList(optionValue(args, '--variants') ?? process.env.HBAR_APP_UI_VARIANTS)
  const categories = parseList(
    optionValue(args, '--categories') ?? optionValue(args, '--category') ?? process.env.HBAR_APP_UI_CATEGORIES,
  )
  const cases = (optionValue(args, '--cases') ?? '').split(/[\s,]+/).filter(Boolean)
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
    cases,
    viewports,
    themes,
    outputRoot,
    referenceRoot: optionValue(args, '--reference-root') ?? process.env.HBAR_APP_UI_REFERENCE_ROOT,
    sourceInventoryPath: optionValue(args, '--source-inventory') ?? process.env.HBAR_APP_UI_SOURCE_INVENTORY,
    sourceCaptureRoot: optionValue(args, '--source-output') ?? process.env.HBAR_APP_UI_SOURCE_CAPTURE_ROOT,
    localOnly: args.includes('--local-only'),
    offline:
      args.includes('--offline') ||
      process.env.HBAR_APP_UI_OFFLINE === '1' ||
      process.env.HBAR_APP_UI_OFFLINE === 'true',
    workers,
    strict: args.includes('--strict') || command === 'audit',
    exhaustive: args.includes('--exhaustive'),
    reviewNote: optionValue(args, '--note'),
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

async function copyCachedSourceRecord(
  record: CaptureRecord,
  sourceCaptureRoot: string,
  outputRoot: string,
): Promise<CaptureRecord> {
  const sourceRoot = resolve(sourceCaptureRoot)
  const destination = join(outputRoot, 'source', record.id, record.theme)
  await ensureDirectory(destination)
  const copyArtifact = async (path: string): Promise<string> => {
    const absolute = resolve(path)
    const withinSource = relative(sourceRoot, absolute)
    if (withinSource.startsWith('..') || isAbsolute(withinSource))
      throw new Error(`Cached source artifact escapes the provided capture root: ${absolute}`)
    if (!(await Bun.file(absolute).exists())) throw new Error(`Cached source artifact is missing: ${absolute}`)
    const target = join(destination, basename(absolute))
    if (absolute !== target) await copyFile(absolute, target)
    return target
  }
  const [screenshot, contextScreenshot, snapshot] = await Promise.all([
    copyArtifact(record.screenshot),
    copyArtifact(record.contextScreenshot),
    copyArtifact(record.snapshot),
  ])
  return { ...record, screenshot, contextScreenshot, snapshot }
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

async function manualReviewFingerprint(
  id: string,
  manifest: Readonly<{
    sourceDirectoryHash: string
    implementationHash?: string
    records: readonly CaptureRecord[]
  }>,
  interactions: readonly InteractionReportRow[],
  visualPairs: readonly unknown[],
): Promise<string> {
  const staticPairs = await Promise.all(
    manifest.records
      .filter((record) => record.kind === 'source' && record.id === id)
      .sort((left, right) => `${left.theme}/${left.viewport}`.localeCompare(`${right.theme}/${right.viewport}`))
      .map(async (source) => {
        const local = manifest.records.find(
          (record) =>
            record.kind === 'local' &&
            record.id === id &&
            record.theme === source.theme &&
            record.viewport === source.viewport,
        )
        if (!local)
          throw new Error(`Missing local screenshot for manual review: ${id}/${source.theme}/${source.viewport}`)
        const screenshotHash = async (path: string) =>
          createHash('sha256')
            .update(new Uint8Array(await Bun.file(path).arrayBuffer()))
            .digest('hex')
        return {
          theme: source.theme,
          viewport: source.viewport,
          source: await screenshotHash(source.screenshot),
          local: await screenshotHash(local.screenshot),
        }
      }),
  )
  return stableHash({
    id,
    sourceDirectoryHash: manifest.sourceDirectoryHash,
    implementationHash: manifest.implementationHash,
    staticPairs,
    interactions: interactions.filter((row) => row.variantId === id),
    visualPairs: visualPairs.filter(
      (pair) => typeof pair === 'object' && pair !== null && 'id' in pair && pair.id === id,
    ),
  })
}

async function localImplementationHash(variantIds: readonly string[], outputRoot?: string): Promise<string> {
  const hash = createHash('sha256')
  const plans = variantIds.map(auditSamplingPlan)
  const dependencies = plans.every((plan) => plan !== undefined)
    ? await lumenDependencyFiles(plans.flatMap((plan) => plan?.lumenEntries ?? []))
    : undefined
  const coveredFiles: string[] = []
  for (const root of [
    'hbar-ui/packages/lumen-app-ui/src',
    'packages/hbar-app-ui/src',
    'apps/hbar-app-ui-preview/src',
    'tests/fixtures',
  ]) {
    const files = (await readdir(resolve(root), { recursive: true }))
      .filter((file) => /\.(css|json|ts|tsx)$/.test(file))
      .sort()
    for (const file of files) {
      if (root === 'hbar-ui/packages/lumen-app-ui/src' && !includesLumenAuditFile(file, dependencies)) continue
      const path = join(root, file)
      coveredFiles.push(path)
      hash.update(path)
      hash.update(new Uint8Array(await Bun.file(path).arrayBuffer()))
    }
  }
  if (outputRoot)
    await writeJson(join(outputRoot, 'implementation-scope.json'), {
      variants: variantIds,
      policy: dependencies ? 'rendered-family-dependencies-plus-global-styles-and-host-inputs' : 'full-source-tree',
      files: coveredFiles,
    })
  return hash.digest('hex')
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

export function cachedInventorySourcePath(
  options: Pick<AuditOptions, 'sourceInventoryPath' | 'sourceCaptureRoot' | 'localOnly'>,
): string | undefined {
  return options.sourceInventoryPath ??
    (options.localOnly && options.sourceCaptureRoot
      ? join(resolve(options.sourceCaptureRoot), 'source-inventory.json')
      : undefined)
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
    await assertReferenceAccess(page, REACTBITS_PRO_APPLICATION_UI_URL, rootStatus)
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
      await assertReferenceAccess(page, categoryUrl, categoryStatus)
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
  const sourceInventory = cachedInventorySourcePath(options)
  if (sourceInventory && !options.offline) {
    const sourcePath = resolve(sourceInventory)
    const inventory = await readJson<ReactBitsProInventory>(sourcePath)
    const localCounts = await localCategoryCounts()
    const localIds = new Set(HBAR_APP_UI_VARIANT_SPECS.map((spec) => spec.id))
    if (
      inventory.variants.length !== 300 ||
      inventory.categories.length !== 38 ||
      inventory.variants.some((variant) => !localIds.has(variant.id)) ||
      Object.entries(localCounts).some(([category, count]) => inventory.categoryCounts[category] !== count)
    )
      throw new Error(`Cached React Bits inventory does not match the local 38/300 catalog: ${sourcePath}`)
    if (sourcePath !== cachedPath) await writeJson(cachedPath, inventory)
    return inventory
  }
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

async function assertReferenceFrameTheme(frame: Frame, theme: AuditTheme): Promise<void> {
  await frame.waitForFunction(
    (dark) => document.documentElement.classList.contains('dark') === dark,
    theme === 'dark',
    { timeout: 5_000 },
  )
}

async function synchroniseReferenceFrameTheme(page: Page, frame: Frame, theme: AuditTheme): Promise<Frame> {
  let current = frame
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const matches = await current
      .evaluate((dark) => document.documentElement.classList.contains('dark') === dark, theme === 'dark')
      .catch(() => false)
    if (matches) return current
    if (attempt === 2) break
    const toggle = page.getByRole('button', { name: 'Toggle theme' })
    await toggle.click()
    await toggle.click()
    const handle = await page.locator('iframe[title="Preview"]').elementHandle()
    const replacement = await handle?.contentFrame()
    if (!replacement) throw new Error('React Bits preview iframe was lost during theme synchronisation')
    current = replacement
    await assertReferenceFrameTheme(current, theme).catch(() => undefined)
  }
  throw new Error(`React Bits preview iframe did not synchronise to ${theme}`)
}

async function previewFrame(page: Page): Promise<Frame> {
  const iframe = page.locator('iframe[title="Preview"]')
  await iframe.waitFor({ state: 'visible', timeout: 30_000 })
  const handle = await iframe.elementHandle()
  if (!handle) throw new Error('Preview iframe element handle is unavailable')
  const frame = await handle.contentFrame()
  if (!frame) throw new Error('Preview iframe content frame is unavailable')
  await frame.locator('#preview-root').waitFor({ state: 'attached', timeout: 30_000 })
  await frame.waitForFunction(
    () => {
      const root = document.querySelector('#preview-root')
      return Boolean(
        root &&
        ((root.textContent ?? '').trim().length > 0 ||
          root.querySelector('button,a,input,select,textarea,[role]') ||
          root.querySelectorAll('*').length > 3),
      )
    },
    undefined,
    { timeout: 8_000 },
  )
  await frame.waitForFunction(
    () => document.readyState === 'complete' && document.fonts.status === 'loaded',
    undefined,
    { timeout: 15_000 },
  )
  // Do not freeze the documentation's initial 600px placeholder before the
  // mounted preview reports its natural canvas (e.g. a 720px app shell).
  // Observe the real iframe size; never derive or force it from child content.
  await iframe.evaluate(async (element) => {
    let last = '',
      stableSince = performance.now()
    const deadline = performance.now() + 8000
    while (performance.now() < deadline) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const rect = element.getBoundingClientRect(),
        size = `${rect.width}/${rect.height}`
      if (size !== last) {
        last = size
        stableSince = performance.now()
      }
      if (rect.width > 0 && rect.height > 0 && performance.now() - stableSince >= 500) return
    }
    throw new Error('Reference iframe canvas did not settle before isolation')
  })
  // Keep the live iframe's content size, but place it above the documentation
  // site's sticky header and floating controls while capturing its component.
  await iframe.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    let branch: Element = element
    while (branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch) (sibling as HTMLElement).style.visibility = 'hidden'
      }
      branch = branch.parentElement
    }
    Object.assign((element as HTMLElement).style, {
      position: 'fixed',
      top: '0px',
      left: '0px',
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      zIndex: '2147483647',
      margin: '0px',
    })
  })
  return frame
}

async function readReferenceCanvas(frame: Frame): Promise<ReferenceCanvas> {
  return frame.locator('#preview-root').evaluate((root) => {
    let stage = root.firstElementChild
    let padding = { top: 0, right: 0, bottom: 0, left: 0 }
    for (let depth = 0; stage && depth < 4; depth += 1) {
      const style = getComputedStyle(stage)
      const candidate = {
        top: Number.parseFloat(style.paddingTop) || 0,
        right: Number.parseFloat(style.paddingRight) || 0,
        bottom: Number.parseFloat(style.paddingBottom) || 0,
        left: Number.parseFloat(style.paddingLeft) || 0,
      }
      if (Object.values(candidate).some((value) => value > 0)) {
        padding = candidate
        break
      }
      stage = stage.children.length === 1 ? stage.firstElementChild : null
    }
    return { width: innerWidth, height: innerHeight, padding }
  })
}

async function alignReferenceInteractionCanvas(page: Page, frame: Frame, expected: ReferenceCanvas): Promise<void> {
  const actual = await readReferenceCanvas(frame)
  if (actual.width !== expected.width || actual.height !== expected.height) {
    await page.locator('iframe[title="Preview"]').evaluate((element, canvas) => {
      const iframe = element as HTMLElement
      iframe.style.width = `${canvas.width}px`
      iframe.style.height = `${canvas.height}px`
    }, expected)
    await frame.waitForFunction(({ width, height }) => innerWidth === width && innerHeight === height, expected, {
      timeout: 5000,
    })
  }
}

async function applyLocalCanvas(
  page: Page,
  canvas: ReferenceCanvas,
  selector: string,
  componentSelector: string,
): Promise<void> {
  const inset = await page
    .locator(selector)
    .first()
    .evaluate((element, boundarySelector) => {
      const value = { top: 0, right: 0, bottom: 0, left: 0 }
      // Some full-canvas components own the same stage padding inside their
      // material wrapper. Explicit ownership avoids guessing from card padding.
      const owner = element.querySelector('.hbar-app-ui-stage-padding-owner')
      if (owner) {
        const style = getComputedStyle(owner)
        value.top += Number.parseFloat(style.paddingTop) || 0
        value.right += Number.parseFloat(style.paddingRight) || 0
        value.bottom += Number.parseFloat(style.paddingBottom) || 0
        value.left += Number.parseFloat(style.paddingLeft) || 0
      }
      let ancestor = element.parentElement
      while (ancestor && !ancestor.matches(boundarySelector)) {
        const style = getComputedStyle(ancestor)
        value.top += Number.parseFloat(style.paddingTop) || 0
        value.right += Number.parseFloat(style.paddingRight) || 0
        value.bottom += Number.parseFloat(style.paddingBottom) || 0
        value.left += Number.parseFloat(style.paddingLeft) || 0
        ancestor = ancestor.parentElement
      }
      return { padding: value, fullCanvas: Boolean(element.querySelector('.hbar-app-ui-full-canvas-owner')) }
    }, componentSelector)
  // A full-canvas owner already lays itself out against the iframe viewport.
  // Injecting the reference's padding here would alter (and conceal) its layout.
  const padding = alignedCanvasPadding(canvas.padding, inset.padding, inset.fullCanvas)
  // The source preview is an iframe viewport. A taller child is clipped by
  // that viewport; the isolated local stage must not scroll its own root.
  const clipLogViewport = selector.includes('hbar-app-ui-agent-activity-5')
  await page.addStyleTag({
    content: `.hbar-app-ui-isolated-canvas { padding: ${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px !important; ${clipLogViewport ? 'overflow: hidden !important;' : ''} }`,
  })
}

async function loadReferencePreview(page: Page, url: string, theme: AuditTheme): Promise<Frame> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const status = await gotoStable(page, url)
      await assertReferenceAccess(page, url, status)
      await enforceReferenceTheme(page, theme)
      const handle = await page.locator('iframe[title="Preview"]').elementHandle()
      const frame = await handle?.contentFrame()
      if (!frame) throw new Error('React Bits preview iframe is unavailable')
      await synchroniseReferenceFrameTheme(page, frame, theme)
      const isolated = await previewFrame(page)
      await assertReferenceFrameTheme(isolated, theme)
      return isolated
    } catch (error) {
      if (error instanceof ReferenceAccessBlockedError) throw error
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`React Bits preview did not mount: ${url}`)
}

async function loadRunningLogPreview(page: Page, url: string, theme: AuditTheme, targetRows = 24): Promise<Frame> {
  await page.addInitScript(
    ({ targetRows: checkpoint }) => {
      const pendingTimeouts = new Set<number>()
      const pendingIntervals = new Set<number>()
      const pendingFrames = new Set<number>()
      const scheduleTimeout = window.setTimeout.bind(window)
      const scheduleInterval = window.setInterval.bind(window)
      const scheduleFrame = window.requestAnimationFrame.bind(window)
      const cancelTimeout = window.clearTimeout.bind(window)
      const cancelInterval = window.clearInterval.bind(window)
      const cancelFrame = window.cancelAnimationFrame.bind(window)
      let frozen = false
      window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
        if (frozen) return 0
        const id = scheduleTimeout(() => {
          pendingTimeouts.delete(id)
          if (!frozen && typeof handler === 'function') (handler as (...values: unknown[]) => void)(...args)
        }, delay)
        pendingTimeouts.add(id)
        return id
      }) as typeof window.setTimeout
      window.setInterval = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
        if (frozen) return 0
        const id = scheduleInterval(() => {
          if (!frozen && typeof handler === 'function') (handler as (...values: unknown[]) => void)(...args)
        }, delay)
        pendingIntervals.add(id)
        return id
      }) as typeof window.setInterval
      window.requestAnimationFrame = ((handler: FrameRequestCallback) => {
        if (frozen) return 0
        const id = scheduleFrame((timestamp) => {
          pendingFrames.delete(id)
          if (!frozen) handler(timestamp)
        })
        pendingFrames.add(id)
        return id
      }) as typeof window.requestAnimationFrame
      const freezeTimers = () => {
        frozen = true
        pendingTimeouts.forEach(cancelTimeout)
        pendingIntervals.forEach(cancelInterval)
        pendingFrames.forEach(cancelFrame)
      }
      ;(window as Window & { __reactBitsAuditFreezeTimers?: () => void }).__reactBitsAuditFreezeTimers = freezeTimers
      ;(window as Window & { __reactBitsAuditTimerState?: () => unknown }).__reactBitsAuditTimerState = () => ({
        frozen,
        timeouts: pendingTimeouts.size,
        intervals: pendingIntervals.size,
        frames: pendingFrames.size,
        rows: document.querySelectorAll('#preview-root ol li').length,
      })
      const freezeAtCheckpoint = () => {
        if (frozen) return
        const root = document.querySelector('#preview-root')
        if (
          root?.querySelectorAll('ol li').length === checkpoint &&
          Array.from(root.querySelectorAll('button')).some((button) => button.textContent?.includes('Stop'))
        )
          freezeTimers()
      }
      const observer = new MutationObserver(freezeAtCheckpoint)
      observer.observe(document, { childList: true, subtree: true })
      document.addEventListener('DOMContentLoaded', freezeAtCheckpoint, { once: true })
    },
    { targetRows },
  )
  await page.clock.install()
  const status = await gotoStable(page, url)
  await assertReferenceAccess(page, url, status)
  await enforceReferenceTheme(page, theme)
  const iframe = page.locator('iframe[title="Preview"]')
  await iframe.waitFor({ state: 'visible', timeout: 30_000 })
  const handle = await iframe.elementHandle()
  const initialFrame = await handle?.contentFrame()
  if (!initialFrame) throw new Error('Running log preview iframe is unavailable')
  const frame = await synchroniseReferenceFrameTheme(page, initialFrame, theme)
  const root = frame.locator(sourceCanvasSelector).first()
  await root.locator('button').filter({ hasText: 'Stop' }).waitFor({ state: 'visible', timeout: 3_000 })
  const rows = root.locator('ol li')
  if ((await rows.count()) > targetRows + 1) throw new Error(`Running log passed the ${targetRows}-line checkpoint`)
  await rows.nth(targetRows - 1).waitFor({ state: 'attached', timeout: 3_000 })
  await page.clock.pauseAt((await root.evaluate(() => Date.now())) + 1)
  const frozen = await frame.evaluate(() => {
    const freeze = (window as Window & { __reactBitsAuditFreezeTimers?: () => void }).__reactBitsAuditFreezeTimers
    if (!freeze) return false
    freeze()
    return true
  })
  if (!frozen) throw new Error('Running log timer instrumentation was not installed in the iframe')
  await page.waitForTimeout(100)
  const settledRows = await rows.count()
  if (
    (settledRows !== targetRows && settledRows !== targetRows + 1) ||
    !(await root.locator('button').filter({ hasText: 'Stop' }).isVisible())
  ) {
    const state = await frame.evaluate(() =>
      (window as Window & { __reactBitsAuditTimerState?: () => unknown }).__reactBitsAuditTimerState?.(),
    )
    throw new Error(`Running log changed during the ${targetRows}-line checkpoint: ${JSON.stringify(state)}`)
  }
  await iframe.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    let branch: Element = element
    while (branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch) (sibling as HTMLElement).style.visibility = 'hidden'
      }
      branch = branch.parentElement
    }
    Object.assign((element as HTMLElement).style, {
      position: 'fixed',
      top: '0px',
      left: '0px',
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      zIndex: '2147483647',
      margin: '0px',
    })
  })
  return frame
}

async function assertReferenceAccess(page: Page, url: string, status: number): Promise<void> {
  const title = await page.title()
  const reason = referenceAccessBlockReason(status, title)
  if (reason) throw new ReferenceAccessBlockedError(url, status, title, reason)
}

async function gotoStable(page: Page, url: string): Promise<number> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await page.goto(url, { waitUntil: 'commit', timeout: 30_000 })
      await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => undefined)
      return response?.status() ?? 0
    } catch (error) {
      lastError = error
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250 * (attempt + 1)))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Could not navigate to ${url}`)
}

export async function waitForLocalStyles(page: Page, timeout = 15_000): Promise<void> {
  await page.waitForLoadState('load', { timeout })
  await page.waitForFunction(
    () => {
      const stylesheets = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
      return (
        document.styleSheets.length > 0 &&
        stylesheets.every((link) => {
          if (link.disabled) return true
          try {
            return link.sheet !== null && link.sheet.cssRules.length > 0
          } catch {
            return false
          }
        }) &&
        document.fonts.status === 'loaded'
      )
    },
    undefined,
    { timeout },
  )
}

type SnapshotWithoutAx = Omit<SemanticSnapshot, 'axSnapshot'>

async function snapshotLocator(locator: Locator, bodyOverflow: boolean): Promise<SnapshotWithoutAx> {
  return locator.evaluate(
    (element, { shouldCheckBody, controlSelector }) => {
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
        if (value.matches(controlSelector)) return 'control'
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
        if (
          tag === 'button' ||
          tag === 'a' ||
          ['button', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'treeitem', 'option'].includes(
            role ?? '',
          )
        )
          capabilities.push('click', 'press')
        if (
          tag === 'textarea' ||
          (tag === 'input' &&
            !['checkbox', 'radio', 'file', 'button', 'submit', 'reset', 'hidden'].includes(type ?? ''))
        )
          capabilities.push('fill')
        if (tag === 'select' || role === 'combobox' || role === 'listbox') capabilities.push('select')
        if (type === 'checkbox' || type === 'radio' || ['checkbox', 'radio', 'switch'].includes(role ?? ''))
          capabilities.push('toggle')
        if (tag === 'input' && type === 'file') capabilities.push('upload')
        if (role === 'tab') capabilities.push('tab')
        if (role === 'menu' || role === 'menuitem') capabilities.push('menu')
        if (control.hasAttribute('aria-expanded')) capabilities.push('expand')
        if (control.hasAttribute('download') || /download/i.test(control.textContent ?? ''))
          capabilities.push('download')
        if (control.hasAttribute('draggable') || control.getAttribute('data-draggable') === 'true')
          capabilities.push('drag')
        if (capabilities.length === 2) capabilities.push('no-op')
        return [...new Set(capabilities)]
      }
      const controls = [...element.querySelectorAll(controlSelector)].map((control, index) => ({
        index,
        rect: rectOf(control),
        tag: control.tagName.toLowerCase(),
        role: control.getAttribute('role'),
        type: control.getAttribute('type'),
        name:
          control.getAttribute('aria-label') ??
          (control.textContent ?? '').trim().replaceAll(/\s+/g, ' ').slice(0, 160),
        disabled: control.matches(':disabled') || control.getAttribute('aria-disabled') === 'true',
        visible: (() => {
          const rect = control.getBoundingClientRect()
          const style = getComputedStyle(control)
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
        })(),
        expanded: control.getAttribute('aria-expanded'),
        pressed: control.getAttribute('aria-pressed'),
        selected: control.getAttribute('aria-selected'),
        state: control.getAttribute('data-state'),
        value: (() => {
          if (!('value' in control) || typeof control.value !== 'string') return null
          if (control.getAttribute('type') === 'password') return control.value ? '<redacted-nonempty>' : ''
          if (control.getAttribute('type') === 'file') return control.value ? '<selected-file>' : ''
          return control.value
        })(),
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
      // A narrow viewport may intentionally clip a wider layout (for example a
      // dual sidebar). Only count overflow on text-bearing elements here; the
      // separate horizontalOverflow metric records structural clipping.
      const truncatedTextCount = [...element.querySelectorAll('*')].filter((value) => {
        const textBearing = value.matches('h1,h2,h3,h4,h5,h6,p,span,button,a,label,dt,dd,input,textarea')
          || [...value.childNodes].some(
            (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
          )
        return textBearing && value.scrollWidth > value.clientWidth + 1
      }).length
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
    },
    { shouldCheckBody: bodyOverflow, controlSelector: interactiveControlSelector },
  )
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
  const frame = await loadReferencePreview(page, referenceUrl, theme)
  const selector = sourceCanvasSelector
  const root = frame.locator(selector).first()
  await root.waitFor({ state: 'visible', timeout: 30_000 })
  if (reference.id === 'hbar-app-ui-agent-activity-5') {
    await root.locator('ol li').nth(25).waitFor({ state: 'attached', timeout: 15_000 })
    await root.locator('button').filter({ hasText: 'Stop' }).waitFor({ state: 'hidden', timeout: 15_000 })
    await root
      .locator('ol')
      .locator('..')
      .evaluate((pane) => {
        pane.scrollTop = pane.scrollHeight
      })
    await page.waitForTimeout(150)
  }
  const referenceCanvas = await readReferenceCanvas(frame)
  if (reference.id === 'hbar-app-ui-authentication-3') await prepareQuoteInitial(root)
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
    referenceCanvas,
    errors: pageErrors.slice(errorStart),
  }
}

async function captureLocal(
  page: Page,
  spec: HbarAppUiVariantSpec,
  viewport: AuditViewport,
  theme: AuditTheme,
  outputRoot: string,
  referenceCanvas: ReferenceCanvas,
  pageErrors: string[] = [],
  sourceQuoteIndex?: number,
): Promise<CaptureRecord> {
  const errorStart = pageErrors.length
  await page.setViewportSize({ width: referenceCanvas.width, height: referenceCanvas.height })
  const target = `${localPreviewUrl}/?mode=isolated&theme=${theme}&variant=${encodeURIComponent(spec.id)}`
  await gotoStable(page, target)
  const rootSelector = `[data-hbar-app-ui-component="${spec.id}"]`
  await page.locator(rootSelector).first().waitFor({ state: 'visible', timeout: 30_000 })
  await waitForLocalStyles(page)
  await applyLocalCanvas(page, referenceCanvas, rootSelector, localCanvasSelector)
  const selector = localCanvasSelector
  const root = page.locator(selector).first()
  await root.waitFor({ state: 'visible', timeout: 30_000 })
  if (spec.id === 'hbar-app-ui-authentication-3' && sourceQuoteIndex !== undefined)
    await root.locator('.hbar-app-ui-auth-quote-dots > button').nth(sourceQuoteIndex).click()
  if (spec.id === 'hbar-app-ui-agent-activity-5') {
    await root.locator('[data-hbar-app-ui-log-phase="complete"]').waitFor({ state: 'visible', timeout: 15_000 })
    await root.locator('.hbar-app-ui-agent-activity-log-scroll').evaluate((pane) => {
      pane.scrollTop = pane.scrollHeight
    })
    await page.waitForTimeout(150)
  }
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
    referenceCanvas,
    errors: pageErrors.slice(errorStart),
  }
}

async function capturedQuoteIndex(snapshotPath: string): Promise<number | undefined> {
  const snapshot = await readJson<SemanticSnapshot>(snapshotPath)
  const dots = snapshot.controls.filter((control) => control.name.startsWith('Show quote from '))
  const active = dots.findIndex((control) => control.rect.width > 10)
  return active >= 0 ? active : undefined
}

export function visibleControls(snapshot: SemanticSnapshot): readonly ControlSnapshot[] {
  return snapshot.controls.filter((control) => control.visible)
}

export function semanticRoleTree(axSnapshot: string): readonly string[] {
  return axSnapshot.split('\n').flatMap((line) => {
    const match = /^(\s*)-\s+([a-z][a-z0-9-]*)\b/.exec(line)
    return match ? [`${Math.floor((match[1]?.length ?? 0) / 2)}:${match[2]}`] : []
  })
}

export function semanticRoleTreeMatches(source: string, local: string): boolean {
  const sourceRoles = semanticRoleTree(source)
  const localRoles = semanticRoleTree(local)
  return sourceRoles.length > 0 && JSON.stringify(sourceRoles) === JSON.stringify(localRoles)
}

export function interactionCases(
  snapshot: SemanticSnapshot,
  variantId: string,
  scenario?: InteractionCase['scenario'],
): readonly InteractionCase[] {
  const cases: InteractionCase[] = []
  for (const control of visibleControls(snapshot)) {
    const prefix = `${variantId}:${scenario ? `${scenario}:` : ''}${control.index}`
    for (const capability of control.capabilities) {
      if (capability === 'press') {
        for (const key of ['Enter', 'Space'] as const)
          cases.push({ id: `${prefix}:press-${key.toLowerCase()}`, action: 'press', key, control, scenario })
        continue
      }
      if (capability === 'tab') {
        for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End'] as const)
          cases.push({ id: `${prefix}:tab-${key.toLowerCase()}`, action: 'press', key, control, scenario })
        continue
      }
      cases.push({ id: `${prefix}:${capability}`, action: capability, control, scenario })
      if (capability === 'expand' || capability === 'menu')
        cases.push({ id: `${prefix}:${capability}-escape`, action: 'press', key: 'Escape', control, scenario })
    }
  }
  return cases
}

const shellSidebarScenarios = ['shell-account', 'shell-navigation-closed'] as const
const inboxScenarios = ['inbox-empty', 'inbox-unread', 'inbox-menu', 'inbox-reading', 'inbox-mailboxes'] as const
const documentsScenarios = ['documents-closed', 'documents-menu', 'documents-format-menu'] as const
const scopeScenarios = [
  'scope-closed',
  'scope-organisation',
  'scope-project',
  'scope-environment',
  'scope-combined',
  'scope-account',
] as const
const chatScenarios = ['chat-thread-open', 'chat-suggestion'] as const
const sidebarPrimaryScenarios = ['sidebar-account-open'] as const
const sidebarRailScenarios = ['sidebar-rail-flyout-open', 'sidebar-rail-account-open'] as const
const sidebarWorkspaceScenarios = ['sidebar-workspace-open'] as const
const sidebarTreeScenarios = ['sidebar-tree-menu-open'] as const
const sidebarDrawerScenarios = ['sidebar-drawer-closed'] as const
const sidebarFullScenarios = ['sidebar-full-closed'] as const
const dialogPlanScenarios = ['dialog-plan-closed'] as const
const dialogDeleteScenarios = ['dialog-delete-valid', 'dialog-delete-closed'] as const
const dialogInviteScenarios = ['dialog-invite-empty', 'dialog-invite-invalid', 'dialog-invite-valid', 'dialog-invite-closed'] as const
const dialogWizardScenarios = [
  'dialog-wizard-region', 'dialog-wizard-region-selected', 'dialog-wizard-team',
  'dialog-wizard-team-custom', 'dialog-wizard-closed',
] as const
const dialogAlertScenarios = ['dialog-alert-dirty', 'dialog-alert-guard', 'dialog-alert-closed'] as const
const notificationToastScenarios = ['toast-success', 'toast-stack'] as const
const notificationActivityScenarios = ['activity-snooze-menu', 'activity-snoozed', 'activity-archived', 'activity-back'] as const
const notificationSystemScenarios = ['system-expanded', 'system-dismissed', 'system-empty'] as const
const notificationBellScenarios = ['bell-open', 'bell-unread', 'bell-unread-empty'] as const
const authenticationSignInScenarios = ['auth-email-only', 'auth-valid'] as const
async function prepareAuthenticationSignInScenario(root: Locator, scenario: (typeof authenticationSignInScenarios)[number]): Promise<void> {
  await root.getByRole('textbox', { name: 'Email or username' }).fill('dana@example.com')
  if (scenario === 'auth-valid') await root.getByPlaceholder('Enter your password').fill('secret-password')
}
const authenticationProviderFirstScenarios = ['auth-provider-sso', 'auth-provider-sso-valid', 'auth-provider-email-valid'] as const
async function prepareAuthenticationProviderFirstScenario(root: Locator, scenario: (typeof authenticationProviderFirstScenarios)[number]): Promise<void> {
  if (scenario === 'auth-provider-email-valid') {
    if (await root.getByRole('button', { name: 'Use email instead' }).count())
      await root.getByRole('button', { name: 'Use email instead' }).click()
    await root.getByRole('textbox', { name: 'Work email' }).fill('dana@example.com')
    return
  }
  if (await root.getByRole('button', { name: 'Use single sign-on' }).count())
    await root.getByRole('button', { name: 'Use single sign-on' }).click()
  if (scenario === 'auth-provider-sso-valid') await root.getByRole('textbox', { name: 'Company domain' }).fill('northwind')
}
const authenticationTwoStepScenarios = ['auth-two-step-password', 'auth-two-step-invalid'] as const
async function prepareAuthenticationTwoStepScenario(root: Locator, scenario: (typeof authenticationTwoStepScenarios)[number]): Promise<void> {
  if (scenario === 'auth-two-step-invalid') {
    await root.getByRole('textbox', { name: 'Work email' }).fill('invalid')
    return
  }
  await root.getByRole('button', { name: 'Continue' }).click()
  await root.getByText('Step 2 of 2').waitFor({ state: 'visible', timeout: 5_000 })
}
const authenticationMagicLinkScenarios = ['auth-magic-form', 'auth-magic-form-invalid'] as const
async function prepareAuthenticationMagicLinkScenario(root: Locator, scenario: (typeof authenticationMagicLinkScenarios)[number]): Promise<void> {
  if (await root.getByRole('button', { name: 'Use a different email' }).count())
    await root.getByRole('button', { name: 'Use a different email' }).click()
  await root.getByRole('textbox', { name: 'Work email' }).waitFor({ state: 'visible' })
  if (scenario === 'auth-magic-form-invalid') await root.getByRole('textbox', { name: 'Work email' }).fill('invalid')
}
const authenticationCodeScenarios = ['auth-code-recovery', 'auth-code-recovery-valid', 'auth-code-five', 'auth-code-verified'] as const
async function prepareAuthenticationCodeScenario(root: Locator, scenario: (typeof authenticationCodeScenarios)[number]): Promise<void> {
  if (scenario === 'auth-code-recovery' || scenario === 'auth-code-recovery-valid') {
    if (await root.getByRole('button', { name: 'Use a recovery code' }).count())
      await root.getByRole('button', { name: 'Use a recovery code' }).click()
    await root.getByRole('textbox', { name: 'Recovery code' }).waitFor({ state: 'visible' })
    if (scenario === 'auth-code-recovery-valid') await root.getByRole('textbox', { name: 'Recovery code' }).fill('ABCDE-12345')
    return
  }
  if (await root.getByRole('button', { name: 'Verify another device' }).count())
    await root.getByRole('button', { name: 'Verify another device' }).click()
  if (await root.getByRole('button', { name: 'Use the texted code' }).count())
    await root.getByRole('button', { name: 'Use the texted code' }).click()
  const digits = root.getByRole('textbox', { name: /^Digit \d+$/ })
  for (let index = 0; index < (scenario === 'auth-code-five' ? 5 : 6); index += 1)
    await digits.nth(index).fill(String(index + 1))
  if (scenario === 'auth-code-verified') await root.getByRole('heading', { name: 'Device verified' }).waitFor({ state: 'visible', timeout: 5_000 })
}
const authenticationSignUpScenarios = ['auth-signup-password', 'auth-signup-complete', 'auth-signup-ready', 'auth-signup-invalid-email'] as const
async function prepareAuthenticationSignUpScenario(root: Locator, scenario: (typeof authenticationSignUpScenarios)[number]): Promise<void> {
  await root.getByRole('textbox', { name: 'Password' }).fill('StrongPassword1!')
  if (scenario === 'auth-signup-password') return
  await root.getByRole('textbox', { name: 'Full name' }).fill('Dana Whitfield')
  await root.getByRole('textbox', { name: 'Work email' }).fill(scenario === 'auth-signup-invalid-email' ? '' : 'dana@example.test')
  const agreement = root.getByRole('checkbox', { name: 'I agree to the terms of service and the privacy policy.' })
  if (scenario === 'auth-signup-ready' || scenario === 'auth-signup-invalid-email') await agreement.check()
  else await agreement.uncheck()
}
async function prepareAuthenticationEnterpriseMismatch(root: Locator): Promise<void> {
  await root.getByRole('textbox', { name: 'Work email' }).fill('dana@example.test')
}
const authenticationPasskeyScenarios = ['auth-passkey-selected', 'auth-passkey-request'] as const
async function prepareAuthenticationPasskeyScenario(root: Locator, scenario: (typeof authenticationPasskeyScenarios)[number]): Promise<void> {
  if (await root.getByRole('button', { name: /Dana's iPhone Face ID/ }).count())
    await root.getByRole('button', { name: /Dana's iPhone Face ID/ }).click()
  if (scenario === 'auth-passkey-request') {
    if (await root.getByRole('button', { name: "Continue with Dana's iPhone" }).count())
      await root.getByRole('button', { name: "Continue with Dana's iPhone" }).click()
    await root.getByRole('button', { name: 'Cancel request' }).waitFor({ state: 'visible' })
  }
}
async function prepareAuthenticationAccountContractor(root: Locator): Promise<void> {
  await root.getByRole('button', { name: /D\. Whitfield \(contractor\)/ }).click()
}
const authenticationInvitationScenarios = ['auth-invite-named', 'auth-invite-ready', 'auth-invite-success'] as const
async function prepareAuthenticationInvitationScenario(root: Locator, scenario: (typeof authenticationInvitationScenarios)[number]): Promise<void> {
  await root.getByRole('textbox', { name: 'Full name' }).fill('Dana Whitfield')
  if (scenario !== 'auth-invite-named')
    await root.getByRole('textbox', { name: 'Password' }).fill('StrongPassword1!')
  if (scenario === 'auth-invite-success')
    await root.getByRole('button', { name: 'Accept invitation' }).click()
}
const authenticationResetScenarios = ['auth-reset-strong', 'auth-reset-ready', 'auth-reset-ready-no-signout', 'auth-reset-success'] as const
async function prepareAuthenticationResetScenario(root: Locator, scenario: (typeof authenticationResetScenarios)[number]): Promise<void> {
  await root.getByRole('textbox', { name: 'New password' }).fill('Abcdefghij1!')
  if (scenario !== 'auth-reset-strong')
    await root.getByRole('textbox', { name: 'Confirm password' }).fill('Abcdefghij1!')
  if (scenario === 'auth-reset-ready-no-signout')
    await root.getByRole('checkbox', { name: 'Sign out of my other devices' }).uncheck()
  if (scenario === 'auth-reset-success')
    await root.getByRole('button', { name: 'Update password' }).click()
}
const authenticationApprovalScenarios = ['auth-approval-approved', 'auth-approval-blocked'] as const
async function prepareAuthenticationApprovalScenario(root: Locator, scenario: (typeof authenticationApprovalScenarios)[number]): Promise<void> {
  await root.getByRole('button', { name: scenario === 'auth-approval-approved' ? 'Yes, that was me' : 'No, secure my account' }).click()
}
const kanbanBoardScenarios = ['kanban-composer-open', 'kanban-composer-ready', 'kanban-grabbed', 'kanban-grabbed-target'] as const
async function prepareKanbanBoardScenario(root: Locator, scenario: (typeof kanbanBoardScenarios)[number]): Promise<void> {
  if (scenario === 'kanban-grabbed' || scenario === 'kanban-grabbed-target') {
    const card = root.getByRole('button', { name: /^HAL-241:/ })
    await card.focus()
    await card.press('Space')
    if (scenario === 'kanban-grabbed-target') await card.press('ArrowRight')
    return
  }
  await root.getByRole('button', { name: 'Add a card to Backlog' }).click()
  if (scenario === 'kanban-composer-ready')
    await root.getByRole('textbox', { name: 'New card in Backlog' }).fill('Audit sample card')
}
async function prepareQuoteInitial(root: Locator): Promise<void> {
  const first = root.locator('aside button[aria-label^="Show quote from"]').first()
  if (await first.isVisible()) {
    await first.click()
    await first.page().mouse.move(0, 0)
  }
}
async function prepareNotificationBellScenario(root: Locator, scenario: (typeof notificationBellScenarios)[number]): Promise<void> {
  const dialog = root.getByRole('dialog', { name: 'Notifications' })
  if (!(await dialog.count())) await root.getByRole('button', { name: /^Notifications, \d+ unread$/ }).click()
  if (scenario === 'bell-open') return
  const unread = dialog.getByRole('tab', { name: 'Unread' })
  if ((await unread.getAttribute('aria-selected')) !== 'true') await unread.click()
  if (scenario === 'bell-unread-empty') await dialog.getByRole('button', { name: 'Mark all read' }).click()
}
async function prepareNotificationSystemScenario(root: Locator, scenario: (typeof notificationSystemScenarios)[number]): Promise<void> {
  if (scenario === 'system-expanded') {
    await root.getByRole('button', { name: 'Show details', exact: true }).click()
    return
  }
  const hide = root.getByRole('button', { name: 'Hide details', exact: true })
  if (await hide.count()) await hide.click()
  const titles = scenario === 'system-dismissed'
    ? ['Scheduled maintenance on Sunday']
    : ['Scheduled maintenance on Sunday', 'Your card expires in 6 days', '3 of 5 imports failed', 'meridian.example is verified', 'You have used 84% of your monthly events']
  for (const title of titles) {
    const dismiss = root.getByRole('button', { name: `Dismiss: ${title}` })
    if (await dismiss.count()) await dismiss.click()
  }
}
async function prepareNotificationActivityScenario(root: Locator, scenario: (typeof notificationActivityScenarios)[number]): Promise<void> {
  if (scenario === 'activity-snoozed' || scenario === 'activity-archived') {
    await root.getByRole('tab', { name: new RegExp(scenario === 'activity-snoozed' ? '^Snoozed' : '^Archived') }).click()
    return
  }
  await root.getByRole('tab', { name: /^Inbox/ }).click()
  if (scenario === 'activity-back') {
    const back = root.getByRole('button', { name: 'Back', exact: true })
    if (await back.isVisible()) await back.click()
    return
  }
  const snooze = root.getByRole('button', { name: 'Snooze', exact: true })
  if (!(await snooze.isVisible())) await root.getByRole('button', { name: /Priya Nandakumar/ }).click()
  await snooze.click()
}
async function prepareNotificationPreferencesDirty(root: Locator): Promise<void> {
  await root.getByRole('switch', { name: 'Assigned to you: Push' }).click()
  await root.getByRole('button', { name: 'Save preferences' }).waitFor({ state: 'visible' })
}
async function prepareNotificationToastScenario(root: Locator, scenario: (typeof notificationToastScenarios)[number]): Promise<void> {
  const clear = root.getByRole('button', { name: 'Clear all', exact: true })
  if (await clear.isEnabled()) await clear.click()
  await root.getByRole('button', { name: 'Success', exact: true }).click()
  await root.getByText('1 active', { exact: true }).waitFor()
  if (scenario === 'toast-stack') {
    await root.getByRole('button', { name: 'Error', exact: true }).click()
    await root.getByText('2 active', { exact: true }).waitFor()
  }
  await root.page().waitForTimeout(350)
}
async function prepareDialogEvidenceClosed(root: Locator): Promise<void> {
  await root.getByRole('button', { name: 'Close panel', exact: true }).click()
  await root.getByRole('dialog', { name: 'SOC 2 Type II report' }).waitFor({ state: 'hidden' })
}
async function prepareDialogMenuScenario(root: Locator, scenario: 'dialog-menu-export' | 'dialog-menu-closed' | 'dialog-menu-delete-keyboard'): Promise<void> {
  if (scenario === 'dialog-menu-export') {
    await root.getByRole('menuitem', { name: 'Export as' }).hover()
    await root.getByRole('menu', { name: 'Export as' }).waitFor()
  } else if (scenario === 'dialog-menu-closed') {
    await root.getByRole('menuitem', { name: /Rename report/ }).press('Escape')
    await root.getByRole('dialog', { name: 'Report actions' }).waitFor({ state: 'hidden' })
  } else {
    await root.getByRole('menuitem', { name: /Rename report/ }).press('End')
    await root.getByRole('menuitem', { name: 'Delete report' }).evaluate((element) => {
      if (document.activeElement !== element) throw new Error('Keyboard End did not focus the dangerous action')
    })
  }
}
async function settleDialogMenuFeedback(root: Locator, interaction: InteractionCase): Promise<void> {
  if (interaction.action === 'click' && interaction.control.name === 'Export as') return
  if (interaction.action === 'click' && interaction.control.role === 'menuitem' ||
      interaction.action === 'press' && interaction.key === 'Space' && interaction.control.role === 'menuitem' ||
      interaction.action === 'press' && interaction.key === 'Escape' && interaction.control.role === 'menuitem')
    await root.getByRole('dialog', { name: 'Report actions' }).waitFor({ state: 'hidden' })
}
async function settleDialogEvidenceFeedback(root: Locator, interaction: InteractionCase): Promise<void> {
  if (interaction.id === 'hbar-app-ui-app-dialog-6:1:click')
    await root.getByRole('dialog', { name: 'SOC 2 Type II report' }).waitFor({ state: 'hidden' })
}
async function dialogEvidenceScrollOwner(root: Locator): Promise<Locator> {
  const descendants = root.getByRole('dialog', { name: 'SOC 2 Type II report' }).locator('div')
  const index = await descendants.evaluateAll((elements) => elements.findIndex((element) => {
    const style = getComputedStyle(element)
    return ['auto', 'scroll'].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1
  }))
  if (index < 0) throw new Error('React Bits evidence body is not an observed scroll owner')
  return descendants.nth(index)
}
async function observeDialogEvidenceScroll(root: Locator, variantId: string): Promise<InteractionCase> {
  const pane = await dialogEvidenceScrollOwner(root)
  const observed = await pane.evaluate((element) => {
    const style = getComputedStyle(element), rect = element.getBoundingClientRect()
    return {
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute('role'),
      visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden',
      scrollable: ['auto', 'scroll'].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    }
  })
  if (observed.tag !== 'div' || !observed.visible || !observed.scrollable)
    throw new Error('React Bits evidence body is not an observed scroll owner')
  return {
    id: `${variantId}:evidence-body:scroll:end`, action: 'scroll', scenario: 'dialog-evidence-scroll',
    wheelDeltaY: 2000,
    control: {
      index: 0, tag: 'div', role: observed.role, type: null, name: '', disabled: false,
      visible: true, rect: observed.rect, expanded: null, pressed: null, selected: null,
      state: null, stablePath: 'dialog > div', labelFor: null, describedBy: null,
      capabilities: ['scroll'], options: [],
    },
  }
}
async function prepareDialogAlertScenario(root: Locator, scenario: (typeof dialogAlertScenarios)[number]): Promise<void> {
  if (scenario === 'dialog-alert-closed') {
    await root.getByRole('button', { name: 'Cancel', exact: true }).click()
    await root.getByRole('dialog', { name: 'Edit alert rule' }).waitFor({ state: 'hidden' })
    return
  }
  await root.getByRole('textbox', { name: 'Trigger threshold' }).fill('10% / 5 min')
  if (scenario === 'dialog-alert-guard') {
    await root.getByRole('button', { name: 'Close drawer', exact: true }).click()
    await root.getByRole('alertdialog', { name: 'Discard your changes?' }).waitFor()
    await root.evaluate(() => new Promise<void>((resolve) => window.setTimeout(resolve, 350)))
  }
}
async function settleDialogAlertFeedback(root: Locator, interaction: InteractionCase): Promise<void> {
  if (interaction.id.endsWith(':6:click') ||
      interaction.id.endsWith('dialog-alert-guard:9:click') ||
      interaction.id.endsWith('dialog-alert-dirty:7:click'))
    await root.getByRole('dialog', { name: 'Edit alert rule' }).waitFor({ state: 'hidden' })
  if (interaction.id.endsWith('dialog-alert-guard:8:click'))
    await root.getByRole('alertdialog', { name: 'Discard your changes?' }).waitFor({ state: 'hidden' })
  if (interaction.id.endsWith('dialog-alert-dirty:1:click')) {
    await root.getByRole('alertdialog', { name: 'Discard your changes?' }).waitFor()
    await root.evaluate(() => new Promise<void>((resolve) => window.setTimeout(resolve, 350)))
  }
}
async function prepareDialogWizardScenario(root: Locator, scenario: (typeof dialogWizardScenarios)[number]): Promise<void> {
  if (scenario === 'dialog-wizard-closed') {
    await root.getByRole('button', { name: 'Close dialog', exact: true }).click()
    await root.getByRole('dialog').waitFor({ state: 'hidden' })
    return
  }
  if (scenario === 'dialog-wizard-team-custom')
    await root.getByRole('textbox', { name: 'Workspace name' }).fill('Acme Ops')
  await root.getByRole('button', { name: 'Continue', exact: true }).click()
  if (scenario === 'dialog-wizard-region-selected' || scenario === 'dialog-wizard-team-custom')
    await root.getByRole('button', { name: 'Europe (fra1)', exact: true }).click()
  if (scenario === 'dialog-wizard-team' || scenario === 'dialog-wizard-team-custom')
    await root.getByRole('button', { name: 'Continue', exact: true }).click()
}
async function prepareDialogInviteScenario(root: Locator, scenario: (typeof dialogInviteScenarios)[number]): Promise<void> {
  if (scenario === 'dialog-invite-closed') {
    await root.getByRole('button', { name: 'Close dialog', exact: true }).click()
    await root.getByRole('dialog', { name: 'Invite a member', exact: true }).waitFor({ state: 'hidden' })
    return
  }
  const name = root.getByRole('textbox', { name: 'Full name' })
  const email = root.getByRole('textbox', { name: 'Work email' })
  if (scenario !== 'dialog-invite-empty') await name.fill('Jordan Ellis')
  if (scenario === 'dialog-invite-invalid') await email.fill('not-an-email')
  if (scenario === 'dialog-invite-valid') {
    await email.fill('jordan@example.com')
    return
  }
  await root.getByRole('button', { name: 'Send invite', exact: true }).click()
}
async function prepareDialogDeleteScenario(root: Locator, scenario: (typeof dialogDeleteScenarios)[number]): Promise<void> {
  if (scenario === 'dialog-delete-valid') {
    await root.getByRole('textbox', { name: 'Type atlas-production to confirm' }).fill('atlas-production')
    return
  }
  await root.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await root.getByRole('dialog', { name: 'Delete atlas-production?', exact: true }).waitFor({ state: 'hidden' })
}
async function prepareDialogPlanScenario(root: Locator): Promise<void> {
  await root.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await root.getByRole('dialog', { name: 'Apply plan change', exact: true }).waitFor({ state: 'hidden' })
}
async function prepareSidebarFullScenario(root: Locator): Promise<void> {
  await root.getByRole('button', { name: 'Close navigation', exact: true }).click()
}
async function prepareSidebarDrawerScenario(root: Locator): Promise<void> {
  await root.getByRole('button', { name: 'Close navigation', exact: true }).click()
}
async function prepareSidebarTreeScenario(root: Locator): Promise<void> {
  await root.getByRole('button', { name: 'Actions for Customer operations', exact: true }).click()
}
async function prepareSidebarWorkspaceScenario(root: Locator): Promise<void> {
  await root
    .getByRole('button', { name: /Northwind Logistics Enterprise/ })
    .first()
    .click()
}
async function prepareSidebarPrimaryScenario(root: Locator): Promise<void> {
  await root
    .getByRole('button', { name: /Iris Renner Operations lead/ })
    .first()
    .press('Space')
}
async function prepareSidebarRailScenario(
  root: Locator,
  scenario: (typeof sidebarRailScenarios)[number],
): Promise<void> {
  if (scenario === 'sidebar-rail-flyout-open') await root.getByRole('button', { name: 'Automation' }).first().hover()
  else await root.getByRole('button', { name: 'Your account' }).first().click()
}
async function prepareChatScenario(root: Locator, scenario: (typeof chatScenarios)[number]): Promise<void> {
  if (scenario === 'chat-thread-open')
    await root
      .getByRole('button', { name: /Refactor auth middleware/ })
      .first()
      .press('Space')
  else
    await root
      .getByRole('button', { name: /Draft an email/ })
      .first()
      .press('Space')
}
async function prepareScopeScenario(root: Locator, scenario: (typeof scopeScenarios)[number]): Promise<void> {
  const expanded = root.locator('button[aria-expanded="true"][aria-haspopup]')
  for (const button of await expanded.all()) if (await button.isVisible()) await button.press('Escape')
  const close = root.getByRole('button', { name: 'Close navigation', exact: true })
  if (await close.isVisible()) await close.press('Space')
  if (scenario === 'scope-closed') return
  const names = {
    'scope-organisation': 'Organisation: Northwind Labs',
    'scope-project': 'Project: Payments API',
    'scope-environment': 'Environment: Production',
    'scope-combined': 'Organisation and project',
    'scope-account': 'DW Dana Whitfield dana.whitfield@northwindlabs.com',
  }
  await root.getByRole('button', { name: names[scenario], exact: true }).press('Space')
}
async function prepareDocumentsScenario(root: Locator, scenario: (typeof documentsScenarios)[number]): Promise<void> {
  const menu = root.getByRole('menu')
  if (await menu.isVisible()) await menu.press('Escape')
  const close = root.getByRole('button', { name: 'Close documents', exact: true })
  if (await close.isVisible()) await close.press('Space')
  if (scenario !== 'documents-closed')
    await root
      .getByRole('button', {
        name: scenario === 'documents-menu' ? 'Document actions' : 'More formatting',
        exact: true,
      })
      .press('Space')
}
function documentsInteractionCases(
  snapshot: SemanticSnapshot,
  variantId: string,
  scenario?: InteractionCase['scenario'],
): readonly InteractionCase[] {
  const cases = interactionCases(snapshot, variantId, scenario).map((item) =>
    item.action === 'fill' ? { ...item, fillValue: 'Reviewed document title' } : item,
  )
  const selected = visibleControls(snapshot).find(
    (control) => control.role === 'treeitem' && control.name === 'Webhook retry schedule',
  )
  if (selected)
    cases.push({
      id: `${variantId}:${scenario ? `${scenario}:` : ''}${selected.index}:tree-arrowdown`,
      action: 'press',
      key: 'ArrowDown',
      control: selected,
      scenario,
    })
  return cases
}
async function prepareInboxScenario(root: Locator, scenario: (typeof inboxScenarios)[number]): Promise<void> {
  if (scenario === 'inbox-empty' || scenario === 'inbox-unread') {
    await root.getByRole('radio', { name: scenario === 'inbox-empty' ? 'Escalated' : 'Unread', exact: true }).click()
  } else if (scenario === 'inbox-menu') {
    await root.getByRole('radio', { name: 'All', exact: true }).press('Space')
    await root.getByRole('option').filter({ hasText: 'Priya Raghunathan' }).press('Space')
    const more = root.getByRole('button', { name: 'More actions', exact: true })
    if ((await more.getAttribute('aria-expanded')) !== 'true') await more.press('Space')
  } else if (scenario === 'inbox-reading') {
    await root.getByRole('option').filter({ hasText: 'Priya Raghunathan' }).click()
  } else {
    const back = root.getByRole('button', { name: 'Back to conversations', exact: true })
    if (await back.isVisible()) await back.click()
    const open = root.getByRole('button', { name: 'Open mailboxes', exact: true })
    // Real keyboard preparation avoids Chromium's nested-frame pointer auto-scroll
    // moving the source shell by 12px after the documentation preview was scrolled.
    // The sampled mailbox choice still uses its own real pointer action.
    if ((await open.getAttribute('aria-expanded')) !== 'true') await open.press('Space')
  }
}
function inboxInteractionCases(
  snapshot: SemanticSnapshot,
  variantId: string,
  scenario?: InteractionCase['scenario'],
): readonly InteractionCase[] {
  return interactionCases(snapshot, variantId, scenario).map((item) =>
    item.action === 'fill' ? { ...item, fillValue: 'Rotterdam' } : item,
  )
}
const editorialScenarios = ['editorial-empty', 'editorial-navigation-closed', 'editorial-schedule'] as const
async function prepareEditorialScenario(root: Locator, scenario: (typeof editorialScenarios)[number]): Promise<void> {
  if (scenario === 'editorial-empty') {
    await root.getByRole('button', { name: 'Tuesday, September 1, 2026', exact: true }).click()
    await root.getByRole('button', { name: 'Show today', exact: true }).waitFor({ state: 'visible' })
  } else {
    const close = root.getByRole('button', { name: 'Close navigation', exact: true })
    if (await close.isVisible()) await close.click()
    if (scenario === 'editorial-schedule') {
      const toggle = root.getByRole('button', { name: 'Schedule panel', exact: true })
      if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click()
    }
  }
}
const shellRailScenarios = ['rail-workspace', 'rail-navigation-closed'] as const
const contractsScenarios = [
  'contracts-account',
  'contracts-attention',
  'contracts-empty',
  'contracts-navigation-closed',
  'contracts-search',
  'contracts-search-query',
] as const
async function prepareContractsScenario(root: Locator, scenario: (typeof contractsScenarios)[number]): Promise<void> {
  if (scenario === 'contracts-account') {
    await root.getByRole('button', { name: 'Amara Okafor, account menu', exact: true }).click()
    await root.getByRole('menu', { name: 'Account', exact: true }).waitFor({ state: 'visible' })
  } else if (scenario === 'contracts-attention' || scenario === 'contracts-empty') {
    await root.getByRole('radio', { name: 'Needs attention', exact: true }).click()
    if (scenario === 'contracts-empty')
      await root
        .getByRole('searchbox', { name: 'Search contracts and counterparties', exact: true })
        .fill('no-match-test')
  } else {
    const closeNavigation = root.getByRole('button', { name: 'Close navigation', exact: true })
    if (await closeNavigation.isVisible()) await closeNavigation.click()
    if (scenario !== 'contracts-navigation-closed') {
      const searchTrigger = root.getByRole('button', { name: 'Search contracts', exact: true })
      if ((await searchTrigger.getAttribute('aria-expanded')) !== 'true') await searchTrigger.click()
      if (scenario === 'contracts-search-query')
        await root.getByRole('searchbox', { name: 'Search contracts and counterparties', exact: true }).fill('Kestrel')
    }
  }
}
function contractsInteractionCases(
  snapshot: SemanticSnapshot,
  variantId: string,
  scenario?: (typeof contractsScenarios)[number],
): readonly InteractionCase[] {
  return interactionCases(snapshot, variantId, scenario).map((item) =>
    item.action === 'fill'
      ? { ...item, fillValue: scenario === 'contracts-attention' ? 'no-match-test' : 'Kestrel' }
      : item,
  )
}
async function prepareShellRailScenario(root: Locator, scenario: (typeof shellRailScenarios)[number]): Promise<void> {
  if (scenario === 'rail-workspace') {
    await root.getByRole('button', { name: 'K Kestrel Freight 24 members', exact: true }).click()
    await root.getByRole('menu', { name: 'Switch workspace', exact: true }).waitFor({ state: 'visible' })
  } else {
    await root.getByRole('button', { name: 'Close navigation', exact: true }).click()
    await root.getByRole('dialog', { name: 'Navigation', exact: true }).waitFor({ state: 'hidden' })
  }
}
async function prepareShellSidebarScenario(
  root: Locator,
  scenario: (typeof shellSidebarScenarios)[number],
): Promise<void> {
  if (scenario === 'shell-account') {
    await root.getByRole('button', { name: 'Devon Okafor Dispatch lead', exact: true }).click()
    await root.getByRole('menu', { name: 'Account', exact: true }).waitFor({ state: 'visible' })
  } else {
    await root.getByRole('button', { name: 'Close navigation', exact: true }).click()
    await root.getByRole('dialog', { name: 'Navigation', exact: true }).waitFor({ state: 'hidden' })
  }
}
export function shellSidebarInteractionCases(
  snapshot: SemanticSnapshot,
  variantId: string,
  scenario?: (typeof shellSidebarScenarios)[number],
): readonly InteractionCase[] {
  const cases = [...interactionCases(snapshot, variantId, scenario)]
  const close = visibleControls(snapshot).find((control) => control.name === 'Close navigation')
  if (!scenario && close)
    cases.push({
      id: `${variantId}:${close.index}:press-escape`,
      action: 'press',
      key: 'Escape',
      focusBefore: true,
      control: close,
    })
  return cases.map((interaction) =>
    interaction.action === 'fill' ? { ...interaction, fillValue: 'Kettleworth' } : interaction,
  )
}

export function usageBudgetSliderCases(snapshot: SemanticSnapshot, variantId: string): readonly InteractionCase[] {
  const input = visibleControls(snapshot).find(
    (control) =>
      control.tag === 'input' && control.type === 'range' && (control.name || control.labelFor) === 'Monthly cap',
  )
  if (!input) throw new Error('Budget slider changed; observe the live native range before sampling it')
  return (['Home', 'End'] as const).map((key) => ({
    id: `${variantId}:${input.index}:range-${key.toLowerCase()}`,
    control: input,
    action: 'press',
    key,
    focusBefore: true,
  }))
}

export function usageBudgetInteractionCases(snapshot: SemanticSnapshot, variantId: string): readonly InteractionCase[] {
  return [...interactionCases(snapshot, variantId), ...usageBudgetSliderCases(snapshot, variantId)].map(
    (interaction) => (interaction.action === 'press' ? { ...interaction, focusBefore: true } : interaction),
  )
}

export function usageOverageInteractionCases(
  snapshot: SemanticSnapshot,
  variantId: string,
): readonly InteractionCase[] {
  const controls = visibleControls(snapshot)
  if (controls.filter((control) => control.tag === 'button' && control.role === 'radio').length !== 2)
    throw new Error('Overage plan controls changed; re-observe the live source before sampling')
  return interactionCases(snapshot, variantId).map((interaction) =>
    interaction.action === 'press' ? { ...interaction, focusBefore: true } : interaction,
  )
}

const usageRequestScenarios = ['usage-requests-error', 'usage-requests-error-open'] as const
async function prepareUsageRequestScenario(
  root: Locator,
  scenario: (typeof usageRequestScenarios)[number],
): Promise<void> {
  await root.getByRole('tab', { name: 'Errors', exact: true }).click()
  const row = root.getByRole('button', { name: /14:30:31/ })
  const expanded = (await row.getAttribute('aria-expanded')) === 'true'
  if (expanded !== (scenario === 'usage-requests-error-open')) await row.click()
}
export function usageRequestInteractionCases(
  snapshot: SemanticSnapshot,
  variantId: string,
  scenario?: (typeof usageRequestScenarios)[number],
): readonly InteractionCase[] {
  return interactionCases(snapshot, variantId, scenario).map((interaction) =>
    interaction.action === 'press' ? { ...interaction, focusBefore: true } : interaction,
  )
}

export function usageCompactInteractionCases(
  snapshot: SemanticSnapshot,
  variantId: string,
): readonly InteractionCase[] {
  if (visibleControls(snapshot).filter((control) => control.tag === 'button').length !== 2)
    throw new Error('Compact usage actions changed; re-observe the live source before sampling')
  return interactionCases(snapshot, variantId).map((interaction) =>
    interaction.action === 'press' ? { ...interaction, focusBefore: true } : interaction,
  )
}

export function planBoardScrollCase(
  variantId: string,
  owner: ControlSnapshot,
  scope: 'column' | 'stack',
  destination: 'middle' | 'end',
): InteractionCase {
  if (
    owner.tag !== (scope === 'column' ? 'ol' : 'div') ||
    !owner.visible ||
    !Number.isInteger(owner.index) ||
    owner.index < 0 ||
    owner.capabilities.length !== 1 ||
    owner.capabilities[0] !== 'scroll'
  )
    throw new Error('A board scroll probe requires an observed scroll-only owner')
  if (scope === 'column' && destination !== 'end') throw new Error('Column sampling only requires its end boundary')
  return {
    id: `${variantId}:board-${scope}${scope === 'column' ? `:${owner.index}` : ''}:scroll:${destination}`,
    action: 'scroll',
    scenario: scope === 'column' ? 'board-column-scroll' : 'board-stack-scroll',
    control: owner,
    wheelDeltaY: destination === 'middle' ? 500 : 2000,
  }
}

async function observePlanBoardScroll(root: Locator, variantId: string): Promise<InteractionCase[]> {
  if ((await root.locator(interactiveControlSelector).count()) !== 0)
    throw new Error('Plan 5 gained an actionable control; re-observe its sampling plan')
  const owners = await root.evaluate((element): { control: ControlSnapshot; scope: 'stack' | 'column' }[] => {
    const sections = [...element.querySelectorAll('section:has(> h3)')]
    const stack = sections[0]?.parentElement
    if (
      !stack ||
      sections.length !== 3 ||
      sections.some((section) => !section.querySelector('h3') || !section.querySelector('ol'))
    )
      throw new Error('Missing observed three-section Plan 5 board')
    const candidates = [stack, ...sections.flatMap((section) => [...section.querySelectorAll('ol')])]
    const owner = element.getBoundingClientRect()
    return candidates.flatMap((target, index) => {
      const style = getComputedStyle(target),
        rect = target.getBoundingClientRect()
      if (!['auto', 'scroll'].includes(style.overflowY) || target.scrollHeight <= target.clientHeight + 1) return []
      const scope = index === 0 ? 'stack' : 'column'
      return [
        {
          scope,
          control: {
            index: index === 0 ? 0 : index - 1,
            tag: target.tagName.toLowerCase(),
            role: index === 0 ? null : 'list',
            type: null,
            name: index === 0 ? '' : (sections[index - 1]?.querySelector('h3')?.textContent?.trim() ?? ''),
            disabled: false,
            visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden',
            rect: { x: rect.x - owner.x, y: rect.y - owner.y, width: rect.width, height: rect.height },
            expanded: null,
            pressed: null,
            selected: null,
            state: null,
            stablePath: index === 0 ? 'section/parent' : `section:nth-of-type(${index}) ol`,
            labelFor: null,
            describedBy: null,
            capabilities: ['scroll'],
            options: [],
          },
        },
      ]
    })
  })
  return owners.flatMap(({ control, scope }) =>
    scope === 'stack'
      ? ['middle', 'end'].map((destination) =>
          planBoardScrollCase(variantId, control, scope, destination === 'middle' ? 'middle' : 'end'),
        )
      : [planBoardScrollCase(variantId, control, scope, 'end')],
  )
}

export function passiveTableRowHoverCase(variantId: string, row: ControlSnapshot): InteractionCase {
  if (
    row.tag !== 'tr' ||
    row.role !== 'row' ||
    !row.visible ||
    !Number.isInteger(row.index) ||
    row.index < 0 ||
    row.capabilities.length !== 1 ||
    row.capabilities[0] !== 'hover'
  ) {
    throw new Error('A passive table probe requires an observed visible row with hover-only capability')
  }
  return {
    id: `${variantId}:passive-row:${row.index}:hover`,
    action: 'hover',
    scenario: 'passive-table-row',
    control: row,
  }
}

async function observePlanActualHover(root: Locator, variantId: string): Promise<InteractionCase> {
  if ((await root.locator(interactiveControlSelector).count()) !== 0)
    throw new Error('Plan 4 reference gained an actionable control; re-observe its sampling plan')
  const row = await root.evaluate((element): ControlSnapshot => {
    const target = element.querySelector('table tbody tr')
    if (!target || element.querySelectorAll('table').length !== 1 || !target.querySelector('th[scope="row"]'))
      throw new Error('Missing observed Plan 4 timing table row')
    const rect = target.getBoundingClientRect(),
      owner = element.getBoundingClientRect(),
      style = getComputedStyle(target)
    return {
      index: 0,
      tag: 'tr',
      role: 'row',
      type: null,
      name: target.textContent?.trim() ?? '',
      disabled: false,
      visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
      rect: { x: rect.x - owner.x, y: rect.y - owner.y, width: rect.width, height: rect.height },
      expanded: null,
      pressed: null,
      selected: null,
      state: null,
      stablePath: 'table > tbody > tr:nth-child(1)',
      labelFor: null,
      describedBy: null,
      capabilities: ['hover'],
      options: [],
    }
  })
  return passiveTableRowHoverCase(variantId, row)
}

export function planReviewScenarioCases(
  snapshot: SemanticSnapshot,
  variantId: string,
  scenario: 'plan-draft' | 'plan-running',
): readonly InteractionCase[] {
  const cases = interactionCases(snapshot, variantId, scenario)
  if (scenario !== 'plan-draft') return cases
  const input = visibleControls(snapshot).find((control) => control.tag === 'input' && control.name === 'Add a step')
  if (!input) throw new Error('Missing live plan draft input')
  return [
    ...cases,
    {
      id: `${variantId}:${scenario}:${input.index}:press-enter`,
      action: 'press',
      key: 'Enter',
      control: input,
      scenario,
    },
  ]
}

async function preparePlanTreeScenario(root: Locator): Promise<void> {
  for (const title of ['Prepare the data 3 of 3', 'Apply the migration 2 of 4']) {
    const group = root.getByRole('button', { name: title, exact: true })
    if ((await group.getAttribute('aria-expanded')) === 'true') await group.click()
  }
  const shipping = root.getByRole('button', { name: 'Ship the change 0 of 3', exact: true })
  if ((await shipping.getAttribute('aria-expanded')) !== 'true') await shipping.click()
}

async function preparePlanReviewScenario(root: Locator, scenario: 'plan-draft' | 'plan-running'): Promise<void> {
  await root
    .getByRole('textbox', { name: 'Add a step', exact: true })
    .fill(scenario === 'plan-draft' ? 'audit sample' : '')
  if (scenario === 'plan-running') await root.getByRole('button', { name: 'Start 8 steps', exact: true }).click()
}

const planSummaryScenarios = ['summary-edit', 'summary-changed', 'summary-empty', 'summary-running'] as const
const usageOverviewScenarios = ['usage-month', 'usage-detail'] as const
async function prepareUsageOverviewScenario(
  root: Locator,
  scenario: (typeof usageOverviewScenarios)[number],
): Promise<void> {
  await root.getByRole('tab', { name: scenario === 'usage-month' ? '30d' : '7d', exact: true }).click()
  if (scenario === 'usage-detail') await root.getByRole('button', { name: 'Mon: 5.7M tokens', exact: true }).focus()
}
export function passiveModelRowHoverCase(variantId: string, control: ControlSnapshot): InteractionCase {
  if (
    control.tag !== 'div' ||
    control.role !== null ||
    !control.visible ||
    control.capabilities.length !== 1 ||
    control.capabilities[0] !== 'hover'
  )
    throw new Error('Model spend row probes require an observed visible passive div with hover-only capability')
  return { id: `${variantId}:usage-model-row:0:hover`, action: 'hover', scenario: 'usage-model-row', control }
}
async function observeModelSpendRow(root: Locator, variantId: string): Promise<InteractionCase> {
  const control = await root
    .getByText('Atlas Pro', { exact: true })
    .locator('../../..')
    .evaluate((e): ControlSnapshot => {
      if (
        e.tagName !== 'DIV' ||
        e.children.length !== 7 ||
        e.children[1]?.tagName !== 'P' ||
        e.querySelector('button,a,input,select')
      )
        throw new Error('The model spend row structure changed; re-observe before sampling it')
      const rect = e.getBoundingClientRect()
      return {
        index: 0,
        tag: 'div',
        role: null,
        type: null,
        name: 'Atlas Pro',
        disabled: false,
        visible: rect.width > 0 && rect.height > 0,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        expanded: null,
        pressed: null,
        selected: null,
        state: null,
        stablePath: 'p[Atlas Pro]/ancestor::div[3]',
        labelFor: null,
        describedBy: null,
        capabilities: ['hover'],
        options: [],
      }
    })
  return passiveModelRowHoverCase(variantId, control)
}
async function preparePlanSummaryScenario(
  root: Locator,
  scenario: (typeof planSummaryScenarios)[number],
): Promise<void> {
  const cancel = root.getByRole('button', { name: 'Cancel', exact: true })
  if (await cancel.isVisible()) await cancel.click()
  const stop = root.getByRole('button', { name: 'Stop', exact: true })
  if (await stop.isVisible()) await stop.click()
  if (scenario === 'summary-running') {
    await root.getByRole('button', { name: 'Run plan', exact: true }).click()
    return
  }
  await root.getByRole('button', { name: 'Edit plan', exact: true }).click()
  if (scenario !== 'summary-edit')
    await root
      .getByRole('textbox', { name: 'Plan goal', exact: true })
      .fill(scenario === 'summary-empty' ? '   ' : '  audit sample  ')
}

export function agentLogDynamicCaseIds(variantId: string): readonly string[] {
  return ['running', 'away'].flatMap((scenario) =>
    ['hover', 'focus', 'click', 'press-enter', 'press-space'].map((action) => `${variantId}:${scenario}:4:${action}`),
  )
}

export function agentFailureDynamicCaseIds(variantId: string): readonly string[] {
  return ['hover', 'focus', 'click', 'press-enter', 'press-space'].map(
    (action) => `${variantId}:retry-queued:1:${action}`,
  )
}

export function inlineApprovalDynamicCaseIds(variantId: string): readonly string[] {
  return [0, 1, 2, 3].flatMap((index) =>
    (index === 0
      ? ['hover', 'focus', 'click', 'press-enter', 'press-space', 'expand', 'expand-escape']
      : index === 3
        ? ['hover', 'focus', 'no-op', 'scroll-arrowright', 'scroll-arrowleft', 'scroll-home', 'scroll-end']
        : ['hover', 'focus', 'click', 'press-enter', 'press-space']
    ).map((action) => `${variantId}:inline-request-open:${index}:${action}`),
  )
}

export function diffApprovalDynamicCaseIds(variantId: string): readonly string[] {
  return [0, 1, 2, 3, 4].flatMap((index) =>
    (index === 0
      ? ['hover', 'focus', 'click', 'press-enter', 'press-space', 'expand', 'expand-escape']
      : index === 4
        ? ['hover', 'focus', 'no-op', 'scroll-arrowright', 'scroll-arrowleft', 'scroll-home', 'scroll-end']
        : ['hover', 'focus', 'click', 'press-enter', 'press-space']
    ).map((action) => `${variantId}:diff-request-open:${index}:${action}`),
  )
}

export function diffApprovalScenarioCases(snapshot: SemanticSnapshot, variantId: string): readonly InteractionCase[] {
  const payload = visibleControls(snapshot).find((control) => control.tag === 'pre')
  if (!payload) throw new Error('Missing focusable diff payload in the live approval')
  const scenario = 'diff-request-open'
  return [
    ...interactionCases(snapshot, variantId, scenario),
    ...(['ArrowRight', 'ArrowLeft', 'Home', 'End'] as const).map((key): InteractionCase => ({
      id: `${variantId}:${scenario}:${payload.index}:scroll-${key.toLowerCase()}`,
      action: 'press',
      key,
      control: payload,
      scenario,
    })),
  ]
}

export function queueApprovalDynamicCaseIds(variantId: string): readonly string[] {
  return queueApprovalScenarioPlans.flatMap((plan) =>
    (plan.expanded ? [0, 1, 2, 3] : [0, 1, 2]).flatMap((index) =>
      (index === 0
        ? ['hover', 'focus', 'click', 'press-enter', 'press-space', 'expand', 'expand-escape']
        : index === 3
          ? ['hover', 'focus', 'no-op', 'scroll-arrowright', 'scroll-arrowleft', 'scroll-home', 'scroll-end']
          : ['hover', 'focus', 'click', 'press-enter', 'press-space']
      ).map((action) => `${variantId}:${plan.id}:${index}:${action}`),
    ),
  )
}

export function queueApprovalScenarioCases(
  snapshot: SemanticSnapshot,
  variantId: string,
  plan: QueueApprovalScenarioPlan,
): readonly InteractionCase[] {
  const controls = visibleControls(snapshot)
  const names = [plan.expanded ? 'Hide request' : 'Show request', 'Reject', 'Approve']
  if (
    controls.length !== (plan.expanded ? 4 : 3) ||
    names.some(
      (name, index) =>
        controls[index]?.tag !== 'button' || controls[index]?.index !== index || controls[index]?.name !== name,
    )
  )
    throw new Error(
      `Unexpected live queue controls for ${plan.id}; re-observe the reference before changing the manifest`,
    )
  if (controls[0]?.expanded !== String(plan.expanded))
    throw new Error(`Queue disclosure state did not match ${plan.id}`)
  const cases = interactionCases(snapshot, variantId, plan.id)
  if (!plan.expanded) return cases
  const payload = controls[3]
  if (!payload || payload.tag !== 'pre' || payload.index !== 3)
    throw new Error(`Missing focusable queue payload for ${plan.id}`)
  return [
    ...cases,
    ...(['ArrowRight', 'ArrowLeft', 'Home', 'End'] as const).map((key): InteractionCase => ({
      id: `${variantId}:${plan.id}:${payload.index}:scroll-${key.toLowerCase()}`,
      action: 'press',
      key,
      control: payload,
      scenario: plan.id,
    })),
  ]
}

export function inlineApprovalScenarioCases(snapshot: SemanticSnapshot, variantId: string): readonly InteractionCase[] {
  const payload = visibleControls(snapshot).find((control) => control.tag === 'pre')
  if (!payload) throw new Error('Missing focusable request payload in the live inline approval')
  const scenario = 'inline-request-open'
  return [
    ...interactionCases(snapshot, variantId, scenario),
    ...(['ArrowRight', 'ArrowLeft', 'Home', 'End'] as const).map((key): InteractionCase => ({
      id: `${variantId}:${scenario}:${payload.index}:scroll-${key.toLowerCase()}`,
      action: 'press',
      key,
      control: payload,
      scenario,
    })),
  ]
}

export async function settleInlineApprovalScroll(root: Locator): Promise<void> {
  await settleNativeScroll(root)
}

async function settleNativeScroll(root: Locator): Promise<void> {
  await root.evaluate(async (element) => {
    const panes = [element, ...element.querySelectorAll('*')].filter(
      (candidate) => candidate.scrollHeight > candidate.clientHeight || candidate.scrollWidth > candidate.clientWidth,
    )
    let previous = ''
    let unchanged = 0
    for (let frame = 0; frame < 120; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const current = JSON.stringify(panes.map((pane) => [pane.scrollTop, pane.scrollLeft]))
      unchanged = current === previous ? unchanged + 1 : 0
      previous = current
      if (unchanged >= 4) return
    }
    throw new Error('Native scroll did not settle before capture')
  })
}

async function prepareFocusedKeyboardBaseline(
  root: Locator,
  control: Locator | undefined,
  interaction: InteractionCase,
  directory: string,
  snapshot: () => Promise<SemanticSnapshot>,
): Promise<void> {
  if (!interaction.focusBefore || !control || (await controlIsDisabled(control))) return
  if (interaction.action !== 'press') throw new Error('A focused keyboard baseline requires a key action')
  const before = join(directory, 'focus-before.png'),
    after = join(directory, 'focus-after.png')
  const beforeSnapshot = join(directory, 'focus-before.json'),
    afterSnapshot = join(directory, 'focus-after.json')
  await screenshotStable(root, before)
  await writeJson(beforeSnapshot, await snapshot())
  await control.focus()
  await settleNativeScroll(root)
  await screenshotStable(root, after)
  await writeJson(afterSnapshot, await snapshot())
  await writeJson(join(directory, 'focus-preparation.json'), {
    kind: 'native-keyboard-focus',
    before,
    after,
    beforeSnapshot,
    afterSnapshot,
    note: 'Focus and any native scrolling precede the key. These unmodified captures retain that preparation feedback separately.',
  })
}

async function prepareHistoryScenario(root: Locator, scenario: 'history-match' | 'history-empty'): Promise<void> {
  if (scenario === 'history-empty') await root.locator('button').nth(2).click()
  await root.locator('input').fill(scenario === 'history-match' ? 'Maya' : 'audit sample')
}

const usageMemberScenarios = ['usage-members-platform', 'usage-members-empty'] as const
async function prepareUsageMemberScenario(
  root: Locator,
  scenario: (typeof usageMemberScenarios)[number],
): Promise<void> {
  await root.getByRole('tab', { name: 'Platform', exact: true }).click()
  await root
    .getByRole('searchbox', { name: 'Search members', exact: true })
    .fill(scenario === 'usage-members-empty' ? 'audit sample' : '')
}
export function usageMemberScenarioCases(
  snapshot: SemanticSnapshot,
  variantId: string,
  scenario: (typeof usageMemberScenarios)[number],
): readonly InteractionCase[] {
  return interactionCases(snapshot, variantId, scenario).map((interaction) =>
    interaction.action === 'fill'
      ? { ...interaction, fillValue: scenario === 'usage-members-empty' ? '' : 'Sofia' }
      : interaction,
  )
}

async function prepareInlineApprovalScenario(root: Locator): Promise<void> {
  const trigger = root.getByRole('button', { name: 'Show request', exact: true })
  // Settle the native scroll event before opening the disclosure, so its edge
  // indicators are not sampled during Playwright's implicit scroll/click race.
  await trigger.scrollIntoViewIfNeeded()
  await settleInlineApprovalScroll(root)
  await trigger.click()
  await root.getByRole('button', { name: 'Hide request', exact: true }).waitFor({ state: 'visible' })
  await settleInlineApprovalScroll(root)
}

async function prepareDiffApprovalScenario(root: Locator): Promise<void> {
  const trigger = root.getByRole('button', { name: 'Show diff', exact: true })
  await trigger.scrollIntoViewIfNeeded()
  await settleInlineApprovalScroll(root)
  await trigger.click()
  await root.getByRole('button', { name: 'Hide diff', exact: true }).waitFor({ state: 'visible' })
  await settleInlineApprovalScroll(root)
}

export async function prepareQueueApprovalScenario(root: Locator, plan: QueueApprovalScenarioPlan): Promise<void> {
  for (const [index, decision] of plan.decisions.entries()) {
    const control = root.getByRole('button', { name: decision, exact: true })
    await control.scrollIntoViewIfNeeded()
    await settleInlineApprovalScroll(root)
    await control.click()
    // A click that merely disables the first card must not masquerade as
    // reaching a later request. The live header is the authoritative checkpoint.
    await root
      .locator('header')
      .getByText(`${2 - index} waiting`, { exact: true })
      .waitFor({ state: 'visible', timeout: 5000 })
    await root.getByRole('button', { name: 'Show request', exact: true }).waitFor({ state: 'visible' })
    await settleInlineApprovalScroll(root)
  }
  if (plan.expanded) await prepareInlineApprovalScenario(root)
}

function isScrollAwareApproval(id: string): boolean {
  return [
    'hbar-app-ui-agent-approval-1',
    'hbar-app-ui-agent-approval-2',
    'hbar-app-ui-agent-approval-3',
    'hbar-app-ui-agent-approval-4',
    'hbar-app-ui-agent-approval-5',
  ].includes(id)
}

export async function preparePermissionApprovalScenario(
  root: Locator,
  scenario: PermissionApprovalScenario,
): Promise<void> {
  const scopes = root.getByRole('checkbox')
  if ((await scopes.count()) !== 3) throw new Error('Permission reference scope count changed; re-observe the preview')
  if (scenario === 'permission-empty') {
    for (const scope of await scopes.all()) await scope.uncheck()
    if (!(await root.getByRole('button', { name: 'Approve', exact: true }).isDisabled()))
      throw new Error('Zero-scope approval must be disabled')
  } else {
    if (scenario === 'permission-partial-open') await scopes.nth(1).uncheck()
    await prepareInlineApprovalScenario(root)
  }
  await settleInlineApprovalScroll(root)
}

export function permissionApprovalScenarioCases(
  snapshot: SemanticSnapshot,
  variantId: string,
  scenario: PermissionApprovalScenario,
): readonly InteractionCase[] {
  const cases = interactionCases(snapshot, variantId, scenario)
  if (scenario === 'permission-empty') return cases
  const payload = visibleControls(snapshot).find((control) => control.tag === 'pre')
  if (!payload) throw new Error('Missing focusable permission request payload')
  return [
    ...cases,
    {
      id: `${variantId}:${scenario}:${payload.index}:scroll-arrowright`,
      action: 'press',
      key: 'ArrowRight',
      control: payload,
      scenario,
    },
  ]
}

async function prepareInlineApprovalActivation(
  root: Locator,
  control: Locator,
  interaction: InteractionCase,
): Promise<void> {
  if (interaction.action === 'click' || interaction.action === 'expand') {
    await control.scrollIntoViewIfNeeded()
    await settleInlineApprovalScroll(root)
  } else if (interaction.action === 'press') {
    await control.focus()
    await settleInlineApprovalScroll(root)
  }
}

async function prepareAgentFailureScenario(root: Locator): Promise<void> {
  await root.getByRole('button', { name: 'Retry run' }).click()
  await root.getByRole('button', { name: 'Cancel retry' }).waitFor({ state: 'visible' })
}

function agentFailureScenarioCases(snapshot: SemanticSnapshot, variantId: string): readonly InteractionCase[] {
  const control = visibleControls(snapshot).find((candidate) => candidate.name === 'Cancel retry')
  if (!control) throw new Error('Missing Cancel retry after queuing the live React Bits Pro failure')
  return interactionCases({ ...snapshot, controls: [control] }, variantId, 'retry-queued')
}

function agentLogScenarioCases(
  snapshot: SemanticSnapshot,
  variantId: string,
  scenario: 'running' | 'away',
): readonly InteractionCase[] {
  const name = scenario === 'running' ? 'Stop' : 'Jump to latest'
  const control = visibleControls(snapshot).find((candidate) => candidate.name === name)
  if (!control) throw new Error(`Missing ${name} in the live React Bits Pro log scenario`)
  return interactionCases({ ...snapshot, controls: [control] }, variantId, scenario)
}

async function prepareAgentLogScenario(
  page: Page,
  root: Locator,
  scenario: InteractionCase['scenario'],
  source: boolean,
  checkpointRows = 24,
): Promise<void> {
  if (scenario === 'running') {
    const targetRows = checkpointRows
    if (!source) {
      await root
        .locator('ol li')
        .nth(targetRows - 1)
        .waitFor({ state: 'attached', timeout: 5_000 })
      if ((await root.locator('ol li').count()) !== targetRows)
        throw new Error(`Local running log missed the ${targetRows}-line checkpoint`)
    }
    await (
      source ? root.locator('button').filter({ hasText: 'Stop' }) : root.getByRole('button', { name: 'Stop' })
    ).waitFor({ state: 'visible', timeout: 1_500 })
    if (!source) {
      await page.clock.install()
      await page.clock.pauseAt((await root.evaluate(() => Date.now())) + 1)
      if ((await root.locator('ol li').count()) !== targetRows)
        throw new Error(`Local running log changed during the ${targetRows}-line checkpoint`)
      // The real preview follows the newest row. Align the independently
      // clock-paused local pane after React has committed that checkpoint.
      await root.locator('.hbar-app-ui-agent-activity-log-scroll').evaluate((element) => {
        element.scrollTop = element.scrollHeight
      })
    }
    return
  }
  if (source) {
    await root.locator('ol li').nth(25).waitFor({ state: 'attached', timeout: 15_000 })
    await root.locator('button').filter({ hasText: 'Stop' }).waitFor({ state: 'hidden', timeout: 15_000 })
  } else {
    await root.locator('[data-hbar-app-ui-log-phase="complete"]').waitFor({ state: 'visible', timeout: 15_000 })
  }
  const pane = source ? root.locator('ol').locator('..') : root.locator('.hbar-app-ui-agent-activity-log-scroll')
  await pane.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await root.getByRole('button', { name: 'Jump to latest' }).waitFor({ state: 'hidden', timeout: 5_000 })
  if (scenario === 'away') {
    await pane.hover()
    await pane.evaluate((element) => {
      element.scrollTop = 0
    })
    await root.getByRole('button', { name: 'Jump to latest' }).waitFor({ state: 'visible', timeout: 5_000 })
  }
}

async function runningLogCheckpoint(root: Locator): Promise<{ rows: number; message: string }> {
  return root.locator('ol').evaluate((list) => {
    const rows = Array.from(list.querySelectorAll('li'))
    return { rows: rows.length, message: rows.at(-1)?.lastElementChild?.textContent?.trim() ?? '' }
  })
}

export function selectInteractionCases(
  cases: readonly InteractionCase[],
  requestedIds: readonly string[],
): readonly InteractionCase[] {
  if (requestedIds.length === 0) return cases
  const requested = new Set(requestedIds)
  return cases.filter((interaction) => requested.has(interaction.id))
}

async function controlLocator(root: Locator, control: ControlSnapshot, scenario?: InteractionCase['scenario']) {
  if (scenario === 'dialog-evidence-scroll') return dialogEvidenceScrollOwner(root)
  if (scenario === 'usage-model-row') {
    passiveModelRowHoverCase('probe', control)
    return root.getByText('Atlas Pro', { exact: true }).locator('../../..')
  }
  if (scenario === 'board-column-scroll') return root.locator('section ol').nth(control.index)
  if (scenario === 'board-stack-scroll') return root.locator('section:has(> h3)').first().locator('..')
  if (scenario === 'passive-table-row') {
    passiveTableRowHoverCase('probe', control)
    const rows = root.locator('table > tbody > tr')
    return (await rows.count()) > control.index ? rows.nth(control.index) : undefined
  }
  const controls = root.locator(interactiveControlSelector)
  const count = await controls.count()
  if (count === 0) return undefined
  const normalise = (value: string) => value.trim().replaceAll(/\s+/g, ' ').toLowerCase()
  const expectedName = normalise(control.name)
  const candidates = await controls.evaluateAll((elements) =>
    elements.map((element, index) => ({
      index,
      tag: element.tagName.toLowerCase(),
      type: element.getAttribute('type'),
      name: (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().replaceAll(/\s+/g, ' '),
      visible: (() => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
      })(),
    })),
  )
  let best: { index: number; score: number } | undefined
  for (const candidate of candidates) {
    if (!candidate.visible) continue
    const name = normalise(candidate.name)
    let score = -Math.abs(candidate.index - control.index)
    if (candidate.tag === control.tag) score += 40
    if (candidate.type === control.type) score += 20
    if (expectedName && name === expectedName) score += 100
    else if (expectedName && (name.includes(expectedName) || expectedName.includes(name))) score += 50
    if (!best || score > best.score) best = { index: candidate.index, score }
  }
  if (!best || best.score < 40) return undefined
  return controls.nth(best.index)
}

async function applyInteraction(control: Locator, interaction: InteractionCase): Promise<void> {
  if (interaction.action === 'scroll') {
    if (
      !['board-column-scroll', 'board-stack-scroll', 'dialog-evidence-scroll'].includes(interaction.scenario ?? '') ||
      !Number.isFinite(interaction.wheelDeltaY) ||
      !interaction.wheelDeltaY
    )
      throw new Error('Native scroll requires an observed board owner and finite wheel delta')
    const before = await control.evaluate((element) => element.scrollTop)
    await control.hover()
    await control.page().mouse.wheel(0, interaction.wheelDeltaY)
    await settleNativeScroll(control)
    if ((await control.evaluate((element) => element.scrollTop)) === before)
      throw new Error('Native wheel did not move the observed scroll owner')
    return
  }
  if (['passive-table-row', 'usage-model-row'].includes(interaction.scenario ?? '') && interaction.action !== 'hover')
    throw new Error('Passive table probes must not click, focus or mutate the row')
  if (interaction.action === 'hover') await control.hover({ force: interaction.scenario === 'running' })
  if (interaction.action === 'focus') await control.focus()
  if (interaction.action === 'click') {
    if (
      interaction.id === 'hbar-app-ui-app-sidebar-6:1:click' ||
      interaction.id === 'hbar-app-ui-app-sidebar-7:15:click'
    ) {
      const bounds = await control.boundingBox()
      if (!bounds) throw new Error('Navigation scrim is not visible')
      // The actual uncovered scrim is a strip beside the sheet. Its centre
      // lies beneath the drawer, especially at the 286px stress canvas.
      await control.click({ position: { x: bounds.width - 8, y: bounds.height / 2 }, timeout: 10_000 })
    } else await control.click({ timeout: 10_000, force: interaction.scenario === 'running' })
  }
  if (interaction.action === 'fill') {
    const type = await control.getAttribute('type')
    const value = type === 'date' ? '2026-09-22' : type === 'time' ? '12:30' : type === 'number' ? '2' : 'audit sample'
    await control.fill(interaction.fillValue ?? value)
    // Sidebar tree search does not hover a folder. The live documentation's
    // pointer can rest over its first row after iframe alignment, so remove
    // that unrelated hover from both sides of this sampled input feedback.
    if (interaction.id.startsWith('hbar-app-ui-app-sidebar-5:'))
      await control.page().mouse.move(0, 0)
  }
  if (interaction.action === 'select') {
    const values = await control
      .locator('option')
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))
    const current = await control.inputValue().catch(() => '')
    const next = values.find((value) => value !== current)
    if (next !== undefined) await control.selectOption(next)
    else if (values.length === 0) await control.click({ timeout: 10_000 })
  }
  if (interaction.action === 'toggle') await control.click({ timeout: 10_000 })
  if (interaction.action === 'expand' || interaction.action === 'menu') await control.click({ timeout: 10_000 })
  if (interaction.action === 'drag') await control.dragTo(control)
  if (interaction.action === 'upload')
    await control.setInputFiles({
      name: 'reactbits-audit.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('audit fixture'),
    })
  if (interaction.action === 'download') await control.click({ timeout: 10_000 })
  if (interaction.action === 'press') {
    await control.focus()
    await control.press(interaction.key ?? 'Enter')
  }
}

async function controlIsDisabled(control: Locator): Promise<boolean> {
  return control.isDisabled().catch(() => false)
}

type InteractionCapture = Readonly<{
  id: string
  status: 'captured' | 'missing' | 'error'
  directory: string
  before: string
  after: string | null
  beforeSnapshot: string
  afterSnapshot: string | null
  checkpointRows?: number
  reason?: string
}>

type InteractionResult = Readonly<{
  variantId: string
  id: string
  action: HbarAppUiInteractionCapability
  viewport: string
  theme: AuditTheme
  caseHash: string
  source: InteractionCapture
  local: InteractionCapture
  status: string
  [key: string]: unknown
}>

export function interactionCheckpointMatches(
  result: InteractionResult,
  expected: Readonly<{ variantId: string; id: string; theme: AuditTheme; viewport: string; caseHash: string }>,
): boolean {
  return (
    result.variantId === expected.variantId &&
    result.id === expected.id &&
    result.theme === expected.theme &&
    result.viewport === expected.viewport &&
    result.caseHash === expected.caseHash &&
    (result.status === 'matched' || result.status === 'source-no-op') &&
    result.source?.status === 'captured' &&
    result.local?.status === 'captured' &&
    result.source.after !== null &&
    result.local.after !== null &&
    result.source.afterSnapshot !== null &&
    result.local.afterSnapshot !== null
  )
}

async function completedInteractionCheckpoint(
  path: string,
  expected: Readonly<{ variantId: string; id: string; theme: AuditTheme; viewport: string; caseHash: string }>,
): Promise<InteractionResult | undefined> {
  if (!(await Bun.file(path).exists())) return undefined
  let result: InteractionResult
  try {
    result = await readJson<InteractionResult>(path)
  } catch {
    return undefined
  }
  if (!interactionCheckpointMatches(result, expected)) return undefined
  const artifacts = [result.source, result.local].flatMap((capture) => [
    capture.before,
    capture.after,
    capture.beforeSnapshot,
    capture.afterSnapshot,
  ])
  const root = resolve(dirname(path), '..', '..', '..', '..', '..')
  for (const artifact of artifacts) {
    if (!artifact) return undefined
    const absolute = resolve(artifact)
    const withinRoot = relative(root, absolute)
    if (withinRoot.startsWith('..') || isAbsolute(withinRoot) || !(await Bun.file(absolute).exists())) return undefined
  }
  // A semantic match can still be an unstyled page after a dropped CSS request.
  // Do not resume it merely because its button changed the expected text.
  for (const phase of ['beforeSnapshot', 'afterSnapshot'] as const) {
    const sourcePath = result.source[phase]
    const localPath = result.local[phase]
    if (!sourcePath || !localPath) return undefined
    try {
      const source = await readJson<SemanticSnapshot>(sourcePath)
      const local = await readJson<SemanticSnapshot>(localPath)
      if (!rootGeometryMatches(source.rootRect, local.rootRect)) return undefined
    } catch {
      return undefined
    }
  }
  return result
}

async function errorInteractionCapture(id: string, directory: string, error: unknown): Promise<InteractionCapture> {
  await ensureDirectory(directory)
  const reason = error instanceof Error ? error.message : String(error)
  const beforeSnapshot = join(directory, 'before.json')
  await writeJson(join(directory, 'error.json'), { error: reason })
  return {
    id,
    status: 'error',
    directory,
    before: join(directory, 'before.png'),
    after: null,
    beforeSnapshot,
    afterSnapshot: null,
    reason,
  }
}

function interactionDirectory(
  outputRoot: string,
  kind: 'source' | 'local',
  id: string,
  theme: AuditTheme,
  viewport: AuditViewport,
  interaction: InteractionCase,
): string {
  return join(outputRoot, 'interactions', id, theme, viewport.id, interaction.id.replaceAll(':', '_'), kind)
}

export function checkableStates(axSnapshot: string): readonly string[] {
  return axSnapshot.split('\n').flatMap((line) => {
    const match = /^\s*- (checkbox|radio|switch)\b/.exec(line)
    if (!match) return []
    return [`${match[1]}:${line.includes('[mixed]') ? 'mixed' : line.includes('[checked]') ? 'checked' : 'unchecked'}`]
  })
}

async function interactionDelta(
  capture: InteractionCapture,
  interaction: InteractionCase,
): Promise<Readonly<{ changed: boolean; signature: string }> | null> {
  if (capture.status !== 'captured' || !capture.afterSnapshot) return null
  const before = await readJson<SemanticSnapshot>(capture.beforeSnapshot)
  const after = await readJson<SemanticSnapshot>(capture.afterSnapshot)
  if (interaction.action === 'scroll') return passiveScrollDelta(before, after)
  if (interaction.id.startsWith('hbar-app-ui-agent-activity-3:')) {
    const timed = timedActivityDelta(before, after, interaction.action)
    if (timed) return timed
  }
  if (interaction.id.startsWith('hbar-app-ui-agent-activity-1:')) {
    const live = liveActivityDelta(before, after)
    if (live) return live
  }
  if (interaction.id.startsWith('hbar-app-ui-app-dialog-7:'))
    return dialogMenuInteractionDelta(before, after)
  if (interaction.id.startsWith('hbar-app-ui-authentication-5:'))
    return magicLinkInteractionDelta(before, after)
  if (interaction.id.startsWith('hbar-app-ui-authentication-6:'))
    return codeAuthenticationInteractionDelta(before, after)
  if (interaction.id.startsWith('hbar-app-ui-authentication-13:'))
    return passwordResetInteractionDelta(before, after)
  return semanticInteractionDelta(before, after)
}

export function passwordResetInteractionDelta(
  before: SemanticSnapshot,
  after: SemanticSnapshot,
): Readonly<{ changed: boolean; signature: string }> {
  // The source embeds hidden stylesheet/demo text in textContent. Compare the
  // full accessible before/after hierarchy and controls, not those hidden bytes.
  const normalize = (snapshot: SemanticSnapshot): SemanticSnapshot => ({
    ...snapshot,
    bodyTextLength: snapshot.axSnapshot.length,
  })
  const base = semanticInteractionDelta(normalize(before), normalize(after))
  return {
    changed: base.changed || before.axSnapshot !== after.axSnapshot,
    signature: JSON.stringify({ base: base.signature, beforeAx: before.axSnapshot, afterAx: after.axSnapshot }),
  }
}

export function magicLinkInteractionDelta(
  before: SemanticSnapshot,
  after: SemanticSnapshot,
): Readonly<{ changed: boolean; signature: string }> {
  // The reference and local countdown are independent. Compare the actual
  // accessible content and control state, excluding only elapsed seconds and
  // hidden demo stylesheet text from the DOM body-length heuristic.
  const countdown = /Resend link in 0:\d{2}/g
  const accessible = (snapshot: SemanticSnapshot) => snapshot.axSnapshot.replace(countdown, 'Resend link in 0:--')
  const normalize = (snapshot: SemanticSnapshot): SemanticSnapshot => ({
    ...snapshot,
    bodyTextLength: accessible(snapshot).length,
    controls: snapshot.controls.map((control) => ({
      ...control,
      name: control.name.replace(countdown, 'Resend link in 0:--'),
    })),
  })
  const base = semanticInteractionDelta(normalize(before), normalize(after))
  const beforeAx = accessible(before), afterAx = accessible(after)
  return {
    changed: base.changed || beforeAx !== afterAx,
    signature: JSON.stringify({ base: base.signature, beforeAx, afterAx }),
  }
}

export function codeAuthenticationInteractionDelta(
  before: SemanticSnapshot,
  after: SemanticSnapshot,
): Readonly<{ changed: boolean; signature: string }> {
  // Compare accessible content rather than hidden animation stylesheet bytes;
  // elapsed resend seconds are independent but ready/disabled states are not.
  const countdown = /Resend in 0:\d{2}/g
  const accessible = (snapshot: SemanticSnapshot) => snapshot.axSnapshot.replace(countdown, 'Resend in 0:--')
  const normalize = (snapshot: SemanticSnapshot): SemanticSnapshot => ({
    ...snapshot,
    bodyTextLength: accessible(snapshot).length,
    controls: snapshot.controls.map((control) => ({ ...control, name: control.name.replace(countdown, 'Resend in 0:--') })),
  })
  const base = semanticInteractionDelta(normalize(before), normalize(after))
  const beforeAx = accessible(before), afterAx = accessible(after)
  return { changed: base.changed || beforeAx !== afterAx, signature: JSON.stringify({ base: base.signature, beforeAx, afterAx }) }
}

export function dialogMenuInteractionDelta(
  before: SemanticSnapshot,
  after: SemanticSnapshot,
): Readonly<{ changed: boolean; signature: string }> {
  const base = semanticInteractionDelta(before, after)
  const result = (snapshot: SemanticSnapshot) => snapshot.axSnapshot.split('\n')
    .filter((line) => /^- paragraph: /.test(line))
    .map((line) => line.slice('- paragraph: '.length))
  const beforeResult = result(before), afterResult = result(after)
  return {
    changed: base.changed || JSON.stringify(beforeResult) !== JSON.stringify(afterResult),
    signature: JSON.stringify({ base: base.signature, beforeResult, afterResult }),
  }
}

export function semanticInteractionDelta(
  before: SemanticSnapshot,
  after: SemanticSnapshot,
): Readonly<{ changed: boolean; signature: string }> {
  const state = (snapshot: SemanticSnapshot) => ({
    checkableStates: checkableStates(snapshot.axSnapshot),
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
      value: control.value ?? null,
    })),
  })
  const beforeState = state(before)
  const afterState = state(after)
  const changes = {
    checkableStates: { before: beforeState.checkableStates, after: afterState.checkableStates },
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

export function passiveScrollDelta(
  before: SemanticSnapshot,
  after: SemanticSnapshot,
): Readonly<{ changed: boolean; signature: string }> {
  const from = before.observedScroll,
    to = after.observedScroll
  if (!from || !to) throw new Error('Native scroll evidence is missing its observed positions')
  const direction = Math.sign(to.top - from.top)
  return {
    changed: direction !== 0 || to.left !== from.left,
    signature: JSON.stringify({
      direction,
      horizontal: Math.sign(to.left - from.left),
      atStart: to.top <= 1,
      atEnd: to.maximum - to.top <= 1,
      textChanged: before.bodyTextLength !== after.bodyTextLength,
      overflowChanged: before.horizontalOverflow !== after.horizontalOverflow,
    }),
  }
}

async function withObservedScroll(
  snapshot: SemanticSnapshot,
  control: Locator | undefined,
  interaction: InteractionCase,
): Promise<SemanticSnapshot> {
  if (interaction.action !== 'scroll' || !control) return snapshot
  return {
    ...snapshot,
    observedScroll: await control.evaluate((element) => ({
      top: element.scrollTop,
      left: element.scrollLeft,
      maximum: element.scrollHeight - element.clientHeight,
    })),
  }
}

// The original live timeline keeps updating its elapsed seconds without an
// action. A digit-width rollover changes the text length even on hover. The
// Stop outcome is the status transition, disabled control, and stopped step.
export function liveActivityDelta(
  before: SemanticSnapshot,
  after: SemanticSnapshot,
): Readonly<{ changed: boolean; signature: string }> | null {
  const state = (snapshot: SemanticSnapshot) => {
    if (snapshot.controls.length !== 1) return null
    const status = /\s+- text: (Running|Stopped)\b/.exec(snapshot.axSnapshot)?.[1]
    if (!status) return null
    return {
      name: snapshot.controls[0]!.name,
      disabled: snapshot.controls[0]!.disabled,
      status,
      activeStepStopped: /^\s+- listitem: .+ Stopped$/m.test(snapshot.axSnapshot),
    }
  }
  const beforeState = state(before)
  const afterState = state(after)
  if (!beforeState || !afterState) return null
  return {
    changed: JSON.stringify(beforeState) !== JSON.stringify(afterState),
    signature: JSON.stringify({ before: beforeState, after: afterState }),
  }
}

// The reference deployment demo advances its clock and step automatically even
// when the pointer is idle. Compare the action's control and status transition,
// not a body-text length that depends on which step happened to be active.
export function timedActivityDelta(
  before: SemanticSnapshot,
  after: SemanticSnapshot,
  action: HbarAppUiInteractionCapability,
): Readonly<{ changed: boolean; signature: string }> | null {
  const statuses = ['Running', 'Stopped', 'Done', 'Queued'] as const
  const actionStatuses = ['Running', 'Stopped'] as const
  const counts = (snapshot: SemanticSnapshot) => {
    const items = [...snapshot.axSnapshot.matchAll(/^\s+- listitem: .+ (Running|Stopped|Done|Queued)$/gm)]
    if (items.length !== 7) return null
    return Object.fromEntries(statuses.map((status) => [status, items.filter((item) => item[1] === status).length]))
  }
  const beforeCounts = counts(before)
  const afterCounts = counts(after)
  if (!beforeCounts || !afterCounts || before.controls.length !== 1 || after.controls.length !== 1) return null
  const control = (snapshot: SemanticSnapshot) => {
    const item = snapshot.controls[0]!
    return { name: item.name, disabled: item.disabled, expanded: item.expanded, pressed: item.pressed }
  }
  const controlChanged = JSON.stringify(control(before)) !== JSON.stringify(control(after))
  const signature = JSON.stringify({
    before: control(before),
    after: control(after),
    statusDelta:
      controlChanged && (action === 'click' || action === 'press')
        ? actionStatuses.map((status) => (afterCounts[status] ?? 0) - (beforeCounts[status] ?? 0))
        : null,
  })
  return { changed: controlChanged, signature }
}

async function replayInteraction(
  page: Page,
  spec: HbarAppUiVariantSpec,
  theme: AuditTheme,
  viewport: AuditViewport,
  referenceCanvas: ReferenceCanvas,
  interaction: InteractionCase,
  outputRoot: string,
  checkpointRows?: number,
): Promise<InteractionCapture> {
  const target = `${localPreviewUrl}/?mode=isolated&theme=${theme}&variant=${encodeURIComponent(spec.id)}`
  await page.setViewportSize({ width: referenceCanvas.width, height: referenceCanvas.height })
  await gotoStable(page, target)
  const componentRoot = `[data-hbar-app-ui-component="${spec.id}"]`
  await page.locator(componentRoot).first().waitFor({ state: 'visible', timeout: 30_000 })
  await waitForLocalStyles(page)
  await applyLocalCanvas(page, referenceCanvas, componentRoot, localCanvasSelector)
  const selector = localCanvasSelector
  const root = page.locator(selector).first()
  await root.waitFor({ state: 'visible', timeout: 30_000 })
  if (spec.id === 'hbar-app-ui-authentication-3') await prepareQuoteInitial(root)
  const toastScenario = notificationToastScenarios.find((value) => value === interaction.scenario)
  if (spec.id === 'hbar-app-ui-notifications-2' && toastScenario)
    await prepareNotificationToastScenario(root, toastScenario)
  if (spec.id === 'hbar-app-ui-notifications-3' && interaction.scenario === 'preferences-dirty')
    await prepareNotificationPreferencesDirty(root)
  if (spec.id === 'hbar-app-ui-notifications-4' && notificationActivityScenarios.some((value) => value === interaction.scenario))
    await prepareNotificationActivityScenario(root, interaction.scenario as (typeof notificationActivityScenarios)[number])
  if (spec.id === 'hbar-app-ui-notifications-5' && notificationSystemScenarios.some((value) => value === interaction.scenario))
    await prepareNotificationSystemScenario(root, interaction.scenario as (typeof notificationSystemScenarios)[number])
  if (spec.id === 'hbar-app-ui-notifications-6' && notificationBellScenarios.some((value) => value === interaction.scenario))
    await prepareNotificationBellScenario(root, interaction.scenario as (typeof notificationBellScenarios)[number])
  if (spec.id === 'hbar-app-ui-authentication-1' && authenticationSignInScenarios.some((value) => value === interaction.scenario))
    await prepareAuthenticationSignInScenario(root, interaction.scenario as (typeof authenticationSignInScenarios)[number])
  if (spec.id === 'hbar-app-ui-authentication-2' && authenticationProviderFirstScenarios.some((value) => value === interaction.scenario))
    await prepareAuthenticationProviderFirstScenario(root, interaction.scenario as (typeof authenticationProviderFirstScenarios)[number])
  if (spec.id === 'hbar-app-ui-authentication-4' && authenticationTwoStepScenarios.some((value) => value === interaction.scenario))
    await prepareAuthenticationTwoStepScenario(root, interaction.scenario as (typeof authenticationTwoStepScenarios)[number])
  if (spec.id === 'hbar-app-ui-authentication-5' && authenticationMagicLinkScenarios.some((value) => value === interaction.scenario))
    await prepareAuthenticationMagicLinkScenario(root, interaction.scenario as (typeof authenticationMagicLinkScenarios)[number])
  if (spec.id === 'hbar-app-ui-authentication-6' && authenticationCodeScenarios.some((value) => value === interaction.scenario))
    await prepareAuthenticationCodeScenario(root, interaction.scenario as (typeof authenticationCodeScenarios)[number])
  if (spec.id === 'hbar-app-ui-authentication-7' && authenticationSignUpScenarios.some((value) => value === interaction.scenario))
    await prepareAuthenticationSignUpScenario(root, interaction.scenario as (typeof authenticationSignUpScenarios)[number])
  if (spec.id === 'hbar-app-ui-authentication-8' && interaction.scenario === 'auth-enterprise-mismatch')
    await prepareAuthenticationEnterpriseMismatch(root)
  if (spec.id === 'hbar-app-ui-authentication-9' && authenticationPasskeyScenarios.some((value) => value === interaction.scenario))
    await prepareAuthenticationPasskeyScenario(root, interaction.scenario as (typeof authenticationPasskeyScenarios)[number])
  if (spec.id === 'hbar-app-ui-authentication-10' && interaction.scenario === 'auth-account-contractor')
    await prepareAuthenticationAccountContractor(root)
  if (spec.id === 'hbar-app-ui-authentication-12' && authenticationInvitationScenarios.some((value) => value === interaction.scenario))
    await prepareAuthenticationInvitationScenario(root, interaction.scenario as (typeof authenticationInvitationScenarios)[number])
  if (spec.id === 'hbar-app-ui-authentication-13' && authenticationResetScenarios.some((value) => value === interaction.scenario))
    await prepareAuthenticationResetScenario(root, interaction.scenario as (typeof authenticationResetScenarios)[number])
  if (spec.id === 'hbar-app-ui-authentication-14' && authenticationApprovalScenarios.some((value) => value === interaction.scenario))
    await prepareAuthenticationApprovalScenario(root, interaction.scenario as (typeof authenticationApprovalScenarios)[number])
  if (spec.id === 'hbar-app-ui-kanban-1' && kanbanBoardScenarios.some((value) => value === interaction.scenario))
    await prepareKanbanBoardScenario(root, interaction.scenario as (typeof kanbanBoardScenarios)[number])
  if (spec.id === 'hbar-app-ui-agent-activity-5')
    await prepareAgentLogScenario(page, root, interaction.scenario, false, checkpointRows)
  if (spec.id === 'hbar-app-ui-agent-activity-7' && interaction.scenario === 'retry-queued')
    await prepareAgentFailureScenario(root)
  if (spec.id === 'hbar-app-ui-agent-approval-1' && interaction.scenario === 'inline-request-open')
    await prepareInlineApprovalScenario(root)
  if (spec.id === 'hbar-app-ui-agent-approval-2' && interaction.scenario === 'diff-request-open')
    await prepareDiffApprovalScenario(root)
  if (spec.id === 'hbar-app-ui-agent-approval-5' && interaction.scenario === 'cost-request-open')
    await prepareInlineApprovalScenario(root)
  if (
    spec.id === 'hbar-app-ui-agent-approval-6' &&
    (interaction.scenario === 'history-match' || interaction.scenario === 'history-empty')
  )
    await prepareHistoryScenario(root, interaction.scenario)
  if (spec.id === 'hbar-app-ui-agent-plan-3' && interaction.scenario === 'tree-shipping-open')
    await preparePlanTreeScenario(root)
  if (spec.id === 'hbar-app-ui-agent-plan-1' && interaction.scenario === 'plan-paused')
    await root.getByRole('button', { name: 'Stop', exact: true }).click()
  if (
    spec.id === 'hbar-app-ui-agent-plan-2' &&
    (interaction.scenario === 'plan-draft' || interaction.scenario === 'plan-running')
  )
    await preparePlanReviewScenario(root, interaction.scenario)
  const queuePlan = queueApprovalScenarioPlans.find((plan) => plan.id === interaction.scenario)
  const summaryScenario = planSummaryScenarios.find((scenario) => scenario === interaction.scenario)
  const usageScenario = usageOverviewScenarios.find((scenario) => scenario === interaction.scenario)
  if (spec.id === 'hbar-app-ui-ai-usage-1' && usageScenario) await prepareUsageOverviewScenario(root, usageScenario)
  if (spec.id === 'hbar-app-ui-ai-usage-2' && interaction.scenario === 'usage-model-requests')
    await root.getByRole('tab', { name: 'Requests', exact: true }).click()
  if (spec.id === 'hbar-app-ui-ai-usage-3' && interaction.scenario === 'usage-limits-raised')
    await root.getByRole('tab', { name: 'Tier 2', exact: true }).click()
  const memberScenario = usageMemberScenarios.find((scenario) => scenario === interaction.scenario)
  if (spec.id === 'hbar-app-ui-ai-usage-4' && memberScenario) await prepareUsageMemberScenario(root, memberScenario)
  const requestScenario = usageRequestScenarios.find((scenario) => scenario === interaction.scenario)
  if (spec.id === 'hbar-app-ui-ai-usage-7' && requestScenario) await prepareUsageRequestScenario(root, requestScenario)
  const shellScenario = shellSidebarScenarios.find((scenario) => scenario === interaction.scenario)
  if (spec.id === 'hbar-app-ui-app-shell-1' && shellScenario) await prepareShellSidebarScenario(root, shellScenario)
  const railScenario = shellRailScenarios.find((scenario) => scenario === interaction.scenario)
  if (spec.id === 'hbar-app-ui-app-shell-2' && railScenario) await prepareShellRailScenario(root, railScenario)
  const editorialScenario = editorialScenarios.find((scenario) => scenario === interaction.scenario)
  const inboxScenario = inboxScenarios.find((scenario) => scenario === interaction.scenario)
  if (spec.id === 'hbar-app-ui-app-shell-5' && inboxScenario) await prepareInboxScenario(root, inboxScenario)
  const documentsScenario = documentsScenarios.find((scenario) => scenario === interaction.scenario)
  const scopeScenario = scopeScenarios.find((scenario) => scenario === interaction.scenario)
  if (spec.id === 'hbar-app-ui-app-shell-7' && scopeScenario) await prepareScopeScenario(root, scopeScenario)
  const chatScenario = chatScenarios.find((scenario) => scenario === interaction.scenario)
  if (spec.id === 'hbar-app-ui-app-shell-9' && chatScenario) await prepareChatScenario(root, chatScenario)
  if (spec.id === 'hbar-app-ui-app-sidebar-1' && interaction.scenario === 'sidebar-account-open')
    await prepareSidebarPrimaryScenario(root)
  if (spec.id === 'hbar-app-ui-app-sidebar-2' && interaction.scenario === 'sidebar-rail-flyout-open')
    await prepareSidebarRailScenario(root, interaction.scenario)
  if (spec.id === 'hbar-app-ui-app-sidebar-2' && interaction.scenario === 'sidebar-rail-account-open')
    await prepareSidebarRailScenario(root, interaction.scenario)
  if (spec.id === 'hbar-app-ui-app-sidebar-3' && interaction.scenario === 'sidebar-workspace-open')
    await prepareSidebarWorkspaceScenario(root)
  if (spec.id === 'hbar-app-ui-app-sidebar-5' && interaction.scenario === 'sidebar-tree-menu-open')
    await prepareSidebarTreeScenario(root)
  if (spec.id === 'hbar-app-ui-app-sidebar-6' && interaction.scenario === 'sidebar-drawer-closed')
    await prepareSidebarDrawerScenario(root)
  if (spec.id === 'hbar-app-ui-app-sidebar-7' && interaction.scenario === 'sidebar-full-closed')
    await prepareSidebarFullScenario(root)
  if (spec.id === 'hbar-app-ui-app-dialog-1' && interaction.scenario === 'dialog-plan-closed')
    await prepareDialogPlanScenario(root)
  if (spec.id === 'hbar-app-ui-app-dialog-2' &&
      (interaction.scenario === 'dialog-delete-valid' || interaction.scenario === 'dialog-delete-closed'))
    await prepareDialogDeleteScenario(root, interaction.scenario)
  if (spec.id === 'hbar-app-ui-app-dialog-3') {
    const scenario = dialogInviteScenarios.find((value) => value === interaction.scenario)
    if (scenario) await prepareDialogInviteScenario(root, scenario)
  }
  if (spec.id === 'hbar-app-ui-app-dialog-4') {
    const scenario = dialogWizardScenarios.find((value) => value === interaction.scenario)
    if (scenario) await prepareDialogWizardScenario(root, scenario)
  }
  if (spec.id === 'hbar-app-ui-app-dialog-5') {
    const scenario = dialogAlertScenarios.find((value) => value === interaction.scenario)
    if (scenario) await prepareDialogAlertScenario(root, scenario)
  }
  if (spec.id === 'hbar-app-ui-app-dialog-6' && interaction.scenario === 'dialog-evidence-closed')
    await prepareDialogEvidenceClosed(root)
  if (spec.id === 'hbar-app-ui-app-dialog-7' &&
      (interaction.scenario === 'dialog-menu-export' || interaction.scenario === 'dialog-menu-closed' ||
       interaction.scenario === 'dialog-menu-delete-keyboard'))
    await prepareDialogMenuScenario(root, interaction.scenario)
  if (spec.id === 'hbar-app-ui-app-shell-6' && documentsScenario)
    await prepareDocumentsScenario(root, documentsScenario)
  if (spec.id === 'hbar-app-ui-app-shell-4' && editorialScenario)
    await prepareEditorialScenario(root, editorialScenario)
  const contractsScenario = contractsScenarios.find((scenario) => scenario === interaction.scenario)
  if (spec.id === 'hbar-app-ui-app-shell-3' && contractsScenario)
    await prepareContractsScenario(root, contractsScenario)
  if (spec.id === 'hbar-app-ui-agent-plan-6' && summaryScenario) await preparePlanSummaryScenario(root, summaryScenario)
  if (spec.id === 'hbar-app-ui-agent-approval-3' && queuePlan) await prepareQueueApprovalScenario(root, queuePlan)
  const permissionScenario = permissionApprovalScenarios.find((scenario) => scenario === interaction.scenario)
  if (spec.id === 'hbar-app-ui-agent-approval-4' && permissionScenario)
    await preparePermissionApprovalScenario(root, permissionScenario)
  if (spec.id === 'hbar-app-ui-agent-activity-5')
    await root.evaluate((element) => {
      element.scrollTop = 0
    })
  const control = await controlLocator(root, interaction.control, interaction.scenario)
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
  await prepareFocusedKeyboardBaseline(root, control, interaction, directory, () => localSnapshot(page, selector))
  await screenshotStable(root, before)
  await writeJson(beforeSnapshot, await withObservedScroll(await localSnapshot(page, selector), control, interaction))
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
  try {
    if (!(await controlIsDisabled(control))) {
      if (isScrollAwareApproval(spec.id)) await prepareInlineApprovalActivation(root, control, interaction)
      await applyInteraction(control, interaction)
    }
  } catch (error) {
    return {
      id: interaction.id,
      status: 'error',
      directory,
      before,
      after: null,
      beforeSnapshot,
      afterSnapshot: null,
      reason: error instanceof Error ? error.message : String(error),
    }
  }
  await page.waitForTimeout(120)
  if (spec.id === 'hbar-app-ui-notifications-1' && interaction.action !== 'hover' && interaction.action !== 'focus')
    await page.waitForTimeout(450)
  if (spec.id === 'hbar-app-ui-app-dialog-5') await settleDialogAlertFeedback(root, interaction)
  if (spec.id === 'hbar-app-ui-app-dialog-6') await settleDialogEvidenceFeedback(root, interaction)
  if (spec.id === 'hbar-app-ui-app-dialog-7') await settleDialogMenuFeedback(root, interaction)
  if (isScrollAwareApproval(spec.id)) await settleInlineApprovalScroll(root)
  if (spec.id === 'hbar-app-ui-agent-activity-5')
    await root.evaluate((element) => {
      element.scrollTop = 0
    })
  await screenshotStable(root, after)
  await writeJson(afterSnapshot, await withObservedScroll(await localSnapshot(page, selector), control, interaction))
  return { id: interaction.id, status: 'captured', directory, before, after, beforeSnapshot, afterSnapshot }
}

async function replayReferenceInteraction(
  page: Page,
  reference: ReactBitsProReferenceVariant,
  options: AuditOptions,
  theme: AuditTheme,
  viewport: AuditViewport,
  referenceCanvas: ReferenceCanvas,
  interaction: InteractionCase,
  outputRoot: string,
): Promise<InteractionCapture> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  const frame =
    interaction.scenario === 'running' && reference.id === 'hbar-app-ui-agent-activity-5'
      ? await loadRunningLogPreview(page, referencePageUrl(reference, options), theme)
      : await loadReferencePreview(page, referencePageUrl(reference, options), theme)
  await alignReferenceInteractionCanvas(page, frame, referenceCanvas)
  const selector = sourceCanvasSelector
  const root = frame.locator(selector).first()
  await root.waitFor({ state: 'visible', timeout: 30_000 })
  if (reference.id === 'hbar-app-ui-authentication-3') await prepareQuoteInitial(root)
  const toastScenario = notificationToastScenarios.find((value) => value === interaction.scenario)
  if (reference.id === 'hbar-app-ui-notifications-2' && toastScenario)
    await prepareNotificationToastScenario(root, toastScenario)
  if (reference.id === 'hbar-app-ui-agent-activity-5')
    await prepareAgentLogScenario(page, root, interaction.scenario, true)
  if (reference.id === 'hbar-app-ui-agent-activity-7' && interaction.scenario === 'retry-queued')
    await prepareAgentFailureScenario(root)
  if (reference.id === 'hbar-app-ui-agent-approval-1' && interaction.scenario === 'inline-request-open')
    await prepareInlineApprovalScenario(root)
  if (reference.id === 'hbar-app-ui-agent-approval-2' && interaction.scenario === 'diff-request-open')
    await prepareDiffApprovalScenario(root)
  if (reference.id === 'hbar-app-ui-agent-approval-5' && interaction.scenario === 'cost-request-open')
    await prepareInlineApprovalScenario(root)
  if (
    reference.id === 'hbar-app-ui-agent-approval-6' &&
    (interaction.scenario === 'history-match' || interaction.scenario === 'history-empty')
  )
    await prepareHistoryScenario(root, interaction.scenario)
  if (reference.id === 'hbar-app-ui-agent-plan-3' && interaction.scenario === 'tree-shipping-open')
    await preparePlanTreeScenario(root)
  if (reference.id === 'hbar-app-ui-agent-plan-1' && interaction.scenario === 'plan-paused')
    await root.getByRole('button', { name: 'Stop', exact: true }).click()
  if (
    reference.id === 'hbar-app-ui-agent-plan-2' &&
    (interaction.scenario === 'plan-draft' || interaction.scenario === 'plan-running')
  )
    await preparePlanReviewScenario(root, interaction.scenario)
  const queuePlan = queueApprovalScenarioPlans.find((plan) => plan.id === interaction.scenario)
  if (reference.id === 'hbar-app-ui-agent-approval-3' && queuePlan) await prepareQueueApprovalScenario(root, queuePlan)
  const summaryScenario = planSummaryScenarios.find((scenario) => scenario === interaction.scenario)
  const usageScenario = usageOverviewScenarios.find((scenario) => scenario === interaction.scenario)
  if (reference.id === 'hbar-app-ui-ai-usage-1' && usageScenario)
    await prepareUsageOverviewScenario(root, usageScenario)
  if (reference.id === 'hbar-app-ui-ai-usage-2' && interaction.scenario === 'usage-model-requests')
    await root.getByRole('tab', { name: 'Requests', exact: true }).click()
  if (reference.id === 'hbar-app-ui-ai-usage-3' && interaction.scenario === 'usage-limits-raised')
    await root.getByRole('tab', { name: 'Tier 2', exact: true }).click()
  const memberScenario = usageMemberScenarios.find((scenario) => scenario === interaction.scenario)
  if (reference.id === 'hbar-app-ui-ai-usage-4' && memberScenario)
    await prepareUsageMemberScenario(root, memberScenario)
  const requestScenario = usageRequestScenarios.find((scenario) => scenario === interaction.scenario)
  if (reference.id === 'hbar-app-ui-ai-usage-7' && requestScenario)
    await prepareUsageRequestScenario(root, requestScenario)
  const shellScenario = shellSidebarScenarios.find((scenario) => scenario === interaction.scenario)
  if (reference.id === 'hbar-app-ui-app-shell-1' && shellScenario)
    await prepareShellSidebarScenario(root, shellScenario)
  const railScenario = shellRailScenarios.find((scenario) => scenario === interaction.scenario)
  if (reference.id === 'hbar-app-ui-app-shell-2' && railScenario) await prepareShellRailScenario(root, railScenario)
  const editorialScenario = editorialScenarios.find((scenario) => scenario === interaction.scenario)
  const inboxScenario = inboxScenarios.find((scenario) => scenario === interaction.scenario)
  if (reference.id === 'hbar-app-ui-app-shell-5' && inboxScenario) await prepareInboxScenario(root, inboxScenario)
  const documentsScenario = documentsScenarios.find((scenario) => scenario === interaction.scenario)
  const scopeScenario = scopeScenarios.find((scenario) => scenario === interaction.scenario)
  if (reference.id === 'hbar-app-ui-app-shell-7' && scopeScenario) await prepareScopeScenario(root, scopeScenario)
  const chatScenario = chatScenarios.find((scenario) => scenario === interaction.scenario)
  if (reference.id === 'hbar-app-ui-app-shell-9' && chatScenario) await prepareChatScenario(root, chatScenario)
  if (reference.id === 'hbar-app-ui-app-sidebar-1' && interaction.scenario === 'sidebar-account-open')
    await prepareSidebarPrimaryScenario(root)
  if (reference.id === 'hbar-app-ui-app-sidebar-2' && interaction.scenario === 'sidebar-rail-flyout-open')
    await prepareSidebarRailScenario(root, interaction.scenario)
  if (reference.id === 'hbar-app-ui-app-sidebar-2' && interaction.scenario === 'sidebar-rail-account-open')
    await prepareSidebarRailScenario(root, interaction.scenario)
  if (reference.id === 'hbar-app-ui-app-sidebar-3' && interaction.scenario === 'sidebar-workspace-open')
    await prepareSidebarWorkspaceScenario(root)
  if (reference.id === 'hbar-app-ui-app-sidebar-5' && interaction.scenario === 'sidebar-tree-menu-open')
    await prepareSidebarTreeScenario(root)
  if (reference.id === 'hbar-app-ui-app-sidebar-6' && interaction.scenario === 'sidebar-drawer-closed')
    await prepareSidebarDrawerScenario(root)
  if (reference.id === 'hbar-app-ui-app-sidebar-7' && interaction.scenario === 'sidebar-full-closed')
    await prepareSidebarFullScenario(root)
  if (reference.id === 'hbar-app-ui-app-dialog-1' && interaction.scenario === 'dialog-plan-closed')
    await prepareDialogPlanScenario(root)
  if (reference.id === 'hbar-app-ui-app-dialog-2' &&
      (interaction.scenario === 'dialog-delete-valid' || interaction.scenario === 'dialog-delete-closed'))
    await prepareDialogDeleteScenario(root, interaction.scenario)
  if (reference.id === 'hbar-app-ui-app-dialog-3') {
    const scenario = dialogInviteScenarios.find((value) => value === interaction.scenario)
    if (scenario) await prepareDialogInviteScenario(root, scenario)
  }
  if (reference.id === 'hbar-app-ui-app-dialog-4') {
    const scenario = dialogWizardScenarios.find((value) => value === interaction.scenario)
    if (scenario) await prepareDialogWizardScenario(root, scenario)
  }
  if (reference.id === 'hbar-app-ui-app-dialog-5') {
    const scenario = dialogAlertScenarios.find((value) => value === interaction.scenario)
    if (scenario) await prepareDialogAlertScenario(root, scenario)
  }
  if (reference.id === 'hbar-app-ui-app-dialog-6' && interaction.scenario === 'dialog-evidence-closed')
    await prepareDialogEvidenceClosed(root)
  if (reference.id === 'hbar-app-ui-app-dialog-7' &&
      (interaction.scenario === 'dialog-menu-export' || interaction.scenario === 'dialog-menu-closed' ||
       interaction.scenario === 'dialog-menu-delete-keyboard'))
    await prepareDialogMenuScenario(root, interaction.scenario)
  if (reference.id === 'hbar-app-ui-notifications-3' && interaction.scenario === 'preferences-dirty')
    await prepareNotificationPreferencesDirty(root)
  if (reference.id === 'hbar-app-ui-notifications-4' && notificationActivityScenarios.some((value) => value === interaction.scenario))
    await prepareNotificationActivityScenario(root, interaction.scenario as (typeof notificationActivityScenarios)[number])
  if (reference.id === 'hbar-app-ui-notifications-5' && notificationSystemScenarios.some((value) => value === interaction.scenario))
    await prepareNotificationSystemScenario(root, interaction.scenario as (typeof notificationSystemScenarios)[number])
  if (reference.id === 'hbar-app-ui-notifications-6' && notificationBellScenarios.some((value) => value === interaction.scenario))
    await prepareNotificationBellScenario(root, interaction.scenario as (typeof notificationBellScenarios)[number])
  if (reference.id === 'hbar-app-ui-authentication-1' && authenticationSignInScenarios.some((value) => value === interaction.scenario))
    await prepareAuthenticationSignInScenario(root, interaction.scenario as (typeof authenticationSignInScenarios)[number])
  if (reference.id === 'hbar-app-ui-authentication-2' && authenticationProviderFirstScenarios.some((value) => value === interaction.scenario))
    await prepareAuthenticationProviderFirstScenario(root, interaction.scenario as (typeof authenticationProviderFirstScenarios)[number])
  if (reference.id === 'hbar-app-ui-authentication-4' && authenticationTwoStepScenarios.some((value) => value === interaction.scenario))
    await prepareAuthenticationTwoStepScenario(root, interaction.scenario as (typeof authenticationTwoStepScenarios)[number])
  if (reference.id === 'hbar-app-ui-authentication-5' && authenticationMagicLinkScenarios.some((value) => value === interaction.scenario))
    await prepareAuthenticationMagicLinkScenario(root, interaction.scenario as (typeof authenticationMagicLinkScenarios)[number])
  if (reference.id === 'hbar-app-ui-authentication-6' && authenticationCodeScenarios.some((value) => value === interaction.scenario))
    await prepareAuthenticationCodeScenario(root, interaction.scenario as (typeof authenticationCodeScenarios)[number])
  if (reference.id === 'hbar-app-ui-authentication-7' && authenticationSignUpScenarios.some((value) => value === interaction.scenario))
    await prepareAuthenticationSignUpScenario(root, interaction.scenario as (typeof authenticationSignUpScenarios)[number])
  if (reference.id === 'hbar-app-ui-authentication-8' && interaction.scenario === 'auth-enterprise-mismatch')
    await prepareAuthenticationEnterpriseMismatch(root)
  if (reference.id === 'hbar-app-ui-authentication-9' && authenticationPasskeyScenarios.some((value) => value === interaction.scenario))
    await prepareAuthenticationPasskeyScenario(root, interaction.scenario as (typeof authenticationPasskeyScenarios)[number])
  if (reference.id === 'hbar-app-ui-authentication-10' && interaction.scenario === 'auth-account-contractor')
    await prepareAuthenticationAccountContractor(root)
  if (reference.id === 'hbar-app-ui-authentication-12' && authenticationInvitationScenarios.some((value) => value === interaction.scenario))
    await prepareAuthenticationInvitationScenario(root, interaction.scenario as (typeof authenticationInvitationScenarios)[number])
  if (reference.id === 'hbar-app-ui-authentication-13' && authenticationResetScenarios.some((value) => value === interaction.scenario))
    await prepareAuthenticationResetScenario(root, interaction.scenario as (typeof authenticationResetScenarios)[number])
  if (reference.id === 'hbar-app-ui-authentication-14' && authenticationApprovalScenarios.some((value) => value === interaction.scenario))
    await prepareAuthenticationApprovalScenario(root, interaction.scenario as (typeof authenticationApprovalScenarios)[number])
  if (reference.id === 'hbar-app-ui-kanban-1' && kanbanBoardScenarios.some((value) => value === interaction.scenario))
    await prepareKanbanBoardScenario(root, interaction.scenario as (typeof kanbanBoardScenarios)[number])
  if (reference.id === 'hbar-app-ui-app-shell-6' && documentsScenario)
    await prepareDocumentsScenario(root, documentsScenario)
  if (reference.id === 'hbar-app-ui-app-shell-4' && editorialScenario)
    await prepareEditorialScenario(root, editorialScenario)
  const contractsScenario = contractsScenarios.find((scenario) => scenario === interaction.scenario)
  if (reference.id === 'hbar-app-ui-app-shell-3' && contractsScenario)
    await prepareContractsScenario(root, contractsScenario)
  if (reference.id === 'hbar-app-ui-agent-plan-6' && summaryScenario)
    await preparePlanSummaryScenario(root, summaryScenario)
  const permissionScenario = permissionApprovalScenarios.find((scenario) => scenario === interaction.scenario)
  if (reference.id === 'hbar-app-ui-agent-approval-4' && permissionScenario)
    await preparePermissionApprovalScenario(root, permissionScenario)
  const runningCheckpoint = interaction.scenario === 'running' ? await runningLogCheckpoint(root) : undefined
  if (runningCheckpoint && !runningCheckpoint.message)
    throw new Error('Running React Bits log has an incomplete final row at the screenshot checkpoint')
  const control = await controlLocator(root, interaction.control, interaction.scenario)
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
  if (interaction.scenario === 'running' && interaction.action === 'click' && control) {
    await control.evaluate((element) =>
      element.addEventListener(
        'click',
        (event) => {
          ;(window as Window & { __reactBitsAuditTrustedClick?: boolean }).__reactBitsAuditTrustedClick =
            event.isTrusted
        },
        { once: true },
      ),
    )
  }
  await assertReferenceFrameTheme(frame, theme)
  await prepareFocusedKeyboardBaseline(root, control, interaction, directory, () => snapshotRoot(frame, selector))
  await screenshotStable(root, before)
  const beforeState = await withObservedScroll(await snapshotRoot(frame, selector), control, interaction)
  await writeJson(beforeSnapshot, beforeState)
  const runningControl =
    interaction.scenario === 'running' ? visibleControls(beforeState).find((item) => item.name === 'Stop') : undefined
  const checkpointRows = runningCheckpoint?.rows
  if (interaction.scenario === 'running' && !runningControl)
    throw new Error('Running log Stop expired before the before screenshot')
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
  try {
    if (interaction.scenario === 'running' || !(await controlIsDisabled(control))) {
      if (isScrollAwareApproval(reference.id)) await prepareInlineApprovalActivation(root, control, interaction)
      if (interaction.scenario === 'running' && (interaction.action === 'click' || interaction.action === 'hover')) {
        const rect = runningControl?.rect
        if (!rect) throw new Error('Running log control lost its visible bounds')
        const x = rect.x + rect.width / 2
        const y = rect.y + rect.height / 2
        if (interaction.action === 'click') {
          await page.mouse.click(x, y)
          const delivered = await frame.evaluate(
            () => (window as Window & { __reactBitsAuditTrustedClick?: boolean }).__reactBitsAuditTrustedClick,
          )
          if (delivered !== true) throw new Error('Running log did not receive a trusted pointer click')
        } else {
          await page.mouse.move(x, y)
        }
      } else {
        await applyInteraction(control, interaction)
      }
    }
  } catch (error) {
    return {
      id: interaction.id,
      status: 'error',
      directory,
      before,
      after: null,
      beforeSnapshot,
      afterSnapshot: null,
      reason: error instanceof Error ? error.message : String(error),
    }
  }
  if (!(interaction.scenario === 'running' && (interaction.action === 'hover' || interaction.action === 'focus'))) {
    await page.waitForTimeout(120)
  }
  if (reference.id === 'hbar-app-ui-notifications-1' && interaction.action !== 'hover' && interaction.action !== 'focus')
    await page.waitForTimeout(450)
  if (reference.id === 'hbar-app-ui-app-dialog-5') await settleDialogAlertFeedback(root, interaction)
  if (reference.id === 'hbar-app-ui-app-dialog-6') await settleDialogEvidenceFeedback(root, interaction)
  if (reference.id === 'hbar-app-ui-app-dialog-7') await settleDialogMenuFeedback(root, interaction)
  if (isScrollAwareApproval(reference.id)) await settleInlineApprovalScroll(root)
  if (runningCheckpoint) {
    const afterCheckpoint = await runningLogCheckpoint(root)
    if (afterCheckpoint.rows !== runningCheckpoint.rows || afterCheckpoint.message !== runningCheckpoint.message)
      throw new Error(
        `Running React Bits log changed independently of the control: ${JSON.stringify({
          before: runningCheckpoint,
          after: afterCheckpoint,
        })}`,
      )
  }
  await assertReferenceFrameTheme(frame, theme)
  await screenshotStable(root, after)
  await assertReferenceFrameTheme(frame, theme)
  await writeJson(afterSnapshot, await withObservedScroll(await snapshotRoot(frame, selector), control, interaction))
  return {
    id: interaction.id,
    status: 'captured',
    directory,
    before,
    after,
    beforeSnapshot,
    afterSnapshot,
    ...(checkpointRows === undefined ? {} : { checkpointRows }),
  }
}

async function runCapture(options: AuditOptions, browser: Browser, inventory: ReactBitsProInventory): Promise<void> {
  const selected = selectedLocalSpecs(options)
  const implementationHash = await localImplementationHash(
    selected.map((spec) => spec.id),
    options.outputRoot,
  )
  await writeLocalInventory(options.outputRoot)
  const references = new Map(inventory.variants.map((reference) => [reference.id, reference]))
  const cachedSourceRecords: readonly CaptureRecord[] = options.localOnly
    ? await (async () => {
        if (!options.sourceCaptureRoot)
          throw new Error('--local-only requires --source-output or HBAR_APP_UI_SOURCE_CAPTURE_ROOT')
        const cachePath = join(resolve(options.sourceCaptureRoot), 'capture-manifest.json')
        if (!(await Bun.file(cachePath).exists())) throw new Error(`Source capture manifest is missing: ${cachePath}`)
        const cached = await readJson<{ captureProtocolVersion?: number; records: readonly CaptureRecord[] }>(cachePath)
        if (cached.captureProtocolVersion !== captureProtocolVersion)
          throw new Error(`Source capture uses an obsolete canvas protocol; recapture the live iframe: ${cachePath}`)
        return cached.records.filter((record) => record.kind === 'source')
      })()
    : []
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
            const sourceRecord = options.localOnly
              ? cachedSourceRecords.find(
                  (record) => record.id === spec.id && record.viewport === viewport.id && record.theme === theme,
                )
              : await captureSource(sourcePage, reference, options, viewport, theme, options.outputRoot, sourceErrors)
            if (!sourceRecord?.referenceCanvas)
              throw new Error(
                `Reference canvas metadata is missing for ${spec.id}/${theme}/${viewport.id}; recapture the live source`,
              )
            if (!options.localOnly) records.push(sourceRecord)
            records.push(
              await captureLocal(
                localPage,
                spec,
                viewport,
                theme,
                options.outputRoot,
                sourceRecord.referenceCanvas,
                localErrors,
                spec.id === 'hbar-app-ui-authentication-3'
                  ? await capturedQuoteIndex(sourceRecord.snapshot)
                  : undefined,
              ),
            )
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
  if (options.localOnly) {
    const selectedIds = new Set(selected.map((spec) => spec.id))
    const selectedViewports = new Set<string>(options.viewports.map((viewport) => viewport.id))
    const selectedThemes = new Set<string>(options.themes)
    const cached = cachedSourceRecords.filter(
      (record) =>
        selectedIds.has(record.id) && selectedViewports.has(record.viewport) && selectedThemes.has(record.theme),
    )
    const sourceCaptureRoot = options.sourceCaptureRoot
    if (!sourceCaptureRoot) throw new Error('The source capture root is unavailable')
    for (let index = 0; index < cached.length; index += 16) {
      records.push(
        ...(await Promise.all(
          cached
            .slice(index, index + 16)
            .map((record) => copyCachedSourceRecord(record, sourceCaptureRoot, options.outputRoot)),
        )),
      )
    }
  }
  await writeJson(join(options.outputRoot, 'capture-manifest.json'), {
    schemaVersion: 1,
    captureProtocolVersion,
    generatedAt: new Date().toISOString(),
    selected: selected.map((spec) => spec.id),
    viewports: options.viewports,
    themes: options.themes,
    sourceDirectoryHash: inventory.sourceDirectoryHash,
    implementationHash,
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
    implementationHash,
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
            const frame = await loadReferencePreview(sourcePage, referencePageUrl(reference, options), theme)
            const sourceSelector = sourceCanvasSelector
            const sourceSnapshot = await snapshotRoot(frame, sourceSelector)
            const referenceCanvas = await readReferenceCanvas(frame)
            const cases = interactionCases(sourceSnapshot, spec.id)
            for (const interaction of cases) {
              const sourceDirectory = interactionDirectory(
                options.outputRoot,
                'source',
                reference.id,
                theme,
                viewport,
                interaction,
              )
              const localDirectory = interactionDirectory(
                options.outputRoot,
                'local',
                spec.id,
                theme,
                viewport,
                interaction,
              )
              const source = await replayReferenceInteraction(
                sourcePage,
                reference,
                options,
                theme,
                viewport,
                referenceCanvas,
                interaction,
                options.outputRoot,
              ).catch((error) => errorInteractionCapture(interaction.id, sourceDirectory, error))
              const local = await replayInteraction(
                localPage,
                spec,
                theme,
                viewport,
                referenceCanvas,
                interaction,
                options.outputRoot,
              ).catch((error) => errorInteractionCapture(interaction.id, localDirectory, error))
              const sourceDelta = await interactionDelta(source, interaction)
              const localDelta = await interactionDelta(local, interaction)
              const status =
                source.status === 'error' || local.status === 'error'
                  ? 'error'
                  : local.status === 'missing'
                    ? 'missing'
                    : sourceDelta?.changed === false && localDelta?.changed === false
                      ? 'source-no-op'
                      : sourceDelta?.signature === localDelta?.signature
                        ? 'matched'
                        : 'lumen-different'
              const result = {
                variantId: spec.id,
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
    interactionProtocolVersion,
    generatedAt: new Date().toISOString(),
    selected: selected.map((spec) => spec.id),
    viewports: options.viewports,
    themes: options.themes,
    coverage: 'all-visible-controls',
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
  const samplingPlans = selected.map((spec) => ({ id: spec.id, plan: auditSamplingPlan(spec.id) }))
  if (!options.exhaustive && samplingPlans.some((entry) => !entry.plan))
    throw new Error(
      `Missing reviewed sampling plans: ${samplingPlans
        .filter((entry) => !entry.plan)
        .map((entry) => entry.id)
        .join(', ')}. Inspect behavior groups before replay; --exhaustive is an explicit legacy diagnostic only.`,
    )
  const samplingPlanHash = options.exhaustive ? null : stableHash(samplingPlans)
  await writeJson(join(options.outputRoot, 'sampling-plan.json'), {
    mode: options.exhaustive ? 'exhaustive' : 'representative-states',
    samplingPlanHash,
    plans: options.exhaustive ? [] : samplingPlans,
  })
  const references = new Map(inventory.variants.map((reference) => [reference.id, reference]))
  const staticCapturePath = join(resolve(options.sourceCaptureRoot ?? options.outputRoot), 'capture-manifest.json')
  const staticManifest = (await Bun.file(staticCapturePath).exists())
    ? await readJson<{
        captureProtocolVersion?: number
        sourceDirectoryHash: string
        records: readonly CaptureRecord[]
      }>(staticCapturePath)
    : undefined
  if (staticManifest && staticManifest.captureProtocolVersion !== captureProtocolVersion)
    throw new Error(`Static captures use an obsolete canvas protocol; recapture the live iframe: ${staticCapturePath}`)
  if (staticManifest && staticManifest.sourceDirectoryHash !== inventory.sourceDirectoryHash)
    throw new Error(`Static reference inventory differs from interaction inventory: ${staticCapturePath}`)
  const staticCanvases = new Map(
    staticManifest?.records
      .filter(
        (record) =>
          record.kind === 'source' &&
          record.referenceCanvas &&
          selected.some((spec) => spec.id === record.id) &&
          options.themes.includes(record.theme) &&
          options.viewports.some((viewport) => viewport.id === record.viewport),
      )
      .map((record) => [`${record.id}/${record.theme}/${record.viewport}`, record.referenceCanvas!]) ?? [],
  )
  const metadataPath = join(options.outputRoot, 'interaction-run.json')
  const implementationHash = await localImplementationHash(
    selected.map((spec) => spec.id),
    options.outputRoot,
  )
  const runIdentity = {
    schemaVersion: 1,
    interactionProtocolVersion,
    coverage:
      options.cases.length > 0
        ? 'selected-cases'
        : options.exhaustive
          ? 'all-visible-controls'
          : 'representative-states',
    samplingPlanHash,
    cases: options.cases,
    selected: selected.map((spec) => spec.id),
    viewports: options.viewports,
    themes: options.themes,
    sourceDirectoryHash: inventory.sourceDirectoryHash,
    sourceUrl: inventory.sourceUrl,
    localSpecHash: stableHash(selected),
    implementationHash,
    localPreviewUrl,
    browserArguments,
    staticCanvasHash: stableHash([...staticCanvases]),
  }
  const runHash = stableHash(runIdentity)
  if (await Bun.file(metadataPath).exists()) {
    const previous = await readJson<{ runHash: string }>(metadataPath)
    if (previous.runHash !== runHash)
      throw new Error('Interaction checkpoint belongs to another inventory, local spec, viewport or theme selection')
  } else {
    if (await Bun.file(join(options.outputRoot, 'interaction-report.json')).exists())
      throw new Error('Legacy interaction report cannot be resumed; choose a fresh output directory')
    await writeJson(metadataPath, { ...runIdentity, runHash, generatedAt: new Date().toISOString() })
  }
  const server = await waitForLocalPreview()
  const results: InteractionResult[] = []
  let resumed = 0
  let cursor = 0
  const worker = async () => {
    const discoveryContext = await browser.newContext({ reducedMotion: 'reduce' })
    const discoveryPage = await discoveryContext.newPage()
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
            const sampleIds = options.exhaustive ? undefined : sampledInteractionIds(spec.id, viewport.id, theme)
            if (sampleIds?.length === 0) continue
            await discoveryPage.setViewportSize({ width: viewport.width, height: viewport.height })
            const frame = await loadReferencePreview(discoveryPage, referencePageUrl(reference, options), theme)
            const sourceSelector = sourceCanvasSelector
            const sourceRoot = frame.locator(sourceSelector).first()
            if (spec.id === 'hbar-app-ui-authentication-3') await prepareQuoteInitial(sourceRoot)
            if (spec.id === 'hbar-app-ui-agent-activity-5')
              await prepareAgentLogScenario(discoveryPage, sourceRoot, undefined, true)
            const sourceSnapshot = await snapshotRoot(frame, sourceSelector)
            const referenceCanvas =
              staticCanvases.get(`${spec.id}/${theme}/${viewport.id}`) ?? (await readReferenceCanvas(frame))
            let discovered = [...interactionCases(sourceSnapshot, spec.id)]
            if (spec.id === 'hbar-app-ui-authentication-6')
              discovered = discovered.map((item) => item.id === `${spec.id}:0:fill` ? { ...item, fillValue: '1' } : item)
            if (spec.id === 'hbar-app-ui-authentication-7')
              discovered = discovered.map((item) => item.id === `${spec.id}:0:fill` ? { ...item, fillValue: 'Dana Whitfield' }
                : item.id === `${spec.id}:1:fill` ? { ...item, fillValue: 'dana@example.test' }
                  : item.id === `${spec.id}:2:fill` ? { ...item, fillValue: theme === 'light' ? 'abcdefghij' : 'Abcdefghij1!' }
                    : item)
            if (spec.id === 'hbar-app-ui-authentication-8')
              discovered = discovered.map((item) => item.id === `${spec.id}:0:fill` ? { ...item, fillValue: theme === 'dark' ? 'dana@ardentfreight.co' : 'dana@example.test' } : item)
            if (spec.id === 'hbar-app-ui-notifications-2') {
              for (const scenario of notificationToastScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareNotificationToastScenario(sourceRoot, scenario)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario))
              }
            }
            if (spec.id === 'hbar-app-ui-notifications-3' && sampleIds?.some((id) => id.includes(':preferences-dirty:'))) {
              await prepareNotificationPreferencesDirty(sourceRoot)
              discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, 'preferences-dirty'))
            }
            if (spec.id === 'hbar-app-ui-notifications-4') {
              for (const scenario of notificationActivityScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareNotificationActivityScenario(sourceRoot, scenario)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario))
              }
            }
            if (spec.id === 'hbar-app-ui-notifications-5') {
              for (const scenario of notificationSystemScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareNotificationSystemScenario(sourceRoot, scenario)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario))
              }
            }
            if (spec.id === 'hbar-app-ui-notifications-6') {
              for (const scenario of notificationBellScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareNotificationBellScenario(sourceRoot, scenario)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario))
              }
            }
            if (spec.id === 'hbar-app-ui-authentication-1') {
              for (const scenario of authenticationSignInScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareAuthenticationSignInScenario(sourceRoot, scenario)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario))
              }
            }
            if (spec.id === 'hbar-app-ui-authentication-2') {
              const emailFill = discovered.find((item) => item.id === `${spec.id}:5:fill`)
              if (!emailFill) throw new Error('Provider-first email input changed; re-observe its behavior groups')
              discovered.push({ ...emailFill, id: `${spec.id}:5:fill-valid`, fillValue: 'dana@example.com' })
              for (const scenario of authenticationProviderFirstScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareAuthenticationProviderFirstScenario(sourceRoot, scenario)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario).map((item) =>
                  scenario === 'auth-provider-sso' && item.action === 'fill'
                    ? { ...item, fillValue: 'northwind' }
                    : item,
                ))
              }
            }
            if (spec.id === 'hbar-app-ui-authentication-4') {
              for (const scenario of authenticationTwoStepScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareAuthenticationTwoStepScenario(sourceRoot, scenario)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario))
              }
            }
            if (spec.id === 'hbar-app-ui-authentication-5') {
              for (const scenario of authenticationMagicLinkScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareAuthenticationMagicLinkScenario(sourceRoot, scenario)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario))
              }
            }
            if (spec.id === 'hbar-app-ui-authentication-6') {
              for (const scenario of authenticationCodeScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareAuthenticationCodeScenario(sourceRoot, scenario)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario).map((item) =>
                  scenario === 'auth-code-five' && item.id === `${spec.id}:${scenario}:5:fill`
                    ? { ...item, fillValue: '6' }
                    : item,
                ))
              }
            }
            if (spec.id === 'hbar-app-ui-authentication-7') {
              for (const scenario of authenticationSignUpScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareAuthenticationSignUpScenario(sourceRoot, scenario)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario).map((item) =>
                  scenario === 'auth-signup-invalid-email' && item.id === `${spec.id}:${scenario}:1:fill`
                    ? { ...item, fillValue: 'bad@' }
                    : item,
                ))
              }
            }
            if (spec.id === 'hbar-app-ui-authentication-8' && sampleIds?.some((id) => id.startsWith(`${spec.id}:auth-enterprise-mismatch:`))) {
              await prepareAuthenticationEnterpriseMismatch(sourceRoot)
              discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, 'auth-enterprise-mismatch').map((item) =>
                item.id === `${spec.id}:auth-enterprise-mismatch:0:fill` ? { ...item, fillValue: 'dana@northwind.com' } : item,
              ))
            }
            if (spec.id === 'hbar-app-ui-authentication-9') {
              for (const scenario of authenticationPasskeyScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareAuthenticationPasskeyScenario(sourceRoot, scenario)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario))
              }
            }
            if (spec.id === 'hbar-app-ui-authentication-10' && (!sampleIds || sampleIds.some((id) => id.startsWith(`${spec.id}:auth-account-contractor:`)))) {
              await prepareAuthenticationAccountContractor(sourceRoot)
              discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, 'auth-account-contractor'))
            }
            if (spec.id === 'hbar-app-ui-authentication-11') {
              discovered = discovered.map((item) => item.id === `${spec.id}:1:fill`
                ? { ...item, fillValue: viewport.id === 'mobile' ? 'no matching workspace' : 'Design' }
                : item)
            }
            if (spec.id === 'hbar-app-ui-authentication-12') {
              discovered = discovered.map((item) => item.id === `${spec.id}:1:fill` ? { ...item, fillValue: 'Dana Whitfield' } : item)
              for (const scenario of authenticationInvitationScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareAuthenticationInvitationScenario(sourceRoot, scenario)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario).map((item) =>
                  item.id === `${spec.id}:auth-invite-named:2:fill` ? { ...item, fillValue: 'StrongPassword1!' } : item,
                ))
              }
            }
            if (spec.id === 'hbar-app-ui-authentication-13') {
              discovered = discovered.map((item) => item.id === `${spec.id}:0:fill`
                ? { ...item, fillValue: theme === 'dark' ? 'Abcdefghij1!' : 'abcdefghij' }
                : item)
              for (const scenario of authenticationResetScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareAuthenticationResetScenario(sourceRoot, scenario)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario).map((item) =>
                  item.id === `${spec.id}:auth-reset-strong:2:fill`
                    ? { ...item, fillValue: theme === 'dark' ? 'Abcdefghij1!' : 'Different123!' }
                    : item,
                ))
              }
            }
            if (spec.id === 'hbar-app-ui-authentication-14') {
              for (const scenario of authenticationApprovalScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareAuthenticationApprovalScenario(sourceRoot, scenario)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario))
              }
            }
            if (spec.id === 'hbar-app-ui-kanban-1') {
              for (const scenario of kanbanBoardScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareKanbanBoardScenario(sourceRoot, scenario)
                const scenarioSnapshot = await snapshotRoot(frame, sourceSelector)
                discovered.push(...interactionCases(scenarioSnapshot, spec.id, scenario))
                if (scenario === 'kanban-grabbed') {
                  const card = visibleControls(scenarioSnapshot).find((control) => control.name.startsWith('HAL-241:'))
                  if (!card) throw new Error('Grabbed HAL-241 card missing from reference board')
                  discovered.push({ id: `${spec.id}:${scenario}:${card.index}:press-arrowright`, action: 'press', key: 'ArrowRight', control: card, scenario, focusBefore: true })
                }
              }
            }
            if (spec.id === 'hbar-app-ui-ai-usage-5')
              discovered = [...usageBudgetInteractionCases(sourceSnapshot, spec.id)]
            if (spec.id === 'hbar-app-ui-ai-usage-6')
              discovered = [...usageOverageInteractionCases(sourceSnapshot, spec.id)]
            if (spec.id === 'hbar-app-ui-ai-usage-7') {
              discovered = [...usageRequestInteractionCases(sourceSnapshot, spec.id)]
              for (const scenario of usageRequestScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareUsageRequestScenario(sourceRoot, scenario)
                discovered.push(
                  ...usageRequestInteractionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario),
                )
              }
            }
            if (spec.id === 'hbar-app-ui-ai-usage-8')
              discovered = [...usageCompactInteractionCases(sourceSnapshot, spec.id)]
            if (spec.id === 'hbar-app-ui-app-shell-1') {
              discovered = [...shellSidebarInteractionCases(sourceSnapshot, spec.id)]
              for (const scenario of shellSidebarScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareShellSidebarScenario(sourceRoot, scenario)
                discovered.push(
                  ...shellSidebarInteractionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario),
                )
              }
            }
            if (spec.id === 'hbar-app-ui-app-shell-2') {
              discovered = [...shellSidebarInteractionCases(sourceSnapshot, spec.id)]
              for (const scenario of shellRailScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareShellRailScenario(sourceRoot, scenario)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario))
              }
            }
            if (spec.id === 'hbar-app-ui-app-shell-4') {
              for (const scenario of editorialScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareEditorialScenario(sourceRoot, scenario)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario))
              }
            }
            if (spec.id === 'hbar-app-ui-app-shell-5') {
              discovered = [...inboxInteractionCases(sourceSnapshot, spec.id)]
              for (const scenario of inboxScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareInboxScenario(sourceRoot, scenario)
                discovered.push(...inboxInteractionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario))
              }
            }
            if (spec.id === 'hbar-app-ui-app-shell-6') {
              discovered = [...documentsInteractionCases(sourceSnapshot, spec.id)]
              for (const scenario of documentsScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareDocumentsScenario(sourceRoot, scenario)
                discovered.push(
                  ...documentsInteractionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario),
                )
              }
            }
            if (spec.id === 'hbar-app-ui-app-shell-7') {
              for (const scenario of scopeScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareScopeScenario(sourceRoot, scenario)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario))
              }
            }
            if (spec.id === 'hbar-app-ui-app-shell-9') {
              for (const scenario of chatScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareChatScenario(sourceRoot, scenario)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario))
              }
            }
            if (spec.id === 'hbar-app-ui-app-sidebar-1') {
              for (const scenario of sidebarPrimaryScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareSidebarPrimaryScenario(sourceRoot)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario))
              }
            }
            if (spec.id === 'hbar-app-ui-app-sidebar-2') {
              for (const scenario of sidebarRailScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareSidebarRailScenario(sourceRoot, scenario)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario))
              }
            }
            if (spec.id === 'hbar-app-ui-app-sidebar-3') {
              for (const scenario of sidebarWorkspaceScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareSidebarWorkspaceScenario(sourceRoot)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario))
              }
            }
            if (spec.id === 'hbar-app-ui-app-sidebar-5') {
              for (const scenario of sidebarTreeScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareSidebarTreeScenario(sourceRoot)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario))
              }
            }
            if (spec.id === 'hbar-app-ui-app-sidebar-6') {
              for (const scenario of sidebarDrawerScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareSidebarDrawerScenario(sourceRoot)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario))
              }
            }
            if (spec.id === 'hbar-app-ui-app-sidebar-7') {
              for (const scenario of sidebarFullScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareSidebarFullScenario(sourceRoot)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario))
              }
            }
            if (spec.id === 'hbar-app-ui-app-dialog-1') {
              for (const scenario of dialogPlanScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareDialogPlanScenario(sourceRoot)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario))
              }
            }
            if (spec.id === 'hbar-app-ui-app-dialog-2') {
              const fill = discovered.find((item) => item.id === `${spec.id}:2:fill`)
              if (!fill) throw new Error('Delete dialog confirmation input changed; re-observe its behavior groups')
              discovered.push({ ...fill, id: `${spec.id}:2:fill-valid`, fillValue: 'atlas-production' })
              for (const scenario of dialogDeleteScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareDialogDeleteScenario(sourceRoot, scenario)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario))
              }
            }
            if (spec.id === 'hbar-app-ui-app-dialog-3') {
              for (const scenario of dialogInviteScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareDialogInviteScenario(sourceRoot, scenario)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario).map((item) =>
                  scenario === 'dialog-invite-invalid' && item.action === 'fill' && item.control.index === 3
                    ? { ...item, fillValue: 'jordan@example.com' }
                    : item,
                ))
              }
            }
            if (spec.id === 'hbar-app-ui-app-dialog-4') {
              const fill = discovered.find((item) => item.id === `${spec.id}:2:fill`)
              if (!fill) throw new Error('Workspace name field changed; re-observe the wizard feedback groups')
              discovered = discovered.map((item) => item.id === fill.id ? { ...item, fillValue: 'Acme Ops' } : item)
              for (const scenario of dialogWizardScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareDialogWizardScenario(sourceRoot, scenario)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario))
              }
            }
            if (spec.id === 'hbar-app-ui-app-dialog-5') {
              for (const scenario of dialogAlertScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareDialogAlertScenario(sourceRoot, scenario)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario))
              }
            }
            if (spec.id === 'hbar-app-ui-app-dialog-6') {
              if (!sampleIds || sampleIds.includes(`${spec.id}:evidence-body:scroll:end`))
                discovered.push(await observeDialogEvidenceScroll(sourceRoot, spec.id))
              if (!sampleIds || sampleIds.some((id) => id.startsWith(`${spec.id}:dialog-evidence-closed:`))) {
                await prepareDialogEvidenceClosed(sourceRoot)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, 'dialog-evidence-closed'))
              }
            }
            if (spec.id === 'hbar-app-ui-app-dialog-7') {
              if (!sampleIds || sampleIds.some((id) => id.startsWith(`${spec.id}:dialog-menu-delete-keyboard:`))) {
                await prepareDialogMenuScenario(sourceRoot, 'dialog-menu-delete-keyboard')
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, 'dialog-menu-delete-keyboard'))
              }
              if (!sampleIds || sampleIds.some((id) => id.startsWith(`${spec.id}:dialog-menu-export:`))) {
                await prepareDialogMenuScenario(sourceRoot, 'dialog-menu-export')
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, 'dialog-menu-export'))
              }
              if (!sampleIds || sampleIds.some((id) => id.startsWith(`${spec.id}:dialog-menu-closed:`))) {
                await prepareDialogMenuScenario(sourceRoot, 'dialog-menu-closed')
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, 'dialog-menu-closed'))
              }
            }
            if (spec.id === 'hbar-app-ui-app-shell-3') {
              discovered = [...contractsInteractionCases(sourceSnapshot, spec.id)]
              for (const scenario of contractsScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareContractsScenario(sourceRoot, scenario)
                discovered.push(
                  ...contractsInteractionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario),
                )
              }
            }
            if (spec.id === 'hbar-app-ui-agent-activity-5') {
              await prepareAgentLogScenario(discoveryPage, sourceRoot, 'away', true)
              discovered.push(...agentLogScenarioCases(await snapshotRoot(frame, sourceSelector), spec.id, 'away'))
              let runningFound = false
              for (let attempt = 0; attempt < 4 && !runningFound; attempt += 1) {
                const runningContext = await browser.newContext({ reducedMotion: 'reduce' })
                try {
                  const runningPage = await runningContext.newPage()
                  await runningPage.setViewportSize({ width: viewport.width, height: viewport.height })
                  const runningFrame = await loadRunningLogPreview(
                    runningPage,
                    referencePageUrl(reference, options),
                    theme,
                  )
                  const runningRoot = runningFrame.locator(sourceSelector).first()
                  await prepareAgentLogScenario(runningPage, runningRoot, 'running', true)
                  discovered.push(
                    ...agentLogScenarioCases(await snapshotRoot(runningFrame, sourceSelector), spec.id, 'running'),
                  )
                  runningFound = true
                } catch (error) {
                  if (attempt === 3) throw error
                } finally {
                  await runningContext.close()
                }
              }
            }
            if (spec.id === 'hbar-app-ui-agent-activity-7') {
              await prepareAgentFailureScenario(sourceRoot)
              discovered.push(...agentFailureScenarioCases(await snapshotRoot(frame, sourceSelector), spec.id))
            }
            if (spec.id === 'hbar-app-ui-agent-approval-1') {
              await prepareInlineApprovalScenario(sourceRoot)
              discovered.push(...inlineApprovalScenarioCases(await snapshotRoot(frame, sourceSelector), spec.id))
            }
            if (spec.id === 'hbar-app-ui-agent-approval-2') {
              await prepareDiffApprovalScenario(sourceRoot)
              discovered.push(...diffApprovalScenarioCases(await snapshotRoot(frame, sourceSelector), spec.id))
            }
            if (spec.id === 'hbar-app-ui-agent-approval-5') {
              await prepareInlineApprovalScenario(sourceRoot)
              const expanded = await snapshotRoot(frame, sourceSelector)
              if (!visibleControls(expanded).some((control) => control.tag === 'pre'))
                throw new Error('Missing focusable live cost request')
              discovered.push(...interactionCases(expanded, spec.id, 'cost-request-open'))
            }
            if (
              spec.id === 'hbar-app-ui-agent-plan-1' &&
              (!sampleIds || sampleIds.some((id) => id.includes(':plan-paused:')))
            ) {
              await sourceRoot.getByRole('button', { name: 'Stop', exact: true }).click()
              discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, 'plan-paused'))
            }
            if (
              spec.id === 'hbar-app-ui-agent-plan-3' &&
              (!sampleIds || sampleIds.some((id) => id.includes(':tree-shipping-open:')))
            ) {
              await preparePlanTreeScenario(sourceRoot)
              discovered.push(
                ...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, 'tree-shipping-open'),
              )
            }
            if (spec.id === 'hbar-app-ui-agent-plan-4') {
              discovered.push(await observePlanActualHover(sourceRoot, spec.id))
            }
            if (spec.id === 'hbar-app-ui-agent-plan-5') {
              discovered.push(...(await observePlanBoardScroll(sourceRoot, spec.id)))
            }
            if (spec.id === 'hbar-app-ui-agent-plan-6') {
              for (const scenario of planSummaryScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await preparePlanSummaryScenario(sourceRoot, scenario)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario))
              }
            }
            if (spec.id === 'hbar-app-ui-ai-usage-1') {
              for (const scenario of usageOverviewScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareUsageOverviewScenario(sourceRoot, scenario)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario))
              }
            }
            if (spec.id === 'hbar-app-ui-ai-usage-2') {
              if (!sampleIds || sampleIds.some((id) => id.includes(':usage-model-row:')))
                discovered.push(await observeModelSpendRow(sourceRoot, spec.id))
              if (!sampleIds || sampleIds.some((id) => id.includes(':usage-model-requests:'))) {
                await sourceRoot.getByRole('tab', { name: 'Requests', exact: true }).click()
                discovered.push(
                  ...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, 'usage-model-requests'),
                )
              }
            }
            if (
              spec.id === 'hbar-app-ui-ai-usage-3' &&
              (!sampleIds || sampleIds.some((id) => id.includes(':usage-limits-raised:')))
            ) {
              await sourceRoot.getByRole('tab', { name: 'Tier 2', exact: true }).click()
              discovered.push(
                ...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, 'usage-limits-raised'),
              )
            }
            if (spec.id === 'hbar-app-ui-ai-usage-4') {
              for (const scenario of usageMemberScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareUsageMemberScenario(sourceRoot, scenario)
                discovered.push(
                  ...usageMemberScenarioCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario),
                )
              }
            }
            if (spec.id === 'hbar-app-ui-agent-plan-2') {
              for (const scenario of ['plan-draft', 'plan-running'] as const) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await preparePlanReviewScenario(sourceRoot, scenario)
                discovered.push(
                  ...planReviewScenarioCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario),
                )
              }
            }
            if (spec.id === 'hbar-app-ui-agent-approval-6') {
              for (const scenario of ['history-match', 'history-empty'] as const) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                await prepareHistoryScenario(sourceRoot, scenario)
                discovered.push(...interactionCases(await snapshotRoot(frame, sourceSelector), spec.id, scenario))
              }
            }
            if (spec.id === 'hbar-app-ui-agent-approval-3') {
              for (const plan of queueApprovalScenarioPlans) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${plan.id}:`))) continue
                const context = await browser.newContext({ reducedMotion: 'reduce' })
                try {
                  const page = await context.newPage()
                  await page.setViewportSize({ width: viewport.width, height: viewport.height })
                  const scenarioFrame = await loadReferencePreview(page, referencePageUrl(reference, options), theme)
                  await alignReferenceInteractionCanvas(page, scenarioFrame, referenceCanvas)
                  const root = scenarioFrame.locator(sourceSelector).first()
                  await prepareQueueApprovalScenario(root, plan)
                  discovered.push(
                    ...queueApprovalScenarioCases(await snapshotRoot(scenarioFrame, sourceSelector), spec.id, plan),
                  )
                } finally {
                  await context.close()
                }
              }
            }
            if (spec.id === 'hbar-app-ui-agent-approval-4') {
              for (const scenario of permissionApprovalScenarios) {
                if (sampleIds && !sampleIds.some((id) => id.startsWith(`${spec.id}:${scenario}:`))) continue
                const context = await browser.newContext({ reducedMotion: 'reduce' })
                try {
                  const page = await context.newPage()
                  await page.setViewportSize({ width: viewport.width, height: viewport.height })
                  const scenarioFrame = await loadReferencePreview(page, referencePageUrl(reference, options), theme)
                  await alignReferenceInteractionCanvas(page, scenarioFrame, referenceCanvas)
                  const root = scenarioFrame.locator(sourceSelector).first()
                  await preparePermissionApprovalScenario(root, scenario)
                  discovered.push(
                    ...permissionApprovalScenarioCases(
                      await snapshotRoot(scenarioFrame, sourceSelector),
                      spec.id,
                      scenario,
                    ),
                  )
                } finally {
                  await context.close()
                }
              }
            }
            // Keep the complete live discovery, even for a development-only
            // case filter. A successful probe is not a full interaction audit.
            await writeJson(join(options.outputRoot, 'interaction-inventory', spec.id, theme, `${viewport.id}.json`), {
              generatedAt: new Date().toISOString(),
              referenceUrl: referencePageUrl(reference, options),
              interactionProtocolVersion,
              referenceCanvas,
              cases: discovered,
            })
            const planned = sampleIds ? selectInteractionCases(discovered, sampleIds) : discovered
            const cases = options.cases.length > 0 ? selectInteractionCases(planned, options.cases) : planned
            let caseCursor = 0
            const actionWorker = async () => {
              while (caseCursor < cases.length) {
                const interaction = cases[caseCursor]
                caseCursor += 1
                if (!interaction) continue
                const sourceDirectory = interactionDirectory(
                  options.outputRoot,
                  'source',
                  reference.id,
                  theme,
                  viewport,
                  interaction,
                )
                const localDirectory = interactionDirectory(
                  options.outputRoot,
                  'local',
                  spec.id,
                  theme,
                  viewport,
                  interaction,
                )
                const caseHash = stableHash({ runHash, interaction, referenceCanvas, sourceHash: reference.sourceHash })
                const comparisonPath = join(dirname(sourceDirectory), 'comparison.json')
                const cached = await completedInteractionCheckpoint(comparisonPath, {
                  variantId: spec.id,
                  id: interaction.id,
                  theme,
                  viewport: viewport.id,
                  caseHash,
                })
                if (cached) {
                  results.push(cached)
                  resumed += 1
                  continue
                }
                // The source and local action each need their own context: source clock control must not freeze local timers.
                const sourceContext = await browser.newContext({ reducedMotion: 'reduce' })
                const localContext = await browser.newContext({ reducedMotion: 'reduce' })
                let source: InteractionCapture
                let local: InteractionCapture
                try {
                  const sourcePage = await sourceContext.newPage()
                  const localPage = await localContext.newPage()
                  const captureSourceWithRetry = async (): Promise<InteractionCapture> => {
                    let lastError: unknown
                    const attempts = interaction.scenario === 'running' ? 8 : 3
                    for (let attempt = 0; attempt < attempts; attempt += 1) {
                      const retryContext =
                        attempt === 0 ? sourceContext : await browser.newContext({ reducedMotion: 'reduce' })
                      try {
                        const candidatePage = attempt === 0 ? sourcePage : await retryContext.newPage()
                        const capture = await replayReferenceInteraction(
                          candidatePage,
                          reference,
                          options,
                          theme,
                          viewport,
                          referenceCanvas,
                          interaction,
                          options.outputRoot,
                        )
                        if (interaction.scenario !== 'running' || capture.status === 'captured') return capture
                        lastError = new Error(capture.reason ?? capture.status)
                      } catch (error) {
                        lastError = error
                      } finally {
                        if (attempt > 0) await retryContext.close()
                      }
                    }
                    return errorInteractionCapture(interaction.id, sourceDirectory, lastError)
                  }
                  const captureLocal = async (rows?: number): Promise<InteractionCapture> => {
                    let lastError: unknown
                    for (let attempt = 0; attempt < 2; attempt += 1) {
                      const retryContext =
                        attempt === 0 ? localContext : await browser.newContext({ reducedMotion: 'reduce' })
                      try {
                        const candidatePage = attempt === 0 ? localPage : await retryContext.newPage()
                        return await replayInteraction(
                          candidatePage,
                          spec,
                          theme,
                          viewport,
                          referenceCanvas,
                          interaction,
                          options.outputRoot,
                          rows,
                        )
                      } catch (error) {
                        lastError = error
                      } finally {
                        if (attempt > 0) await retryContext.close()
                      }
                    }
                    return errorInteractionCapture(interaction.id, localDirectory, lastError)
                  }
                  if (interaction.scenario === 'running') {
                    source = await captureSourceWithRetry()
                    local = await captureLocal(source.checkpointRows)
                  } else {
                    ;[source, local] = await Promise.all([captureSourceWithRetry(), captureLocal()])
                  }
                } finally {
                  await Promise.all([sourceContext.close(), localContext.close()])
                }
                const sourceDelta = await interactionDelta(source, interaction)
                const localDelta = await interactionDelta(local, interaction)
                const status =
                  source.status === 'error' || local.status === 'error'
                    ? 'error'
                    : local.status === 'missing'
                      ? 'missing'
                      : sourceDelta?.changed === false && localDelta?.changed === false
                        ? 'source-no-op'
                        : sourceDelta?.signature === localDelta?.signature
                          ? 'matched'
                          : 'lumen-different'
                const result = {
                  variantId: spec.id,
                  id: interaction.id,
                  action: interaction.action,
                  capability: interaction.action,
                  caseHash,
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
                await writeJson(comparisonPath, result)
                results.push(result)
              }
            }
            const actionConcurrency = interactionWorkersPerVariant(options.workers, selected.length)
            await Promise.all(Array.from({ length: Math.min(actionConcurrency, cases.length) }, () => actionWorker()))
          }
        }
      }
    } finally {
      await discoveryContext.close()
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(options.workers, selected.length) }, () => worker()))
  } finally {
    server?.kill()
  }
  const discoveredCases = new Set(results.map((result) => result.id))
  const missingRequested = options.cases.filter((id) => !discoveredCases.has(id))
  if (missingRequested.length > 0)
    throw new Error(`Requested interaction cases not found: ${missingRequested.join(', ')}`)
  await writeJson(join(options.outputRoot, 'interaction-report.json'), {
    schemaVersion: 1,
    interactionProtocolVersion,
    generatedAt: new Date().toISOString(),
    selected: selected.map((spec) => spec.id),
    viewports: options.viewports,
    themes: options.themes,
    coverage:
      options.cases.length > 0
        ? 'selected-cases'
        : options.exhaustive
          ? 'all-visible-controls'
          : 'representative-states',
    samplingPlanHash,
    runHash,
    sourceDirectoryHash: inventory.sourceDirectoryHash,
    localSpecHash: stableHash(selected),
    implementationHash,
    localPreviewUrl,
    browserArguments,
    staticCanvasHash: stableHash([...staticCanvases]),
    discovered: results.length,
    resumed,
    results: results.sort((a, b) =>
      `${a.variantId}/${a.theme}/${a.viewport}/${a.id}`.localeCompare(
        `${b.variantId}/${b.theme}/${b.viewport}/${b.id}`,
      ),
    ),
  })
  console.log(
    JSON.stringify({
      command: 'interactions',
      variants: selected.length,
      cases: results.length,
      resumed,
      outputRoot: options.outputRoot,
    }),
  )
}

async function runCompare(options: AuditOptions): Promise<void> {
  const capturePath = join(options.outputRoot, 'capture-manifest.json')
  if (!(await Bun.file(capturePath).exists())) throw new Error(`Missing capture manifest: ${capturePath}`)
  const manifest = await readJson<{
    captureProtocolVersion?: number
    records: readonly CaptureRecord[]
    selected: readonly string[]
    viewports: readonly AuditViewport[]
    themes: readonly AuditTheme[]
    sourceDirectoryHash: string
    implementationHash?: string
  }>(capturePath)
  if (manifest.captureProtocolVersion !== captureProtocolVersion)
    throw new Error(`Static captures use an obsolete canvas protocol; recapture the live iframe: ${capturePath}`)
  const comparisons: StructureComparison[] = []
  const expectedInteractions = new Map<string, string[]>()
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
    const sourceVisibleControls = visibleControls(sourceSnapshot)
    const localVisibleControls = visibleControls(localSnapshotValue)
    const expected = expectedInteractions.get(record.id) ?? []
    if (!options.exhaustive) {
      expected.push(
        ...sampledInteractionIds(record.id, record.viewport, record.theme).map(
          (id) => `${record.theme}/${record.viewport}/${id}`,
        ),
      )
    } else {
      expected.push(
        ...interactionCases(sourceSnapshot, record.id).map(
          (interaction) => `${record.theme}/${record.viewport}/${interaction.id}`,
        ),
      )
      if (record.id === 'hbar-app-ui-agent-activity-5')
        expected.push(...agentLogDynamicCaseIds(record.id).map((id) => `${record.theme}/${record.viewport}/${id}`))
      if (record.id === 'hbar-app-ui-agent-activity-7')
        expected.push(...agentFailureDynamicCaseIds(record.id).map((id) => `${record.theme}/${record.viewport}/${id}`))
      if (record.id === 'hbar-app-ui-agent-approval-1')
        expected.push(
          ...inlineApprovalDynamicCaseIds(record.id).map((id) => `${record.theme}/${record.viewport}/${id}`),
        )
      if (record.id === 'hbar-app-ui-agent-approval-2')
        expected.push(...diffApprovalDynamicCaseIds(record.id).map((id) => `${record.theme}/${record.viewport}/${id}`))
      if (record.id === 'hbar-app-ui-agent-approval-3')
        expected.push(...queueApprovalDynamicCaseIds(record.id).map((id) => `${record.theme}/${record.viewport}/${id}`))
    }
    expectedInteractions.set(record.id, expected)
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
        rootGeometryMatched: rootGeometryMatches(sourceSnapshot.rootRect, localSnapshotValue.rootRect),
        sourceControls: sourceVisibleControls.length,
        localControls: localVisibleControls.length,
        sourceTextLength: sourceSnapshot.bodyTextLength,
        localTextLength: localSnapshotValue.bodyTextLength,
        sourceTextLineCount: sourceSnapshot.textLineCount,
        localTextLineCount: localSnapshotValue.textLineCount,
        sourceTruncatedTextCount: sourceSnapshot.truncatedTextCount,
        localTruncatedTextCount: localSnapshotValue.truncatedTextCount,
        sourceAxSnapshot: sourceSnapshot.axSnapshot,
        localAxSnapshot: localSnapshotValue.axSnapshot,
        sourceSemanticRoles: semanticRoleTree(sourceSnapshot.axSnapshot),
        localSemanticRoles: semanticRoleTree(localSnapshotValue.axSnapshot),
        semanticRoleTreeMatched: semanticRoleTreeMatches(sourceSnapshot.axSnapshot, localSnapshotValue.axSnapshot),
        sourceTreeNodes: sourceSnapshot.tree.length,
        localTreeNodes: localSnapshotValue.tree.length,
        sourceTreeTags: sourceSnapshot.tree.map((node) => node.tag),
        localTreeTags: localSnapshotValue.tree.map((node) => node.tag),
        sourceOverflow: sourceSnapshot.horizontalOverflow,
        localOverflow: localSnapshotValue.horizontalOverflow,
        errors: [...record.errors, ...localRecord.errors],
        controlShapeMatched: sourceVisibleControls.every((control, index) => {
          const localControl = localVisibleControls[index]
          return (
            localControl?.tag === control.tag &&
            localControl.role === control.role &&
            localControl.type === control.type
          )
        }),
        controlCountMatched: sourceVisibleControls.length === localVisibleControls.length,
        controlStateMatched: sourceVisibleControls.every((control, index) => {
          const localControl = localVisibleControls[index]
          return (
            localControl?.disabled === control.disabled &&
            localControl.expanded === control.expanded &&
            localControl.pressed === control.pressed &&
            localControl.selected === control.selected
          )
        }),
        labelAssociationsMatched: sourceVisibleControls.every(
          (control, index) => Boolean(control.labelFor) === Boolean(localVisibleControls[index]?.labelFor),
        ),
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
      if (!comparison.structure.semanticRoleTreeMatched) failures.push('semantic-role-tree-mismatch')
      if (!comparison.structure.rootGeometryMatched) failures.push('root-geometry-mismatch')
      if (!comparison.structure.controlStateMatched) failures.push('control-state-mismatch')
      if (!comparison.structure.labelAssociationsMatched) failures.push('label-association-mismatch')
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
  const visualReport = await readJson<{
    interactionPairs: readonly {
      id: string
      theme: string
      viewport: string
      case: string
      feedback: Readonly<{
        sourceChangedPixelRatio: number
        localChangedPixelRatio: number
        sourceControlChangedPixelRatio?: number | null
        localControlChangedPixelRatio?: number | null
      }>
    }[]
  }>(join(options.outputRoot, 'visual-report.json'))
  const visualInteractions = new Map(
    visualReport.interactionPairs.map((pair) => [`${pair.id}/${pair.theme}/${pair.viewport}/${pair.case}`, pair]),
  )
  const inventory = await readJson<ReactBitsProInventory>(inventoryPath(options))
  const interactionPath = join(options.outputRoot, 'interaction-report.json')
  const interactionReport = (await Bun.file(interactionPath).exists())
    ? await readJson<{
        selected?: readonly string[]
        viewports?: readonly AuditViewport[]
        themes?: readonly AuditTheme[]
        coverage?: string
        interactionProtocolVersion?: number
        sourceDirectoryHash?: string
        localSpecHash?: string
        implementationHash?: string
        samplingPlanHash?: string | null
        staticCanvasHash?: string
        results: readonly InteractionReportRow[]
      }>(interactionPath)
    : { results: [] }
  const selectedIds = [...new Set(manifest.records.map((record) => record.id))]
  const currentImplementationHash = await localImplementationHash(manifest.selected)
  const captureCanvases = new Map(
    manifest.records
      .filter((record) => record.kind === 'source' && record.referenceCanvas)
      .map((record) => [`${record.id}/${record.theme}/${record.viewport}`, record.referenceCanvas!]),
  )
  const matrixComplete =
    interactionReport.interactionProtocolVersion === interactionProtocolVersion &&
    interactionReport.coverage === (options.exhaustive ? 'all-visible-controls' : 'representative-states') &&
    (options.exhaustive ||
      interactionReport.samplingPlanHash ===
        stableHash(manifest.selected.map((id) => ({ id, plan: auditSamplingPlan(id) })))) &&
    interactionReport.sourceDirectoryHash === manifest.sourceDirectoryHash &&
    interactionReport.localSpecHash ===
      stableHash(HBAR_APP_UI_VARIANT_SPECS.filter((spec) => manifest.selected.includes(spec.id))) &&
    interactionReport.implementationHash === manifest.implementationHash &&
    interactionReport.staticCanvasHash === stableHash([...captureCanvases]) &&
    manifest.implementationHash === currentImplementationHash &&
    JSON.stringify([...(interactionReport.selected ?? [])].sort()) === JSON.stringify([...manifest.selected].sort()) &&
    JSON.stringify(interactionReport.viewports) === JSON.stringify(manifest.viewports) &&
    JSON.stringify(interactionReport.themes) === JSON.stringify(manifest.themes)
  const manualReviewPath = join(options.outputRoot, 'manual-review.json')
  const manualReviews = (await Bun.file(manualReviewPath).exists())
    ? await readJson<ManualReviewFile>(manualReviewPath)
    : undefined
  const ledger = await Promise.all(
    selectedIds.map(async (id) => {
      const staticRows = comparisons.filter((comparison) => comparison.id === id)
      const interactionRows = interactionReport.results.filter((result) => result.variantId === id)
      const failures = structuralFailures.filter((failure) => failure.id === id).map((failure) => failure.reason)
      if (manifest.implementationHash !== currentImplementationHash) failures.push('stale-local-implementation')
      if (!fullAuditMatrixSelected(manifest.viewports, manifest.themes)) failures.push('full-audit-matrix-incomplete')
      if (staticRows.length !== manifest.viewports.length * manifest.themes.length)
        failures.push(`static-combinations-incomplete:${staticRows.length}`)
      const interactionFailures = interactionRows
        .filter((result) => result.status !== 'matched' && result.status !== 'source-no-op')
        .map((result) => `${result.id}:${result.status}`)
      for (const result of interactionRows) {
        const pair = visualInteractions.get(
          `${id}/${result.theme}/${result.viewport}/${result.id.replaceAll(':', '_')}`,
        )
        if (!pair) interactionFailures.push(`${result.id}:feedback-screenshots-missing`)
        else if (
          !interactionFeedbackMatches(
            id === 'hbar-app-ui-agent-activity-3'
              ? (pair.feedback.sourceControlChangedPixelRatio ?? Number.NaN)
              : pair.feedback.sourceChangedPixelRatio,
            id === 'hbar-app-ui-agent-activity-3'
              ? (pair.feedback.localControlChangedPixelRatio ?? Number.NaN)
              : pair.feedback.localChangedPixelRatio,
          )
        )
          interactionFailures.push(`${result.id}:visual-feedback-mismatch`)
      }
      const coverage = assessInteractionCoverage(expectedInteractions.get(id) ?? [], interactionRows)
      if (!matrixComplete) interactionFailures.push('interaction-matrix-incomplete')
      if (coverage.missing.length > 0) interactionFailures.push(`interaction-cases-missing:${coverage.missing.length}`)
      if (coverage.duplicate.length > 0)
        interactionFailures.push(`interaction-cases-duplicate:${coverage.duplicate.length}`)
      if (coverage.unexpected.length > 0)
        interactionFailures.push(`interaction-cases-unexpected:${coverage.unexpected.length}`)
      const machineFailures = [...failures, ...interactionFailures]
      const fingerprint =
        machineFailures.length === 0
          ? await manualReviewFingerprint(id, manifest, interactionReport.results, visualReport.interactionPairs)
          : ''
      const gate = manualReviewGate(
        machineFailures,
        fingerprint,
        manualReviews?.schemaVersion === 1 ? manualReviews.entries[id] : undefined,
        staticRows.length,
        interactionRows.length,
      )
      return {
        id,
        category: inventory.variants.find((variant) => variant.id === id)?.category ?? 'unknown',
        staticCombinations: staticRows.length,
        interactionCases: interactionRows.length,
        expectedInteractionCases: expectedInteractions.get(id)?.length ?? 0,
        interactionCoverage: options.exhaustive ? 'exhaustive' : 'representative-states',
        inferredCoverage: options.exhaustive ? [] : (auditSamplingPlan(id)?.inferences ?? []),
        missingInteractionCases: coverage.missing.length,
        status: gate.status,
        failures: gate.reason ? [...machineFailures, gate.reason] : machineFailures,
        manualReview: gate.manualReview,
        lastVerified: new Date().toISOString(),
      }
    }),
  )
  await writeJson(join(options.outputRoot, 'review-ledger.json'), {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    categories: inventory.categories,
    variants: ledger,
    summary: {
      variants: ledger.length,
      passed: ledger.filter((entry) => entry.status === 'passed').length,
      needsFix: ledger.filter((entry) => entry.status === 'needs-fix').length,
      needsReview: ledger.filter((entry) => entry.status === 'needs-review').length,
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
  const evidencePath = (path: string | null | undefined): string | null => {
    if (!path) return null
    const local = relative(options.outputRoot, path)
    const parts = local.split(/[\\/]/)
    if (isAbsolute(local) || parts.includes('..')) return null
    return parts.map(encodeURIComponent).join('/')
  }
  await writeFile(
    join(options.outputRoot, 'evidence.html'),
    renderAuditEvidencePage(
      [
        ...comparisons.map((comparison) => ({
          label: `${comparison.id} / ${comparison.theme} / ${comparison.viewport} / static`,
          status: 'Static source/local pair',
          images: [
            { label: 'React Bits Pro — original', path: evidencePath(comparison.source.screenshot) },
            { label: 'Lumen — local', path: evidencePath(comparison.local.screenshot) },
          ],
        })),
        ...interactionReport.results.map((result) => ({
          label: `${result.variantId ?? ''} / ${result.theme} / ${result.viewport} / ${result.id}`,
          status: result.status ?? 'unknown',
          images: [
            { label: 'React Bits Pro — before', path: evidencePath(result.source?.before) },
            { label: 'Lumen — before', path: evidencePath(result.local?.before) },
            { label: 'React Bits Pro — after', path: evidencePath(result.source?.after) },
            { label: 'Lumen — after', path: evidencePath(result.local?.after) },
          ],
        })),
      ],
      options.exhaustive ? 'exhaustive' : 'representative-states',
    ),
    'utf8',
  )
  await writeFile(
    join(options.outputRoot, 'report.html'),
    `<!doctype html><meta charset="utf-8"><title>React Bits Pro visual audit</title><style>body{font:14px system-ui;margin:2rem;background:#111;color:#eee}a{color:#acd7ff}table{border-collapse:collapse;width:100%}td,th{border:1px solid #555;padding:.4rem;text-align:left}td:nth-child(5){font-weight:700}</style><h1>React Bits Pro ↔ lumen-app-ui audit</h1><p>${ledger.length} variants · ${comparisons.length} static pairs · ${interactionReport.results.length} interaction cases · <a href="evidence.html">Open paired screenshot evidence</a></p><table><thead><tr><th>Category</th><th>Variant</th><th>Static</th><th>Interactions</th><th>Status</th><th>Failures</th></tr></thead><tbody>${reportRows}</tbody></table>`,
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
  const ledgerFailures = ledger.flatMap((entry) => entry.failures.map((failure) => `${entry.id}:${failure}`))
  if (options.strict && (structuralFailures.length > 0 || ledgerFailures.length > 0)) {
    throw new Error(
      `React Bits audit failed: ${JSON.stringify([...structuralFailures, ...ledgerFailures].slice(0, 20))}`,
    )
  }
  console.log(JSON.stringify({ command: 'compare', comparisons: comparisons.length, outputRoot: options.outputRoot }))
}

async function runManualReview(options: AuditOptions): Promise<void> {
  const note = options.reviewNote?.trim()
  if (!note || note.length < 12) throw new Error('Manual review requires a specific --note of at least 12 characters')
  if (options.variants.length !== 1) throw new Error('Manual review requires exactly one --variants ID per sign-off')
  const [spec] = selectedLocalSpecs(options)
  if (!spec) throw new Error(`Unknown variant for manual review: ${options.variants[0]}`)
  await runCompare(options)
  const ledger = await readJson<{
    variants: readonly {
      id: string
      status: string
      failures: readonly string[]
      staticCombinations: number
      interactionCases: number
      expectedInteractionCases: number
    }[]
  }>(join(options.outputRoot, 'review-ledger.json'))
  const entry = ledger.variants.find((candidate) => candidate.id === spec.id)
  if (
    !entry ||
    (entry.status !== 'needs-review' && entry.status !== 'passed') ||
    entry.failures.some((failure) => failure !== 'manual-review-required' && failure !== 'manual-review-stale') ||
    entry.staticCombinations !== REACTBITS_PRO_VIEWPORTS.length * REACTBITS_PRO_THEMES.length ||
    entry.interactionCases !== entry.expectedInteractionCases
  )
    throw new Error(`Complete machine-passed evidence is required before manual review: ${spec.id}`)
  const manifest = await readJson<{
    sourceDirectoryHash: string
    implementationHash?: string
    records: readonly CaptureRecord[]
  }>(join(options.outputRoot, 'capture-manifest.json'))
  const interactionReport = await readJson<{ results: readonly InteractionReportRow[] }>(
    join(options.outputRoot, 'interaction-report.json'),
  )
  const visualReport = await readJson<{ interactionPairs: readonly unknown[] }>(
    join(options.outputRoot, 'visual-report.json'),
  )
  const reviewPath = join(options.outputRoot, 'manual-review.json')
  const existing = (await Bun.file(reviewPath).exists())
    ? await readJson<ManualReviewFile>(reviewPath)
    : { schemaVersion: 1 as const, entries: {} }
  if (existing.schemaVersion !== 1) throw new Error(`Unknown manual review schema: ${reviewPath}`)
  await writeJson(reviewPath, {
    schemaVersion: 1,
    entries: {
      ...existing.entries,
      [spec.id]: {
        fingerprint: await manualReviewFingerprint(
          spec.id,
          manifest,
          interactionReport.results,
          visualReport.interactionPairs,
        ),
        reviewedAt: new Date().toISOString(),
        note,
        staticCombinations: entry.staticCombinations,
        interactionCases: entry.interactionCases,
      },
    },
  })
  await runCompare(options)
  const signed = await readJson<{ variants: readonly { id: string; status: string; manualReview: boolean }[] }>(
    join(options.outputRoot, 'review-ledger.json'),
  )
  if (
    !signed.variants.some(
      (candidate) => candidate.id === spec.id && candidate.status === 'passed' && candidate.manualReview,
    )
  )
    throw new Error(`Manual sign-off did not validate: ${spec.id}`)
  console.log(JSON.stringify({ command: 'review', variant: spec.id, outputRoot: options.outputRoot }))
}

async function main(): Promise<void> {
  const options = parseOptions()
  await ensureDirectory(options.outputRoot)
  if (options.command === 'compare') {
    await runCompare(options)
    return
  }
  if (options.command === 'review') {
    await runManualReview(options)
    return
  }
  const browser = await chromium.launch({ headless: true, executablePath, args: browserArguments })
  try {
    if (options.command === 'discover') {
      const inventory = options.offline
        ? await loadOrDiscoverInventory(browser, options)
        : await discoverReferenceInventory(browser, options)
      await writeLocalInventory(options.outputRoot)
      if (!options.offline) await writeJson(join(options.outputRoot, 'reference-access.json'), {
        status: 'available', url: inventory.sourceUrl, checkedAt: new Date().toISOString(),
      })
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
    if (options.command === 'audit') await runCompare(options)
    if (!options.offline && !options.localOnly) await writeJson(join(options.outputRoot, 'reference-access.json'), {
      status: 'available', url: inventory.sourceUrl, checkedAt: new Date().toISOString(),
    })
  } catch (error) {
    if (error instanceof ReferenceAccessBlockedError) {
      await writeJson(join(options.outputRoot, 'reference-access.json'), {
        status: 'blocked',
        url: error.url,
        sourceStatus: error.sourceStatus,
        pageTitle: error.pageTitle,
        reason: error.reason,
        checkedAt: new Date().toISOString(),
      })
    }
    throw error
  } finally {
    await browser.close()
  }
}

if (import.meta.main) await main()
