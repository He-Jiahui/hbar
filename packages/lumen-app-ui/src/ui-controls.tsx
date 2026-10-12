'use client'

import { lumenPartProps } from './style-contract'

import * as React from 'react'
import type { LumenSize } from './appearance'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenIconButton, LumenText, type LumenActionTone } from './primitives'

function uniqueItems<Item extends { id: string }>(items: readonly Item[]): readonly Item[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export interface LumenLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  tone?: 'neutral' | 'muted' | 'danger' | undefined
}

export const LumenLink = React.forwardRef<HTMLAnchorElement, LumenLinkProps>(function LumenLink(
  { tone = 'neutral', className, children, ...other },
  ref,
) {
  return (
    <a
      {...other}
      ref={ref}
      data-lumen-component="link"
      className={['lumen-link', className].filter(Boolean).join(' ')}
      data-tone={tone}
    >
      {children}
    </a>
  )
})

export interface LumenSwitchProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'children' | 'size' | 'type'
> {
  label: string
  description?: string | undefined
  size?: LumenSize | undefined
  visuallyHiddenLabel?: boolean | undefined
}

export const LumenSwitch = React.forwardRef<HTMLInputElement, LumenSwitchProps>(function LumenSwitch(
  { label, description, size, visuallyHiddenLabel = false, className, ...other },
  ref,
) {
  return (
    <label
      className={['lumen-switch', className].filter(Boolean).join(' ')}
      data-size={size}
      data-label-hidden={visuallyHiddenLabel || undefined}
    >
      <span className="lumen-switch-control">
        <span className="lumen-switch-track" aria-hidden="true">
          <span className="lumen-switch-line lumen-switch-leading-line" />
          <span className="lumen-switch-lamp" />
          <span className="lumen-switch-line lumen-switch-trailing-line" />
        </span>
        <input
          {...other}
          ref={ref}
          data-lumen-component="switch"
          className="lumen-switch-input"
          type="checkbox"
          role="switch"
        />
      </span>
      <span className="lumen-switch-copy">
        <LumenText as="span" variant="label" size={size}>
          {label}
        </LumenText>
        {description ? (
          <LumenText as="small" variant="supporting" tone="muted" size={size}>
            {description}
          </LumenText>
        ) : null}
      </span>
    </label>
  )
})

export interface LumenRadioOption {
  id: string
  label: string
  description?: string | undefined
  endAdornment?: React.ReactNode | undefined
  disabled?: boolean | undefined
}

export interface LumenRadioGroupProps {
  name: string
  label: string
  value: string | null
  options: readonly LumenRadioOption[]
  onValueChange: (id: string) => void
  orientation?: 'horizontal' | 'vertical' | undefined
  appearance?: 'plain' | 'card' | 'segmented' | undefined
  hideLabel?: boolean | undefined
  listStrategyKind?: string | undefined
  disabled?: boolean | undefined
  className?: string | undefined
}

export function LumenRadioGroup({
  name,
  label,
  value,
  options,
  onValueChange,
  orientation = 'vertical',
  appearance = 'plain',
  hideLabel = false,
  listStrategyKind,
  disabled = false,
  className,
}: LumenRadioGroupProps) {
  return (
    <fieldset
      className={['lumen-radio-group', className].filter(Boolean).join(' ')}
      data-orientation={orientation}
      data-appearance={appearance}
      data-hbar-app-ui-list-strategy={listStrategyKind}
      disabled={disabled}
    >
      <legend className={hideLabel ? 'lumen-radio-visually-hidden' : undefined}>{label}</legend>
      <div>
        {uniqueItems(options).map((option) => (
          <label key={option.id} className="lumen-radio-option">
            <input
              data-lumen-component="radio"
              type="radio"
              name={name}
              value={option.id}
              checked={value === option.id}
              disabled={option.disabled}
              onChange={() => onValueChange(option.id)}
            />
            <span className="lumen-radio-option-copy">
              <LumenText as="span" variant="label">
                {option.label}
              </LumenText>
              {option.description ? (
                <LumenText as="small" variant="supporting" tone="muted">
                  {option.description}
                </LumenText>
              ) : null}
            </span>
            {option.endAdornment ? <span className="lumen-radio-option-end">{option.endAdornment}</span> : null}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export interface LumenTabItem {
  id: string
  /** Host-scoped identity when several tab sets share an item ID. */
  tabId?: string | undefined
  label: string
  badge?: string | number | undefined
  disabled?: boolean | undefined
  panelId?: string | undefined
}

export interface LumenTabsProps {
  label: string
  items: readonly LumenTabItem[]
  selectedId: string | null
  onChange: (id: string) => void
  orientation?: 'horizontal' | 'vertical' | undefined
  className?: string | undefined
  renderLabel?: ((item: LumenTabItem) => React.ReactNode) | undefined
  renderTrailing?: ((item: LumenTabItem) => React.ReactNode) | undefined
}

export function LumenTabs({
  label,
  items,
  selectedId,
  onChange,
  orientation = 'horizontal',
  className,
  renderLabel,
  renderTrailing,
}: LumenTabsProps) {
  const values = uniqueItems(items)
  const available = values.filter((item) => !item.disabled)
  const current = available.find((item) => item.id === selectedId) ?? available[0]
  return (
    <div
      {...lumenPartProps("tabs.root")} className={['lumen-tabs', className].filter(Boolean).join(' ')}
      role="tablist"
      aria-label={label}
      aria-orientation={orientation}
      data-orientation={orientation}
    >
      {values.map((item) => {
        const tab = (
          <LumenButton
            key={item.id}
            id={item.tabId ?? `${item.id}-tab`}
            role="tab"
            variant="text"
            disabled={item.disabled}
            aria-selected={selectedId === item.id}
            aria-controls={item.panelId}
            tabIndex={current?.id === item.id ? 0 : -1}
            indicatorEdge={orientation === 'vertical' ? 'left' : 'bottom'}
            indicatorState={selectedId === item.id ? 'selected' : undefined}
            indicatorVisible={selectedId === item.id}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => {
              const nextKey = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight'
              const previousKey = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft'
              if (![nextKey, previousKey, 'Home', 'End'].includes(event.key)) {
                return
              }
              event.preventDefault()
              const index = available.findIndex((candidate) => candidate.id === item.id)
              let target: LumenTabItem | undefined = available[0]
              if (event.key === 'End') {
                target = available.at(-1)
              } else if (event.key !== 'Home') {
                const direction = event.key === nextKey ? 1 : -1
                target = available[(index + direction + available.length) % available.length]
              }
              if (target) {
                const buttons = event.currentTarget
                  .closest('[role="tablist"]')
                  ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                buttons?.[values.indexOf(target)]?.focus()
                onChange(target.id)
              }
            }}
          >
            {renderLabel ? renderLabel(item) : item.label}
            {item.badge !== undefined ? <LumenBadge value={item.badge} /> : null}
          </LumenButton>
        )
        return renderTrailing ? (
          <span className="lumen-tab-with-action" key={item.id}>
            {tab}
            {renderTrailing(item)}
          </span>
        ) : (
          tab
        )
      })}
    </div>
  )
}

export type LumenSegmentedControlProps = LumenTabsProps

export function LumenSegmentedControl(props: LumenSegmentedControlProps) {
  return <LumenTabs {...props} className={['lumen-segmented', props.className].filter(Boolean).join(' ')} />
}

export interface LumenMenuItem {
  id: string
  label: string
  description?: string | undefined
  disabled?: boolean | undefined
  tone?: LumenActionTone | undefined
  shortcut?: string | undefined
  separatorBefore?: boolean | undefined
  startAdornment?: React.ReactNode | undefined
  endAdornment?: React.ReactNode | undefined
  endAdornmentLabel?: string | undefined
}

export interface LumenMenuProps {
  open: boolean
  label: string
  items: readonly LumenMenuItem[]
  empty: React.ReactNode
  selectedId?: string | null | undefined
  onSelect: (id: string) => void
  onClose?: (() => void) | undefined
  focusOnOpen?: boolean | undefined
  id?: string | undefined
  listStrategyKind?: 'content-grown' | 'pane-scroll' | undefined
  className?: string | undefined
}

export function LumenMenu({
  open,
  label,
  items,
  empty,
  selectedId,
  onSelect,
  onClose,
  focusOnOpen = false,
  id,
  listStrategyKind,
  className,
}: LumenMenuProps) {
  const generatedId = React.useId()
  const menuId = id ?? generatedId
  React.useEffect(() => {
    if (open && focusOnOpen) {
      document.getElementById(menuId)?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
    }
  }, [focusOnOpen, menuId, open])
  if (!open) {
    return null
  }
  return (
    <LumenSurface
      id={menuId}
      material="frost"
      elevation="overlay"
      className={['lumen-menu', 'hbar-app-ui-dialog-menu', className].filter(Boolean).join(' ')}
      role="menu"
      aria-label={label}
      data-hbar-app-ui-list-strategy={listStrategyKind}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && onClose) {
          event.preventDefault()
          event.stopPropagation()
          onClose()
          return
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          return
        }
        const enabled = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
        )
        if (!enabled.length) {
          return
        }
        event.preventDefault()
        const current = enabled.indexOf(document.activeElement as HTMLButtonElement)
        let next = 0
        if (event.key === 'End' || (current < 0 && event.key === 'ArrowUp')) {
          next = enabled.length - 1
        } else if (event.key !== 'Home' && current >= 0) {
          next = (current + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length
        }
        enabled[next]?.focus()
      }}
    >
      {items.length ? (
        uniqueItems(items).map((item) => (
          <React.Fragment key={item.id}>
            {item.separatorBefore ? <hr /> : null}
            <LumenButton
              role="menuitem"
              variant="text"
              tone={item.tone}
              disabled={item.disabled}
              aria-current={selectedId === item.id ? 'true' : undefined}
              onClick={() => onSelect(item.id)}
            >
              {item.startAdornment ? (
                <span className="lumen-menu-adornment" aria-hidden="true">
                  {item.startAdornment}
                </span>
              ) : null}
              <span className="lumen-menu-copy">
                <LumenText as="span" variant="label">
                  {item.label}
                </LumenText>
                {item.description ? (
                  <LumenText as="small" variant="supporting" tone="muted">
                    {item.description}
                  </LumenText>
                ) : null}
              </span>
              {item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
              {item.endAdornment ? (
                <span className="lumen-menu-adornment" aria-label={item.endAdornmentLabel}>
                  {item.endAdornment}
                </span>
              ) : null}
            </LumenButton>
          </React.Fragment>
        ))
      ) : (
        <div className="lumen-menu-empty">{empty}</div>
      )}
    </LumenSurface>
  )
}

export interface LumenPopoverProps {
  open: boolean
  label: string
  children: React.ReactNode
  placement?: 'top' | 'bottom' | 'start' | 'end' | undefined
  className?: string | undefined
}

export function LumenPopover({ open, label, children, placement = 'bottom', className }: LumenPopoverProps) {
  if (!open) {
    return null
  }
  return (
    <LumenSurface
      material="frost"
      elevation="overlay"
      className={['lumen-popover', 'hbar-app-ui-dialog-menu', className].filter(Boolean).join(' ')}
      data-placement={placement}
      role="region"
      aria-label={label}
    >
      {children}
    </LumenSurface>
  )
}

export interface LumenTooltipProps {
  label: string
  children: React.ReactElement<Record<string, unknown>>
  placement?: 'top' | 'bottom' | 'start' | 'end' | undefined
  className?: string | undefined
}

export function LumenTooltip({ label, children, placement = 'top', className }: LumenTooltipProps) {
  const tooltipId = React.useId()
  const trigger = React.cloneElement(children, {
    'aria-describedby': children.props['aria-describedby'] ?? tooltipId,
  })
  return (
    <span className={['lumen-tooltip', 'hbar-app-ui-dialog-menu', className].filter(Boolean).join(' ')}>
      {trigger}
      <span id={tooltipId} role="tooltip" data-placement={placement}>
        {label}
      </span>
    </span>
  )
}

export interface LumenDrawerProps {
  open: boolean
  title: string
  closeLabel: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  side?: 'start' | 'end' | 'bottom' | undefined
  contained?: boolean | undefined
  className?: string | undefined
}

function CloseGlyph() {
  return (
    <svg className="lumen-ui-close-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="m4 4 8 8m0-8-8 8" />
    </svg>
  )
}

export function LumenDrawer({
  open,
  title,
  closeLabel,
  onClose,
  children,
  footer,
  side = 'end',
  contained = false,
  className,
}: LumenDrawerProps) {
  const backdropRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!open) {
      return undefined
    }
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    backdropRef.current?.querySelector<HTMLElement>('.lumen-drawer header button')?.focus()
    return () => previous?.focus()
  }, [open])
  return (
    <div
      ref={backdropRef}
      className="lumen-drawer-backdrop hbar-app-ui-app-sidebar-drawer"
      data-side={side}
      data-contained={contained || undefined}
      data-open={open}
      aria-hidden={!open}
      inert={!open}
    >
      <LumenButton
        className="lumen-drawer-scrim"
        aria-label={closeLabel}
        aria-hidden="true"
        tabIndex={-1}
        indicatorVisible={false}
        onClick={onClose}
      />
      <LumenSurface
        material="frost"
        elevation="overlay"
        className={['lumen-drawer', className].filter(Boolean).join(' ')}
        role={open ? 'dialog' : undefined}
        aria-modal={open || undefined}
        aria-label={title}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          } else if (event.key === 'Tab') {
            const controls = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]'),
            ).filter(
              (element) =>
                element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0,
            )
            const first = controls[0]
            const last = controls.at(-1)
            if (
              (event.shiftKey && document.activeElement === first) ||
              (!event.shiftKey && document.activeElement === last)
            ) {
              event.preventDefault()
              ;(event.shiftKey ? last : first)?.focus()
            }
          }
        }}
      >
        <header>
          <LumenText as="h2" variant="heading">
            {title}
          </LumenText>
          <LumenIconButton label={closeLabel} onClick={onClose}>
            <CloseGlyph />
          </LumenIconButton>
        </header>
        <div className="lumen-drawer-body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </LumenSurface>
    </div>
  )
}

export interface LumenAvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  name: string
  fallback: string
  src?: string | undefined
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | undefined
}

export function LumenAvatar({ name, fallback, src, size = 'md', className, ...other }: LumenAvatarProps) {
  return (
    <span
      {...other}
      className={['lumen-avatar', className].filter(Boolean).join(' ')}
      data-size={size}
      aria-label={name}
    >
      {src ? <img src={src} alt="" /> : fallback}
    </span>
  )
}

export interface LumenBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  value: React.ReactNode
  tone?: LumenActionTone | 'info' | undefined
  variant?: 'standard' | 'dot' | undefined
}

export function LumenBadge({
  value,
  tone = 'neutral',
  variant = 'standard',
  children,
  className,
  ...other
}: LumenBadgeProps) {
  const marker = (
    <span
      {...other}
      className={['lumen-badge', className].filter(Boolean).join(' ')}
      data-lumen-component="badge"
      data-tone={tone}
      data-variant={variant}
      role={other.role ?? (other['aria-label'] ? 'img' : undefined)}
    >
      {variant === 'dot' ? <span className="lumen-visually-hidden">{value}</span> : value}
    </span>
  )
  return children ? (
    <span className="lumen-badge-anchor">
      {children}
      {marker}
    </span>
  ) : (
    marker
  )
}

export interface LumenChipProps {
  label: React.ReactNode
  startAdornment?: React.ReactNode | undefined
  selected?: boolean | undefined
  disabled?: boolean | undefined
  tone?: LumenActionTone | 'info' | undefined
  onSelect?: (() => void) | undefined
  removeAction?: { label: string; onRemove: () => void } | undefined
  className?: string | undefined
}

export function LumenChip({
  label,
  startAdornment,
  selected,
  disabled,
  tone = 'neutral',
  onSelect,
  removeAction,
  className,
}: LumenChipProps) {
  return (
    <span
      className={['lumen-chip', className].filter(Boolean).join(' ')}
      data-lumen-component="chip"
      data-tone={tone}
      data-selected={selected || undefined}
      data-disabled={disabled || undefined}
    >
      {onSelect ? (
        <LumenButton
          variant="text"
          disabled={disabled}
          aria-pressed={selected}
          indicatorState={selected ? 'selected' : undefined}
          onClick={onSelect}
        >
          {startAdornment ? <span className="lumen-chip-adornment">{startAdornment}</span> : null}
          {label}
        </LumenButton>
      ) : (
        <React.Fragment>
          {startAdornment ? <span className="lumen-chip-adornment">{startAdornment}</span> : null}
          <span className="lumen-chip-label">{label}</span>
        </React.Fragment>
      )}
      {removeAction ? (
        <LumenIconButton label={removeAction.label} disabled={disabled} size="s" onClick={removeAction.onRemove}>
          <CloseGlyph />
        </LumenIconButton>
      ) : null}
    </span>
  )
}

export interface LumenProgressProps extends React.HTMLAttributes<HTMLSpanElement> {
  label: string
  value: number
  maximum?: number | undefined
  valueText?: string | undefined
  tone?: LumenActionTone | 'info' | undefined
}

export function LumenProgress({
  label,
  value,
  maximum = 100,
  valueText,
  tone = 'neutral',
  className,
  ...other
}: LumenProgressProps) {
  const safeMaximum = Number.isFinite(maximum) && maximum > 0 ? maximum : 100
  const bounded = Math.max(0, Math.min(safeMaximum, Number.isFinite(value) ? value : 0))
  const fraction = bounded / safeMaximum
  return (
    <span
      {...other}
      className={['lumen-progress', className].filter(Boolean).join(' ')}
      data-tone={tone}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMaximum}
      aria-valuenow={bounded}
      aria-valuetext={valueText}
    >
      <span style={{ inlineSize: `${fraction * 100}%` }} />
    </span>
  )
}

export interface LumenGaugeProps extends React.HTMLAttributes<HTMLSpanElement> {
  label: string
  value: number
  valueLabel: string
  maximum?: number | undefined
  tone?: LumenActionTone | 'info' | undefined
}

export function LumenGauge({
  label,
  value,
  valueLabel,
  maximum = 100,
  tone = 'info',
  className,
  style,
  ...other
}: LumenGaugeProps) {
  const safeMaximum = Number.isFinite(maximum) && maximum > 0 ? maximum : 100
  const bounded = Math.max(0, Math.min(safeMaximum, Number.isFinite(value) ? value : 0))
  return (
    <span
      {...other}
      className={['lumen-gauge', className].filter(Boolean).join(' ')}
      data-tone={tone}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMaximum}
      aria-valuenow={bounded}
      aria-valuetext={valueLabel}
      style={
        {
          ...style,
          '--lumen-gauge-angle': `${(bounded / safeMaximum) * 360}deg`,
        } as React.CSSProperties
      }
    >
      <strong>{valueLabel}</strong>
    </span>
  )
}

export interface LumenBulletProgressProps extends React.HTMLAttributes<HTMLSpanElement> {
  label: string
  value: number
  target: number
  maximum?: number | undefined
  tone?: LumenActionTone | 'info' | undefined
}

export function LumenBulletProgress({
  label,
  value,
  target,
  maximum = 100,
  tone = 'info',
  className,
  ...other
}: LumenBulletProgressProps) {
  const safeMaximum = Number.isFinite(maximum) && maximum > 0 ? maximum : 100
  const bounded = Math.max(0, Math.min(safeMaximum, Number.isFinite(value) ? value : 0))
  const boundedTarget = Math.max(0, Math.min(safeMaximum, Number.isFinite(target) ? target : 0))
  const targetPosition =
    boundedTarget === safeMaximum ? 'calc(100% - 0.125rem)' : `${(boundedTarget / safeMaximum) * 100}%`
  return (
    <span
      {...other}
      className={['lumen-bullet-progress', className].filter(Boolean).join(' ')}
      data-tone={tone}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMaximum}
      aria-valuenow={bounded}
    >
      <span style={{ inlineSize: `${(bounded / safeMaximum) * 100}%` }} />
      <i aria-hidden="true" style={{ insetInlineStart: targetPosition }} />
    </span>
  )
}

export interface LumenDividerProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string | undefined
  orientation?: 'horizontal' | 'vertical' | undefined
}

export function LumenDivider({ label, orientation = 'horizontal', className, ...other }: LumenDividerProps) {
  return (
    <div
      {...other}
      className={['lumen-divider', className].filter(Boolean).join(' ')}
      data-orientation={orientation}
      role="separator"
      aria-orientation={orientation}
    >
      {label ? <span>{label}</span> : null}
    </div>
  )
}

export interface LumenSkeletonProps extends React.HTMLAttributes<HTMLSpanElement> {
  label?: string | undefined
  shape?: 'text' | 'block' | 'circle' | undefined
}

export function LumenSkeleton({ label, shape = 'block', className, ...other }: LumenSkeletonProps) {
  return (
    <span
      {...other}
      className={['lumen-skeleton', className].filter(Boolean).join(' ')}
      data-shape={shape}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  )
}
