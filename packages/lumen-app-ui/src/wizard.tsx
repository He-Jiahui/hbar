'use client'

import * as React from 'react'
import { LumenFormField, LumenInput, LumenCheckBox, LumenChoiceSelect } from './forms'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenIconButton, LumenStatus, LumenText } from './primitives'
import InformationReference from './wizard/InformationReference'
import InvoiceReference from './wizard/InvoiceReference'
import UpgradeReference from './wizard/UpgradeReference'
import EnvironmentReference from './wizard/EnvironmentReference'
import ReviewReference from './wizard/ReviewReference'
import MigrationReference from './wizard/MigrationReference'
import ShippingReference from './wizard/ShippingReference'
import './wizard.css'
import './wizard-information-reference.css'
import './wizard-invoice-reference.css'
import './wizard-upgrade-reference.css'
import './wizard-environment-reference.css'
import './wizard-review-reference.css'
import './wizard-migration-reference.css'
import './wizard-shipping-reference.css'
import { LumenProgress, LumenRadioGroup } from './ui-controls'

export interface LumenWizardListStrategy {
  readonly kind: 'content-grown' | 'pane-scroll'
  readonly expectedMaximum: number
}

export interface LumenWizardChoice {
  readonly id: string
  readonly label: string
  readonly detail?: string | undefined
}

export interface LumenWizardStep extends LumenWizardChoice {}

export interface LumenWizardFieldValue {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly type?: 'text' | 'email' | 'tel' | 'date' | undefined
  readonly required?: boolean | undefined
}

export interface LumenWizardReferenceField {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly kind: 'text' | 'email' | 'tel' | 'select'
  readonly required?: boolean | undefined
  readonly prefix?: string | undefined
  readonly options?: readonly LumenWizardChoice[] | undefined
}

export interface LumenWizardReferenceInvoiceField {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly kind: 'text' | 'select'
  readonly options?: readonly LumenWizardChoice[] | undefined
  readonly icon?: 'building' | 'hash' | 'calendar' | undefined
  readonly information?: boolean | undefined
  readonly clear?: boolean | undefined
}

export interface LumenWizardReferenceUpgradePlan extends LumenWizardChoice {
  readonly price: string
  readonly badge?: string | undefined
}

export interface LumenWizardReferenceUpgradeRow {
  readonly id: string
  readonly label: string
  readonly detail?: string | undefined
  readonly value: string
}

export interface LumenWizardReferenceEnvironmentService extends LumenWizardChoice {
  readonly icon: 'database' | 'cache' | 'storage' | 'queue' | 'clock' | 'search' | 'activity' | 'log'
  readonly deploySeconds: number
}

export interface LumenWizardReferenceReviewSection {
  readonly id: string
  readonly title: string
  readonly rows: readonly { readonly id: string; readonly label: string; readonly value: string }[]
}

export interface LumenWizardReferenceMigrationTask extends LumenWizardChoice {
  readonly status: 'complete' | 'running' | 'queued' | 'warning'
  readonly action?: string | undefined
}

export interface LumenWizardReferenceShippingQuestion {
  readonly id: string
  readonly title: string
  readonly detail: string
  readonly options: readonly LumenWizardChoice[]
}

export interface LumenWizardInformationContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly steps: string
    readonly back: string
    readonly next: string
    readonly complete: string
    readonly required: string
    readonly empty: string
  }
  readonly steps: readonly LumenWizardStep[]
  readonly fields: readonly LumenWizardFieldValue[]
  readonly listStrategy: LumenWizardListStrategy
}

export interface LumenWizardInvoiceContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly close: string
    readonly customer: string
    readonly invoice: string
    readonly currency: string
    readonly terms: string
    readonly notes: string
    readonly save: string
    readonly send: string
    readonly empty: string
  }
  readonly fields: readonly LumenWizardFieldValue[]
  readonly currencies: readonly LumenWizardChoice[]
  readonly initialCurrencyId: string
  readonly terms: readonly LumenWizardChoice[]
  readonly initialTermsId: string
  readonly note: string
  readonly listStrategy: LumenWizardListStrategy
}

export interface LumenWizardPlan extends LumenWizardChoice {
  readonly price: string
  readonly badge?: string | undefined
}

export interface LumenWizardSummaryRow {
  readonly id: string
  readonly label: string
  readonly value: string
}

export interface LumenWizardUpgradeContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly plans: string
    readonly invoice: string
    readonly due: string
    readonly next: string
    readonly empty: string
  }
  readonly plans: readonly LumenWizardPlan[]
  readonly initialPlanId: string
  readonly summaries: Readonly<Record<string, readonly LumenWizardSummaryRow[]>>
  readonly totals: Readonly<Record<string, string>>
  readonly listStrategy: LumenWizardListStrategy
}

export interface LumenWizardService extends LumenWizardChoice {}

export interface LumenWizardEnvironmentContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly services: string
    readonly back: string
    readonly save: string
    readonly next: string
    readonly selected: (count: number, total: number) => string
    readonly empty: string
  }
  readonly services: readonly LumenWizardService[]
  readonly initialServiceIds: readonly string[]
  readonly listStrategy: LumenWizardListStrategy
}

export interface LumenWizardReviewSection extends LumenWizardChoice {
  readonly value: string
  readonly status?: string | undefined
}

export interface LumenWizardReviewContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly edit: (label: string) => string
    readonly back: string
    readonly submit: string
    readonly submitted: string
    readonly empty: string
  }
  readonly sections: readonly LumenWizardReviewSection[]
  readonly listStrategy: LumenWizardListStrategy
}

export interface LumenWizardMigrationItem extends LumenWizardChoice {
  readonly status: string
  readonly progress: number
}

export interface LumenWizardMigrationContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly cancel: string
    readonly continue: string
    readonly progress: (value: number) => string
    readonly empty: string
  }
  readonly items: readonly LumenWizardMigrationItem[]
  readonly listStrategy: LumenWizardListStrategy
}

export interface LumenWizardShippingContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly options: string
    readonly back: string
    readonly continue: string
    readonly empty: string
  }
  readonly options: readonly LumenWizardChoice[]
  readonly initialOptionId: string
  readonly selectedOptionId?: string | undefined
  readonly onOptionChange?: ((optionId: string) => void) | undefined
  readonly listStrategy: LumenWizardListStrategy
}

export interface LumenWizardContent {
  readonly referenceShipping?:
    | {
        readonly labels: {
          readonly progress: (step: number, total: number) => string
          readonly question: (step: number) => string
          readonly previous: string
          readonly continue: string
          readonly finish: string
          readonly skip: string
          readonly empty: string
        }
        readonly questions: readonly LumenWizardReferenceShippingQuestion[]
        readonly currentQuestionId: string
        readonly selectedOptionIds: Readonly<Record<string, string | undefined>>
        readonly listStrategy: LumenWizardListStrategy
        readonly onQuestionChange: (questionId: string) => void
        readonly onOptionChange: (questionId: string, optionId: string) => void
      }
    | undefined
  readonly referenceMigration?:
    | {
        readonly labels: {
          readonly title: string
          readonly detail: string
          readonly remaining: string
          readonly progress: (value: number) => string
          readonly progressBar: string
          readonly safety: string
          readonly cancel: string
          readonly background: string
          readonly empty: string
        }
        readonly tasks: readonly LumenWizardReferenceMigrationTask[]
        readonly progress: number
        readonly progressStep: number
        readonly progressIntervalMs: number
        readonly progressCeiling: number
        readonly listStrategy: LumenWizardListStrategy
      }
    | undefined
  readonly referenceReview?:
    | {
        readonly labels: {
          readonly title: string
          readonly detail: string
          readonly edit: string
          readonly editSection: (title: string) => string
          readonly confirmation: string
          readonly back: string
          readonly send: string
          readonly empty: string
        }
        readonly steps: readonly LumenWizardStep[]
        readonly currentStepId: string
        readonly completedStepIds: readonly string[]
        readonly sections: readonly LumenWizardReferenceReviewSection[]
        readonly confirmed: boolean
        readonly listStrategy: LumenWizardListStrategy
        readonly onConfirmationChange: (checked: boolean) => void
      }
    | undefined
  readonly referenceEnvironment?:
    | {
        readonly labels: {
          readonly title: string
          readonly detail: string
          readonly back: string
          readonly save: string
          readonly heading: string
          readonly subtitle: string
          readonly group: string
          readonly safety: string
          readonly selection: (count: number, total: number) => string
          readonly estimate: (seconds: number) => string
          readonly next: string
          readonly empty: string
        }
        readonly steps: readonly LumenWizardStep[]
        readonly currentStepId: string
        readonly completedStepIds: readonly string[]
        readonly services: readonly LumenWizardReferenceEnvironmentService[]
        readonly selectedServiceIds: readonly string[]
        readonly listStrategy: LumenWizardListStrategy
        readonly onServiceToggle: (serviceId: string) => void
      }
    | undefined
  readonly referenceUpgrade?:
    | {
        readonly labels: {
          readonly title: string
          readonly detail: string
          readonly draft: string
          readonly plan: string
          readonly seatNote: string
          readonly invoice: string
          readonly annual: string
          readonly due: string
          readonly totalDetail: string
          readonly footer: string
          readonly next: string
        }
        readonly steps: readonly LumenWizardStep[]
        readonly plans: readonly LumenWizardReferenceUpgradePlan[]
        readonly summaryRows: readonly LumenWizardReferenceUpgradeRow[]
        readonly metadataRows: readonly LumenWizardReferenceUpgradeRow[]
        readonly total: string
        readonly listStrategy: LumenWizardListStrategy
        readonly stepId: string
        readonly selectedPlanId: string
        readonly onStepChange: (stepId: string) => void
        readonly onPlanChange: (planId: string) => void
      }
    | undefined
  readonly referenceInvoice?:
    | {
        readonly labels: {
          readonly title: string
          readonly progress: (step: number, total: number) => string
          readonly progressBar: string
          readonly close: string
          readonly customer: string
          readonly customerDetail: string
          readonly customerGroup: string
          readonly customerGroupDetail: string
          readonly required: string
          readonly terms: string
          readonly termsDetail: string
          readonly currencyBadge: string
          readonly termsBadge: string
          readonly clearCustomer: string
          readonly save: string
          readonly next: string
        }
        readonly step: number
        readonly totalSteps: number
        readonly listStrategy: LumenWizardListStrategy
        readonly customerFields: readonly LumenWizardReferenceInvoiceField[]
        readonly termsFields: readonly LumenWizardReferenceInvoiceField[]
        readonly onFieldChange: (fieldId: string, value: string) => void
      }
    | undefined
  readonly referenceInformation?:
    | {
        readonly labels: {
          readonly title: string
          readonly detail: string
          readonly emailHint: string
          readonly back: string
          readonly next: string
          readonly steps: string
          readonly required: string
          readonly empty: string
        }
        readonly steps: readonly LumenWizardStep[]
        readonly fields: readonly LumenWizardReferenceField[]
        readonly stepId: string
        readonly onStepChange: (stepId: string) => void
        readonly onFieldChange: (fieldId: string, value: string) => void
      }
    | undefined
  readonly information?: LumenWizardInformationContent | undefined
  readonly invoice?: LumenWizardInvoiceContent | undefined
  readonly upgrade?: LumenWizardUpgradeContent | undefined
  readonly environment?: LumenWizardEnvironmentContent | undefined
  readonly review?: LumenWizardReviewContent | undefined
  readonly migration?: LumenWizardMigrationContent | undefined
  readonly shipping?: LumenWizardShippingContent | undefined
}

export interface LumenWizardProviderProps {
  readonly content: LumenWizardContent
  readonly children: React.ReactNode
}

export interface LumenWizardAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenWizardProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenWizardContent | undefined
  readonly onAction?: ((event: LumenWizardAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
}

export type LumenWizardVariantProps = Omit<LumenWizardProps, 'variant' | 'variantId'>

const Context = React.createContext<LumenWizardContent | undefined>(undefined)

export function LumenWizardProvider({ content, children }: LumenWizardProviderProps) {
  return <Context.Provider value={content}>{children}</Context.Provider>
}

export function useLumenWizardContent() {
  return React.useContext(Context)
}

export function uniqueLumenWizardItems<T extends { readonly id: string }>(items: readonly T[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function selectLumenWizardItem<T extends { readonly id: string }>(items: readonly T[], id: string | undefined) {
  return items.find((item) => item.id === id) ?? items[0]
}

const report = (fn: LumenWizardProps['onAction'], actionId: string, value?: string) =>
  fn?.(value === undefined ? { actionId } : { actionId, value })

function Glyph({ name }: { name: 'back' | 'next' | 'close' | 'check' | 'service' }) {
  const paths = {
    back: 'm10 3-5 5 5 5M5 8h8',
    next: 'm6 3 5 5-5 5M3 8h8',
    close: 'M3 3l10 10M13 3 3 13',
    check: 'm3 8 3 3 7-7',
    service: 'M3 5.5 8 3l5 2.5v5L8 13l-5-2.5z',
  } as const
  return (
    <svg className="lumen-wizard-glyph" viewBox="0 0 16 16" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}

function Root({
  variant,
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  children,
}: Omit<LumenWizardProps, 'content' | 'onAction'> & { readonly children: React.ReactNode }) {
  const plain =
    variant === 1 ||
    Boolean(className?.includes('hbar-app-ui-wizard-invoice-reference')) ||
    Boolean(className?.includes('hbar-app-ui-wizard-upgrade-reference')) ||
    Boolean(className?.includes('hbar-app-ui-wizard-environment-reference')) ||
    Boolean(className?.includes('hbar-app-ui-wizard-review-reference')) ||
    Boolean(className?.includes('hbar-app-ui-wizard-migration-reference')) ||
    Boolean(className?.includes('hbar-app-ui-wizard-shipping-reference'))
  const contentClassName = [
    'lumen-wizard-stage',
    `hbar-app-ui-wizard-variant-${variant}`,
    density ? `hbar-app-ui-density-${density}` : '',
    surface ? `hbar-app-ui-surface-${surface}` : '',
    state ? `hbar-app-ui-state-${state}` : '',
    visualMode ? `hbar-app-ui-visual-${visualMode}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <LumenSurface
      as={plain ? 'div' : 'section'}
      boundary={plain ? 'none' : 'horizontal'}
      className="lumen-wizard-stage-surface"
      contentClassName={contentClassName}
      data-lumen-component="wizard"
      data-lumen-variant={variant}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-state={state}
    >
      {children}
    </LumenSurface>
  )
}

function Frame({ children }: { readonly children: React.ReactNode }) {
  return <div className="lumen-wizard-frame">{children}</div>
}

function Header({ title, detail, actions }: { title: string; detail: string; actions?: React.ReactNode }) {
  return (
    <header className="lumen-wizard-header">
      <div>
        <LumenText as="h1" variant="title">
          {title}
        </LumenText>
        <LumenText as="p" tone="muted">
          {detail}
        </LumenText>
      </div>
      {actions ? <div className="lumen-wizard-actions">{actions}</div> : null}
    </header>
  )
}

function Footer({ children }: { readonly children: React.ReactNode }) {
  return <footer className="lumen-wizard-footer">{children}</footer>
}

function StepRail({
  steps,
  currentId,
  label,
  onChange,
}: {
  readonly steps: readonly LumenWizardStep[]
  readonly currentId: string | undefined
  readonly label: string
  readonly onChange: (id: string) => void
}) {
  return (
    <nav className="lumen-wizard-steps" aria-label={label}>
      {steps.map((step, index) => (
        <LumenButton
          key={step.id}
          variant="text"
          aria-current={step.id === currentId ? 'step' : undefined}
          onClick={() => onChange(step.id)}
        >
          <span>{index + 1}</span>
          {step.label}
        </LumenButton>
      ))}
    </nav>
  )
}

function Empty({ children }: { readonly children: string }) {
  return (
    <LumenText as="p" className="lumen-wizard-empty" tone="muted">
      {children}
    </LumenText>
  )
}

function Information(props: Omit<LumenWizardProps, 'content'> & { content: LumenWizardInformationContent }) {
  const steps = uniqueLumenWizardItems(props.content.steps)
  const fields = uniqueLumenWizardItems(props.content.fields)
  const [stepId, setStepId] = React.useState(steps[0]?.id)
  const active = selectLumenWizardItem(steps, stepId)
  const [values, setValues] = React.useState(() => Object.fromEntries(fields.map((field) => [field.id, field.value])))
  const move = (delta: number) => {
    const index = Math.max(
      0,
      steps.findIndex((step) => step.id === active?.id),
    )
    const next = steps[Math.max(0, Math.min(steps.length - 1, index + delta))]
    if (next) {
      setStepId(next.id)
      report(props.onAction, 'step', next.id)
    }
  }
  return (
    <Root {...props}>
      <Frame>
        <StepRail
          steps={steps}
          currentId={active?.id}
          label={props.content.labels.steps}
          onChange={(id) => {
            setStepId(id)
            report(props.onAction, 'step', id)
          }}
        />
        <main className="lumen-wizard-main">
          <Header title={props.content.labels.title} detail={props.content.labels.detail} />
          {fields.length ? (
            <form
              className="lumen-wizard-form hbar-app-ui-wizard-information-form"
              onSubmit={(event) => {
                event.preventDefault()
                move(1)
              }}
            >
              {fields.map((field) => (
                <LumenFormField
                  key={field.id}
                  controlId={`wizard-information-${field.id}`}
                  label={field.label}
                  required={field.required}
                  requiredIndicator={props.content.labels.required}
                >
                  <LumenInput
                    type={field.type ?? 'text'}
                    value={values[field.id] ?? ''}
                    onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
                  />
                </LumenFormField>
              ))}
            </form>
          ) : (
            <Empty>{props.content.labels.empty}</Empty>
          )}
        </main>
        <Footer>
          <LumenButton variant="text" disabled={active?.id === steps[0]?.id} onClick={() => move(-1)}>
            <Glyph name="back" />
            {props.content.labels.back}
          </LumenButton>
          <LumenButton tone="primary" onClick={() => move(1)}>
            {active?.id === steps.at(-1)?.id ? props.content.labels.complete : props.content.labels.next}
            <Glyph name="next" />
          </LumenButton>
        </Footer>
      </Frame>
    </Root>
  )
}

function Invoice(props: Omit<LumenWizardProps, 'content'> & { content: LumenWizardInvoiceContent }) {
  const fields = uniqueLumenWizardItems(props.content.fields)
  const currencies = uniqueLumenWizardItems(props.content.currencies)
  const terms = uniqueLumenWizardItems(props.content.terms)
  const [currencyId, setCurrencyId] = React.useState(props.content.initialCurrencyId)
  const [termsId, setTermsId] = React.useState(props.content.initialTermsId)
  return (
    <Root {...props}>
      <Frame>
        <Header
          title={props.content.labels.title}
          detail={props.content.labels.detail}
          actions={
            <LumenIconButton label={props.content.labels.close} onClick={() => report(props.onAction, 'close')}>
              <Glyph name="close" />
            </LumenIconButton>
          }
        />
        <main className="lumen-wizard-main">
          <form
            className="lumen-wizard-card hbar-app-ui-wizard-invoice-card"
            onSubmit={(event) => {
              event.preventDefault()
              report(props.onAction, 'send')
            }}
          >
            <LumenText as="h2" variant="heading">
              {props.content.labels.customer}
            </LumenText>
            {fields.length ? (
              <div className="lumen-wizard-form">
                {fields.map((field) => (
                  <LumenFormField
                    key={field.id}
                    controlId={`wizard-invoice-${field.id}`}
                    label={field.label}
                    required={field.required}
                  >
                    <LumenInput defaultValue={field.value} type={field.type ?? 'text'} />
                  </LumenFormField>
                ))}
              </div>
            ) : (
              <Empty>{props.content.labels.empty}</Empty>
            )}
            <div className="lumen-wizard-form lumen-wizard-form-compact">
              <LumenFormField controlId="wizard-invoice-currency" label={props.content.labels.currency}>
                <LumenChoiceSelect
                  id="wizard-invoice-currency"
                  label={props.content.labels.currency}
                  options={currencies}
                  value={selectLumenWizardItem(currencies, currencyId)?.id ?? null}
                  onValueChange={(id) => {
                    setCurrencyId(id)
                    report(props.onAction, 'currency', id)
                  }}
                />
              </LumenFormField>
              <LumenFormField controlId="wizard-invoice-terms" label={props.content.labels.terms}>
                <LumenChoiceSelect
                  id="wizard-invoice-terms"
                  label={props.content.labels.terms}
                  options={terms}
                  value={selectLumenWizardItem(terms, termsId)?.id ?? null}
                  onValueChange={(id) => {
                    setTermsId(id)
                    report(props.onAction, 'terms', id)
                  }}
                />
              </LumenFormField>
            </div>
            <LumenText as="p" tone="muted">
              {props.content.note}
            </LumenText>
          </form>
        </main>
        <Footer>
          <LumenButton variant="text" onClick={() => report(props.onAction, 'save')}>
            {props.content.labels.save}
          </LumenButton>
          <LumenButton tone="primary" onClick={() => report(props.onAction, 'send')}>
            {props.content.labels.send}
            <Glyph name="next" />
          </LumenButton>
        </Footer>
      </Frame>
    </Root>
  )
}

function Upgrade(props: Omit<LumenWizardProps, 'content'> & { content: LumenWizardUpgradeContent }) {
  const plans = uniqueLumenWizardItems(props.content.plans)
  const [planId, setPlanId] = React.useState(props.content.initialPlanId)
  const plan = selectLumenWizardItem(plans, planId)
  const summary = plan ? (props.content.summaries[plan.id] ?? []) : []
  return (
    <Root {...props}>
      <Frame>
        <Header title={props.content.labels.title} detail={props.content.labels.detail} />
        <main className="lumen-wizard-split">
          <section>
            <LumenText as="h2" variant="heading">
              {props.content.labels.plans}
            </LumenText>
            {plans.length ? (
              <LumenRadioGroup
                className="lumen-wizard-choice-list hbar-app-ui-wizard-plan-list"
                name={`${props.variantId}-plan`}
                label={props.content.labels.plans}
                hideLabel
                appearance="card"
                value={plan?.id ?? null}
                listStrategyKind={props.content.listStrategy.kind}
                options={plans.map((item) => ({
                  id: item.id,
                  label: item.label,
                  description: item.detail,
                  endAdornment: (
                    <React.Fragment>
                      {item.badge ? <LumenStatus value={item.badge} tone="success" /> : null}
                      <b>{item.price}</b>
                    </React.Fragment>
                  ),
                }))}
                onValueChange={(id) => {
                  setPlanId(id)
                  report(props.onAction, 'plan', id)
                }}
              />
            ) : (
              <Empty>{props.content.labels.empty}</Empty>
            )}
          </section>
          <aside className="lumen-wizard-summary">
            <LumenText as="h2" variant="heading">
              {props.content.labels.invoice}
            </LumenText>
            <div className="lumen-wizard-total">
              <small>{props.content.labels.due}</small>
              <strong>{plan ? props.content.totals[plan.id] : null}</strong>
            </div>
            <dl>
              {summary.map((row) => (
                <div key={row.id}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </main>
        <Footer>
          <span />
          <LumenButton tone="primary" onClick={() => report(props.onAction, 'next', plan?.id)}>
            {props.content.labels.next}
            <Glyph name="next" />
          </LumenButton>
        </Footer>
      </Frame>
    </Root>
  )
}

function Environment(props: Omit<LumenWizardProps, 'content'> & { content: LumenWizardEnvironmentContent }) {
  const services = uniqueLumenWizardItems(props.content.services)
  const validIds = new Set(services.map((item) => item.id))
  const [selected, setSelected] = React.useState(
    () => new Set(props.content.initialServiceIds.filter((id) => validIds.has(id))),
  )
  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
    report(props.onAction, 'service', id)
  }
  return (
    <Root {...props}>
      <Frame>
        <Header
          title={props.content.labels.title}
          detail={props.content.labels.detail}
          actions={
            <LumenButton variant="text" onClick={() => report(props.onAction, 'save')}>
              {props.content.labels.save}
            </LumenButton>
          }
        />
        <main className="lumen-wizard-main">
          <LumenText as="h2" variant="heading">
            {props.content.labels.services}
          </LumenText>
          {services.length ? (
            <div
              className="lumen-wizard-service-grid hbar-app-ui-wizard-service-grid"
              role="group"
              aria-label={props.content.labels.services}
              data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}
            >
              {services.map((service) => (
                <LumenCheckBox
                  key={service.id}
                  label={service.label}
                  description={service.detail}
                  checked={selected.has(service.id)}
                  onChange={() => toggle(service.id)}
                />
              ))}
            </div>
          ) : (
            <Empty>{props.content.labels.empty}</Empty>
          )}
        </main>
        <Footer>
          <LumenButton variant="text" onClick={() => report(props.onAction, 'back')}>
            <Glyph name="back" />
            {props.content.labels.back}
          </LumenButton>
          <LumenText as="span" tone="muted">
            {props.content.labels.selected(selected.size, services.length)}
          </LumenText>
          <LumenButton tone="primary" onClick={() => report(props.onAction, 'next')}>
            {props.content.labels.next}
            <Glyph name="next" />
          </LumenButton>
        </Footer>
      </Frame>
    </Root>
  )
}

function Review(props: Omit<LumenWizardProps, 'content'> & { content: LumenWizardReviewContent }) {
  const sections = uniqueLumenWizardItems(props.content.sections)
  const [submitted, setSubmitted] = React.useState(false)
  return (
    <Root {...props}>
      <Frame>
        <Header
          title={props.content.labels.title}
          detail={props.content.labels.detail}
          actions={submitted ? <LumenStatus value={props.content.labels.submitted} tone="success" /> : undefined}
        />
        <main className="lumen-wizard-main">
          {sections.length ? (
            <div
              className="lumen-wizard-review-sections hbar-app-ui-wizard-review-sections"
              data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}
            >
              {sections.map((section) => (
                <section key={section.id}>
                  <div>
                    <LumenText as="h2" variant="heading">
                      {section.label}
                    </LumenText>
                    {section.detail ? (
                      <LumenText as="p" tone="muted">
                        {section.detail}
                      </LumenText>
                    ) : null}
                  </div>
                  <strong>{section.value}</strong>
                  {section.status ? <LumenStatus value={section.status} tone="success" /> : null}
                  <LumenButton variant="text" onClick={() => report(props.onAction, 'edit', section.id)}>
                    {props.content.labels.edit(section.label)}
                  </LumenButton>
                </section>
              ))}
            </div>
          ) : (
            <Empty>{props.content.labels.empty}</Empty>
          )}
        </main>
        <Footer>
          <LumenButton variant="text" onClick={() => report(props.onAction, 'back')}>
            <Glyph name="back" />
            {props.content.labels.back}
          </LumenButton>
          <LumenButton
            tone="primary"
            disabled={submitted}
            onClick={() => {
              setSubmitted(true)
              report(props.onAction, 'submit')
            }}
          >
            {submitted ? props.content.labels.submitted : props.content.labels.submit}
            <Glyph name="next" />
          </LumenButton>
        </Footer>
      </Frame>
    </Root>
  )
}

function Migration(props: Omit<LumenWizardProps, 'content'> & { content: LumenWizardMigrationContent }) {
  const items = uniqueLumenWizardItems(props.content.items)
  return (
    <Root {...props}>
      <Frame>
        <Header title={props.content.labels.title} detail={props.content.labels.detail} />
        <main className="lumen-wizard-main">
          {items.length ? (
            <div
              className="lumen-wizard-migration-list hbar-app-ui-wizard-migration-list"
              data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}
            >
              {items.map((item) => {
                const value = Math.max(0, Math.min(100, item.progress))
                return (
                  <article key={item.id}>
                    <div>
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.detail}</small>
                      </span>
                      <LumenStatus value={item.status} tone={value === 100 ? 'success' : 'neutral'} />
                    </div>
                    <LumenProgress
                      className="lumen-wizard-progress"
                      label={item.label}
                      value={value}
                      tone={value === 100 ? 'success' : 'info'}
                    />
                    <LumenText as="small" tone="muted">
                      {props.content.labels.progress(value)}
                    </LumenText>
                  </article>
                )
              })}
            </div>
          ) : (
            <Empty>{props.content.labels.empty}</Empty>
          )}
        </main>
        <Footer>
          <LumenButton variant="text" tone="danger" onClick={() => report(props.onAction, 'cancel')}>
            {props.content.labels.cancel}
          </LumenButton>
          <LumenButton tone="primary" onClick={() => report(props.onAction, 'continue')}>
            {props.content.labels.continue}
            <Glyph name="next" />
          </LumenButton>
        </Footer>
      </Frame>
    </Root>
  )
}

function Shipping(props: Omit<LumenWizardProps, 'content'> & { content: LumenWizardShippingContent }) {
  const options = uniqueLumenWizardItems(props.content.options)
  const [internalOptionId, setInternalOptionId] = React.useState(props.content.initialOptionId)
  const optionId = props.content.selectedOptionId ?? internalOptionId
  const selected = selectLumenWizardItem(options, optionId)
  return (
    <Root {...props}>
      <Frame>
        <Header title={props.content.labels.title} detail={props.content.labels.detail} />
        <main className="lumen-wizard-main">
          {options.length ? (
            <div
              className="lumen-wizard-question-options hbar-app-ui-wizard-question-options"
              role="radiogroup"
              aria-label={props.content.labels.options}
              data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}
            >
              {options.map((option) => (
                <LumenButton
                  key={option.id}
                  variant="outlined"
                  role="radio"
                  aria-checked={option.id === selected?.id}
                  onClick={() => {
                    setInternalOptionId(option.id)
                    props.content.onOptionChange?.(option.id)
                    report(props.onAction, 'option', option.id)
                  }}
                >
                  <span aria-hidden="true">{option.id === selected?.id ? <Glyph name="check" /> : null}</span>
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.detail}</small>
                  </span>
                </LumenButton>
              ))}
            </div>
          ) : (
            <Empty>{props.content.labels.empty}</Empty>
          )}
        </main>
        <Footer>
          <LumenButton variant="text" onClick={() => report(props.onAction, 'back')}>
            <Glyph name="back" />
            {props.content.labels.back}
          </LumenButton>
          <LumenButton
            tone="primary"
            disabled={!selected}
            onClick={() => report(props.onAction, 'continue', selected?.id)}
          >
            {props.content.labels.continue}
            <Glyph name="next" />
          </LumenButton>
        </Footer>
      </Frame>
    </Root>
  )
}

function empty(props: LumenWizardProps) {
  return <Root {...props}>{null}</Root>
}

export function LumenWizard(props: LumenWizardProps) {
  const providerContent = useLumenWizardContent()
  const content = props.content ?? providerContent
  if (props.variant === 1) {
    if (content?.referenceInformation) {
      return (
        <Root
          {...props}
          className={[props.className, 'hbar-app-ui-wizard-information-reference'].filter(Boolean).join(' ')}
        >
          <InformationReference content={content} />
        </Root>
      )
    }
    return content?.information ? <Information {...props} content={content.information} /> : empty(props)
  }
  if (props.variant === 2) {
    if (content?.referenceInvoice) {
      return (
        <Root
          {...props}
          className={[props.className, 'hbar-app-ui-wizard-invoice-reference'].filter(Boolean).join(' ')}
        >
          <InvoiceReference content={content} />
        </Root>
      )
    }
    return content?.invoice ? <Invoice {...props} content={content.invoice} /> : empty(props)
  }
  if (props.variant === 3) {
    if (content?.referenceUpgrade) {
      return (
        <Root
          {...props}
          className={[props.className, 'hbar-app-ui-wizard-upgrade-reference'].filter(Boolean).join(' ')}
        >
          <UpgradeReference content={content} />
        </Root>
      )
    }
    return content?.upgrade ? <Upgrade {...props} content={content.upgrade} /> : empty(props)
  }
  if (props.variant === 4) {
    if (content?.referenceEnvironment) {
      return (
        <Root
          {...props}
          className={[props.className, 'hbar-app-ui-wizard-environment-reference'].filter(Boolean).join(' ')}
        >
          <EnvironmentReference content={content} />
        </Root>
      )
    }
    return content?.environment ? <Environment {...props} content={content.environment} /> : empty(props)
  }
  if (props.variant === 5) {
    if (content?.referenceReview) {
      return (
        <Root
          {...props}
          className={[props.className, 'hbar-app-ui-wizard-review-reference', 'hbar-app-ui-stage-padding-owner']
            .filter(Boolean)
            .join(' ')}
        >
          <ReviewReference content={content} />
        </Root>
      )
    }
    return content?.review ? <Review {...props} content={content.review} /> : empty(props)
  }
  if (props.variant === 6) {
    if (content?.referenceMigration) {
      return (
        <Root
          {...props}
          className={[props.className, 'hbar-app-ui-wizard-migration-reference', 'hbar-app-ui-stage-padding-owner']
            .filter(Boolean)
            .join(' ')}
        >
          <MigrationReference content={content} />
        </Root>
      )
    }
    return content?.migration ? <Migration {...props} content={content.migration} /> : empty(props)
  }
  if (props.variant === 7) {
    if (content?.referenceShipping) {
      return (
        <Root
          {...props}
          className={[props.className, 'hbar-app-ui-wizard-shipping-reference', 'hbar-app-ui-stage-padding-owner']
            .filter(Boolean)
            .join(' ')}
        >
          <ShippingReference content={content} />
        </Root>
      )
    }
    return content?.shipping ? <Shipping {...props} content={content.shipping} /> : empty(props)
  }
  return empty(props)
}

function variant(value: number, props: LumenWizardVariantProps) {
  return <LumenWizard {...props} variant={value} variantId={`hbar-app-ui-wizard-${value}`} />
}

export const LumenWizard01 = (props: LumenWizardVariantProps) => variant(1, props),
  LumenWizard02 = (props: LumenWizardVariantProps) => variant(2, props),
  LumenWizard03 = (props: LumenWizardVariantProps) => variant(3, props),
  LumenWizard04 = (props: LumenWizardVariantProps) => variant(4, props),
  LumenWizard05 = (props: LumenWizardVariantProps) => variant(5, props),
  LumenWizard06 = (props: LumenWizardVariantProps) => variant(6, props),
  LumenWizard07 = (props: LumenWizardVariantProps) => variant(7, props)
