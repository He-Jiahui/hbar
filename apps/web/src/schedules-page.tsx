import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useHbarRuntimeState } from '@hbar/app-react'
import type { createAppRuntime } from '@hbar/app-runtime'
import {
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenPopupSelect,
  LumenContentText,
} from '@lumen/app-ui'
import { LumenFormField, LumenInput, LumenTextarea } from '@lumen/app-ui/forms'
import { LumenScheduling01, LumenScheduling03, LumenScheduling04 } from '@lumen/app-ui/scheduling'
import type { ScheduleDefinition } from '@hbar/contracts/commands/schedules'
import type { ShellLocale } from './shell-copy'
import { scheduleCopy, type ScheduleCopy } from './schedule-copy'
import { editScheduleForm, newScheduleForm, scheduleFormInput, type ScheduleFormDraft } from './schedule-form'
import './schedules-page.css'
import { createWorkspaceSessionTargets } from './workspace-session-targets'

type Runtime = ReturnType<typeof createAppRuntime>['view']

export function SchedulesPage(props: {
  readonly runtime: Runtime
  readonly workspaceId: string
  readonly locale: ShellLocale
  readonly initialScheduleId?: string
  readonly labels?: ScheduleCopy
}) {
  return props.runtime.state.schedules ? (
    <AvailableSchedulesPage {...props} api={props.runtime.state.schedules} />
  ) : (
    <LumenContentText context="feedback.paragraph">
      {(props.labels ?? scheduleCopy(props.locale)).unavailable}
    </LumenContentText>
  )
}

function AvailableSchedulesPage({
  runtime,
  workspaceId,
  locale,
  api,
  initialScheduleId,
  labels,
}: {
  readonly runtime: Runtime
  readonly workspaceId: string
  readonly locale: ShellLocale
  readonly api: NonNullable<Runtime['state']['schedules']>
  readonly initialScheduleId?: string
  readonly labels?: ScheduleCopy
}) {
  const copy = labels ?? scheduleCopy(locale)
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
        <LumenContentText context="section.title" level={2}>
          {copy.title}
        </LumenContentText>
        <LumenFrame className="hbar-schedule-action-group" role="group" aria-label={copy.title} tabIndex={0}>
          <LumenButton disabled={snapshot.status === 'loading'} onClick={() => void api.refresh(workspaceId)}>
            {copy.refresh}
          </LumenButton>
        </LumenFrame>
      </LumenFrame>
      {sessionLoad === 'error' ? (
        <LumenFrame role="alert">
          <LumenContentText context="feedback.paragraph" tone="danger">
            {copy.sessionsFailed}
          </LumenContentText>
          <LumenFrame className="hbar-schedule-action-group" role="group" aria-label={copy.sessionsFailed} tabIndex={0}>
            <LumenButton onClick={() => void sessionTargets.refresh(workspaceId).catch(() => undefined)}>
              {copy.refresh}
            </LumenButton>
          </LumenFrame>
        </LumenFrame>
      ) : null}
      {targetCatalog.capacityReached ? (
        <LumenContentText context="feedback.paragraph">{copy.sessionCapacity}</LumenContentText>
      ) : null}
      {snapshot.error ? (
        <LumenContentText context="feedback.paragraph" role="alert" tone="danger">
          {snapshot.error}
        </LumenContentText>
      ) : null}
      {snapshot.mutation === 'unknown' ? (
        <LumenFrame role="alert">
          <LumenContentText context="feedback.paragraph" tone="warning">
            {copy.unknown}
          </LumenContentText>
          <LumenFrame className="hbar-schedule-action-group" role="group" aria-label={copy.unknown} tabIndex={0}>
            <LumenButton onClick={() => void execute(() => api.reconcile())}>{copy.reconcile}</LumenButton>
          </LumenFrame>
        </LumenFrame>
      ) : null}
      <LumenScheduling03
        slots={{
          body: (
            <LumenFrame as="section" className="hbar-schedule-form">
              <LumenFormField controlId={`${formId}-name`} label={copy.name} layout="rows">
                <LumenInput
                  value={draft.name}
                  maxLength={200}
                  disabled={busy}
                  onChange={(event) => patch({ name: event.currentTarget.value })}
                />
              </LumenFormField>
              <LumenFormField controlId={`${formId}-prompt`} label={copy.prompt} layout="rows">
                <LumenTextarea
                  value={draft.prompt}
                  maxLength={200_000}
                  disabled={busy}
                  onChange={(event) => patch({ prompt: event.currentTarget.value })}
                />
              </LumenFormField>
              <LumenFormField controlId={`${formId}-model`} label={copy.model} layout="rows">
                <LumenPopupSelect
                  id={`${formId}-model`}
                  valueContext="choice.title"
                  value={draft.modelId || null}
                  placeholder={copy.chooseModel}
                  selectedLabel={draft.modelId || undefined}
                  options={models.map((model) => ({
                    id: model.id,
                    label: copy.modelLabel(model.providerName, model.modelName),
                  }))}
                  disabled={busy}
                  onValueChange={(value) => patch({ modelId: value })}
                />
              </LumenFormField>
              {catalog.status === 'ready' && models.length === 0 ? (
                <LumenContentText context="empty.description">{copy.noModels}</LumenContentText>
              ) : null}
              <LumenFormField controlId={`${formId}-kind`} label={copy.type} layout="rows">
                <LumenPopupSelect
                  id={`${formId}-kind`}
                  value={draft.kind}
                  options={Object.entries(copy.kinds).map(([id, label]) => ({ id, label }))}
                  disabled={busy}
                  onValueChange={(value) => {
                    const kind = value
                    if (kind === 'once' || kind === 'daily' || kind === 'weekly' || kind === 'cron') patch({ kind })
                  }}
                />
              </LumenFormField>
              <LumenFormField controlId={`${formId}-timezone`} label={copy.timezone} layout="rows">
                <LumenInput
                  value={draft.timezone}
                  maxLength={80}
                  disabled={busy}
                  onChange={(event) => patch({ timezone: event.currentTarget.value })}
                />
              </LumenFormField>
              <LumenScheduling04
                slots={{
                  body: (
                    <LumenFrame as="section" className="hbar-schedule-time">
                      {draft.kind === 'once' ? (
                        <LumenFormField controlId={`${formId}-date`} label={copy.once} layout="rows">
                          <LumenInput
                            type="datetime-local"
                            value={draft.date}
                            disabled={busy}
                            onChange={(event) => patch({ date: event.currentTarget.value })}
                          />
                        </LumenFormField>
                      ) : draft.kind === 'cron' ? (
                        <LumenFormField controlId={`${formId}-cron`} label={copy.cron} layout="rows">
                          <LumenInput
                            value={draft.expression}
                            maxLength={128}
                            disabled={busy}
                            onChange={(event) => patch({ expression: event.currentTarget.value })}
                          />
                        </LumenFormField>
                      ) : (
                        <LumenFormField controlId={`${formId}-time`} label={copy.time} layout="rows">
                          <LumenInput
                            type="time"
                            value={draft.time}
                            disabled={busy}
                            onChange={(event) => patch({ time: event.currentTarget.value })}
                          />
                        </LumenFormField>
                      )}
                      {draft.kind === 'weekly' ? (
                        <LumenFrame
                          role="group"
                          aria-label={copy.weekdays}
                          className="hbar-schedule-weekdays"
                          tabIndex={0}
                        >
                          {copy.weekdayNames.map((day, index) => (
                            <LumenButton
                              key={index}
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
              <LumenFormField controlId={`${formId}-target`} label={copy.target} layout="rows">
                <LumenPopupSelect
                  id={`${formId}-target`}
                  value={draft.target}
                  options={[
                    { id: 'new-session', label: copy.newSession },
                    { id: 'existing-session', label: copy.existingSession },
                  ]}
                  disabled={busy}
                  onValueChange={(value) =>
                    patch({
                      target: value === 'existing-session' ? 'existing-session' : 'new-session',
                    })
                  }
                />
              </LumenFormField>
              {draft.target === 'existing-session' ? (
                <LumenFormField controlId={`${formId}-session`} label={copy.existingSession} layout="rows">
                  <LumenPopupSelect
                    id={`${formId}-session`}
                    valueContext="choice.title"
                    value={draft.sessionId || null}
                    placeholder={copy.chooseSession}
                    selectedLabel={draft.sessionId || undefined}
                    options={sessions.map((session) => ({ id: session.id, label: session.title }))}
                    disabled={busy}
                    onValueChange={(value) => patch({ sessionId: value })}
                  />
                </LumenFormField>
              ) : null}
              <LumenFrame as="footer" className="hbar-schedule-form-actions">
                <LumenFrame
                  className="hbar-schedule-action-group hbar-schedule-secondary-actions"
                  role="group"
                  aria-label={copy.previewTitle}
                  tabIndex={0}
                >
                  <LumenButton disabled={busy || previewPending} onClick={() => void showPreview()}>
                    {copy.preview}
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
                <LumenFrame
                  className="hbar-schedule-action-group hbar-schedule-primary-actions"
                  role="group"
                  aria-label={copy.title}
                  tabIndex={0}
                >
                  <LumenButton
                    tone="primary"
                    disabled={busy}
                    loading={snapshot.mutation === 'submitting'}
                    onClick={save}
                  >
                    {draft.id ? copy.save : copy.create}
                  </LumenButton>
                </LumenFrame>
              </LumenFrame>
              {preview.length > 0 ? (
                <LumenFrame as="section" aria-label={copy.previewTitle}>
                  <LumenContentText context="section.title" level={3}>
                    {copy.previewTitle}
                  </LumenContentText>
                  <LumenCollection as="ol">
                    {preview.map((time) => (
                      <LumenCollectionItem key={time}>
                        <LumenContentText context="collection.detail">
                          {copy.formatDate(time, draft.timezone)}
                        </LumenContentText>
                      </LumenCollectionItem>
                    ))}
                  </LumenCollection>
                </LumenFrame>
              ) : null}
              {feedback ? (
                <LumenContentText context="feedback.paragraph" className="hbar-schedule-feedback" role="status">
                  {feedback}
                </LumenContentText>
              ) : null}
            </LumenFrame>
          ),
        }}
      />
      <LumenFrame as="section" className="hbar-schedule-list">
        {snapshot.schedules.length === 0 && snapshot.status !== 'loading' ? (
          <LumenContentText context="empty.description">{copy.empty}</LumenContentText>
        ) : null}
        {snapshot.schedules.map((schedule) => (
          <LumenFrame as="article" key={schedule.id}>
            <LumenFrame as="header">
              <LumenContentText context="collection.title">{schedule.name}</LumenContentText>
              <LumenContentText context="collection.detail">
                {schedule.enabled ? copy.enabled : copy.paused}
              </LumenContentText>
            </LumenFrame>
            <LumenContentText context="collection.description">
              {copy.summary(copy.kinds[schedule.spec.kind], schedule.timezone)}
            </LumenContentText>
            <LumenFrame as="footer" className="hbar-schedule-item-actions">
              <LumenFrame
                className="hbar-schedule-action-group hbar-schedule-secondary-actions"
                role="group"
                aria-label={schedule.name}
                tabIndex={0}
              >
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
              </LumenFrame>
              <LumenFrame
                className="hbar-schedule-action-group hbar-schedule-danger-actions"
                role="group"
                aria-label={copy.delete}
                tabIndex={0}
              >
                <LumenButton tone="danger" disabled={busy} onClick={() => setConfirmDelete(schedule.id)}>
                  {copy.delete}
                </LumenButton>
              </LumenFrame>
            </LumenFrame>
            {confirmDelete === schedule.id ? (
              <LumenFrame role="group" aria-label={copy.deleteConfirm(schedule.name)}>
                <LumenContentText context="feedback.paragraph" tone="warning">
                  {copy.deleteConfirm(schedule.name)}
                </LumenContentText>
                <LumenFrame className="hbar-schedule-action-group" role="group" aria-label={copy.delete} tabIndex={0}>
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
              </LumenFrame>
            ) : null}
            {snapshot.occurrences[schedule.id]?.length ? (
              <LumenCollection as="ol">
                {snapshot.occurrences[schedule.id]?.map((occurrence) => (
                  <LumenCollectionItem key={occurrence.id}>
                    <LumenContentText context="collection.description">
                      {copy.occurrenceSummary(
                        copy.formatDate(occurrence.dueAt, schedule.timezone),
                        copy.occurrenceStatus[occurrence.status],
                      )}
                    </LumenContentText>
                    {occurrence.error ? (
                      <LumenContentText context="feedback.paragraph" role="alert" tone="danger">
                        {occurrence.error}
                      </LumenContentText>
                    ) : null}
                  </LumenCollectionItem>
                ))}
              </LumenCollection>
            ) : null}
            {snapshot.occurrenceNext[schedule.id] ? (
              <LumenFrame
                className="hbar-schedule-action-group"
                role="group"
                aria-label={copy.occurrences}
                tabIndex={0}
              >
                <LumenButton onClick={() => void api.loadMoreOccurrences(schedule.id)}>{copy.more}</LumenButton>
              </LumenFrame>
            ) : null}
          </LumenFrame>
        ))}
        {snapshot.next ? (
          <LumenFrame className="hbar-schedule-action-group" role="group" aria-label={copy.title} tabIndex={0}>
            <LumenButton onClick={() => void api.loadMore()}>{copy.more}</LumenButton>
          </LumenFrame>
        ) : null}
        {snapshot.capacityReached ? (
          <LumenContentText context="feedback.paragraph" role="status">
            {copy.capacity}
          </LumenContentText>
        ) : null}
      </LumenFrame>
    </LumenFrame>
  )
  return <LumenScheduling01 slots={{ body }} />
}
