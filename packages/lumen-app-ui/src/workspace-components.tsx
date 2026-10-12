'use client'

import { lumenPartProps } from './style-contract'

import * as React from 'react'
import { LumenContentText } from './content-text'
import { LumenActionMenu, LumenIcon, type LumenIconProps } from './workbench'
import { LumenButton, LumenIconButton, LumenStatus, LumenText } from './primitives'

export interface LumenPageHeaderProps {
  className?: string | undefined
  layout?: 'workspace' | 'page' | undefined
  title: string
  context?: string | undefined
  leading?: React.ReactNode
  status?:
    | {
        label: string
        tone: 'neutral' | 'success' | 'warning' | 'danger'
      }
    | undefined
  actionsLabel?: string | undefined
  actions?: React.ReactNode
}

export function LumenPageHeader({
  className,
  layout = 'workspace',
  title,
  context,
  leading,
  status,
  actionsLabel,
  actions,
}: LumenPageHeaderProps) {
  return (
    <header {...lumenPartProps("page-header.root")} className={['lumen-page-header', className].filter(Boolean).join(' ')} data-header-layout={layout}>
      {leading ? <div className="lumen-page-header-leading">{leading}</div> : null}
      <div {...lumenPartProps("page-header.heading")} className="lumen-page-heading">
        <LumenContentText {...lumenPartProps("page-header.title")} context={layout === 'page' ? 'page.title' : 'workspace.title'} title={title}>
          {title}
        </LumenContentText>
        {context ? (
          <LumenContentText {...lumenPartProps("page-header.context")} context="section.description" tone="muted" title={context}>
            {context}
          </LumenContentText>
        ) : null}
      </div>
      <div {...lumenPartProps("page-header.end")} className="lumen-page-header-end">
        {status ? <LumenStatus value={status.label} tone={status.tone} /> : null}
        {actions ? (
          <div {...lumenPartProps("page-header.actions")} className="lumen-page-actions" role="group" aria-label={actionsLabel}>
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  )
}

export interface LumenPageActionProps extends Omit<React.ComponentProps<typeof LumenIconButton>, 'children' | 'label'> {
  icon: React.ReactNode
  label: string
  selected?: boolean | undefined
}

export function LumenPageAction({ icon, label, selected = false, ...other }: LumenPageActionProps) {
  return (
    <LumenIconButton {...other} label={label} aria-pressed={selected} data-selected={selected || undefined}>
      {icon}
    </LumenIconButton>
  )
}

export interface LumenToolPaneProps {
  title: string
  targetLabel?: string | undefined
  description?: string | undefined
  icon?: LumenIconProps['icon'] | undefined
  actions?: React.ReactNode
  toolbar?: React.ReactNode
  status?: React.ReactNode
  error?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  backLabel?: string | undefined
  closeLabel?: string | undefined
  onBack?: (() => void) | undefined
  onClose?: (() => void) | undefined
  busy?: boolean | undefined
  className?: string | undefined
}

function DirectionGlyph({ direction }: { direction: 'back' | 'close' }) {
  return (
    <svg className="lumen-tool-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {direction === 'back' ? <path d="m10.5 3.5-4.5 4.5 4.5 4.5M6 8h7" /> : <path d="m4 4 8 8m0-8-8 8" />}
    </svg>
  )
}

export function LumenToolPane({
  title,
  targetLabel,
  description,
  icon,
  actions,
  toolbar,
  status,
  error,
  children,
  footer,
  backLabel,
  closeLabel,
  onBack,
  onClose,
  busy = false,
  className,
}: LumenToolPaneProps) {
  return (
    <section
      className={['lumen-tool-pane', className].filter(Boolean).join(' ')}
      aria-label={title}
      aria-busy={busy || undefined}
    >
      <header data-tool-pane-slot="header">
        <div className="lumen-tool-pane-start">
          {onBack && backLabel ? (
            <LumenIconButton label={backLabel} onClick={onBack}>
              <DirectionGlyph direction="back" />
            </LumenIconButton>
          ) : null}
          {icon ? <LumenIcon icon={icon} tier="md" className="lumen-tool-pane-icon" /> : null}
          <div {...lumenPartProps("tool-pane.copy")} className="lumen-tool-pane-copy">
            <div {...lumenPartProps("tool-pane.heading")} className="lumen-tool-pane-heading">
              <LumenContentText context="tool.title">{title}</LumenContentText>
              {targetLabel ? (
                <LumenContentText context="section.description" tone="muted" title={targetLabel}>
                  {targetLabel}
                </LumenContentText>
              ) : null}
            </div>
            {description ? (
              <LumenContentText context="section.description" tone="muted">
                {description}
              </LumenContentText>
            ) : null}
          </div>
        </div>
        {actions || (onClose && closeLabel) ? (
          <div className="lumen-tool-pane-actions">
            {actions}
            {onClose && closeLabel ? (
              <LumenIconButton label={closeLabel} onClick={onClose}>
                <DirectionGlyph direction="close" />
              </LumenIconButton>
            ) : null}
          </div>
        ) : null}
      </header>
      {toolbar ? (
        <div {...lumenPartProps("tool-pane.toolbar")} className="lumen-tool-pane-toolbar" data-tool-pane-slot="toolbar">
          {toolbar}
        </div>
      ) : null}
      {status ? (
        <div className="lumen-tool-pane-status" data-tool-pane-slot="status">
          {status}
        </div>
      ) : null}
      {error ? (
        <div className="lumen-tool-pane-error" data-tool-pane-slot="error" role="alert">
          {error}
        </div>
      ) : null}
      <div {...lumenPartProps("tool-pane.body")} className="lumen-tool-pane-body" data-tool-pane-slot="body">
        {children}
      </div>
      {footer ? (
        <footer className="lumen-tool-pane-footer" data-tool-pane-slot="footer">
          {footer}
        </footer>
      ) : null}
    </section>
  )
}

export interface LumenCompactMetric {
  id: string
  label: string
  value: string
  detail?: string | undefined
}

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

export function LumenCompactMetrics({ label, metrics }: { label: string; metrics: readonly LumenCompactMetric[] }) {
  return (
    <dl {...lumenPartProps("metrics.compact")} className="lumen-compact-metrics" aria-label={label}>
      {uniqueItems(metrics).map((metric) => (
        <div key={metric.id}>
          <LumenText as="dt" tone="muted" variant="supporting">
            {metric.label}
          </LumenText>
          <dd>{metric.value}</dd>
          {metric.detail ? (
            <LumenText as="small" tone="subtle" variant="supporting">
              {metric.detail}
            </LumenText>
          ) : null}
        </div>
      ))}
    </dl>
  )
}

export interface LumenBarPoint {
  id: string
  value: number
  label: string
}

export function LumenBarSeries({
  label,
  points,
  empty,
  maximum,
  selectedId,
  selectLabel,
  onSelect,
}: {
  label: string
  points: readonly LumenBarPoint[]
  empty: React.ReactNode
  maximum?: number | undefined
  selectedId?: string | null | undefined
  selectLabel?: ((point: LumenBarPoint) => string) | undefined
  onSelect?: ((id: string) => void) | undefined
}) {
  const records = uniqueItems(points)
  const scale =
    maximum !== undefined && Number.isFinite(maximum) && maximum > 0
      ? maximum
      : Math.max(1, ...records.map((point) => (Number.isFinite(point.value) ? point.value : 0)))
  return records.length > 0 ? (
    <div {...lumenPartProps("metrics.bars")} className="lumen-bar-series" role="img" aria-label={label}>
      {records.map((point) => {
        const style = {
          blockSize: `${Math.max(0, Math.min(1, Number.isFinite(point.value) ? point.value / scale : 0)) * 100}%`,
        }
        return onSelect ? (
          <LumenButton
            key={point.id}
            variant="text"
            title={point.label}
            aria-label={selectLabel?.(point) ?? point.label}
            aria-pressed={selectedId === point.id}
            style={style}
            onClick={() => onSelect(point.id)}
          />
        ) : (
          <i key={point.id} title={point.label} style={style} />
        )
      })}
    </div>
  ) : (
    <React.Fragment>{empty}</React.Fragment>
  )
}

export interface LumenSettingsListItem {
  id: string
  title: string
  metadata: readonly string[]
  status?:
    | {
        label: string
        tone: 'neutral' | 'success' | 'warning' | 'danger'
      }
    | undefined
  editLabel: string
  menuLabel: string
  removeLabel?: string | undefined
}

export interface LumenSettingsListProps {
  label: string
  description?: string | undefined
  empty: string
  addLabel: string
  refreshLabel: string
  items: readonly LumenSettingsListItem[]
  disabled?: boolean | undefined
  busy?: boolean | undefined
  onAdd: () => void
  onRefresh: () => void
  onOpen: (id: string) => void
  onRemove?: ((id: string) => void) | undefined
}

function UtilityGlyph({ name }: { name: 'add' | 'refresh' }) {
  return (
    <svg className="lumen-utility-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {name === 'add' ? <path d="M8 3v10M3 8h10" /> : <path d="M12.5 6A5 5 0 1 0 13 9m-.5-3V2.5M12.5 6H9" />}
    </svg>
  )
}

export function LumenSettingsList({
  label,
  description,
  empty,
  addLabel,
  refreshLabel,
  items,
  disabled = false,
  busy = false,
  onAdd,
  onRefresh,
  onOpen,
  onRemove,
}: LumenSettingsListProps) {
  return (
    <section className="lumen-settings-list" aria-label={label} aria-busy={busy || undefined}>
      <header>
        <div>
          <LumenText as="h2" variant="heading">
            {label}
          </LumenText>
          {description ? (
            <LumenText as="p" tone="muted">
              {description}
            </LumenText>
          ) : null}
        </div>
        <div className="lumen-settings-list-actions">
          <LumenIconButton label={refreshLabel} disabled={disabled || busy} onClick={onRefresh}>
            <UtilityGlyph name="refresh" />
          </LumenIconButton>
          <LumenButton tone="primary" disabled={disabled || busy} onClick={onAdd}>
            <UtilityGlyph name="add" />
            {addLabel}
          </LumenButton>
        </div>
      </header>
      {items.length === 0 ? (
        <LumenText as="p" className="lumen-settings-list-empty" tone="muted">
          {empty}
        </LumenText>
      ) : (
        <ol>
          {items.map((item) => (
            <li key={item.id}>
              <LumenButton
                className="lumen-settings-list-row"
                variant="text"
                aria-label={item.editLabel}
                disabled={disabled || busy}
                onClick={() => onOpen(item.id)}
              >
                <span className="lumen-settings-list-copy">
                  <LumenText as="strong" variant="label">
                    {item.title}
                  </LumenText>
                  <span className="lumen-settings-list-metadata">
                    {item.metadata.map((value, index) => (
                      <LumenText as="small" key={`${item.id}:${index}`} tone="subtle" variant="supporting">
                        {value}
                      </LumenText>
                    ))}
                  </span>
                </span>
                {item.status ? <LumenStatus value={item.status.label} tone={item.status.tone} /> : null}
              </LumenButton>
              {item.removeLabel && onRemove ? (
                <LumenActionMenu
                  label={item.menuLabel}
                  items={[{ id: 'remove', label: item.removeLabel, tone: 'danger' }]}
                  onAction={() => onRemove(item.id)}
                />
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
