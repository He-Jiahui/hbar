import { useEffect, useId, useState, type ReactNode } from 'react'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import {
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenFormField,
  LumenFrame,
  LumenIcon,
  LumenIconButton,
  LumenInput,
  LumenNavigationButton,
  LumenOption,
  LumenSelect,
  LumenText,
  LumenTextarea,
} from '@lumen/app-ui'
import type {
  SandboxDraftEdit,
  SandboxDraftIssue,
  SandboxDraftSection,
  SandboxProfileEditorState,
  SandboxProfilesState,
} from '@hbar/app-runtime'
import type { SandboxProfileSummary } from '@hbar/contracts/commands/sandbox'
import type { SandboxDecision, SandboxEscalation, SandboxPathAccess, SandboxProfileId } from '@hbar/contracts/sandbox'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import './sandbox-profile-settings.css'

interface SectionLabels {
  readonly title: string
  readonly hint: string
  readonly empty: string
  readonly add: string
  readonly remove: (value: string) => string
}

/** Host-localized copy; built-in profile names are resolved by id, stored profiles show their own name. */
export interface HbarSandboxProfileSettingsLabels {
  readonly title: string
  readonly description: string
  readonly refresh: string
  readonly loading: string
  readonly unavailable: string
  readonly disconnected: string
  readonly profiles: string
  readonly create: string
  readonly createFrom: string
  readonly builtin: string
  readonly profileName: (profile: Pick<SandboxProfileSummary, 'id' | 'name' | 'builtin'>) => string
  readonly revision: (revision: number) => string
  readonly listError: (code: string) => string
  readonly noSelection: string
  readonly editorLoading: string
  readonly missing: string
  readonly readonlyHint: string
  readonly newTitle: string
  readonly fields: {
    readonly id: string
    readonly idHint: string
    readonly name: string
    readonly description: string
    readonly extends: string
    readonly noParent: string
    readonly unknownParent: (id: string) => string
    readonly escalation: string
    readonly escalationHint: string
    readonly fileDefault: string
    readonly network: string
    readonly osConfinement: string
    readonly osConfinementHint: string
    readonly osConfinementMode: string
  }
  readonly inherit: string
  readonly escalationOptions: Readonly<Record<SandboxEscalation, string>>
  readonly accessOptions: Readonly<Record<SandboxPathAccess, string>>
  readonly decisionOptions: Readonly<Record<SandboxDecision, string>>
  readonly networkOptions: { readonly enabled: string; readonly disabled: string }
  readonly osConfinementModeOptions: { readonly unelevated: string; readonly elevated: string }
  readonly grants: SectionLabels & { readonly path: string; readonly pathPlaceholder: string; readonly access: string }
  readonly commands: SectionLabels & {
    readonly pattern: string
    readonly patternPlaceholder: string
    readonly decision: string
    readonly warning: string
  }
  readonly tools: SectionLabels & { readonly tool: string; readonly toolPlaceholder: string; readonly decision: string }
  readonly environment: SectionLabels & {
    readonly name: string
    readonly namePlaceholder: string
    readonly value: string
  }
  /** Message for one issue; the column distinguishes, for example, a variable name from its value. */
  readonly issue: (issue: Pick<SandboxDraftIssue, 'field' | 'column' | 'code'>) => string
  readonly effective: {
    readonly title: string
    readonly chain: (names: readonly string[]) => string
    readonly unresolved: (message: string) => string
    /** One line with the already-localized effective values. */
    readonly summary: (values: {
      readonly escalation: string
      readonly fileDefault: string
      readonly network: string
    }) => string
    readonly rules: (counts: {
      readonly grants: number
      readonly commands: number
      readonly tools: number
      readonly environment: number
    }) => string
  }
  readonly save: string
  readonly saving: string
  readonly saved: string
  readonly discard: string
  readonly delete: string
  readonly deleting: string
  readonly deleteConfirm: (name: string) => string
  readonly confirmDelete: string
  readonly discardConfirm: string
  readonly confirmDiscard: string
  readonly cancel: string
  readonly unknown: (action: 'save' | 'delete') => string
  readonly reconcile: string
  readonly retry: string
  readonly conflict: string
  readonly reload: string
  readonly error: (code: string) => string
}

export type HbarSandboxOpenTarget =
  | { readonly kind: 'existing'; readonly id: SandboxProfileId }
  | { readonly kind: 'new'; readonly basedOn: SandboxProfileId | null }

/** Confirmation bound to an explicit target; never to whatever is selected when it resolves. */
export type HbarSandboxConfirmation =
  | { readonly kind: 'discard'; readonly target: HbarSandboxOpenTarget }
  | { readonly kind: 'delete'; readonly editorId: string; readonly name: string }

export interface HbarSandboxProfilesViewProps {
  readonly labels: HbarSandboxProfileSettingsLabels
  readonly connected: boolean
  readonly state: SandboxProfilesState
  readonly confirmation: HbarSandboxConfirmation | null
  readonly actionError: string | null
  readonly onRefresh: () => void
  readonly onOpen: (target: HbarSandboxOpenTarget) => void
  readonly onEdit: (editorId: string, edit: SandboxDraftEdit) => void
  readonly onSave: (editorId: string) => void
  readonly onDiscard: (editorId: string) => void
  readonly onReconcile: (editorId: string) => void
  readonly onRequestDelete: (editorId: string, name: string) => void
  readonly onConfirm: () => void
  readonly onCancelConfirmation: () => void
}

const sections = ['grants', 'commands', 'tools', 'environment'] as const satisfies readonly SandboxDraftSection[]
const accesses = ['none', 'read', 'write'] as const satisfies readonly SandboxPathAccess[]
const decisions = ['allow', 'ask', 'deny'] as const satisfies readonly SandboxDecision[]
const INHERIT = ''

function issueFor(
  issues: readonly SandboxDraftIssue[],
  field: SandboxDraftIssue['field'],
  rowId: string | null,
  column: SandboxDraftIssue['column'],
) {
  return issues.find((issue) => issue.field === field && issue.rowId === rowId && issue.column === column)
}

/** Effective profile list: every summary, including the editor's profile when it is not yet listed. */
function ProfileList({
  labels,
  state,
  disabled,
  onOpen,
}: {
  readonly labels: HbarSandboxProfileSettingsLabels
  readonly state: SandboxProfilesState
  readonly disabled: boolean
  readonly onOpen: (target: HbarSandboxOpenTarget) => void
}) {
  const selected = state.editor?.profileId ?? null
  return (
    <LumenFrame as="nav" className="hbar-sandbox-profiles-list" aria-label={labels.profiles}>
      <LumenButton
        type="button"
        variant="outlined"
        disabled={disabled}
        onClick={() => onOpen({ kind: 'new', basedOn: ':workspace-write' })}
      >
        <LumenIcon icon={Plus} tier="sm" />
        {labels.create}
      </LumenButton>
      {state.list.status === 'loading' && !state.list.items.length && (
        <LumenText as="p" role="status" tone="muted">
          {labels.loading}
        </LumenText>
      )}
      {state.list.error && (
        <LumenText as="p" role="alert">
          {labels.listError(state.list.error)}
        </LumenText>
      )}
      <LumenCollection className="hbar-sandbox-profiles-items">
        {state.list.items.map((profile) => (
          <LumenCollectionItem key={profile.id}>
            <LumenNavigationButton
              className="hbar-sandbox-profiles-item"
              selected={profile.id === selected}
              aria-current={profile.id === selected ? 'true' : undefined}
              disabled={disabled}
              onClick={() => onOpen({ kind: 'existing', id: profile.id })}
            >
              <LumenText as="span" className="hbar-sandbox-profiles-item-name">
                {labels.profileName(profile)}
              </LumenText>
              <LumenText as="small" tone="muted">
                {profile.builtin ? labels.builtin : profile.id}
              </LumenText>
            </LumenNavigationButton>
          </LumenCollectionItem>
        ))}
      </LumenCollection>
    </LumenFrame>
  )
}

/** Row cell; Lumen controls render their own field boundary, so layout targets this wrapper. */
function Cell({ kind, children }: { readonly kind: 'text' | 'name' | 'choice'; readonly children: ReactNode }) {
  return (
    <LumenFrame className="hbar-sandbox-profiles-cell" data-cell={kind}>
      {children}
    </LumenFrame>
  )
}

function RowIssue({
  id,
  issue,
  labels,
}: {
  readonly id: string
  readonly issue: SandboxDraftIssue | undefined
  readonly labels: HbarSandboxProfileSettingsLabels
}) {
  if (!issue) return null
  return (
    <LumenText as="small" id={id} tone="danger" className="hbar-sandbox-profiles-issue">
      {labels.issue(issue)}
    </LumenText>
  )
}

function RuleSection({
  section,
  title,
  hint,
  warning,
  empty,
  add,
  count,
  limitIssue,
  disabled,
  labels,
  onAdd,
  children,
}: {
  readonly section: SandboxDraftSection
  readonly title: string
  readonly hint: string
  readonly warning?: string | undefined
  readonly empty: string
  readonly add: string
  readonly count: number
  readonly limitIssue: SandboxDraftIssue | undefined
  readonly disabled: boolean
  readonly labels: HbarSandboxProfileSettingsLabels
  readonly onAdd: () => void
  readonly children: ReactNode
}) {
  const headingId = useId()
  return (
    <LumenFrame
      as="section"
      className="hbar-sandbox-profiles-section"
      aria-labelledby={headingId}
      data-section={section}
    >
      <LumenFrame className="hbar-sandbox-profiles-section-header">
        <LumenFrame className="hbar-sandbox-profiles-section-intro">
          <LumenText as="h4" id={headingId}>
            {title}
          </LumenText>
          <LumenText as="p" tone="muted">
            {hint}
          </LumenText>
          {warning && (
            <LumenText as="p" className="hbar-sandbox-profiles-warning">
              {warning}
            </LumenText>
          )}
        </LumenFrame>
        <LumenButton type="button" variant="outlined" disabled={disabled} onClick={onAdd}>
          <LumenIcon icon={Plus} tier="sm" />
          {add}
        </LumenButton>
      </LumenFrame>
      {limitIssue && (
        <LumenText as="p" role="alert">
          {labels.issue(limitIssue)}
        </LumenText>
      )}
      {count === 0 ? (
        <LumenText as="p" tone="muted">
          {empty}
        </LumenText>
      ) : (
        <LumenCollection className="hbar-sandbox-profiles-rows">{children}</LumenCollection>
      )}
    </LumenFrame>
  )
}

function Editor({
  labels,
  connected,
  state,
  editor,
  confirmation,
  actionError,
  onOpen,
  onEdit,
  onSave,
  onDiscard,
  onReconcile,
  onRequestDelete,
  onConfirm,
  onCancelConfirmation,
}: Omit<HbarSandboxProfilesViewProps, 'onRefresh' | 'state'> & {
  readonly state: SandboxProfilesState
  readonly editor: SandboxProfileEditorState
}) {
  const base = useId()
  const writing = editor.status === 'saving' || editor.status === 'deleting'
  const locked =
    !connected || editor.mode === 'readonly' || writing || editor.status === 'unknown' || editor.status === 'loading'
  const edit = (change: SandboxDraftEdit) => onEdit(editor.editorId, change)
  const draft = editor.draft
  const issues = editor.issues
  const control = (name: string) => `${base}-${name}`
  const described = (id: string, issue: SandboxDraftIssue | undefined) =>
    issue ? { 'aria-invalid': true, 'aria-describedby': id } : {}
  const heading =
    editor.mode === 'create'
      ? labels.newTitle
      : labels.profileName({ id: editor.profileId ?? draft.id, name: draft.name, builtin: editor.mode === 'readonly' })
  const idIssue = issueFor(issues, 'id', null, null)
  const nameIssue = issueFor(issues, 'name', null, null)
  const extendsIssue = issueFor(issues, 'extends', null, null)
  const parents = state.list.items.filter((profile) => profile.id !== editor.profileId)
  const parentListed = draft.extends === null || parents.some((profile) => profile.id === draft.extends)
  const nameOf = (id: string) => {
    const summary = state.list.items.find((profile) => profile.id === id)
    return summary ? labels.profileName(summary) : id
  }

  if (editor.status === 'missing')
    return (
      <LumenFrame as="section" className="hbar-sandbox-profiles-editor" aria-label={labels.missing}>
        <LumenText as="p" role="alert">
          {labels.missing}
        </LumenText>
      </LumenFrame>
    )

  return (
    <LumenFrame
      as="section"
      className="hbar-sandbox-profiles-editor"
      aria-label={heading}
      aria-busy={editor.status === 'loading' || writing}
    >
      {confirmation?.kind === 'discard' && (
        <LumenFrame className="hbar-sandbox-profiles-confirm" role="alertdialog" aria-label={labels.discardConfirm}>
          <LumenText as="p">{labels.discardConfirm}</LumenText>
          <LumenFrame className="hbar-sandbox-profiles-actions">
            <LumenButton type="button" variant="contained" onClick={onConfirm}>
              {labels.confirmDiscard}
            </LumenButton>
            <LumenButton type="button" variant="outlined" onClick={onCancelConfirmation}>
              {labels.cancel}
            </LumenButton>
          </LumenFrame>
        </LumenFrame>
      )}
      <LumenFrame as="header" className="hbar-sandbox-profiles-editor-header">
        <LumenFrame className="hbar-sandbox-profiles-section-intro">
          <LumenText as="h3">{heading}</LumenText>
          {editor.revision !== null && editor.mode === 'edit' && (
            <LumenText as="small" tone="muted">
              {labels.revision(editor.revision)}
            </LumenText>
          )}
          {editor.mode === 'readonly' && editor.status !== 'loading' && (
            <LumenText as="p" tone="muted">
              {labels.readonlyHint}
            </LumenText>
          )}
        </LumenFrame>
        <LumenFrame className="hbar-sandbox-profiles-actions">
          {editor.mode === 'readonly' ? (
            <LumenButton
              type="button"
              variant="outlined"
              disabled={!connected || editor.status === 'loading' || editor.profileId === null}
              onClick={() => editor.profileId && onOpen({ kind: 'new', basedOn: editor.profileId })}
            >
              <LumenIcon icon={Plus} tier="sm" />
              {labels.createFrom}
            </LumenButton>
          ) : (
            <>
              <LumenButton
                type="button"
                variant="contained"
                disabled={
                  !connected ||
                  writing ||
                  editor.status === 'loading' ||
                  (editor.status !== 'unknown' && (!editor.dirty || issues.length > 0))
                }
                onClick={() => onSave(editor.editorId)}
              >
                {editor.status === 'saving'
                  ? labels.saving
                  : editor.status === 'unknown' && editor.pending === 'save'
                    ? labels.retry
                    : labels.save}
              </LumenButton>
              <LumenButton
                type="button"
                variant="outlined"
                disabled={!editor.dirty || writing || editor.status === 'unknown'}
                onClick={() => onDiscard(editor.editorId)}
              >
                {labels.discard}
              </LumenButton>
              {editor.mode === 'edit' && (
                <LumenButton
                  type="button"
                  variant="outlined"
                  tone="danger"
                  disabled={!connected || writing || editor.status === 'unknown' || editor.status === 'loading'}
                  onClick={() => onRequestDelete(editor.editorId, heading)}
                >
                  <LumenIcon icon={Trash2} tier="sm" />
                  {editor.status === 'deleting' ? labels.deleting : labels.delete}
                </LumenButton>
              )}
            </>
          )}
        </LumenFrame>
      </LumenFrame>
      <LumenFrame className="hbar-sandbox-profiles-feedback" aria-live="polite">
        {editor.status === 'loading' && (
          <LumenText as="p" role="status" tone="muted">
            {labels.editorLoading}
          </LumenText>
        )}
        {editor.status === 'saving' && (
          <LumenText as="p" role="status">
            {labels.saving}
          </LumenText>
        )}
        {editor.saved && editor.status === 'ready' && !editor.dirty && (
          <LumenText as="p" role="status">
            {labels.saved}
          </LumenText>
        )}
        {editor.status === 'unknown' && editor.pending && (
          <LumenFrame className="hbar-sandbox-profiles-recovery">
            <LumenText as="p" role="alert">
              {labels.unknown(editor.pending)}
            </LumenText>
            <LumenButton
              type="button"
              variant="outlined"
              disabled={!connected}
              onClick={() => onReconcile(editor.editorId)}
            >
              {labels.reconcile}
            </LumenButton>
          </LumenFrame>
        )}
        {editor.status === 'conflict' && editor.profileId && (
          <LumenFrame className="hbar-sandbox-profiles-recovery">
            <LumenText as="p" role="alert">
              {labels.conflict}
            </LumenText>
            <LumenButton
              type="button"
              variant="outlined"
              disabled={!connected}
              onClick={() => editor.profileId && onOpen({ kind: 'existing', id: editor.profileId })}
            >
              {labels.reload}
            </LumenButton>
          </LumenFrame>
        )}
        {editor.status === 'failed' && editor.error && (
          <LumenText as="p" role="alert">
            {labels.error(editor.error)}
          </LumenText>
        )}
        {actionError && editor.status !== 'failed' && editor.status !== 'unknown' && (
          <LumenText as="p" role="alert">
            {labels.error(actionError)}
          </LumenText>
        )}
        {confirmation?.kind === 'delete' && confirmation.editorId === editor.editorId && (
          <LumenFrame
            className="hbar-sandbox-profiles-confirm"
            role="alertdialog"
            aria-label={labels.deleteConfirm(confirmation.name)}
          >
            <LumenText as="p">{labels.deleteConfirm(confirmation.name)}</LumenText>
            <LumenFrame className="hbar-sandbox-profiles-actions">
              <LumenButton type="button" variant="contained" tone="danger" onClick={onConfirm}>
                {labels.confirmDelete}
              </LumenButton>
              <LumenButton type="button" variant="outlined" onClick={onCancelConfirmation}>
                {labels.cancel}
              </LumenButton>
            </LumenFrame>
          </LumenFrame>
        )}
      </LumenFrame>

      <LumenFrame className="hbar-sandbox-profiles-fields">
        <LumenFormField
          controlId={control('id')}
          label={labels.fields.id}
          hint={labels.fields.idHint}
          error={idIssue ? labels.issue(idIssue) : undefined}
        >
          <LumenInput
            id={control('id')}
            value={draft.id}
            disabled={locked || editor.mode !== 'create'}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => edit({ kind: 'text', field: 'id', value: event.currentTarget.value })}
          />
        </LumenFormField>
        <LumenFormField
          controlId={control('name')}
          label={labels.fields.name}
          error={nameIssue ? labels.issue(nameIssue) : undefined}
        >
          <LumenInput
            id={control('name')}
            value={draft.name}
            disabled={locked}
            onChange={(event) => edit({ kind: 'text', field: 'name', value: event.currentTarget.value })}
          />
        </LumenFormField>
        <LumenFormField controlId={control('description')} label={labels.fields.description}>
          <LumenTextarea
            id={control('description')}
            value={draft.description}
            disabled={locked}
            rows={2}
            onChange={(event) => edit({ kind: 'text', field: 'description', value: event.currentTarget.value })}
          />
        </LumenFormField>
        <LumenFormField
          controlId={control('extends')}
          label={labels.fields.extends}
          error={extendsIssue ? labels.issue(extendsIssue) : undefined}
        >
          <LumenSelect
            id={control('extends')}
            value={draft.extends ?? INHERIT}
            disabled={locked}
            onChange={(event) => edit({ kind: 'extends', value: event.currentTarget.value || null })}
          >
            <LumenOption value={INHERIT}>{labels.fields.noParent}</LumenOption>
            {!parentListed && draft.extends && (
              <LumenOption value={draft.extends}>{labels.fields.unknownParent(draft.extends)}</LumenOption>
            )}
            {parents.map((profile) => (
              <LumenOption key={profile.id} value={profile.id}>
                {labels.profileName(profile)}
              </LumenOption>
            ))}
          </LumenSelect>
        </LumenFormField>
        <LumenFormField
          controlId={control('escalation')}
          label={labels.fields.escalation}
          hint={labels.fields.escalationHint}
        >
          <LumenSelect
            id={control('escalation')}
            value={draft.escalation ?? INHERIT}
            disabled={locked}
            onChange={(event) => {
              const value = event.currentTarget.value
              edit({ kind: 'escalation', value: value === 'ask' || value === 'deny' ? value : null })
            }}
          >
            <LumenOption value={INHERIT}>{labels.inherit}</LumenOption>
            <LumenOption value="ask">{labels.escalationOptions.ask}</LumenOption>
            <LumenOption value="deny">{labels.escalationOptions.deny}</LumenOption>
          </LumenSelect>
        </LumenFormField>
        <LumenFormField controlId={control('fileDefault')} label={labels.fields.fileDefault}>
          <LumenSelect
            id={control('fileDefault')}
            value={draft.fileDefault ?? INHERIT}
            disabled={locked}
            onChange={(event) => {
              const value = accesses.find((access) => access === event.currentTarget.value)
              edit({ kind: 'fileDefault', value: value ?? null })
            }}
          >
            <LumenOption value={INHERIT}>{labels.inherit}</LumenOption>
            {accesses.map((access) => (
              <LumenOption key={access} value={access}>
                {labels.accessOptions[access]}
              </LumenOption>
            ))}
          </LumenSelect>
        </LumenFormField>
        <LumenFormField controlId={control('network')} label={labels.fields.network}>
          <LumenSelect
            id={control('network')}
            value={draft.network === null ? INHERIT : draft.network ? 'enabled' : 'disabled'}
            disabled={locked}
            onChange={(event) => {
              const value = event.currentTarget.value
              edit({ kind: 'network', value: value === 'enabled' ? true : value === 'disabled' ? false : null })
            }}
          >
            <LumenOption value={INHERIT}>{labels.inherit}</LumenOption>
            <LumenOption value="enabled">{labels.networkOptions.enabled}</LumenOption>
            <LumenOption value="disabled">{labels.networkOptions.disabled}</LumenOption>
          </LumenSelect>
        </LumenFormField>
        <LumenFormField
          controlId={control('osConfinement-enabled')}
          label={labels.fields.osConfinement}
          hint={labels.fields.osConfinementHint}
        >
          <LumenSelect
            id={control('osConfinement-enabled')}
            value={draft.osConfinement == null ? INHERIT : draft.osConfinement.enabled ? 'enabled' : 'disabled'}
            disabled={locked}
            onChange={(event) => {
              const value = event.currentTarget.value
              if (value === INHERIT) {
                edit({ kind: 'osConfinement', value: null })
              } else {
                const mode = draft.osConfinement?.mode ?? 'unelevated'
                edit({ kind: 'osConfinement', value: { enabled: value === 'enabled', mode } })
              }
            }}
          >
            <LumenOption value={INHERIT}>{labels.inherit}</LumenOption>
            <LumenOption value="enabled">{labels.networkOptions.enabled}</LumenOption>
            <LumenOption value="disabled">{labels.networkOptions.disabled}</LumenOption>
          </LumenSelect>
        </LumenFormField>
        {draft.osConfinement != null && (
          <LumenFormField controlId={control('osConfinement-mode')} label={labels.fields.osConfinementMode}>
            <LumenSelect
              id={control('osConfinement-mode')}
              value={draft.osConfinement.mode}
              disabled={locked}
              onChange={(event) => {
                const mode = event.currentTarget.value as 'unelevated' | 'elevated'
                const enabled = draft.osConfinement?.enabled ?? true
                edit({ kind: 'osConfinement', value: { enabled, mode } })
              }}
            >
              <LumenOption value="unelevated">{labels.osConfinementModeOptions.unelevated}</LumenOption>
              <LumenOption value="elevated">{labels.osConfinementModeOptions.elevated}</LumenOption>
            </LumenSelect>
          </LumenFormField>
        )}
      </LumenFrame>

      {sections.map((section) => {
        const limitIssue = issueFor(issues, section, null, null)
        const add = () => edit({ kind: 'add', section })
        if (section === 'grants')
          return (
            <RuleSection
              key={section}
              section={section}
              title={labels.grants.title}
              hint={labels.grants.hint}
              empty={labels.grants.empty}
              add={labels.grants.add}
              count={draft.grants.length}
              limitIssue={limitIssue}
              disabled={locked}
              labels={labels}
              onAdd={add}
            >
              {draft.grants.map((row) => {
                const issue = issueFor(issues, 'grants', row.rowId, 'path')
                const issueId = `${control(row.rowId)}-issue`
                return (
                  <LumenCollectionItem key={row.rowId} className="hbar-sandbox-profiles-row">
                    <Cell kind="text">
                      <LumenInput
                        aria-label={labels.grants.path}
                        value={row.path}
                        placeholder={labels.grants.pathPlaceholder}
                        disabled={locked}
                        spellCheck={false}
                        {...described(issueId, issue)}
                        onChange={(event) => edit({ kind: 'grant', rowId: row.rowId, path: event.currentTarget.value })}
                      />
                    </Cell>
                    <Cell kind="choice">
                      <LumenSelect
                        aria-label={labels.grants.access}
                        value={row.access}
                        disabled={locked}
                        onChange={(event) => {
                          const access = accesses.find((value) => value === event.currentTarget.value)
                          if (access) edit({ kind: 'grant', rowId: row.rowId, access })
                        }}
                      >
                        {accesses.map((access) => (
                          <LumenOption key={access} value={access}>
                            {labels.accessOptions[access]}
                          </LumenOption>
                        ))}
                      </LumenSelect>
                    </Cell>
                    <LumenIconButton
                      label={labels.grants.remove(row.path)}
                      title={labels.grants.remove(row.path)}
                      disabled={locked}
                      onClick={() => edit({ kind: 'remove', section, rowId: row.rowId })}
                    >
                      <LumenIcon icon={Trash2} tier="sm" />
                    </LumenIconButton>
                    <RowIssue id={issueId} issue={issue} labels={labels} />
                  </LumenCollectionItem>
                )
              })}
            </RuleSection>
          )
        if (section === 'commands')
          return (
            <RuleSection
              key={section}
              section={section}
              title={labels.commands.title}
              hint={labels.commands.hint}
              warning={labels.commands.warning}
              empty={labels.commands.empty}
              add={labels.commands.add}
              count={draft.commands.length}
              limitIssue={limitIssue}
              disabled={locked}
              labels={labels}
              onAdd={add}
            >
              {draft.commands.map((row) => {
                const issue = issueFor(issues, 'commands', row.rowId, 'pattern')
                const issueId = `${control(row.rowId)}-issue`
                return (
                  <LumenCollectionItem key={row.rowId} className="hbar-sandbox-profiles-row">
                    <Cell kind="text">
                      <LumenInput
                        aria-label={labels.commands.pattern}
                        value={row.pattern}
                        placeholder={labels.commands.patternPlaceholder}
                        disabled={locked}
                        spellCheck={false}
                        {...described(issueId, issue)}
                        onChange={(event) =>
                          edit({ kind: 'command', rowId: row.rowId, pattern: event.currentTarget.value })
                        }
                      />
                    </Cell>
                    <Cell kind="choice">
                      <DecisionSelect
                        label={labels.commands.decision}
                        labels={labels}
                        value={row.decision}
                        disabled={locked}
                        onChange={(decision) => edit({ kind: 'command', rowId: row.rowId, decision })}
                      />
                    </Cell>
                    <LumenIconButton
                      label={labels.commands.remove(row.pattern)}
                      title={labels.commands.remove(row.pattern)}
                      disabled={locked}
                      onClick={() => edit({ kind: 'remove', section, rowId: row.rowId })}
                    >
                      <LumenIcon icon={Trash2} tier="sm" />
                    </LumenIconButton>
                    <RowIssue id={issueId} issue={issue} labels={labels} />
                  </LumenCollectionItem>
                )
              })}
            </RuleSection>
          )
        if (section === 'tools')
          return (
            <RuleSection
              key={section}
              section={section}
              title={labels.tools.title}
              hint={labels.tools.hint}
              empty={labels.tools.empty}
              add={labels.tools.add}
              count={draft.tools.length}
              limitIssue={limitIssue}
              disabled={locked}
              labels={labels}
              onAdd={add}
            >
              {draft.tools.map((row) => {
                const issue = issueFor(issues, 'tools', row.rowId, 'tool')
                const issueId = `${control(row.rowId)}-issue`
                return (
                  <LumenCollectionItem key={row.rowId} className="hbar-sandbox-profiles-row">
                    <Cell kind="text">
                      <LumenInput
                        aria-label={labels.tools.tool}
                        value={row.tool}
                        placeholder={labels.tools.toolPlaceholder}
                        disabled={locked}
                        spellCheck={false}
                        {...described(issueId, issue)}
                        onChange={(event) => edit({ kind: 'tool', rowId: row.rowId, tool: event.currentTarget.value })}
                      />
                    </Cell>
                    <Cell kind="choice">
                      <DecisionSelect
                        label={labels.tools.decision}
                        labels={labels}
                        value={row.decision}
                        disabled={locked}
                        onChange={(decision) => edit({ kind: 'tool', rowId: row.rowId, decision })}
                      />
                    </Cell>
                    <LumenIconButton
                      label={labels.tools.remove(row.tool)}
                      title={labels.tools.remove(row.tool)}
                      disabled={locked}
                      onClick={() => edit({ kind: 'remove', section, rowId: row.rowId })}
                    >
                      <LumenIcon icon={Trash2} tier="sm" />
                    </LumenIconButton>
                    <RowIssue id={issueId} issue={issue} labels={labels} />
                  </LumenCollectionItem>
                )
              })}
            </RuleSection>
          )
        return (
          <RuleSection
            key={section}
            section={section}
            title={labels.environment.title}
            hint={labels.environment.hint}
            empty={labels.environment.empty}
            add={labels.environment.add}
            count={draft.environment.length}
            limitIssue={limitIssue}
            disabled={locked}
            labels={labels}
            onAdd={add}
          >
            {draft.environment.map((row) => {
              const issue =
                issueFor(issues, 'environment', row.rowId, 'name') ??
                issueFor(issues, 'environment', row.rowId, 'value')
              const issueId = `${control(row.rowId)}-issue`
              return (
                <LumenCollectionItem key={row.rowId} className="hbar-sandbox-profiles-row">
                  <Cell kind="name">
                    <LumenInput
                      aria-label={labels.environment.name}
                      value={row.name}
                      placeholder={labels.environment.namePlaceholder}
                      disabled={locked}
                      spellCheck={false}
                      {...described(issueId, issue?.column === 'name' ? issue : undefined)}
                      onChange={(event) =>
                        edit({ kind: 'environment', rowId: row.rowId, name: event.currentTarget.value })
                      }
                    />
                  </Cell>
                  <Cell kind="text">
                    <LumenInput
                      aria-label={labels.environment.value}
                      value={row.value}
                      disabled={locked}
                      spellCheck={false}
                      {...described(issueId, issue?.column === 'value' ? issue : undefined)}
                      onChange={(event) =>
                        edit({ kind: 'environment', rowId: row.rowId, value: event.currentTarget.value })
                      }
                    />
                  </Cell>
                  <LumenIconButton
                    label={labels.environment.remove(row.name)}
                    title={labels.environment.remove(row.name)}
                    disabled={locked}
                    onClick={() => edit({ kind: 'remove', section, rowId: row.rowId })}
                  >
                    <LumenIcon icon={Trash2} tier="sm" />
                  </LumenIconButton>
                  <RowIssue id={issueId} issue={issue} labels={labels} />
                </LumenCollectionItem>
              )
            })}
          </RuleSection>
        )
      })}

      {(editor.resolved || editor.resolveError) && (
        <LumenFrame as="section" className="hbar-sandbox-profiles-section" aria-label={labels.effective.title}>
          <LumenText as="h4">{labels.effective.title}</LumenText>
          {editor.resolveError ? (
            <LumenText as="p" role="alert">
              {labels.effective.unresolved(editor.resolveError.message)}
            </LumenText>
          ) : (
            editor.resolved && (
              <>
                <LumenText as="p">
                  {labels.effective.chain(editor.resolved.chain.map((link) => nameOf(link.id)))}
                </LumenText>
                <LumenText as="p" tone="muted">
                  {labels.effective.summary({
                    escalation: labels.escalationOptions[editor.resolved.escalation],
                    fileDefault: labels.accessOptions[editor.resolved.filesystem.default],
                    network: editor.resolved.network.enabled
                      ? labels.networkOptions.enabled
                      : labels.networkOptions.disabled,
                  })}
                </LumenText>
                <LumenText as="p" tone="muted">
                  {labels.effective.rules({
                    grants: editor.resolved.filesystem.grants.length,
                    commands: editor.resolved.commands.rules.length,
                    tools: editor.resolved.tools.rules.length,
                    environment: Object.keys(editor.resolved.environment.set).length,
                  })}
                </LumenText>
              </>
            )
          )}
        </LumenFrame>
      )}
    </LumenFrame>
  )
}

function DecisionSelect({
  label,
  labels,
  value,
  disabled,
  onChange,
}: {
  readonly label: string
  readonly labels: HbarSandboxProfileSettingsLabels
  readonly value: SandboxDecision
  readonly disabled: boolean
  readonly onChange: (decision: SandboxDecision) => void
}) {
  return (
    <LumenSelect
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => {
        const decision = decisions.find((item) => item === event.currentTarget.value)
        if (decision) onChange(decision)
      }}
    >
      {decisions.map((decision) => (
        <LumenOption key={decision} value={decision}>
          {labels.decisionOptions[decision]}
        </LumenOption>
      ))}
    </LumenSelect>
  )
}

/**
 * Sandbox profile management. The profile list is content-grown (at most 64 stored profiles plus
 * built-ins) and rule rows are bounded by the profile limits; the settings pane owns page scroll.
 */
export function HbarSandboxProfilesView(props: HbarSandboxProfilesViewProps) {
  const { labels, connected, state, onRefresh, onOpen } = props
  const pending = state.editor && ['saving', 'deleting', 'unknown'].includes(state.editor.status)
  return (
    <LumenFrame as="section" className="hbar-sandbox-profiles" aria-label={labels.title}>
      <LumenFrame as="header" className="hbar-sandbox-profiles-header">
        <LumenFrame className="hbar-sandbox-profiles-section-intro">
          <LumenText as="h2">{labels.title}</LumenText>
          <LumenText as="p" tone="muted">
            {labels.description}
          </LumenText>
        </LumenFrame>
        <LumenButton
          type="button"
          variant="outlined"
          disabled={!connected || !state.available || state.list.status === 'loading'}
          onClick={onRefresh}
        >
          <LumenIcon icon={RefreshCw} tier="sm" />
          {labels.refresh}
        </LumenButton>
      </LumenFrame>
      {!state.available ? (
        <LumenText as="p" role="status">
          {labels.unavailable}
        </LumenText>
      ) : (
        <>
          {!connected && (
            <LumenText as="p" role="status">
              {labels.disconnected}
            </LumenText>
          )}
          <LumenFrame className="hbar-sandbox-profiles-body">
            <ProfileList labels={labels} state={state} disabled={!connected || Boolean(pending)} onOpen={onOpen} />
            {state.editor ? (
              <Editor {...props} editor={state.editor} />
            ) : (
              <LumenText as="p" tone="muted" className="hbar-sandbox-profiles-placeholder">
                {labels.noSelection}
              </LumenText>
            )}
          </LumenFrame>
        </>
      )}
    </LumenFrame>
  )
}

function code(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

export interface HbarSandboxProfileSettingsProps {
  readonly labels: HbarSandboxProfileSettingsLabels
  readonly connected: boolean
}

/** Runtime-bound page: forwards intents to `sandboxProfiles.*` commands and keeps feedback near the editor. */
export function HbarSandboxProfileSettings({ labels, connected }: HbarSandboxProfileSettingsProps) {
  const runtime = useHbarRuntime()
  const state = useHbarRuntimeState(runtime.state.sandboxProfiles)
  const [confirmation, setConfirmation] = useState<HbarSandboxConfirmation | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const listStatus = state.list.status
  useEffect(() => {
    if (connected && state.available && listStatus === 'idle')
      runtime.commands.execute('sandboxProfiles.refresh', {}).catch(() => undefined)
  }, [connected, listStatus, runtime, state.available])
  /** Report a command failure next to the editor; the runtime state carries every other outcome. */
  const report = (pending: Promise<unknown>) => {
    setActionError(null)
    pending.catch((reason: unknown) => setActionError(code(reason)))
  }
  const open = (target: HbarSandboxOpenTarget, discardDraft = false) => {
    if (state.editor?.dirty && !discardDraft) {
      setConfirmation({ kind: 'discard', target })
      return
    }
    setConfirmation(null)
    report(
      runtime.commands.execute('sandboxProfiles.open', { target, ...(discardDraft ? { discardDraft: true } : {}) }),
    )
  }
  return (
    <HbarSandboxProfilesView
      labels={labels}
      connected={connected}
      state={state}
      confirmation={confirmation}
      actionError={actionError}
      onRefresh={() => report(runtime.commands.execute('sandboxProfiles.refresh', {}))}
      onOpen={(target) => open(target)}
      onEdit={(editorId, edit) => report(runtime.commands.execute('sandboxProfiles.edit', { editorId, edit }))}
      onSave={(editorId) => report(runtime.commands.execute('sandboxProfiles.save', { editorId }))}
      onDiscard={(editorId) => report(runtime.commands.execute('sandboxProfiles.discard', { editorId }))}
      onReconcile={(editorId) => report(runtime.commands.execute('sandboxProfiles.reconcile', { editorId }))}
      onRequestDelete={(editorId, name) => setConfirmation({ kind: 'delete', editorId, name })}
      onConfirm={() => {
        const current = confirmation
        setConfirmation(null)
        if (current?.kind === 'discard') open(current.target, true)
        else if (current?.kind === 'delete')
          report(runtime.commands.execute('sandboxProfiles.delete', { editorId: current.editorId, confirm: true }))
      }}
      onCancelConfirmation={() => setConfirmation(null)}
    />
  )
}
