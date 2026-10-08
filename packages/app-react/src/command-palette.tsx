import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ArrowLeft, RefreshCw, X } from 'lucide-react'
import {
  LumenCollection,
  LumenFrame,
  LumenContentText,
  LumenButton,
  LumenCheckBox,
  LumenCommandList,
  LumenFormField,
  LumenIcon,
  LumenIconButton,
  LumenInput,
  LumenPageHeader,
  LumenPopupSelect,
  LumenTextarea,
} from '@lumen/app-ui'
import type { CommandPaletteItem, CommandPaletteState } from '@hbar/app-runtime'
import { workspaceDisplayName } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { HbarLumenDisclosure } from './lumen-disclosure'
import './command-palette.css'

type CommandParameterField = CommandPaletteItem['form']['fields'][number]
type CommandParameterIssue = NonNullable<CommandPaletteState['draft']>['issues'][number]

export interface HbarCommandPaletteLabels {
  readonly title: string
  readonly description: string
  readonly search: string
  readonly available: string
  readonly empty: string
  readonly unavailable: string
  readonly choose: string
  readonly close: string
  readonly actions: string
  readonly backToCommands: string
  readonly backToParameters: string
  readonly count: (count: number) => string
  readonly navigateKeys: string
  readonly executeKey: string
  readonly closeKey: string
  readonly category: (id: string) => string
  readonly resolve: (key: string) => string
  readonly commandFallback: (id: string) => string
  readonly descriptionFallback: (id: string) => string
  readonly parameters: string
  readonly noParameters: string
  readonly required: string
  readonly optional: string
  readonly unset: string
  readonly trueValue: string
  readonly falseValue: string
  readonly jsonPlaceholder: string
  readonly chooseKnownTarget: string
  readonly customIdentifierOption: string
  readonly customIdentifier: (field: string) => string
  readonly workspaceOption: (name: string, path: string) => string
  readonly sessionOption: (title: string, workspace: string) => string
  readonly fieldFallback: (name: string) => string
  readonly option: (field: CommandParameterField, value: string | number | boolean) => string
  readonly issue: (issue: CommandParameterIssue) => string
  readonly refresh: string
  readonly reset: string
  readonly execute: string
  readonly executing: string
  readonly succeeded: string
  readonly result: string
  readonly resultSummary: (command: string) => string
  readonly technicalDetails: string
  readonly loading: string
  readonly truncated: string
  readonly unavailableReason: (code: string) => string
  readonly error: (code: string) => string
  readonly kind: (kind: 'command' | 'query') => string
  readonly execution: (execution: 'host' | 'client' | 'platform') => string
  readonly scope: (scope: 'global' | 'workspace' | 'session' | 'client') => string
}

export interface HbarCommandPaletteProps {
  readonly labels: HbarCommandPaletteLabels
  readonly connected: boolean
  readonly searchRef?: RefObject<HTMLInputElement | null>
}

function reasonCode(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

function SensitiveParameter({
  id,
  field,
  resetRevision,
  disabled,
  onChange,
}: {
  readonly id: string
  readonly field: CommandParameterField
  readonly resetRevision: number
  readonly disabled: boolean
  readonly onChange: (value: string) => void
}) {
  const [value, setValue] = useState('')
  useEffect(() => setValue(''), [resetRevision])
  return (
    <LumenInput
      id={id}
      type="password"
      autoComplete="new-password"
      required={field.required}
      minLength={field.minLength}
      maxLength={field.maxLength}
      value={value}
      disabled={disabled}
      onChange={(event) => {
        const next = event.currentTarget.value
        setValue(next)
        onChange(next)
      }}
    />
  )
}

const CUSTOM_IDENTIFIER = '__hbar_custom_identifier__'

interface KnownTargetOption {
  readonly id: string
  readonly label: string
}

function KnownTargetParameter({
  id,
  label,
  field,
  value,
  options,
  labels,
  disabled,
  onChange,
  onUnset,
}: {
  readonly id: string
  readonly label: string
  readonly field: CommandParameterField
  readonly value: unknown
  readonly options: readonly KnownTargetOption[]
  readonly labels: HbarCommandPaletteLabels
  readonly disabled: boolean
  readonly onChange: (value: string) => void
  readonly onUnset: () => void
}) {
  const known = typeof value === 'string' && options.some((option) => option.id === value)
  const [custom, setCustom] = useState(() => typeof value === 'string' && value.length > 0 && !known)
  const customValue = custom && typeof value === 'string' && !known ? value : ''
  return (
    <LumenFrame className="hbar-app-react-known-target">
      <LumenPopupSelect
        id={id}
        valueContext="choice.title"
        value={custom ? CUSTOM_IDENTIFIER : typeof value === 'string' ? value : ''}
        placeholder={field.required ? labels.chooseKnownTarget : labels.unset}
        options={[
          { id: '', label: field.required ? labels.chooseKnownTarget : labels.unset, disabled: field.required },
          ...options,
          { id: CUSTOM_IDENTIFIER, label: labels.customIdentifierOption },
        ]}
        required={field.required}
        disabled={disabled}
        onValueChange={(next) => {
          if (next === CUSTOM_IDENTIFIER) {
            setCustom(true)
            if (known || value === undefined) onUnset()
          } else if (next === '') {
            setCustom(false)
            onUnset()
          } else {
            setCustom(false)
            onChange(next)
          }
        }}
      />
      {custom && (
        <LumenInput
          type="text"
          aria-label={labels.customIdentifier(label)}
          placeholder={labels.customIdentifier(label)}
          minLength={field.minLength}
          maxLength={field.maxLength}
          required={field.required}
          value={customValue}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      )}
    </LumenFrame>
  )
}

export function HbarCommandPalette({ labels, connected, searchRef }: HbarCommandPaletteProps) {
  const runtime = useHbarRuntime()
  const palette = useHbarRuntimeState(runtime.state.commandPalette)
  const directory = useHbarRuntimeState(runtime.state.directory)
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const displayNames = useHbarRuntimeState(runtime.state.workspaceDisplayNameSnapshot)
  const internalSearch = useRef<HTMLInputElement>(null)
  const search = searchRef ?? internalSearch
  const [actionError, setActionError] = useState<string | null>(null)
  const selected = palette.selectedId ? palette.items[palette.selectedId] : undefined
  const busy = palette.execution.status === 'submitting'
  const hostDisconnected = selected?.descriptor.metadata.execution === 'host' && !connected
  const canExecute = Boolean(
    selected &&
    selected.available &&
    !hostDisconnected &&
    !busy &&
    palette.execution.status !== 'unknown' &&
    palette.draft &&
    palette.draft.issues.length === 0,
  )

  const dispatch = useCallback((promise: Promise<unknown>) => {
    setActionError(null)
    void promise.catch((reason) => setActionError(reasonCode(reason)))
  }, [])
  useEffect(() => {
    let active = true
    const initialize = (promise: Promise<unknown>) => {
      void promise.catch((reason) => {
        const code = reasonCode(reason)
        if (active && code !== 'RESULT_UNKNOWN') setActionError(code)
      })
    }
    const current = runtime.state.commandPalette.getSnapshot()
    if (current.view === 'search') initialize(runtime.commands.execute('commandPalette.setQuery', { query: '' }))
    if (current.status === 'idle') initialize(runtime.commands.execute('commandPalette.refresh', {}))
    return () => {
      active = false
    }
  }, [runtime.commands, runtime.state.commandPalette])
  useEffect(() => {
    if (palette.status === 'ready' && palette.view === 'search') search.current?.focus()
  }, [palette.status, palette.view, search])

  const listItems = useMemo(
    () =>
      palette.visibleIds.flatMap((id) => {
        const item = palette.items[id]
        if (!item) return []
        const metadata = item.descriptor.metadata
        const title = labels.resolve(metadata.titleKey)
        const description = labels.resolve(metadata.descriptionKey)
        return [
          {
            id,
            label: title === metadata.titleKey ? labels.commandFallback(id) : title,
            description: description === metadata.descriptionKey ? labels.descriptionFallback(id) : description,
            group: labels.category(metadata.category),
            navigates: true,
            disabled: !item.available || (metadata.execution === 'host' && !connected),
          },
        ]
      }),
    [connected, labels, palette.items, palette.visibleIds],
  )
  const workspaceTargets = useMemo<KnownTargetOption[]>(
    () =>
      Object.values(directory.workspaces)
        .sort(
          (left, right) =>
            workspaceDisplayName(left, displayNames).localeCompare(workspaceDisplayName(right, displayNames)) ||
            left.id.localeCompare(right.id),
        )
        .map((workspace) => ({
          id: workspace.id,
          label: labels.workspaceOption(workspaceDisplayName(workspace, displayNames), workspace.path),
        })),
    [directory.workspaces, displayNames, labels],
  )
  const sessionTargets = useMemo<KnownTargetOption[]>(() => {
    const draftWorkspace = palette.draft?.values.workspaceId
    const workspaceId = typeof draftWorkspace === 'string' ? draftWorkspace : navigation.workspaceId
    return Object.values(directory.sessions)
      .filter((session) => !session.archived && (!workspaceId || session.workspaceId === workspaceId))
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((session) => {
        const workspace = directory.workspaces[session.workspaceId]
        return {
          id: session.id,
          label: labels.sessionOption(
            session.title,
            workspace ? workspaceDisplayName(workspace, displayNames) : session.workspaceId,
          ),
        }
      })
  }, [
    directory.sessions,
    directory.workspaces,
    displayNames,
    labels,
    navigation.workspaceId,
    palette.draft?.values.workspaceId,
  ])

  const commandTitle = selected
    ? labels.resolve(selected.descriptor.metadata.titleKey) === selected.descriptor.metadata.titleKey
      ? labels.commandFallback(selected.descriptor.metadata.id)
      : labels.resolve(selected.descriptor.metadata.titleKey)
    : labels.title
  const commandDescription = selected
    ? labels.resolve(selected.descriptor.metadata.descriptionKey) === selected.descriptor.metadata.descriptionKey
      ? labels.descriptionFallback(selected.descriptor.metadata.id)
      : labels.resolve(selected.descriptor.metadata.descriptionKey)
    : labels.description
  const select = (id: string) => dispatch(runtime.commands.execute('commandPalette.select', { commandId: id }))
  const openCommand = (id: string) =>
    dispatch(runtime.commands.execute('commandPalette.openCommand', { commandId: id }))
  const goBack = () => dispatch(runtime.commands.execute('commandPalette.back', {}))
  const setParameter = (field: string, value: string | boolean) =>
    dispatch(runtime.commands.execute('commandPalette.setParameter', { field, value }))
  const unsetParameter = (field: string) =>
    dispatch(runtime.commands.execute('commandPalette.unsetParameter', { field }))
  const closePanel = () => {
    const instanceId = runtime.state.presentation.getSnapshot().modalInstanceId
    if (instanceId) dispatch(runtime.commands.execute('app.closePanel', { instanceId }))
  }
  const executeCommand = () => {
    setActionError(null)
    const previousSelection = runtime.state.navigation.getSnapshot()
    void runtime.commands
      .execute('commandPalette.execute', {})
      .then(async () => {
        const nextSelection = runtime.state.navigation.getSnapshot()
        const navigated =
          nextSelection.workspaceId !== previousSelection.workspaceId ||
          nextSelection.sessionId !== previousSelection.sessionId
        if (selected?.descriptor.metadata.category !== 'app.navigation' && !navigated) return
        const instanceId = runtime.state.presentation.getSnapshot().modalInstanceId
        if (instanceId) await runtime.commands.execute('app.closePanel', { instanceId })
      })
      .catch(() => {})
  }
  const fieldIssue = (field: string) => palette.draft?.issues.find((issue) => issue.field === field)

  const fieldControl = (field: CommandParameterField, controlId: string, label: string) => {
    const value = palette.draft?.values[field.name]
    if (field.sensitive)
      return (
        <SensitiveParameter
          key={`${palette.selectedId}:${field.name}`}
          id={controlId}
          field={field}
          resetRevision={palette.sensitiveResetRevision}
          disabled={busy}
          onChange={(next) => setParameter(field.name, next)}
        />
      )
    if (field.kind === 'boolean') {
      if (!field.required && field.defaultValue === undefined)
        return (
          <LumenPopupSelect
            id={controlId}
            value={typeof value === 'boolean' ? String(value) : ''}
            placeholder={labels.unset}
            options={[
              { id: '', label: labels.unset },
              { id: 'true', label: labels.trueValue },
              { id: 'false', label: labels.falseValue },
            ]}
            disabled={busy}
            onValueChange={(next) => {
              if (next === '') unsetParameter(field.name)
              else setParameter(field.name, next === 'true')
            }}
          />
        )
      return (
        <LumenCheckBox
          id={controlId}
          label={labels.trueValue}
          checked={value === true}
          disabled={busy}
          onChange={(event) => setParameter(field.name, event.currentTarget.checked)}
        />
      )
    }
    if (field.choices.length)
      return (
        <LumenPopupSelect
          id={controlId}
          value={typeof value === 'string' ? value : ''}
          placeholder={field.required ? labels.required : labels.unset}
          options={[
            ...(!field.required
              ? [{ id: '', label: labels.unset }]
              : value === undefined
                ? [{ id: '', label: labels.required, disabled: true }]
                : []),
            ...field.choices.map((choice) => ({
              id: String(choice),
              label: labels.option(field, choice),
            })),
          ]}
          required={field.required}
          disabled={busy}
          onValueChange={(next) => {
            if (!field.required && next === '') unsetParameter(field.name)
            else setParameter(field.name, next)
          }}
        />
      )
    const knownTargets =
      field.name === 'workspaceId'
        ? workspaceTargets
        : field.name === 'sessionId' || field.name === 'parentSessionId'
          ? sessionTargets
          : []
    if (field.kind === 'string' && knownTargets.length)
      return (
        <KnownTargetParameter
          key={`${palette.selectedId}:${field.name}:${palette.sensitiveResetRevision}`}
          id={controlId}
          label={label}
          field={field}
          value={value}
          options={knownTargets}
          labels={labels}
          disabled={busy}
          onChange={(next) => setParameter(field.name, next)}
          onUnset={() => unsetParameter(field.name)}
        />
      )
    if (field.kind === 'json')
      return (
        <LumenTextarea
          id={controlId}
          value={typeof value === 'string' ? value : ''}
          required={field.required}
          disabled={busy}
          placeholder={labels.jsonPlaceholder}
          onChange={(event) => setParameter(field.name, event.currentTarget.value)}
        />
      )
    return (
      <LumenInput
        id={controlId}
        type={field.kind === 'number' || field.kind === 'integer' ? 'number' : 'text'}
        step={field.kind === 'integer' ? 1 : field.kind === 'number' ? 'any' : undefined}
        min={field.minimum}
        max={field.maximum}
        minLength={field.minLength}
        maxLength={field.maxLength}
        required={field.required}
        value={typeof value === 'string' ? value : ''}
        disabled={busy}
        onChange={(event) => setParameter(field.name, event.currentTarget.value)}
      />
    )
  }

  const header = (
    <LumenPageHeader
      title={palette.view === 'result' ? labels.result : palette.view === 'parameters' ? commandTitle : labels.title}
      context={palette.view === 'search' ? labels.description : commandDescription}
      leading={
        palette.view === 'parameters' && selected ? (
          <LumenIconButton label={labels.backToCommands} onClick={goBack}>
            <LumenIcon icon={ArrowLeft} tier="sm" />
          </LumenIconButton>
        ) : undefined
      }
      actionsLabel={labels.actions}
      actions={
        <>
          {palette.view === 'search' && (
            <LumenIconButton
              label={labels.refresh}
              disabled={palette.status === 'loading' || busy}
              onClick={() => dispatch(runtime.commands.execute('commandPalette.refresh', {}))}
            >
              <LumenIcon icon={RefreshCw} tier="sm" />
            </LumenIconButton>
          )}
          <LumenIconButton label={labels.close} onClick={closePanel}>
            <LumenIcon icon={X} tier="sm" />
          </LumenIconButton>
        </>
      }
    />
  )

  return (
    <LumenFrame as="section" className="hbar-app-react-command-palette" data-view={palette.view}>
      {header}
      {palette.view === 'search' ? (
        <LumenFrame className="hbar-app-react-command-search">
          <LumenCommandList
            inputRef={search}
            inputId="hbar-command-search"
            labels={{
              search: labels.search,
              available: labels.available,
              empty: labels.empty,
              unavailable: labels.unavailable,
              navigate: labels.choose,
              execute: labels.choose,
              close: labels.close,
              count: labels.count,
              navigateKeys: labels.navigateKeys,
              executeKey: labels.executeKey,
              closeKey: labels.closeKey,
            }}
            items={listItems}
            query={palette.query}
            selectedId={palette.selectedId ?? undefined}
            selectionLost={palette.selectionLost}
            onQueryChange={(query) => dispatch(runtime.commands.execute('commandPalette.setQuery', { query }))}
            onSelect={select}
            onMove={(direction) => dispatch(runtime.commands.execute('commandPalette.move', { direction }))}
            onExecute={openCommand}
            listStrategy={listItems.length > 40 ? 'virtual' : 'content-grown'}
            error={palette.status === 'error' && palette.error ? labels.error(palette.error) : undefined}
          />
          {palette.truncated && (
            <LumenContentText context="feedback.paragraph" className="hbar-app-react-command-truncated">
              {labels.truncated}
            </LumenContentText>
          )}
          {actionError && (
            <LumenContentText context="feedback.paragraph" className="hbar-app-react-command-action-error" role="alert">
              {labels.error(actionError)}
            </LumenContentText>
          )}
        </LumenFrame>
      ) : palette.view === 'parameters' && selected && palette.draft ? (
        <LumenFrame as="main" className="hbar-app-react-command-parameters">
          <LumenFrame
            as="form"
            onSubmit={(event) => {
              event.preventDefault()
              if (canExecute) executeCommand()
            }}
          >
            <LumenFrame className="hbar-app-react-command-form-body">
              {palette.execution.status === 'unknown' && (
                <LumenContentText context="feedback.paragraph" tone="danger" role="alert">
                  {labels.error(palette.execution.error ?? 'RESULT_UNKNOWN')}
                </LumenContentText>
              )}
              <LumenCollection as="dl" className="hbar-app-react-command-metadata">
                <LumenFrame>
                  <LumenContentText context="detail.term">
                    <LumenFrame
                      className="hbar-command-reader"
                      role="region"
                      aria-label={labels.kind(selected.descriptor.metadata.kind)}
                      tabIndex={0}
                    >
                      <LumenContentText context="inline.text">
                        {labels.kind(selected.descriptor.metadata.kind)}
                      </LumenContentText>
                    </LumenFrame>
                  </LumenContentText>
                  <LumenContentText context="detail.value">
                    <LumenContentText context="code.inline">{selected.descriptor.metadata.id}</LumenContentText>
                  </LumenContentText>
                </LumenFrame>
                <LumenFrame>
                  <LumenContentText context="detail.term">
                    <LumenFrame
                      className="hbar-command-reader"
                      role="region"
                      aria-label={labels.execution(selected.descriptor.metadata.execution)}
                      tabIndex={0}
                    >
                      <LumenContentText context="inline.text">
                        {labels.execution(selected.descriptor.metadata.execution)}
                      </LumenContentText>
                    </LumenFrame>
                  </LumenContentText>
                  <LumenContentText context="detail.value">
                    {labels.scope(selected.descriptor.metadata.scope)}
                  </LumenContentText>
                </LumenFrame>
              </LumenCollection>
              <LumenFrame as="fieldset" disabled={busy}>
                <LumenContentText context="form.legend">
                  <LumenFrame className="hbar-command-reader" role="region" aria-label={labels.parameters} tabIndex={0}>
                    <LumenContentText context="inline.text">{labels.parameters}</LumenContentText>
                  </LumenFrame>
                </LumenContentText>
                {selected.form.fields.length === 0 ? (
                  <LumenContentText context="empty.description">{labels.noParameters}</LumenContentText>
                ) : (
                  selected.form.fields.map((field) => {
                    const issue = fieldIssue(field.name)
                    const resolved = labels.resolve(field.labelKey)
                    const label = resolved === field.labelKey ? labels.fieldFallback(field.name) : resolved
                    const isSet =
                      Object.hasOwn(palette.draft?.values ?? {}, field.name) ||
                      palette.draft?.sensitiveFields.includes(field.name)
                    const usesKnownTargetControl =
                      field.kind === 'string' &&
                      ((field.name === 'workspaceId' && workspaceTargets.length > 0) ||
                        ((field.name === 'sessionId' || field.name === 'parentSessionId') && sessionTargets.length > 0))
                    const controlId = `hbar-command-${field.name}`
                    return (
                      <LumenFrame key={field.name} className="hbar-app-react-command-field">
                        <LumenFormField
                          controlId={controlId}
                          label={label}
                          hint={field.required ? labels.required : labels.optional}
                          {...(issue ? { error: labels.issue(issue) } : {})}
                          required={field.required}
                        >
                          {fieldControl(field, controlId, label)}
                        </LumenFormField>
                        {!field.required && isSet && !usesKnownTargetControl && (
                          <LumenFrame
                            className="hbar-command-reader"
                            role="group"
                            aria-label={labels.unset}
                            tabIndex={0}
                          >
                            <LumenButton
                              type="button"
                              variant="text"
                              disabled={busy}
                              onClick={() => unsetParameter(field.name)}
                            >
                              {labels.unset}
                            </LumenButton>
                          </LumenFrame>
                        )}
                      </LumenFrame>
                    )
                  })
                )}
              </LumenFrame>
              {(!selected.available || hostDisconnected) && (
                <LumenContentText context="feedback.paragraph" role="status">
                  {labels.unavailableReason(
                    hostDisconnected ? 'HOST_DISCONNECTED' : (selected.unavailableReason ?? 'CAPABILITY_UNAVAILABLE'),
                  )}
                </LumenContentText>
              )}
              {actionError && (
                <LumenContentText context="feedback.paragraph" role="alert">
                  {labels.error(actionError)}
                </LumenContentText>
              )}
            </LumenFrame>
            <LumenFrame
              as="footer"
              className="hbar-command-reader"
              role="group"
              aria-label={labels.actions}
              tabIndex={0}
            >
              <LumenButton
                type="button"
                variant="outlined"
                disabled={busy}
                onClick={() => dispatch(runtime.commands.execute('commandPalette.resetParameters', {}))}
              >
                {labels.reset}
              </LumenButton>
              <LumenButton type="submit" tone="primary" disabled={!canExecute}>
                {busy ? labels.executing : labels.execute}
              </LumenButton>
            </LumenFrame>
          </LumenFrame>
        </LumenFrame>
      ) : palette.view === 'result' && selected ? (
        <LumenFrame as="main" className="hbar-app-react-command-result-view">
          <LumenFrame
            as="section"
            className="hbar-app-react-command-result-summary"
            data-tone={palette.execution.status === 'succeeded' ? 'success' : 'danger'}
            role={palette.execution.status === 'succeeded' ? 'status' : 'alert'}
          >
            <LumenContentText context="feedback.title">
              {palette.execution.status === 'succeeded'
                ? labels.succeeded
                : labels.error(palette.execution.error ?? 'EXECUTION_FAILED')}
            </LumenContentText>
            <LumenContentText context="feedback.paragraph">{labels.resultSummary(commandTitle)}</LumenContentText>
          </LumenFrame>
          <LumenCollection as="dl" className="hbar-app-react-command-metadata">
            <LumenFrame>
              <LumenContentText context="detail.term">
                <LumenFrame
                  className="hbar-command-reader"
                  role="region"
                  aria-label={labels.kind(selected.descriptor.metadata.kind)}
                  tabIndex={0}
                >
                  <LumenContentText context="inline.text">
                    {labels.kind(selected.descriptor.metadata.kind)}
                  </LumenContentText>
                </LumenFrame>
              </LumenContentText>
              <LumenContentText context="detail.value">
                <LumenContentText context="code.inline">{selected.descriptor.metadata.id}</LumenContentText>
              </LumenContentText>
            </LumenFrame>
            <LumenFrame>
              <LumenContentText context="detail.term">
                <LumenFrame
                  className="hbar-command-reader"
                  role="region"
                  aria-label={labels.execution(selected.descriptor.metadata.execution)}
                  tabIndex={0}
                >
                  <LumenContentText context="inline.text">
                    {labels.execution(selected.descriptor.metadata.execution)}
                  </LumenContentText>
                </LumenFrame>
              </LumenContentText>
              <LumenContentText context="detail.value">
                {labels.scope(selected.descriptor.metadata.scope)}
              </LumenContentText>
            </LumenFrame>
          </LumenCollection>
          <HbarLumenDisclosure className="hbar-app-react-command-result-details" label={labels.technicalDetails}>
            <LumenContentText context="code.block" role="region" aria-label={labels.technicalDetails} tabIndex={0}>
              {palette.execution.result ?? palette.execution.error}
            </LumenContentText>
          </HbarLumenDisclosure>
          <LumenFrame as="footer" className="hbar-command-reader" role="group" aria-label={labels.actions} tabIndex={0}>
            <LumenButton variant="outlined" onClick={goBack}>
              {labels.backToParameters}
            </LumenButton>
          </LumenFrame>
        </LumenFrame>
      ) : (
        <LumenFrame as="main" className="hbar-app-react-command-missing">
          <LumenContentText context="empty.description" role="status">
            {labels.empty}
          </LumenContentText>
          <LumenFrame className="hbar-command-reader" role="group" aria-label={labels.backToCommands} tabIndex={0}>
            <LumenButton variant="outlined" onClick={goBack}>
              {labels.backToCommands}
            </LumenButton>
          </LumenFrame>
        </LumenFrame>
      )}
    </LumenFrame>
  )
}
