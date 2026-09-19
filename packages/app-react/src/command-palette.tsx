import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CommandParameterField, CommandParameterIssue } from '@hbar/commands'
import { HbarAppUiButton, HbarAppUiCommandList, HbarAppUiSurface } from 'hbar-app-ui'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import './command-palette.css'

export interface HbarCommandPaletteLabels {
  readonly title: string
  readonly description: string
  readonly search: string
  readonly available: string
  readonly empty: string
  readonly unavailable: string
  readonly choose: string
  readonly close: string
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
  readonly fieldFallback: (name: string) => string
  readonly option: (field: CommandParameterField, value: string | number | boolean) => string
  readonly issue: (issue: CommandParameterIssue) => string
  readonly refresh: string
  readonly reset: string
  readonly execute: string
  readonly executing: string
  readonly succeeded: string
  readonly result: string
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
}

function reasonCode(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

function SensitiveParameter({
  field,
  resetRevision,
  disabled,
  onChange,
}: {
  readonly field: CommandParameterField
  readonly resetRevision: number
  readonly disabled: boolean
  readonly onChange: (value: string) => void
}) {
  const [value, setValue] = useState('')
  useEffect(() => setValue(''), [resetRevision])
  return (
    <input
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

export function HbarCommandPalette({ labels, connected }: HbarCommandPaletteProps) {
  const runtime = useHbarRuntime()
  const palette = useHbarRuntimeState(runtime.state.commandPalette)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const search = useRef<HTMLInputElement>(null)
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
    if (palette.status === 'idle') dispatch(runtime.commands.execute('commandPalette.refresh', {}))
  }, [dispatch, palette.status, runtime.commands])
  useEffect(() => {
    if (palette.status === 'ready') search.current?.focus()
  }, [palette.status])
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !surfaces.focusedPanelId) return
      event.preventDefault()
      dispatch(runtime.commands.execute('app.closePanel', { instanceId: surfaces.focusedPanelId }))
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [dispatch, runtime.commands, surfaces.focusedPanelId])

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

  const select = (id: string) => dispatch(runtime.commands.execute('commandPalette.select', { commandId: id }))
  const setParameter = (field: string, value: string | boolean) =>
    dispatch(runtime.commands.execute('commandPalette.setParameter', { field, value }))
  const unsetParameter = (field: string) =>
    dispatch(runtime.commands.execute('commandPalette.unsetParameter', { field }))
  const closePanel = () => {
    if (surfaces.focusedPanelId)
      dispatch(runtime.commands.execute('app.closePanel', { instanceId: surfaces.focusedPanelId }))
  }
  const fieldIssue = (field: string) => palette.draft?.issues.find((issue) => issue.field === field)

  const fieldControl = (field: CommandParameterField) => {
    const value = palette.draft?.values[field.name]
    if (field.sensitive)
      return (
        <SensitiveParameter
          key={`${palette.selectedId}:${field.name}`}
          field={field}
          resetRevision={palette.sensitiveResetRevision}
          disabled={busy}
          onChange={(next) => setParameter(field.name, next)}
        />
      )
    if (field.kind === 'boolean') {
      if (!field.required && field.defaultValue === undefined)
        return (
          <select
            value={typeof value === 'boolean' ? String(value) : ''}
            disabled={busy}
            onChange={(event) => {
              const next = event.currentTarget.value
              if (next === '') unsetParameter(field.name)
              else setParameter(field.name, next === 'true')
            }}
          >
            <option value="">{labels.unset}</option>
            <option value="true">{labels.trueValue}</option>
            <option value="false">{labels.falseValue}</option>
          </select>
        )
      return (
        <input
          type="checkbox"
          checked={value === true}
          disabled={busy}
          onChange={(event) => setParameter(field.name, event.currentTarget.checked)}
        />
      )
    }
    if (field.choices.length)
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          required={field.required}
          disabled={busy}
          onChange={(event) => {
            const next = event.currentTarget.value
            if (!field.required && next === '') unsetParameter(field.name)
            else setParameter(field.name, next)
          }}
        >
          {!field.required && <option value="">{labels.unset}</option>}
          {field.required && value === undefined && (
            <option value="" disabled>
              {labels.required}
            </option>
          )}
          {field.choices.map((choice) => (
            <option key={`${typeof choice}:${String(choice)}`} value={String(choice)}>
              {labels.option(field, choice)}
            </option>
          ))}
        </select>
      )
    if (field.kind === 'json')
      return (
        <textarea
          value={typeof value === 'string' ? value : ''}
          required={field.required}
          disabled={busy}
          placeholder={labels.jsonPlaceholder}
          onChange={(event) => setParameter(field.name, event.currentTarget.value)}
        />
      )
    return (
      <input
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

  return (
    <HbarAppUiSurface className="hbar-app-react-command-palette">
      <header className="hbar-app-react-command-header">
        <div>
          <h1>{labels.title}</h1>
          <p>{labels.description}</p>
        </div>
        <div>
          <HbarAppUiButton
            disabled={palette.status === 'loading' || busy}
            onClick={() => dispatch(runtime.commands.execute('commandPalette.refresh', {}))}
          >
            {palette.status === 'loading' ? labels.loading : labels.refresh}
          </HbarAppUiButton>
          <HbarAppUiButton onClick={closePanel}>{labels.close}</HbarAppUiButton>
        </div>
      </header>
      <div className="hbar-app-react-command-layout">
        <HbarAppUiCommandList
          inputRef={search}
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
          onExecute={select}
          listStrategy={listItems.length > 40 ? 'virtual' : 'content-grown'}
          error={palette.status === 'error' && palette.error ? labels.error(palette.error) : undefined}
        />
        <main className="hbar-app-react-command-detail">
          {!selected || !palette.draft ? (
            <p role="status">{labels.empty}</p>
          ) : (
            <>
              <header>
                <small>{labels.category(selected.descriptor.metadata.category)}</small>
                <h2>
                  {labels.resolve(selected.descriptor.metadata.titleKey) === selected.descriptor.metadata.titleKey
                    ? labels.commandFallback(selected.descriptor.metadata.id)
                    : labels.resolve(selected.descriptor.metadata.titleKey)}
                </h2>
                <p>
                  {labels.resolve(selected.descriptor.metadata.descriptionKey) ===
                  selected.descriptor.metadata.descriptionKey
                    ? labels.descriptionFallback(selected.descriptor.metadata.id)
                    : labels.resolve(selected.descriptor.metadata.descriptionKey)}
                </p>
                <dl>
                  <div>
                    <dt>{labels.kind(selected.descriptor.metadata.kind)}</dt>
                    <dd>{selected.descriptor.metadata.id}</dd>
                  </div>
                  <div>
                    <dt>{labels.execution(selected.descriptor.metadata.execution)}</dt>
                    <dd>{labels.scope(selected.descriptor.metadata.scope)}</dd>
                  </div>
                </dl>
              </header>
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  if (canExecute) dispatch(runtime.commands.execute('commandPalette.execute', {}))
                }}
              >
                <fieldset disabled={busy}>
                  <legend>{labels.parameters}</legend>
                  {selected.form.fields.length === 0 ? (
                    <p>{labels.noParameters}</p>
                  ) : (
                    selected.form.fields.map((field) => {
                      const issue = fieldIssue(field.name)
                      const resolved = labels.resolve(field.labelKey)
                      const isSet =
                        Object.hasOwn(palette.draft?.values ?? {}, field.name) ||
                        palette.draft?.sensitiveFields.includes(field.name)
                      return (
                        <div key={field.name} className={`hbar-app-react-command-field${issue ? ' has-error' : ''}`}>
                          <label>
                            <span>
                              <strong>
                                {resolved === field.labelKey ? labels.fieldFallback(field.name) : resolved}
                              </strong>
                              <small>{field.required ? labels.required : labels.optional}</small>
                            </span>
                            {fieldControl(field)}
                            {issue && <small role="alert">{labels.issue(issue)}</small>}
                          </label>
                          {!field.required && isSet && (
                            <HbarAppUiButton type="button" disabled={busy} onClick={() => unsetParameter(field.name)}>
                              {labels.unset}
                            </HbarAppUiButton>
                          )}
                        </div>
                      )
                    })
                  )}
                </fieldset>
                {(!selected.available || hostDisconnected) && (
                  <p role="status">
                    {labels.unavailableReason(
                      hostDisconnected ? 'HOST_DISCONNECTED' : (selected.unavailableReason ?? 'CAPABILITY_UNAVAILABLE'),
                    )}
                  </p>
                )}
                {palette.execution.status === 'succeeded' && (
                  <section className="hbar-app-react-command-result" aria-label={labels.result}>
                    <strong>{labels.succeeded}</strong>
                    {palette.execution.result && <pre>{palette.execution.result}</pre>}
                  </section>
                )}
                {palette.execution.error && <p role="alert">{labels.error(palette.execution.error)}</p>}
                {actionError && <p role="alert">{labels.error(actionError)}</p>}
                <footer>
                  <HbarAppUiButton
                    type="button"
                    disabled={busy}
                    onClick={() => dispatch(runtime.commands.execute('commandPalette.resetParameters', {}))}
                  >
                    {labels.reset}
                  </HbarAppUiButton>
                  <HbarAppUiButton type="submit" tone="accent" disabled={!canExecute}>
                    {busy ? labels.executing : labels.execute}
                  </HbarAppUiButton>
                </footer>
              </form>
            </>
          )}
        </main>
      </div>
      {palette.truncated && <p className="hbar-app-react-command-truncated">{labels.truncated}</p>}
    </HbarAppUiSurface>
  )
}
