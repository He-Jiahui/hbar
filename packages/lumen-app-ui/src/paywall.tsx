'use client'

import * as React from 'react'
import { LumenInput, LumenTextarea } from './forms'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenIconButton, LumenText } from './primitives'
import { LumenPaywall3Reference, type LumenPaywall3ReferenceViewModel } from './paywall-3-reference'
import { LumenPaywall4Reference, type LumenPaywall4ReferenceViewModel } from './paywall-4-reference'
import { LumenPaywall5Reference, type LumenPaywall5ReferenceViewModel } from './paywall-5-reference'
import { LumenPaywall6Reference, type LumenPaywall6ReferenceViewModel } from './paywall-6-reference'
import { LumenPaywall7Reference, type LumenPaywall7ReferenceViewModel } from './paywall-7-reference'
import './paywall.css'
import { LumenBadge, LumenProgress } from './ui-controls'

export type LumenPaywallListStrategy =
  | { readonly kind: 'content-grown'; readonly expectedMaximum: number }
  | { readonly kind: 'pane-scroll'; readonly expectedMaximum: number }
  | { readonly kind: 'virtualized'; readonly expectedMaximum: number }

export interface LumenPaywallFeature {
  readonly id: string
  readonly title: string
  readonly description: string
}

export interface LumenPaywallArticleContent {
  readonly labels: {
    readonly eyebrow: string
    readonly title: string
    readonly byline: string
    readonly memberTitle: string
    readonly memberDescription: string
    readonly memberAction: string
    readonly alreadyAction: string
    readonly lockLabel: string
  }
  readonly paragraphs: readonly string[]
  readonly benefits: readonly string[]
  readonly listStrategy?: LumenPaywallListStrategy | undefined
}

export interface LumenPaywallFeatureGateContent {
  readonly labels: {
    readonly title: string
    readonly description: string
    readonly dismiss: string
    readonly seeIncluded: string
    readonly emptyFeatures: string
    readonly priceAmount: string
    readonly priceDetails: string
    readonly defer: string
    readonly upgrade: string
  }
  readonly features: readonly LumenPaywallFeature[]
  readonly listStrategy: LumenPaywallListStrategy
}

export interface LumenPaywallPlan {
  readonly id: string
  readonly name: string
  readonly monthlyPrice: string
  readonly yearlyPrice: string
  readonly priceSuffix: string
  readonly description: string
  readonly features: readonly string[]
  readonly current?: boolean | undefined
  readonly featured?: boolean | undefined
}

export interface LumenPaywallPlanContent {
  readonly labels: {
    readonly title: string
    readonly description: string
    readonly yearlyNote: string
    readonly billingPeriod: string
    readonly monthly: string
    readonly yearly: string
    readonly recommended: string
    readonly current: string
    readonly choose: string
    readonly compare: string
    readonly priceNote: string
  }
  readonly plans: readonly LumenPaywallPlan[]
  readonly initialPeriod: 'monthly' | 'yearly'
  readonly listStrategy: LumenPaywallListStrategy
}

export interface LumenPaywallUsageMeter {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly progress: number
}

export interface LumenPaywallUsageContent {
  readonly labels: {
    readonly title: string
    readonly description: string
    readonly proTitle: string
    readonly proDescription: string
    readonly topUp: string
    readonly upgrade: string
  }
  readonly meters: readonly LumenPaywallUsageMeter[]
  readonly listStrategy: LumenPaywallListStrategy
}

export interface LumenPaywallTrialRow {
  readonly id: string
  readonly label: string
  readonly value: string
}

export interface LumenPaywallTrialContent {
  readonly labels: {
    readonly eyebrow: string
    readonly title: string
    readonly description: string
    readonly paymentTitle: string
    readonly paymentDescription: string
    readonly change: string
    readonly reactivate: string
    readonly renewalNote: string
  }
  readonly rows: readonly LumenPaywallTrialRow[]
  readonly listStrategy: LumenPaywallListStrategy
}

export interface LumenPaywallReadsContent {
  readonly labels: {
    readonly eyebrow: string
    readonly title: string
    readonly description: string
    readonly emailLabel: string
    readonly emailPlaceholder: string
    readonly keepReading: string
    readonly alreadySubscribed: string
    readonly signIn: string
  }
  readonly assurances: readonly string[]
  readonly readProgress: number
  readonly listStrategy: LumenPaywallListStrategy
}

export interface LumenPaywallAdmin {
  readonly id: string
  readonly initials: string
  readonly name: string
  readonly role: string
}

export interface LumenPaywallSeatContent {
  readonly labels: {
    readonly title: string
    readonly description: string
    readonly cardTitle: string
    readonly cardDescription: string
    readonly reasonLabel: string
    readonly reasonPlaceholder: string
    readonly compare: string
    readonly send: string
  }
  readonly admins: readonly LumenPaywallAdmin[]
  readonly listStrategy: LumenPaywallListStrategy
}

export interface LumenPaywallContent {
  readonly article?: LumenPaywallArticleContent | undefined
  readonly featureGate?: LumenPaywallFeatureGateContent | undefined
  readonly plans?: LumenPaywallPlanContent | undefined
  readonly plansReference?: LumenPaywall3ReferenceViewModel | undefined
  readonly usage?: LumenPaywallUsageContent | undefined
  readonly usageReference?: LumenPaywall4ReferenceViewModel | undefined
  readonly trial?: LumenPaywallTrialContent | undefined
  readonly trialReference?: LumenPaywall5ReferenceViewModel | undefined
  readonly reads?: LumenPaywallReadsContent | undefined
  readonly readsReference?: LumenPaywall6ReferenceViewModel | undefined
  readonly seat?: LumenPaywallSeatContent | undefined
  readonly adminReference?: LumenPaywall7ReferenceViewModel | undefined
}

export interface LumenPaywallProviderProps {
  readonly content: LumenPaywallContent
  readonly children: React.ReactNode
}

export interface LumenPaywallAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenPaywallProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenPaywallContent | undefined
  readonly onAction?: ((event: LumenPaywallAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
}

export type LumenPaywallVariantProps = Omit<LumenPaywallProps, 'variant' | 'variantId'>

const PaywallContentContext = React.createContext<LumenPaywallContent | undefined>(undefined)

export function LumenPaywallProvider({ content, children }: LumenPaywallProviderProps) {
  return <PaywallContentContext.Provider value={content}>{children}</PaywallContentContext.Provider>
}

export function useLumenPaywallContent() {
  return React.useContext(PaywallContentContext)
}

export function uniqueLumenPaywallItems<Item extends { readonly id: string }>(items: readonly Item[]): readonly Item[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

function report(onAction: LumenPaywallProps['onAction'], actionId: string, value?: string) {
  onAction?.(value === undefined ? { actionId } : { actionId, value })
}

const PAYWALL_GLYPH_PATHS = {
  check: 'm5 12 4 4 10-10',
  close: 'm6 6 12 12m0-12L6 18',
  sparkles:
    'm12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13Z',
  card: 'M3 6.5h18v12H3zM3 10h18M7 15h4',
  building: 'M4 21V5l8-3 8 3v16M8 8h1m6 0h1M8 12h1m6 0h1M8 16h1m6 0h1M10 21v-3h4v3',
  alert: 'M12 3 2.8 20h18.4L12 3Zm0 6v5m0 3h.01',
  lock: 'M7 10V8a5 5 0 0 1 10 0v2m-12 0h14v11H5z',
}

function Glyph({
  name,
  tier = 'sm',
}: {
  readonly name: keyof typeof PAYWALL_GLYPH_PATHS
  readonly tier?: 'xs' | 'sm' | 'md' | 'lg' | undefined
}) {
  return (
    <svg className="lumen-paywall-glyph" data-tier={tier} viewBox="0 0 24 24" aria-hidden="true">
      <path d={PAYWALL_GLYPH_PATHS[name]} />
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
}: Omit<LumenPaywallProps, 'content' | 'onAction'> & { readonly children: React.ReactNode }) {
  const contentClassName = [
    'lumen-paywall',
    'hbar-app-ui-paywall-surface',
    `hbar-app-ui-paywall-variant-${variant}`,
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
      className="lumen-paywall-surface"
      contentClassName={contentClassName}
      data-lumen-component="paywall"
      data-lumen-variant={variant}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-surface={surface}
      data-hbar-app-ui-state={state}
    >
      {children}
    </LumenSurface>
  )
}

function Article(props: Omit<LumenPaywallProps, 'content'> & { content: LumenPaywallArticleContent }) {
  const { content, onAction } = props
  return (
    <Root {...props} className="hbar-app-ui-paywall-article-surface">
      <article className="hbar-app-ui-paywall-article">
        <header className="hbar-app-ui-paywall-article-head">
          <LumenText as="p" variant="label" tone="muted" className="hbar-app-ui-paywall-eyebrow">
            {content.labels.eyebrow}
          </LumenText>
          <LumenText as="h2" variant="title">
            {content.labels.title}
          </LumenText>
          <LumenText as="p" tone="muted" className="hbar-app-ui-paywall-byline">
            {content.labels.byline}
          </LumenText>
        </header>
        <div className="hbar-app-ui-paywall-article-copy" aria-hidden="true">
          {content.paragraphs.map((paragraph, index) => (
            <p key={`${index}-${paragraph}`}>{paragraph}</p>
          ))}
        </div>
        <section className="hbar-app-ui-paywall-member" aria-label={content.labels.memberTitle}>
          <span className="hbar-app-ui-paywall-icon" aria-label={content.labels.lockLabel}>
            <Glyph name="lock" tier="sm" />
          </span>
          <LumenText as="h3" variant="heading">
            {content.labels.memberTitle}
          </LumenText>
          <LumenText as="p" tone="muted">
            {content.labels.memberDescription}
          </LumenText>
          <ul
            data-hbar-app-ui-list-strategy={content.listStrategy?.kind ?? 'content-grown'}
            tabIndex={content.listStrategy?.kind === 'pane-scroll' ? 0 : undefined}
            aria-label={content.listStrategy?.kind === 'pane-scroll' ? content.labels.memberTitle : undefined}
          >
            {content.benefits.map((benefit, index) => (
              <li key={`${index}-${benefit}`}>
                <Glyph name="check" tier="xs" />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
          <div className="hbar-app-ui-paywall-member-actions">
            <LumenButton tone="primary" onClick={() => report(onAction, 'upgrade')}>
              {content.labels.memberAction}
            </LumenButton>
            <LumenButton variant="outlined" onClick={() => report(onAction, 'sign-in')}>
              {content.labels.alreadyAction}
            </LumenButton>
          </div>
        </section>
      </article>
    </Root>
  )
}

function FeatureGate(props: Omit<LumenPaywallProps, 'content'> & { content: LumenPaywallFeatureGateContent }) {
  const { content, onAction } = props
  const features = uniqueLumenPaywallItems(content.features)
  return (
    <Root {...props} className="hbar-app-ui-paywall-feature-gate-surface">
      <div
        className="hbar-app-ui-paywall-feature-gate hbar-app-ui-paywall-feature-card"
        role="dialog"
        aria-label={content.labels.title}
        data-paywall2-dialog
      >
        <header className="hbar-app-ui-paywall-feature-head">
          <span className="hbar-app-ui-paywall-icon" aria-hidden="true">
            <Glyph name="sparkles" tier="sm" />
          </span>
          <div>
            <LumenText as="h2" variant="heading">
              {content.labels.title}
            </LumenText>
            <LumenText as="p" tone="muted">
              {content.labels.description}
            </LumenText>
          </div>
          <LumenIconButton
            label={content.labels.dismiss}
            data-paywall2-action="dismiss"
            onClick={() => report(onAction, 'dismiss-request')}
          >
            <Glyph name="close" />
          </LumenIconButton>
        </header>
        {features.length ? (
          <div
            className="hbar-app-ui-paywall-feature-list"
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
            data-paywall2-feature-list
            tabIndex={content.listStrategy.kind === 'pane-scroll' ? 0 : undefined}
            aria-label={content.listStrategy.kind === 'pane-scroll' ? content.labels.seeIncluded : undefined}
          >
            {features.map((feature) => (
              <div className="hbar-app-ui-paywall-feature-row" key={feature.id} data-paywall2-feature-id={feature.id}>
                <Glyph name="check" tier="xs" />
                <div>
                  <LumenText as="p" variant="label">
                    {feature.title}
                  </LumenText>
                  <LumenText as="p" tone="muted">
                    {feature.description}
                  </LumenText>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <LumenText as="p" className="hbar-app-ui-paywall-feature-empty" tone="muted">
            {content.labels.emptyFeatures}
          </LumenText>
        )}
        <footer className="hbar-app-ui-paywall-feature-footer">
          <LumenText as="p" className="hbar-app-ui-paywall-feature-price">
            <strong>{content.labels.priceAmount}</strong> <span>{content.labels.priceDetails}</span>
          </LumenText>
          <div className="hbar-app-ui-paywall-feature-actions">
            <LumenButton variant="text" data-paywall2-action="defer" onClick={() => report(onAction, 'defer-request')}>
              {content.labels.defer}
            </LumenButton>
            <LumenButton
              tone="primary"
              data-paywall2-action="upgrade"
              onClick={() => report(onAction, 'upgrade-request')}
            >
              {content.labels.upgrade}
            </LumenButton>
          </div>
        </footer>
      </div>
    </Root>
  )
}

function Plans(props: Omit<LumenPaywallProps, 'content'> & { content: LumenPaywallPlanContent }) {
  const { content, onAction } = props
  const [period, setPeriod] = React.useState(content.initialPeriod)
  const plans = uniqueLumenPaywallItems(content.plans)
  return (
    <Root {...props} className="hbar-app-ui-paywall-plans-surface">
      <header className="hbar-app-ui-paywall-plans-head">
        <div>
          <LumenText as="h2" variant="title">
            {content.labels.title}
          </LumenText>
          <LumenText as="p" tone="muted">
            {content.labels.description}
          </LumenText>
        </div>
        <div className="hbar-app-ui-paywall-period" role="group" aria-label={content.labels.billingPeriod}>
          <LumenButton
            variant={period === 'monthly' ? 'solid' : 'text'}
            aria-pressed={period === 'monthly'}
            onClick={() => setPeriod('monthly')}
          >
            {content.labels.monthly}
          </LumenButton>
          <LumenButton
            variant={period === 'yearly' ? 'solid' : 'text'}
            aria-pressed={period === 'yearly'}
            onClick={() => setPeriod('yearly')}
          >
            {content.labels.yearly}
          </LumenButton>
        </div>
      </header>
      <LumenText as="p" tone="muted" className="hbar-app-ui-paywall-plans-note">
        {content.labels.yearlyNote}
      </LumenText>
      <div className="hbar-app-ui-paywall-plan-list" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
        {plans.map((plan) => {
          const price = period === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice
          return (
            <article className={`hbar-app-ui-paywall-plan${plan.featured ? ' is-featured' : ''}`} key={plan.id}>
              <header className="hbar-app-ui-paywall-plan-head">
                <div>
                  <strong className="hbar-app-ui-paywall-plan-name">{plan.name}</strong>
                  <p>{plan.description}</p>
                </div>
                {plan.current ? <LumenBadge value={content.labels.current} tone="info" /> : null}
                {plan.featured ? <LumenBadge value={content.labels.recommended} tone="info" /> : null}
              </header>
              <div className="hbar-app-ui-paywall-plan-price">
                <strong>{price}</strong>
                <span>{plan.priceSuffix}</span>
              </div>
              <ul className="hbar-app-ui-paywall-plan-features">
                {plan.features.map((feature, index) => (
                  <li className="hbar-app-ui-paywall-plan-feature" key={`${index}-${feature}`}>
                    <Glyph name="check" tier="xs" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <LumenButton
                variant={plan.featured && !plan.current ? 'solid' : 'outlined'}
                tone={plan.featured && !plan.current ? 'primary' : 'neutral'}
                disabled={plan.current}
                onClick={() => report(onAction, 'choose', plan.id)}
              >
                {plan.current ? content.labels.current : `${content.labels.choose} ${plan.name}`}
              </LumenButton>
            </article>
          )
        })}
      </div>
      <footer className="hbar-app-ui-paywall-plans-foot">
        <LumenText as="p" tone="muted">
          {content.labels.priceNote}
        </LumenText>
        <LumenButton variant="text" onClick={() => report(onAction, 'compare')}>
          {content.labels.compare}
        </LumenButton>
      </footer>
    </Root>
  )
}

function Usage(props: Omit<LumenPaywallProps, 'content'> & { content: LumenPaywallUsageContent }) {
  const { content, onAction } = props
  const meters = uniqueLumenPaywallItems(content.meters)
  return (
    <Root {...props} className="hbar-app-ui-paywall-limit-surface">
      <section className="hbar-app-ui-paywall-limit">
        <header className="hbar-app-ui-paywall-limit-head">
          <span className="hbar-app-ui-paywall-icon">
            <Glyph name="alert" tier="md" />
          </span>
          <div>
            <LumenText as="h2" variant="heading">
              {content.labels.title}
            </LumenText>
            <LumenText as="p" tone="muted">
              {content.labels.description}
            </LumenText>
          </div>
        </header>
        <div className="hbar-app-ui-paywall-meter-list" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
          {meters.map((meter) => {
            const progress = Math.max(0, Math.min(100, meter.progress))
            return (
              <div className="hbar-app-ui-paywall-meter" key={meter.id}>
                <div className="hbar-app-ui-paywall-meter-head">
                  <strong>{meter.label}</strong>
                  <span>{meter.value}</span>
                </div>
                <LumenProgress
                  className="hbar-app-ui-paywall-meter-track"
                  label={meter.label}
                  value={progress}
                  tone="info"
                />
              </div>
            )
          })}
        </div>
        <section className="hbar-app-ui-paywall-limit-card">
          <LumenText as="strong" variant="heading">
            {content.labels.proTitle}
          </LumenText>
          <LumenText as="p" tone="muted">
            {content.labels.proDescription}
          </LumenText>
          <div className="hbar-app-ui-paywall-limit-actions">
            <LumenButton variant="outlined" onClick={() => report(onAction, 'top-up')}>
              {content.labels.topUp}
            </LumenButton>
            <LumenButton tone="primary" onClick={() => report(onAction, 'upgrade')}>
              {content.labels.upgrade}
            </LumenButton>
          </div>
        </section>
      </section>
    </Root>
  )
}

function Trial(props: Omit<LumenPaywallProps, 'content'> & { content: LumenPaywallTrialContent }) {
  const { content, onAction } = props
  const rows = uniqueLumenPaywallItems(content.rows)
  return (
    <Root {...props} className="hbar-app-ui-paywall-trial-surface">
      <section className="hbar-app-ui-paywall-trial-card">
        <LumenText as="p" variant="label" tone="muted" className="hbar-app-ui-paywall-eyebrow">
          {content.labels.eyebrow}
        </LumenText>
        <LumenText as="h2" variant="title">
          {content.labels.title}
        </LumenText>
        <LumenText as="p" tone="muted">
          {content.labels.description}
        </LumenText>
        <div className="hbar-app-ui-paywall-trial-list" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
          {rows.map((row) => (
            <div className="hbar-app-ui-paywall-trial-row" key={row.id}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>
        <section className="hbar-app-ui-paywall-payment">
          <Glyph name="card" />
          <div>
            <strong>{content.labels.paymentTitle}</strong>
            <small>{content.labels.paymentDescription}</small>
          </div>
          <LumenButton variant="text" onClick={() => report(onAction, 'change-payment')}>
            {content.labels.change}
          </LumenButton>
        </section>
        <LumenButton tone="primary" onClick={() => report(onAction, 'reactivate')}>
          {content.labels.reactivate}
        </LumenButton>
        <LumenText as="p" tone="muted" className="hbar-app-ui-paywall-trial-note">
          {content.labels.renewalNote}
        </LumenText>
      </section>
    </Root>
  )
}

function Reads(props: Omit<LumenPaywallProps, 'content'> & { content: LumenPaywallReadsContent }) {
  const { content, onAction } = props
  const [email, setEmail] = React.useState('')
  return (
    <Root {...props} className="hbar-app-ui-paywall-reads-surface">
      <section className="hbar-app-ui-paywall-reads-card">
        <LumenProgress
          className="hbar-app-ui-paywall-read-progress"
          label={content.labels.eyebrow}
          value={content.readProgress}
          tone="info"
          aria-hidden="true"
        />
        <LumenText as="p" variant="label" tone="muted" className="hbar-app-ui-paywall-eyebrow">
          {content.labels.eyebrow}
        </LumenText>
        <LumenText as="h2" variant="title">
          {content.labels.title}
        </LumenText>
        <LumenText as="p" tone="muted">
          {content.labels.description}
        </LumenText>
        <form
          className="hbar-app-ui-paywall-reads-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (email.trim()) {
              report(onAction, 'keep-reading', email.trim())
            }
          }}
        >
          <LumenInput
            aria-label={content.labels.emailLabel}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
            placeholder={content.labels.emailPlaceholder}
          />
          <LumenButton tone="primary" type="submit" disabled={!email.trim()}>
            {content.labels.keepReading}
          </LumenButton>
        </form>
        <p className="hbar-app-ui-paywall-reads-subscribe">
          <span>{content.labels.alreadySubscribed}</span>
          <LumenButton variant="text" onClick={() => report(onAction, 'sign-in')}>
            {content.labels.signIn}
          </LumenButton>
        </p>
        <ul className="hbar-app-ui-paywall-reads-assurances" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
          {content.assurances.map((assurance, index) => (
            <li key={`${index}-${assurance}`}>
              <Glyph name="check" tier="xs" />
              {assurance}
            </li>
          ))}
        </ul>
      </section>
    </Root>
  )
}

function Seat(props: Omit<LumenPaywallProps, 'content'> & { content: LumenPaywallSeatContent }) {
  const { content, onAction, variantId } = props
  const [reason, setReason] = React.useState('')
  const admins = uniqueLumenPaywallItems(content.admins)
  return (
    <Root {...props} className="hbar-app-ui-paywall-seat-surface">
      <section className="hbar-app-ui-paywall-seat">
        <header className="hbar-app-ui-paywall-seat-head">
          <span className="hbar-app-ui-paywall-icon">
            <Glyph name="lock" tier="lg" />
          </span>
          <div>
            <LumenText as="h2" variant="title">
              {content.labels.title}
            </LumenText>
            <LumenText as="p" tone="muted">
              <Glyph name="building" tier="xs" />
              {content.labels.description}
            </LumenText>
          </div>
        </header>
        <section className="hbar-app-ui-paywall-seat-card">
          <LumenText as="h3" variant="heading">
            {content.labels.cardTitle}
          </LumenText>
          <LumenText as="p" tone="muted">
            {content.labels.cardDescription}
          </LumenText>
          <div className="hbar-app-ui-paywall-admin-list" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
            {admins.map((admin) => (
              <div className="hbar-app-ui-paywall-admin" key={admin.id}>
                <span aria-hidden="true">{admin.initials}</span>
                <div>
                  <strong>{admin.name}</strong>
                  <small>{admin.role}</small>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="hbar-app-ui-paywall-seat-card">
          <label htmlFor={`${variantId}-reason`}>{content.labels.reasonLabel}</label>
          <LumenTextarea
            id={`${variantId}-reason`}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
            placeholder={content.labels.reasonPlaceholder}
          />
        </section>
        <footer className="hbar-app-ui-paywall-seat-actions">
          <LumenButton variant="outlined" onClick={() => report(onAction, 'compare')}>
            {content.labels.compare}
          </LumenButton>
          <LumenButton tone="primary" disabled={!reason.trim()} onClick={() => report(onAction, 'send', reason.trim())}>
            {content.labels.send}
          </LumenButton>
        </footer>
      </section>
    </Root>
  )
}

function empty(props: LumenPaywallProps) {
  const names = [
    '',
    'hbar-app-ui-paywall-article-surface',
    'hbar-app-ui-paywall-feature-gate-surface',
    'hbar-app-ui-paywall-plans-surface',
    'hbar-app-ui-paywall-limit-surface',
    'hbar-app-ui-paywall-trial-surface',
    'hbar-app-ui-paywall-reads-surface',
    'hbar-app-ui-paywall-seat-surface',
  ]
  return (
    <Root {...props} className={`hbar-app-ui-paywall-empty ${names[props.variant] ?? names[1]}`}>
      {null}
    </Root>
  )
}

export function LumenPaywall(props: LumenPaywallProps) {
  const inheritedContent = useLumenPaywallContent()
  const content = props.content ?? inheritedContent
  if (props.variant === 1) {
    return content?.article ? <Article {...props} content={content.article} /> : empty(props)
  }
  if (props.variant === 2) {
    return content?.featureGate ? <FeatureGate {...props} content={content.featureGate} /> : empty(props)
  }
  if (props.variant === 3) {
    if (content?.plansReference) {
      return (
        <LumenPaywall3Reference
          variantId={props.variantId}
          density={props.density}
          surface={props.surface}
          state={props.state}
          visualMode={props.visualMode}
          className={props.className}
          viewModel={content.plansReference}
        />
      )
    }
    return content?.plans ? (
      <Plans key={content.plans.initialPeriod} {...props} content={content.plans} />
    ) : (
      empty(props)
    )
  }
  if (props.variant === 4) {
    if (content?.usageReference) {
      return (
        <LumenPaywall4Reference
          variantId={props.variantId}
          density={props.density}
          surface={props.surface}
          state={props.state}
          visualMode={props.visualMode}
          className={props.className}
          viewModel={content.usageReference}
        />
      )
    }
    return content?.usage ? <Usage {...props} content={content.usage} /> : empty(props)
  }
  if (props.variant === 5) {
    if (content?.trialReference) {
      return (
        <LumenPaywall5Reference
          variantId={props.variantId}
          density={props.density}
          surface={props.surface}
          state={props.state}
          visualMode={props.visualMode}
          className={props.className}
          viewModel={content.trialReference}
        />
      )
    }
    return content?.trial ? <Trial {...props} content={content.trial} /> : empty(props)
  }
  if (props.variant === 6) {
    if (content?.readsReference) {
      return (
        <LumenPaywall6Reference
          variantId={props.variantId}
          density={props.density}
          surface={props.surface}
          state={props.state}
          visualMode={props.visualMode}
          className={props.className}
          viewModel={content.readsReference}
        />
      )
    }
    return content?.reads ? <Reads {...props} content={content.reads} /> : empty(props)
  }
  if (props.variant === 7) {
    if (content?.adminReference) {
      return (
        <LumenPaywall7Reference
          variantId={props.variantId}
          density={props.density}
          surface={props.surface}
          state={props.state}
          visualMode={props.visualMode}
          className={props.className}
          viewModel={content.adminReference}
        />
      )
    }
    return content?.seat ? <Seat {...props} content={content.seat} /> : empty(props)
  }
  return empty(props)
}

function variant(value: number, props: LumenPaywallVariantProps) {
  return <LumenPaywall {...props} variant={value} variantId={`hbar-app-ui-paywall-${value}`} />
}

export function LumenPaywall01(props: LumenPaywallVariantProps) {
  return variant(1, props)
}

export function LumenPaywall02(props: LumenPaywallVariantProps) {
  return variant(2, props)
}

export function LumenPaywall03(props: LumenPaywallVariantProps) {
  return variant(3, props)
}

export function LumenPaywall04(props: LumenPaywallVariantProps) {
  return variant(4, props)
}

export function LumenPaywall05(props: LumenPaywallVariantProps) {
  return variant(5, props)
}

export function LumenPaywall06(props: LumenPaywallVariantProps) {
  return variant(6, props)
}

export function LumenPaywall07(props: LumenPaywallVariantProps) {
  return variant(7, props)
}
