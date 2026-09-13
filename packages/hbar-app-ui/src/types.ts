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

export interface HbarAppUiVariantSpec {
  readonly id: string
  readonly category: HbarAppUiCategory
  readonly variant: number
  readonly title: string
  readonly description: string
  readonly layout: 'conversation' | 'composer' | 'activity' | 'table' | 'dashboard' | 'form' | 'overlay' | 'workflow'
  readonly actions: readonly HbarAppUiAction[]
  readonly density: 'compact' | 'comfortable' | 'spacious'
}

export interface HbarAppUiEvent {
  readonly variantId: string
  readonly actionId: string
  readonly value?: string
}

export interface HbarAppUiVariantProps {
  readonly spec: HbarAppUiVariantSpec
  readonly onAction?: (event: HbarAppUiEvent) => void
  readonly className?: string
}

export type HbarAppUiVariantComponent = ComponentType<HbarAppUiVariantProps>

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

export interface HbarAppUiOption {
  readonly id: string
  readonly label: string
  readonly description?: string
}

export type HbarAppUiContent = ReactNode
