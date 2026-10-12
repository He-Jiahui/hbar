'use client'

import * as React from 'react'
import { LumenFormField, LumenInput, LumenChoiceSelect } from './forms'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenStatus, LumenText } from './primitives'
import { LumenOnboarding1Reference, type LumenOnboarding1ReferenceViewModel } from './onboarding-1-reference'
import { LumenOnboarding2Reference, type LumenOnboarding2ReferenceViewModel } from './onboarding-2-reference'
import { LumenOnboarding3Reference, type LumenOnboarding3ReferenceViewModel } from './onboarding-3-reference'
import { LumenOnboarding4Reference, type LumenOnboarding4ReferenceViewModel } from './onboarding-4-reference'
import { LumenOnboarding5Reference, type LumenOnboarding5ReferenceViewModel } from './onboarding-5-reference'
import { LumenOnboarding6Reference, type LumenOnboarding6ReferenceViewModel } from './onboarding-6-reference'
import { LumenOnboarding7Reference, type LumenOnboarding7ReferenceViewModel } from './onboarding-7-reference'
import './onboarding.css'
import { LumenProgress, LumenTabs } from './ui-controls'

export interface LumenOnboardingListStrategy {
  readonly kind: 'content-grown' | 'pane-scroll'
  readonly expectedMaximum: number
}

export interface LumenOnboardingChoice {
  readonly id: string
  readonly label: string
  readonly detail?: string | undefined
  readonly disabled?: boolean | undefined
}

export interface LumenOnboardingMetric {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly tone?: 'neutral' | 'success' | 'warning' | 'danger' | undefined
}

export interface LumenOnboardingProfileContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly name: string
    readonly role: string
    readonly continue: string
    readonly preview: string
  }
  readonly initialName: string
  readonly initialRole: string
  readonly metrics: readonly LumenOnboardingMetric[]
}

export interface LumenOnboardingStepsContent {
  readonly labels: {
    readonly title: string
    readonly detail: (current: number, total: number) => string
    readonly complete: string
    readonly current: string
    readonly pending: string
    readonly body: string
    readonly continue: string
    readonly empty: string
  }
  readonly steps: readonly LumenOnboardingChoice[]
  readonly initialStepId: string
  readonly initialCompletedCount: number
  readonly listStrategy: LumenOnboardingListStrategy
}

export interface LumenOnboardingChecklistContent {
  readonly labels: {
    readonly title: string
    readonly detail: (completed: number, total: number) => string
    readonly progress: string
    readonly complete: string
    readonly required: string
    readonly view: string
    readonly start: string
    readonly empty: string
  }
  readonly tasks: readonly LumenOnboardingChoice[]
  readonly initialCompletedCount: number
  readonly listStrategy: LumenOnboardingListStrategy
}

export interface LumenOnboardingUseCaseContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly useCases: string
    readonly teamSize: string
    readonly continue: string
    readonly empty: string
  }
  readonly useCases: readonly LumenOnboardingChoice[]
  readonly sizes: readonly LumenOnboardingChoice[]
  readonly initialUseCaseId: string
  readonly initialSizeId: string
}

export interface LumenOnboardingInvitee {
  readonly id: string
  readonly initials: string
  readonly name: string
  readonly status: string
  readonly statusTone: 'neutral' | 'success' | 'warning' | 'danger'
}

export interface LumenOnboardingInviteContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly email: string
    readonly emailPlaceholder: string
    readonly role: string
    readonly send: string
    readonly copy: string
    readonly copied: string
    readonly invitees: string
    readonly empty: string
  }
  readonly roles: readonly LumenOnboardingChoice[]
  readonly initialRoleId: string
  readonly invitees: readonly LumenOnboardingInvitee[]
  readonly shareLink: string
  readonly listStrategy: LumenOnboardingListStrategy
}

export interface LumenOnboardingCompleteContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly status: string
    readonly heading: string
    readonly body: string
    readonly primary: string
    readonly secondary: string
  }
  readonly metrics: readonly LumenOnboardingMetric[]
  readonly primaryValue: string
  readonly secondaryValue: string
}

export interface LumenOnboardingSlugContent {
  readonly labels: {
    readonly steps: string
    readonly detail: string
    readonly workspaceName: string
    readonly slug: string
    readonly preview: string
    readonly next: string
    readonly finish: string
  }
  readonly steps: readonly LumenOnboardingChoice[]
  readonly initialStepId: string
  readonly finishStepId: string
  readonly initialWorkspaceName: string
  readonly initialSlug: string
  readonly baseUrl: string
}

export interface LumenOnboardingContent {
  readonly profile?: LumenOnboardingProfileContent | undefined
  readonly profileReference?: LumenOnboarding1ReferenceViewModel | undefined
  readonly stepperReference?: LumenOnboarding2ReferenceViewModel | undefined
  readonly checklistReference?: LumenOnboarding3ReferenceViewModel | undefined
  readonly useCaseReference?: LumenOnboarding4ReferenceViewModel | undefined
  readonly invitationReference?: LumenOnboarding5ReferenceViewModel | undefined
  readonly completionReference?: LumenOnboarding6ReferenceViewModel | undefined
  readonly workspaceReference?: LumenOnboarding7ReferenceViewModel | undefined
  readonly steps?: LumenOnboardingStepsContent | undefined
  readonly checklist?: LumenOnboardingChecklistContent | undefined
  readonly useCase?: LumenOnboardingUseCaseContent | undefined
  readonly invite?: LumenOnboardingInviteContent | undefined
  readonly complete?: LumenOnboardingCompleteContent | undefined
  readonly slug?: LumenOnboardingSlugContent | undefined
}

export interface LumenOnboardingProviderProps {
  readonly content: LumenOnboardingContent
  readonly children: React.ReactNode
}

export interface LumenOnboardingAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenOnboardingProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenOnboardingContent | undefined
  readonly onAction?: ((event: LumenOnboardingAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
}

export type LumenOnboardingVariantProps = Omit<LumenOnboardingProps, 'variant' | 'variantId'>

const Context = React.createContext<LumenOnboardingContent | undefined>(undefined)

export function LumenOnboardingProvider({ content, children }: LumenOnboardingProviderProps) {
  return <Context.Provider value={content}>{children}</Context.Provider>
}

export function useLumenOnboardingContent() {
  return React.useContext(Context)
}

export function uniqueLumenOnboardingItems<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function selectLumenOnboardingItem<T extends { readonly id: string }>(
  items: readonly T[],
  id: string | undefined,
): T | undefined {
  return items.find((item) => item.id === id) ?? items[0]
}

const report = (fn: LumenOnboardingProps['onAction'], actionId: string, value?: string) =>
  fn?.(value === undefined ? { actionId } : { actionId, value })

function Glyph({ name }: { name: 'check' | 'chevron' | 'mail' | 'copy' }) {
  const paths = {
    check: 'm3 8 3 3 7-7',
    chevron: 'm6 3 5 5-5 5',
    mail: 'M2 3h12v10H2Zm0 1 6 5 6-5',
    copy: 'M6 5h7v9H6ZM3 2h7v3',
  } as const
  const d = paths[name]
  return (
    <svg className="lumen-onboarding-glyph" viewBox="0 0 16 16" aria-hidden="true">
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
}: Omit<LumenOnboardingProps, 'content' | 'onAction'> & { children: React.ReactNode }) {
  const contentClassName = [
    'lumen-onboarding',
    `hbar-app-ui-onboarding-variant-${variant}`,
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
      className="lumen-onboarding-surface"
      contentClassName={contentClassName}
      data-lumen-component="onboarding"
      data-lumen-variant={variant}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-state={state}
    >
      {children}
    </LumenSurface>
  )
}

function Header({ title, detail }: { title: string; detail: string }) {
  return (
    <header className="lumen-onboarding-header">
      <div>
        <LumenText as="h2" variant="heading">
          {title}
        </LumenText>
        <LumenText as="p" tone="muted" variant="supporting">
          {detail}
        </LumenText>
      </div>
    </header>
  )
}

function Metrics({ metrics }: { metrics: readonly LumenOnboardingMetric[] }) {
  return (
    <dl className="lumen-onboarding-metrics">
      {uniqueLumenOnboardingItems(metrics).map((metric) => (
        <div key={metric.id} data-tone={metric.tone}>
          <dt>{metric.label}</dt>
          <dd>{metric.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Profile(props: Omit<LumenOnboardingProps, 'content'> & { content: LumenOnboardingProfileContent }) {
  const [name, setName] = React.useState(props.content.initialName)
  const [role, setRole] = React.useState(props.content.initialRole)
  return (
    <Root {...props}>
      <div className="lumen-onboarding-profile">
        <main>
          <Header title={props.content.labels.title} detail={props.content.labels.detail} />
          <LumenFormField controlId={`${props.variantId}-name`} label={props.content.labels.name}>
            <LumenInput value={name} onChange={(event) => setName(event.currentTarget.value)} />
          </LumenFormField>
          <LumenFormField controlId={`${props.variantId}-role`} label={props.content.labels.role}>
            <LumenInput value={role} onChange={(event) => setRole(event.currentTarget.value)} />
          </LumenFormField>
          <LumenButton
            tone="primary"
            disabled={!name.trim() || !role.trim()}
            onClick={() =>
              report(props.onAction, 'save-profile', JSON.stringify({ name: name.trim(), role: role.trim() }))
            }
          >
            {props.content.labels.continue}
          </LumenButton>
        </main>
        <aside aria-label={props.content.labels.preview}>
          <span className="lumen-onboarding-avatar">{name.trim().slice(0, 1)}</span>
          <LumenText as="strong" variant="heading">
            {name}
          </LumenText>
          <LumenText as="small" tone="muted">
            {role}
          </LumenText>
          <Metrics metrics={props.content.metrics} />
        </aside>
      </div>
    </Root>
  )
}

function Steps(props: Omit<LumenOnboardingProps, 'content'> & { content: LumenOnboardingStepsContent }) {
  const steps = uniqueLumenOnboardingItems(props.content.steps)
  const initialIndex = Math.max(
    0,
    steps.findIndex((item) => item.id === props.content.initialStepId),
  )
  const [index, setIndex] = React.useState(initialIndex)
  const [completed, setCompleted] = React.useState(
    Math.max(0, Math.min(steps.length, props.content.initialCompletedCount)),
  )
  const selected = steps[index] ?? steps[0]
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail(index + 1, steps.length)} />
      <div className="lumen-onboarding-step-layout">
        <nav data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
          {steps.length ? (
            steps.map((step, stepIndex) => (
              <OnboardingStepButton
                key={step.id}
                step={step}
                stepIndex={stepIndex}
                currentIndex={index}
                completed={completed}
                labels={props.content.labels}
                onSelect={setIndex}
              />
            ))
          ) : (
            <LumenText as="p" tone="muted">
              {props.content.labels.empty}
            </LumenText>
          )}
        </nav>
        <article>
          <LumenText as="strong" variant="heading">
            {selected?.label ?? props.content.labels.empty}
          </LumenText>
          <LumenText as="p" tone="muted">
            {selected?.detail ?? props.content.labels.body}
          </LumenText>
          <LumenButton
            tone="primary"
            disabled={!selected}
            onClick={() => {
              setCompleted((value) => Math.max(value, index + 1))
              setIndex((value) => Math.min(steps.length - 1, value + 1))
              report(props.onAction, 'step', selected?.id)
            }}
          >
            {props.content.labels.continue}
          </LumenButton>
        </article>
      </div>
    </Root>
  )
}

function Checklist(props: Omit<LumenOnboardingProps, 'content'> & { content: LumenOnboardingChecklistContent }) {
  const tasks = uniqueLumenOnboardingItems(props.content.tasks)
  const [completed, setCompleted] = React.useState(
    Math.max(0, Math.min(tasks.length, props.content.initialCompletedCount)),
  )
  const progress = tasks.length ? (completed / tasks.length) * 100 : 0
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail(completed, tasks.length)} />
      <LumenProgress
        className="lumen-onboarding-progress"
        label={props.content.labels.progress}
        value={progress}
        tone="info"
      />
      <div className="lumen-onboarding-checklist" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {tasks.length ? (
          tasks.map((task, index) => {
            const done = index < completed
            return (
              <article key={task.id}>
                <span>{done ? <Glyph name="check" /> : index + 1}</span>
                <div>
                  <strong>{task.label}</strong>
                  <small>{done ? props.content.labels.complete : (task.detail ?? props.content.labels.required)}</small>
                </div>
                <LumenButton
                  variant={done ? 'text' : 'outlined'}
                  disabled={task.disabled}
                  onClick={() => {
                    setCompleted((value) => Math.max(value, index + 1))
                    report(props.onAction, 'task', task.id)
                  }}
                >
                  {done ? props.content.labels.view : props.content.labels.start}
                </LumenButton>
              </article>
            )
          })
        ) : (
          <LumenText as="p" tone="muted">
            {props.content.labels.empty}
          </LumenText>
        )}
      </div>
    </Root>
  )
}

function UseCase(props: Omit<LumenOnboardingProps, 'content'> & { content: LumenOnboardingUseCaseContent }) {
  const useCases = uniqueLumenOnboardingItems(props.content.useCases)
  const sizes = uniqueLumenOnboardingItems(props.content.sizes)
  const [useCaseId, setUseCaseId] = React.useState(props.content.initialUseCaseId)
  const [sizeId, setSizeId] = React.useState(props.content.initialSizeId)
  const useCase = selectLumenOnboardingItem(useCases, useCaseId)
  const size = selectLumenOnboardingItem(sizes, sizeId)
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-onboarding-use-cases" role="group" aria-label={props.content.labels.useCases}>
        {useCases.length ? (
          useCases.map((item) => (
            <LumenButton
              key={item.id}
              variant={useCase?.id === item.id ? 'solid' : 'outlined'}
              aria-pressed={useCase?.id === item.id}
              disabled={item.disabled}
              onClick={() => setUseCaseId(item.id)}
            >
              <strong>{item.label}</strong>
              {item.detail ? <small>{item.detail}</small> : null}
            </LumenButton>
          ))
        ) : (
          <LumenText as="p" tone="muted">
            {props.content.labels.empty}
          </LumenText>
        )}
      </div>
      <LumenTabs
        className="lumen-onboarding-tabs"
        label={props.content.labels.teamSize}
        items={sizes}
        selectedId={size?.id ?? null}
        onChange={setSizeId}
      />
      <LumenButton
        className="lumen-onboarding-primary"
        tone="primary"
        disabled={!useCase || !size}
        onClick={() => report(props.onAction, 'save-use-case', `${useCase?.id ?? ''}:${size?.id ?? ''}`)}
      >
        {props.content.labels.continue}
      </LumenButton>
    </Root>
  )
}

function Invite(props: Omit<LumenOnboardingProps, 'content'> & { content: LumenOnboardingInviteContent }) {
  const roles = uniqueLumenOnboardingItems(props.content.roles)
  const invitees = uniqueLumenOnboardingItems(props.content.invitees)
  const [roleId, setRoleId] = React.useState(props.content.initialRoleId)
  const [email, setEmail] = React.useState('')
  const [copied, setCopied] = React.useState(false)
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-onboarding-invite-form">
        <LumenInput
          type="email"
          aria-label={props.content.labels.email}
          placeholder={props.content.labels.emailPlaceholder}
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
        />
        <LumenChoiceSelect
          id="onboarding-invite-role"
          label={props.content.labels.role}
          options={roles}
          value={roleId}
          onValueChange={setRoleId}
        />
        <LumenButton
          tone="primary"
          disabled={!email.trim()}
          onClick={() => report(props.onAction, 'invite', `${email.trim()}:${roleId}`)}
        >
          <Glyph name="mail" />
          {props.content.labels.send}
        </LumenButton>
      </div>
      <div
        className="lumen-onboarding-invitees"
        aria-label={props.content.labels.invitees}
        data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}
      >
        {invitees.length ? (
          invitees.map((invitee) => (
            <article key={invitee.id}>
              <span className="lumen-onboarding-avatar">{invitee.initials}</span>
              <strong>{invitee.name}</strong>
              <LumenStatus value={invitee.status} tone={invitee.statusTone} />
            </article>
          ))
        ) : (
          <LumenText as="p" tone="muted">
            {props.content.labels.empty}
          </LumenText>
        )}
      </div>
      <div className="lumen-onboarding-share">
        <code>{props.content.shareLink}</code>
        <LumenButton
          variant="outlined"
          onClick={() => {
            setCopied(true)
            report(props.onAction, 'copy-link', props.content.shareLink)
          }}
        >
          <Glyph name="copy" />
          {copied ? props.content.labels.copied : props.content.labels.copy}
        </LumenButton>
      </div>
    </Root>
  )
}

function Complete(props: Omit<LumenOnboardingProps, 'content'> & { content: LumenOnboardingCompleteContent }) {
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <LumenStatus value={props.content.labels.status} tone="success" />
      <div className="lumen-onboarding-complete">
        <Glyph name="check" />
        <LumenText as="h2" variant="title">
          {props.content.labels.heading}
        </LumenText>
        <LumenText as="p" tone="muted">
          {props.content.labels.body}
        </LumenText>
        <Metrics metrics={props.content.metrics} />
        <footer>
          <LumenButton tone="primary" onClick={() => report(props.onAction, 'open', props.content.primaryValue)}>
            {props.content.labels.primary}
          </LumenButton>
          <LumenButton variant="outlined" onClick={() => report(props.onAction, 'open', props.content.secondaryValue)}>
            {props.content.labels.secondary}
          </LumenButton>
        </footer>
      </div>
    </Root>
  )
}

function Slug(props: Omit<LumenOnboardingProps, 'content'> & { content: LumenOnboardingSlugContent }) {
  const steps = uniqueLumenOnboardingItems(props.content.steps)
  const [stepId, setStepId] = React.useState(props.content.initialStepId)
  const [name, setName] = React.useState(props.content.initialWorkspaceName)
  const [slug, setSlug] = React.useState(props.content.initialSlug)
  const step = selectLumenOnboardingItem(steps, stepId)
  return (
    <Root {...props}>
      <LumenTabs
        className="lumen-onboarding-tabs"
        label={props.content.labels.steps}
        items={steps}
        selectedId={step?.id ?? null}
        onChange={setStepId}
      />
      <article className="lumen-onboarding-slug">
        <Header title={step?.label ?? ''} detail={step?.detail ?? props.content.labels.detail} />
        <LumenFormField controlId={`${props.variantId}-workspace`} label={props.content.labels.workspaceName}>
          <LumenInput value={name} onChange={(event) => setName(event.currentTarget.value)} />
        </LumenFormField>
        <LumenFormField controlId={`${props.variantId}-slug`} label={props.content.labels.slug}>
          <LumenInput value={slug} onChange={(event) => setSlug(event.currentTarget.value)} />
        </LumenFormField>
        <LumenText as="span" className="lumen-onboarding-url" aria-label={props.content.labels.preview}>
          {props.content.baseUrl}
          {slug}
        </LumenText>
      </article>
      <LumenButton
        className="lumen-onboarding-primary"
        tone="primary"
        disabled={!name.trim() || !slug.trim()}
        onClick={() => report(props.onAction, step?.id === props.content.finishStepId ? 'finish' : 'step', step?.id)}
      >
        {step?.id === props.content.finishStepId ? props.content.labels.finish : props.content.labels.next}
      </LumenButton>
    </Root>
  )
}

function empty(props: LumenOnboardingProps) {
  return <Root {...props}>{null}</Root>
}

export function LumenOnboarding(props: LumenOnboardingProps) {
  const inheritedContent = useLumenOnboardingContent()
  const content = props.content ?? inheritedContent
  if (props.variant === 1) {
    if (content?.profileReference) {
      return (
        <LumenOnboarding1Reference
          variantId={props.variantId}
          density={props.density}
          surface={props.surface}
          state={props.state}
          visualMode={props.visualMode}
          className={props.className}
          viewModel={content.profileReference}
        />
      )
    }
    return content?.profile ? <Profile {...props} content={content.profile} /> : empty(props)
  }
  if (props.variant === 2) {
    if (content?.stepperReference) {
      return (
        <LumenOnboarding2Reference
          variantId={props.variantId}
          density={props.density}
          surface={props.surface}
          state={props.state}
          visualMode={props.visualMode}
          className={props.className}
          viewModel={content.stepperReference}
        />
      )
    }
    return content?.steps ? <Steps {...props} content={content.steps} /> : empty(props)
  }
  if (props.variant === 3) {
    if (content?.checklistReference) {
      return (
        <LumenOnboarding3Reference
          variantId={props.variantId}
          density={props.density}
          surface={props.surface}
          state={props.state}
          visualMode={props.visualMode}
          className={props.className}
          viewModel={content.checklistReference}
        />
      )
    }
    return content?.checklist ? <Checklist {...props} content={content.checklist} /> : empty(props)
  }
  if (props.variant === 4) {
    if (content?.useCaseReference) {
      return (
        <LumenOnboarding4Reference
          variantId={props.variantId}
          density={props.density}
          surface={props.surface}
          state={props.state}
          visualMode={props.visualMode}
          className={props.className}
          viewModel={content.useCaseReference}
        />
      )
    }
    return content?.useCase ? <UseCase {...props} content={content.useCase} /> : empty(props)
  }
  if (props.variant === 5) {
    if (content?.invitationReference) {
      return (
        <LumenOnboarding5Reference
          variantId={props.variantId}
          density={props.density}
          surface={props.surface}
          state={props.state}
          visualMode={props.visualMode}
          className={props.className}
          viewModel={content.invitationReference}
        />
      )
    }
    return content?.invite ? <Invite {...props} content={content.invite} /> : empty(props)
  }
  if (props.variant === 6) {
    if (content?.completionReference) {
      return (
        <LumenOnboarding6Reference
          variantId={props.variantId}
          density={props.density}
          surface={props.surface}
          state={props.state}
          visualMode={props.visualMode}
          className={props.className}
          viewModel={content.completionReference}
        />
      )
    }
    return content?.complete ? <Complete {...props} content={content.complete} /> : empty(props)
  }
  if (props.variant === 7) {
    if (content?.workspaceReference) {
      return (
        <LumenOnboarding7Reference
          variantId={props.variantId}
          density={props.density}
          surface={props.surface}
          state={props.state}
          visualMode={props.visualMode}
          className={props.className}
          viewModel={content.workspaceReference}
        />
      )
    }
    return content?.slug ? <Slug {...props} content={content.slug} /> : empty(props)
  }
  return empty(props)
}

function variant(value: number, props: LumenOnboardingVariantProps) {
  return <LumenOnboarding {...props} variant={value} variantId={`hbar-app-ui-onboarding-${value}`} />
}

export const LumenOnboarding01 = (props: LumenOnboardingVariantProps) => variant(1, props)

export const LumenOnboarding02 = (props: LumenOnboardingVariantProps) => variant(2, props)

export const LumenOnboarding03 = (props: LumenOnboardingVariantProps) => variant(3, props)

export const LumenOnboarding04 = (props: LumenOnboardingVariantProps) => variant(4, props)

export const LumenOnboarding05 = (props: LumenOnboardingVariantProps) => variant(5, props)

export const LumenOnboarding06 = (props: LumenOnboardingVariantProps) => variant(6, props)

export const LumenOnboarding07 = (props: LumenOnboardingVariantProps) => variant(7, props)

function OnboardingStepButton({
  step,
  stepIndex,
  currentIndex,
  completed,
  labels,
  onSelect,
}: {
  readonly step: LumenOnboardingChoice
  readonly stepIndex: number
  readonly currentIndex: number
  readonly completed: number
  readonly labels: LumenOnboardingStepsContent['labels']
  readonly onSelect: (index: number) => void
}) {
  let statusLabel = labels.pending
  if (stepIndex < completed) {
    statusLabel = labels.complete
  } else if (stepIndex === currentIndex) {
    statusLabel = labels.current
  }

  return (
    <LumenButton
      variant={stepIndex === currentIndex ? 'solid' : 'text'}
      disabled={step.disabled}
      onClick={() => onSelect(stepIndex)}
    >
      <span>{stepIndex < completed ? <Glyph name="check" /> : stepIndex + 1}</span>
      <span>
        <strong>{step.label}</strong>
        <small>{statusLabel}</small>
      </span>
      <Glyph name="chevron" />
    </LumenButton>
  )
}
