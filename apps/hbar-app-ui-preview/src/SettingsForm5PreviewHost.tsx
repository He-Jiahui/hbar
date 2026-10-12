import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { LumenSettingsFormProvider, useLumenSettingsFormContent, type LumenSettingsFormContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import type { LumenSettingsForm5KeyAction, LumenSettingsForm5ViewModel } from '@lumen/app-ui/catalog'
import { createSettingsForm5PreviewStore } from './settingsForm5PreviewStore'
import type { SettingsForm5PreviewFixture } from './settingsForm5PreviewFixtures'

export function SettingsForm5PreviewHost(props: Parameters<typeof SettingsForm5PreviewOwner>[0]) {
  if (props.spec.category !== 'settings-form' || props.spec.variant !== 5) return props.children
  return <SettingsForm5PreviewOwner key={props.spec.id} {...props} />
}

function SettingsForm5PreviewOwner({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: HbarAppUiVariantProps & {
  readonly content: LumenSettingsFormContent
  readonly referenceFixture: SettingsForm5PreviewFixture
  readonly children: ReactNode
}) {
  const parentContent = useLumenSettingsFormContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(() => createSettingsForm5PreviewStore(referenceFixture.storeSeed), [referenceFixture])
  const state = useStore(store)

  if (spec.category !== 'settings-form' || spec.variant !== 5) return children

  const fixtureContent = referenceFixture.contentFor(state)
  const apiKeysReference = {
    content: {
      pageTitle: fixtureContent.copy.pageTitle,
      createKey: fixtureContent.copy.createKey,
      secretKeysTitle: fixtureContent.copy.secretKeysTitle,
      secretKeysDescription: fixtureContent.copy.secretKeysDescription,
      integrationsTitle: fixtureContent.copy.integrationsTitle,
      integrationsDescription: fixtureContent.copy.integrationsDescription,
      connected: fixtureContent.copy.connected,
      auditNote: fixtureContent.copy.auditNote,
      rotateKey: fixtureContent.copy.rotateKey,
      revokeKey: fixtureContent.copy.revokeKey,
      keys: fixtureContent.keys.map((key) => ({
        id: key.id,
        name: key.name,
        metadata: key.metadata,
        displayValue: key.displayValue,
        revealed: key.revealed,
        actionMenuOpen: key.actionMenuOpen,
        actionsAccessibleName: key.actionsAccessibleName,
        revealAccessibleName: key.revealAccessibleName,
        copyAccessibleName: key.copyAccessibleName,
      })),
      integrations: fixtureContent.integrations.map((integration) => ({
        id: integration.id,
        name: integration.name,
        description: integration.description,
        enabled: integration.enabled,
        connectedLabel: integration.connectedLabel,
      })),
    },
    onCreateKeyRequested() {
      onActionRef.current?.({
        variantId: spec.id,
        actionId: 'request-api-key-create-preview',
      })
    },
    onKeyActionsToggle(keyId: string) {
      store.getState().toggleKeyActions(keyId)
    },
    onKeyRevealToggle(keyId: string) {
      store.getState().toggleKeyReveal(keyId)
    },
    onKeyCopyRequested(keyId: string) {
      onActionRef.current?.({
        variantId: spec.id,
        actionId: 'request-api-key-copy-preview',
        value: keyId,
      })
    },
    onKeyActionRequested(event: { readonly keyId: string; readonly actionId: LumenSettingsForm5KeyAction }) {
      store.getState().closeKeyActions()
      onActionRef.current?.({
        variantId: spec.id,
        actionId:
          event.actionId === 'rotate' ? 'request-api-key-rotation-preview' : 'request-api-key-revocation-preview',
        value: event.keyId,
      })
    },
    onIntegrationChange(integrationId: string, enabled: boolean) {
      store.getState().setIntegrationEnabled(integrationId, enabled)
      onActionRef.current?.({
        variantId: spec.id,
        actionId: 'change-preview-integration-enabled',
        value: `${integrationId}:${enabled}`,
      })
    },
  } satisfies LumenSettingsForm5ViewModel

  return (
    <LumenSettingsFormProvider content={{ ...(parentContent ?? content), apiKeysReference }}>
      {children}
    </LumenSettingsFormProvider>
  )
}
