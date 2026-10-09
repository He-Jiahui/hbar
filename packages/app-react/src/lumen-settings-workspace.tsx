import { Suspense, useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  ChartNoAxesCombined,
  Cpu,
  Database,
  MessageSquare,
  Palette,
  Puzzle,
  Server,
  Settings,
  ShieldHalf,
  Sparkles,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react'
import { encodePath, type CompiledField, type FieldItemValue, type FieldValue } from '@hbar/schema-core'
import type { SettingsWorkspaceLayout, SettingsSnapshot } from '@hbar/contracts/commands/settings'
import {
  HbarSchemaForm,
  type HbarSchemaFormLabels,
  type SchemaComponentRegistry,
  type SchemaFieldIntent,
} from '@hbar/schema-react'
import {
  LumenFrame,
  LumenText,
  LumenButton,
  LumenIcon,
  LumenIconButton,
  LumenNavigationButton,
  LumenPageHeader,
  LumenPopupSelect,
  LumenSettingsForm01,
  LumenSettingsForm03,
  LumenSettingsForm05,
  LumenSettingsForm06,
} from '@lumen/app-ui'
import { workspaceDisplayName, type SettingsFormEntry } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { createHbarSchemaComponents } from './lumen-schema-components'
import {
  SettingsContentRecovery,
  useSettingsContentRecovery,
  type SettingsContentRecoveryLabels,
} from './settings-content-recovery'
import './lumen-settings-workspace.css'

const standardComponents = createHbarSchemaComponents()

type SettingApplyMode = NonNullable<SettingsFormEntry['description']>['fields'][number]['applyMode']

export interface HbarSettingsWorkspaceLabels {
  readonly pageTitle: string
  readonly title: (scope: SettingsFormEntry['scope']['kind'], targetName: string | null) => string
  readonly description: string
  readonly back: string
  readonly controls: string
  readonly scopes: string
  readonly hostScope: string
  readonly clientScope: string
  readonly mixedScope: string
  readonly global: string
  readonly workspace: string
  readonly session: string
  readonly scopeOption: (scope: SettingsFormEntry['scope']['kind'], targetName: string | null) => string
  readonly groups: string
  readonly loading: string
  readonly refresh: string
  readonly save: string
  readonly reconcile: string
  readonly saved: string
  readonly unsaved: (count: number) => string
  readonly restoreInheritance: string
  readonly localOverride: string
  readonly pendingInheritance: string
  readonly inheritedFrom: (source: string) => string
  readonly readOnly: string
  readonly applyMode: (mode: SettingApplyMode) => string
  readonly error: (code: string) => string
  readonly contentRecovery: SettingsContentRecoveryLabels
  readonly resolve: (key: string) => string
  readonly form: Omit<HbarSchemaFormLabels, 'resolve' | 'help'>
}

export interface HbarSettingsWorkspaceProps {
  readonly labels: HbarSettingsWorkspaceLabels
  readonly connected: boolean
  readonly components?: SchemaComponentRegistry
  readonly additionalGroups?: readonly HbarSettingsAdditionalGroup[]
  /** Short, host-owned navigation catalogue while the authoritative Settings description is loading.
   * Supplies labels only, never fields or permission to write. Duplicate IDs keep their first label. */
  readonly pendingGroups?: readonly HbarSettingsAdditionalGroup[]
  /** Presentation only: fixed-scope groups do not change the underlying layered form or its draft. */
  readonly groupPresentation?: readonly HbarSettingsGroupPresentation[]
  readonly layout?: SettingsWorkspaceLayout
  readonly renderGroup?: (groupId: string, context: HbarSettingsGroupContext) => ReactNode | HbarSettingsGroupContent
  readonly headerActions?: ReactNode
}

export interface HbarSettingsGroupContext {
  readonly instanceId: string | null
  readonly scope: SettingsSnapshot['scope'] | null
  readonly entry: SettingsFormEntry | undefined
  readonly form: ReactNode
  readonly renderFields: (names: readonly string[]) => ReactNode
  readonly saveArea: ReactNode
}
export interface HbarSettingsGroupContent {
  readonly content: ReactNode
  readonly saveArea: ReactNode
}
function groupContent(value: ReactNode | HbarSettingsGroupContent): value is HbarSettingsGroupContent {
  return value !== null && typeof value === 'object' && 'content' in value && 'saveArea' in value
}

export interface HbarSettingsAdditionalGroup {
  readonly id: string
  readonly label: string
  readonly order: number
}

export type HbarSettingsGroupIcon =
  | 'appearance'
  | 'model'
  | 'session'
  | 'providers'
  | 'sandbox'
  | 'extensions'
  | 'skills'
  | 'diagnostics'
  | 'usage'
  | 'settings'
  | 'database'

export interface HbarSettingsGroupPresentation {
  readonly id: string
  readonly icon: HbarSettingsGroupIcon
  readonly scope: 'layered' | 'host' | 'client' | 'mixed'
  /** Navigation order only; the Host description still owns form field order. */
  readonly order?: number
  readonly form?: 'standard' | 'preferences' | 'api' | 'danger' | undefined
}

const groupIcons = {
  appearance: Palette,
  model: Cpu,
  session: MessageSquare,
  providers: Server,
  extensions: Puzzle,
  skills: Sparkles,
  diagnostics: Stethoscope,
  usage: ChartNoAxesCombined,
  sandbox: ShieldHalf,
  settings: Settings,
  database: Database,
} satisfies Readonly<Record<HbarSettingsGroupIcon, LucideIcon>>

function reasonCode(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

function commandFieldValue(value: FieldValue): FieldItemValue | null | FieldItemValue[] {
  const multiple = value as readonly FieldItemValue[]
  return Array.isArray(value) ? Array.from(multiple) : (value as FieldItemValue | null)
}

export function HbarSettingsWorkspace({
  labels,
  connected,
  components = standardComponents,
  additionalGroups = [],
  pendingGroups = [],
  groupPresentation = [],
  layout = { alignment: 'start', width: 'standard', fields: 'stacked' },
  renderGroup,
  headerActions,
}: HbarSettingsWorkspaceProps) {
  const runtime = useHbarRuntime()
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const directory = useHbarRuntimeState(runtime.state.directory)
  const displayNames = useHbarRuntimeState(runtime.state.workspaceDisplayNameSnapshot)
  const settings = useHbarRuntimeState(runtime.state.settings)
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const [actionError, setActionError] = useState<string | null>(null)
  const entry = settings.activeFormId ? settings.forms[settings.activeFormId] : undefined
  const settingsPanel =
    presentation.page.kind === 'settings' ? surfaces.panels[presentation.page.instanceId] : undefined
  const workspaceId = settingsPanel?.binding === 'pinned' ? settingsPanel.workspaceId : navigation.workspaceId
  const sessionId = settingsPanel?.binding === 'pinned' ? settingsPanel.sessionId : navigation.sessionId
  const requestedSection =
    settingsPanel && typeof settingsPanel.params.section === 'string' ? settingsPanel.params.section : null
  const scopedWorkspace = entry?.scope.kind === 'workspace' ? directory.workspaces[entry.scope.targetId] : undefined
  const selectedTargetName = entry
    ? entry.scope.kind === 'global'
      ? null
      : entry.scope.kind === 'workspace'
        ? scopedWorkspace
          ? workspaceDisplayName(scopedWorkspace, displayNames)
          : null
        : (directory.sessions[entry.scope.targetId]?.title ?? null)
    : null
  const workspaceTarget = workspaceId ? directory.workspaces[workspaceId] : undefined
  const workspaceTargetName = workspaceTarget ? workspaceDisplayName(workspaceTarget, displayNames) : null
  const sessionTargetName = sessionId ? (directory.sessions[sessionId]?.title ?? null) : null
  const hostGroups = useMemo(
    () =>
      entry?.description
        ? [...entry.description.groups].sort(
            (left, right) => left.order - right.order || left.id.localeCompare(right.id),
          )
        : [],
    [entry?.description],
  )
  const clientGroups = useMemo(() => {
    const hostIds = new Set(hostGroups.map((group) => group.id))
    const seen = new Set<string>()
    return additionalGroups
      .filter((group) => {
        if (group.id.length === 0 || hostIds.has(group.id) || seen.has(group.id)) return false
        seen.add(group.id)
        return true
      })
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
  }, [additionalGroups, hostGroups])
  const groups = useMemo(() => {
    const navigationOrder = new Map<string, number>()
    for (const item of groupPresentation)
      if (item.order !== undefined && !navigationOrder.has(item.id)) navigationOrder.set(item.id, item.order)
    const known = [
      ...clientGroups.map((group) => ({ ...group, label: group.label })),
      ...hostGroups.map((group) => ({ ...group, label: labels.resolve(group.labelKey) })),
    ]
    if (!entry?.description) {
      const seen = new Set(known.map((group) => group.id))
      for (const group of pendingGroups) {
        if (!group.id || seen.has(group.id)) continue
        seen.add(group.id)
        known.push(group)
      }
    }
    return known.sort(
      (left, right) =>
        (navigationOrder.get(left.id) ?? left.order) - (navigationOrder.get(right.id) ?? right.order) ||
        left.id.localeCompare(right.id),
    )
  }, [clientGroups, entry?.description, groupPresentation, hostGroups, labels, pendingGroups])
  const activeClientGroup = clientGroups.find((group) => group.id === requestedSection)
  const pendingGroupId =
    !entry?.description && groups.some((group) => group.id === requestedSection) ? requestedSection : null
  const activeGroupId = activeClientGroup?.id ?? pendingGroupId ?? entry?.selectedGroup ?? null
  const presentationByGroup = useMemo(() => {
    const knownIds = new Set(groups.map((group) => group.id))
    const result = new Map<string, HbarSettingsGroupPresentation>()
    // The first known ID wins; stray metadata must not create navigation or change another group.
    for (const item of groupPresentation) if (knownIds.has(item.id) && !result.has(item.id)) result.set(item.id, item)
    return result
  }, [groupPresentation, groups])
  const scopePresentation = (activeGroupId ? presentationByGroup.get(activeGroupId)?.scope : undefined) ?? 'layered'
  const fixedScopeLabel =
    scopePresentation === 'host'
      ? labels.hostScope
      : scopePresentation === 'client'
        ? labels.clientScope
        : scopePresentation === 'mixed'
          ? labels.mixedScope
          : null
  const definitions = useMemo(
    () => new Map(entry?.description?.fields.map((field) => [encodePath(field.path), field] as const) ?? []),
    [entry?.description],
  )
  const fieldNames = useMemo(
    () =>
      entry?.description?.fields
        .filter((field) => field.group === entry.selectedGroup)
        .sort((left, right) => left.order - right.order || encodePath(left.path).localeCompare(encodePath(right.path)))
        .map((field) => encodePath(field.path)) ?? [],
    [entry?.description, entry?.selectedGroup],
  )
  const contentRecovery = useSettingsContentRecovery(entry, activeGroupId, fieldNames, connected)
  const formRecipe = activeGroupId ? presentationByGroup.get(activeGroupId)?.form : undefined
  const SettingsRecipe =
    formRecipe === 'api'
      ? LumenSettingsForm05
      : formRecipe === 'danger'
        ? LumenSettingsForm06
        : formRecipe === 'preferences'
          ? LumenSettingsForm03
          : LumenSettingsForm01

  const reportError = useCallback((reason: unknown) => setActionError(reasonCode(reason)), [])
  const openSettings = (scope: 'global' | 'workspace' | 'session', targetId: string | null, section: string | null) => {
    if (!settingsPanel) return null
    return runtime.commands.execute('app.openSettings', {
      scope,
      ...(targetId ? { targetId } : {}),
      ...(section ? { section } : {}),
      instanceId: settingsPanel.instanceId,
      binding: settingsPanel.binding,
      ...(settingsPanel.workspaceId ? { workspaceId: settingsPanel.workspaceId } : {}),
      ...(settingsPanel.sessionId ? { sessionId: settingsPanel.sessionId } : {}),
    })
  }
  const selectScope = (scope: 'global' | 'workspace' | 'session') => {
    setActionError(null)
    const request =
      scope === 'global'
        ? openSettings(scope, null, activeGroupId)
        : scope === 'workspace'
          ? workspaceId
            ? openSettings(scope, workspaceId, activeGroupId)
            : null
          : sessionId
            ? openSettings(scope, sessionId, activeGroupId)
            : null
    if (request) void request.catch(reportError)
  }
  const onScopeChange = (value: string) => selectScope(value as 'global' | 'workspace' | 'session')
  const dispatchIntent = (intent: SchemaFieldIntent) => {
    if (!entry) return
    setActionError(null)
    const request =
      intent.kind === 'set'
        ? runtime.commands.execute('settingsForm.setField', {
            formId: entry.formId,
            field: intent.field,
            value: commandFieldValue(intent.value),
          })
        : intent.kind === 'pick'
          ? runtime.commands.execute('settingsForm.pickResource', { formId: entry.formId, field: intent.field })
          : runtime.commands.execute('settingsForm.resetField', { formId: entry.formId, field: intent.field })
    void request.catch(reportError)
  }
  const runFormCommand = (command: 'refresh' | 'submit' | 'reconcile') => {
    if (!entry) return
    setActionError(null)
    void runtime.commands.execute(`settingsForm.${command}`, { formId: entry.formId }).catch(reportError)
  }
  const selectGroup = (groupId: string) => {
    if (!entry || !settingsPanel) return
    setActionError(null)
    const targetId = entry.scope.kind === 'global' ? null : entry.scope.targetId
    const request = openSettings(entry.scope.kind, targetId, groupId)
    if (request) void request.catch(reportError)
  }
  const restoreInheritance = (field: string) => {
    if (!entry) return
    setActionError(null)
    void runtime.commands.execute('settingsForm.restoreInheritance', { formId: entry.formId, field }).catch(reportError)
  }

  const dirtyCount = new Set([...(entry?.form?.dirty ?? []), ...Object.keys(entry?.unsets ?? {})]).size
  const busy = entry?.form?.status === 'submitting'
  const unknown = entry?.form?.status === 'unknown'
  const invalid = Boolean(entry?.form?.issues.length)
  const canRefresh = connected && Boolean(entry) && !busy && !unknown && dirtyCount === 0
  const canSave = connected && Boolean(entry) && !busy && !unknown && !invalid && dirtyCount > 0
  const selectedGroup = hostGroups.find((group) => group.id === activeGroupId)

  const fieldContext = (field: CompiledField) => {
    if (!entry) return null
    const definition = definitions.get(field.name)
    const report = entry.reports[field.name]
    if (!definition || !report) return null
    const source = Object.hasOwn(entry.unsets, field.name)
      ? labels.pendingInheritance
      : report.localPresence
        ? labels.localOverride
        : labels.inheritedFrom(report.sourceLayer)
    return (
      <LumenText as="span" className="hbar-schema-form-context">
        <LumenText as="small">{source}</LumenText>
        <LumenText as="small">{labels.applyMode(definition.applyMode)}</LumenText>
        {field.readOnly && <LumenText as="small">{labels.readOnly}</LumenText>}
      </LumenText>
    )
  }
  const fieldActions = (field: CompiledField) => {
    if (!entry) return null
    const canRestore =
      entry.scope.kind !== 'global' &&
      !field.readOnly &&
      !Object.hasOwn(entry.unsets, field.name) &&
      entry.reports[field.name]?.localPresence
    return (
      <>
        {contentRecovery.field === field.name && (
          <SettingsContentRecovery controller={contentRecovery} labels={labels.contentRecovery} />
        )}
        {canRestore && (
          <LumenText as="span" className="hbar-schema-form-actions">
            <LumenButton type="button" disabled={busy || unknown} onClick={() => restoreInheritance(field.name)}>
              {labels.restoreInheritance}
            </LumenButton>
          </LumenText>
        )}
      </>
    )
  }

  const renderFields = (names: readonly string[]) =>
    entry?.schema && entry.form ? (
      <SettingsRecipe
        slots={{
          content: (
            <HbarSchemaForm
              schema={entry.schema}
              state={entry.form}
              components={components}
              labels={{
                ...labels.form,
                resolve: labels.resolve,
                help: (field) => {
                  const key = definitions.get(field.name)?.helpKey
                  return key ? labels.resolve(key) : undefined
                },
              }}
              content={entry.content}
              disabled={busy || unknown || !connected}
              fieldNames={names}
              layout={layout.fields}
              renderFieldContext={fieldContext}
              renderFieldActions={fieldActions}
              onIntent={dispatchIntent}
            />
          ),
        }}
      />
    ) : null
  const saveArea = entry?.form ? (
    <LumenFrame as="footer" className="hbar-app-react-settings-footer">
      <LumenFrame className="hbar-app-react-settings-footer-inner">
        <LumenText as="span" role="status">
          {entry.receipt ? labels.saved : dirtyCount > 0 ? labels.unsaved(dirtyCount) : null}
        </LumenText>
        <LumenFrame>
          <LumenButton disabled={!canRefresh} onClick={() => runFormCommand('refresh')}>
            {labels.refresh}
          </LumenButton>
          {unknown ? (
            <LumenButton tone="warning" disabled={!connected} onClick={() => runFormCommand('reconcile')}>
              {labels.reconcile}
            </LumenButton>
          ) : (
            <LumenButton tone="primary" disabled={!canSave} onClick={() => runFormCommand('submit')}>
              {labels.save}
            </LumenButton>
          )}
        </LumenFrame>
      </LumenFrame>
    </LumenFrame>
  ) : null
  const renderedGroup = activeGroupId
    ? renderGroup?.(activeGroupId, {
        instanceId: settingsPanel?.instanceId ?? null,
        scope: entry?.scope ?? null,
        entry,
        form: renderFields(fieldNames),
        renderFields,
        saveArea,
      })
    : null
  const renderedContent = renderedGroup && groupContent(renderedGroup) ? renderedGroup : null
  const customGroup = renderedGroup && groupContent(renderedGroup) ? renderedGroup.content : renderedGroup
  const suspendedCustomGroup = customGroup ? (
    <Suspense
      fallback={
        <LumenText as="p" className="hbar-app-react-settings-state" role="status">
          {labels.loading}
        </LumenText>
      }
    >
      {renderedContent ? renderedContent.content : customGroup}
    </Suspense>
  ) : null
  const localCustomGroup = (scopePresentation === 'client' || scopePresentation === 'mixed') && customGroup

  return (
    <LumenFrame
      as="section"
      className="hbar-app-react-settings-workspace"
      data-settings-alignment={layout.alignment}
      data-settings-width={layout.width}
    >
      <LumenPageHeader
        title={labels.pageTitle}
        context={fixedScopeLabel === null ? labels.title(entry?.scope.kind ?? 'global', selectedTargetName) : undefined}
        leading={
          <LumenIconButton
            label={labels.back}
            onClick={() => void runtime.commands.execute('app.back', {}).catch(reportError)}
          >
            <LumenIcon icon={ArrowLeft} tier="sm" />
          </LumenIconButton>
        }
        actionsLabel={labels.controls}
        actions={
          <LumenFrame className="hbar-app-react-settings-header-controls">
            {fixedScopeLabel === null ? (
              <LumenPopupSelect
                id="hbar-settings-scope"
                className="hbar-app-react-settings-scope"
                aria-label={labels.scopes}
                value={entry?.scope.kind ?? 'global'}
                options={[
                  { id: 'global', label: labels.scopeOption('global', null) },
                  {
                    id: 'workspace',
                    label: labels.scopeOption('workspace', workspaceTargetName),
                    disabled: !workspaceId,
                  },
                  { id: 'session', label: labels.scopeOption('session', sessionTargetName), disabled: !sessionId },
                ]}
                onValueChange={onScopeChange}
              />
            ) : (
              <LumenText as="span" className="hbar-app-react-settings-fixed-scope" tone="muted" variant="supporting">
                {fixedScopeLabel}
              </LumenText>
            )}
            {headerActions}
          </LumenFrame>
        }
      />

      <LumenFrame className="hbar-app-react-settings-layout">
        <LumenFrame as="nav" className="hbar-app-react-settings-groups" aria-label={labels.groups}>
          {groups.map((group) => (
            <LumenNavigationButton
              key={group.id}
              data-settings-group={group.id}
              size="s"
              selected={activeGroupId === group.id}
              onClick={() => selectGroup(group.id)}
            >
              <LumenIcon icon={groupIcons[presentationByGroup.get(group.id)?.icon ?? 'settings']} tier="md" />
              <LumenText as="span" className="hbar-app-react-settings-group-label">
                {group.label}
              </LumenText>
            </LumenNavigationButton>
          ))}
        </LumenFrame>
        <LumenFrame as="main" className="hbar-app-react-settings-main">
          <LumenFrame className="hbar-app-react-settings-mobile-group">
            <LumenPopupSelect
              id="hbar-settings-group"
              aria-label={labels.groups}
              value={activeGroupId ?? ''}
              selectedLabel={groups.find((group) => group.id === activeGroupId)?.label ?? activeGroupId ?? undefined}
              options={groups.map((group) => ({ id: group.id, label: group.label }))}
              onValueChange={selectGroup}
            />
          </LumenFrame>
          {localCustomGroup ? (
            <LumenFrame className="hbar-app-react-settings-scroll">
              <LumenFrame className="hbar-app-react-settings-content">{suspendedCustomGroup}</LumenFrame>
            </LumenFrame>
          ) : !entry || entry.status === 'loading' ? (
            <LumenText as="p" className="hbar-app-react-settings-state" role="status">
              {labels.loading}
            </LumenText>
          ) : entry.status === 'error' || !entry.description || !entry.schema || !entry.form ? (
            <LumenFrame className="hbar-app-react-settings-state">
              <LumenText as="p" role="alert">
                {labels.error(entry.error ?? 'FORM_NOT_READY')}
              </LumenText>
              <LumenButton disabled={!connected} onClick={() => runFormCommand('refresh')}>
                {labels.refresh}
              </LumenButton>
            </LumenFrame>
          ) : (
            <>
              {!customGroup && selectedGroup && (
                <LumenFrame as="header" className="hbar-app-react-settings-content-header">
                  <LumenText as="h2">{labels.resolve(selectedGroup.labelKey)}</LumenText>
                  <LumenText as="p">{labels.description}</LumenText>
                </LumenFrame>
              )}
              <LumenFrame className="hbar-app-react-settings-scroll">
                <LumenFrame className="hbar-app-react-settings-content">
                  {suspendedCustomGroup ?? renderFields(fieldNames)}
                </LumenFrame>
              </LumenFrame>
              {renderedContent ? renderedContent.saveArea : !customGroup ? saveArea : null}
            </>
          )}
        </LumenFrame>
      </LumenFrame>
      {(actionError || (entry?.status === 'ready' && entry.error)) && (
        <LumenText as="p" role="alert">
          {labels.error(actionError ?? entry?.error ?? 'EXECUTION_FAILED')}
        </LumenText>
      )}
    </LumenFrame>
  )
}
