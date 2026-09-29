import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  LumenOnboardingProvider,
  useLumenOnboardingContent,
  type LumenOnboarding5ReferenceViewModel,
  type LumenOnboardingContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import type { Onboarding5PreviewFixture } from './onboarding5PreviewFixtures'
import { createOnboarding5PreviewStore } from './onboarding5PreviewStore'

export function Onboarding5PreviewHost({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: HbarAppUiVariantProps & {
  readonly content: LumenOnboardingContent
  readonly referenceFixture: Onboarding5PreviewFixture
  readonly children: ReactNode
}) {
  const parentContent = useLumenOnboardingContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(() => createOnboarding5PreviewStore(referenceFixture.seed), [referenceFixture.seed])
  const state = useStore(store)

  if (spec.category !== 'onboarding' || spec.variant !== 5) return children

  const preview = referenceFixture.contentFor(state)
  const notify = (actionId: string, value?: string) => {
    const handler = onActionRef.current
    if (!handler) return
    handler(value === undefined ? { variantId: spec.id, actionId } : { variantId: spec.id, actionId, value })
  }
  const notifyRequest = (actionId: string, request: unknown) => {
    if (request !== null) notify(actionId, JSON.stringify(request))
  }

  const invitationReference: LumenOnboarding5ReferenceViewModel = {
    content: {
      title: preview.labels.title,
      detail: preview.labels.detail,
      invitationLinkLabel: preview.labels.invitationLink,
      copyLinkLabel: preview.labels.copyLink,
      emailColumnLabel: preview.labels.emailColumn,
      emailPlaceholder: preview.labels.emailPlaceholder,
      roleColumnLabel: preview.labels.roleColumn,
      removeInvitationLabel: preview.labels.removeInvitation,
      addAnotherLabel: preview.labels.addAnother,
      skipLabel: preview.labels.skip,
      sendInvitationsLabel: preview.labels.sendInvitations,
      emptyRowsLabel: preview.labels.emptyRows,
      shareLink: preview.shareLink,
      invitationRows: preview.invitationRows,
      roleOptions: preview.roleOptions,
    },
    onEmailChange(invitationId, email) {
      if (store.getState().setEmail(invitationId, email)) notify('edit-invitation-email', invitationId)
    },
    onRoleChange(invitationId, roleId) {
      if (store.getState().selectRole(invitationId, roleId)) notify('select-invitation-role', invitationId)
    },
    onCopyRequest() {
      notifyRequest('request-copy-link', store.getState().requestCopyLink())
    },
    onAddRequest() {
      notifyRequest('request-add-invitation', store.getState().requestAddInvitation())
    },
    onRemoveRequest(invitationId) {
      notifyRequest('request-remove-invitation', store.getState().requestRemoveInvitation(invitationId))
    },
    onSkipRequest() {
      notifyRequest('request-skip', store.getState().requestSkip())
    },
    onSendRequest() {
      notifyRequest('request-send-invitations', store.getState().requestSendInvitations())
    },
  }

  return (
    <LumenOnboardingProvider content={{ ...(parentContent ?? content), invitationReference }}>
      {children}
    </LumenOnboardingProvider>
  )
}
