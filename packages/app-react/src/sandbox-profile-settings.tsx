import { useEffect, useId, useState, type ReactNode } from 'react'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import {
  LumenContentText,
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenFormField,
  LumenFrame,
  LumenIcon,
  LumenIconButton,
  LumenInput,
  LumenNavigationButton,
  LumenPopupSelect,
  LumenText,
  LumenTextarea,
} from '@lumen/app-ui'
import type { LumenControlOption } from '@lumen/app-ui'
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
import { createMessageScope } from './messages'
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

type SandboxPageMessages = Pick<
  HbarSandboxProfileSettingsLabels,
  'title' | 'description' | 'refresh' | 'unavailable' | 'disconnected' | 'noSelection'
>
type SandboxListMessages = Pick<
  HbarSandboxProfileSettingsLabels,
  'profiles' | 'create' | 'loading' | 'listError' | 'profileName' | 'builtin'
>
type SandboxEditorMessages = Pick<
  HbarSandboxProfileSettingsLabels,
  | 'newTitle'
  | 'profileName'
  | 'missing'
  | 'discardConfirm'
  | 'confirmDiscard'
  | 'cancel'
  | 'revision'
  | 'readonlyHint'
  | 'createFrom'
  | 'saving'
  | 'retry'
  | 'save'
  | 'discard'
  | 'delete'
  | 'deleting'
  | 'editorLoading'
  | 'saved'
  | 'unknown'
  | 'reconcile'
  | 'conflict'
  | 'reload'
  | 'error'
  | 'deleteConfirm'
  | 'confirmDelete'
  | 'fields'
  | 'inherit'
  | 'escalationOptions'
  | 'accessOptions'
  | 'networkOptions'
  | 'osConfinementModeOptions'
  | 'effective'
>
type SandboxIssueMessages = Pick<HbarSandboxProfileSettingsLabels, 'issue'>
type SandboxDecisionMessages = Pick<HbarSandboxProfileSettingsLabels, 'decisionOptions'>
type SandboxRuleMessageKey = 'grantsRule' | 'commandsRule' | 'toolsRule' | 'environmentRule'
interface HbarSandboxProfileSettingsMessages {
  readonly page: SandboxPageMessages
  readonly list: SandboxListMessages
  readonly editor: SandboxEditorMessages
  readonly issue: SandboxIssueMessages
  readonly decision: SandboxDecisionMessages
  readonly grants: Pick<HbarSandboxProfileSettingsLabels, 'grants'>
  readonly commands: Pick<HbarSandboxProfileSettingsLabels, 'commands'>
  readonly tools: Pick<HbarSandboxProfileSettingsLabels, 'tools'>
  readonly environment: Pick<HbarSandboxProfileSettingsLabels, 'environment'>
  readonly grantsRule: Pick<HbarSandboxProfileSettingsLabels['grants'], 'title' | 'hint' | 'empty' | 'add'>
  readonly commandsRule: Pick<
    HbarSandboxProfileSettingsLabels['commands'],
    'title' | 'hint' | 'warning' | 'empty' | 'add'
  >
  readonly toolsRule: Pick<HbarSandboxProfileSettingsLabels['tools'], 'title' | 'hint' | 'empty' | 'add'>
  readonly environmentRule: Pick<HbarSandboxProfileSettingsLabels['environment'], 'title' | 'hint' | 'empty' | 'add'>
}
export const HbarSandboxProfileSettingsMessageScope = createMessageScope<HbarSandboxProfileSettingsMessages>()

function sandboxMessages(labels: HbarSandboxProfileSettingsLabels): HbarSandboxProfileSettingsMessages {
  return {
    page: {
      title: labels.title,
      description: labels.description,
      refresh: labels.refresh,
      unavailable: labels.unavailable,
      disconnected: labels.disconnected,
      noSelection: labels.noSelection,
    },
    list: {
      profiles: labels.profiles,
      create: labels.create,
      loading: labels.loading,
      listError: labels.listError,
      profileName: labels.profileName,
      builtin: labels.builtin,
    },
    editor: {
      newTitle: labels.newTitle,
      profileName: labels.profileName,
      missing: labels.missing,
      discardConfirm: labels.discardConfirm,
      confirmDiscard: labels.confirmDiscard,
      cancel: labels.cancel,
      revision: labels.revision,
      readonlyHint: labels.readonlyHint,
      createFrom: labels.createFrom,
      saving: labels.saving,
      retry: labels.retry,
      save: labels.save,
      discard: labels.discard,
      delete: labels.delete,
      deleting: labels.deleting,
      editorLoading: labels.editorLoading,
      saved: labels.saved,
      unknown: labels.unknown,
      reconcile: labels.reconcile,
      conflict: labels.conflict,
      reload: labels.reload,
      error: labels.error,
      deleteConfirm: labels.deleteConfirm,
      confirmDelete: labels.confirmDelete,
      fields: labels.fields,
      inherit: labels.inherit,
      escalationOptions: labels.escalationOptions,
      accessOptions: labels.accessOptions,
      networkOptions: labels.networkOptions,
      osConfinementModeOptions: labels.osConfinementModeOptions,
      effective: labels.effective,
    },
    issue: { issue: labels.issue },
    decision: { decisionOptions: labels.decisionOptions },
    grants: { grants: labels.grants },
    commands: { commands: labels.commands },
    tools: { tools: labels.tools },
    environment: { environment: labels.environment },
    grantsRule: {
      title: labels.grants.title,
      hint: labels.grants.hint,
      empty: labels.grants.empty,
      add: labels.grants.add,
    },
    commandsRule: {
      title: labels.commands.title,
      hint: labels.commands.hint,
      warning: labels.commands.warning,
      empty: labels.commands.empty,
      add: labels.commands.add,
    },
    toolsRule: {
      title: labels.tools.title,
      hint: labels.tools.hint,
      empty: labels.tools.empty,
      add: labels.tools.add,
    },
    environmentRule: {
      title: labels.environment.title,
      hint: labels.environment.hint,
      empty: labels.environment.empty,
      add: labels.environment.add,
    },
  }
}

function SandboxMessagesProvider({
  labels,
  children,
}: {
  readonly labels: HbarSandboxProfileSettingsLabels
  readonly children: ReactNode
}) {
  return (
    <HbarSandboxProfileSettingsMessageScope.Provider messages={sandboxMessages(labels)}>
      {children}
    </HbarSandboxProfileSettingsMessageScope.Provider>
  )
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
  state,
  disabled,
  onOpen,
}: {
  readonly state: SandboxProfilesState
  readonly disabled: boolean
  readonly onOpen: (target: HbarSandboxOpenTarget) => void
}) {
  const { t } = HbarSandboxProfileSettingsMessageScope.useMessages()
  const labels = t('list')
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
        <LumenContentText context="feedback.message" role="status" tone="muted">
          {labels.loading}
        </LumenContentText>
      )}
      {state.list.error && (
        <LumenContentText context="feedback.message" role="alert">
          {labels.listError(state.list.error)}
        </LumenContentText>
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
              <LumenContentText context="control.label" className="hbar-sandbox-profiles-item-name">
                {labels.profileName(profile)}
              </LumenContentText>
              <LumenContentText context="choice.description" tone="muted">
                {profile.builtin ? labels.builtin : profile.id}
              </LumenContentText>
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

function RowIssue({ id, issue }: { readonly id: string; readonly issue: SandboxDraftIssue | undefined }) {
  const { t } = HbarSandboxProfileSettingsMessageScope.useMessages()
  const labels = t('issue')
  if (!issue) return null
  return (
    <LumenContentText context="form.help" id={id} tone="danger" className="hbar-sandbox-profiles-issue">
      {labels.issue(issue)}
    </LumenContentText>
  )
}

function RuleSection({
  section,
  messageKey,
  count,
  limitIssue,
  disabled,
  onAdd,
  children,
}: {
  readonly section: SandboxDraftSection
  readonly messageKey: SandboxRuleMessageKey
  readonly count: number
  readonly limitIssue: SandboxDraftIssue | undefined
  readonly disabled: boolean
  readonly onAdd: () => void
  readonly children: ReactNode
}) {
  const { t } = HbarSandboxProfileSettingsMessageScope.useMessages()
  const labels = t(messageKey)
  const issueLabels = t('issue')
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
            {labels.title}
          </LumenText>
          <LumenContentText context="form.description" tone="muted">
            {labels.hint}
          </LumenContentText>
          {'warning' in labels && labels.warning && (
            <LumenContentText context="form.description" className="hbar-sandbox-profiles-warning">
              {labels.warning}
            </LumenContentText>
          )}
        </LumenFrame>
        <LumenButton type="button" variant="outlined" disabled={disabled} onClick={onAdd}>
          <LumenIcon icon={Plus} tier="sm" />
          {labels.add}
        </LumenButton>
      </LumenFrame>
      {limitIssue && (
        <LumenContentText context="feedback.message" role="alert">
          {issueLabels.issue(limitIssue)}
        </LumenContentText>
      )}
      {count === 0 ? (
        <LumenContentText context="form.description" tone="muted">
          {labels.empty}
        </LumenContentText>
      ) : (
        <LumenCollection className="hbar-sandbox-profiles-rows">{children}</LumenCollection>
      )}
    </LumenFrame>
  )
}

function Editor({
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
}: Omit<HbarSandboxProfilesViewProps, 'labels' | 'onRefresh' | 'state'> & {
  readonly state: SandboxProfilesState
  readonly editor: SandboxProfileEditorState
}) {
  const { t } = HbarSandboxProfileSettingsMessageScope.useMessages()
  const labels = t('editor')
  const issueLabels = t('issue')
  const grants = t('grants').grants
  const commands = t('commands').commands
  const tools = t('tools').tools
  const environment = t('environment').environment
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
        <LumenContentText context="feedback.message" role="alert">
          {labels.missing}
        </LumenContentText>
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
          <LumenContentText context="form.description">{labels.discardConfirm}</LumenContentText>
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
          <LumenContentText context="section.subtitle">{heading}</LumenContentText>
          {editor.revision !== null && editor.mode === 'edit' && (
            <LumenContentText context="form.help" tone="muted">
              {labels.revision(editor.revision)}
            </LumenContentText>
          )}
          {editor.mode === 'readonly' && editor.status !== 'loading' && (
            <LumenContentText context="form.description" tone="muted">
              {labels.readonlyHint}
            </LumenContentText>
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
          <LumenContentText context="feedback.message" role="status" tone="muted">
            {labels.editorLoading}
          </LumenContentText>
        )}
        {editor.status === 'saving' && (
          <LumenContentText context="feedback.message" role="status">
            {labels.saving}
          </LumenContentText>
        )}
        {editor.saved && editor.status === 'ready' && !editor.dirty && (
          <LumenContentText context="feedback.message" role="status">
            {labels.saved}
          </LumenContentText>
        )}
        {editor.status === 'unknown' && editor.pending && (
          <LumenFrame className="hbar-sandbox-profiles-recovery">
            <LumenContentText context="feedback.message" role="alert">
              {labels.unknown(editor.pending)}
            </LumenContentText>
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
            <LumenContentText context="feedback.message" role="alert">
              {labels.conflict}
            </LumenContentText>
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
          <LumenContentText context="feedback.message" role="alert">
            {labels.error(editor.error)}
          </LumenContentText>
        )}
        {actionError && editor.status !== 'failed' && editor.status !== 'unknown' && (
          <LumenContentText context="feedback.message" role="alert">
            {labels.error(actionError)}
          </LumenContentText>
        )}
        {confirmation?.kind === 'delete' && confirmation.editorId === editor.editorId && (
          <LumenFrame
            className="hbar-sandbox-profiles-confirm"
            role="alertdialog"
            aria-label={labels.deleteConfirm(confirmation.name)}
          >
            <LumenContentText context="form.description">{labels.deleteConfirm(confirmation.name)}</LumenContentText>
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
          error={idIssue ? issueLabels.issue(idIssue) : undefined}
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
          error={nameIssue ? issueLabels.issue(nameIssue) : undefined}
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
          error={extendsIssue ? issueLabels.issue(extendsIssue) : undefined}
        >
          <LumenPopupSelect
            id={control('extends')}
            value={draft.extends ?? INHERIT}
            disabled={locked}
            options={[
              { id: INHERIT, label: labels.fields.noParent },
              ...(!parentListed && draft.extends
                ? [{ id: draft.extends, label: labels.fields.unknownParent(draft.extends) }]
                : []),
              ...parents.map((profile): LumenControlOption => ({ id: profile.id, label: labels.profileName(profile) })),
            ]}
            onValueChange={(value) => edit({ kind: 'extends', value: value || null })}
          />
        </LumenFormField>
        <LumenFormField
          controlId={control('escalation')}
          label={labels.fields.escalation}
          hint={labels.fields.escalationHint}
        >
          <LumenPopupSelect
            id={control('escalation')}
            value={draft.escalation ?? INHERIT}
            disabled={locked}
            options={[
              { id: INHERIT, label: labels.inherit },
              { id: 'ask', label: labels.escalationOptions.ask },
              { id: 'deny', label: labels.escalationOptions.deny },
            ]}
            onValueChange={(value) => {
              edit({ kind: 'escalation', value: value === 'ask' || value === 'deny' ? value : null })
            }}
          />
        </LumenFormField>
        <LumenFormField controlId={control('fileDefault')} label={labels.fields.fileDefault}>
          <LumenPopupSelect
            id={control('fileDefault')}
            value={draft.fileDefault ?? INHERIT}
            disabled={locked}
            options={[
              { id: INHERIT, label: labels.inherit },
              ...accesses.map((access) => ({ id: access, label: labels.accessOptions[access] })),
            ]}
            onValueChange={(value) => {
              const access = accesses.find((item) => item === value)
              edit({ kind: 'fileDefault', value: access ?? null })
            }}
          />
        </LumenFormField>
        <LumenFormField controlId={control('network')} label={labels.fields.network}>
          <LumenPopupSelect
            id={control('network')}
            value={draft.network === null ? INHERIT : draft.network ? 'enabled' : 'disabled'}
            disabled={locked}
            options={[
              { id: INHERIT, label: labels.inherit },
              { id: 'enabled', label: labels.networkOptions.enabled },
              { id: 'disabled', label: labels.networkOptions.disabled },
            ]}
            onValueChange={(value) => {
              edit({ kind: 'network', value: value === 'enabled' ? true : value === 'disabled' ? false : null })
            }}
          />
        </LumenFormField>
        <LumenFormField
          controlId={control('osConfinement-enabled')}
          label={labels.fields.osConfinement}
          hint={labels.fields.osConfinementHint}
        >
          <LumenPopupSelect
            id={control('osConfinement-enabled')}
            value={draft.osConfinement == null ? INHERIT : draft.osConfinement.enabled ? 'enabled' : 'disabled'}
            disabled={locked}
            options={[
              { id: INHERIT, label: labels.inherit },
              { id: 'enabled', label: labels.networkOptions.enabled },
              { id: 'disabled', label: labels.networkOptions.disabled },
            ]}
            onValueChange={(value) => {
              if (value === INHERIT) {
                edit({ kind: 'osConfinement', value: null })
              } else {
                const mode = draft.osConfinement?.mode ?? 'unelevated'
                edit({ kind: 'osConfinement', value: { enabled: value === 'enabled', mode } })
              }
            }}
          />
        </LumenFormField>
        {draft.osConfinement != null && (
          <LumenFormField controlId={control('osConfinement-mode')} label={labels.fields.osConfinementMode}>
            <LumenPopupSelect
              id={control('osConfinement-mode')}
              value={draft.osConfinement.mode}
              disabled={locked}
              options={[
                { id: 'unelevated', label: labels.osConfinementModeOptions.unelevated },
                { id: 'elevated', label: labels.osConfinementModeOptions.elevated },
              ]}
              onValueChange={(value) => {
                const mode = value === 'elevated' ? 'elevated' : 'unelevated'
                const enabled = draft.osConfinement?.enabled ?? true
                edit({ kind: 'osConfinement', value: { enabled, mode } })
              }}
            />
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
              messageKey="grantsRule"
              count={draft.grants.length}
              limitIssue={limitIssue}
              disabled={locked}
              onAdd={add}
            >
              {draft.grants.map((row) => {
                const issue = issueFor(issues, 'grants', row.rowId, 'path')
                const issueId = `${control(row.rowId)}-issue`
                return (
                  <LumenCollectionItem key={row.rowId} className="hbar-sandbox-profiles-row">
                    <Cell kind="text">
                      <LumenInput
                        aria-label={grants.path}
                        value={row.path}
                        placeholder={grants.pathPlaceholder}
                        disabled={locked}
                        spellCheck={false}
                        {...described(issueId, issue)}
                        onChange={(event) => edit({ kind: 'grant', rowId: row.rowId, path: event.currentTarget.value })}
                      />
                    </Cell>
                    <Cell kind="choice">
                      <LumenPopupSelect
                        aria-label={grants.access}
                        value={row.access}
                        disabled={locked}
                        options={accesses.map((access) => ({ id: access, label: labels.accessOptions[access] }))}
                        onValueChange={(value) => {
                          const access = accesses.find((item) => item === value)
                          if (access) edit({ kind: 'grant', rowId: row.rowId, access })
                        }}
                      />
                    </Cell>
                    <LumenFrame className="hbar-sandbox-profiles-row-actions">
                      <LumenIconButton
                        label={grants.remove(row.path)}
                        title={grants.remove(row.path)}
                        disabled={locked}
                        onClick={() => edit({ kind: 'remove', section, rowId: row.rowId })}
                      >
                        <LumenIcon icon={Trash2} tier="sm" />
                      </LumenIconButton>
                    </LumenFrame>
                    <RowIssue id={issueId} issue={issue} />
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
              messageKey="commandsRule"
              count={draft.commands.length}
              limitIssue={limitIssue}
              disabled={locked}
              onAdd={add}
            >
              {draft.commands.map((row) => {
                const issue = issueFor(issues, 'commands', row.rowId, 'pattern')
                const issueId = `${control(row.rowId)}-issue`
                return (
                  <LumenCollectionItem key={row.rowId} className="hbar-sandbox-profiles-row">
                    <Cell kind="text">
                      <LumenInput
                        aria-label={commands.pattern}
                        value={row.pattern}
                        placeholder={commands.patternPlaceholder}
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
                        label={commands.decision}
                        value={row.decision}
                        disabled={locked}
                        onChange={(decision) => edit({ kind: 'command', rowId: row.rowId, decision })}
                      />
                    </Cell>
                    <LumenFrame className="hbar-sandbox-profiles-row-actions">
                      <LumenIconButton
                        label={commands.remove(row.pattern)}
                        title={commands.remove(row.pattern)}
                        disabled={locked}
                        onClick={() => edit({ kind: 'remove', section, rowId: row.rowId })}
                      >
                        <LumenIcon icon={Trash2} tier="sm" />
                      </LumenIconButton>
                    </LumenFrame>
                    <RowIssue id={issueId} issue={issue} />
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
              messageKey="toolsRule"
              count={draft.tools.length}
              limitIssue={limitIssue}
              disabled={locked}
              onAdd={add}
            >
              {draft.tools.map((row) => {
                const issue = issueFor(issues, 'tools', row.rowId, 'tool')
                const issueId = `${control(row.rowId)}-issue`
                return (
                  <LumenCollectionItem key={row.rowId} className="hbar-sandbox-profiles-row">
                    <Cell kind="text">
                      <LumenInput
                        aria-label={tools.tool}
                        value={row.tool}
                        placeholder={tools.toolPlaceholder}
                        disabled={locked}
                        spellCheck={false}
                        {...described(issueId, issue)}
                        onChange={(event) => edit({ kind: 'tool', rowId: row.rowId, tool: event.currentTarget.value })}
                      />
                    </Cell>
                    <Cell kind="choice">
                      <DecisionSelect
                        label={tools.decision}
                        value={row.decision}
                        disabled={locked}
                        onChange={(decision) => edit({ kind: 'tool', rowId: row.rowId, decision })}
                      />
                    </Cell>
                    <LumenFrame className="hbar-sandbox-profiles-row-actions">
                      <LumenIconButton
                        label={tools.remove(row.tool)}
                        title={tools.remove(row.tool)}
                        disabled={locked}
                        onClick={() => edit({ kind: 'remove', section, rowId: row.rowId })}
                      >
                        <LumenIcon icon={Trash2} tier="sm" />
                      </LumenIconButton>
                    </LumenFrame>
                    <RowIssue id={issueId} issue={issue} />
                  </LumenCollectionItem>
                )
              })}
            </RuleSection>
          )
        return (
          <RuleSection
            key={section}
            section={section}
            messageKey="environmentRule"
            count={draft.environment.length}
            limitIssue={limitIssue}
            disabled={locked}
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
                      aria-label={environment.name}
                      value={row.name}
                      placeholder={environment.namePlaceholder}
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
                      aria-label={environment.value}
                      value={row.value}
                      disabled={locked}
                      spellCheck={false}
                      {...described(issueId, issue?.column === 'value' ? issue : undefined)}
                      onChange={(event) =>
                        edit({ kind: 'environment', rowId: row.rowId, value: event.currentTarget.value })
                      }
                    />
                  </Cell>
                  <LumenFrame className="hbar-sandbox-profiles-row-actions">
                    <LumenIconButton
                      label={environment.remove(row.name)}
                      title={environment.remove(row.name)}
                      disabled={locked}
                      onClick={() => edit({ kind: 'remove', section, rowId: row.rowId })}
                    >
                      <LumenIcon icon={Trash2} tier="sm" />
                    </LumenIconButton>
                  </LumenFrame>
                  <RowIssue id={issueId} issue={issue} />
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
            <LumenContentText context="feedback.message" role="alert">
              {labels.effective.unresolved(editor.resolveError.message)}
            </LumenContentText>
          ) : (
            editor.resolved && (
              <>
                <LumenContentText context="form.description">
                  {labels.effective.chain(editor.resolved.chain.map((link) => nameOf(link.id)))}
                </LumenContentText>
                <LumenContentText context="form.description" tone="muted">
                  {labels.effective.summary({
                    escalation: labels.escalationOptions[editor.resolved.escalation],
                    fileDefault: labels.accessOptions[editor.resolved.filesystem.default],
                    network: editor.resolved.network.enabled
                      ? labels.networkOptions.enabled
                      : labels.networkOptions.disabled,
                  })}
                </LumenContentText>
                <LumenContentText context="form.description" tone="muted">
                  {labels.effective.rules({
                    grants: editor.resolved.filesystem.grants.length,
                    commands: editor.resolved.commands.rules.length,
                    tools: editor.resolved.tools.rules.length,
                    environment: Object.keys(editor.resolved.environment.set).length,
                  })}
                </LumenContentText>
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
  value,
  disabled,
  onChange,
}: {
  readonly label: string
  readonly value: SandboxDecision
  readonly disabled: boolean
  readonly onChange: (decision: SandboxDecision) => void
}) {
  const { t } = HbarSandboxProfileSettingsMessageScope.useMessages()
  const labels = t('decision')
  return (
    <LumenPopupSelect
      aria-label={label}
      value={value}
      disabled={disabled}
      options={decisions.map((decision) => ({ id: decision, label: labels.decisionOptions[decision] }))}
      onValueChange={(selected) => {
        const decision = decisions.find((item) => item === selected)
        if (decision) onChange(decision)
      }}
    />
  )
}

/**
 * Sandbox profile management. The profile list is content-grown (at most 64 stored profiles plus
 * built-ins) and rule rows are bounded by the profile limits; the settings pane owns page scroll.
 */
function HbarSandboxProfilesViewContent(props: Omit<HbarSandboxProfilesViewProps, 'labels'>) {
  const { t } = HbarSandboxProfileSettingsMessageScope.useMessages()
  const labels = t('page')
  const { connected, state, onRefresh, onOpen } = props
  const pending = state.editor && ['saving', 'deleting', 'unknown'].includes(state.editor.status)
  return (
    <LumenFrame as="section" className="hbar-sandbox-profiles" aria-label={labels.title}>
      <LumenFrame as="header" className="hbar-sandbox-profiles-header">
        <LumenFrame className="hbar-sandbox-profiles-section-intro">
          <LumenContentText context="section.title">{labels.title}</LumenContentText>
          <LumenContentText context="form.description" tone="muted">
            {labels.description}
          </LumenContentText>
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
        <LumenContentText context="feedback.message" role="status">
          {labels.unavailable}
        </LumenContentText>
      ) : (
        <>
          {!connected && (
            <LumenContentText context="feedback.message" role="status">
              {labels.disconnected}
            </LumenContentText>
          )}
          <LumenFrame className="hbar-sandbox-profiles-body">
            <ProfileList state={state} disabled={!connected || Boolean(pending)} onOpen={onOpen} />
            {state.editor ? (
              <Editor {...props} editor={state.editor} />
            ) : (
              <LumenContentText context="form.description" tone="muted" className="hbar-sandbox-profiles-placeholder">
                {labels.noSelection}
              </LumenContentText>
            )}
          </LumenFrame>
        </>
      )}
    </LumenFrame>
  )
}

export function HbarSandboxProfilesView(props: HbarSandboxProfilesViewProps) {
  const { labels, ...viewProps } = props
  return (
    <SandboxMessagesProvider labels={labels}>
      <HbarSandboxProfilesViewContent {...viewProps} />
    </SandboxMessagesProvider>
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
function HbarSandboxProfileSettingsContent({ connected }: Omit<HbarSandboxProfileSettingsProps, 'labels'>) {
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
    <HbarSandboxProfilesViewContent
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

export function HbarSandboxProfileSettings({ labels, connected }: HbarSandboxProfileSettingsProps) {
  return (
    <SandboxMessagesProvider labels={labels}>
      <HbarSandboxProfileSettingsContent connected={connected} />
    </SandboxMessagesProvider>
  )
}
