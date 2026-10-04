import type { ComponentType, ReactNode } from 'react'

export const HBAR_APP_UI_CATEGORIES = [
  'ai-chat',
  'prompt-input',
  'agent-activity',
  'tool-calls',
  'agent-approval',
  'agent-plan',
  'ai-usage',
  'app-shell',
  'app-sidebar',
  'command-menu',
  'navbar',
  'mobile',
  'card',
  'data-table',
  'dashboard',
  'analytics',
  'list',
  'filtering',
  'file-manager',
  'monitoring',
  'empty-state',
  'settings-form',
  'forms',
  'app-dialog',
  'notifications',
  'onboarding',
  'paywall',
  'authentication',
  'kanban',
  'wizard',
  'comments',
  'scheduling',
  'integrations',
  'editor',
  'feedback',
  'support',
  'billing',
  'chat',
] as const

export type HbarAppUiCategory = (typeof HBAR_APP_UI_CATEGORIES)[number]

export const HBAR_APP_UI_CATEGORY_COUNTS: Readonly<Record<HbarAppUiCategory, number>> = {
  'ai-chat': 9,
  'prompt-input': 7,
  'agent-activity': 7,
  'tool-calls': 6,
  'agent-approval': 6,
  'agent-plan': 6,
  'ai-usage': 8,
  'app-shell': 9,
  'app-sidebar': 7,
  'command-menu': 6,
  navbar: 14,
  mobile: 5,
  card: 11,
  'data-table': 8,
  dashboard: 14,
  analytics: 16,
  list: 12,
  filtering: 9,
  'file-manager': 4,
  monitoring: 10,
  'empty-state': 5,
  'settings-form': 6,
  forms: 12,
  'app-dialog': 7,
  notifications: 6,
  onboarding: 7,
  paywall: 7,
  authentication: 14,
  kanban: 6,
  wizard: 7,
  comments: 6,
  scheduling: 7,
  integrations: 6,
  editor: 5,
  feedback: 6,
  support: 5,
  billing: 8,
  chat: 6,
}

export interface HbarAppUiAction {
  readonly id: string
  readonly label: string
  readonly tone?: 'neutral' | 'accent' | 'positive' | 'warning' | 'danger'
}

export type HbarAppUiProfileSurface =
  'stream' | 'panel' | 'rail' | 'split' | 'grid' | 'table' | 'form' | 'overlay' | 'timeline' | 'calendar'
export type HbarAppUiProfileState = 'idle' | 'active' | 'success' | 'warning' | 'error' | 'empty' | 'review'
export type HbarAppUiProfileControl =
  | 'search'
  | 'filter'
  | 'tabs'
  | 'picker'
  | 'attachments'
  | 'upload'
  | 'retry'
  | 'save'
  | 'confirm'
  | 'sort'
  | 'pagination'
  | 'drag'
  | 'expand'
  | 'compose'

/**
 * Stable, variant-level presentation data.  A profile is deliberately part of
 * the public contract so a registered entry cannot silently collapse into a
 * category-only template.  It contains no product state or transport handles.
 */
export interface HbarAppUiVariantProfile {
  readonly key: string
  readonly scenario: string
  readonly surface: HbarAppUiProfileSurface
  readonly initialState: HbarAppUiProfileState
  readonly visualMode: 'dense' | 'balanced' | 'airy' | 'focus' | 'split' | 'stack'
  readonly seed: number
  readonly controls: readonly HbarAppUiProfileControl[]
  readonly itemCount: number
}

export interface HbarAppUiVariantSpec {
  readonly id: string
  readonly entry: string
  readonly category: HbarAppUiCategory
  readonly variant: number
  readonly title: string
  readonly description: string
  readonly layout: 'conversation' | 'composer' | 'activity' | 'table' | 'dashboard' | 'form' | 'overlay' | 'workflow'
  readonly actions: readonly HbarAppUiAction[]
  readonly behavior: readonly string[]
  readonly observation: readonly string[]
  readonly visualValidation: readonly string[]
  readonly density: 'compact' | 'comfortable' | 'spacious'
  readonly profile: HbarAppUiVariantProfile
}

export interface HbarAppUiEvent {
  readonly variantId: string
  readonly actionId: string
  readonly value?: string
}

export interface HbarAppUiVariantReference {
  readonly id: string
  readonly sourceId: string
  readonly category: HbarAppUiCategory
  readonly variant: number
  readonly url: string
  readonly title: string
  readonly description: string
  readonly sourceStatus?: number | undefined
  readonly sourceHash?: string | undefined
}

export type HbarAppUiInteractionCapability =
  | 'click'
  | 'hover'
  | 'focus'
  | 'press'
  | 'fill'
  | 'select'
  | 'toggle'
  | 'expand'
  | 'menu'
  | 'tab'
  | 'drag'
  | 'scroll'
  | 'upload'
  | 'download'
  | 'no-op'

export type HbarAppUiAuditStatus =
  'matched' | 'lumen-different' | 'missing' | 'source-no-op' | 'blocked' | 'not-applicable' | 'error'

/** Normalized consumer summary; detailed runner records use HbarAppUiInteractionRecord. */
export interface HbarAppUiInteractionResult<State extends object = Readonly<Record<string, unknown>>> {
  readonly id: string
  readonly variantId: string
  readonly capability: HbarAppUiInteractionCapability
  readonly status: HbarAppUiAuditStatus
  readonly before: State
  readonly after: State
  readonly sourceScreenshot?: string | undefined
  readonly lumenScreenshot?: string | undefined
  readonly comparison?: Readonly<Record<string, unknown>> | undefined
  readonly reason?: string | undefined
}

export interface HbarAppUiAuditIssue {
  readonly id: string
  readonly theme: string
  readonly viewport: string
  readonly reason: string
}

/** Paths refer to the separate PNG and typed DOM/AX snapshot artifacts, not embedded image data. */
export interface HbarAppUiInteractionCapture {
  readonly id: string
  readonly status: 'captured' | 'missing' | 'error'
  readonly directory: string
  readonly before: string
  readonly after: string | null
  readonly beforeSnapshot: string
  readonly afterSnapshot: string | null
  readonly checkpointRows?: number | undefined
  readonly reason?: string | undefined
}

export interface HbarAppUiInteractionDelta {
  readonly changed: boolean
  readonly signature: string
}

export interface HbarAppUiInteractionFeedback {
  readonly sourceChanged: boolean
  readonly localChanged: boolean
  readonly deltaMatched: boolean
  readonly sourceDelta: HbarAppUiInteractionDelta | null
  readonly localDelta: HbarAppUiInteractionDelta | null
}

/** Actual comparison.json / interaction-report.json row; Control retains its typed DOM/ARIA shape. */
export interface HbarAppUiInteractionRecord<Control extends object = Readonly<Record<string, unknown>>> {
  readonly id: string
  readonly variantId: string
  readonly action: HbarAppUiInteractionCapability
  readonly capability: HbarAppUiInteractionCapability
  readonly viewport: string
  readonly theme: string
  readonly caseHash?: string | undefined
  readonly control: Control
  readonly source: HbarAppUiInteractionCapture
  readonly local: HbarAppUiInteractionCapture
  readonly status: HbarAppUiAuditStatus
  readonly feedback: HbarAppUiInteractionFeedback
}

/** Summary manifest. Discovery, captures, structure, visual metrics and reviews remain separate reports. */
export interface HbarAppUiAuditManifest {
  readonly schemaVersion: number
  readonly runId: string
  readonly reference: Readonly<{
    readonly url: string
    readonly generatedAt: string
    readonly sourceDirectoryHash: string
  }>
  readonly categories: readonly string[]
  readonly variants: readonly HbarAppUiVariantReference[]
  readonly viewports: readonly Readonly<{ readonly id: string; readonly width: number; readonly height: number }>[]
  readonly themes: readonly string[]
  readonly staticCombinations: number
  readonly interactionCases: number
  /** Strings are retained for older consumers; current runner errors are structured issues. */
  readonly errors: readonly (string | HbarAppUiAuditIssue)[]
  /** variants is the discovered directory; selected is the actual run subset. */
  readonly selected?: readonly string[] | undefined
  readonly generatedAt?: string | undefined
  readonly sourceUrl?: string | undefined
  readonly sourceDirectoryHash?: string | undefined
  readonly implementationHash?: string | undefined
}

export interface HbarAppUiVariantProps {
  readonly spec: HbarAppUiVariantSpec
  readonly onAction?: ((event: HbarAppUiEvent) => void) | undefined
  readonly className?: string | undefined
}

export type HbarAppUiVariantComponentProps = Omit<HbarAppUiVariantProps, 'spec'> & {
  readonly spec?: HbarAppUiVariantSpec
}
export type HbarAppUiVariantComponent = ComponentType<HbarAppUiVariantComponentProps>

export interface HbarAppUiRegistryEntry {
  readonly spec: HbarAppUiVariantSpec
  readonly component: HbarAppUiVariantComponent
}

export interface HbarAppUiMetric {
  readonly label: string
  readonly value: string
  readonly detail?: string
  readonly tone?: 'neutral' | 'positive' | 'warning' | 'negative'
}

export interface HbarAppUiTimelineStep {
  readonly id: string
  readonly label: string
  readonly detail?: string
  readonly status: 'pending' | 'active' | 'complete' | 'failed'
}

export interface HbarAppUiDataRow {
  readonly id: string
  readonly name: string
  readonly status: string
  readonly value: string
  readonly detail: string
}

export type {
  HbarAppUiRunActivityStatus,
  HbarAppUiRunActivityItem,
  HbarAppUiRunActivityLabels,
  HbarAppUiRunActivityProps,
  HbarAppUiRunPlan,
  HbarAppUiRunPlanStepStatus,
} from './run-activity-types'

export type {
  HbarAppUiApprovalDecision,
  HbarAppUiFailureMessage,
  HbarAppUiApprovalRequestLabels,
  HbarAppUiApprovalRequestProps,
  HbarAppUiQuestionnaireOption,
  HbarAppUiQuestionnaireQuestion,
  HbarAppUiQuestionnaireResult,
  HbarAppUiQuestionnaireLabels,
  HbarAppUiQuestionnaireProps,
} from './decision-types'

export interface HbarAppUiOption {
  readonly id: string
  readonly label: string
  readonly description?: string
}

export type HbarAppUiContent = ReactNode
