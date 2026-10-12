'use client'

import * as React from 'react'
import { LumenFormField, LumenInput, LumenTextarea, LumenToggleControl, LumenChoiceSelect } from './forms'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenIconButton, LumenStatus, LumenText } from './primitives'
import { LumenFormsForm1Reference, type LumenFormsForm1ViewModel } from './forms-1-reference'
import { LumenForms2Reference, type LumenForms2ReferenceViewModel } from './forms-2-reference'
import { LumenForms3Reference, type LumenForms3ViewModel } from './forms-3-reference'
import { LumenForms4Reference, type LumenForms4ViewModel } from './forms-4-reference'
import { LumenForms5Reference, type LumenForms5ViewModel } from './forms-5-reference'
import { LumenForms6Reference, type LumenForms6ViewModel } from './forms-6-reference'
import { LumenForms7Reference, type LumenForms7ViewModel } from './forms-7-reference'
import { LumenForms8Reference, type LumenForms8ViewModel } from './forms-8-reference'
import { LumenForms9Reference, type LumenForms9ViewModel } from './forms-9-reference'
import { LumenForms10Reference, type LumenForms10ViewModel } from './forms-10-reference'
import { LumenForms11Reference, type LumenForms11ViewModel } from './forms-11-reference'
import { LumenForms12Reference, type LumenForms12ViewModel } from './forms-12-reference'
import './form-workflows.css'
import { LumenProgress, LumenTabs } from './ui-controls'

export interface LumenFormsListStrategy {
  readonly kind: 'content-grown' | 'pane-scroll'
  readonly expectedMaximum: number
}

export interface LumenFormsChoice {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean | undefined
}

export interface LumenFormsMetric {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly tone?: 'neutral' | 'success' | 'warning' | 'danger' | undefined
}

export interface LumenFormsRecordContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly name: string
    readonly namePlaceholder: string
    readonly tags: string
    readonly tagsPlaceholder: string
    readonly progress: string
    readonly revert: string
    readonly save: string
  }
  readonly initialName: string
  readonly initialTags: string
}

export interface LumenFormsSubmissionContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly titleField: string
    readonly titlePlaceholder: string
    readonly priority: string
    readonly type: string
    readonly checklist: string
    readonly titleProvided: string
    readonly typeSelected: (label: string) => string
    readonly detailsNeeded: string
    readonly submit: string
  }
  readonly priorities: readonly LumenFormsChoice[]
  readonly initialPriorityId: string
  readonly types: readonly LumenFormsChoice[]
  readonly initialTypeId: string
}

export interface LumenFormsLineItem {
  readonly id: string
  readonly label: string
  readonly quantity: number
  readonly price: number
}

export interface LumenFormsBookingContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly item: string
    readonly quantity: string
    readonly price: string
    readonly remove: (label: string) => string
    readonly add: string
    readonly subtotal: string
    readonly tax: string
    readonly total: string
    readonly continue: string
    readonly empty: string
  }
  readonly currency: string
  readonly taxRate: number
  readonly items: readonly LumenFormsLineItem[]
  readonly listStrategy: LumenFormsListStrategy
}

export interface LumenFormsProperty {
  readonly id: string
  readonly label: string
  readonly value: string
}

export interface LumenFormsPropertiesContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly edit: string
    readonly save: string
    readonly empty: string
  }
  readonly properties: readonly LumenFormsProperty[]
  readonly listStrategy: LumenFormsListStrategy
}

export interface LumenFormsProvisionContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly subdomain: string
    readonly suffix: string
    readonly available: string
    readonly taken: string
    readonly password: string
    readonly strength: string
    readonly create: string
    readonly created: string
  }
  readonly initialSubdomain: string
  readonly initialPassword: string
  readonly minimumSubdomainLength: number
  readonly strength: number
}

export interface LumenFormsCheckoutContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly country: string
    readonly card: string
    readonly cardPlaceholder: string
    readonly expiry: string
    readonly expiryPlaceholder: string
    readonly cvc: string
    readonly cvcPlaceholder: string
    readonly pay: (total: string) => string
    readonly summary: string
    readonly total: string
  }
  readonly countries: readonly LumenFormsChoice[]
  readonly initialCountryId: string
  readonly lines: readonly LumenFormsMetric[]
  readonly total: string
}

export interface LumenFormsApplicationContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly dropTitle: string
    readonly dropDetail: string
    readonly choose: string
    readonly preference: string
    readonly skills: string
    readonly skillsPlaceholder: string
    readonly progress: string
    readonly submit: string
  }
  readonly preferences: readonly LumenFormsChoice[]
  readonly initialPreferenceId: string
  readonly initialProgress: number
  readonly uploadedProgress: number
}

export interface LumenFormsRuleField extends LumenFormsChoice {
  readonly operator: string
  readonly placeholder: string
}

export interface LumenFormsRuleContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly field: string
    readonly value: string
    readonly test: string
    readonly matches: (count: number) => string
    readonly preview: string
  }
  readonly fields: readonly LumenFormsRuleField[]
  readonly initialFieldId: string
  readonly matchCount: number
}

export interface LumenFormsDay {
  readonly id: string
  readonly label: string
  readonly enabled: boolean
  readonly start: string
  readonly end: string
  readonly duration: string
}

export interface LumenFormsHoursContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly toggle: (label: string) => string
    readonly to: string
    readonly closed: string
    readonly total: string
    readonly save: string
    readonly empty: string
  }
  readonly days: readonly LumenFormsDay[]
  readonly listStrategy: LumenFormsListStrategy
}

export interface LumenFormsRatingRow {
  readonly id: string
  readonly label: string
}

export interface LumenFormsSurveyContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly question: string
    readonly score: (value: number) => string
    readonly rating: (row: string, value: number) => string
    readonly followUp: string
    readonly followUpPlaceholder: string
    readonly submit: string
  }
  readonly initialScore: number
  readonly followUpThreshold: number
  readonly ratingRows: readonly LumenFormsRatingRow[]
  readonly ratingValues: readonly number[]
}

export interface LumenFormsEnvironmentContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly kinds: string
    readonly name: string
    readonly slug: string
    readonly available: string
    readonly longer: string
    readonly create: string
  }
  readonly kinds: readonly LumenFormsChoice[]
  readonly initialKindId: string
  readonly initialName: string
  readonly initialSlug: string
  readonly minimumSlugLength: number
}

export interface LumenFormsQuoteSection {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly body: string
}

export interface LumenFormsQuoteContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly expand: (label: string) => string
    readonly collapse: (label: string) => string
    readonly edit: string
    readonly confirm: string
    readonly empty: string
  }
  readonly metrics: readonly LumenFormsMetric[]
  readonly initialOpenId: string
  readonly sections: readonly LumenFormsQuoteSection[]
  readonly listStrategy: LumenFormsListStrategy
}

export interface LumenFormsContent {
  readonly surveyDeploymentReference?: LumenFormsForm1ViewModel | undefined
  readonly sessionSubmissionReference?: LumenForms2ReferenceViewModel | undefined
  readonly freightBookingReference?: LumenForms3ViewModel | undefined
  readonly equipmentRecordReference?: LumenForms4ViewModel | undefined
  readonly workspaceProvisionReference?: LumenForms5ViewModel | undefined
  readonly checkoutReference?: LumenForms6ViewModel | undefined
  readonly communityArtsApplicationReference?: LumenForms7ViewModel | undefined
  readonly inboundPalletRoutingReference?: LumenForms8ViewModel | undefined
  readonly weeklyOpeningHoursReference?: LumenForms9ViewModel | undefined
  readonly guestSurveyReference?: LumenForms10ViewModel | undefined
  readonly environmentDialogReference?: LumenForms11ViewModel | undefined
  readonly quoteReviewReference?: LumenForms12ViewModel | undefined
  readonly record?: LumenFormsRecordContent | undefined
  readonly submission?: LumenFormsSubmissionContent | undefined
  readonly booking?: LumenFormsBookingContent | undefined
  readonly properties?: LumenFormsPropertiesContent | undefined
  readonly provision?: LumenFormsProvisionContent | undefined
  readonly checkout?: LumenFormsCheckoutContent | undefined
  readonly application?: LumenFormsApplicationContent | undefined
  readonly rule?: LumenFormsRuleContent | undefined
  readonly hours?: LumenFormsHoursContent | undefined
  readonly survey?: LumenFormsSurveyContent | undefined
  readonly environment?: LumenFormsEnvironmentContent | undefined
  readonly quote?: LumenFormsQuoteContent | undefined
}

export interface LumenFormsProviderProps {
  readonly content: LumenFormsContent
  readonly children: React.ReactNode
}

export interface LumenFormsAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenFormsProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenFormsContent | undefined
  readonly onAction?: ((event: LumenFormsAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
}

export type LumenFormsVariantProps = Omit<LumenFormsProps, 'variant' | 'variantId'>

const Context = React.createContext<LumenFormsContent | undefined>(undefined)

export function LumenFormsProvider({ content, children }: LumenFormsProviderProps) {
  return <Context.Provider value={content}>{children}</Context.Provider>
}

export function useLumenFormsContent() {
  return React.useContext(Context)
}

export function uniqueLumenFormsItems<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function selectLumenFormsItem<T extends { readonly id: string }>(
  items: readonly T[],
  id: string | undefined,
): T | undefined {
  return items.find((item) => item.id === id) ?? items[0]
}

const report = (fn: LumenFormsProps['onAction'], actionId: string, value?: string) =>
  fn?.(value === undefined ? { actionId } : { actionId, value })

function Glyph({
  name,
}: {
  name: 'undo' | 'check' | 'send' | 'trash' | 'plus' | 'card' | 'file' | 'chevron' | 'circle'
}) {
  const paths = {
    undo: 'M5 5H2l2.5-2.5M2.5 5A6 6 0 1 1 4 11',
    check: 'm3 8 3 3 7-7',
    send: 'M2 3l12 5-12 5 2-5zm2 5h6',
    trash: 'M3 4h10M6 4V2h4v2m2 0-.6 10h-6.8L4 4m3 3v4m2-4v4',
    plus: 'M8 3v10M3 8h10',
    card: 'M1.5 4h13v8h-13zm0 2.5h13',
    file: 'M4 1.5h5l3 3v10H4zm5 0v3h3',
    chevron: 'm6 3 5 5-5 5',
    circle: 'M8 3a5 5 0 1 0 0 10A5 5 0 0 0 8 3Z',
  } as const
  const d = paths[name]
  return (
    <svg className="lumen-forms-glyph" viewBox="0 0 16 16" aria-hidden="true">
      <path d={d} />
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
}: Omit<LumenFormsProps, 'content' | 'onAction'> & { readonly children: React.ReactNode }) {
  const contentClassName = [
    'lumen-forms-workflow',
    `hbar-app-ui-forms-variant-${variant}`,
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
      as="section"
      boundary="horizontal"
      className="lumen-forms-workflow-surface"
      contentClassName={contentClassName}
      data-lumen-component="forms"
      data-lumen-variant={variant}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-state={state}
    >
      {children}
    </LumenSurface>
  )
}

function Header({
  title,
  detail,
  actions,
}: {
  readonly title: string
  readonly detail: string
  readonly actions?: React.ReactNode
}) {
  return (
    <header className="lumen-forms-header">
      <div>
        <LumenText as="h2" variant="title">
          {title}
        </LumenText>
        <LumenText as="p" variant="supporting" tone="muted">
          {detail}
        </LumenText>
      </div>
      {actions}
    </header>
  )
}

function Empty({ children }: { readonly children: string }) {
  return (
    <LumenText as="p" className="lumen-forms-empty" tone="muted">
      {children}
    </LumenText>
  )
}

function Progress({
  value,
  label,
  tone,
}: {
  readonly value: number
  readonly label: string
  readonly tone?: string | undefined
}) {
  return (
    <LumenProgress
      className="lumen-forms-progress"
      value={value}
      label={label}
      tone={tone === 'success' ? 'success' : 'info'}
    />
  )
}

function Metrics({ metrics }: { readonly metrics: readonly LumenFormsMetric[] }) {
  return (
    <dl className="lumen-forms-metrics">
      {uniqueLumenFormsItems(metrics).map((item) => (
        <div key={item.id} data-tone={item.tone}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Tabs({
  choices,
  selectedId,
  label,
  onChange,
}: {
  readonly choices: readonly LumenFormsChoice[]
  readonly selectedId: string | undefined
  readonly label: string
  readonly onChange: (id: string) => void
}) {
  return (
    <LumenTabs
      className="lumen-forms-tabs"
      label={label}
      items={choices}
      selectedId={selectedId ?? null}
      onChange={onChange}
    />
  )
}

function RecordForm(props: Omit<LumenFormsProps, 'content'> & { content: LumenFormsRecordContent }) {
  const [name, setName] = React.useState(props.content.initialName)
  const [tags, setTags] = React.useState(props.content.initialTags)
  const progress = (name ? 45 : 0) + (tags ? 45 : 0) + 10
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <LumenFormField controlId={`${props.variantId}-name`} label={props.content.labels.name}>
        <LumenInput
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={props.content.labels.namePlaceholder}
        />
      </LumenFormField>
      <LumenFormField controlId={`${props.variantId}-tags`} label={props.content.labels.tags}>
        <LumenInput
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder={props.content.labels.tagsPlaceholder}
        />
      </LumenFormField>
      <Progress value={progress} label={props.content.labels.progress} />
      <div className="lumen-forms-actions">
        <LumenButton
          variant="outlined"
          onClick={() => {
            setName(props.content.initialName)
            setTags(props.content.initialTags)
          }}
        >
          <Glyph name="undo" />
          {props.content.labels.revert}
        </LumenButton>
        <LumenButton tone="primary" onClick={() => report(props.onAction, 'save', `${name}|${tags}`)}>
          <Glyph name="check" />
          {props.content.labels.save}
        </LumenButton>
      </div>
    </Root>
  )
}

function Submission(props: Omit<LumenFormsProps, 'content'> & { content: LumenFormsSubmissionContent }) {
  const priorities = uniqueLumenFormsItems(props.content.priorities)
  const types = uniqueLumenFormsItems(props.content.types)
  const [priorityId, setPriorityId] = React.useState(props.content.initialPriorityId)
  const [typeId, setTypeId] = React.useState(props.content.initialTypeId)
  const type = selectLumenFormsItem(types, typeId)
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-forms-two-column">
        <LumenFormField controlId={`${props.variantId}-title`} label={props.content.labels.titleField}>
          <LumenInput placeholder={props.content.labels.titlePlaceholder} />
        </LumenFormField>
        <LumenFormField controlId={`${props.variantId}-priority`} label={props.content.labels.priority}>
          <LumenChoiceSelect
            id={`${props.variantId}-priority`}
            label={props.content.labels.priority}
            options={priorities}
            value={selectLumenFormsItem(priorities, priorityId)?.id ?? null}
            onValueChange={setPriorityId}
          />
        </LumenFormField>
        <fieldset>
          <legend>{props.content.labels.type}</legend>
          {types.map((item) => (
            <label key={item.id}>
              <LumenInput
                type="radio"
                name={`${props.variantId}-type`}
                checked={type?.id === item.id}
                onChange={() => setTypeId(item.id)}
              />
              {item.label}
            </label>
          ))}
        </fieldset>
        <section className="lumen-forms-panel">
          <strong>{props.content.labels.checklist}</strong>
          <span>
            <Glyph name="check" />
            {props.content.labels.titleProvided}
          </span>
          <span>
            <Glyph name="check" />
            {props.content.labels.typeSelected(type?.label ?? '')}
          </span>
          <span>
            <Glyph name="circle" />
            {props.content.labels.detailsNeeded}
          </span>
        </section>
      </div>
      <LumenButton tone="primary" onClick={() => report(props.onAction, 'submit', type?.id)}>
        <Glyph name="send" />
        {props.content.labels.submit}
      </LumenButton>
    </Root>
  )
}

function Booking(props: Omit<LumenFormsProps, 'content'> & { content: LumenFormsBookingContent }) {
  const [items, setItems] = React.useState(() => [...uniqueLumenFormsItems(props.content.items)])
  const [quantities, setQuantities] = React.useState<Readonly<Record<string, number>>>(() =>
    Object.fromEntries(items.map((item) => [item.id, item.quantity])),
  )
  const subtotal = items.reduce((sum, item) => sum + item.price * (quantities[item.id] ?? 0), 0)
  const tax = subtotal * props.content.taxRate
  const money = (value: number) => `${props.content.currency}${value.toFixed(2)}`
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-forms-line-items" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        <div className="is-head">
          <span>{props.content.labels.item}</span>
          <span>{props.content.labels.quantity}</span>
          <span>{props.content.labels.price}</span>
        </div>
        {items.length ? (
          items.map((item) => (
            <div key={item.id}>
              <strong>{item.label}</strong>
              <LumenInput
                type="number"
                min={1}
                value={quantities[item.id] ?? 1}
                onChange={(event) =>
                  setQuantities((current) => ({
                    ...current,
                    [item.id]: Math.max(1, Number(event.target.value) || 1),
                  }))
                }
              />
              <span>{money(item.price)}</span>
              <LumenIconButton
                label={props.content.labels.remove(item.label)}
                onClick={() => setItems((current) => current.filter((value) => value.id !== item.id))}
              >
                <Glyph name="trash" />
              </LumenIconButton>
            </div>
          ))
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
        <LumenButton variant="outlined" onClick={() => report(props.onAction, 'add-line')}>
          <Glyph name="plus" />
          {props.content.labels.add}
        </LumenButton>
      </div>
      <Metrics
        metrics={[
          { id: 'subtotal', label: props.content.labels.subtotal, value: money(subtotal) },
          { id: 'tax', label: props.content.labels.tax, value: money(tax) },
          {
            id: 'total',
            label: props.content.labels.total,
            value: money(subtotal + tax),
            tone: 'success',
          },
        ]}
      />
      <LumenButton tone="primary" onClick={() => report(props.onAction, 'continue', String(subtotal + tax))}>
        {props.content.labels.continue}
      </LumenButton>
    </Root>
  )
}

function Properties(props: Omit<LumenFormsProps, 'content'> & { content: LumenFormsPropertiesContent }) {
  const properties = uniqueLumenFormsItems(props.content.properties)
  const [editingId, setEditingId] = React.useState<string>()
  const [values, setValues] = React.useState<Readonly<Record<string, string>>>(() =>
    Object.fromEntries(properties.map((item) => [item.id, item.value])),
  )
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-forms-properties" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {properties.length ? (
          properties.map((item) => (
            <div key={item.id}>
              <strong>{item.label}</strong>
              {editingId === item.id ? (
                <React.Fragment>
                  <LumenInput
                    aria-label={item.label}
                    value={values[item.id] ?? ''}
                    onChange={(event) => setValues((current) => ({ ...current, [item.id]: event.target.value }))}
                  />
                  <LumenButton
                    tone="primary"
                    onClick={() => {
                      setEditingId(undefined)
                      report(props.onAction, 'save', `${item.id}:${values[item.id] ?? ''}`)
                    }}
                  >
                    {props.content.labels.save}
                  </LumenButton>
                </React.Fragment>
              ) : (
                <React.Fragment>
                  <span>{values[item.id]}</span>
                  <LumenButton variant="outlined" onClick={() => setEditingId(item.id)}>
                    {props.content.labels.edit}
                  </LumenButton>
                </React.Fragment>
              )}
            </div>
          ))
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </div>
    </Root>
  )
}

function Provision(props: Omit<LumenFormsProps, 'content'> & { content: LumenFormsProvisionContent }) {
  const [subdomain, setSubdomain] = React.useState(props.content.initialSubdomain)
  const [created, setCreated] = React.useState(false)
  const available = subdomain.length >= props.content.minimumSubdomainLength
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <LumenFormField controlId={`${props.variantId}-subdomain`} label={props.content.labels.subdomain}>
        <div className="lumen-forms-suffix">
          <LumenInput value={subdomain} onChange={(event) => setSubdomain(event.target.value)} />
          <span>{props.content.labels.suffix}</span>
        </div>
      </LumenFormField>
      <LumenStatus
        value={available ? props.content.labels.available : props.content.labels.taken}
        tone={available ? 'success' : 'warning'}
      />
      <LumenFormField controlId={`${props.variantId}-password`} label={props.content.labels.password}>
        <LumenInput type="password" defaultValue={props.content.initialPassword} />
      </LumenFormField>
      <Progress value={props.content.strength} label={props.content.labels.strength} tone="success" />
      <LumenButton
        tone="primary"
        disabled={!available}
        onClick={() => {
          setCreated(true)
          report(props.onAction, 'create', subdomain)
        }}
      >
        {created ? props.content.labels.created : props.content.labels.create}
      </LumenButton>
    </Root>
  )
}

function Checkout(props: Omit<LumenFormsProps, 'content'> & { content: LumenFormsCheckoutContent }) {
  const countries = uniqueLumenFormsItems(props.content.countries)
  const [countryId, setCountryId] = React.useState(props.content.initialCountryId)
  return (
    <Root {...props}>
      <div className="lumen-forms-checkout">
        <main>
          <Header title={props.content.labels.title} detail={props.content.labels.detail} />
          <LumenFormField controlId={`${props.variantId}-country`} label={props.content.labels.country}>
            <LumenChoiceSelect
              id={`${props.variantId}-country`}
              label={props.content.labels.country}
              options={countries}
              value={selectLumenFormsItem(countries, countryId)?.id ?? null}
              onValueChange={setCountryId}
            />
          </LumenFormField>
          <LumenFormField controlId={`${props.variantId}-card`} label={props.content.labels.card}>
            <div className="lumen-forms-input-icon">
              <Glyph name="card" />
              <LumenInput placeholder={props.content.labels.cardPlaceholder} />
            </div>
          </LumenFormField>
          <div className="lumen-forms-two-column">
            <LumenFormField controlId={`${props.variantId}-expiry`} label={props.content.labels.expiry}>
              <LumenInput placeholder={props.content.labels.expiryPlaceholder} />
            </LumenFormField>
            <LumenFormField controlId={`${props.variantId}-cvc`} label={props.content.labels.cvc}>
              <LumenInput placeholder={props.content.labels.cvcPlaceholder} />
            </LumenFormField>
          </div>
          <LumenButton tone="primary" onClick={() => report(props.onAction, 'pay', countryId)}>
            {props.content.labels.pay(props.content.total)}
          </LumenButton>
        </main>
        <aside className="lumen-forms-panel">
          <strong>{props.content.labels.summary}</strong>
          {uniqueLumenFormsItems(props.content.lines).map((line) => (
            <span key={line.id}>
              <span>{line.label}</span>
              <span>{line.value}</span>
            </span>
          ))}
          <b>
            <span>{props.content.labels.total}</span>
            <span>{props.content.total}</span>
          </b>
        </aside>
      </div>
    </Root>
  )
}

function Application(props: Omit<LumenFormsProps, 'content'> & { content: LumenFormsApplicationContent }) {
  const preferences = uniqueLumenFormsItems(props.content.preferences)
  const [preferenceId, setPreferenceId] = React.useState(props.content.initialPreferenceId)
  const [progress, setProgress] = React.useState(props.content.initialProgress)
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <section className="lumen-forms-dropzone">
        <Glyph name="file" />
        <strong>{props.content.labels.dropTitle}</strong>
        <small>{props.content.labels.dropDetail}</small>
        <LumenButton variant="outlined" onClick={() => setProgress(props.content.uploadedProgress)}>
          {props.content.labels.choose}
        </LumenButton>
      </section>
      <fieldset>
        <legend>{props.content.labels.preference}</legend>
        {preferences.map((item) => (
          <label key={item.id}>
            <LumenInput
              type="radio"
              name={`${props.variantId}-preference`}
              checked={preferenceId === item.id}
              onChange={() => setPreferenceId(item.id)}
            />
            {item.label}
          </label>
        ))}
      </fieldset>
      <LumenFormField controlId={`${props.variantId}-skills`} label={props.content.labels.skills}>
        <LumenInput placeholder={props.content.labels.skillsPlaceholder} />
      </LumenFormField>
      <Progress value={progress} label={props.content.labels.progress} />
      <LumenButton tone="primary" onClick={() => report(props.onAction, 'submit', preferenceId)}>
        {props.content.labels.submit}
      </LumenButton>
    </Root>
  )
}

function Rule(props: Omit<LumenFormsProps, 'content'> & { content: LumenFormsRuleContent }) {
  const fields = uniqueLumenFormsItems(props.content.fields)
  const [fieldId, setFieldId] = React.useState(props.content.initialFieldId)
  const field = selectLumenFormsItem(fields, fieldId)
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-forms-rule">
        <LumenChoiceSelect
          id={`${props.variantId}-field`}
          label={props.content.labels.field}
          options={fields}
          value={field?.id ?? null}
          onValueChange={setFieldId}
        />
        <span>{field?.operator}</span>
        <LumenInput aria-label={props.content.labels.value} placeholder={field?.placeholder} />
      </div>
      <LumenButton
        tone="primary"
        onClick={() => report(props.onAction, 'test', field ? `${field.id}:${field.operator}` : undefined)}
      >
        {props.content.labels.test}
      </LumenButton>
      <section className="lumen-forms-panel">
        <LumenStatus value={props.content.labels.matches(props.content.matchCount)} tone="success" />
        <LumenText as="p" tone="muted">
          {props.content.labels.preview}
        </LumenText>
      </section>
    </Root>
  )
}

function Hours(props: Omit<LumenFormsProps, 'content'> & { content: LumenFormsHoursContent }) {
  const days = uniqueLumenFormsItems(props.content.days)
  const [enabled, setEnabled] = React.useState<Readonly<Record<string, boolean>>>(() =>
    Object.fromEntries(days.map((day) => [day.id, day.enabled])),
  )
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-forms-hours" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {days.length ? (
          days.map((day) => {
            const active = enabled[day.id] ?? false
            return (
              <div key={day.id}>
                <LumenToggleControl
                  aria-label={props.content.labels.toggle(day.label)}
                  checked={active}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked
                    setEnabled((current) => ({ ...current, [day.id]: checked }))
                  }}
                />
                <strong>{day.label}</strong>
                {active ? (
                  <>
                    <LumenInput type="time" defaultValue={day.start} />
                    <span>{props.content.labels.to}</span>
                    <LumenInput type="time" defaultValue={day.end} />
                    <small>{day.duration}</small>
                  </>
                ) : (
                  <em>{props.content.labels.closed}</em>
                )}
              </div>
            )
          })
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </div>
      <LumenStatus value={props.content.labels.total} tone="success" />
      <LumenButton tone="primary" onClick={() => report(props.onAction, 'save')}>
        {props.content.labels.save}
      </LumenButton>
    </Root>
  )
}

function Survey(props: Omit<LumenFormsProps, 'content'> & { content: LumenFormsSurveyContent }) {
  const rows = uniqueLumenFormsItems(props.content.ratingRows)
  const [score, setScore] = React.useState(props.content.initialScore)
  const [ratings, setRatings] = React.useState<Readonly<Record<string, number>>>({})
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-forms-score">
        {Array.from({ length: 11 }, (_, value) => (
          <LumenButton
            key={value}
            variant="outlined"
            aria-pressed={score === value}
            aria-label={props.content.labels.score(value)}
            onClick={() => setScore(value)}
          >
            {value}
          </LumenButton>
        ))}
      </div>
      <LumenText as="p">{props.content.labels.question}</LumenText>
      <div className="lumen-forms-rating">
        <div className="lumen-forms-rating-header" aria-hidden="true">
          <span />
          {props.content.ratingValues.map((value) => (
            <span key={value}>{value}</span>
          ))}
        </div>
        {rows.map((row) => (
          <div key={row.id}>
            <span>{row.label}</span>
            {props.content.ratingValues.map((value) => (
              <LumenIconButton
                key={value}
                label={props.content.labels.rating(row.label, value)}
                aria-pressed={ratings[row.id] === value}
                onClick={() => setRatings((current) => ({ ...current, [row.id]: value }))}
              >
                <Glyph name="circle" />
              </LumenIconButton>
            ))}
          </div>
        ))}
      </div>
      {score < props.content.followUpThreshold ? (
        <LumenFormField controlId={`${props.variantId}-follow-up`} label={props.content.labels.followUp}>
          <LumenTextarea placeholder={props.content.labels.followUpPlaceholder} />
        </LumenFormField>
      ) : null}
      <LumenButton tone="primary" onClick={() => report(props.onAction, 'submit', String(score))}>
        {props.content.labels.submit}
      </LumenButton>
    </Root>
  )
}

function Environment(props: Omit<LumenFormsProps, 'content'> & { content: LumenFormsEnvironmentContent }) {
  const kinds = uniqueLumenFormsItems(props.content.kinds)
  const [kindId, setKindId] = React.useState(props.content.initialKindId)
  const [slug, setSlug] = React.useState(props.content.initialSlug)
  const available = slug.length >= props.content.minimumSlugLength
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <Tabs
        choices={kinds}
        selectedId={selectLumenFormsItem(kinds, kindId)?.id}
        label={props.content.labels.kinds}
        onChange={setKindId}
      />
      <LumenFormField controlId={`${props.variantId}-name`} label={props.content.labels.name}>
        <LumenInput defaultValue={props.content.initialName} />
      </LumenFormField>
      <LumenFormField controlId={`${props.variantId}-slug`} label={props.content.labels.slug}>
        <LumenInput value={slug} onChange={(event) => setSlug(event.target.value)} />
      </LumenFormField>
      <LumenStatus
        value={available ? props.content.labels.available : props.content.labels.longer}
        tone={available ? 'success' : 'warning'}
      />
      <LumenButton
        tone="primary"
        disabled={!available}
        onClick={() => report(props.onAction, 'create', `${kindId}:${slug}`)}
      >
        {props.content.labels.create}
      </LumenButton>
    </Root>
  )
}

function Quote(props: Omit<LumenFormsProps, 'content'> & { content: LumenFormsQuoteContent }) {
  const sections = uniqueLumenFormsItems(props.content.sections)
  const [openId, setOpenId] = React.useState(props.content.initialOpenId)
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <Metrics metrics={props.content.metrics} />
      <div className="lumen-forms-quote" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {sections.length ? (
          sections.map((section) => {
            const open = openId === section.id
            return (
              <article key={section.id}>
                <LumenButton
                  variant="text"
                  aria-expanded={open}
                  aria-label={
                    open ? props.content.labels.collapse(section.label) : props.content.labels.expand(section.label)
                  }
                  onClick={() => setOpenId(open ? '' : section.id)}
                >
                  <Glyph name="chevron" />
                  <strong>{section.label}</strong>
                  <span>{section.value}</span>
                </LumenButton>
                {open ? (
                  <div className="lumen-forms-panel">
                    <LumenText as="p" tone="muted">
                      {section.body}
                    </LumenText>
                    <LumenButton variant="outlined" onClick={() => report(props.onAction, 'edit', section.id)}>
                      {props.content.labels.edit}
                    </LumenButton>
                  </div>
                ) : null}
              </article>
            )
          })
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </div>
      <LumenButton tone="primary" onClick={() => report(props.onAction, 'confirm')}>
        {props.content.labels.confirm}
      </LumenButton>
    </Root>
  )
}

function empty(props: LumenFormsProps) {
  return <Root {...props}>{null}</Root>
}

export function LumenForms(props: LumenFormsProps) {
  const inheritedContent = useLumenFormsContent()
  const content = props.content ?? inheritedContent
  if (props.variant === 1) {
    if (content?.surveyDeploymentReference) {
      return <LumenFormsForm1Reference instanceId={props.variantId} {...content.surveyDeploymentReference} />
    }
    if (content?.record) return <RecordForm {...props} content={content.record} />
    return empty(props)
  }
  if (props.variant === 2)
    return content?.sessionSubmissionReference ? (
      <LumenForms2Reference instanceId={props.variantId} {...content.sessionSubmissionReference} />
    ) : content?.submission ? (
      <Submission {...props} content={content.submission} />
    ) : (
      empty(props)
    )
  if (props.variant === 3)
    return content?.freightBookingReference ? (
      <LumenForms3Reference instanceId={props.variantId} {...content.freightBookingReference} />
    ) : content?.booking ? (
      <Booking {...props} content={content.booking} />
    ) : (
      empty(props)
    )
  if (props.variant === 4)
    return content?.equipmentRecordReference ? (
      <LumenForms4Reference instanceId={props.variantId} {...content.equipmentRecordReference} />
    ) : content?.properties ? (
      <Properties {...props} content={content.properties} />
    ) : (
      empty(props)
    )
  if (props.variant === 5) {
    if (content?.workspaceProvisionReference) {
      return <LumenForms5Reference instanceId={props.variantId} {...content.workspaceProvisionReference} />
    }
    if (content?.provision) return <Provision {...props} content={content.provision} />
    return empty(props)
  }
  if (props.variant === 6) {
    if (content?.checkoutReference) {
      return <LumenForms6Reference instanceId={props.variantId} {...content.checkoutReference} />
    }
    return content?.checkout ? <Checkout {...props} content={content.checkout} /> : empty(props)
  }
  if (props.variant === 7) {
    if (content?.communityArtsApplicationReference) {
      return <LumenForms7Reference instanceId={props.variantId} {...content.communityArtsApplicationReference} />
    }
    return content?.application ? <Application {...props} content={content.application} /> : empty(props)
  }
  if (props.variant === 8)
    return content?.inboundPalletRoutingReference ? (
      <LumenForms8Reference instanceId={props.variantId} {...content.inboundPalletRoutingReference} />
    ) : content?.rule ? (
      <Rule {...props} content={content.rule} />
    ) : (
      empty(props)
    )
  if (props.variant === 9)
    return content?.weeklyOpeningHoursReference ? (
      <LumenForms9Reference instanceId={props.variantId} {...content.weeklyOpeningHoursReference} />
    ) : content?.hours ? (
      <Hours {...props} content={content.hours} />
    ) : (
      empty(props)
    )
  if (props.variant === 10) {
    if (content?.guestSurveyReference) {
      return <LumenForms10Reference instanceId={props.variantId} {...content.guestSurveyReference} />
    }
    return content?.survey ? <Survey {...props} content={content.survey} /> : empty(props)
  }
  if (props.variant === 11) {
    if (content?.environmentDialogReference) {
      return <LumenForms11Reference instanceId={props.variantId} {...content.environmentDialogReference} />
    }
    return content?.environment ? <Environment {...props} content={content.environment} /> : empty(props)
  }
  if (props.variant === 12) {
    if (content?.quoteReviewReference) {
      return <LumenForms12Reference instanceId={props.variantId} {...content.quoteReviewReference} />
    }
    return content?.quote ? <Quote {...props} content={content.quote} /> : empty(props)
  }
  return empty(props)
}

function variant(value: number, props: LumenFormsVariantProps) {
  return <LumenForms {...props} variant={value} variantId={`hbar-app-ui-forms-${value}`} />
}

export const LumenForms01 = (props: LumenFormsVariantProps) => variant(1, props),
  LumenForms02 = (props: LumenFormsVariantProps) => variant(2, props),
  LumenForms03 = (props: LumenFormsVariantProps) => variant(3, props),
  LumenForms04 = (props: LumenFormsVariantProps) => variant(4, props),
  LumenForms05 = (props: LumenFormsVariantProps) => variant(5, props),
  LumenForms06 = (props: LumenFormsVariantProps) => variant(6, props),
  LumenForms07 = (props: LumenFormsVariantProps) => variant(7, props),
  LumenForms08 = (props: LumenFormsVariantProps) => variant(8, props),
  LumenForms09 = (props: LumenFormsVariantProps) => variant(9, props),
  LumenForms10 = (props: LumenFormsVariantProps) => variant(10, props),
  LumenForms11 = (props: LumenFormsVariantProps) => variant(11, props),
  LumenForms12 = (props: LumenFormsVariantProps) => variant(12, props)
