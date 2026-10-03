import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useHbarRuntimeState } from '@hbar/app-react'
import type { createAppRuntime } from '@hbar/app-runtime'
import { LumenButton, LumenCollection, LumenCollectionItem, LumenFrame, LumenOption, LumenText } from '@lumen/app-ui'
import { LumenFormField, LumenInput, LumenSelect, LumenTextarea } from '@lumen/app-ui/forms'
import { LumenScheduling01, LumenScheduling03, LumenScheduling04 } from '@lumen/app-ui/scheduling'
import type { ScheduleDefinition } from '@hbar/contracts/commands/schedules'
import type { ShellLocale } from './shell-copy'
import { scheduleCopy } from './schedule-copy'
import { editScheduleForm, newScheduleForm, scheduleFormInput, type ScheduleFormDraft } from './schedule-form'
import './schedules-page.css'
import { createWorkspaceSessionTargets } from './workspace-session-targets'

type Runtime = ReturnType<typeof createAppRuntime>['view']

export function SchedulesPage(props: {
  readonly runtime: Runtime
  readonly workspaceId: string
  readonly locale: ShellLocale
  readonly initialScheduleId?: string
}) {
  return props.runtime.state.schedules ? (
    <AvailableSchedulesPage {...props} api={props.runtime.state.schedules} />
  ) : (
    <LumenText>{scheduleCopy(props.locale).unavailable}</LumenText>
  )
}

function AvailableSchedulesPage({
  runtime,
  workspaceId,
  locale,
  api,
  initialScheduleId,
}: {
  readonly runtime: Runtime
  readonly workspaceId: string
  readonly locale: ShellLocale
  readonly api: NonNullable<Runtime['state']['schedules']>
  readonly initialScheduleId?: string
}) {
  const copy = scheduleCopy(locale)
  const snapshot = useHbarRuntimeState(api.reader)
  const directory = useHbarRuntimeState(runtime.state.directory)
  const catalog = useHbarRuntimeState(runtime.state.preSessionModelCatalog)
  const formId = useId()
  const [draft, setDraft] = useState(() => newScheduleForm(Intl.DateTimeFormat().resolvedOptions().timeZone))
  const [preview, setPreview] = useState<readonly number[]>([])
  const [previewPending, setPreviewPending] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const sessionTargets = useMemo(
    () =>
      createWorkspaceSessionTargets({
        list: (input, signal) => runtime.commands.execute('session.list', input, { signal }),
      }),
    [runtime],
  )
  const targetCatalog = useHbarRuntimeState(sessionTargets.reader)
  const sessionLoad = targetCatalog.status
  const owner = useRef({ workspaceId, mounted: true, previewRevision: 0 })
  owner.current.workspaceId = workspaceId
  useEffect(() => {
    const lifetime = owner.current
    lifetime.mounted = true
    return () => {
      lifetime.mounted = false
      lifetime.previewRevision++
    }
  }, [])
  // Keep a catalog lease for this visible workspace panel. Releasing/reacquiring on workspace
  // changes forces a fresh host-backed model.list read instead of retaining a stale idle projection.
  useEffect(() => runtime.preSessionModelCatalog.retain(), [runtime, workspaceId])
  useEffect(() => {
    void sessionTargets.refresh(workspaceId).catch(() => undefined)
  }, [sessionTargets, workspaceId])
  useEffect(() => sessionTargets.retain(), [sessionTargets])
  useEffect(() => {
    setDraft(newScheduleForm(Intl.DateTimeFormat().resolvedOptions().timeZone))
    setPreview([])
    setPreviewPending(false)
    setFeedback(null)
    setConfirmDelete(null)
    owner.current.previewRevision++
    void api.refresh(workspaceId)
  }, [api, workspaceId])
  useEffect(() => {
    if (!initialScheduleId) return
    let current = true
    void api
      .get(initialScheduleId)
      .then((schedule) => {
        if (!current || !schedule || schedule.workspaceId !== workspaceId) return
        setDraft(editScheduleForm(schedule))
        void api.refreshOccurrences(schedule.id)
      })
      .catch((error: unknown) => {
        if (current) setFeedback(error instanceof Error ? error.message : copy.validation)
      })
    return () => {
      current = false
    }
  }, [api, workspaceId, initialScheduleId, copy.validation])
  const busy = snapshot.mutation === 'submitting' || snapshot.mutation === 'unknown'
  const sessions =
    targetCatalog.workspaceId === workspaceId
      ? targetCatalog.sessionIds.flatMap((id) => {
          const session = directory.sessions[id]
          return session && session.workspaceId === workspaceId && !session.archived ? [session] : []
        })
      : []
  const models = catalog.models.filter((model) => model.canExecute ?? model.hasKey)
  const patch = (change: Partial<ScheduleFormDraft>) => {
    owner.current.previewRevision++
    setDraft((current) => ({ ...current, ...change }))
    setPreview([])
    setPreviewPending(false)
    setFeedback(null)
  }
  const execute = async (action: () => Promise<unknown>) => {
    const originalWorkspaceId = workspaceId
    try {
      await action()
      if (!owner.current.mounted || owner.current.workspaceId !== originalWorkspaceId) return false
      setFeedback(copy.saved)
      await api.refresh(workspaceId)
      return true
    } catch (error) {
      if (owner.current.mounted && owner.current.workspaceId === originalWorkspaceId)
        setFeedback(error instanceof Error ? error.message : String(error))
      return false
    }
  }
  const save = () => {
    let input
    try {
      input = scheduleFormInput(draft, workspaceId)
    } catch {
      setFeedback(copy.validation)
      return
    }
    const options = { idempotencyKey: crypto.randomUUID() }
    void execute(async () => {
      if (draft.id !== null && draft.expectedRevision !== null)
        await api.update({ ...input, scheduleId: draft.id, expectedRevision: draft.expectedRevision }, options)
      else await api.create(input, options)
    }).then((succeeded) => {
      if (succeeded && owner.current.workspaceId === workspaceId) {
        setDraft(newScheduleForm(draft.timezone))
        setPreview([])
      }
    })
  }
  const showPreview = async () => {
    const originalWorkspaceId = workspaceId
    const originalPreviewRevision = owner.current.previewRevision
    setPreviewPending(true)
    try {
      const input = scheduleFormInput(draft, workspaceId)
      const result = await api.preview({ spec: input.spec, timezone: input.timezone })
      if (
        owner.current.mounted &&
        owner.current.workspaceId === originalWorkspaceId &&
        owner.current.previewRevision === originalPreviewRevision
      ) {
        setPreview(result.occurrences)
        setFeedback(null)
      }
    } catch (error) {
      if (
        owner.current.mounted &&
        owner.current.workspaceId === originalWorkspaceId &&
        owner.current.previewRevision === originalPreviewRevision
      )
        setFeedback(error instanceof Error ? error.message : copy.validation)
    } finally {
      if (owner.current.mounted && owner.current.workspaceId === originalWorkspaceId) setPreviewPending(false)
    }
  }
  const toggle = (schedule: ScheduleDefinition) => {
    void execute(() =>
      api.update(
        {
          workspaceId: schedule.workspaceId,
          name: schedule.name,
          input: schedule.input,
          modelId: schedule.modelId,
          timezone: schedule.timezone,
          target: schedule.target,
          spec: schedule.spec,
          scheduleId: schedule.id,
          expectedRevision: schedule.revision,
          enabled: !schedule.enabled,
        },
        { idempotencyKey: crypto.randomUUID() },
      ),
    )
  }
  const body = (
    <LumenFrame as="section" className="hbar-schedule-page" aria-busy={snapshot.status === 'loading'}>
      <LumenFrame as="header">
        <LumenText as="h2">{copy.title}</LumenText>
        <LumenButton disabled={snapshot.status === 'loading'} onClick={() => void api.refresh(workspaceId)}>
          {copy.refresh}
        </LumenButton>
      </LumenFrame>
      {sessionLoad === 'error' ? (
        <LumenFrame role="alert">
          <LumenText as="p">{copy.sessionsFailed}</LumenText>
          <LumenButton onClick={() => void sessionTargets.refresh(workspaceId).catch(() => undefined)}>
            {copy.refresh}
          </LumenButton>
        </LumenFrame>
      ) : null}
      {targetCatalog.capacityReached ? <LumenText>{copy.sessionCapacity}</LumenText> : null}
      {snapshot.error ? (
        <LumenText as="p" role="alert" tone="danger">
          {snapshot.error}
        </LumenText>
      ) : null}
      {snapshot.mutation === 'unknown' ? (
        <LumenFrame role="alert">
          <LumenText as="p">{copy.unknown}</LumenText>
          <LumenButton onClick={() => void execute(() => api.reconcile())}>{copy.reconcile}</LumenButton>
        </LumenFrame>
      ) : null}
      <LumenScheduling03
        slots={{
          body: (
            <LumenFrame as="section" className="hbar-schedule-form">
              <LumenFormField controlId={`${formId}-name`} label={copy.name}>
                <LumenInput
                  value={draft.name}
                  maxLength={200}
                  disabled={busy}
                  onChange={(event) => patch({ name: event.currentTarget.value })}
                />
              </LumenFormField>
              <LumenFormField controlId={`${formId}-prompt`} label={copy.prompt}>
                <LumenTextarea
                  value={draft.prompt}
                  maxLength={200_000}
                  disabled={busy}
                  onChange={(event) => patch({ prompt: event.currentTarget.value })}
                />
              </LumenFormField>
              <LumenFormField controlId={`${formId}-model`} label={copy.model}>
                <LumenSelect
                  value={draft.modelId}
                  disabled={busy}
                  onChange={(event) => patch({ modelId: event.currentTarget.value })}
                >
                  <LumenOption value="">{copy.chooseModel}</LumenOption>
                  {models.map((model) => (
                    <LumenOption key={model.id} value={model.id}>
                      {copy.modelLabel(model.providerName, model.modelName)}
                    </LumenOption>
                  ))}
                </LumenSelect>
              </LumenFormField>
              {catalog.status === 'ready' && models.length === 0 ? <LumenText as="p">{copy.noModels}</LumenText> : null}
              <LumenFormField controlId={`${formId}-kind`} label={copy.type}>
                <LumenSelect
                  value={draft.kind}
                  disabled={busy}
                  onChange={(event) => {
                    const kind = event.currentTarget.value
                    if (kind === 'once' || kind === 'daily' || kind === 'weekly' || kind === 'cron') patch({ kind })
                  }}
                >
                  {Object.entries(copy.kinds).map(([kind, label]) => (
                    <LumenOption key={kind} value={kind}>
                      {label}
                    </LumenOption>
                  ))}
                </LumenSelect>
              </LumenFormField>
              <LumenFormField controlId={`${formId}-timezone`} label={copy.timezone}>
                <LumenInput
                  value={draft.timezone}
                  disabled={busy}
                  onChange={(event) => patch({ timezone: event.currentTarget.value })}
                />
              </LumenFormField>
              <LumenScheduling04
                slots={{
                  body: (
                    <LumenFrame as="section" className="hbar-schedule-time">
                      {draft.kind === 'once' ? (
                        <LumenFormField controlId={`${formId}-date`} label={copy.once}>
                          <LumenInput
                            type="datetime-local"
                            value={draft.date}
                            disabled={busy}
                            onChange={(event) => patch({ date: event.currentTarget.value })}
                          />
                        </LumenFormField>
                      ) : draft.kind === 'cron' ? (
                        <LumenFormField controlId={`${formId}-cron`} label={copy.cron}>
                          <LumenInput
                            value={draft.expression}
                            disabled={busy}
                            onChange={(event) => patch({ expression: event.currentTarget.value })}
                          />
                        </LumenFormField>
                      ) : (
                        <LumenFormField controlId={`${formId}-time`} label={copy.time}>
                          <LumenInput
                            type="time"
                            value={draft.time}
                            disabled={busy}
                            onChange={(event) => patch({ time: event.currentTarget.value })}
                          />
                        </LumenFormField>
                      )}
                      {draft.kind === 'weekly' ? (
                        <LumenFrame role="group" aria-label={copy.weekdays} className="hbar-schedule-weekdays">
                          {copy.weekdayNames.map((day, index) => (
                            <LumenButton
                              key={day}
                              disabled={busy}
                              aria-pressed={draft.weekdays.includes(index)}
                              variant={draft.weekdays.includes(index) ? 'contained' : 'outlined'}
                              onClick={() =>
                                patch({
                                  weekdays: draft.weekdays.includes(index)
                                    ? draft.weekdays.filter((value) => value !== index)
                                    : [...draft.weekdays, index].sort(),
                                })
                              }
                            >
                              {day}
                            </LumenButton>
                          ))}
                        </LumenFrame>
                      ) : null}
                    </LumenFrame>
                  ),
                }}
              />
              <LumenFormField controlId={`${formId}-target`} label={copy.target}>
                <LumenSelect
                  value={draft.target}
                  disabled={busy}
                  onChange={(event) =>
                    patch({
                      target: event.currentTarget.value === 'existing-session' ? 'existing-session' : 'new-session',
                    })
                  }
                >
                  <LumenOption value="new-session">{copy.newSession}</LumenOption>
                  <LumenOption value="existing-session">{copy.existingSession}</LumenOption>
                </LumenSelect>
              </LumenFormField>
              {draft.target === 'existing-session' ? (
                <LumenFormField controlId={`${formId}-session`} label={copy.existingSession}>
                  <LumenSelect
                    value={draft.sessionId}
                    disabled={busy}
                    onChange={(event) => patch({ sessionId: event.currentTarget.value })}
                  >
                    <LumenOption value="">{copy.chooseSession}</LumenOption>
                    {sessions.map((session) => (
                      <LumenOption key={session.id} value={session.id}>
                        {session.title}
                      </LumenOption>
                    ))}
                  </LumenSelect>
                </LumenFormField>
              ) : null}
              <LumenFrame as="footer">
                <LumenButton disabled={busy || previewPending} onClick={() => void showPreview()}>
                  {copy.preview}
                </LumenButton>
                <LumenButton tone="primary" disabled={busy} loading={snapshot.mutation === 'submitting'} onClick={save}>
                  {draft.id ? copy.save : copy.create}
                </LumenButton>
                {draft.id ? (
                  <LumenButton
                    disabled={busy}
                    onClick={() => {
                      setDraft(newScheduleForm(draft.timezone))
                      setPreview([])
                    }}
                  >
                    {copy.cancel}
                  </LumenButton>
                ) : null}
              </LumenFrame>
              {preview.length > 0 ? (
                <LumenFrame as="section" aria-label={copy.previewTitle}>
                  <LumenText as="h3">{copy.previewTitle}</LumenText>
                  <LumenCollection as="ol">
                    {preview.map((time) => (
                      <LumenCollectionItem key={time}>{copy.formatDate(time, draft.timezone)}</LumenCollectionItem>
                    ))}
                  </LumenCollection>
                </LumenFrame>
              ) : null}
              {feedback ? (
                <LumenText as="p" role="status">
                  {feedback}
                </LumenText>
              ) : null}
            </LumenFrame>
          ),
        }}
      />
      <LumenFrame as="section" className="hbar-schedule-list">
        {snapshot.schedules.length === 0 && snapshot.status !== 'loading' ? <LumenText>{copy.empty}</LumenText> : null}
        {snapshot.schedules.map((schedule) => (
          <LumenFrame as="article" key={schedule.id}>
            <LumenFrame as="header">
              <LumenText as="strong">{schedule.name}</LumenText>
              <LumenText>{schedule.enabled ? copy.enabled : copy.paused}</LumenText>
            </LumenFrame>
            <LumenText as="p">{copy.summary(copy.kinds[schedule.spec.kind], schedule.timezone)}</LumenText>
            <LumenFrame as="footer">
              <LumenButton
                disabled={busy}
                onClick={() => {
                  owner.current.previewRevision++
                  setDraft(editScheduleForm(schedule))
                  setPreview([])
                  setFeedback(null)
                }}
              >
                {copy.edit}
              </LumenButton>
              <LumenButton disabled={busy} onClick={() => toggle(schedule)}>
                {schedule.enabled ? copy.pause : copy.enable}
              </LumenButton>
              <LumenButton disabled={busy} onClick={() => void api.refreshOccurrences(schedule.id)}>
                {copy.occurrences}
              </LumenButton>
              <LumenButton tone="danger" disabled={busy} onClick={() => setConfirmDelete(schedule.id)}>
                {copy.delete}
              </LumenButton>
            </LumenFrame>
            {confirmDelete === schedule.id ? (
              <LumenFrame role="group" aria-label={copy.deleteConfirm(schedule.name)}>
                <LumenText>{copy.deleteConfirm(schedule.name)}</LumenText>
                <LumenButton
                  disabled={busy}
                  onClick={() =>
                    void execute(() =>
                      api.remove(
                        { scheduleId: schedule.id, expectedRevision: schedule.revision },
                        { idempotencyKey: crypto.randomUUID() },
                      ),
                    ).then((succeeded) => {
                      if (succeeded && owner.current.workspaceId === schedule.workspaceId) setConfirmDelete(null)
                    })
                  }
                >
                  {copy.delete}
                </LumenButton>
                <LumenButton onClick={() => setConfirmDelete(null)}>{copy.cancel}</LumenButton>
              </LumenFrame>
            ) : null}
            {snapshot.occurrences[schedule.id]?.length ? (
              <LumenCollection as="ol">
                {snapshot.occurrences[schedule.id]?.map((occurrence) => (
                  <LumenCollectionItem key={occurrence.id}>
                    {copy.occurrenceSummary(
                      copy.formatDate(occurrence.dueAt, schedule.timezone),
                      copy.occurrenceStatus[occurrence.status],
                    )}
                    {occurrence.error ? (
                      <LumenText as="p" role="alert">
                        {occurrence.error}
                      </LumenText>
                    ) : null}
                  </LumenCollectionItem>
                ))}
              </LumenCollection>
            ) : null}
            {snapshot.occurrenceNext[schedule.id] ? (
              <LumenButton onClick={() => void api.loadMoreOccurrences(schedule.id)}>{copy.more}</LumenButton>
            ) : null}
          </LumenFrame>
        ))}
        {snapshot.next ? <LumenButton onClick={() => void api.loadMore()}>{copy.more}</LumenButton> : null}
        {snapshot.capacityReached ? <LumenText role="status">{copy.capacity}</LumenText> : null}
      </LumenFrame>
    </LumenFrame>
  )
  return <LumenScheduling01 slots={{ body }} />
}
