import { CommandPreviewHost } from './CommandPreviewHost'
import { EmptyStatePreviewHost } from './EmptyStatePreviewHost'
import { ChatPreviewHost } from './ChatPreviewHost'
import { BillingReferencePreviewHost } from './BillingReferencePreviewHost'
import { IntegrationReferencePreviewHost } from './IntegrationReferencePreviewHost'
import { AiChatReferencePreviewHost } from './AiChatReferencePreviewHost'
import { PromptReferencePreviewHost } from './PromptReferencePreviewHost'
import { AgentActivityPreviewHost } from './AgentActivityPreviewHost'
import { ToolCallsPreviewHost } from './ToolCallsPreviewHost'
import { AuthenticationReferencePreviewHost } from './AuthenticationReferencePreviewHost'
import { KanbanPreviewHost } from './KanbanPreviewHost'
import { WizardPreviewHost } from './WizardPreviewHost'
import { UsagePreviewHost } from './UsagePreviewHost'
import { AppShellPreviewHost } from './AppShellPreviewHost'
import { AppSidebarPreviewHost } from './AppSidebarPreviewHost'
import { NavbarPreviewHost } from './NavbarPreviewHost'
import { MobilePreviewHost } from './MobilePreviewHost'
import { CardPreviewHost } from './CardPreviewHost'
import { DataTablePreviewHost } from './DataTablePreviewHost'
import { DashboardPreviewHost } from './DashboardPreviewHost'
import { AnalyticsPreviewHost } from './AnalyticsPreviewHost'
import { ListPreviewHost } from './ListPreviewHost'
import { FilteringPreviewHost } from './FilteringPreviewHost'
import { FileManagerPreviewHost } from './FileManagerPreviewHost'
import { MonitoringPreviewHost } from './MonitoringPreviewHost'
import { PlanPreviewHost } from './PlanPreviewHost'
import { EditorPreviewHost } from './EditorPreviewHost'
import { FeedbackPreviewHost } from './FeedbackPreviewHost'
import { ApprovalPreviewHost } from './ApprovalPreviewHost'
import { CommentsPreviewHost } from './CommentsPreviewHost'
import { SchedulingPreviewHost } from './SchedulingPreviewHost'
import { PreviewSettingsScene } from './PreviewSettingsScene'
import { PreviewFormsScene } from './PreviewFormsScene'
import { PreviewOnboardingScene } from './PreviewOnboardingScene'
import { PreviewPaywallScene } from './PreviewPaywallScene'
import { PreviewSupportScene } from './PreviewSupportScene'
import type { PreviewHostProps } from './preview-scene-contract'
export function PreviewCategoryHost({ selected, onAction, fixtures, children }: PreviewHostProps) {
  const {
    editorContent,
    agentActivityContent,
    agentActivityLocalized,
    agentApprovalContent,
    agentPlanContent,
    navbarContent,
    toolCallsContent,
    feedbackContent,
    authenticationContent,
    authentication2ReferenceFixture,
    authentication3ReferenceFixture,
    authentication4ReferenceFixture,
    billingLocale,
    billingOutcome,
    billingContent,
    integrationsLocale,
    integrationsContent,
    commentsContent,
    schedulingContent,
    chatLocale,
    chatContent,
    chatPreviewOutcome,
    promptInputContent,
    promptReferenceLocale,
    promptReference,
    emptyStateContent,
    wizardContent,
    appShellContent,
    appSidebarContent,
    aiChatContent,
    aiChatLocale,
    aiChatReference,
    kanbanContent,
  } = fixtures
  switch (selected.spec.category) {
    case 'ai-chat':
      return (
        <AiChatReferencePreviewHost
          content={aiChatContent}
          reference={aiChatReference}
          locale={aiChatLocale}
          spec={selected.spec}
          onAction={onAction}
        >
          {children}
        </AiChatReferencePreviewHost>
      )
    case 'prompt-input':
      return (
        <PromptReferencePreviewHost
          content={promptInputContent}
          reference={promptReference}
          locale={promptReferenceLocale}
          spec={selected.spec}
          onAction={onAction}
        >
          {children}
        </PromptReferencePreviewHost>
      )
    case 'agent-activity':
      return (
        <AgentActivityPreviewHost
          content={agentActivityContent}
          spec={selected.spec}
          onAction={onAction}
          localized={agentActivityLocalized}
        >
          {children}
        </AgentActivityPreviewHost>
      )
    case 'tool-calls':
      return (
        <ToolCallsPreviewHost
          content={toolCallsContent}
          spec={selected.spec}
          onAction={onAction}
          localized={new URLSearchParams(window.location.search).get('toolCallsFixture') === 'localized'}
        >
          {children}
        </ToolCallsPreviewHost>
      )
    case 'agent-approval':
      return (
        <ApprovalPreviewHost
          content={agentApprovalContent}
          spec={selected.spec}
          localized={new URLSearchParams(window.location.search).get('agentApprovalFixture') === 'localized'}
        >
          {children}
        </ApprovalPreviewHost>
      )
    case 'agent-plan':
      return (
        <PlanPreviewHost
          content={agentPlanContent}
          spec={selected.spec}
          localized={new URLSearchParams(window.location.search).get('agentPlanFixture') === 'localized'}
        >
          {children}
        </PlanPreviewHost>
      )
    case 'ai-usage':
      return (
        <UsagePreviewHost spec={selected.spec} onAction={onAction}>
          {children}
        </UsagePreviewHost>
      )
    case 'app-shell':
      return (
        <AppShellPreviewHost content={appShellContent} spec={selected.spec} onAction={onAction}>
          {children}
        </AppShellPreviewHost>
      )
    case 'app-sidebar':
      return (
        <AppSidebarPreviewHost content={appSidebarContent} spec={selected.spec} onAction={onAction}>
          {children}
        </AppSidebarPreviewHost>
      )
    case 'command-menu':
      return (
        <CommandPreviewHost spec={selected.spec} onAction={onAction}>
          {children}
        </CommandPreviewHost>
      )
    case 'navbar':
      return (
        <NavbarPreviewHost content={navbarContent} spec={selected.spec} onAction={onAction}>
          {children}
        </NavbarPreviewHost>
      )
    case 'mobile':
      return (
        <MobilePreviewHost spec={selected.spec} onAction={onAction}>
          {children}
        </MobilePreviewHost>
      )
    case 'card':
      return (
        <CardPreviewHost spec={selected.spec} onAction={onAction}>
          {children}
        </CardPreviewHost>
      )
    case 'data-table':
      return (
        <DataTablePreviewHost spec={selected.spec} onAction={onAction}>
          {children}
        </DataTablePreviewHost>
      )
    case 'dashboard':
      return (
        <DashboardPreviewHost spec={selected.spec} onAction={onAction}>
          {children}
        </DashboardPreviewHost>
      )
    case 'analytics':
      return (
        <AnalyticsPreviewHost spec={selected.spec} onAction={onAction}>
          {children}
        </AnalyticsPreviewHost>
      )
    case 'list':
      return (
        <ListPreviewHost spec={selected.spec} onAction={onAction}>
          {children}
        </ListPreviewHost>
      )
    case 'filtering':
      return (
        <FilteringPreviewHost spec={selected.spec} onAction={onAction}>
          {children}
        </FilteringPreviewHost>
      )
    case 'file-manager':
      return (
        <FileManagerPreviewHost spec={selected.spec} onAction={onAction}>
          {children}
        </FileManagerPreviewHost>
      )
    case 'monitoring':
      return (
        <MonitoringPreviewHost spec={selected.spec} onAction={onAction}>
          {children}
        </MonitoringPreviewHost>
      )
    case 'empty-state':
      return (
        <EmptyStatePreviewHost content={emptyStateContent} spec={selected.spec} onAction={onAction}>
          {children}
        </EmptyStatePreviewHost>
      )
    case 'settings-form':
      return (
        <PreviewSettingsScene selected={selected} onAction={onAction} fixtures={fixtures}>
          {children}
        </PreviewSettingsScene>
      )
    case 'forms':
      return (
        <PreviewFormsScene selected={selected} onAction={onAction} fixtures={fixtures}>
          {children}
        </PreviewFormsScene>
      )
    case 'app-dialog':
      return children
    case 'notifications':
      return children
    case 'onboarding':
      return (
        <PreviewOnboardingScene selected={selected} onAction={onAction} fixtures={fixtures}>
          {children}
        </PreviewOnboardingScene>
      )
    case 'paywall':
      return (
        <PreviewPaywallScene selected={selected} onAction={onAction} fixtures={fixtures}>
          {children}
        </PreviewPaywallScene>
      )
    case 'authentication':
      return (
        <AuthenticationReferencePreviewHost
          content={authenticationContent}
          referenceFixture={authentication2ReferenceFixture}
          quoteReferenceFixture={authentication3ReferenceFixture}
          twoStepReferenceFixture={authentication4ReferenceFixture}
          spec={selected.spec}
          onAction={onAction}
        >
          {children}
        </AuthenticationReferencePreviewHost>
      )
    case 'kanban':
      return (
        <KanbanPreviewHost content={kanbanContent} spec={selected.spec} onAction={onAction}>
          {children}
        </KanbanPreviewHost>
      )
    case 'wizard':
      return (
        <WizardPreviewHost content={wizardContent} spec={selected.spec}>
          {children}
        </WizardPreviewHost>
      )
    case 'comments':
      return (
        <CommentsPreviewHost content={commentsContent} spec={selected.spec}>
          {children}
        </CommentsPreviewHost>
      )
    case 'scheduling':
      return (
        <SchedulingPreviewHost spec={selected.spec} content={schedulingContent}>
          {children}
        </SchedulingPreviewHost>
      )
    case 'integrations':
      return (
        <IntegrationReferencePreviewHost
          content={integrationsContent}
          spec={selected.spec}
          onAction={onAction}
          locale={integrationsLocale === 'de-long' ? 'de' : 'en'}
        >
          {children}
        </IntegrationReferencePreviewHost>
      )
    case 'editor':
      return (
        <EditorPreviewHost spec={selected.spec} content={editorContent}>
          {children}
        </EditorPreviewHost>
      )
    case 'feedback':
      return (
        <FeedbackPreviewHost spec={selected.spec} content={feedbackContent}>
          {children}
        </FeedbackPreviewHost>
      )
    case 'support':
      return (
        <PreviewSupportScene selected={selected} onAction={onAction} fixtures={fixtures}>
          {children}
        </PreviewSupportScene>
      )
    case 'billing':
      return (
        <BillingReferencePreviewHost
          content={billingContent}
          spec={selected.spec}
          onAction={onAction}
          locale={billingLocale}
          outcome={billingOutcome}
        >
          {children}
        </BillingReferencePreviewHost>
      )
    case 'chat':
      return (
        <ChatPreviewHost
          content={chatContent}
          spec={selected.spec}
          onAction={onAction}
          locale={chatLocale}
          submitPreviewOutcome={chatPreviewOutcome}
        >
          {children}
        </ChatPreviewHost>
      )
  }
}
