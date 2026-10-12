'use client'

import * as React from 'react'
import LumenField from '../LumenField'
import LumenIndicator, { type LumenTone } from '../LumenIndicator'
import LumenSurface from '../LumenSurface'
import { LumenChoiceSelect, LumenFormField, LumenInput, LumenTextarea } from '../forms'
import { LumenButton, type LumenButtonProps } from '../primitives'
import type {
  AnalyticsDesignProps,
  BillingDesignProps,
  CategoryDesignItem,
  CategoryDesignProps,
  DashboardDesignProps,
  DataTableDesignProps,
  DialogDesignProps,
  KanbanCard,
  KanbanDesignProps,
  MonitoringDesignProps,
  NotificationsDesignProps,
  OnboardingDesignProps,
  SettingsFormDesignProps,
  WizardDesignProps,
} from './designTypes'
import styles from './designs.module.css'

function Button({ variant = 'text', ...props }: LumenButtonProps) {
  return <LumenButton {...props} variant={variant} />
}

function Frame({
  id,
  copy,
  children,
  tone = 'info',
  layout,
  sourceId,
}: {
  id: string
  copy: { title: string; detail: string }
  children: React.ReactNode
  tone?: LumenTone | undefined
  layout?: string | undefined
  sourceId?: string | undefined
}) {
  return (
    <LumenSurface
      className={styles.surface}
      data-lumen-design={id}
      data-lumen-layout={layout}
      data-lumen-source-id={sourceId}
    >
      <section className={styles.frame} aria-labelledby={`${id}-title`}>
        <header className={styles.header}>
          <div>
            <h2 id={`${id}-title`}>{copy.title}</h2>
            <p>{copy.detail}</p>
          </div>
          <LumenIndicator edge="left" state="selected" tone={tone} />
        </header>
        {children}
      </section>
    </LumenSurface>
  )
}

export function LumenAnalyticsDesign({ copy, content, state, actions }: AnalyticsDesignProps) {
  const period = content.periods.some((item) => item.id === state.periodId)
    ? state.periodId
    : (content.periods[0]?.id ?? '')
  const max = Math.max(1, ...content.points.map((point) => point.value))
  return (
    <Frame id="lumen-design-analytics" copy={copy} tone="info">
      <div className={styles.designToolbar}>
        <LumenField boundary="vertical" className={styles.compactField}>
          <LumenFormField controlId="lumen-design-analytics-period" label={copy.period} size="s">
            <LumenChoiceSelect
              id="lumen-design-analytics-period"
              label={copy.period}
              options={content.periods}
              size="s"
              value={period || null}
              onValueChange={actions.onPeriodChange}
            />
          </LumenFormField>
        </LumenField>
        <span className={styles.muted}>{copy.series}</span>
      </div>
      <div className={styles.metricGrid}>
        {content.metrics.map((metric) => (
          <article className={styles.metric} key={metric.id}>
            <small>{metric.label}</small>
            <strong>{metric.value}</strong>
            <span data-tone={metric.tone ?? 'neutral'}>{metric.change}</span>
          </article>
        ))}
      </div>
      <section className={styles.chartPanel} aria-label={copy.series}>
        <div className={styles.chartHeader}>
          <h3>{copy.series}</h3>
          <span>{copy.value(content.points.at(-1)?.value ?? 0)}</span>
        </div>
        <ol className={styles.chart}>
          {content.points.map((point) => {
            const chartStyle = {
              '--lumen-bar': `${(point.value / max) * 100}%`,
            } as React.CSSProperties
            return (
              <li key={point.id}>
                <span className={styles.chartValue}>{copy.value(point.value)}</span>
                <span className={styles.bar} style={chartStyle}>
                  <span />
                </span>
                <small>{point.label}</small>
              </li>
            )
          })}
        </ol>
      </section>
    </Frame>
  )
}

export function LumenBillingDesign({ copy, content, state, actions }: BillingDesignProps) {
  const selectedPlan = content.plans.find((plan) => plan.id === state.selectedPlanId)
  return (
    <Frame id="lumen-design-billing" copy={copy} tone="success">
      <section className={styles.usagePanel} aria-label={copy.usage}>
        <div className={styles.sectionHeading}>
          <h3>{copy.usage}</h3>
          <strong>{content.usage.value}</strong>
        </div>
        <div className={styles.usageTrack}>
          <span style={{ width: `${Math.max(0, Math.min(100, content.usage.percent))}%` }} />
        </div>
        <small>{content.usage.label}</small>
      </section>
      <div className={styles.planGrid} aria-label={copy.choose}>
        {content.plans.map((plan) => {
          const selected = selectedPlan?.id === plan.id
          return (
            <Button
              className={styles.plan}
              key={plan.id}
              aria-pressed={selected}
              onClick={() => actions.onPlanSelect(plan.id)}
            >
              {plan.featured && <small className={styles.planTag}>{copy.current}</small>}
              <strong>{plan.name}</strong>
              <b>{plan.price}</b>
              <span>{plan.detail}</span>
              <LumenIndicator edge="bottom" state={selected ? 'selected' : 'idle'} tone="success" />
            </Button>
          )
        })}
      </div>
      <section className={styles.invoicePanel} aria-label={copy.invoices}>
        <div className={styles.sectionHeading}>
          <h3>{copy.invoices}</h3>
          <span>{selectedPlan?.name ?? ''}</span>
        </div>
        <div className={styles.invoiceList}>
          {content.invoices.map((invoice) => (
            <Button
              className={styles.invoice}
              key={invoice.id}
              onClick={() => actions.onInvoiceOpen(invoice.id)}
              aria-label={copy.open(invoice.description)}
            >
              <span>
                <strong>{invoice.description}</strong>
                <small>{invoice.date}</small>
              </span>
              <span>{invoice.amount}</span>
              <small>{invoice.status}</small>
            </Button>
          ))}
        </div>
      </section>
    </Frame>
  )
}

function KanbanCardView({
  card,
  selected,
  onSelect,
  selectLabel,
}: {
  card: KanbanCard
  selected: boolean
  onSelect: () => void
  selectLabel: string
}) {
  return (
    <Button className={styles.kanbanCard} aria-pressed={selected} onClick={onSelect}>
      <span className={styles.cardTop}>
        <small data-tone={card.tone ?? 'neutral'}>{card.tone ?? 'neutral'}</small>
        {card.assignee && <small>{card.assignee}</small>}
      </span>
      <strong>{card.title}</strong>
      <span className={styles.cardDetail}>{card.detail}</span>
      <LumenIndicator edge="bottom" state={selected ? 'selected' : 'idle'} tone={card.tone} />
      <span className={styles.visuallyHidden}>{selectLabel}</span>
    </Button>
  )
}

export function LumenKanbanDesign({ copy, content, state, actions }: KanbanDesignProps) {
  const selectedColumn = content.columns.find((column) => column.cards.some((card) => card.id === state.selectedCardId))
  return (
    <Frame id="lumen-design-kanban" copy={copy} tone="warning">
      <div className={styles.boardHeader}>
        <h3>{copy.board}</h3>
        {selectedColumn && <span>{selectedColumn.title}</span>}
      </div>
      <div className={styles.board} aria-label={copy.board}>
        {content.columns.map((column) => (
          <section className={styles.column} key={column.id} aria-labelledby={`${column.id}-title`}>
            <header>
              <h3 id={`${column.id}-title`}>{column.title}</h3>
              <small>{column.count}</small>
            </header>
            <div className={styles.cardList}>
              {column.cards.map((card) => (
                <KanbanCardView
                  key={card.id}
                  card={card}
                  selected={card.id === state.selectedCardId}
                  onSelect={() => actions.onSelect(card.id)}
                  selectLabel={copy.select(card.title)}
                />
              ))}
            </div>
            {state.selectedCardId && selectedColumn?.id === column.id && (
              <div className={styles.moveActions} aria-label={copy.move}>
                {content.columns
                  .filter((target) => target.id !== column.id)
                  .map((target) => (
                    <Button key={target.id} onClick={() => actions.onMove(state.selectedCardId!, target.id)}>
                      {target.title}
                      <LumenIndicator edge="bottom" length="action" />
                    </Button>
                  ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </Frame>
  )
}

export function LumenWizardDesign({ copy, content, state, actions }: WizardDesignProps) {
  const stepIndex = Math.max(0, Math.min(content.steps.length - 1, state.currentStep))
  const step = content.steps[stepIndex]
  return (
    <Frame id="lumen-design-wizard" copy={copy} tone="info">
      <div className={styles.wizardLayout}>
        <nav className={styles.stepRail} aria-label={copy.steps}>
          {content.steps.map((item, index) => (
            <Button
              key={item.id}
              className={styles.stepButton}
              aria-current={index === stepIndex ? 'step' : undefined}
              onClick={() => actions.onStepChange(index)}
            >
              <span>
                <small>{String(index + 1).padStart(2, '0')}</small>
                <strong>{item.label}</strong>
              </span>
              <LumenIndicator edge="right" state={index === stepIndex ? 'selected' : 'idle'} />
            </Button>
          ))}
        </nav>
        <section className={styles.wizardBody} aria-labelledby="lumen-wizard-step-title">
          <div className={styles.sectionHeading}>
            <div>
              <h3 id="lumen-wizard-step-title">{step?.label}</h3>
              <p>{step?.detail}</p>
            </div>
            <span>{copy.progress(stepIndex + 1, content.steps.length)}</span>
          </div>
          <div className={styles.wizardFields}>
            {content.fields.map((field) => (
              <LumenField boundary="horizontal" key={field.id}>
                <LumenFormField controlId={`lumen-wizard-${field.id}`} label={field.label}>
                  <LumenInput
                    value={field.value}
                    placeholder={field.placeholder}
                    onChange={(event) => actions.onFieldChange(field.id, event.target.value)}
                  />
                </LumenFormField>
              </LumenField>
            ))}
          </div>
          <footer className={styles.wizardFooter}>
            <Button disabled={stepIndex === 0} onClick={() => actions.onStepChange(stepIndex - 1)}>
              {copy.back}
              <LumenIndicator edge="bottom" state={stepIndex === 0 ? 'disabled' : 'idle'} />
            </Button>
            <Button onClick={() => actions.onStepChange(Math.min(content.steps.length - 1, stepIndex + 1))}>
              {stepIndex === content.steps.length - 1 ? copy.finish : copy.next}
              <LumenIndicator edge="bottom" state="selected" tone="info" />
            </Button>
          </footer>
        </section>
      </div>
    </Frame>
  )
}

export function LumenDashboardDesign({ copy, content, actions }: DashboardDesignProps) {
  return (
    <Frame id="lumen-design-dashboard" copy={copy} tone="info">
      <div className={styles.metricGrid}>
        {content.metrics.map((metric) => (
          <article className={styles.metric} key={metric.id}>
            <small>{metric.label}</small>
            <strong>{metric.value}</strong>
            <span data-tone={metric.tone ?? 'neutral'}>{metric.change}</span>
          </article>
        ))}
      </div>
      <div className={styles.dashboardGrid}>
        <section className={styles.dashboardPanel} aria-label={copy.activity}>
          <div className={styles.sectionHeading}>
            <h3>{copy.activity}</h3>
            <span>{content.panels.length}</span>
          </div>
          <div className={styles.dashboardList}>
            {content.panels.map((panel) => (
              <Button
                className={styles.dashboardRow}
                key={panel.id}
                onClick={() => actions.onOpen(panel.id)}
                aria-label={copy.open(panel.title)}
              >
                <span>
                  <strong>{panel.title}</strong>
                  <small>{panel.detail}</small>
                </span>
                <span data-tone={panel.tone ?? 'neutral'}>{panel.value}</span>
              </Button>
            ))}
          </div>
        </section>
        <section className={styles.dashboardPanel} aria-label={copy.actions}>
          <h3>{copy.actions}</h3>
          {content.panels.slice(0, 3).map((panel) => (
            <Button className={styles.quickAction} key={panel.id} onClick={() => actions.onOpen(panel.id)}>
              {panel.title}
              <LumenIndicator edge="bottom" length="action" />
            </Button>
          ))}
        </section>
      </div>
    </Frame>
  )
}

export function LumenDataTableDesign({ copy, content, state, actions }: DataTableDesignProps) {
  const query = state.query.trim().toLocaleLowerCase()
  const rows = content.rows.filter((row) => row.values.join(' ').toLocaleLowerCase().includes(query))
  return (
    <Frame id="lumen-design-data-table" copy={copy} tone="info">
      <LumenField boundary="vertical" className={styles.tableSearch}>
        <LumenFormField controlId="lumen-design-table-search" label={copy.search} size="s">
          <LumenInput
            size="s"
            type="search"
            value={state.query}
            onChange={(event) => actions.onQueryChange(event.target.value)}
          />
        </LumenFormField>
      </LumenField>
      <div className={styles.tableShell} role="region" aria-label={copy.title}>
        <table>
          <thead>
            <tr>
              {content.columns.map((column) => (
                <th key={column.id} scope="col">
                  <span>{column.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const selected = row.id === state.selectedId
              return (
                <tr key={row.id} data-selected={selected}>
                  {row.values.map((value, index) => (
                    <td key={`${row.id}-${content.columns[index]?.id ?? index}`}>
                      {index === 0 ? (
                        <Button
                          className={styles.tableRowButton}
                          aria-pressed={selected}
                          aria-label={copy.select(value)}
                          onClick={() => actions.onSelect(row.id)}
                        >
                          {value}
                        </Button>
                      ) : (
                        value
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className={styles.empty}>{copy.empty}</p>}
      </div>
    </Frame>
  )
}

export function LumenMonitoringDesign({ copy, content }: MonitoringDesignProps) {
  const max = Math.max(1, ...content.points.map((point) => point.value))
  return (
    <Frame id="lumen-design-monitoring" copy={copy} tone="success">
      <section className={styles.monitorPanel} aria-label={copy.services}>
        <div className={styles.sectionHeading}>
          <h3>{copy.services}</h3>
          <span>{content.services.length}</span>
        </div>
        <div className={styles.serviceGrid}>
          {content.services.map((service) => {
            let state: 'running' | 'failed' | 'selected' = 'selected'
            if (service.running) {
              state = 'running'
            } else if (service.tone === 'danger') {
              state = 'failed'
            }
            return (
              <article className={styles.service} key={service.id}>
                <LumenIndicator edge="left" state={state} tone={service.tone} />
                <div>
                  <strong>{service.name}</strong>
                  <small>{service.detail}</small>
                </div>
                <span data-tone={service.tone}>{service.status}</span>
              </article>
            )
          })}
        </div>
      </section>
      <section className={styles.signalPanel} aria-label={copy.signal}>
        <div className={styles.sectionHeading}>
          <h3>{copy.signal}</h3>
          <span>{copy.value(content.points.at(-1)?.value ?? 0)}</span>
        </div>
        <div className={styles.signalLines}>
          {content.points.map((point) => (
            <span key={point.id} style={{ height: `${Math.max(6, (point.value / max) * 100)}%` }} />
          ))}
        </div>
      </section>
    </Frame>
  )
}

export function LumenNotificationsDesign({ copy, content, state, actions }: NotificationsDesignProps) {
  const items = content.items.filter((item) => !state.dismissedIds.includes(item.id))
  return (
    <Frame id="lumen-design-notifications" copy={copy} tone="warning">
      <section className={styles.notificationPanel} aria-label={copy.inbox}>
        <div className={styles.sectionHeading}>
          <h3>{copy.inbox}</h3>
          <span>{items.filter((item) => !state.readIds.includes(item.id)).length}</span>
        </div>
        <div className={styles.notificationList}>
          {items.map((item) => {
            const read = state.readIds.includes(item.id)
            return (
              <article className={styles.notification} data-read={read} key={item.id}>
                <LumenIndicator edge="left" state={read ? 'idle' : 'selected'} tone={item.tone} />
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <small>{item.time}</small>
                <div className={styles.notificationActions}>
                  {!read && <Button onClick={() => actions.onRead(item.id)}>{copy.markRead}</Button>}
                  <Button onClick={() => actions.onDismiss(item.id)}>{copy.dismiss}</Button>
                </div>
              </article>
            )
          })}
          {items.length === 0 && <p className={styles.empty}>{copy.dismiss}</p>}
        </div>
      </section>
    </Frame>
  )
}

export function LumenDialogDesign({ copy, content, state, actions }: DialogDesignProps) {
  return (
    <Frame id="lumen-design-app-dialog" copy={copy} tone="warning">
      <section className={styles.dialogStage} aria-label={copy.title}>
        <div className={styles.dialogPreview}>
          <strong>{copy.title}</strong>
          <span>{content.body}</span>
          <Button onClick={actions.onOpen}>
            {copy.open}
            <LumenIndicator edge="bottom" length="action" />
          </Button>
        </div>
        {state.open && (
          <div className={styles.dialogOverlay}>
            <LumenSurface className={styles.dialogPanel} material="frost" elevation="overlay">
              <section
                className={styles.dialogContent}
                data-lumen-dialog-content
                role="dialog"
                aria-modal="true"
                aria-labelledby="lumen-dialog-title"
              >
                <header className={styles.dialogHeader}>
                  <div>
                    <h3 id="lumen-dialog-title">{copy.title}</h3>
                    <p>{content.body}</p>
                  </div>
                  <LumenIndicator edge="left" state="selected" tone="warning" />
                </header>
                <ul className={styles.dialogDetails}>
                  {content.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
                <footer className={styles.dialogFooter}>
                  <Button onClick={actions.onClose}>
                    {copy.cancel}
                    <LumenIndicator edge="bottom" />
                  </Button>
                  <Button onClick={actions.onConfirm}>
                    {copy.confirm}
                    <LumenIndicator edge="bottom" state="selected" tone="warning" />
                  </Button>
                </footer>
              </section>
            </LumenSurface>
          </div>
        )}
      </section>
    </Frame>
  )
}

export function LumenSettingsFormDesign({ copy, content, state, actions }: SettingsFormDesignProps) {
  return (
    <Frame id="lumen-design-settings-form" copy={copy} tone="info">
      <div className={styles.settingsForm}>
        {content.fields.map((field) => (
          <div className={styles.settingsRow} key={field.id}>
            <div>
              <strong>{field.label}</strong>
              <small>{field.detail}</small>
            </div>
            <LumenField boundary="horizontal" className={styles.settingsField}>
              <LumenFormField controlId={`lumen-settings-${field.id}`} label={field.label} size="s">
                <LumenInput
                  size="s"
                  value={field.value}
                  placeholder={field.placeholder}
                  onChange={(event) => actions.onFieldChange(field.id, event.target.value)}
                />
              </LumenFormField>
            </LumenField>
          </div>
        ))}
      </div>
      <footer className={styles.settingsFooter}>
        <span role="status">{state.saved ? copy.saved : copy.detail}</span>
        <Button onClick={actions.onSave}>
          {copy.save}
          <LumenIndicator edge="bottom" state={state.saved ? 'selected' : 'idle'} tone="success" />
        </Button>
      </footer>
    </Frame>
  )
}

export function LumenOnboardingDesign({ copy, content, state, actions }: OnboardingDesignProps) {
  const index = Math.max(0, Math.min(content.steps.length - 1, state.currentStep))
  const step = content.steps[index]
  return (
    <Frame id="lumen-design-onboarding" copy={copy} tone="success">
      <nav className={styles.onboardingRail} aria-label={copy.steps}>
        {content.steps.map((item, itemIndex) => (
          <Button
            key={item.id}
            aria-current={itemIndex === index ? 'step' : undefined}
            onClick={() => actions.onStepChange(itemIndex)}
          >
            <span>{copy.stepLabel(itemIndex + 1, item.title)}</span>
            <LumenIndicator edge="bottom" state={itemIndex === index ? 'selected' : 'idle'} tone="success" />
          </Button>
        ))}
      </nav>
      <section className={styles.onboardingBody} aria-labelledby="lumen-onboarding-title">
        <LumenIndicator edge="left" state="running" tone="success" />
        <h3 id="lumen-onboarding-title">{step?.title}</h3>
        <p>{step?.detail}</p>
        <div className={styles.onboardingFooter}>
          <Button onClick={actions.onSkip}>
            {copy.skip}
            <LumenIndicator edge="bottom" />
          </Button>
          <Button onClick={() => actions.onStepChange(Math.min(content.steps.length - 1, index + 1))}>
            {index === content.steps.length - 1 ? copy.finish : copy.next}
            <LumenIndicator edge="bottom" state="selected" tone="success" />
          </Button>
        </div>
      </section>
    </Frame>
  )
}

function CategoryItemButton({
  item,
  selected,
  edge = 'left',
  indicator = true,
  onSelect,
}: {
  item: CategoryDesignItem
  selected: boolean
  edge?: 'bottom' | 'left' | 'right' | undefined
  indicator?: boolean | undefined
  onSelect: () => void
}) {
  return (
    <Button className={styles.categoryItem} aria-pressed={selected} onClick={onSelect} data-selected={selected}>
      {indicator && <LumenIndicator edge={edge} state={selected ? 'selected' : 'idle'} tone={item.tone} />}
      <span>
        <strong>{item.label}</strong>
        <small>{item.detail}</small>
      </span>
      {item.value && <em>{item.value}</em>}
    </Button>
  )
}

function CategoryProfile({ profile }: { profile: NonNullable<CategoryDesignProps['content']['profile']> }) {
  return (
    <section className={styles.categoryProfile} aria-label={profile.id}>
      <div>
        <code>{profile.id}</code>
        <span>{profile.surface}</span>
        <span>{profile.initialState}</span>
      </div>
      <p lang="en">{profile.scenario}</p>
    </section>
  )
}

function CategoryControls({
  controls,
  onAction,
}: {
  controls: readonly CategoryDesignItem[]
  onAction: (id: string) => void
}) {
  if (controls.length === 0) {
    return null
  }
  return (
    <nav className={styles.categoryControls} aria-label={controls.map((item) => item.label).join(', ')}>
      {controls.map((item) => (
        <Button key={item.id} onClick={() => onAction(item.id)}>
          {item.label}
          <LumenIndicator edge="bottom" length="action" tone={item.tone} />
        </Button>
      ))}
    </nav>
  )
}

export function LumenCategoryDesign({ id, copy, content, layout, state, actions }: CategoryDesignProps) {
  const query = state.query.trim().toLocaleLowerCase()
  const items = content.items.filter((item) => {
    if (!query) {
      return true
    }
    return `${item.label} ${item.detail}`.toLocaleLowerCase().includes(query)
  })
  const activeId = state.selectedId ?? items[0]?.id ?? null
  const selected = items.find((item) => item.id === activeId) ?? items[0]
  const tone = selected?.tone ?? 'info'
  const controls = content.controls ?? []
  const showSearch = !content.profile || controls.some((item) => item.id === 'search' || item.id === 'filter')

  const toolbar = (
    <div className={styles.categoryToolbar}>
      {showSearch && (
        <LumenField boundary="horizontal" className={styles.categorySearch}>
          <LumenFormField controlId={`${id}-search`} label={copy.search} size="s">
            <LumenInput
              size="s"
              type="search"
              value={state.query}
              onChange={(event) => actions.onQueryChange(event.target.value)}
            />
          </LumenFormField>
        </LumenField>
      )}
      <Button onClick={() => actions.onAction(selected?.id ?? '')}>
        {copy.primary}
        <LumenIndicator edge="bottom" length="action" />
      </Button>
    </div>
  )

  let body: React.ReactNode
  if (layout === 'calendar') {
    body = (
      <div className={styles.categoryCalendar}>
        {items.map((item, index) => (
          <Button
            key={item.id}
            aria-pressed={item.id === activeId}
            data-selected={item.id === activeId}
            onClick={() => actions.onSelect(item.id)}
          >
            <small>{String(index + 1).padStart(2, '0')}</small>
            <strong>{item.label}</strong>
            <span>{item.detail}</span>
            <LumenIndicator edge="bottom" state={item.id === activeId ? 'selected' : 'idle'} tone={item.tone} />
          </Button>
        ))}
      </div>
    )
  } else if (layout === 'form') {
    body = (
      <div className={styles.categoryForm}>
        {items.map((item) => (
          <LumenField boundary="horizontal" className={styles.categoryFormField} key={item.id}>
            <LumenFormField controlId={`${id}-${item.id}`} label={item.label} hint={item.detail}>
              <LumenInput
                value={state.values?.[item.id] ?? item.value ?? ''}
                readOnly={!actions.onItemChange}
                onChange={(event) => actions.onItemChange?.(item.id, event.target.value)}
              />
            </LumenFormField>
          </LumenField>
        ))}
      </div>
    )
  } else if (layout === 'grid') {
    body = (
      <div className={styles.categoryGrid}>
        {items.map((item) => (
          <CategoryItemButton
            key={item.id}
            item={item}
            selected={item.id === activeId}
            edge="bottom"
            onSelect={() => actions.onSelect(item.id)}
          />
        ))}
      </div>
    )
  } else if (layout === 'navigation' || layout === 'rail') {
    body = (
      <div className={layout === 'rail' ? styles.categoryRail : styles.categoryNavigation}>
        <nav aria-label={copy.secondary}>
          {items.map((item) => (
            <CategoryItemButton
              key={item.id}
              item={item}
              selected={item.id === activeId}
              edge="right"
              onSelect={() => actions.onSelect(item.id)}
            />
          ))}
        </nav>
        <article className={styles.categoryReading}>
          <LumenIndicator edge="left" state="selected" tone={tone} />
          <h3>{selected?.label ?? copy.secondary}</h3>
          <p>{selected?.detail ?? copy.detail}</p>
          {content.aside?.map((item) => (
            <div className={styles.categoryFact} key={item.id}>
              <span>{item.label}</span>
              <strong>{item.value ?? item.detail}</strong>
            </div>
          ))}
        </article>
      </div>
    )
  } else if (layout === 'overlay') {
    body = (
      <div className={styles.categoryOverlayStage}>
        <div className={styles.categoryOverlayContext}>
          {items.map((item) => (
            <span key={item.id}>{item.label}</span>
          ))}
        </div>
        <LumenSurface className={styles.categoryOverlayPanel} elevation="overlay">
          <section className={styles.categoryOverlayContent} data-lumen-overlay-content>
            <LumenIndicator edge="top" state="selected" tone={tone} />
            <small>{selected?.value ?? copy.secondary}</small>
            <h3>{selected?.label ?? copy.title}</h3>
            <p>{selected?.detail ?? copy.detail}</p>
            <Button onClick={() => actions.onAction(selected?.id ?? '')}>
              {copy.action}
              <LumenIndicator edge="bottom" length="action" tone={tone} />
            </Button>
          </section>
        </LumenSurface>
      </div>
    )
  } else if (layout === 'panel') {
    body = (
      <div className={styles.categoryPanel}>
        <article>
          <LumenIndicator edge="left" state="selected" tone={tone} />
          <small>{selected?.value ?? copy.secondary}</small>
          <h3>{selected?.label ?? copy.title}</h3>
          <p>{selected?.detail ?? copy.detail}</p>
        </article>
        <nav aria-label={copy.secondary}>
          {items.map((item) => (
            <CategoryItemButton
              key={item.id}
              item={item}
              selected={item.id === activeId}
              edge="bottom"
              onSelect={() => actions.onSelect(item.id)}
            />
          ))}
        </nav>
      </div>
    )
  } else if (layout === 'split') {
    body = (
      <div className={styles.categorySplit}>
        <nav aria-label={copy.secondary}>
          {items.map((item) => (
            <CategoryItemButton
              key={item.id}
              item={item}
              selected={item.id === activeId}
              edge="right"
              onSelect={() => actions.onSelect(item.id)}
            />
          ))}
        </nav>
        <article>
          <LumenIndicator edge="left" state="selected" tone={tone} />
          <small>{selected?.value ?? copy.secondary}</small>
          <h3>{selected?.label ?? copy.title}</h3>
          <p>{selected?.detail ?? copy.detail}</p>
          {(content.aside ?? []).map((item) => (
            <div className={styles.categoryFact} key={item.id}>
              <span>{item.label}</span>
              <strong>{item.value ?? item.detail}</strong>
            </div>
          ))}
        </article>
      </div>
    )
  } else if (layout === 'stream') {
    body = (
      <div className={styles.categoryStream}>
        {items.map((item) => (
          <article key={item.id} data-selected={item.id === activeId}>
            <LumenIndicator
              edge="left"
              state={item.id === activeId ? (item.state ?? 'running') : 'idle'}
              tone={item.tone}
            />
            <Button onClick={() => actions.onSelect(item.id)}>
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
              <small>{item.value}</small>
            </Button>
          </article>
        ))}
      </div>
    )
  } else if (layout === 'table') {
    body = (
      <div className={styles.categoryTable} role="table" aria-label={copy.secondary}>
        {items.map((item) => (
          <div role="row" data-selected={item.id === activeId} key={item.id}>
            <span role="cell">
              <Button onClick={() => actions.onSelect(item.id)}>{item.label}</Button>
            </span>
            <span role="cell">{item.detail}</span>
            <strong role="cell">{item.value ?? copy.secondary}</strong>
          </div>
        ))}
      </div>
    )
  } else if (layout === 'timeline') {
    body = (
      <div className={styles.categoryTimeline}>
        {items.map((item) => (
          <article className={styles.categoryTimelineItem} key={item.id}>
            <LumenIndicator edge="left" state={item.id === activeId ? 'running' : 'idle'} tone={item.tone} />
            <CategoryItemButton
              item={item}
              selected={item.id === activeId}
              indicator={false}
              onSelect={() => actions.onSelect(item.id)}
            />
          </article>
        ))}
      </div>
    )
  } else if (layout === 'chat') {
    body = (
      <div className={styles.categoryChat}>
        <div className={styles.categoryMessages} aria-label={copy.secondary}>
          {items.map((item, index) => (
            <article data-side={index % 2 === 0 ? 'start' : 'end'} key={item.id}>
              <LumenIndicator edge={index % 2 === 0 ? 'left' : 'right'} tone={item.tone} />
              <strong>{item.label}</strong>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
        <LumenField boundary="vertical" className={styles.categoryComposer}>
          <LumenFormField controlId={`${id}-composer`} label={copy.input}>
            <LumenTextarea
              rows={2}
              placeholder={copy.secondary}
              value={state.input}
              onChange={(event) => actions.onInputChange(event.target.value)}
            />
          </LumenFormField>
          <Button className={styles.categoryComposerAction} onClick={() => actions.onAction(selected?.id ?? '')}>
            {copy.action}
          </Button>
        </LumenField>
      </div>
    )
  } else if (layout === 'editor') {
    body = (
      <div className={styles.categoryEditor}>
        <nav aria-label={copy.secondary}>
          {items.map((item) => (
            <CategoryItemButton
              key={item.id}
              item={item}
              selected={item.id === activeId}
              edge="right"
              onSelect={() => actions.onSelect(item.id)}
            />
          ))}
        </nav>
        <LumenField boundary="vertical" className={styles.categoryEditorField}>
          <LumenFormField controlId={`${id}-editor`} label={selected?.label ?? copy.secondary}>
            <LumenTextarea
              rows={7}
              value={state.input}
              onChange={(event) => actions.onInputChange(event.target.value)}
            />
          </LumenFormField>
          <Button onClick={() => actions.onAction(selected?.id ?? '')}>
            {copy.action}
            <LumenIndicator edge="bottom" state="selected" />
          </Button>
        </LumenField>
      </div>
    )
  } else if (layout === 'commerce') {
    body = (
      <div className={styles.categoryCommerce}>
        {(content.metrics ?? items.slice(0, 3)).map((item) => (
          <article key={item.id}>
            <LumenIndicator edge="top" tone={item.tone} />
            <small>{item.label}</small>
            <strong>{item.value ?? item.detail}</strong>
            <p>{item.detail}</p>
          </article>
        ))}
        <div className={styles.categoryCommerceList}>
          {items.map((item) => (
            <CategoryItemButton
              key={item.id}
              item={item}
              selected={item.id === activeId}
              edge="bottom"
              onSelect={() => actions.onSelect(item.id)}
            />
          ))}
        </div>
      </div>
    )
  } else if (layout === 'comments') {
    body = (
      <div className={styles.categoryComments}>
        {items.map((item) => (
          <article key={item.id}>
            <LumenIndicator edge="left" tone={item.tone} />
            <div>
              <strong>{item.label}</strong>
              <p>{item.detail}</p>
            </div>
            <Button onClick={() => actions.onSelect(item.id)}>
              {item.value ?? copy.secondary}
              <LumenIndicator edge="bottom" length="action" />
            </Button>
          </article>
        ))}
      </div>
    )
  } else {
    body = (
      <div className={styles.categoryList}>
        {items.map((item) => (
          <CategoryItemButton
            key={item.id}
            item={item}
            selected={item.id === activeId}
            onSelect={() => actions.onSelect(item.id)}
          />
        ))}
        {items.length === 0 && <p className={styles.empty}>{copy.detail}</p>}
      </div>
    )
  }

  return (
    <Frame id={id} copy={copy} tone={tone} layout={layout} sourceId={content.profile?.id}>
      {content.profile && <CategoryProfile profile={content.profile} />}
      {toolbar}
      {body}
      <CategoryControls controls={controls.slice(1)} onAction={actions.onAction} />
    </Frame>
  )
}
