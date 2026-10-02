import { createChatReferencePreviewFixtures } from '../../../tests/fixtures/hbar-app-ui-chat-reference-fixtures'
import { createPromptReferenceFixture } from './promptReferencePreviewFixtures'
import { createAiChatReferencePreviewFixture } from './aiChatReferencePreviewFixtures'
import { createSupportThreadPreviewCopy } from './supportThreadPreviewCopy'
import { createSupportReferencePreviewFixtures } from '../../../tests/fixtures/hbar-app-ui-support-reference-fixtures'
import { createSupportTicketPreviewCopy, localizeSupportTicketPreviewContent } from './supportTicketPreviewCopy'
import {
  HBAR_APP_UI_EMPTY_STATE_FIXTURES,
  createEmptyStateLocalizedFixtures,
  createEmptyStateOverflowFixtures,
} from '../../../tests/fixtures/hbar-app-ui-empty-state-fixtures'
import { createAuthentication2PreviewFixture } from './authentication2PreviewFixtures'
import { createAuthentication3PreviewFixture } from './authentication3PreviewFixtures'
import { createAuthentication4PreviewFixture } from './authentication4PreviewFixtures'
import { useMemo } from 'react'
import {
  createHbarAppUiAgentApprovalLocalizedFixtures,
  createHbarAppUiAgentApprovalOverflowFixtures,
  HBAR_APP_UI_AGENT_APPROVAL_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-agent-approval-fixtures'
import {
  createHbarAppUiAgentPlanLocalizedFixtures,
  createHbarAppUiAgentPlanOverflowFixtures,
  HBAR_APP_UI_AGENT_PLAN_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-agent-plan-fixtures'
import {
  createHbarAppUiAgentActivityLocalizedFixtures,
  createHbarAppUiAgentActivityOverflowFixtures,
  HBAR_APP_UI_AGENT_ACTIVITY_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-agent-activity-fixtures'
import {
  createHbarAppUiEditorLocalizedFixtures,
  createHbarAppUiEditorOverflowFixtures,
  HBAR_APP_UI_EDITOR_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-editor-fixtures'
import {
  createHbarAppUiNavbarLocalizedFixtures,
  createHbarAppUiNavbarOverflowFixtures,
  HBAR_APP_UI_NAVBAR_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-navbar-fixtures'
import {
  createHbarAppUiToolCallsLocalizedFixtures,
  createHbarAppUiToolCallsOverflowFixtures,
  HBAR_APP_UI_TOOL_CALLS_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-tool-calls-fixtures'
import {
  createHbarAppUiPaywallLocalizedFixtures,
  createHbarAppUiPaywallOverflowFixtures,
  HBAR_APP_UI_PAYWALL_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-paywall-fixtures'
import {
  createHbarAppUiFeedbackLocalizedFixtures,
  createHbarAppUiFeedbackOverflowFixtures,
  HBAR_APP_UI_FEEDBACK_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-feedback-fixtures'
import {
  createHbarAppUiSettingsFormLocalizedFixtures,
  createHbarAppUiSettingsFormOverflowFixtures,
  HBAR_APP_UI_SETTINGS_FORM_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-settings-form-fixtures'
import { createSettingsForm1ReferencePreviewFixture } from './settingsForm1ReferenceFixtures'
import { createSettingsForm2PreviewFixture } from './settingsForm2PreviewFixtures'
import { createSettingsForm3PreviewFixture } from './settingsForm3PreviewFixtures'
import { createSettingsForm4PreviewFixture } from './settingsForm4PreviewFixtures'
import { createSettingsForm5PreviewFixture } from './settingsForm5PreviewFixtures'
import { createSettingsForm6PreviewFixture } from './settingsForm6PreviewFixtures'
import {
  createHbarAppUiAuthenticationLocalizedFixtures,
  createHbarAppUiAuthenticationOverflowFixtures,
  createHbarAppUiAuthenticationSignInFixture,
  HBAR_APP_UI_AUTHENTICATION_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-authentication-fixtures'
import { createBillingReferencePreviewFixtures } from '../../../tests/fixtures/hbar-app-ui-billing-reference-fixtures'
import { createIntegrationReferencePreviewFixtures } from '../../../tests/fixtures/hbar-app-ui-integrations-reference-fixtures'
import {
  HBAR_APP_UI_COMMENTS_FIXTURES,
  createHbarAppUiCommentsLocalizedFixtures,
  createHbarAppUiCommentsOverflowFixtures,
} from '../../../tests/fixtures/hbar-app-ui-comments-fixtures'
import {
  HBAR_APP_UI_SCHEDULING_FIXTURES,
  createHbarAppUiSchedulingLocalizedFixtures,
  createHbarAppUiSchedulingOverflowFixtures,
} from '../../../tests/fixtures/hbar-app-ui-scheduling-fixtures'
import {
  createHbarAppUiPromptInputLocalizedFixtures,
  HBAR_APP_UI_PROMPT_INPUT_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-prompt-input-fixtures'
import { HBAR_APP_UI_FORMS_FIXTURES } from '../../../tests/fixtures/hbar-app-ui-forms-fixtures'
import { createFormsForm1PreviewFixture } from './formsForm1PreviewFixtures'
import { createForms2PreviewFixture } from './forms2PreviewFixtures'
import { createForms3PreviewFixture } from './formsForm3PreviewFixtures'
import { createForms4PreviewFixture } from './forms4PreviewFixtures'
import { createForms5PreviewFixture } from './forms5PreviewFixtures'
import { createForms6PreviewFixture } from './forms6PreviewFixtures'
import { createForms7PreviewFixture } from './forms7PreviewFixtures'
import { createForms8PreviewFixture } from './forms8PreviewFixtures'
import { createForms9PreviewFixture } from './forms9PreviewFixtures'
import { createForms10PreviewFixture } from './forms10PreviewFixtures'
import { createForms11PreviewFixture } from './forms11PreviewFixtures'
import { createForms12PreviewFixture } from './forms12PreviewFixtures'
import { appDialogFixture } from '../../../tests/fixtures/hbar-app-ui-app-dialog-fixtures'
import {
  createHbarAppUiNotificationActivityFixture,
  createHbarAppUiNotificationBellFixture,
  createHbarAppUiNotificationPreferencesFixture,
  createHbarAppUiNotificationSystemFixture,
} from '../../../tests/fixtures/hbar-app-ui-notifications-fixtures'
import {
  createHbarAppUiWizardLocalizedFixtures,
  createHbarAppUiWizardOverflowFixtures,
  HBAR_APP_UI_WIZARD_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-wizard-fixtures'
import { HBAR_APP_UI_APP_SHELL_FIXTURES } from '../../../tests/fixtures/hbar-app-ui-app-shell-fixtures'
import { HBAR_APP_UI_APP_SIDEBAR_FIXTURES } from '../../../tests/fixtures/hbar-app-ui-app-sidebar-fixtures'
import {
  createHbarAppUiAiChatLocalizedFixtures,
  HBAR_APP_UI_AI_CHAT_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-ai-chat-fixtures'
import {
  createHbarAppUiKanbanLocalizedFixtures,
  createHbarAppUiKanbanOverflowFixtures,
  HBAR_APP_UI_KANBAN_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-kanban-fixtures'
import { HBAR_APP_UI_ONBOARDING_FIXTURES } from '../../../tests/fixtures/hbar-app-ui-onboarding-fixtures'
import { createOnboarding2PreviewFixture } from './onboarding2PreviewFixtures'
import { createOnboarding3PreviewFixture } from './onboarding3PreviewFixtures'
import { createOnboarding4PreviewFixture } from './onboarding4PreviewFixtures'
import { createOnboarding5PreviewFixture } from './onboarding5PreviewFixtures'
import { createOnboarding6PreviewFixture } from './onboarding6PreviewFixtures'
import { createOnboarding7PreviewFixture } from './onboarding7PreviewFixtures'
import { createPaywall4PreviewFixture } from './paywall4PreviewFixtures'
import { createPaywall5PreviewFixture } from './paywall5PreviewFixtures'
import { createPaywall3PreviewFixture } from './paywall3PreviewFixtures'
import { createPaywall6PreviewFixture } from './paywall6PreviewFixtures'
import { createPaywall7PreviewFixture } from './paywall7PreviewFixtures'
import { createOnboarding1PreviewFixture } from './onboarding1PreviewFixtures'
export function usePreviewFixtures(variant: number) {
  const editorContent = useMemo(() => {
    switch (new URLSearchParams(window.location.search).get('editorFixture')) {
      case 'overflow':
        return createHbarAppUiEditorOverflowFixtures()
      case 'localized':
        return createHbarAppUiEditorLocalizedFixtures()
      case null:
      default:
        return HBAR_APP_UI_EDITOR_FIXTURES
    }
  }, [])
  const agentActivityContent = useMemo(() => {
    switch (new URLSearchParams(window.location.search).get('agentActivityFixture')) {
      case 'overflow':
        return createHbarAppUiAgentActivityOverflowFixtures()
      case 'localized':
        return createHbarAppUiAgentActivityLocalizedFixtures()
      case null:
      default:
        return HBAR_APP_UI_AGENT_ACTIVITY_FIXTURES
    }
  }, [])
  const agentActivityLocalized = new URLSearchParams(window.location.search).get('agentActivityFixture') === 'localized'
  const agentApprovalContent = useMemo(() => {
    switch (new URLSearchParams(window.location.search).get('agentApprovalFixture')) {
      case 'overflow':
        return createHbarAppUiAgentApprovalOverflowFixtures()
      case 'localized':
        return createHbarAppUiAgentApprovalLocalizedFixtures()
      case null:
      default:
        return HBAR_APP_UI_AGENT_APPROVAL_FIXTURES
    }
  }, [])
  const agentPlanContent = useMemo(() => {
    switch (new URLSearchParams(window.location.search).get('agentPlanFixture')) {
      case 'overflow':
        return createHbarAppUiAgentPlanOverflowFixtures()
      case 'localized':
        return createHbarAppUiAgentPlanLocalizedFixtures()
      case null:
      default:
        return HBAR_APP_UI_AGENT_PLAN_FIXTURES
    }
  }, [])
  const navbarContent = useMemo(() => {
    switch (new URLSearchParams(window.location.search).get('navbarFixture')) {
      case 'overflow':
        return createHbarAppUiNavbarOverflowFixtures()
      case 'localized':
        return createHbarAppUiNavbarLocalizedFixtures()
      case null:
      default:
        return HBAR_APP_UI_NAVBAR_FIXTURES
    }
  }, [])
  const toolCallsContent = useMemo(() => {
    switch (new URLSearchParams(window.location.search).get('toolCallsFixture')) {
      case 'overflow':
        return createHbarAppUiToolCallsOverflowFixtures()
      case 'localized':
        return createHbarAppUiToolCallsLocalizedFixtures()
      case null:
      default:
        return HBAR_APP_UI_TOOL_CALLS_FIXTURES
    }
  }, [])
  const paywallContent = useMemo(() => {
    switch (new URLSearchParams(window.location.search).get('paywallFixture')) {
      case 'overflow':
        return createHbarAppUiPaywallOverflowFixtures()
      case 'localized':
        return createHbarAppUiPaywallLocalizedFixtures()
      case null:
      default:
        return HBAR_APP_UI_PAYWALL_FIXTURES
    }
  }, [])
  const feedbackContent = useMemo(() => {
    switch (new URLSearchParams(window.location.search).get('feedbackFixture')) {
      case 'overflow':
        return createHbarAppUiFeedbackOverflowFixtures()
      case 'localized':
        return createHbarAppUiFeedbackLocalizedFixtures()
      case null:
      default:
        return HBAR_APP_UI_FEEDBACK_FIXTURES
    }
  }, [])
  const settingsFormContent = useMemo(() => {
    switch (new URLSearchParams(window.location.search).get('settingsFormFixture')) {
      case 'overflow':
        return createHbarAppUiSettingsFormOverflowFixtures()
      case 'localized':
        return createHbarAppUiSettingsFormLocalizedFixtures()
      case null:
      default:
        return HBAR_APP_UI_SETTINGS_FORM_FIXTURES
    }
  }, [])
  const settingsForm1ReferenceFixture = useMemo(() => {
    const fixture = new URLSearchParams(window.location.search).get('settingsFormFixture')
    return createSettingsForm1ReferencePreviewFixture(
      fixture === 'localized' ? 'de' : 'en',
      fixture === 'save-failure' ? 'fail-once' : 'success',
    )
  }, [])
  const settingsForm2ReferenceFixture = useMemo(
    () =>
      createSettingsForm2PreviewFixture(
        new URLSearchParams(window.location.search).get('settingsFormFixture') === 'localized' ? 'de' : 'en',
      ),
    [],
  )
  const settingsForm3ReferenceFixture = useMemo(
    () =>
      createSettingsForm3PreviewFixture(
        new URLSearchParams(window.location.search).get('settingsFormFixture') === 'localized' ? 'de' : 'en',
      ),
    [],
  )
  const settingsForm4ReferenceFixture = useMemo(
    () =>
      createSettingsForm4PreviewFixture(
        new URLSearchParams(window.location.search).get('settingsFormFixture') === 'localized' ? 'de' : 'en',
      ),
    [],
  )
  const settingsForm5ReferenceFixture = useMemo(
    () =>
      createSettingsForm5PreviewFixture(
        new URLSearchParams(window.location.search).get('settingsFormFixture') === 'localized' ? 'de' : 'en',
      ),
    [],
  )
  const settingsForm6ReferenceFixture = useMemo(
    () =>
      createSettingsForm6PreviewFixture({
        locale: new URLSearchParams(window.location.search).get('settingsFormFixture') === 'localized' ? 'de' : 'en',
      }),
    [],
  )
  const authenticationContent = useMemo(() => {
    switch (new URLSearchParams(window.location.search).get('authenticationFixture')) {
      case 'overflow':
        return createHbarAppUiAuthenticationOverflowFixtures()
      case 'localized':
        return createHbarAppUiAuthenticationLocalizedFixtures()
      case 'sign-in-failure':
      case 'sign-in-retry':
      case 'sign-in-unavailable':
      case 'sign-in-empty':
      case 'sign-in-one':
      case 'sign-in-duplicate':
      case 'sign-in-overbound':
        return createHbarAppUiAuthenticationSignInFixture(
          new URLSearchParams(window.location.search).get('authenticationFixture'),
        )
      case null:
      default:
        return HBAR_APP_UI_AUTHENTICATION_FIXTURES
    }
  }, [])
  const authentication2ReferenceFixture = useMemo(() => {
    const parameters = new URLSearchParams(window.location.search)
    const fixture = parameters.get('authentication2Fixture') ?? parameters.get('authenticationFixture')
    const capacity = parameters.get('authentication2Capacity') ?? fixture
    return createAuthentication2PreviewFixture(
      fixture === 'long' ? 'de-long' : fixture === 'localized' ? 'de' : 'en',
      capacity === 'empty' || capacity === 'one' || capacity === 'boundary' || capacity === 'overflow'
        ? capacity
        : 'source',
    )
  }, [])
  const authentication3ReferenceFixture = useMemo(() => {
    const parameters = new URLSearchParams(window.location.search)
    const fixture = parameters.get('authentication3Fixture') ?? parameters.get('authenticationFixture')
    const capacity = parameters.get('authentication3Capacity') ?? fixture
    return createAuthentication3PreviewFixture(
      fixture === 'long' ? 'de-long' : fixture === 'localized' ? 'de' : 'en',
      capacity === 'empty' || capacity === 'one' || capacity === 'boundary' || capacity === 'overflow'
        ? capacity
        : 'source',
      parameters.get('authentication3Metrics') === 'overflow' ? 'overflow' : 'source',
    )
  }, [])
  const authentication4ReferenceFixture = useMemo(() => {
    const parameters = new URLSearchParams(window.location.search)
    const fixture = parameters.get('authentication4Fixture') ?? parameters.get('authenticationFixture')
    const scenario = parameters.get('authentication4Scenario')
    return createAuthentication4PreviewFixture(
      fixture === 'long' ? 'de-long' : fixture === 'localized' ? 'de' : 'en',
      scenario === 'password' || scenario === 'invalid' ? scenario : 'source',
    )
  }, [])
  const billingLocale = useMemo(
    () => (new URLSearchParams(window.location.search).get('billingFixture') === 'localized' ? 'de' : 'en'),
    [],
  )
  const billingOutcome = useMemo(
    () => (new URLSearchParams(window.location.search).get('billingOutcome') === 'failed' ? 'failed' : 'confirmed'),
    [],
  )
  const billingContent = useMemo(
    () =>
      createBillingReferencePreviewFixtures(
        billingLocale === 'de' ? 'de-long' : 'en',
        new URLSearchParams(window.location.search).get('billingFixture') === 'overflow',
      ),
    [billingLocale],
  )
  const integrationsLocale = useMemo(
    () => (new URLSearchParams(window.location.search).get('integrationsFixture') === 'localized' ? 'de-long' : 'en'),
    [],
  )
  const integrationsContent = useMemo(
    () =>
      createIntegrationReferencePreviewFixtures(
        integrationsLocale,
        new URLSearchParams(window.location.search).get('integrationsFixture') === 'overflow',
      ),
    [integrationsLocale],
  )
  const commentsContent = useMemo(() => {
    const fixture = new URLSearchParams(window.location.search).get('commentsFixture')
    return fixture === 'localized'
      ? createHbarAppUiCommentsLocalizedFixtures()
      : fixture === 'overflow'
        ? createHbarAppUiCommentsOverflowFixtures()
        : HBAR_APP_UI_COMMENTS_FIXTURES
  }, [])
  const schedulingContent = useMemo(() => {
    const fixture = new URLSearchParams(window.location.search).get('schedulingFixture')
    return fixture === 'localized'
      ? createHbarAppUiSchedulingLocalizedFixtures()
      : fixture === 'overflow'
        ? createHbarAppUiSchedulingOverflowFixtures()
        : HBAR_APP_UI_SCHEDULING_FIXTURES
  }, [])
  const chatLocale = useMemo(
    () => (new URLSearchParams(window.location.search).get('chatFixture') === 'localized' ? 'de-long' : 'en'),
    [],
  )
  const chatContent = useMemo(() => createChatReferencePreviewFixtures(chatLocale), [chatLocale])
  const chatPreviewOutcome = useMemo(
    () => (new URLSearchParams(window.location.search).get('chatOutcome') === 'failed' ? 'failed' : 'confirmed'),
    [],
  )
  const promptInputContent = useMemo(
    () =>
      new URLSearchParams(window.location.search).get('promptInputFixture') === 'localized'
        ? createHbarAppUiPromptInputLocalizedFixtures()
        : HBAR_APP_UI_PROMPT_INPUT_FIXTURES,
    [],
  )
  const promptReferenceLocale =
    new URLSearchParams(window.location.search).get('promptInputFixture') === 'localized' ? 'zh' : 'en'
  const promptReference = useMemo(
    () => createPromptReferenceFixture(variant, promptReferenceLocale),
    [variant, promptReferenceLocale],
  )
  const emptyStateContent = useMemo(() => {
    const fixture = new URLSearchParams(window.location.search).get('emptyStateFixture')
    return fixture === 'localized' || fixture === 'long'
      ? createEmptyStateLocalizedFixtures(fixture === 'long' ? 'de-long' : 'de')
      : fixture === 'overflow'
        ? createEmptyStateOverflowFixtures()
        : HBAR_APP_UI_EMPTY_STATE_FIXTURES
  }, [])
  const formsContent = useMemo(() => HBAR_APP_UI_FORMS_FIXTURES, [])
  const formsForm1ReferenceFixture = useMemo(
    () =>
      createFormsForm1PreviewFixture(
        new URLSearchParams(window.location.search).get('formsForm1Fixture') === 'localized' ? 'de' : 'en',
      ),
    [],
  )
  const forms2ReferenceFixture = useMemo(
    () =>
      createForms2PreviewFixture(
        new URLSearchParams(window.location.search).get('forms2Fixture') === 'localized' ? 'de' : 'en',
      ),
    [],
  )
  const forms3ReferenceFixture = useMemo(
    () =>
      createForms3PreviewFixture(
        new URLSearchParams(window.location.search).get('formsForm3Fixture') === 'localized' ? 'de' : 'en',
      ),
    [],
  )
  const forms4ReferenceFixture = useMemo(
    () =>
      createForms4PreviewFixture(
        new URLSearchParams(window.location.search).get('forms4Fixture') === 'localized' ? 'de' : 'en',
      ),
    [],
  )
  const forms5ReferenceFixture = useMemo(
    () =>
      createForms5PreviewFixture(
        new URLSearchParams(window.location.search).get('forms5Fixture') === 'localized' ? 'de' : 'en',
      ),
    [],
  )
  const forms6ReferenceFixture = useMemo(
    () =>
      createForms6PreviewFixture(
        new URLSearchParams(window.location.search).get('forms6Fixture') === 'localized' ? 'de' : 'en',
      ),
    [],
  )
  const forms7ReferenceFixture = useMemo(
    () =>
      createForms7PreviewFixture(
        new URLSearchParams(window.location.search).get('forms7Fixture') === 'localized' ? 'de' : 'en',
      ),
    [],
  )
  const forms8ReferenceFixture = useMemo(
    () =>
      createForms8PreviewFixture(
        new URLSearchParams(window.location.search).get('forms8Fixture') === 'localized' ? 'de' : 'en',
      ),
    [],
  )
  const forms9ReferenceFixture = useMemo(
    () =>
      createForms9PreviewFixture(
        new URLSearchParams(window.location.search).get('forms9Fixture') === 'localized' ? 'de' : 'en',
      ),
    [],
  )
  const forms10ReferenceFixture = useMemo(
    () =>
      createForms10PreviewFixture(
        new URLSearchParams(window.location.search).get('forms10Fixture') === 'localized' ? 'de' : 'en',
      ),
    [],
  )
  const forms11ReferenceFixture = useMemo(
    () =>
      createForms11PreviewFixture(
        new URLSearchParams(window.location.search).get('forms11Fixture') === 'localized' ? 'de' : 'en',
      ),
    [],
  )
  const forms12ReferenceFixture = useMemo(
    () =>
      createForms12PreviewFixture(
        new URLSearchParams(window.location.search).get('forms12Fixture') === 'localized' ? 'de' : 'en',
      ),
    [],
  )
  const appDialogContent = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return appDialogFixture(
      params.get('appDialogMenuFixture') ??
        params.get('appDialogEvidenceFixture') ??
        params.get('appDialogAlertFixture') ??
        params.get('appDialogWizardFixture') ??
        params.get('appDialogDeleteFixture'),
    )
  }, [])
  const notificationsContent = useMemo(
    () =>
      createHbarAppUiNotificationBellFixture(
        new URLSearchParams(window.location.search).get('bellFixture'),
        createHbarAppUiNotificationSystemFixture(
          new URLSearchParams(window.location.search).get('systemFixture'),
          createHbarAppUiNotificationActivityFixture(
            new URLSearchParams(window.location.search).get('activityFixture'),
            createHbarAppUiNotificationPreferencesFixture(
              new URLSearchParams(window.location.search).get('notificationsFixture'),
            ),
          ),
        ),
      ),
    [],
  )
  const supportLocale = useMemo(
    () => (new URLSearchParams(window.location.search).get('supportFixture') === 'localized' ? 'de' : 'en'),
    [],
  )
  const supportContent = useMemo(
    () =>
      localizeSupportTicketPreviewContent(
        createSupportReferencePreviewFixtures(supportLocale === 'de' ? 'de-long' : 'en'),
        supportLocale,
      ),
    [supportLocale],
  )
  const supportTicketCopy = useMemo(() => createSupportTicketPreviewCopy(supportLocale), [supportLocale])
  const supportThreadCopy = useMemo(() => createSupportThreadPreviewCopy(supportLocale), [supportLocale])
  const supportReplyOutcome = useMemo(
    () =>
      new URLSearchParams(window.location.search).get('supportReplyOutcome') === 'failed' ? 'failed' : 'confirmed',
    [],
  )
  const supportAssistantOutcome = useMemo(
    () =>
      new URLSearchParams(window.location.search).get('supportAssistantOutcome') === 'failed' ? 'failed' : 'confirmed',
    [],
  )
  const supportTicketOutcome = useMemo(
    () => (new URLSearchParams(window.location.search).get('supportOutcome') === 'failed' ? 'failed' : 'confirmed'),
    [],
  )
  const wizardContent = useMemo(() => {
    const fixture = new URLSearchParams(window.location.search).get('wizardFixture')
    return fixture === 'localized'
      ? createHbarAppUiWizardLocalizedFixtures()
      : fixture === 'overflow'
        ? createHbarAppUiWizardOverflowFixtures()
        : HBAR_APP_UI_WIZARD_FIXTURES
  }, [])
  const appShellContent = useMemo(() => HBAR_APP_UI_APP_SHELL_FIXTURES, [])
  const appSidebarContent = useMemo(() => HBAR_APP_UI_APP_SIDEBAR_FIXTURES, [])
  const aiChatContent = useMemo(
    () =>
      new URLSearchParams(window.location.search).get('aiChatFixture') === 'localized'
        ? createHbarAppUiAiChatLocalizedFixtures()
        : HBAR_APP_UI_AI_CHAT_FIXTURES,
    [],
  )
  const aiChatLocale = new URLSearchParams(window.location.search).get('aiChatFixture') === 'localized' ? 'zh' : 'en'
  const aiChatReference = useMemo(
    () => createAiChatReferencePreviewFixture(variant, aiChatLocale),
    [variant, aiChatLocale],
  )
  const kanbanContent = useMemo(() => {
    const fixture = new URLSearchParams(window.location.search).get('kanbanFixture')
    return fixture === 'localized'
      ? createHbarAppUiKanbanLocalizedFixtures()
      : fixture === 'overflow'
        ? createHbarAppUiKanbanOverflowFixtures()
        : HBAR_APP_UI_KANBAN_FIXTURES
  }, [])
  const onboardingContent = useMemo(() => HBAR_APP_UI_ONBOARDING_FIXTURES, [])
  const onboarding1ReferenceFixture = useMemo(
    () =>
      createOnboarding1PreviewFixture(
        new URLSearchParams(window.location.search).get('onboarding1Fixture') === 'localized' ? 'de' : 'en',
      ),
    [],
  )
  const onboarding2ReferenceFixture = useMemo(
    () =>
      createOnboarding2PreviewFixture(
        new URLSearchParams(window.location.search).get('onboarding2Fixture') === 'localized' ? 'de' : 'en',
      ),
    [],
  )
  const onboarding3ReferenceFixture = useMemo(
    () =>
      createOnboarding3PreviewFixture(
        new URLSearchParams(window.location.search).get('onboarding3Fixture') === 'localized' ? 'de' : 'en',
      ),
    [],
  )
  const onboarding4ReferenceFixture = useMemo(
    () =>
      createOnboarding4PreviewFixture(
        new URLSearchParams(window.location.search).get('onboarding4Fixture') === 'localized' ? 'de' : 'en',
      ),
    [],
  )
  const onboarding5ReferenceFixture = useMemo(() => {
    const requested = new URLSearchParams(window.location.search).get('onboarding5Fixture')
    return createOnboarding5PreviewFixture(requested === 'localized' ? 'de' : requested === 'long' ? 'de-long' : 'en')
  }, [])
  const onboarding6ReferenceFixture = useMemo(() => {
    const requested = new URLSearchParams(window.location.search).get('onboarding6Fixture')
    return createOnboarding6PreviewFixture(requested === 'localized' ? 'de' : requested === 'long' ? 'de-long' : 'en')
  }, [])
  const onboarding7ReferenceFixture = useMemo(() => {
    const requested = new URLSearchParams(window.location.search).get('onboarding7Fixture')
    return createOnboarding7PreviewFixture(requested === 'localized' ? 'de' : requested === 'long' ? 'de-long' : 'en')
  }, [])
  const paywall4ReferenceFixture = useMemo(() => {
    const parameters = new URLSearchParams(window.location.search)
    const requested = parameters.get('paywall4Fixture')
    const capacity = parameters.get('paywall4Capacity')
    return createPaywall4PreviewFixture(
      requested === 'localized' ? 'de' : requested === 'long' ? 'de-long' : 'en',
      capacity === 'empty' || capacity === 'one' || capacity === 'boundary' || capacity === 'overflow'
        ? capacity
        : 'source',
    )
  }, [])
  const paywall5ReferenceFixture = useMemo(() => {
    const parameters = new URLSearchParams(window.location.search)
    const requested = parameters.get('paywall5Fixture')
    const capacity = parameters.get('paywall5Capacity')
    return createPaywall5PreviewFixture(
      requested === 'localized' ? 'de' : requested === 'long' ? 'de-long' : 'en',
      capacity === 'empty' || capacity === 'one' || capacity === 'boundary' || capacity === 'overflow'
        ? capacity
        : 'source',
    )
  }, [])
  const paywall3ReferenceFixture = useMemo(() => {
    const parameters = new URLSearchParams(window.location.search)
    const requested = parameters.get('paywall3Fixture')
    const capacity = parameters.get('paywall3Capacity')
    return createPaywall3PreviewFixture(
      requested === 'localized' ? 'de' : requested === 'long' ? 'de-long' : 'en',
      capacity === 'empty' || capacity === 'one' || capacity === 'boundary' || capacity === 'overflow'
        ? capacity
        : 'source',
    )
  }, [])
  const paywall6ReferenceFixture = useMemo(() => {
    const parameters = new URLSearchParams(window.location.search)
    const requested = parameters.get('paywall6Fixture')
    const capacity = parameters.get('paywall6Capacity')
    return createPaywall6PreviewFixture(
      requested === 'localized' ? 'de' : requested === 'long' ? 'de-long' : 'en',
      capacity === 'empty' || capacity === 'one' || capacity === 'boundary' || capacity === 'overflow'
        ? capacity
        : 'source',
    )
  }, [])
  const paywall7ReferenceFixture = useMemo(() => {
    const parameters = new URLSearchParams(window.location.search)
    const requested = parameters.get('paywall7Fixture')
    const capacity = parameters.get('paywall7Capacity')
    return createPaywall7PreviewFixture(
      requested === 'localized' ? 'de' : requested === 'long' ? 'de-long' : 'en',
      capacity === 'empty' || capacity === 'one' || capacity === 'boundary' || capacity === 'overflow'
        ? capacity
        : 'source',
    )
  }, [])
  return {
    editorContent,
    agentActivityContent,
    agentActivityLocalized,
    agentApprovalContent,
    agentPlanContent,
    navbarContent,
    toolCallsContent,
    paywallContent,
    feedbackContent,
    settingsFormContent,
    settingsForm1ReferenceFixture,
    settingsForm2ReferenceFixture,
    settingsForm3ReferenceFixture,
    settingsForm4ReferenceFixture,
    settingsForm5ReferenceFixture,
    settingsForm6ReferenceFixture,
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
    formsContent,
    formsForm1ReferenceFixture,
    forms2ReferenceFixture,
    forms3ReferenceFixture,
    forms4ReferenceFixture,
    forms5ReferenceFixture,
    forms6ReferenceFixture,
    forms7ReferenceFixture,
    forms8ReferenceFixture,
    forms9ReferenceFixture,
    forms10ReferenceFixture,
    forms11ReferenceFixture,
    forms12ReferenceFixture,
    appDialogContent,
    notificationsContent,
    supportLocale,
    supportContent,
    supportTicketCopy,
    supportThreadCopy,
    supportReplyOutcome,
    supportAssistantOutcome,
    supportTicketOutcome,
    wizardContent,
    appShellContent,
    appSidebarContent,
    aiChatContent,
    aiChatLocale,
    aiChatReference,
    kanbanContent,
    onboardingContent,
    onboarding1ReferenceFixture,
    onboarding2ReferenceFixture,
    onboarding3ReferenceFixture,
    onboarding4ReferenceFixture,
    onboarding5ReferenceFixture,
    onboarding6ReferenceFixture,
    onboarding7ReferenceFixture,
    paywall4ReferenceFixture,
    paywall5ReferenceFixture,
    paywall3ReferenceFixture,
    paywall6ReferenceFixture,
    paywall7ReferenceFixture,
  } as const
}
export type PreviewFixtures = ReturnType<typeof usePreviewFixtures>
