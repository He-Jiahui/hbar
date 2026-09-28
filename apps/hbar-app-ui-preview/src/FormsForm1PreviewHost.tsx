import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  LumenFormsProvider,
  useLumenFormsContent,
  type LumenFormsContent,
  type LumenFormsForm1ViewModel,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { createFormsForm1PreviewStore } from './formsForm1PreviewStore'
import type { FormsForm1PreviewFixture } from './formsForm1PreviewFixtures'

export function FormsForm1PreviewHost({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: HbarAppUiVariantProps & {
  readonly content: LumenFormsContent
  readonly referenceFixture: FormsForm1PreviewFixture
  readonly children: ReactNode
}) {
  const parentContent = useLumenFormsContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(() => createFormsForm1PreviewStore(referenceFixture.storeSeed), [referenceFixture])
  const state = useStore(store)

  if (spec.category !== 'forms' || spec.variant !== 1) return children

  const preview = referenceFixture.contentFor(state)
  const notify = (actionId: string, value?: string) => {
    const handler = onActionRef.current
    if (!handler) return
    handler(value === undefined ? { variantId: spec.id, actionId } : { variantId: spec.id, actionId, value })
  }
  const notifyIfChanged = (actionId: string, changed: boolean, value?: string) => {
    if (changed) notify(actionId, value)
  }
  const surveyDeploymentReference: LumenFormsForm1ViewModel = {
    content: {
      copy: {
        pageTitle: preview.copy.pageTitle,
        description: preview.copy.description,
        progressLabel: preview.completion.label,
        surveyTitleLabel: preview.copy.surveyTitleLabel,
        stationCodeLabel: preview.copy.stationCodeLabel,
        stationCodeHelp: preview.copy.stationCodeHelp,
        vesselLabel: preview.copy.vesselLabel,
        deploymentLabel: preview.copy.deploymentLabel,
        deploymentHelp: preview.copy.deploymentHelp,
        recoveryLabel: preview.copy.recoveryLabel,
        dailyStartLabel: preview.copy.dailyStartLabel,
        methodsLabel: preview.copy.methodsLabel,
        methodInputLabel: preview.copy.methodInputLabel,
        methodInputPlaceholder: preview.copy.methodInputPlaceholder,
        suggestedLabel: preview.copy.suggestedLabel,
        leadCrewLabel: preview.copy.leadCrewLabel,
        dataReleaseLabel: preview.copy.dataReleaseLabel,
        embargoLabel: preview.copy.embargoLabel,
        photoLabel: preview.copy.photoLabel,
        photoRemoveLabel: preview.copy.photoRemoveLabel,
        cleanMessage: preview.copy.cleanMessage,
        dirtyMessage: preview.copy.dirtyMessage,
        revertLabel: preview.copy.revertLabel,
        saveLabel: preview.copy.saveLabel,
        savedLabel: preview.copy.savedLabel,
      },
      surveyTitle: preview.surveyTitle,
      stationCode: preview.stationCode,
      vessel: preview.vessel,
      deployment: preview.deployment,
      recovery: preview.recovery,
      dailyStart: preview.dailyStart,
      completion: preview.completion,
      methods: preview.methods,
      leadCrew: preview.leadCrew,
      dataRelease: preview.dataRelease,
      embargo: {
        rowLabel: preview.copy.embargoRowLabel,
        label: preview.embargo.label,
        checked: preview.embargo.checked,
      },
      stationPhoto: preview.stationPhoto,
      footer: preview.footer,
    },
    onTextChange(fieldId, value) {
      notifyIfChanged('edit-survey-text', store.getState().setTextField(fieldId, value))
    },
    onDateChange(fieldId, value) {
      notifyIfChanged('edit-survey-date', store.getState().setDateField(fieldId, value))
    },
    onDailyStartChange(value) {
      notifyIfChanged('edit-daily-start', store.getState().setDailyStart(value))
    },
    onMethodQueryChange(value) {
      notifyIfChanged('edit-method-query', store.getState().setMethodQuery(value))
    },
    onMethodAdd(methodId) {
      notifyIfChanged('add-sampling-method', store.getState().addMethod(methodId), methodId)
    },
    onMethodRemove(methodId) {
      notifyIfChanged('remove-sampling-method', store.getState().removeMethod(methodId), methodId)
    },
    onLeadCrewChange(choiceId) {
      notifyIfChanged('select-lead-crew', store.getState().selectLeadCrew(choiceId), choiceId)
    },
    onDataReleaseChange(choiceId) {
      notifyIfChanged('select-data-release', store.getState().selectDataRelease(choiceId), choiceId)
    },
    onEmbargoChange(checked) {
      notifyIfChanged('toggle-embargo', store.getState().setHoldForTwelveMonths(checked))
    },
    onPhotoRemove() {
      notify('request-photo-removal')
    },
    onRevert() {
      notifyIfChanged('revert-survey-plan', store.getState().revert())
    },
    onSavePlan() {
      if (store.getState().requestSave()) notify('request-save-plan')
    },
  }

  return (
    <LumenFormsProvider content={{ ...(parentContent ?? content), surveyDeploymentReference }}>
      {children}
    </LumenFormsProvider>
  )
}
