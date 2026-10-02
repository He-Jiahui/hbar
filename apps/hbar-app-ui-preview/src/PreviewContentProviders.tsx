import {
  HbarAppUiAiChatProvider,
  HbarAppUiAgentActivityProvider,
  HbarAppUiPaywallProvider,
  HbarAppUiBillingProvider,
  HbarAppUiIntegrationProvider,
  HbarAppUiChatProvider,
  HbarAppUiPromptInputProvider,
  HbarAppUiFormsProvider,
  HbarAppUiAppDialogProvider,
  HbarAppUiNotificationsProvider,
  HbarAppUiSupportProvider,
  HbarAppUiOnboardingProvider,
} from 'hbar-app-ui/catalog'
import { ShellPreviewHost } from './ShellPreviewHost'
import { ConversationPreviewHost } from './ConversationPreviewHost'
import type { PreviewHostProps } from './preview-scene-contract'
export function PreviewContentProviders({ selected, onAction, fixtures, children }: PreviewHostProps) {
  const {
    agentActivityContent,
    paywallContent,
    billingContent,
    integrationsContent,
    chatContent,
    promptInputContent,
    formsContent,
    appDialogContent,
    notificationsContent,
    supportContent,
    aiChatContent,
    onboardingContent,
  } = fixtures
  return (
    <HbarAppUiAiChatProvider content={aiChatContent}>
      <HbarAppUiBillingProvider content={billingContent}>
        <HbarAppUiIntegrationProvider content={integrationsContent}>
          <HbarAppUiChatProvider content={chatContent}>
            <HbarAppUiPromptInputProvider content={promptInputContent}>
              <HbarAppUiFormsProvider content={formsContent}>
                <HbarAppUiAppDialogProvider content={appDialogContent}>
                  <HbarAppUiNotificationsProvider content={notificationsContent}>
                    <HbarAppUiSupportProvider content={supportContent}>
                      <HbarAppUiOnboardingProvider content={onboardingContent}>
                        <HbarAppUiPaywallProvider content={paywallContent}>
                          <HbarAppUiAgentActivityProvider content={agentActivityContent}>
                            <ShellPreviewHost spec={selected.spec} onAction={onAction}>
                              <ConversationPreviewHost spec={selected.spec} onAction={onAction}>
                                {children}
                              </ConversationPreviewHost>
                            </ShellPreviewHost>
                          </HbarAppUiAgentActivityProvider>
                        </HbarAppUiPaywallProvider>
                      </HbarAppUiOnboardingProvider>
                    </HbarAppUiSupportProvider>
                  </HbarAppUiNotificationsProvider>
                </HbarAppUiAppDialogProvider>
              </HbarAppUiFormsProvider>
            </HbarAppUiPromptInputProvider>
          </HbarAppUiChatProvider>
        </HbarAppUiIntegrationProvider>
      </HbarAppUiBillingProvider>
    </HbarAppUiAiChatProvider>
  )
}
