import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  LumenFormsProvider,
  useLumenFormsContent,
  type LumenForms5Content,
  type LumenForms5ViewModel,
  type LumenFormsContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import type { Forms5PreviewFixture } from './forms5PreviewFixtures'
import { createForms5PreviewStore } from './forms5PreviewStore'

type FormsForm5PreviewHostProps = HbarAppUiVariantProps & {
  readonly content: LumenFormsContent
  readonly referenceFixture: Forms5PreviewFixture
  readonly children: ReactNode
}

export function FormsForm5PreviewHost(props: FormsForm5PreviewHostProps) {
  if (props.spec.category !== 'forms' || props.spec.variant !== 5) return props.children
  return <FormsForm5PreviewHostOwner key={props.spec.id} {...props} />
}

function FormsForm5PreviewHostOwner({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: FormsForm5PreviewHostProps) {
  const parentContent = useLumenFormsContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(() => createForms5PreviewStore(referenceFixture.storeSeed), [referenceFixture])
  const state = useStore(store)
  const addressCheckSequence = useRef(0)

  const preview = referenceFixture.contentFor(state)
  const copy = preview.copy
  const referenceContent: LumenForms5Content = {
    copy: {
      pageTitle: copy.pageTitle,
      pageDescription: copy.pageDescription,
      organisationNameLabel: copy.organisationNameLabel,
      organisationNamePlaceholder: copy.organisationNamePlaceholder,
      organisationNameHelper: copy.organisationNameHelper,
      workspaceAddressLabel: copy.workspaceAddressLabel,
      workspaceAddressPlaceholder: copy.workspaceAddressPlaceholder,
      workspaceAddressSuffix: copy.workspaceAddressSuffix,
      workspaceAddressHelper: copy.workspaceAddressHelper,
      adminEmailLabel: copy.adminEmailLabel,
      adminEmailPlaceholder: copy.adminEmailPlaceholder,
      adminEmailHelper: copy.adminEmailHelper,
      passwordLabel: copy.passwordLabel,
      passwordPlaceholder: copy.passwordPlaceholder,
      showPasswordLabel: copy.showPasswordLabel,
      hidePasswordLabel: copy.hidePasswordLabel,
      confirmPasswordLabel: copy.confirmPasswordLabel,
      confirmPasswordPlaceholder: copy.confirmPasswordPlaceholder,
      confirmPasswordHelper: copy.confirmPasswordHelper,
      dataRegionLabel: copy.dataRegionLabel,
      dataRegionHelper: copy.dataRegionHelper,
      planLegend: copy.planLegend,
      consentLabel: copy.consentLabel,
      createWorkspaceLabel: copy.createWorkspaceLabel,
      statusText: preview.statusText,
      requiredMarker: copy.requiredMarker,
    },
    organisationName: preview.organisationName,
    workspaceAddress: preview.workspaceAddress,
    adminEmail: preview.adminEmail,
    password: {
      value: preview.password.value,
      visible: preview.password.visible,
      requirements: {
        minimumLength: {
          label: copy.passwordRequirementLabels.minimumLength,
          met: preview.password.requirements.minimumLength,
        },
        mixedCase: {
          label: copy.passwordRequirementLabels.mixedCase,
          met: preview.password.requirements.mixedCase,
        },
        number: {
          label: copy.passwordRequirementLabels.number,
          met: preview.password.requirements.number,
        },
        symbol: {
          label: copy.passwordRequirementLabels.symbol,
          met: preview.password.requirements.symbol,
        },
      },
    },
    confirmPassword: preview.confirmPassword,
    dataRegion: preview.dataRegion,
    plan: preview.plan,
    consent: preview.consent,
    createWorkspaceEnabled: preview.createWorkspaceEnabled,
    statusText: preview.statusText,
  }

  const notify = (actionId: string, value?: string) => {
    const handler = onActionRef.current
    if (!handler) return
    handler(value === undefined ? { variantId: spec.id, actionId } : { variantId: spec.id, actionId, value })
  }
  const notifyIfChanged = (actionId: string, changed: boolean, value?: string) => {
    if (changed) notify(actionId, value)
  }

  const workspaceProvisionReference: LumenForms5ViewModel = {
    content: referenceContent,
    onTextChange(fieldId, value) {
      const changed = store.getState().setTextField(fieldId, value)
      notifyIfChanged(
        `edit-workspace-${fieldId}`,
        changed,
        fieldId === 'password' || fieldId === 'confirmPassword' ? undefined : value,
      )
    },
    onCheckWorkspaceAddress(value) {
      const sequence = ++addressCheckSequence.current
      store.getState().setAddressAvailability(value, 'checking')
      notify('check-workspace-address', value)
      window.setTimeout(() => {
        if (sequence !== addressCheckSequence.current) return
        // `riverside` is the source-observed available demo slug; unknown values make no claim.
        store.getState().setAddressAvailability(value, value === 'riverside' ? 'available' : 'unchecked')
      }, 450)
    },
    onPasswordVisibilityToggle() {
      const visible = store.getState().togglePasswordVisibility()
      notify('toggle-workspace-password-visibility', visible ? 'visible' : 'masked')
    },
    onRegionChange(regionId) {
      notifyIfChanged('select-workspace-data-region', store.getState().selectRegion(regionId), regionId)
    },
    onPlanChange(planId) {
      notifyIfChanged('select-workspace-plan', store.getState().selectPlan(planId), planId)
    },
    onConsentChange(checked) {
      notifyIfChanged('set-workspace-consent', store.getState().setConsent(checked), checked ? 'accepted' : 'cleared')
    },
    onCreateWorkspace() {
      if (!store.getState().requestCreateWorkspace()) return
      notify('request-create-workspace')
    },
  }

  return (
    <LumenFormsProvider content={{ ...(parentContent ?? content), workspaceProvisionReference }}>
      {children}
    </LumenFormsProvider>
  )
}
