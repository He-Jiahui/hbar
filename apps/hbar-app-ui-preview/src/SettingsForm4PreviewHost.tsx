import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { LumenSettingsFormProvider, useLumenSettingsFormContent, type LumenSettingsFormContent } from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { createSettingsForm4PreviewStore } from './settingsForm4PreviewStore'
import type { SettingsForm4PreviewAssignableRoleId } from './settingsForm4PreviewStore'
import type { SettingsForm4PreviewFixture } from './settingsForm4PreviewFixtures'

export function SettingsForm4PreviewHost({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: HbarAppUiVariantProps & {
  readonly content: LumenSettingsFormContent
  readonly referenceFixture: SettingsForm4PreviewFixture
  readonly children: ReactNode
}) {
  const parentContent = useLumenSettingsFormContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(
    () =>
      createSettingsForm4PreviewStore(referenceFixture.storeSeed, {
        onRoleChange(memberId, roleId) {
          onActionRef.current?.({
            variantId: spec.id,
            actionId: 'change-team-member-role',
            value: `${memberId}:${roleId}`,
          })
        },
        onInvitePreviewRequested({ email, roleId }) {
          onActionRef.current?.({
            variantId: spec.id,
            actionId: 'add-local-invitation-preview',
            value: `${email}:${roleId}`,
          })
        },
        async onCopyEmailRequested(memberId, email) {
          if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.')
          await navigator.clipboard.writeText(email)
          onActionRef.current?.({
            variantId: spec.id,
            actionId: 'copy-team-member-email',
            value: memberId,
          })
        },
        onRemoveRequested(memberId) {
          onActionRef.current?.({
            variantId: spec.id,
            actionId: 'request-team-member-removal',
            value: memberId,
          })
        },
      }),
    [referenceFixture, spec.id],
  )
  const state = useStore(store)

  if (spec.category !== 'settings-form' || spec.variant !== 4) return children

  const membersReference = {
    content: referenceFixture.contentFor(state),
    onInviteEmailChange(value: string) {
      store.getState().setInviteEmail(value)
    },
    onInviteRoleChange(roleId: SettingsForm4PreviewAssignableRoleId) {
      store.getState().setInviteRole(roleId)
    },
    onInviteSubmit() {
      store.getState().submitInvitePreview()
    },
    onMemberRoleChange(memberId: string, roleId: SettingsForm4PreviewAssignableRoleId) {
      store.getState().changeMemberRole(memberId, roleId)
    },
    onToggleMemberMenu(memberId: string) {
      store.getState().toggleMemberMenu(memberId)
    },
    async onCopyEmail(memberId: string, _email: string) {
      await store.getState().copyMemberEmail(memberId)
    },
    onRemoveMember(memberId: string) {
      store.getState().requestRemoveMember(memberId)
    },
    onCloseMenu() {
      store.getState().closeMemberMenu()
    },
  } satisfies NonNullable<LumenSettingsFormContent['membersReference']>

  return (
    <LumenSettingsFormProvider content={{ ...(parentContent ?? content), membersReference }}>
      {children}
    </LumenSettingsFormProvider>
  )
}
