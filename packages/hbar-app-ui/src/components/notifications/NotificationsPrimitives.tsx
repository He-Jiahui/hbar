import { LumenFrame, LumenText, LumenButton, LumenToggleControl } from '@lumen/app-ui'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { HbarAppUiEvent, HbarAppUiVariantProps } from '../../types'
import { ActionSurfaceFrame } from '../SurfaceFrame'

export type NotificationSurfaceProps = HbarAppUiVariantProps

type NotificationActionTone = 'neutral' | 'light' | 'danger'

export type NotificationKind = 'mention' | 'review' | 'reply' | 'member' | 'security' | 'comment' | 'check'

export type NotificationEntry = {
  readonly id: string
  readonly kind: NotificationKind
  readonly time: string
  readonly line: readonly { readonly text: string; readonly emphasis?: boolean }[]
  readonly detail?: string
  readonly unread: boolean
  readonly mention?: boolean
}

export type NotificationGroup = {
  readonly label: string
  readonly entries: readonly NotificationEntry[]
}

export const notificationGroups: readonly NotificationGroup[] = [
  {
    label: 'Today',
    entries: [
      {
        id: 'q3-rollout',
        kind: 'mention',
        time: '12m',
        line: [
          { text: 'Ana Reyes', emphasis: true },
          { text: ' mentioned you in ' },
          { text: 'Q3 rollout plan', emphasis: true },
        ],
        detail: 'Can you confirm the migration window before we lock the schedule with Northwind?',
        unread: true,
        mention: true,
      },
      {
        id: 'billing-meter',
        kind: 'review',
        time: '48m',
        line: [
          { text: 'Wei Chen', emphasis: true },
          { text: ' requested review on ' },
          { text: 'Billing usage meter', emphasis: true },
        ],
        detail: '14 files changed across the metering service and the invoice job.',
        unread: true,
      },
      {
        id: 'onboarding-checklist',
        kind: 'reply',
        time: '2h',
        line: [
          { text: 'Marco Silva', emphasis: true },
          { text: ' replied in ' },
          { text: 'Onboarding checklist', emphasis: true },
        ],
        detail: 'Moved the workspace step ahead of the invite step. Looks cleaner.',
        unread: true,
      },
      {
        id: 'cedar-labs',
        kind: 'member',
        time: '5h',
        line: [
          { text: 'Priya Nandakumar', emphasis: true },
          { text: ' joined ' },
          { text: 'Cedar Labs', emphasis: true },
        ],
        detail: 'Invited by you as an editor.',
        unread: true,
      },
    ],
  },
  {
    label: 'Yesterday',
    entries: [
      {
        id: 'new-device',
        kind: 'security',
        time: 'Yesterday',
        line: [
          { text: 'Halcyon', emphasis: true },
          { text: ' signed in from a new device on ' },
          { text: 'macOS · Lisbon', emphasis: true },
        ],
        detail: 'If this was not you, revoke the session and rotate your keys.',
        unread: false,
      },
      {
        id: 'retention-teardown',
        kind: 'mention',
        time: 'Yesterday',
        line: [
          { text: 'Sofia Alvarez', emphasis: true },
          { text: ' mentioned you in ' },
          { text: 'Retention teardown', emphasis: true },
        ],
        detail: 'Pulled your cohort chart into the summary. Shout if that is stale.',
        unread: false,
        mention: true,
      },
    ],
  },
  {
    label: 'Earlier',
    entries: [
      {
        id: 'meridian-import',
        kind: 'comment',
        time: '2d',
        line: [
          { text: 'Marco Silva', emphasis: true },
          { text: ' resolved your comment in ' },
          { text: 'Meridian import', emphasis: true },
        ],
        unread: false,
      },
      {
        id: 'sidebar-density',
        kind: 'check',
        time: '3d',
        line: [
          { text: 'Ana Reyes', emphasis: true },
          { text: ' approved ' },
          { text: 'Sidebar density pass', emphasis: true },
        ],
        unread: false,
      },
    ],
  },
]

export type DeliveryChannel = 'inApp' | 'email' | 'push'

export type DeliveryEvent = {
  readonly id: string
  readonly label: string
  readonly detail: string
  readonly values: Readonly<Record<DeliveryChannel, boolean>>
}

export type DeliveryGroup = {
  readonly id: string
  readonly label: string
  readonly summaries: Readonly<Record<DeliveryChannel, string>>
  readonly entries: readonly DeliveryEvent[]
}

export const deliveryGroups: readonly DeliveryGroup[] = [
  {
    id: 'collaboration',
    label: 'Collaboration',
    summaries: { inApp: 'None', email: 'All', push: 'All' },
    entries: [
      {
        id: 'mentions',
        label: 'Mentions and replies',
        detail: 'Someone names you in a comment or thread.',
        values: { inApp: true, email: true, push: true },
      },
      {
        id: 'assigned',
        label: 'Assigned to you',
        detail: 'A task, review or ticket lands in your queue.',
        values: { inApp: true, email: true, push: false },
      },
      {
        id: 'shared',
        label: 'Shared with you',
        detail: 'A board, document or dashboard is shared.',
        values: { inApp: true, email: false, push: false },
      },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    summaries: { inApp: 'All', email: 'None', push: 'All' },
    entries: [
      {
        id: 'invoices',
        label: 'Invoices and receipts',
        detail: 'Monthly statements for Cedar Labs.',
        values: { inApp: false, email: true, push: false },
      },
      {
        id: 'seats',
        label: 'Seat changes',
        detail: 'A member joins, leaves or changes role.',
        values: { inApp: true, email: true, push: false },
      },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    summaries: { inApp: 'None', email: 'None', push: 'All' },
    entries: [
      {
        id: 'sign-in',
        label: 'New sign-in',
        detail: 'A session starts on an unrecognised device.',
        values: { inApp: true, email: true, push: true },
      },
      {
        id: 'api-key',
        label: 'API key activity',
        detail: 'A key is created, rotated or revoked.',
        values: { inApp: true, email: true, push: false },
      },
    ],
  },
]

export type ActivityEntry = {
  readonly id: string
  readonly kind: NotificationKind
  readonly person: string
  readonly time: string
  readonly detail: string
}

export const activityEntries: readonly ActivityEntry[] = [
  {
    id: 'priya-access',
    kind: 'member',
    person: 'Priya Nandakumar',
    time: '9m',
    detail: 'requested admin access to Cedar Labs billing',
  },
  {
    id: 'wei-review',
    kind: 'review',
    person: 'Wei Chen',
    time: '52m',
    detail: 'requested your review on Usage metering rewrite',
  },
  {
    id: 'halcyon-latency',
    kind: 'security',
    person: 'Halcyon',
    time: '3h',
    detail: 'raised a latency alert on eu-west ingest',
  },
]

export function reportNotificationAction(
  onAction: NotificationSurfaceProps['onAction'],
  spec: NotificationSurfaceProps['spec'],
  actionId: string,
  value?: string,
): void {
  const event: HbarAppUiEvent =
    value === undefined ? { variantId: spec.id, actionId } : { variantId: spec.id, actionId, value }
  onAction?.(event)
}

export function NotificationFrame({
  spec,
  onAction,
  className,
  children,
}: NotificationSurfaceProps & {
  readonly className: string
  readonly children: ReactNode
}) {
  return (
    <ActionSurfaceFrame spec={spec} onAction={onAction} className={`hbar-app-ui-notifications-surface ${className}`}>
      {children}
    </ActionSurfaceFrame>
  )
}

export function NotificationButton({
  tone = 'neutral',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly tone?: NotificationActionTone
}) {
  return (
    <LumenButton
      {...props}
      type={props.type ?? 'button'}
      className={`hbar-app-ui-notifications-button hbar-app-ui-notifications-button-${tone}${className ? ` ${className}` : ''}`}
    >
      {children}
    </LumenButton>
  )
}

export function NotificationIconButton({
  label,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { readonly label: string }) {
  return (
    <NotificationButton
      {...props}
      className={`hbar-app-ui-notifications-icon-button${className ? ` ${className}` : ''}`}
      aria-label={props['aria-label'] ?? label}
      title={props.title ?? label}
    >
      {children}
    </NotificationButton>
  )
}

export function NotificationToggle({
  label,
  checked,
  onChange,
}: {
  readonly label: string
  readonly checked: boolean
  readonly onChange: () => void
}) {
  return <LumenToggleControl aria-label={label} checked={checked} onChange={onChange} />
}

export function NotificationTabs<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string
  readonly value: T
  readonly options: readonly { readonly id: T; readonly label: string; readonly count?: number }[]
  readonly onChange: (value: T) => void
}) {
  return (
    <LumenFrame className="hbar-app-ui-notifications-tabs" role="tablist" aria-label={label}>
      {options.map((option) => (
        <LumenButton
          type="button"
          role="tab"
          aria-selected={option.id === value}
          key={option.id}
          className={option.id === value ? 'is-selected' : ''}
          onClick={() => onChange(option.id)}
        >
          <LumenText as="span">{option.label}</LumenText>
          {option.count !== undefined && <LumenText as="small">{option.count}</LumenText>}
        </LumenButton>
      ))}
    </LumenFrame>
  )
}
