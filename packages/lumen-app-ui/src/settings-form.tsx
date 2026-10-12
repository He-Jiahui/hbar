'use client'

import * as React from 'react'
import { LumenCheckBoxControl, LumenInput, LumenTextarea, LumenToggleControl, LumenChoiceSelect } from './forms'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenIconButton, LumenStatus } from './primitives'
import { LumenSettingsForm1Reference, type LumenSettingsForm1ViewModel } from './settings-form-1-reference'
import { LumenSettingsForm2Reference, type LumenSettingsForm2ViewModel } from './settings-form-2-reference'
import { LumenSettingsForm3Reference, type LumenSettingsForm3ViewModel } from './settings-form-3-reference'
import { LumenSettingsForm4Reference, type LumenSettingsForm4ViewModel } from './settings-form-4-reference'
import { LumenSettingsForm5Reference, type LumenSettingsForm5ViewModel } from './settings-form-5-reference'
import { LumenSettingsForm6Reference, type LumenSettingsForm6ViewModel } from './settings-form-6-reference'
import './settings-form.css'
import { LumenProgress } from './ui-controls'

export type LumenPreferenceAction =
  | { readonly type: 'theme' | 'density' | 'language'; readonly id: string }
  | { readonly type: 'toggle' | 'checkbox'; readonly id: string; readonly enabled: boolean }

export type LumenPreferencePersistence =
  | { readonly mode: 'immediate' }
  | {
      readonly mode: 'explicit'
      readonly dirty: boolean
      readonly busy: boolean
      readonly onSave: () => void
      readonly onCancel: () => void
    }

export type LumenSettingsListStrategy =
  | { readonly kind: 'content-grown'; readonly expectedMaximum: number }
  | { readonly kind: 'pane-scroll'; readonly expectedMaximum: number }

export interface LumenSettingsChoice {
  readonly id: string
  readonly label: string
}

export interface LumenSettingsField {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly kind: 'text' | 'url' | 'textarea' | 'select'
  readonly value: string
  readonly prefix?: string | undefined
  readonly changed?: boolean | undefined
  readonly error?: string | undefined
  readonly note?: string | undefined
  readonly maxLength?: number | undefined
  readonly options?: readonly LumenSettingsChoice[] | undefined
}

export interface LumenSettingsWorkspaceContent {
  readonly labels: {
    readonly pageTitle: string
    readonly accountName: string
    readonly panelTitle: string
    readonly panelDescription: string
    readonly navigation: string
    readonly unsaved: string
    readonly cancel: string
    readonly save: string
    readonly changed: string
  }
  readonly navigation: readonly LumenSettingsChoice[]
  readonly fields: readonly LumenSettingsField[]
  readonly activeNavigationId?: string | undefined
}

export interface LumenSettingsProfileContent {
  readonly labels: {
    readonly pageTitle: string
    readonly panelTitle: string
    readonly panelDescription: string
    readonly photoLabel: string
    readonly photoDescription: string
    readonly changePhoto: string
    readonly uploadPhoto: string
    readonly unsaved: string
    readonly cancel: string
    readonly save: string
    readonly changed: string
  }
  readonly initials: string
  readonly fields: readonly LumenSettingsField[]
}

export interface LumenSettingsPreferenceToggle {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly enabled: boolean
  readonly recommended?: boolean | undefined
  readonly changed?: boolean | undefined
}

export interface LumenSettingsPreferencesContent {
  readonly onChange: (action: LumenPreferenceAction) => void
  readonly persistence: LumenPreferencePersistence
  readonly error?: string | undefined
  readonly labels: {
    readonly pageTitle: string
    readonly panelTitle: string
    readonly panelDescription: string
    readonly themeLabel: string
    readonly themeCurrent: string
    readonly themeDescription: string
    readonly densityLabel: string
    readonly densityDescription: string
    readonly languageLabel: string
    readonly languageDescription: string
    readonly toggleGroup: string
    readonly changed: string
    readonly recommended: string
    readonly unsaved: string
    readonly cancel: string
    readonly unavailableChoice: string
    readonly save: string
  }
  readonly themeChoices: readonly LumenSettingsChoice[]
  readonly themeId: string
  readonly densityChoices: readonly LumenSettingsChoice[]
  readonly densityId: string
  readonly languageChoices: readonly LumenSettingsChoice[]
  readonly languageId: string
  readonly toggles: readonly LumenSettingsPreferenceToggle[]
  readonly checkbox:
    | {
        readonly id: string
        readonly label: string
        readonly description: string
        readonly enabled: boolean
      }
    | undefined
}

export interface LumenSettingsMember {
  readonly id: string
  readonly initials: string
  readonly name: string
  readonly email: string
  readonly status: 'active' | 'invited'
  readonly role: string
  readonly roleId: string
  readonly roleChoices: readonly LumenSettingsChoice[]
}

export interface LumenSettingsMembersContent {
  readonly labels: {
    readonly pageTitle: string
    readonly panelTitle: string
    readonly panelDescription: string
    readonly inviteTitle: string
    readonly inviteDescription: string
    readonly emailLabel: string
    readonly emailPlaceholder: string
    readonly roleLabel: string
    readonly sendInvite: string
    readonly active: string
    readonly invited: string
    readonly empty: string
    readonly actions: (name: string) => string
    readonly seats: (used: number, total: number) => string
  }
  readonly inviteRoles: readonly LumenSettingsChoice[]
  readonly initialInviteRoleId: string
  readonly members: readonly LumenSettingsMember[]
  readonly seatsUsed: number
  readonly seatsTotal: number
  readonly listStrategy: LumenSettingsListStrategy
}

export interface LumenSettingsSecret {
  readonly id: string
  readonly name: string
  readonly created: string
  readonly lastUsed: string
  readonly token: string
}

export interface LumenSettingsIntegration {
  readonly id: string
  readonly name: string
  readonly status: 'connected' | 'disconnected'
  readonly description: string
  readonly enabled: boolean
}

export interface LumenSettingsApiKeysContent {
  readonly labels: {
    readonly pageTitle: string
    readonly secretsTitle: string
    readonly secretsDescription: string
    readonly createKey: string
    readonly actions: (name: string) => string
    readonly reveal: (name: string) => string
    readonly hide: (name: string) => string
    readonly copy: (name: string) => string
    readonly secretMeta: (created: string, lastUsed: string) => string
    readonly empty: string
    readonly integrationsTitle: string
    readonly integrationsDescription: string
    readonly connected: string
    readonly disconnected: string
    readonly auditNote: string
    readonly toggle: (name: string) => string
  }
  readonly secrets: readonly LumenSettingsSecret[]
  readonly integrations: readonly LumenSettingsIntegration[]
  readonly listStrategy: LumenSettingsListStrategy
}

export interface LumenSettingsDangerContent {
  readonly labels: {
    readonly pageTitle: string
    readonly panelTitle: string
    readonly panelDescription: string
    readonly transferTitle: string
    readonly transferDescription: string
    readonly transferAction: string
    readonly archiveTitle: string
    readonly archiveDescription: string
    readonly archiveAction: string
    readonly deleteTitle: string
    readonly deleteDescription: string
    readonly deleteSummary: string
    readonly typePrompt: string
    readonly confirmationLabel: string
    readonly cancel: string
    readonly deleteAction: string
    readonly footerNote: string
    readonly transferNotice: string
    readonly archiveNotice: string
    readonly deleteSuccess: string
  }
  readonly workspaceName: string
  readonly memberCount: number
  readonly consequences: readonly string[]
}

export interface LumenSettingsFormContent {
  readonly workspaceReference?: LumenSettingsForm1ViewModel | undefined
  readonly profileReference?: LumenSettingsForm2ViewModel | undefined
  readonly preferencesReference?: LumenSettingsForm3ViewModel | undefined
  readonly membersReference?: LumenSettingsForm4ViewModel | undefined
  readonly apiKeysReference?: LumenSettingsForm5ViewModel | undefined
  readonly dangerReference?: LumenSettingsForm6ViewModel | undefined
  readonly workspace?: LumenSettingsWorkspaceContent | undefined
  readonly profile?: LumenSettingsProfileContent | undefined
  readonly preferences?: LumenSettingsPreferencesContent | undefined
  readonly members?: LumenSettingsMembersContent | undefined
  readonly apiKeys?: LumenSettingsApiKeysContent | undefined
  readonly danger?: LumenSettingsDangerContent | undefined
}

export interface LumenSettingsFormProviderProps {
  readonly content: LumenSettingsFormContent
  readonly children: React.ReactNode
}

export interface LumenSettingsFormAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenSettingsFormProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenSettingsFormContent | undefined
  readonly onAction?: ((event: LumenSettingsFormAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
  readonly slots?:
    | {
        readonly navigation?: React.ReactNode | undefined
        readonly content?: React.ReactNode | undefined
        readonly footer?: React.ReactNode | undefined
      }
    | undefined
}

export type LumenSettingsFormVariantProps = Omit<LumenSettingsFormProps, 'variant' | 'variantId'>

const SettingsFormContentContext = React.createContext<LumenSettingsFormContent | undefined>(undefined)

export function LumenSettingsFormProvider({ content, children }: LumenSettingsFormProviderProps) {
  return <SettingsFormContentContext.Provider value={content}>{children}</SettingsFormContentContext.Provider>
}

export function useLumenSettingsFormContent() {
  return React.useContext(SettingsFormContentContext)
}

export function uniqueLumenSettingsItems<Item extends { readonly id: string }>(
  items: readonly Item[],
): readonly Item[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

function uniquePreferenceItems<Item extends { readonly id: string }>(items: readonly Item[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()]
}

export function selectLumenSettingsItem<Item extends { readonly id: string }>(
  items: readonly Item[],
  requestedId: string | undefined,
): Item | undefined {
  return items.find((item) => item.id === requestedId) ?? items[0]
}

function report(onAction: LumenSettingsFormProps['onAction'], actionId: string, value?: string) {
  onAction?.(value === undefined ? { actionId } : { actionId, value })
}

function SettingsGlyph({ name }: { readonly name: 'copy' | 'hide' | 'more' | 'plus' | 'reveal' | 'upload' }) {
  return (
    <svg className="lumen-settings-glyph" data-tier="sm" viewBox="0 0 16 16" aria-hidden="true">
      {name === 'copy' ? <path d="M6 5h7v8H6zM3 3h7v2M3 3v8h3" /> : null}
      {name === 'hide' ? <path d="M2 8s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4Zm1-5 10 10" /> : null}
      {name === 'more' ? <path d="M3 8h.01M8 8h.01M13 8h.01" /> : null}
      {name === 'plus' ? <path d="M8 3v10M3 8h10" /> : null}
      {name === 'reveal' ? <path d="M2 8s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4Zm6 2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" /> : null}
      {name === 'upload' ? <path d="M8 11V2m-3 3 3-3 3 3M3 9v4h10V9" /> : null}
    </svg>
  )
}

function SettingsRoot({
  variant,
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  children,
}: Omit<LumenSettingsFormProps, 'content' | 'onAction'> & { readonly children: React.ReactNode }) {
  const contentClassName = [
    'lumen-settings-form',
    'hbar-app-ui-settings-surface',
    `hbar-app-ui-settings-variant-${variant}`,
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
      className="lumen-settings-form-root-surface"
      contentClassName={contentClassName}
      data-lumen-component="settings-form"
      data-lumen-variant={variant}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-surface={surface}
      data-hbar-app-ui-state={state}
    >
      {children}
    </LumenSurface>
  )
}

function SettingsFieldControl({
  field,
  value,
  changedLabel,
  onChange,
}: {
  readonly field: LumenSettingsField
  readonly value: string
  readonly changedLabel: string
  readonly onChange: (value: string) => void
}) {
  const controlId = `hbar-app-ui-settings-field-${field.id}`
  let describedBy: string | undefined
  if (field.error) {
    describedBy = `${controlId}-error`
  } else if (field.note) {
    describedBy = `${controlId}-note`
  }

  let control: React.ReactNode
  if (field.kind === 'select') {
    control = (
      <LumenChoiceSelect
        id={controlId}
        label={field.label}
        describedBy={describedBy}
        options={field.options ?? []}
        value={value}
        onValueChange={onChange}
      />
    )
  } else if (field.kind === 'textarea') {
    control = (
      <LumenTextarea
        id={controlId}
        value={value}
        maxLength={field.maxLength}
        onChange={(event) => onChange(event.currentTarget.value)}
        aria-label={field.label}
        aria-describedby={describedBy}
      />
    )
  } else if (field.prefix) {
    control = (
      <div className="hbar-app-ui-settings-prefix-control">
        <span>{field.prefix}</span>
        <LumenInput
          id={controlId}
          type={field.kind === 'url' ? 'url' : 'text'}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          aria-label={field.label}
          aria-describedby={describedBy}
        />
      </div>
    )
  } else {
    control = (
      <LumenInput
        id={controlId}
        type={field.kind === 'url' ? 'url' : 'text'}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        aria-label={field.label}
        aria-describedby={describedBy}
      />
    )
  }

  let supportingText: React.ReactNode = null
  if (field.error) {
    supportingText = (
      <small className="hbar-app-ui-settings-error" id={`${controlId}-error`}>
        {field.error}
      </small>
    )
  } else if (field.note) {
    supportingText = <small id={`${controlId}-note`}>{field.note}</small>
  }

  return (
    <div className="hbar-app-ui-settings-row">
      <div className="hbar-app-ui-settings-row-copy">
        <div>
          <strong>{field.label}</strong>
          {field.changed ? <LumenStatus value={changedLabel} tone="warning" /> : null}
        </div>
        <p>{field.description}</p>
      </div>
      <div className="hbar-app-ui-settings-row-control">
        {control}
        {supportingText}
        {field.kind === 'textarea' && field.maxLength !== undefined ? (
          <small>{`${value.length} / ${field.maxLength}`}</small>
        ) : null}
      </div>
    </div>
  )
}

function ActionFooter({
  dirty,
  busy = false,
  unsaved,
  cancel,
  save,
  onCancel,
  onSave,
}: {
  readonly dirty: boolean
  readonly busy?: boolean | undefined
  readonly unsaved: string
  readonly cancel: string
  readonly save: string
  readonly onCancel: () => void
  readonly onSave: () => void
}) {
  return (
    <footer className="hbar-app-ui-settings-actions">
      {dirty ? <p className="hbar-app-ui-settings-unsaved">{unsaved}</p> : null}
      <LumenButton variant="outlined" disabled={busy} onClick={onCancel}>
        {cancel}
      </LumenButton>
      <LumenButton tone="primary" disabled={busy || !dirty} onClick={onSave}>
        {save}
      </LumenButton>
    </footer>
  )
}

function WorkspaceSettings(
  props: Omit<LumenSettingsFormProps, 'content'> & { content: LumenSettingsWorkspaceContent },
) {
  const { content, onAction } = props
  const navigation = uniqueLumenSettingsItems(content.navigation)
  const fields = uniqueLumenSettingsItems(content.fields)
  const [activeNavigationId, setActiveNavigationId] = React.useState(content.activeNavigationId ?? navigation[0]?.id)
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.id, field.value])),
  )
  const [dirty, setDirty] = React.useState(true)
  const selectedNavigation = selectLumenSettingsItem(navigation, activeNavigationId)
  const reset = () => {
    setValues(Object.fromEntries(fields.map((field) => [field.id, field.value])))
    setDirty(false)
  }
  return (
    <SettingsRoot {...props} className="hbar-app-ui-settings-workspace-surface">
      <div className="hbar-app-ui-settings-workspace">
        <aside className="hbar-app-ui-settings-sidebar">
          <div className="hbar-app-ui-settings-sidebar-heading">
            <h1 className="hbar-app-ui-settings-page-title">{content.labels.pageTitle}</h1>
            <p className="hbar-app-ui-settings-subtle">{content.labels.accountName}</p>
          </div>
          <nav className="hbar-app-ui-settings-sidebar-nav" aria-label={content.labels.navigation}>
            {navigation.map((item) => (
              <LumenButton
                variant="text"
                key={item.id}
                aria-current={selectedNavigation?.id === item.id ? 'page' : undefined}
                onClick={() => setActiveNavigationId(item.id)}
              >
                {item.label}
              </LumenButton>
            ))}
          </nav>
        </aside>
        <main className="hbar-app-ui-settings-workspace-main">
          <div className="hbar-app-ui-settings-centered">
            <section className="hbar-app-ui-settings-panel">
              <header className="hbar-app-ui-settings-panel-heading">
                <h2>{selectedNavigation?.label ?? content.labels.panelTitle}</h2>
                <p>{content.labels.panelDescription}</p>
              </header>
              {fields.map((field) => (
                <SettingsFieldControl
                  key={field.id}
                  field={field}
                  value={values[field.id] ?? field.value}
                  changedLabel={content.labels.changed}
                  onChange={(value) => {
                    setValues((current) => ({ ...current, [field.id]: value }))
                    setDirty(true)
                  }}
                />
              ))}
              <ActionFooter
                dirty={dirty}
                unsaved={content.labels.unsaved}
                cancel={content.labels.cancel}
                save={content.labels.save}
                onCancel={reset}
                onSave={() => {
                  setDirty(false)
                  report(onAction, 'save')
                }}
              />
            </section>
          </div>
        </main>
      </div>
    </SettingsRoot>
  )
}

function ProfileSettings(props: Omit<LumenSettingsFormProps, 'content'> & { content: LumenSettingsProfileContent }) {
  const { content, onAction } = props
  const fields = uniqueLumenSettingsItems(content.fields)
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.id, field.value])),
  )
  const [dirty, setDirty] = React.useState(true)
  const hasErrors = fields.some((field) => Boolean(field.error))
  const reset = () => {
    setValues(Object.fromEntries(fields.map((field) => [field.id, field.value])))
    setDirty(false)
  }
  return (
    <SettingsRoot {...props} className="hbar-app-ui-settings-profile-surface">
      <div className="hbar-app-ui-settings-centered">
        <h1 className="hbar-app-ui-settings-page-title">{content.labels.pageTitle}</h1>
        <section className="hbar-app-ui-settings-panel">
          <header className="hbar-app-ui-settings-panel-heading">
            <h2>{content.labels.panelTitle}</h2>
            <p>{content.labels.panelDescription}</p>
          </header>
          <div className="hbar-app-ui-settings-row">
            <div className="hbar-app-ui-settings-row-copy">
              <strong>{content.labels.photoLabel}</strong>
              <p>{content.labels.photoDescription}</p>
            </div>
            <div className="hbar-app-ui-settings-row-control hbar-app-ui-settings-photo">
              <span className="hbar-app-ui-settings-photo-avatar" aria-label={content.labels.uploadPhoto}>
                {content.initials}
              </span>
              <LumenButton variant="outlined" onClick={() => report(onAction, 'upload-photo')}>
                <SettingsGlyph name="upload" />
                {content.labels.changePhoto}
              </LumenButton>
            </div>
          </div>
          {fields.map((field) => (
            <SettingsFieldControl
              key={field.id}
              field={field}
              value={values[field.id] ?? field.value}
              changedLabel={content.labels.changed}
              onChange={(value) => {
                setValues((current) => ({ ...current, [field.id]: value }))
                setDirty(true)
              }}
            />
          ))}
          <ActionFooter
            dirty={dirty}
            unsaved={content.labels.unsaved}
            cancel={content.labels.cancel}
            save={content.labels.save}
            onCancel={reset}
            onSave={() => {
              if (hasErrors) {
                return
              }
              setDirty(false)
              report(onAction, 'save')
            }}
          />
        </section>
      </div>
    </SettingsRoot>
  )
}

function Choice({
  label,
  choices,
  value,
  disabled,
  unavailable,
  onChange,
}: {
  readonly label: string
  readonly choices: readonly LumenSettingsChoice[]
  readonly value: string
  readonly disabled: boolean
  readonly unavailable: string
  readonly onChange: (id: string) => void
}) {
  const controlId = React.useId()
  const items = uniquePreferenceItems(choices)
  const valid = items.some((item) => item.id === value)
  return (
    <LumenChoiceSelect
      id={controlId}
      label={label}
      placeholder={unavailable}
      options={items}
      value={valid ? value : null}
      disabled={disabled}
      onValueChange={onChange}
    />
  )
}

export function LumenPreferencesSettings(content: LumenSettingsPreferencesContent) {
  const groupName = React.useId()
  const labels = content.labels
  const mode = content.persistence
  const busy = mode.mode === 'explicit' && mode.busy
  const themes = uniquePreferenceItems(content.themeChoices)
  return (
    <div className="hbar-app-ui-preferences hbar-app-ui-settings-centered" aria-busy={busy}>
      <h1 className="hbar-app-ui-settings-page-title">{labels.pageTitle}</h1>
      <section className="hbar-app-ui-settings-panel" aria-label={labels.panelTitle}>
        <header className="hbar-app-ui-settings-panel-heading">
          <h2>{labels.panelTitle}</h2>
          <p>{labels.panelDescription}</p>
        </header>
        {themes.length > 0 ? (
          <div className="hbar-app-ui-settings-row">
            <div className="hbar-app-ui-settings-row-copy">
              <strong>{labels.themeLabel}</strong>
              <small>{labels.themeCurrent}</small>
              <p>{labels.themeDescription}</p>
            </div>
            <div className="hbar-app-ui-settings-theme-choice" role="radiogroup" aria-label={labels.themeLabel}>
              {themes.map((theme) => (
                <label
                  className={`hbar-app-ui-settings-choice ${content.themeId === theme.id ? 'is-selected' : ''}`}
                  key={theme.id}
                >
                  <LumenInput
                    type="radio"
                    name={groupName}
                    checked={content.themeId === theme.id}
                    disabled={busy}
                    onChange={() => content.onChange({ type: 'theme', id: theme.id })}
                  />
                  <span>{theme.label}</span>
                </label>
              ))}
              {!themes.some((theme) => theme.id === content.themeId) ? (
                <p role="status">{labels.unavailableChoice}</p>
              ) : null}
            </div>
          </div>
        ) : null}
        {content.densityChoices.length > 0 ? (
          <div className="hbar-app-ui-settings-row">
            <div className="hbar-app-ui-settings-row-copy">
              <strong>{labels.densityLabel}</strong>
              <p>{labels.densityDescription}</p>
            </div>
            <div className="hbar-app-ui-settings-row-control">
              <Choice
                label={labels.densityLabel}
                choices={content.densityChoices}
                value={content.densityId}
                disabled={busy}
                unavailable={labels.unavailableChoice}
                onChange={(id) => content.onChange({ type: 'density', id })}
              />
            </div>
          </div>
        ) : null}
        {content.languageChoices.length > 0 ? (
          <div className="hbar-app-ui-settings-row">
            <div className="hbar-app-ui-settings-row-copy">
              <strong>{labels.languageLabel}</strong>
              <p>{labels.languageDescription}</p>
            </div>
            <div className="hbar-app-ui-settings-row-control">
              <Choice
                label={labels.languageLabel}
                choices={content.languageChoices}
                value={content.languageId}
                disabled={busy}
                unavailable={labels.unavailableChoice}
                onChange={(id) => content.onChange({ type: 'language', id })}
              />
            </div>
          </div>
        ) : null}
        {content.toggles.length > 0 || content.checkbox ? (
          <div className="hbar-app-ui-settings-list" aria-label={labels.toggleGroup}>
            {uniquePreferenceItems(content.toggles).map((item) => (
              <div className="hbar-app-ui-settings-row" key={item.id}>
                <div className="hbar-app-ui-settings-toggle-copy">
                  <strong>{item.label}</strong>
                  {item.recommended ? <small>{labels.recommended}</small> : null}
                  {item.changed ? <small>{labels.changed}</small> : null}
                  <small>{item.description}</small>
                </div>
                <LumenToggleControl
                  aria-label={item.label}
                  checked={item.enabled}
                  disabled={busy}
                  className="hbar-app-ui-settings-toggle"
                  onChange={(event) =>
                    content.onChange({
                      type: 'toggle',
                      id: item.id,
                      enabled: event.currentTarget.checked,
                    })
                  }
                />
              </div>
            ))}
            {content.checkbox ? (
              <div className="hbar-app-ui-settings-row">
                <label className="hbar-app-ui-settings-toggle-copy">
                  <strong>{content.checkbox.label}</strong>
                  <small>{content.checkbox.description}</small>
                  <LumenCheckBoxControl
                    checked={content.checkbox.enabled}
                    disabled={busy}
                    aria-label={content.checkbox.label}
                    onChange={(event) => {
                      if (content.checkbox) {
                        content.onChange({
                          type: 'checkbox',
                          id: content.checkbox.id,
                          enabled: event.currentTarget.checked,
                        })
                      }
                    }}
                  />
                </label>
              </div>
            ) : null}
          </div>
        ) : null}
        {content.error ? <p role="alert">{content.error}</p> : null}
        {mode.mode === 'explicit' ? (
          <ActionFooter
            dirty={mode.dirty}
            busy={mode.busy}
            unsaved={labels.unsaved}
            cancel={labels.cancel}
            save={labels.save}
            onCancel={mode.onCancel}
            onSave={mode.onSave}
          />
        ) : null}
      </section>
    </div>
  )
}

function PreferencesSettings(
  props: Omit<LumenSettingsFormProps, 'content'> & { content: LumenSettingsPreferencesContent },
) {
  return (
    <SettingsRoot {...props} className="hbar-app-ui-settings-preferences-surface">
      <LumenPreferencesSettings {...props.content} />
    </SettingsRoot>
  )
}

function MembersSettings(props: Omit<LumenSettingsFormProps, 'content'> & { content: LumenSettingsMembersContent }) {
  const { content, onAction } = props
  const inviteRoles = uniqueLumenSettingsItems(content.inviteRoles)
  const [members, setMembers] = React.useState<readonly LumenSettingsMember[]>(() =>
    uniqueLumenSettingsItems(content.members),
  )
  const [email, setEmail] = React.useState('')
  const [role, setRole] = React.useState(content.initialInviteRoleId)
  const seatProgress =
    content.seatsTotal > 0 ? Math.min(100, Math.max(0, (content.seatsUsed / content.seatsTotal) * 100)) : 0
  const visibleMembers = React.useMemo(() => uniqueLumenSettingsItems(members), [members])
  const sendInvite = () => {
    const nextEmail = email.trim()
    if (!nextEmail) {
      return
    }
    const nextMember: LumenSettingsMember = {
      id: `invite-${nextEmail}`,
      initials: nextEmail.slice(0, 2).toUpperCase(),
      name: nextEmail,
      email: nextEmail,
      status: 'invited',
      role: inviteRoles.find((choice) => choice.id === role)?.label ?? role,
      roleId: role,
      roleChoices: inviteRoles,
    }
    setMembers((current) => uniqueLumenSettingsItems([...current, nextMember]))
    setEmail('')
    report(onAction, 'invite', nextEmail)
  }
  return (
    <SettingsRoot {...props} className="hbar-app-ui-settings-members-surface">
      <div className="hbar-app-ui-settings-centered">
        <h1 className="hbar-app-ui-settings-page-title">{content.labels.pageTitle}</h1>
        <section className="hbar-app-ui-settings-panel">
          <header className="hbar-app-ui-settings-panel-heading">
            <h2>{content.labels.panelTitle}</h2>
            <p>{content.labels.panelDescription}</p>
          </header>
          <section className="hbar-app-ui-settings-invite">
            <div className="hbar-app-ui-settings-invite-copy">
              <strong>{content.labels.inviteTitle}</strong>
              <small>{content.labels.inviteDescription}</small>
            </div>
            <div className="hbar-app-ui-settings-invite-fields">
              <LumenInput
                type="email"
                value={email}
                placeholder={content.labels.emailPlaceholder}
                aria-label={content.labels.emailLabel}
                onChange={(event) => setEmail(event.currentTarget.value)}
              />
              <LumenChoiceSelect
                id="settings-invite-role"
                label={content.labels.roleLabel}
                options={inviteRoles}
                value={role}
                onValueChange={setRole}
              />
            </div>
            <LumenButton tone="primary" onClick={sendInvite}>
              <SettingsGlyph name="plus" />
              {content.labels.sendInvite}
            </LumenButton>
          </section>
          <div
            className="hbar-app-ui-settings-list"
            data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          >
            {visibleMembers.map((member) => (
              <article className="hbar-app-ui-settings-member-row" key={member.id}>
                <div className="hbar-app-ui-settings-member-primary">
                  <span className="hbar-app-ui-settings-member-avatar" aria-hidden="true">
                    {member.initials}
                  </span>
                  <div className="hbar-app-ui-settings-member-copy">
                    <strong>{member.name}</strong>
                    <small>{member.email}</small>
                  </div>
                  <LumenIconButton
                    label={content.labels.actions(member.name)}
                    onClick={() => report(onAction, 'member-actions', member.id)}
                  >
                    <SettingsGlyph name="more" />
                  </LumenIconButton>
                </div>
                <div className="hbar-app-ui-settings-member-secondary">
                  <LumenStatus
                    value={member.status === 'invited' ? content.labels.invited : content.labels.active}
                    tone={member.status === 'invited' ? 'warning' : 'success'}
                  />
                  {member.roleChoices.length > 1 ? (
                    <LumenChoiceSelect
                      id={`settings-member-role-${member.id}`}
                      label={content.labels.roleLabel}
                      options={uniqueLumenSettingsItems(member.roleChoices)}
                      value={member.roleId}
                      onValueChange={(id) =>
                        setMembers((current) =>
                          current.map((item) =>
                            item.id === member.id
                              ? {
                                  ...item,
                                  roleId: id,
                                  role: item.roleChoices.find((choice) => choice.id === id)?.label ?? id,
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  ) : (
                    <span className="hbar-app-ui-settings-muted">{member.role}</span>
                  )}
                </div>
              </article>
            ))}
            {visibleMembers.length === 0 ? <p className="hbar-app-ui-settings-empty">{content.labels.empty}</p> : null}
          </div>
          <footer className="hbar-app-ui-settings-seat-footer">
            <span>{content.labels.seats(content.seatsUsed, content.seatsTotal)}</span>
            <LumenProgress
              className="hbar-app-ui-settings-seat-meter"
              label={content.labels.seats(content.seatsUsed, content.seatsTotal)}
              value={seatProgress}
            />
          </footer>
        </section>
      </div>
    </SettingsRoot>
  )
}

function ApiKeysSettings(props: Omit<LumenSettingsFormProps, 'content'> & { content: LumenSettingsApiKeysContent }) {
  const { content, onAction } = props
  const secrets = uniqueLumenSettingsItems(content.secrets)
  const [revealed, setRevealed] = React.useState<Readonly<Record<string, boolean>>>({})
  const [integrations, setIntegrations] = React.useState<readonly LumenSettingsIntegration[]>(() =>
    uniqueLumenSettingsItems(content.integrations),
  )
  const toggleIntegration = (id: string) => {
    setIntegrations((current) => current.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item)))
    report(onAction, 'toggle-integration', id)
  }
  return (
    <SettingsRoot {...props} className="hbar-app-ui-settings-api-surface">
      <div className="hbar-app-ui-settings-centered">
        <header className="hbar-app-ui-settings-topbar">
          <h1 className="hbar-app-ui-settings-page-title">{content.labels.pageTitle}</h1>
          <LumenButton tone="primary" onClick={() => report(onAction, 'create-key')}>
            {content.labels.createKey}
          </LumenButton>
        </header>
        <section className="hbar-app-ui-settings-secret-card">
          <header className="hbar-app-ui-settings-panel-heading">
            <h2>{content.labels.secretsTitle}</h2>
            <p>{content.labels.secretsDescription}</p>
          </header>
          <div
            className="hbar-app-ui-settings-list"
            data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          >
            {secrets.map((secret) => {
              const isRevealed = revealed[secret.id] ?? false
              return (
                <article className="hbar-app-ui-settings-secret-row" key={secret.id}>
                  <div className="hbar-app-ui-settings-secret-copy">
                    <strong>{secret.name}</strong>
                    <small>{content.labels.secretMeta(secret.created, secret.lastUsed)}</small>
                    <div className="hbar-app-ui-settings-secret-token">
                      <code>{isRevealed ? secret.token : secret.token.replace(/./g, '•')}</code>
                      <span className="hbar-app-ui-settings-secret-token-tools">
                        <LumenIconButton
                          label={isRevealed ? content.labels.hide(secret.name) : content.labels.reveal(secret.name)}
                          onClick={() =>
                            setRevealed((current) => ({
                              ...current,
                              [secret.id]: !isRevealed,
                            }))
                          }
                        >
                          <SettingsGlyph name={isRevealed ? 'hide' : 'reveal'} />
                        </LumenIconButton>
                        <LumenIconButton
                          label={content.labels.copy(secret.name)}
                          onClick={() => report(onAction, 'copy-key', secret.id)}
                        >
                          <SettingsGlyph name="copy" />
                        </LumenIconButton>
                      </span>
                    </div>
                  </div>
                  <LumenIconButton
                    label={content.labels.actions(secret.name)}
                    onClick={() => report(onAction, 'key-actions', secret.id)}
                  >
                    <SettingsGlyph name="more" />
                  </LumenIconButton>
                </article>
              )
            })}
            {secrets.length === 0 ? <p className="hbar-app-ui-settings-empty">{content.labels.empty}</p> : null}
          </div>
        </section>
        <section className="hbar-app-ui-settings-integration-card">
          <header className="hbar-app-ui-settings-panel-heading">
            <h2>{content.labels.integrationsTitle}</h2>
            <p>{content.labels.integrationsDescription}</p>
          </header>
          <div className="hbar-app-ui-settings-list">
            {integrations.map((integration) => (
              <article className="hbar-app-ui-settings-integration-row" key={integration.id}>
                <div className="hbar-app-ui-settings-integration-copy">
                  <div className="hbar-app-ui-settings-control-heading">
                    <strong>{integration.name}</strong>
                    <LumenStatus
                      value={
                        integration.status === 'connected' ? content.labels.connected : content.labels.disconnected
                      }
                      tone={integration.status === 'connected' ? 'success' : 'neutral'}
                    />
                  </div>
                  <small>{integration.description}</small>
                </div>
                <LumenToggleControl
                  checked={integration.enabled}
                  aria-label={content.labels.toggle(integration.name)}
                  className="hbar-app-ui-settings-toggle"
                  onChange={() => toggleIntegration(integration.id)}
                />
              </article>
            ))}
          </div>
          <p className="hbar-app-ui-settings-danger-footer">{content.labels.auditNote}</p>
        </section>
      </div>
    </SettingsRoot>
  )
}

function DangerSettings(props: Omit<LumenSettingsFormProps, 'content'> & { content: LumenSettingsDangerContent }) {
  const { content, onAction } = props
  const [confirmation, setConfirmation] = React.useState('')
  const [notice, setNotice] = React.useState<string>()
  const matches = confirmation.trim() === content.workspaceName
  const action = (actionId: string, message: string) => {
    setNotice(message)
    report(onAction, actionId)
  }
  return (
    <SettingsRoot {...props} className="hbar-app-ui-settings-danger-surface">
      <div className="hbar-app-ui-settings-centered">
        <h1 className="hbar-app-ui-settings-page-title">{content.labels.pageTitle}</h1>
        <section className="hbar-app-ui-settings-panel">
          <header className="hbar-app-ui-settings-panel-heading">
            <h2>{content.labels.panelTitle}</h2>
            <p>{content.labels.panelDescription}</p>
          </header>
          <div className="hbar-app-ui-settings-danger-row">
            <div className="hbar-app-ui-settings-danger-copy">
              <strong>{content.labels.transferTitle}</strong>
              <p>{content.labels.transferDescription}</p>
            </div>
            <LumenButton variant="outlined" onClick={() => action('transfer', content.labels.transferNotice)}>
              {content.labels.transferAction}
            </LumenButton>
          </div>
          <div className="hbar-app-ui-settings-danger-row">
            <div className="hbar-app-ui-settings-danger-copy">
              <strong>{content.labels.archiveTitle}</strong>
              <p>{content.labels.archiveDescription}</p>
            </div>
            <LumenButton variant="outlined" onClick={() => action('archive', content.labels.archiveNotice)}>
              {content.labels.archiveAction}
            </LumenButton>
          </div>
          <section className="hbar-app-ui-settings-danger-card">
            <header>
              <strong>{content.labels.deleteTitle}</strong>
              <p>{content.labels.deleteDescription}</p>
            </header>
            <strong>{content.labels.deleteSummary.replace('{count}', String(content.memberCount))}</strong>
            <ul>
              {content.consequences.map((item, index) => (
                <li key={`${index}-${item}`}>{item}</li>
              ))}
            </ul>
            <label className="hbar-app-ui-settings-danger-copy">
              <strong>{content.labels.typePrompt.replace('{workspace}', content.workspaceName)}</strong>
              <LumenInput
                value={confirmation}
                onChange={(event) => setConfirmation(event.currentTarget.value)}
                aria-label={content.labels.confirmationLabel}
              />
            </label>
            <div className="hbar-app-ui-settings-actions">
              <LumenButton
                variant="outlined"
                onClick={() => {
                  setConfirmation('')
                  setNotice(undefined)
                }}
              >
                {content.labels.cancel}
              </LumenButton>
              <LumenButton
                tone="danger"
                disabled={!matches}
                onClick={() => action('delete', content.labels.deleteSuccess)}
              >
                {content.labels.deleteAction}
              </LumenButton>
            </div>
          </section>
          {notice ? (
            <p className="hbar-app-ui-settings-danger-footer" role="status">
              {notice}
            </p>
          ) : null}
          <p className="hbar-app-ui-settings-danger-footer">{content.labels.footerNote}</p>
        </section>
      </div>
    </SettingsRoot>
  )
}

function emptySettings(props: LumenSettingsFormProps) {
  return (
    <SettingsRoot {...props} className="hbar-app-ui-settings-empty-surface">
      {null}
    </SettingsRoot>
  )
}

export function LumenSettingsForm(props: LumenSettingsFormProps) {
  const providerContent = useLumenSettingsFormContent()
  if (props.slots)
    return (
      <SettingsRoot {...props} className="hbar-app-ui-settings-form-slot-surface">
        {props.slots.navigation}
        <main>{props.slots.content}</main>
        {props.slots.footer}
      </SettingsRoot>
    )
  const content = props.content ?? providerContent
  if (!content) {
    return emptySettings(props)
  }
  switch (props.variant) {
    case 1:
      return content.workspaceReference ? (
        <LumenSettingsForm1Reference {...content.workspaceReference} instanceId={props.variantId} />
      ) : content.workspace ? (
        <WorkspaceSettings {...props} content={content.workspace} />
      ) : (
        emptySettings(props)
      )
    case 2:
      if (content.profileReference) {
        return <LumenSettingsForm2Reference {...content.profileReference} instanceId={props.variantId} />
      }
      if (content.profile) {
        return <ProfileSettings {...props} content={content.profile} />
      }
      return emptySettings(props)
    case 3:
      if (content.preferencesReference) {
        return <LumenSettingsForm3Reference {...content.preferencesReference} instanceId={props.variantId} />
      }
      return content.preferences ? (
        <PreferencesSettings {...props} content={content.preferences} />
      ) : (
        emptySettings(props)
      )
    case 4:
      if (content.membersReference) {
        return <LumenSettingsForm4Reference {...content.membersReference} instanceId={props.variantId} />
      }
      return content.members ? <MembersSettings {...props} content={content.members} /> : emptySettings(props)
    case 5:
      if (content.apiKeysReference) {
        return <LumenSettingsForm5Reference {...content.apiKeysReference} instanceId={props.variantId} />
      }
      return content.apiKeys ? <ApiKeysSettings {...props} content={content.apiKeys} /> : emptySettings(props)
    case 6:
      if (content.dangerReference) {
        return <LumenSettingsForm6Reference {...content.dangerReference} instanceId={props.variantId} />
      }
      return content.danger ? <DangerSettings {...props} content={content.danger} /> : emptySettings(props)
    default:
      return emptySettings(props)
  }
}

function settingsFormVariant(variant: number, props: LumenSettingsFormVariantProps) {
  return <LumenSettingsForm {...props} variant={variant} variantId={`hbar-app-ui-settings-form-${variant}`} />
}

export function LumenSettingsForm01(props: LumenSettingsFormVariantProps) {
  return settingsFormVariant(1, props)
}

export function LumenSettingsForm02(props: LumenSettingsFormVariantProps) {
  return settingsFormVariant(2, props)
}

export function LumenSettingsForm03(props: LumenSettingsFormVariantProps) {
  return settingsFormVariant(3, props)
}

export function LumenSettingsForm04(props: LumenSettingsFormVariantProps) {
  return settingsFormVariant(4, props)
}

export function LumenSettingsForm05(props: LumenSettingsFormVariantProps) {
  return settingsFormVariant(5, props)
}

export function LumenSettingsForm06(props: LumenSettingsFormVariantProps) {
  return settingsFormVariant(6, props)
}
