'use client'

import * as React from 'react'
import { LumenFormField, LumenInput, LumenSelect, LumenTextarea, LumenToggleControl } from './forms'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenIconButton, LumenStatus, LumenText } from './primitives'
import './app-dialog.css'
import './app-dialog-plan.css'
import './app-dialog-delete.css'
import './app-dialog-invite.css'
import './app-dialog-wizard.css'
import './app-dialog-alert.css'
import './app-dialog-evidence.css'
import './app-dialog-menu-reference.css'

export interface LumenAppDialogListStrategy {
  readonly kind: 'content-grown' | 'pane-scroll'
  readonly expectedMaximum: number
}

export interface LumenAppDialogChoice {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean | undefined
}

export interface LumenAppDialogRow {
  readonly id: string
  readonly label: string
  readonly from: string
  readonly to: string
}

export interface LumenAppDialogPlanContent {
  readonly labels: {
    readonly trigger: string
    readonly title: string
    readonly detail: string
    readonly close: string
    readonly cancel: string
    readonly confirm: string
    readonly transition: string
    readonly confirmationTitle: string
    readonly confirmationDetail: string
    readonly empty: string
  }
  readonly rows: readonly LumenAppDialogRow[]
  readonly listStrategy: LumenAppDialogListStrategy
}

export interface LumenAppDialogMetric {
  readonly id: string
  readonly label: string
  readonly value: string
}

export interface LumenAppDialogDeleteContent {
  readonly labels: {
    readonly trigger: string
    readonly title: string
    readonly detail: string
    readonly close: string
    readonly confirmation: (name: string) => string
    readonly confirmationBefore?: string | undefined
    readonly confirmationAfter?: string | undefined
    readonly placeholder: string
    readonly cancel: string
    readonly confirm: string
    readonly empty: string
    readonly successTitle?: string | undefined
    readonly successDetail?: string | undefined
  }
  readonly projectName: string
  readonly metrics: readonly LumenAppDialogMetric[]
  readonly listStrategy: LumenAppDialogListStrategy
}

export interface LumenAppDialogInviteContent {
  readonly labels: {
    readonly trigger: string
    readonly title: string
    readonly detail: string
    readonly close: string
    readonly name: string
    readonly namePlaceholder: string
    readonly email: string
    readonly emailPlaceholder: string
    readonly emailHint: string
    readonly role: string
    readonly roleHint: string
    readonly cancel: string
    readonly confirm: string
    readonly nameError?: string | undefined
    readonly emailError?: string | undefined
    readonly successTitle?: string | undefined
    readonly successDetail?: string | undefined
  }
  readonly roles: readonly LumenAppDialogChoice[]
  readonly initialRoleId: string
}

export interface LumenAppDialogWizardStep {
  readonly id: string
  readonly label: string
}

export interface LumenAppDialogWizardContent {
  readonly labels: {
    readonly trigger: string
    readonly count: (step: number, total: number) => string
    readonly close: string
    readonly name: string
    readonly url: string
    readonly urlHint: string
    readonly environment: string
    readonly environmentHint: string
    readonly reviewName: string
    readonly reviewUrl: string
    readonly cancel: string
    readonly next: string
    readonly confirm: string
  }
  readonly steps: readonly LumenAppDialogWizardStep[]
  readonly workspaceName: string
  readonly workspacePrefix: string
  readonly workspaceSlug: string
  readonly environments: readonly LumenAppDialogChoice[]
  readonly initialEnvironmentId: string
  /** The reference three-step workflow is opt-in so older host contracts remain valid. */
  readonly reference?:
    | {
        readonly labels: {
          readonly namePlaceholder: string
          readonly region: string
          readonly regionHint: string
          readonly team: string
          readonly teamPlaceholder: string
          readonly teamHint: string
          readonly reviewRegion: string
          readonly back: string
          readonly emptyRegions: string
          readonly successTitle: string
          readonly successDetail: (slug: string) => string
        }
        readonly steps: readonly [LumenAppDialogWizardStep, LumenAppDialogWizardStep, LumenAppDialogWizardStep]
        readonly regions: readonly LumenAppDialogChoice[]
        readonly initialRegionId: string
        readonly slugForName: (name: string) => string
        readonly listStrategy: LumenAppDialogListStrategy
      }
    | undefined
}

export interface LumenAppDialogAlertContent {
  readonly labels: {
    readonly trigger: string
    readonly title: string
    readonly close: string
    readonly name: string
    readonly deliver: string
    readonly threshold: string
    readonly note: string
    readonly enabled: string
    readonly enabledHint: string
    readonly toggle: string
    readonly cancel: string
    readonly save: string
  }
  readonly ruleName: string
  readonly channels: readonly LumenAppDialogChoice[]
  readonly initialChannelId: string
  readonly threshold: string
  readonly note: string
  readonly initialEnabled: boolean
  readonly reference?:
    | {
        readonly labels: {
          readonly discardTitle: string
          readonly discardDetail: string
          readonly keepEditing: string
          readonly discard: string
          readonly savedTitle: string
          readonly savedDetail: string
          readonly emptyChannels: string
          readonly saving: string
          readonly saveError: string
        }
        readonly listStrategy: LumenAppDialogListStrategy
        readonly onSave?: ((draft: LumenAppDialogAlertDraft) => Promise<void> | void) | undefined
      }
    | undefined
}

export interface LumenAppDialogAlertDraft {
  readonly channelId: string
  readonly threshold: string
  readonly note: string
  readonly enabled: boolean
}

export interface LumenAppDialogDetail {
  readonly id: string
  readonly label: string
  readonly value: string
}

export interface LumenAppDialogControl {
  readonly id: string
  readonly code: string
  readonly label: string
}

export interface LumenAppDialogHistory {
  readonly id: string
  readonly time: string
  readonly label: string
}

export interface LumenAppDialogEvidenceContent {
  readonly labels: {
    readonly trigger: string
    readonly title: string
    readonly close: string
    readonly controls: string
    readonly history: string
    readonly archive: string
    readonly download: string
    readonly emptyDetails: string
    readonly emptyControls: string
    readonly emptyHistory: string
  }
  readonly status: string
  readonly reference: string
  readonly description: string
  readonly details: readonly LumenAppDialogDetail[]
  readonly controls: readonly LumenAppDialogControl[]
  readonly history: readonly LumenAppDialogHistory[]
  readonly listStrategy: LumenAppDialogListStrategy
  readonly referenceLayout?:
    | {
        readonly labels: {
          readonly separator: string
          readonly archivedTitle: string
          readonly downloadTitle: string
          readonly resultDetail: string
        }
      }
    | undefined
}

export interface LumenAppDialogMenuItem {
  readonly id: string
  readonly label: string
  readonly shortcut?: string | undefined
  readonly danger?: boolean | undefined
  readonly submenu?: boolean | undefined
  readonly separatorBefore?: boolean | undefined
  readonly icon?: 'rename' | 'duplicate' | 'export' | 'link' | 'archive' | 'delete' | undefined
}

export interface LumenAppDialogMenuContent {
  readonly labels: {
    readonly trigger: string
    readonly menu: string
    readonly submenu: (label: string) => string
    readonly empty: string
  }
  readonly items: readonly LumenAppDialogMenuItem[]
  readonly listStrategy: LumenAppDialogListStrategy
  readonly referenceLayout?:
    | {
        readonly targetLabel: string
        readonly visibleItemLimit: number
        readonly exportOptions: readonly Readonly<{ id: string; label: string }>[]
        readonly labels: {
          readonly selected: (label: string) => string
          readonly exportedAs: (label: string) => string
          readonly appliedTo: (target: string) => string
          readonly emptyExport: string
        }
      }
    | undefined
}

export interface LumenAppDialogContent {
  readonly plan?: LumenAppDialogPlanContent | undefined
  readonly deleteProject?: LumenAppDialogDeleteContent | undefined
  readonly invite?: LumenAppDialogInviteContent | undefined
  readonly wizard?: LumenAppDialogWizardContent | undefined
  readonly alert?: LumenAppDialogAlertContent | undefined
  readonly evidence?: LumenAppDialogEvidenceContent | undefined
  readonly menu?: LumenAppDialogMenuContent | undefined
}

export interface LumenAppDialogProviderProps {
  readonly content: LumenAppDialogContent
  readonly children: React.ReactNode
}

export interface LumenAppDialogAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenAppDialogProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenAppDialogContent | undefined
  readonly onAction?: ((event: LumenAppDialogAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
}

export type LumenAppDialogVariantProps = Omit<LumenAppDialogProps, 'variant' | 'variantId'>

const Context = React.createContext<LumenAppDialogContent | undefined>(undefined)

export function LumenAppDialogProvider({ content, children }: LumenAppDialogProviderProps) {
  return <Context.Provider value={content}>{children}</Context.Provider>
}

export function useLumenAppDialogContent() {
  return React.useContext(Context)
}

export function uniqueLumenAppDialogItems<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function selectLumenAppDialogItem<T extends { readonly id: string }>(
  items: readonly T[],
  id: string | undefined,
): T | undefined {
  return items.find((item) => item.id === id) ?? items[0]
}

const report = (fn: LumenAppDialogProps['onAction'], actionId: string, value?: string) =>
  fn?.(value === undefined ? { actionId } : { actionId, value })

function Glyph({
  name,
}: {
  name:
    | 'close'
    | 'archive'
    | 'download'
    | 'chevron'
    | 'down'
    | 'menu'
    | 'back'
    | 'check'
    | 'rename'
    | 'duplicate'
    | 'export'
    | 'link'
    | 'delete'
}) {
  const d =
    name === 'close'
      ? 'M3 3l10 10M13 3 3 13'
      : name === 'archive'
        ? 'M2.5 5h11v8h-11zM2 3h12v2H2zm4 5h4'
        : name === 'download'
          ? 'M8 2v8m-3-3 3 3 3-3M3 13h10'
          : name === 'rename'
            ? 'm3 11 8-8 2 2-8 8H3zm7-9 2-1 3 3-1 2'
            : name === 'duplicate'
              ? 'M5 5h9v9H5zM2 11V2h9'
              : name === 'export'
                ? 'M4 2h5l3 3v9H4zM9 2v3h3M6 8h4M6 11h4'
                : name === 'link'
                  ? 'M6 5H5a3 3 0 0 0 0 6h2m2-6h2a3 3 0 0 1 0 6h-1M6 8h4'
                  : name === 'delete'
                    ? 'M3 4h10M6 4V2h4v2M4 5l1 9h6l1-9M7 7v5m2-5v5'
                    : name === 'down'
                      ? 'm3 6 5 5 5-5'
                      : name === 'back'
                        ? 'M13 8H3m4-4L3 8l4 4'
                        : name === 'check'
                          ? 'M3 8l3 3 7-7'
                          : name === 'chevron'
                            ? 'm6 3 5 5-5 5'
                            : 'M3 8h.01M8 8h.01M13 8h.01'
  return (
    <svg className="lumen-app-dialog-glyph" viewBox="0 0 16 16" aria-hidden="true">
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
}: Omit<LumenAppDialogProps, 'content' | 'onAction'> & { readonly children: React.ReactNode }) {
  const contentClassName = [
    'lumen-app-dialog-stage',
    variant >= 1 && variant <= 7 ? 'hbar-app-ui-full-canvas-owner' : '',
    `hbar-app-ui-dialog-variant-${variant}`,
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
      boundary={variant <= 7 ? 'none' : 'horizontal'}
      material={variant <= 7 ? 'frost' : 'glass'}
      className="lumen-app-dialog-stage-surface"
      contentClassName={contentClassName}
      data-lumen-component="app-dialog"
      data-lumen-variant={variant}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-state={state}
    >
      {children}
    </LumenSurface>
  )
}

function Trigger({
  open,
  children,
  onClick,
}: {
  readonly open: boolean
  readonly children: string
  readonly onClick: () => void
}) {
  return (
    <LumenButton className={open ? 'lumen-app-dialog-trigger is-hidden' : 'lumen-app-dialog-trigger'} onClick={onClick}>
      {children}
    </LumenButton>
  )
}

function Close({ label, onClick }: { readonly label: string; readonly onClick: () => void }) {
  return (
    <LumenIconButton label={label} onClick={onClick}>
      <Glyph name="close" />
    </LumenIconButton>
  )
}

function Panel({
  title,
  detail,
  titleId,
  closeLabel,
  onClose,
  side,
  children,
  footer,
  landmarks = false,
  countFirst = false,
}: {
  readonly title: string
  readonly detail?: string | undefined
  readonly titleId: string
  readonly closeLabel: string
  readonly onClose: () => void
  readonly side?: boolean | undefined
  readonly children: React.ReactNode
  readonly footer: React.ReactNode
  readonly landmarks?: boolean | undefined
  readonly countFirst?: boolean | undefined
}) {
  return (
    <div
      className={
        side
          ? 'lumen-app-dialog-backdrop hbar-app-ui-dialog-backdrop is-side'
          : 'lumen-app-dialog-backdrop hbar-app-ui-dialog-backdrop'
      }
    >
      <section
        className={side ? 'lumen-app-dialog-panel is-side' : 'lumen-app-dialog-panel'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header role={landmarks ? 'banner' : undefined}>
          <div>
            {countFirst && detail ? (
              <LumenText as="p" tone="muted">
                {detail}
              </LumenText>
            ) : null}
            <LumenText as="h2" id={titleId} variant="title">
              {title}
            </LumenText>
            {!countFirst && detail ? (
              <LumenText as="p" tone="muted">
                {detail}
              </LumenText>
            ) : null}
          </div>
          <Close label={closeLabel} onClick={onClose} />
        </header>
        <div className="lumen-app-dialog-body">{children}</div>
        <footer role={landmarks ? 'contentinfo' : undefined}>{footer}</footer>
      </section>
    </div>
  )
}

function Empty({ children }: { readonly children: string }) {
  return (
    <LumenText as="p" className="lumen-app-dialog-empty" tone="muted">
      {children}
    </LumenText>
  )
}

function DialogState({
  trigger,
  onAction,
  children,
}: {
  readonly trigger: string
  readonly onAction: LumenAppDialogProps['onAction']
  readonly children: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = React.useState(true)
  const close = () => {
    setOpen(false)
    report(onAction, 'close')
  }
  return (
    <React.Fragment>
      <Trigger
        open={open}
        onClick={() => {
          setOpen(true)
          report(onAction, 'open')
        }}
      >
        {trigger}
      </Trigger>
      {open ? children(close) : null}
    </React.Fragment>
  )
}

function Plan(props: Omit<LumenAppDialogProps, 'content'> & { content: LumenAppDialogPlanContent }) {
  const rows = uniqueLumenAppDialogItems(props.content.rows)
  const [confirmed, setConfirmed] = React.useState(false)
  return (
    <Root {...props}>
      <DialogState trigger={props.content.labels.trigger} onAction={props.onAction}>
        {(close) => (
          <Panel
            landmarks
            title={props.content.labels.title}
            detail={props.content.labels.detail}
            titleId={`${props.variantId}-title`}
            closeLabel={props.content.labels.close}
            onClose={close}
            footer={
              <>
                <LumenButton variant="outlined" onClick={close}>
                  {props.content.labels.cancel}
                </LumenButton>
                <LumenButton
                  tone="primary"
                  onClick={() => {
                    close()
                    setConfirmed(true)
                    report(props.onAction, 'confirm', 'plan-change')
                  }}
                >
                  {props.content.labels.confirm}
                </LumenButton>
              </>
            }
          >
            {rows.length ? (
              <dl className="lumen-app-dialog-plan" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
                {rows.map((row) => (
                  <div key={row.id}>
                    <dt>{row.label}</dt>
                    <dd>
                      <s>{row.from}</s>
                      <span>{props.content.labels.transition}</span>
                      <span>{row.to}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <Empty>{props.content.labels.empty}</Empty>
            )}
          </Panel>
        )}
      </DialogState>
      {confirmed && (
        <div className="hbar-app-ui-dialog-plan-toast">
          <p>{props.content.labels.confirmationTitle}</p>
          <p>{props.content.labels.confirmationDetail}</p>
        </div>
      )}
    </Root>
  )
}

function DeleteProject(props: Omit<LumenAppDialogProps, 'content'> & { content: LumenAppDialogDeleteContent }) {
  const metrics = uniqueLumenAppDialogItems(props.content.metrics)
  const [confirmation, setConfirmation] = React.useState('')
  const [deleted, setDeleted] = React.useState(false)
  return (
    <Root {...props}>
      <DialogState trigger={props.content.labels.trigger} onAction={props.onAction}>
        {(close) => (
          <Panel
            landmarks
            title={props.content.labels.title}
            detail={props.content.labels.detail}
            titleId={`${props.variantId}-title`}
            closeLabel={props.content.labels.close}
            onClose={close}
            footer={
              <React.Fragment>
                <LumenButton variant="outlined" onClick={close}>
                  {props.content.labels.cancel}
                </LumenButton>
                <LumenButton
                  tone="danger"
                  disabled={confirmation !== props.content.projectName}
                  onClick={() => {
                    close()
                    setDeleted(true)
                    report(props.onAction, 'confirm', props.content.projectName)
                  }}
                >
                  {props.content.labels.confirm}
                </LumenButton>
              </React.Fragment>
            }
          >
            <dl className="lumen-app-dialog-metrics" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
              {metrics.length ? (
                metrics.map((metric) => (
                  <div key={metric.id}>
                    <dd>{metric.value}</dd>
                    <dt>{metric.label}</dt>
                  </div>
                ))
              ) : (
                <Empty>{props.content.labels.empty}</Empty>
              )}
            </dl>
            <div className="lumen-delete-field">
              <label htmlFor={`${props.variantId}-confirmation`}>
                {props.content.labels.confirmationBefore !== undefined &&
                props.content.labels.confirmationAfter !== undefined ? (
                  <>
                    {props.content.labels.confirmationBefore}
                    <span className="lumen-delete-project-name">{props.content.projectName}</span>
                    {props.content.labels.confirmationAfter}
                  </>
                ) : (
                  props.content.labels.confirmation(props.content.projectName)
                )}
              </label>
              <LumenInput
                id={`${props.variantId}-confirmation`}
                variant="plain"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder={props.content.labels.placeholder}
              />
            </div>
          </Panel>
        )}
      </DialogState>
      {deleted && props.content.labels.successTitle && props.content.labels.successDetail && (
        <div className="hbar-app-ui-dialog-delete-toast">
          <p>{props.content.labels.successTitle}</p>
          <p>{props.content.labels.successDetail}</p>
        </div>
      )}
    </Root>
  )
}

function Invite(props: Omit<LumenAppDialogProps, 'content'> & { content: LumenAppDialogInviteContent }) {
  const roles = uniqueLumenAppDialogItems(props.content.roles)
  const [roleId, setRoleId] = React.useState(props.content.initialRoleId)
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [submitted, setSubmitted] = React.useState(false)
  const [sent, setSent] = React.useState(false)
  const nameInvalid = submitted && !name.trim()
  const emailInvalid = submitted && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const formId = `${props.variantId}-form`
  return (
    <Root {...props}>
      <DialogState trigger={props.content.labels.trigger} onAction={props.onAction}>
        {(close) => (
          <Panel
            landmarks
            title={props.content.labels.title}
            detail={props.content.labels.detail}
            titleId={`${props.variantId}-title`}
            closeLabel={props.content.labels.close}
            onClose={close}
            footer={
              <>
                <LumenButton variant="outlined" onClick={close}>
                  {props.content.labels.cancel}
                </LumenButton>
                <LumenButton type="submit" form={formId} tone="primary">
                  {props.content.labels.confirm}
                </LumenButton>
              </>
            }
          >
            <form
              id={formId}
              className="lumen-app-dialog-invite-form"
              noValidate
              onSubmit={(event) => {
                event.preventDefault()
                setSubmitted(true)
                if (!name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return
                close()
                setSent(true)
                report(props.onAction, 'confirm', roleId)
              }}
            >
              <div className="lumen-app-dialog-invite-field">
                <label htmlFor={`${props.variantId}-name`}>{props.content.labels.name}</label>
                <LumenInput
                  id={`${props.variantId}-name`}
                  variant="plain"
                  value={name}
                  aria-invalid={nameInvalid}
                  aria-describedby={
                    nameInvalid && props.content.labels.nameError ? `${props.variantId}-name-help` : undefined
                  }
                  placeholder={props.content.labels.namePlaceholder}
                  onChange={(event) => setName(event.target.value)}
                />
                {nameInvalid && props.content.labels.nameError && (
                  <p id={`${props.variantId}-name-help`} className="lumen-app-dialog-invite-error">
                    {props.content.labels.nameError}
                  </p>
                )}
              </div>
              <div className="lumen-app-dialog-invite-field">
                <label htmlFor={`${props.variantId}-email`}>{props.content.labels.email}</label>
                <LumenInput
                  id={`${props.variantId}-email`}
                  variant="plain"
                  type="email"
                  value={email}
                  aria-invalid={emailInvalid}
                  aria-describedby={`${props.variantId}-email-help`}
                  placeholder={props.content.labels.emailPlaceholder}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <p id={`${props.variantId}-email-help`} className={emailInvalid ? 'lumen-app-dialog-invite-error' : ''}>
                  {emailInvalid && props.content.labels.emailError
                    ? props.content.labels.emailError
                    : props.content.labels.emailHint}
                </p>
              </div>
              <div className="lumen-app-dialog-invite-field">
                <label htmlFor={`${props.variantId}-role`}>{props.content.labels.role}</label>
                <LumenSelect
                  id={`${props.variantId}-role`}
                  variant="plain"
                  value={selectLumenAppDialogItem(roles, roleId)?.id ?? ''}
                  onChange={(event) => setRoleId(event.target.value)}
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.label}
                    </option>
                  ))}
                </LumenSelect>
                <p>{props.content.labels.roleHint}</p>
              </div>
            </form>
          </Panel>
        )}
      </DialogState>
      {sent && props.content.labels.successTitle && props.content.labels.successDetail && (
        <div className="hbar-app-ui-dialog-invite-toast" role="status">
          <p>{props.content.labels.successTitle}</p>
          <p>{props.content.labels.successDetail}</p>
        </div>
      )}
    </Root>
  )
}

function ReferenceWizard({
  reference,
  ...props
}: Omit<LumenAppDialogProps, 'content'> & {
  content: LumenAppDialogWizardContent
  reference: NonNullable<LumenAppDialogWizardContent['reference']>
}) {
  const regions = uniqueLumenAppDialogItems(reference.regions)
  const [step, setStep] = React.useState(0)
  const [name, setName] = React.useState(props.content.workspaceName)
  const [regionId, setRegionId] = React.useState(reference.initialRegionId)
  const [invitees, setInvitees] = React.useState('')
  const [created, setCreated] = React.useState(false)
  const region = selectLumenAppDialogItem(regions, regionId)
  const slug = reference.slugForName(name)
  const current = reference.steps[step] ?? reference.steps[0]
  return (
    <Root {...props}>
      <DialogState trigger={props.content.labels.trigger} onAction={props.onAction}>
        {(close) => (
          <Panel
            landmarks
            countFirst
            title={current.label}
            detail={props.content.labels.count(step + 1, reference.steps.length)}
            titleId={`${props.variantId}-title`}
            closeLabel={props.content.labels.close}
            onClose={close}
            footer={
              <>
                {step === 0 ? (
                  <LumenButton variant="outlined" onClick={close} indicator="none">
                    {props.content.labels.cancel}
                  </LumenButton>
                ) : (
                  <LumenButton
                    variant="outlined"
                    indicator="none"
                    onClick={() => {
                      setStep((value) => Math.max(0, value - 1))
                      report(props.onAction, 'back', reference.steps[step - 1]?.id)
                    }}
                  >
                    <Glyph name="back" />
                    {reference.labels.back}
                  </LumenButton>
                )}
                <LumenButton
                  tone="primary"
                  indicator="none"
                  disabled={step === 1 && !region}
                  onClick={() => {
                    if (step === reference.steps.length - 1) {
                      close()
                      setCreated(true)
                      report(props.onAction, 'confirm', slug)
                    } else {
                      setStep((value) => value + 1)
                      report(props.onAction, 'next', reference.steps[step + 1]?.id)
                    }
                  }}
                >
                  {step === reference.steps.length - 1 ? props.content.labels.confirm : props.content.labels.next}
                </LumenButton>
              </>
            }
          >
            <div className="lumen-app-dialog-wizard-progress" aria-hidden="true">
              {reference.steps.map((item, index) => (
                <span data-active={index <= step || undefined} key={item.id} />
              ))}
            </div>
            {step === 0 ? (
              <div className="lumen-app-dialog-wizard-fields">
                <div className="lumen-app-dialog-wizard-field">
                  <label htmlFor={`${props.variantId}-workspace`}>{props.content.labels.name}</label>
                  <LumenInput
                    id={`${props.variantId}-workspace`}
                    variant="plain"
                    value={name}
                    placeholder={reference.labels.namePlaceholder}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                <div className="lumen-app-dialog-wizard-field">
                  <span>{props.content.labels.url}</span>
                  <div className="lumen-app-dialog-wizard-url">
                    <span>{props.content.workspacePrefix}</span>
                    <span className="lumen-app-dialog-wizard-slug">{slug}</span>
                  </div>
                  <p className="lumen-app-dialog-wizard-hint">{props.content.labels.urlHint}</p>
                </div>
              </div>
            ) : step === 1 ? (
              <div className="lumen-app-dialog-wizard-fields is-regions">
                <div className="lumen-app-dialog-wizard-field">
                  <span>{reference.labels.region}</span>
                  <p>{reference.labels.regionHint}</p>
                </div>
                {regions.length ? (
                  <ul
                    className="lumen-app-dialog-wizard-regions"
                    data-hbar-app-ui-list-strategy={reference.listStrategy.kind}
                  >
                    {regions.map((item) => (
                      <li key={item.id}>
                        <LumenButton
                          indicator="none"
                          aria-pressed={item.id === region?.id}
                          disabled={item.disabled}
                          onClick={() => {
                            setRegionId(item.id)
                            report(props.onAction, 'select', item.id)
                          }}
                        >
                          <span>{item.label}</span>
                          {item.id === region?.id ? <Glyph name="check" /> : null}
                        </LumenButton>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty>{reference.labels.emptyRegions}</Empty>
                )}
              </div>
            ) : (
              <div className="lumen-app-dialog-wizard-fields">
                <div className="lumen-app-dialog-wizard-field">
                  <label htmlFor={`${props.variantId}-team`}>{reference.labels.team}</label>
                  <LumenTextarea
                    id={`${props.variantId}-team`}
                    variant="plain"
                    value={invitees}
                    placeholder={reference.labels.teamPlaceholder}
                    aria-describedby={`${props.variantId}-team-hint`}
                    onChange={(event) => setInvitees(event.target.value)}
                  />
                  <p id={`${props.variantId}-team-hint`}>{reference.labels.teamHint}</p>
                </div>
                <dl className="lumen-app-dialog-wizard-review">
                  <div>
                    <dt>{props.content.labels.reviewName}</dt>
                    <dd>{name}</dd>
                  </div>
                  <div>
                    <dt>{reference.labels.reviewRegion}</dt>
                    <dd>{region?.label ?? reference.labels.emptyRegions}</dd>
                  </div>
                </dl>
              </div>
            )}
          </Panel>
        )}
      </DialogState>
      {created && (
        <div className="hbar-app-ui-dialog-wizard-toast" role="status">
          <p>{reference.labels.successTitle}</p>
          <p>{reference.labels.successDetail(slug)}</p>
        </div>
      )}
    </Root>
  )
}

function LegacyWizard(props: Omit<LumenAppDialogProps, 'content'> & { content: LumenAppDialogWizardContent }) {
  const steps = uniqueLumenAppDialogItems(props.content.steps)
  const environments = uniqueLumenAppDialogItems(props.content.environments)
  const [step, setStep] = React.useState(0)
  const [environmentId, setEnvironmentId] = React.useState(props.content.initialEnvironmentId)
  const current = steps[step]
  return (
    <Root {...props}>
      <DialogState trigger={props.content.labels.trigger} onAction={props.onAction}>
        {(close) => (
          <Panel
            title={current?.label ?? ''}
            detail={props.content.labels.count(step + 1, steps.length)}
            titleId={`${props.variantId}-title`}
            closeLabel={props.content.labels.close}
            onClose={close}
            footer={
              <>
                <LumenButton variant="outlined" onClick={close}>
                  {props.content.labels.cancel}
                </LumenButton>
                <LumenButton
                  tone="primary"
                  onClick={() => {
                    if (step >= steps.length - 1) {
                      close()
                      report(props.onAction, 'confirm', 'workspace')
                    } else {
                      setStep((value) => value + 1)
                      report(props.onAction, 'next', String(step + 2))
                    }
                  }}
                >
                  {step >= steps.length - 1 ? props.content.labels.confirm : props.content.labels.next}
                </LumenButton>
              </>
            }
          >
            <div className="lumen-app-dialog-progress" aria-label={props.content.labels.count(step + 1, steps.length)}>
              {steps.map((item, index) => (
                <i data-active={index <= step || undefined} key={item.id} />
              ))}
            </div>
            {step === 0 ? (
              <>
                <LumenFormField controlId={`${props.variantId}-workspace`} label={props.content.labels.name}>
                  <LumenInput defaultValue={props.content.workspaceName} />
                </LumenFormField>
                <div className="lumen-app-dialog-readonly">
                  <span>{props.content.labels.url}</span>
                  <strong>
                    {props.content.workspacePrefix}
                    {props.content.workspaceSlug}
                  </strong>
                  <small>{props.content.labels.urlHint}</small>
                </div>
              </>
            ) : step === 1 ? (
              <>
                <LumenFormField controlId={`${props.variantId}-environment`} label={props.content.labels.environment}>
                  <LumenSelect
                    value={selectLumenAppDialogItem(environments, environmentId)?.id ?? ''}
                    onChange={(event) => setEnvironmentId(event.target.value)}
                  >
                    {environments.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </LumenSelect>
                </LumenFormField>
                <LumenText as="p" tone="muted">
                  {props.content.labels.environmentHint}
                </LumenText>
              </>
            ) : (
              <div className="lumen-app-dialog-review">
                <span>
                  {props.content.labels.reviewName}
                  <strong>{props.content.workspaceName}</strong>
                </span>
                <span>
                  {props.content.labels.reviewUrl}
                  <strong>
                    {props.content.workspacePrefix}
                    {props.content.workspaceSlug}
                  </strong>
                </span>
              </div>
            )}
          </Panel>
        )}
      </DialogState>
    </Root>
  )
}

function Wizard(props: Omit<LumenAppDialogProps, 'content'> & { content: LumenAppDialogWizardContent }) {
  return props.content.reference ? (
    <ReferenceWizard {...props} reference={props.content.reference} />
  ) : (
    <LegacyWizard {...props} />
  )
}

function ReferenceAlert(
  props: Omit<LumenAppDialogProps, 'content'> & {
    content: LumenAppDialogAlertContent
    reference: NonNullable<LumenAppDialogAlertContent['reference']>
  },
) {
  const channels = uniqueLumenAppDialogItems(props.content.channels)
  const initial: LumenAppDialogAlertDraft = {
    channelId: selectLumenAppDialogItem(channels, props.content.initialChannelId)?.id ?? '',
    threshold: props.content.threshold,
    note: props.content.note,
    enabled: props.content.initialEnabled,
  }
  const [saved, setSaved] = React.useState(initial)
  const [draft, setDraft] = React.useState(initial)
  const [open, setOpen] = React.useState(true)
  const [guard, setGuard] = React.useState(false)
  const [success, setSuccess] = React.useState(false)
  const [saveState, setSaveState] = React.useState<'idle' | 'saving' | 'error'>('idle')
  const selected = selectLumenAppDialogItem(channels, draft.channelId)
  const normalizedDraft = { ...draft, channelId: selected?.id ?? '' }
  const dirty =
    normalizedDraft.channelId !== saved.channelId ||
    normalizedDraft.threshold !== saved.threshold ||
    normalizedDraft.note !== saved.note ||
    normalizedDraft.enabled !== saved.enabled
  const close = () => {
    setOpen(false)
    setGuard(false)
    setDraft(saved)
    report(props.onAction, 'close')
  }
  const attemptClose = () => {
    if (saveState === 'saving') return
    if (dirty) setGuard(true)
    else close()
  }
  const save = async () => {
    if (saveState === 'saving') return
    const next = { ...normalizedDraft }
    setSaveState('saving')
    try {
      await props.reference.onSave?.(next)
      setSaved(next)
      setDraft(next)
      setSuccess(true)
      setOpen(false)
      setSaveState('idle')
      report(props.onAction, 'save', props.content.ruleName)
    } catch {
      setSaveState('error')
      report(props.onAction, 'save-error', props.content.ruleName)
    }
  }
  React.useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (guard) setGuard(false)
      else attemptClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })
  return (
    <Root {...props}>
      <Trigger
        open={open}
        onClick={() => {
          setOpen(true)
          setSuccess(false)
          report(props.onAction, 'open')
        }}
      >
        {props.content.labels.trigger}
      </Trigger>
      {open && (
        <Panel
          side
          landmarks
          title={props.content.labels.title}
          titleId={`${props.variantId}-title`}
          closeLabel={props.content.labels.close}
          onClose={attemptClose}
          footer={
            <>
              <LumenButton variant="outlined" indicator="none" disabled={saveState === 'saving'} onClick={attemptClose}>
                {props.content.labels.cancel}
              </LumenButton>
              <LumenButton
                tone="primary"
                indicator="none"
                disabled={!selected || saveState === 'saving'}
                onClick={() => {
                  save().catch(() => setSaveState('error'))
                }}
              >
                {saveState === 'saving' ? props.reference.labels.saving : props.content.labels.save}
              </LumenButton>
              {saveState === 'error' && (
                <p role="alert" className="lumen-app-dialog-alert-save-error">
                  {props.reference.labels.saveError}
                </p>
              )}
            </>
          }
        >
          <div className="lumen-app-dialog-alert-field">
            <span>{props.content.labels.name}</span>
            <span className="lumen-app-dialog-alert-readonly">{props.content.ruleName}</span>
          </div>
          <div className="lumen-app-dialog-alert-field">
            <label htmlFor={`${props.variantId}-deliver`}>{props.content.labels.deliver}</label>
            <LumenSelect
              id={`${props.variantId}-deliver`}
              variant="plain"
              value={selected?.id ?? ''}
              onChange={(event) => setDraft((value) => ({ ...value, channelId: event.target.value }))}
              data-hbar-app-ui-list-strategy={props.reference.listStrategy.kind}
            >
              {!channels.length && <option value="">{props.reference.labels.emptyChannels}</option>}
              {channels.map((item) => (
                <option key={item.id} value={item.id} disabled={item.disabled}>
                  {item.label}
                </option>
              ))}
            </LumenSelect>
          </div>
          <div className="lumen-app-dialog-alert-field">
            <label htmlFor={`${props.variantId}-threshold`}>{props.content.labels.threshold}</label>
            <LumenInput
              id={`${props.variantId}-threshold`}
              variant="plain"
              value={draft.threshold}
              onChange={(event) => setDraft((value) => ({ ...value, threshold: event.target.value }))}
            />
          </div>
          <div className="lumen-app-dialog-alert-field">
            <label htmlFor={`${props.variantId}-note`}>{props.content.labels.note}</label>
            <LumenTextarea
              id={`${props.variantId}-note`}
              variant="plain"
              value={draft.note}
              onChange={(event) => setDraft((value) => ({ ...value, note: event.target.value }))}
            />
          </div>
          <div className="lumen-app-dialog-alert-toggle">
            <span>
              <span>{props.content.labels.enabled}</span>
              <small>{props.content.labels.enabledHint}</small>
            </span>
            <LumenButton
              role="switch"
              aria-label={props.content.labels.enabled}
              aria-checked={draft.enabled}
              indicator="none"
              onClick={() => {
                setDraft((value) => ({ ...value, enabled: !value.enabled }))
                report(props.onAction, 'toggle', draft.enabled ? 'disabled' : 'enabled')
              }}
            >
              <span />
            </LumenButton>
          </div>
        </Panel>
      )}
      {open && guard && (
        <div className="lumen-app-dialog-alert-guard-backdrop">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`${props.variantId}-discard-title`}
            aria-describedby={`${props.variantId}-discard-detail`}
            className="lumen-app-dialog-alert-guard"
          >
            <h2 id={`${props.variantId}-discard-title`}>{props.reference.labels.discardTitle}</h2>
            <p id={`${props.variantId}-discard-detail`}>{props.reference.labels.discardDetail}</p>
            <div>
              <LumenButton variant="outlined" indicator="none" onClick={() => setGuard(false)}>
                {props.reference.labels.keepEditing}
              </LumenButton>
              <LumenButton tone="danger" indicator="none" onClick={close}>
                {props.reference.labels.discard}
              </LumenButton>
            </div>
          </section>
        </div>
      )}
      {success && (
        <div role="status" className="lumen-app-dialog-alert-toast">
          <p>{props.reference.labels.savedTitle}</p>
          <p>{props.reference.labels.savedDetail}</p>
        </div>
      )}
    </Root>
  )
}

function LegacyAlert(props: Omit<LumenAppDialogProps, 'content'> & { content: LumenAppDialogAlertContent }) {
  const channels = uniqueLumenAppDialogItems(props.content.channels)
  const [channelId, setChannelId] = React.useState(props.content.initialChannelId)
  const [enabled, setEnabled] = React.useState(props.content.initialEnabled)
  return (
    <Root {...props}>
      <DialogState trigger={props.content.labels.trigger} onAction={props.onAction}>
        {(close) => (
          <Panel
            side
            title={props.content.labels.title}
            titleId={`${props.variantId}-title`}
            closeLabel={props.content.labels.close}
            onClose={close}
            footer={
              <>
                <LumenButton variant="outlined" onClick={close}>
                  {props.content.labels.cancel}
                </LumenButton>
                <LumenButton
                  tone="primary"
                  onClick={() => {
                    close()
                    report(props.onAction, 'save')
                  }}
                >
                  {props.content.labels.save}
                </LumenButton>
              </>
            }
          >
            <div className="lumen-app-dialog-readonly">
              <span>{props.content.labels.name}</span>
              <strong>{props.content.ruleName}</strong>
            </div>
            <LumenFormField controlId={`${props.variantId}-deliver`} label={props.content.labels.deliver}>
              <LumenSelect
                value={selectLumenAppDialogItem(channels, channelId)?.id ?? ''}
                onChange={(event) => setChannelId(event.target.value)}
              >
                {channels.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </LumenSelect>
            </LumenFormField>
            <LumenFormField controlId={`${props.variantId}-threshold`} label={props.content.labels.threshold}>
              <LumenInput defaultValue={props.content.threshold} />
            </LumenFormField>
            <LumenFormField controlId={`${props.variantId}-note`} label={props.content.labels.note}>
              <LumenTextarea defaultValue={props.content.note} />
            </LumenFormField>
            <label className="lumen-app-dialog-toggle">
              <span>
                <strong>{props.content.labels.enabled}</strong>
                <small>{props.content.labels.enabledHint}</small>
              </span>
              <LumenToggleControl
                aria-label={props.content.labels.toggle}
                checked={enabled}
                onChange={(event) => {
                  const next = event.currentTarget.checked
                  setEnabled(next)
                  report(props.onAction, 'toggle', next ? 'enabled' : 'disabled')
                }}
              />
            </label>
          </Panel>
        )}
      </DialogState>
    </Root>
  )
}

function Alert(props: Omit<LumenAppDialogProps, 'content'> & { content: LumenAppDialogAlertContent }) {
  return props.content.reference ? (
    <ReferenceAlert {...props} reference={props.content.reference} />
  ) : (
    <LegacyAlert {...props} />
  )
}

function ReferenceEvidence(
  props: Omit<LumenAppDialogProps, 'content'> & {
    content: LumenAppDialogEvidenceContent
    referenceLayout: NonNullable<LumenAppDialogEvidenceContent['referenceLayout']>
  },
) {
  const details = uniqueLumenAppDialogItems(props.content.details)
  const controls = uniqueLumenAppDialogItems(props.content.controls)
  const history = uniqueLumenAppDialogItems(props.content.history)
  const [result, setResult] = React.useState<'archive' | 'download' | null>(null)
  return (
    <Root {...props}>
      <DialogState trigger={props.content.labels.trigger} onAction={props.onAction}>
        {(close) => (
          <Panel
            side
            landmarks
            title={props.content.labels.title}
            titleId={`${props.variantId}-title`}
            closeLabel={props.content.labels.close}
            onClose={close}
            footer={
              <>
                <LumenButton
                  variant="outlined"
                  indicator="none"
                  onClick={() => {
                    setResult('archive')
                    report(props.onAction, 'archive', props.content.reference)
                  }}
                >
                  <Glyph name="archive" />
                  {props.content.labels.archive}
                </LumenButton>
                <LumenButton
                  tone="primary"
                  indicator="none"
                  onClick={() => {
                    setResult('download')
                    report(props.onAction, 'download', props.content.reference)
                  }}
                >
                  <Glyph name="download" />
                  {props.content.labels.download}
                </LumenButton>
              </>
            }
          >
            <div
              className="lumen-app-dialog-evidence-flow"
              data-hbar-app-ui-scroll-owner={props.content.listStrategy.kind}
            >
              <div className="lumen-app-dialog-evidence-status">
                <span aria-hidden="true" className="lumen-app-dialog-evidence-dot" />
                <span>{props.content.status}</span>
                <span>{props.referenceLayout.labels.separator}</span>
                <span>{props.content.reference}</span>
              </div>
              <LumenText as="p" className="lumen-app-dialog-evidence-description">
                {props.content.description}
              </LumenText>
              <dl className="lumen-app-dialog-evidence-details">
                {details.length ? (
                  details.map((item) => (
                    <div key={item.id}>
                      <dt>{item.label}</dt>
                      <dd>{item.value}</dd>
                    </div>
                  ))
                ) : (
                  <Empty>{props.content.labels.emptyDetails}</Empty>
                )}
              </dl>
              <section className="lumen-app-dialog-evidence-section">
                <h3>{props.content.labels.controls}</h3>
                {controls.length ? (
                  <ul className="lumen-app-dialog-evidence-controls">
                    {controls.map((item) => (
                      <li key={item.id}>
                        <span>{item.code}</span>
                        <span>{item.label}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty>{props.content.labels.emptyControls}</Empty>
                )}
              </section>
              <section className="lumen-app-dialog-evidence-section">
                <h3>{props.content.labels.history}</h3>
                {history.length ? (
                  <ul className="lumen-app-dialog-evidence-history">
                    {history.map((item) => (
                      <li key={item.id}>
                        <span className="lumen-app-dialog-evidence-time">{item.time}</span>
                        <span>{item.label}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty>{props.content.labels.emptyHistory}</Empty>
                )}
              </section>
            </div>
          </Panel>
        )}
      </DialogState>
      {result && (
        <div className="lumen-app-dialog-evidence-toast" role="status">
          <p>
            {result === 'archive'
              ? props.referenceLayout.labels.archivedTitle
              : props.referenceLayout.labels.downloadTitle}
          </p>
          <p>{props.referenceLayout.labels.resultDetail}</p>
        </div>
      )}
    </Root>
  )
}

function LegacyEvidence(props: Omit<LumenAppDialogProps, 'content'> & { content: LumenAppDialogEvidenceContent }) {
  const details = uniqueLumenAppDialogItems(props.content.details)
  const controls = uniqueLumenAppDialogItems(props.content.controls)
  const history = uniqueLumenAppDialogItems(props.content.history)
  return (
    <Root {...props}>
      <DialogState trigger={props.content.labels.trigger} onAction={props.onAction}>
        {(close) => (
          <Panel
            side
            title={props.content.labels.title}
            titleId={`${props.variantId}-title`}
            closeLabel={props.content.labels.close}
            onClose={close}
            footer={
              <>
                <LumenButton variant="outlined" onClick={() => report(props.onAction, 'archive')}>
                  <Glyph name="archive" />
                  {props.content.labels.archive}
                </LumenButton>
                <LumenButton tone="primary" onClick={() => report(props.onAction, 'download')}>
                  <Glyph name="download" />
                  {props.content.labels.download}
                </LumenButton>
              </>
            }
          >
            <LumenStatus value={`${props.content.status} · ${props.content.reference}`} tone="success" />
            <LumenText as="p" tone="muted">
              {props.content.description}
            </LumenText>
            <dl className="lumen-app-dialog-details" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
              {details.length ? (
                details.map((item) => (
                  <div key={item.id}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))
              ) : (
                <Empty>{props.content.labels.emptyDetails}</Empty>
              )}
            </dl>
            <section className="lumen-app-dialog-section">
              <strong>{props.content.labels.controls}</strong>
              <div>
                {controls.length ? (
                  controls.map((item) => (
                    <span key={item.id}>
                      <b>{item.code}</b> {item.label}
                    </span>
                  ))
                ) : (
                  <Empty>{props.content.labels.emptyControls}</Empty>
                )}
              </div>
            </section>
            <section className="lumen-app-dialog-section">
              <strong>{props.content.labels.history}</strong>
              {history.length ? (
                history.map((item) => (
                  <p key={item.id}>
                    <time>{item.time}</time>
                    <span>{item.label}</span>
                  </p>
                ))
              ) : (
                <Empty>{props.content.labels.emptyHistory}</Empty>
              )}
            </section>
          </Panel>
        )}
      </DialogState>
    </Root>
  )
}

function Evidence(props: Omit<LumenAppDialogProps, 'content'> & { content: LumenAppDialogEvidenceContent }) {
  return props.content.referenceLayout ? (
    <ReferenceEvidence {...props} referenceLayout={props.content.referenceLayout} />
  ) : (
    <LegacyEvidence {...props} />
  )
}

function ReferenceMenu(
  props: Omit<LumenAppDialogProps, 'content'> & {
    content: LumenAppDialogMenuContent
    referenceLayout: NonNullable<LumenAppDialogMenuContent['referenceLayout']>
  },
) {
  const items = uniqueLumenAppDialogItems(props.content.items)
  const exports = uniqueLumenAppDialogItems(props.referenceLayout.exportOptions)
  const [open, setOpen] = React.useState(true)
  const [submenuOpen, setSubmenuOpen] = React.useState(false)
  const [selected, setSelected] = React.useState<{ kind: 'item' | 'export'; id: string } | null>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([])
  const exportRefs = React.useRef<(HTMLButtonElement | null)[]>([])
  React.useEffect(() => {
    if (open) itemRefs.current[0]?.focus()
    else triggerRef.current?.focus()
  }, [open])
  React.useEffect(() => {
    if (submenuOpen) exportRefs.current[0]?.focus()
  }, [submenuOpen])
  const close = () => {
    setSubmenuOpen(false)
    setOpen(false)
  }
  const chooseItem = (item: LumenAppDialogMenuItem) => {
    setSelected({ kind: 'item', id: item.id })
    close()
    report(props.onAction, item.id)
  }
  const chooseExport = (option: { readonly id: string; readonly label: string }) => {
    setSelected({ kind: 'export', id: option.id })
    close()
    report(props.onAction, 'export', option.id)
  }
  const itemKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number, submenu: boolean) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (submenu) {
        setSubmenuOpen(false)
        itemRefs.current.find((item) => item?.getAttribute('aria-haspopup') === 'menu')?.focus()
      } else close()
      return
    }
    if (event.key === 'ArrowRight' && !submenu && items[index]?.submenu) {
      event.preventDefault()
      setSubmenuOpen(true)
      return
    }
    if (event.key === 'ArrowLeft' && submenu) {
      event.preventDefault()
      setSubmenuOpen(false)
      itemRefs.current.find((item) => item?.getAttribute('aria-haspopup') === 'menu')?.focus()
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const refs = submenu ? exportRefs.current : itemRefs.current
    const length = submenu ? exports.length : items.length
    if (!length) return
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : length - 1)) % length
    refs[next]?.focus()
  }
  const selectedItem = selected?.kind === 'item' ? items.find((item) => item.id === selected.id) : undefined
  const selectedExport = selected?.kind === 'export' ? exports.find((item) => item.id === selected.id) : undefined
  const result = selectedItem
    ? props.referenceLayout.labels.selected(selectedItem.label)
    : selectedExport
      ? props.referenceLayout.labels.exportedAs(selectedExport.label)
      : null
  return (
    <Root {...props}>
      <div className="lumen-app-dialog-reference-menu-stage">
        {open && <div className="lumen-app-dialog-reference-menu-scrim" aria-hidden="true" onClick={close} />}
        <div className="lumen-app-dialog-reference-menu-anchor">
          <LumenButton
            ref={triggerRef}
            type="button"
            variant="outlined"
            indicator="none"
            className="lumen-app-dialog-reference-menu-trigger"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => {
              setSelected(null)
              setOpen(true)
            }}
          >
            {props.content.labels.trigger}
            <Glyph name="down" />
          </LumenButton>
          {open && (
            <>
              <div
                className="lumen-app-dialog-reference-menu-dialog"
                role="dialog"
                aria-labelledby={`${props.variantId}-menu-title`}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && event.target === event.currentTarget) close()
                }}
              >
                <h2 id={`${props.variantId}-menu-title`} className="lumen-app-dialog-reference-menu-visually-hidden">
                  {props.content.labels.menu}
                </h2>
                <div
                  className={
                    items.length > props.referenceLayout.visibleItemLimit
                      ? 'lumen-app-dialog-reference-menu-list is-scrollable'
                      : 'lumen-app-dialog-reference-menu-list'
                  }
                  role="menu"
                  aria-label={props.content.labels.menu}
                  data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}
                >
                  {items.length ? (
                    items.map((item, index) => (
                      <React.Fragment key={item.id}>
                        {item.separatorBefore && (
                          <div className="lumen-app-dialog-reference-menu-separator" role="separator" />
                        )}
                        <div className="lumen-app-dialog-reference-menu-row">
                          <LumenButton
                            ref={(element) => {
                              itemRefs.current[index] = element
                            }}
                            type="button"
                            role="menuitem"
                            variant="text"
                            indicator="none"
                            className={item.danger ? 'is-danger' : undefined}
                            aria-haspopup={item.submenu ? 'menu' : undefined}
                            aria-expanded={item.submenu ? submenuOpen : undefined}
                            onMouseEnter={() => setSubmenuOpen(Boolean(item.submenu))}
                            onFocus={() => {
                              if (!item.submenu) setSubmenuOpen(false)
                            }}
                            onKeyDown={(event) => itemKeyDown(event, index, false)}
                            onClick={() => (item.submenu ? setSubmenuOpen(true) : chooseItem(item))}
                          >
                            <Glyph name={item.icon ?? 'menu'} />
                            <span className="lumen-app-dialog-reference-menu-label">{item.label}</span>
                            {item.shortcut && <kbd>{item.shortcut}</kbd>}
                            {item.submenu && <Glyph name="chevron" />}
                          </LumenButton>
                          {item.submenu && submenuOpen && (
                            <div
                              role="menu"
                              className="lumen-app-dialog-reference-submenu"
                              aria-label={props.content.labels.submenu(item.label)}
                            >
                              {exports.length ? (
                                exports.map((option, optionIndex) => (
                                  <LumenButton
                                    key={option.id}
                                    type="button"
                                    role="menuitem"
                                    variant="text"
                                    indicator="none"
                                    ref={(element) => {
                                      exportRefs.current[optionIndex] = element
                                    }}
                                    onKeyDown={(event) => {
                                      event.stopPropagation()
                                      itemKeyDown(event, optionIndex, true)
                                    }}
                                    onClick={() => chooseExport(option)}
                                  >
                                    {option.label}
                                  </LumenButton>
                                ))
                              ) : (
                                <p>{props.referenceLayout.labels.emptyExport}</p>
                              )}
                            </div>
                          )}
                        </div>
                      </React.Fragment>
                    ))
                  ) : (
                    <p>{props.content.labels.empty}</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        {result && !open && (
          <div className="lumen-app-dialog-reference-menu-result" aria-live="polite">
            <p>{result}</p>
            <p>{props.referenceLayout.labels.appliedTo(props.referenceLayout.targetLabel)}</p>
          </div>
        )}
      </div>
    </Root>
  )
}

function LegacyMenu(props: Omit<LumenAppDialogProps, 'content'> & { content: LumenAppDialogMenuContent }) {
  const items = uniqueLumenAppDialogItems(props.content.items)
  const [open, setOpen] = React.useState(true)
  return (
    <Root {...props}>
      <div className="lumen-app-dialog-menu-stage">
        <div className="lumen-app-dialog-menu-anchor">
          <LumenButton
            aria-expanded={open}
            aria-haspopup="menu"
            onClick={() => {
              setOpen((value) => !value)
              report(props.onAction, 'toggle', open ? 'closed' : 'open')
            }}
          >
            {props.content.labels.trigger}
            <Glyph name="chevron" />
          </LumenButton>
          {open ? (
            <div
              className="lumen-app-dialog-menu"
              role="menu"
              aria-label={props.content.labels.menu}
              data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}
            >
              {items.length ? (
                items.map((item) => (
                  <React.Fragment key={item.id}>
                    {item.separatorBefore ? <hr /> : null}
                    <LumenButton
                      role="menuitem"
                      variant="text"
                      tone={item.danger ? 'danger' : 'neutral'}
                      onClick={() => report(props.onAction, item.id)}
                    >
                      <Glyph name="menu" />
                      <span>{item.label}</span>
                      {item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
                      {item.submenu ? (
                        <span aria-label={props.content.labels.submenu(item.label)}>
                          <Glyph name="chevron" />
                        </span>
                      ) : null}
                    </LumenButton>
                  </React.Fragment>
                ))
              ) : (
                <Empty>{props.content.labels.empty}</Empty>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </Root>
  )
}

function Menu(props: Omit<LumenAppDialogProps, 'content'> & { content: LumenAppDialogMenuContent }) {
  return props.content.referenceLayout ? (
    <ReferenceMenu {...props} referenceLayout={props.content.referenceLayout} />
  ) : (
    <LegacyMenu {...props} />
  )
}

function empty(props: LumenAppDialogProps) {
  return <Root {...props}>{null}</Root>
}

export function LumenAppDialog(props: LumenAppDialogProps) {
  const inheritedContent = useLumenAppDialogContent()
  const content = props.content ?? inheritedContent
  if (props.variant === 1) return content?.plan ? <Plan {...props} content={content.plan} /> : empty(props)
  if (props.variant === 2)
    return content?.deleteProject ? <DeleteProject {...props} content={content.deleteProject} /> : empty(props)
  if (props.variant === 3) return content?.invite ? <Invite {...props} content={content.invite} /> : empty(props)
  if (props.variant === 4) return content?.wizard ? <Wizard {...props} content={content.wizard} /> : empty(props)
  if (props.variant === 5) return content?.alert ? <Alert {...props} content={content.alert} /> : empty(props)
  if (props.variant === 6) return content?.evidence ? <Evidence {...props} content={content.evidence} /> : empty(props)
  if (props.variant === 7) return content?.menu ? <Menu {...props} content={content.menu} /> : empty(props)
  return empty(props)
}

function variant(value: number, props: LumenAppDialogVariantProps) {
  return <LumenAppDialog {...props} variant={value} variantId={`hbar-app-ui-app-dialog-${value}`} />
}

export const LumenAppDialog01 = (props: LumenAppDialogVariantProps) => variant(1, props),
  LumenAppDialog02 = (props: LumenAppDialogVariantProps) => variant(2, props),
  LumenAppDialog03 = (props: LumenAppDialogVariantProps) => variant(3, props),
  LumenAppDialog04 = (props: LumenAppDialogVariantProps) => variant(4, props),
  LumenAppDialog05 = (props: LumenAppDialogVariantProps) => variant(5, props),
  LumenAppDialog06 = (props: LumenAppDialogVariantProps) => variant(6, props),
  LumenAppDialog07 = (props: LumenAppDialogVariantProps) => variant(7, props)
