import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  LumenSettingsFormProvider,
  useLumenSettingsFormContent,
  type LumenSettingsForm6ReferenceProps,
  type LumenSettingsFormContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { createSettingsForm6PreviewStore, type SettingsForm6PreviewAction } from './settingsForm6PreviewStore'
import type { SettingsForm6PreviewFixture } from './settingsForm6PreviewFixtures'

export function SettingsForm6PreviewHost(props: Parameters<typeof SettingsForm6PreviewOwner>[0]) {
  if (props.spec.category !== 'settings-form' || props.spec.variant !== 6) return props.children
  return <SettingsForm6PreviewOwner key={props.spec.id} {...props} />
}

function SettingsForm6PreviewOwner({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: HbarAppUiVariantProps & {
  readonly content: LumenSettingsFormContent
  readonly referenceFixture: SettingsForm6PreviewFixture
  readonly children: ReactNode
}) {
  const parentContent = useLumenSettingsFormContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(
    () =>
      createSettingsForm6PreviewStore(referenceFixture.storeSeed, (action) => {
        onActionRef.current?.({
          variantId: spec.id,
          actionId:
            action.type === 'transfer'
              ? 'request-workspace-transfer-preview'
              : action.type === 'archive'
                ? 'request-workspace-archive-preview'
                : action.type === 'cancel'
                  ? 'callback-workspace-cancel-preview'
                  : action.type === 'review'
                    ? 'request-workspace-deletion-review-preview'
                    : 'callback-workspace-delete-preview',
          value: action.workspaceId,
        })
      }),
    [referenceFixture, spec.id],
  )
  const state = useStore(store)

  if (spec.category !== 'settings-form' || spec.variant !== 6) return children

  const fixtureContent = referenceFixture.contentFor(state)
  const dangerReference = {
    labels: {
      pageTitle: fixtureContent.copy.pageTitle,
      panelTitle: fixtureContent.copy.panelTitle,
      panelDescription: fixtureContent.copy.panelDescription,
      transferTitle: fixtureContent.copy.transferTitle,
      transferDescription: fixtureContent.copy.transferDescription,
      transferAction: fixtureContent.copy.transferAction,
      archiveTitle: fixtureContent.copy.archiveTitle,
      archiveDescription: fixtureContent.copy.archiveDescription,
      archiveAction: fixtureContent.copy.archiveAction,
      deleteTitle: fixtureContent.copy.deleteTitle,
      deleteDescription: fixtureContent.copy.deleteDescriptionFor(fixtureContent.workspace.name),
      deleteImpactHeading: fixtureContent.copy.deleteImpactHeadingFor(fixtureContent.workspace.memberCount),
      impactItems: fixtureContent.impacts,
      confirmationPrompt: fixtureContent.copy.confirmationPromptFor(fixtureContent.workspace.name),
      cancelAction: fixtureContent.copy.cancelAction,
      deleteAction: fixtureContent.copy.deleteAction,
      reviewAction: fixtureContent.copy.reviewAction,
      footerNote: fixtureContent.copy.footerNote,
    },
    workspace: {
      id: fixtureContent.workspace.id,
      name: fixtureContent.workspace.name,
      memberCount: fixtureContent.workspace.memberCount,
    },
    confirmationValue: fixtureContent.confirmationValue,
    confirmationVisible: fixtureContent.confirmationVisible,
    onConfirmationValueChange: state.setConfirmationValue,
    onAction: (action: SettingsForm6PreviewAction) => state.requestAction(action),
  } satisfies LumenSettingsForm6ReferenceProps

  return (
    <LumenSettingsFormProvider content={{ ...(parentContent ?? content), dangerReference }}>
      {children}
    </LumenSettingsFormProvider>
  )
}
