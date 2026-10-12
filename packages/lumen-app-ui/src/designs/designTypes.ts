import type { LumenState, LumenTone } from '../LumenIndicator'

export interface LumenDesignCopy {
  title: string
  detail: string
}

export interface AnalyticsMetric {
  id: string
  label: string
  value: string
  change: string
  tone?: LumenTone | undefined
}

export interface AnalyticsPoint {
  id: string
  label: string
  value: number
}

export interface AnalyticsDesignProps {
  copy: LumenDesignCopy & {
    period: string
    series: string
    value: (value: number) => string
  }
  content: {
    periods: readonly { id: string; label: string }[]
    metrics: readonly AnalyticsMetric[]
    points: readonly AnalyticsPoint[]
  }
  state: { periodId: string }
  actions: { onPeriodChange: (periodId: string) => void }
}

export interface BillingPlan {
  id: string
  name: string
  price: string
  detail: string
  featured?: boolean | undefined
}

export interface BillingInvoice {
  id: string
  date: string
  description: string
  amount: string
  status: string
}

export interface BillingDesignProps {
  copy: LumenDesignCopy & {
    usage: string
    invoices: string
    choose: string
    current: string
    open: (description: string) => string
  }
  content: {
    usage: { label: string; value: string; percent: number }
    plans: readonly BillingPlan[]
    invoices: readonly BillingInvoice[]
  }
  state: { selectedPlanId: string }
  actions: { onPlanSelect: (planId: string) => void; onInvoiceOpen: (invoiceId: string) => void }
}

export interface KanbanCard {
  id: string
  title: string
  detail: string
  tone?: LumenTone | undefined
  assignee?: string | undefined
}

export interface KanbanColumn {
  id: string
  title: string
  count: string
  cards: readonly KanbanCard[]
}

export interface KanbanDesignProps {
  copy: LumenDesignCopy & {
    board: string
    move: string
    select: (title: string) => string
  }
  content: { columns: readonly KanbanColumn[] }
  state: { selectedCardId: string | null }
  actions: {
    onSelect: (cardId: string) => void
    onMove: (cardId: string, columnId: string) => void
  }
}

export interface WizardStep {
  id: string
  label: string
  detail: string
}

export interface WizardField {
  id: string
  label: string
  value: string
  placeholder?: string | undefined
}

export interface WizardDesignProps {
  copy: LumenDesignCopy & {
    steps: string
    back: string
    next: string
    finish: string
    progress: (current: number, total: number) => string
  }
  content: { steps: readonly WizardStep[]; fields: readonly WizardField[] }
  state: { currentStep: number }
  actions: {
    onStepChange: (step: number) => void
    onFieldChange: (fieldId: string, value: string) => void
  }
}

export interface DashboardPanel {
  id: string
  title: string
  value: string
  detail: string
  tone?: LumenTone | undefined
}

export interface DashboardDesignProps {
  copy: LumenDesignCopy & { activity: string; actions: string; open: (title: string) => string }
  content: { metrics: readonly AnalyticsMetric[]; panels: readonly DashboardPanel[] }
  actions: { onOpen: (panelId: string) => void }
}

export interface DataTableColumn {
  id: string
  label: string
}

export interface DataTableRow {
  id: string
  values: readonly string[]
  tone?: LumenTone | undefined
}

export interface DataTableDesignProps {
  copy: LumenDesignCopy & { search: string; empty: string; select: (label: string) => string }
  content: { columns: readonly DataTableColumn[]; rows: readonly DataTableRow[] }
  state: { query: string; selectedId: string | null }
  actions: { onQueryChange: (query: string) => void; onSelect: (rowId: string) => void }
}

export interface MonitoringService {
  id: string
  name: string
  detail: string
  status: string
  tone: LumenTone
  running?: boolean | undefined
}

export interface MonitoringDesignProps {
  copy: LumenDesignCopy & { services: string; signal: string; value: (value: number) => string }
  content: { services: readonly MonitoringService[]; points: readonly AnalyticsPoint[] }
}

export interface NotificationItem {
  id: string
  title: string
  detail: string
  time: string
  tone?: LumenTone | undefined
}

export interface NotificationsDesignProps {
  copy: LumenDesignCopy & { inbox: string; markRead: string; dismiss: string }
  content: { items: readonly NotificationItem[] }
  state: { readIds: readonly string[]; dismissedIds: readonly string[] }
  actions: { onRead: (id: string) => void; onDismiss: (id: string) => void }
}

export interface DialogDesignProps {
  copy: LumenDesignCopy & {
    open: string
    cancel: string
    confirm: string
  }
  content: { body: string; details: readonly string[] }
  state: { open: boolean }
  actions: { onOpen: () => void; onClose: () => void; onConfirm: () => void }
}

export interface SettingsField {
  id: string
  label: string
  detail: string
  value: string
  placeholder?: string | undefined
}

export interface SettingsFormDesignProps {
  copy: LumenDesignCopy & { save: string; saved: string }
  content: { fields: readonly SettingsField[] }
  state: { saved: boolean }
  actions: { onFieldChange: (fieldId: string, value: string) => void; onSave: () => void }
}

export interface OnboardingStep {
  id: string
  title: string
  detail: string
}

export interface OnboardingDesignProps {
  copy: LumenDesignCopy & {
    skip: string
    next: string
    finish: string
    steps: string
    stepLabel: (position: number, title: string) => string
  }
  content: { steps: readonly OnboardingStep[] }
  state: { currentStep: number }
  actions: { onStepChange: (step: number) => void; onSkip: () => void }
}

export type LumenCategoryLayout =
  | 'calendar'
  | 'chat'
  | 'comments'
  | 'commerce'
  | 'editor'
  | 'form'
  | 'grid'
  | 'list'
  | 'navigation'
  | 'overlay'
  | 'panel'
  | 'rail'
  | 'split'
  | 'stream'
  | 'table'
  | 'timeline'

export interface CategoryDesignItem {
  id: string
  label: string
  detail: string
  value?: string | undefined
  tone?: LumenTone | undefined
  state?: LumenState | undefined
}

export interface CategoryDesignProfile {
  id: string
  scenario: string
  surface: string
  initialState: string
}

export interface CategoryDesignProps {
  id: string
  copy: LumenDesignCopy & {
    primary: string
    secondary: string
    search: string
    input: string
    action: string
  }
  content: {
    items: readonly CategoryDesignItem[]
    aside?: readonly CategoryDesignItem[] | undefined
    controls?: readonly CategoryDesignItem[] | undefined
    metrics?: readonly CategoryDesignItem[] | undefined
    profile?: CategoryDesignProfile | undefined
  }
  layout: LumenCategoryLayout
  state: {
    query: string
    input: string
    selectedId: string | null
    values?: Readonly<Record<string, string>> | undefined
  }
  actions: {
    onQueryChange: (query: string) => void
    onInputChange: (input: string) => void
    onItemChange?: ((id: string, value: string) => void) | undefined
    onSelect: (id: string) => void
    onAction: (id: string) => void
  }
}
