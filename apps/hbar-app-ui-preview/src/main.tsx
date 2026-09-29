import {
  DEFAULT_LUMEN_APPEARANCE,
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenIcon,
  LumenInput,
  LumenNavigationButton,
  LumenProvider,
  LumenText,
} from '@lumen/app-ui'
import { CommandPreviewHost } from './CommandPreviewHost'
import { AuthenticationPreviewHost } from './AuthenticationPreviewHost'
import { KanbanPreviewHost } from './KanbanPreviewHost'
import { WizardPreviewHost } from './WizardPreviewHost'
import { SettingsPreviewHost } from './SettingsPreviewHost'
import { SettingsForm2PreviewHost } from './SettingsForm2PreviewHost'
import { SettingsForm3PreviewHost } from './SettingsForm3PreviewHost'
import { SettingsForm4PreviewHost } from './SettingsForm4PreviewHost'
import { SettingsForm5PreviewHost } from './SettingsForm5PreviewHost'
import { SettingsForm6PreviewHost } from './SettingsForm6PreviewHost'
import { FormsForm1PreviewHost } from './FormsForm1PreviewHost'
import { Forms2PreviewHost } from './Forms2PreviewHost'
import { FormsForm3PreviewHost } from './FormsForm3PreviewHost'
import { FormsForm4PreviewHost } from './FormsForm4PreviewHost'
import { FormsForm5PreviewHost } from './FormsForm5PreviewHost'
import { FormsForm6PreviewHost } from './FormsForm6PreviewHost'
import { FormsForm7PreviewHost } from './FormsForm7PreviewHost'
import { FormsForm8PreviewHost } from './FormsForm8PreviewHost'
import { FormsForm9PreviewHost } from './FormsForm9PreviewHost'
import { FormsForm10PreviewHost } from './FormsForm10PreviewHost'
import { FormsForm11PreviewHost } from './FormsForm11PreviewHost'
import { FormsForm12PreviewHost } from './FormsForm12PreviewHost'
import './formsForm3-preview.css'
import { previewLayoutStyle } from './preview-layout'
import { UsagePreviewHost } from './UsagePreviewHost'
import { AppShellPreviewHost } from './AppShellPreviewHost'
import { PlanPreviewHost } from './PlanPreviewHost'
import { EditorPreviewHost } from './EditorPreviewHost'
import { FeedbackPreviewHost } from './FeedbackPreviewHost'
import { ApprovalPreviewHost } from './ApprovalPreviewHost'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Maximize2, Moon, RotateCcw, Search, Sun, X } from 'lucide-react'
import {
  HBAR_APP_UI_CATEGORIES,
  HBAR_APP_UI_CATEGORY_COUNTS,
  HbarAppUiAppSidebarProvider,
  HbarAppUiAiChatProvider,
  HbarAppUiAgentActivityProvider,
  HbarAppUiPaywallProvider,
  HbarAppUiFileManagerProvider,
  HbarAppUiBillingProvider,
  HbarAppUiIntegrationProvider,
  HbarAppUiChatProvider,
  HbarAppUiPromptInputProvider,
  HbarAppUiCardProvider,
  HbarAppUiDataTableProvider,
  HbarAppUiDashboardProvider,
  HbarAppUiAnalyticsProvider,
  HbarAppUiFormsProvider,
  HbarAppUiAppDialogProvider,
  HbarAppUiNotificationsProvider,
  HbarAppUiMobileProvider,
  HbarAppUiSupportProvider,
  HbarAppUiOnboardingProvider,
  HbarAppUiListProvider,
  HbarAppUiFilteringProvider,
  HbarAppUiMonitoringProvider,
  HbarAppUiNavbarProvider,
  HbarAppUiToolCallsProvider,
  HbarAppUiIconButton,
  HbarAppUiStatus,
  listHbarAppUiVariants,
} from 'hbar-app-ui/catalog'
import type {
  HbarAppUiEvent,
  HbarAppUiRegistryEntry,
  HbarAppUiVariantComponent,
  HbarAppUiCategory,
} from 'hbar-app-ui/catalog'
import 'hbar-app-ui/theme.css'
import './preview.css'
import './onboarding1-preview.css'
import './onboarding2-preview.css'
import './onboarding3-preview.css'
import './onboarding4-preview.css'
import './onboarding5-preview.css'
import './onboarding6-preview.css'
import './onboarding7-preview.css'
import './paywall4-preview.css'
import './paywall5-preview.css'
import './paywall3-preview.css'
import './wizard-preview.css'
import './comments-preview.css'
import { CommentsPreviewHost } from './CommentsPreviewHost'
import { SchedulingPreviewHost } from './SchedulingPreviewHost'
import './scheduling-preview.css'
import { VariantHarness } from './VariantHarness'
import { ShellPreviewHost } from './ShellPreviewHost'
import { ConversationPreviewHost } from './ConversationPreviewHost'
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
  createHbarAppUiFileManagerLocalizedFixtures,
  createHbarAppUiFileManagerOverflowFixtures,
  HBAR_APP_UI_FILE_MANAGER_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-file-manager-fixtures'
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
import {
  createHbarAppUiBillingLocalizedFixtures,
  createHbarAppUiBillingOverflowFixtures,
  HBAR_APP_UI_BILLING_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-billing-fixtures'
import {
  createHbarAppUiIntegrationsLocalizedFixtures,
  createHbarAppUiIntegrationsOverflowFixtures,
  HBAR_APP_UI_INTEGRATIONS_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-integrations-fixtures'
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
import { HBAR_APP_UI_CHAT_FIXTURES } from '../../../tests/fixtures/hbar-app-ui-chat-fixtures'
import {
  createHbarAppUiPromptInputLocalizedFixtures,
  HBAR_APP_UI_PROMPT_INPUT_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-prompt-input-fixtures'
import { HBAR_APP_UI_CARD_FIXTURES } from '../../../tests/fixtures/hbar-app-ui-card-fixtures'
import { HBAR_APP_UI_DATA_TABLE_FIXTURES } from '../../../tests/fixtures/hbar-app-ui-data-table-fixtures'
import { HBAR_APP_UI_DASHBOARD_FIXTURES } from '../../../tests/fixtures/hbar-app-ui-dashboard-fixtures'
import { HBAR_APP_UI_ANALYTICS_FIXTURES } from '../../../tests/fixtures/hbar-app-ui-analytics-fixtures'
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
import { HBAR_APP_UI_MOBILE_FIXTURES } from '../../../tests/fixtures/hbar-app-ui-mobile-fixtures'
import { HBAR_APP_UI_SUPPORT_FIXTURES } from '../../../tests/fixtures/hbar-app-ui-support-fixtures'
import {
  createHbarAppUiWizardLocalizedFixtures,
  createHbarAppUiWizardOverflowFixtures,
  HBAR_APP_UI_WIZARD_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-wizard-fixtures'
import { HBAR_APP_UI_APP_SHELL_FIXTURES } from '../../../tests/fixtures/hbar-app-ui-app-shell-fixtures'
import { HBAR_APP_UI_APP_SIDEBAR_FIXTURES } from '../../../tests/fixtures/hbar-app-ui-app-sidebar-fixtures'
import { appSidebarPrimaryFixture } from '../../../tests/fixtures/hbar-app-ui-app-sidebar-primary-fixtures'
import { appSidebarRailFixture } from '../../../tests/fixtures/hbar-app-ui-app-sidebar-rail-fixtures'
import { appSidebarWorkspaceFixture } from '../../../tests/fixtures/hbar-app-ui-app-sidebar-workspace-fixtures'
import { appSidebarDualFixture } from '../../../tests/fixtures/hbar-app-ui-app-sidebar-dual-fixtures'
import { appSidebarTreeFixture } from '../../../tests/fixtures/hbar-app-ui-app-sidebar-tree-fixtures'
import { appSidebarDrawerFixture } from '../../../tests/fixtures/hbar-app-ui-app-sidebar-drawer-fixtures'
import { appSidebarFullFixture } from '../../../tests/fixtures/hbar-app-ui-app-sidebar-full-fixtures'
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
import { Onboarding2PreviewHost } from './Onboarding2PreviewHost'
import { createOnboarding2PreviewFixture } from './onboarding2PreviewFixtures'
import { Onboarding3PreviewHost } from './Onboarding3PreviewHost'
import { createOnboarding3PreviewFixture } from './onboarding3PreviewFixtures'
import { Onboarding4PreviewHost } from './Onboarding4PreviewHost'
import { createOnboarding4PreviewFixture } from './onboarding4PreviewFixtures'
import { Onboarding5PreviewHost } from './Onboarding5PreviewHost'
import { createOnboarding5PreviewFixture } from './onboarding5PreviewFixtures'
import { Onboarding6PreviewHost } from './Onboarding6PreviewHost'
import { createOnboarding6PreviewFixture } from './onboarding6PreviewFixtures'
import { Onboarding7PreviewHost } from './Onboarding7PreviewHost'
import { createOnboarding7PreviewFixture } from './onboarding7PreviewFixtures'
import { Paywall4PreviewHost } from './Paywall4PreviewHost'
import { createPaywall4PreviewFixture } from './paywall4PreviewFixtures'
import { Paywall5PreviewHost } from './Paywall5PreviewHost'
import { createPaywall5PreviewFixture } from './paywall5PreviewFixtures'
import { Paywall3PreviewHost } from './Paywall3PreviewHost'
import { createPaywall3PreviewFixture } from './paywall3PreviewFixtures'
import { Onboarding1PreviewHost } from './Onboarding1PreviewHost'
import { createOnboarding1PreviewFixture } from './onboarding1PreviewFixtures'
import { HBAR_APP_UI_LIST_FIXTURES } from '../../../tests/fixtures/hbar-app-ui-list-fixtures'
import { HBAR_APP_UI_FILTERING_FIXTURES } from '../../../tests/fixtures/hbar-app-ui-filtering-fixtures'
import { HBAR_APP_UI_MONITORING_FIXTURES } from '../../../tests/fixtures/hbar-app-ui-monitoring-fixtures'

type Viewport = 'desktop' | 'tablet' | 'mobile'
type Theme = 'dark' | 'light'

const allEntries = listHbarAppUiVariants()
const viewportWidths: Record<Viewport, string> = { desktop: '100%', tablet: '768px', mobile: '390px' }

function readInitialVariant(): HbarAppUiRegistryEntry {
  const requested = new URLSearchParams(window.location.search).get('variant')
  const entry = allEntries.find((candidate) => candidate.spec.id === requested)
  return entry ?? allEntries[0]!
}

function readInitialTheme(): Theme {
  return new URLSearchParams(window.location.search).get('theme') === 'light' ? 'light' : 'dark'
}

function PreviewApp() {
  const [selected, setSelected] = useState<HbarAppUiRegistryEntry>(readInitialVariant)
  const [query, setQuery] = useState('')
  const [theme, setTheme] = useState<Theme>(readInitialTheme)
  const [viewport, setViewport] = useState<Viewport>('desktop')
  const [eventLog, setEventLog] = useState<readonly HbarAppUiEvent[]>([])
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [appSidebarWorkspaceId, setAppSidebarWorkspaceId] = useState('northwind')
  const [appSidebarDualSectionId, setAppSidebarDualSectionId] = useState('automations')
  const previewRef = useRef<HTMLDivElement>(null)
  const isolated = useMemo(() => new URLSearchParams(window.location.search).get('mode') === 'isolated', [])
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
  const fileManagerContent = useMemo(() => {
    switch (new URLSearchParams(window.location.search).get('fileManagerFixture')) {
      case 'overflow':
        return createHbarAppUiFileManagerOverflowFixtures()
      case 'localized':
        return createHbarAppUiFileManagerLocalizedFixtures()
      case null:
      default:
        return HBAR_APP_UI_FILE_MANAGER_FIXTURES
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
  const billingContent = useMemo(() => {
    switch (new URLSearchParams(window.location.search).get('billingFixture')) {
      case 'overflow':
        return createHbarAppUiBillingOverflowFixtures()
      case 'localized':
        return createHbarAppUiBillingLocalizedFixtures()
      case null:
      default:
        return HBAR_APP_UI_BILLING_FIXTURES
    }
  }, [])
  const integrationsContent = useMemo(() => {
    switch (new URLSearchParams(window.location.search).get('integrationsFixture')) {
      case 'overflow':
        return createHbarAppUiIntegrationsOverflowFixtures()
      case 'localized':
        return createHbarAppUiIntegrationsLocalizedFixtures()
      case null:
      default:
        return HBAR_APP_UI_INTEGRATIONS_FIXTURES
    }
  }, [])
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
  const chatContent = useMemo(() => HBAR_APP_UI_CHAT_FIXTURES, [])
  const promptInputContent = useMemo(
    () =>
      new URLSearchParams(window.location.search).get('promptInputFixture') === 'localized'
        ? createHbarAppUiPromptInputLocalizedFixtures()
        : HBAR_APP_UI_PROMPT_INPUT_FIXTURES,
    [],
  )
  const cardContent = useMemo(() => HBAR_APP_UI_CARD_FIXTURES, [])
  const dataTableContent = useMemo(() => HBAR_APP_UI_DATA_TABLE_FIXTURES, [])
  const dashboardContent = useMemo(() => HBAR_APP_UI_DASHBOARD_FIXTURES, [])
  const analyticsContent = useMemo(() => HBAR_APP_UI_ANALYTICS_FIXTURES, [])
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
  const mobileContent = useMemo(() => HBAR_APP_UI_MOBILE_FIXTURES, [])
  const supportContent = useMemo(() => HBAR_APP_UI_SUPPORT_FIXTURES, [])
  const wizardContent = useMemo(() => {
    const fixture = new URLSearchParams(window.location.search).get('wizardFixture')
    return fixture === 'localized'
      ? createHbarAppUiWizardLocalizedFixtures()
      : fixture === 'overflow'
        ? createHbarAppUiWizardOverflowFixtures()
        : HBAR_APP_UI_WIZARD_FIXTURES
  }, [])
  const appShellContent = useMemo(() => HBAR_APP_UI_APP_SHELL_FIXTURES, [])
  const appSidebarContent = useMemo(
    () => ({
      ...HBAR_APP_UI_APP_SIDEBAR_FIXTURES,
      primary: appSidebarPrimaryFixture(new URLSearchParams(window.location.search).get('appSidebarFixture')),
      railPreview: appSidebarRailFixture(new URLSearchParams(window.location.search).get('appSidebarRailFixture')),
      workspacePreview: appSidebarWorkspaceFixture(
        new URLSearchParams(window.location.search).get('appSidebarWorkspaceFixture'),
        appSidebarWorkspaceId,
      ),
      dualPreview: appSidebarDualFixture(
        new URLSearchParams(window.location.search).get('appSidebarDualFixture'),
        appSidebarDualSectionId,
      ),
      treePreview: appSidebarTreeFixture(new URLSearchParams(window.location.search).get('appSidebarTreeFixture')),
      drawerPreview: appSidebarDrawerFixture(
        new URLSearchParams(window.location.search).get('appSidebarDrawerFixture'),
      ),
      fullPreview: appSidebarFullFixture(new URLSearchParams(window.location.search).get('appSidebarFullFixture')),
    }),
    [appSidebarWorkspaceId, appSidebarDualSectionId],
  )
  const aiChatContent = useMemo(
    () =>
      new URLSearchParams(window.location.search).get('aiChatFixture') === 'localized'
        ? createHbarAppUiAiChatLocalizedFixtures()
        : HBAR_APP_UI_AI_CHAT_FIXTURES,
    [],
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
    return createPaywall4PreviewFixture(requested === 'localized' ? 'de' : requested === 'long' ? 'de-long' : 'en',
      capacity === 'empty' || capacity === 'one' || capacity === 'boundary' || capacity === 'overflow' ? capacity : 'source')
  }, [])
  const paywall5ReferenceFixture = useMemo(() => {
    const parameters = new URLSearchParams(window.location.search)
    const requested = parameters.get('paywall5Fixture')
    const capacity = parameters.get('paywall5Capacity')
    return createPaywall5PreviewFixture(requested === 'localized' ? 'de' : requested === 'long' ? 'de-long' : 'en',
      capacity === 'empty' || capacity === 'one' || capacity === 'boundary' || capacity === 'overflow' ? capacity : 'source')
  }, [])
  const paywall3ReferenceFixture = useMemo(() => {
    const parameters = new URLSearchParams(window.location.search)
    const requested = parameters.get('paywall3Fixture')
    const capacity = parameters.get('paywall3Capacity')
    return createPaywall3PreviewFixture(requested === 'localized' ? 'de' : requested === 'long' ? 'de-long' : 'en',
      capacity === 'empty' || capacity === 'one' || capacity === 'boundary' || capacity === 'overflow' ? capacity : 'source')
  }, [])
  const listContent = useMemo(() => HBAR_APP_UI_LIST_FIXTURES, [])
  const filteringContent = useMemo(() => HBAR_APP_UI_FILTERING_FIXTURES, [])
  const monitoringContent = useMemo(() => HBAR_APP_UI_MONITORING_FIXTURES, [])

  const filteredEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return allEntries
    return allEntries.filter(({ spec }) =>
      `${spec.title} ${spec.category} ${spec.description} ${spec.id}`.toLowerCase().includes(normalized),
    )
  }, [query])

  const visibleCategories = useMemo(() => {
    const matching = new Set(filteredEntries.map(({ spec }) => spec.category))
    return HBAR_APP_UI_CATEGORIES.filter((category) => matching.has(category))
  }, [filteredEntries])

  const SelectedComponent = selected.component as HbarAppUiVariantComponent

  useEffect(() => {
    const handleFullscreen = () => setIsFullscreen(document.fullscreenElement === previewRef.current)
    document.addEventListener('fullscreenchange', handleFullscreen)
    return () => document.removeEventListener('fullscreenchange', handleFullscreen)
  }, [])

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search)
    parameters.set('variant', selected.spec.id)
    const nextUrl = `${window.location.pathname}?${parameters.toString()}`
    window.history.replaceState(null, '', nextUrl)
  }, [selected.spec.id])

  const chooseCategory = (category: HbarAppUiCategory) => {
    const first =
      filteredEntries.find(({ spec }) => spec.category === category) ??
      allEntries.find(({ spec }) => spec.category === category)
    if (first) setSelected(first)
  }

  const chooseEntry = (entry: HbarAppUiRegistryEntry) => {
    setSelected(entry)
    setEventLog([])
  }

  const handleAction = (event: HbarAppUiEvent) => {
    if (event.variantId === 'hbar-app-ui-app-sidebar-3' && event.actionId === 'workspace' && event.value) {
      setAppSidebarWorkspaceId(event.value)
    }
    if (event.variantId === 'hbar-app-ui-app-sidebar-4' && event.actionId === 'section' && event.value) {
      setAppSidebarDualSectionId(event.value)
    }
    setEventLog((current) => [event, ...current].slice(0, 12))
  }

  const resetPreview = () => {
    setQuery('')
    setTheme('dark')
    setViewport('desktop')
    setEventLog([])
    const first = allEntries[0]
    if (first) setSelected(first)
  }

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      return
    }
    await previewRef.current?.requestFullscreen()
  }

  if (isolated) {
    return (
      <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: theme }} withCssBaseline={false}>
        <LumenFrame
          className="hbar-app-ui-canvas hbar-app-ui-isolated-canvas"
          data-hbar-app-ui-theme={theme}
          style={previewLayoutStyle}
          data-hbar-app-ui-variant={selected.spec.id}
        >
          <KanbanPreviewHost content={kanbanContent}>
            <HbarAppUiAiChatProvider content={aiChatContent}>
              <HbarAppUiAppSidebarProvider content={appSidebarContent}>
                <AppShellPreviewHost content={appShellContent} spec={selected.spec} onAction={handleAction}>
                  <HbarAppUiFileManagerProvider content={fileManagerContent}>
                    <FeedbackPreviewHost content={feedbackContent}>
                      <SettingsPreviewHost
                        content={settingsFormContent}
                        spec={selected.spec}
                        onAction={handleAction}
                        referenceFixture={settingsForm1ReferenceFixture}
                      >
                        <SettingsForm2PreviewHost
                          content={settingsFormContent}
                          spec={selected.spec}
                          onAction={handleAction}
                          referenceFixture={settingsForm2ReferenceFixture}
                        >
                          <AuthenticationPreviewHost
                            content={authenticationContent}
                            spec={selected.spec}
                            onAction={handleAction}
                          >
                            <HbarAppUiBillingProvider content={billingContent}>
                              <HbarAppUiIntegrationProvider content={integrationsContent}>
                                <CommentsPreviewHost content={commentsContent}>
                                  <SchedulingPreviewHost content={schedulingContent}>
                                    <HbarAppUiChatProvider content={chatContent}>
                                      <HbarAppUiPromptInputProvider content={promptInputContent}>
                                        <HbarAppUiCardProvider content={cardContent}>
                                          <HbarAppUiDataTableProvider content={dataTableContent}>
                                            <HbarAppUiDashboardProvider content={dashboardContent}>
                                              <HbarAppUiAnalyticsProvider content={analyticsContent}>
                                                <HbarAppUiFormsProvider content={formsContent}>
                                                  <HbarAppUiAppDialogProvider content={appDialogContent}>
                                                    <HbarAppUiNotificationsProvider content={notificationsContent}>
                                                      <HbarAppUiMobileProvider content={mobileContent}>
                                                        <HbarAppUiSupportProvider content={supportContent}>
                                                          <WizardPreviewHost content={wizardContent}>
                                                            <HbarAppUiOnboardingProvider content={onboardingContent}>
                                                              <HbarAppUiListProvider content={listContent}>
                                                                <HbarAppUiFilteringProvider content={filteringContent}>
                                                                  <HbarAppUiMonitoringProvider
                                                                    content={monitoringContent}
                                                                  >
                                                                    <HbarAppUiPaywallProvider content={paywallContent}>
                                                                      <Paywall4PreviewHost content={paywallContent} spec={selected.spec}
                                                                        onAction={handleAction} referenceFixture={paywall4ReferenceFixture}>
                                                                        <Paywall5PreviewHost content={paywallContent} spec={selected.spec}
                                                                          onAction={handleAction} referenceFixture={paywall5ReferenceFixture}>
                                                                          <Paywall3PreviewHost content={paywallContent} spec={selected.spec}
                                                                            onAction={handleAction} referenceFixture={paywall3ReferenceFixture}>
                                                                      <PlanPreviewHost content={agentPlanContent}>
                                                                        <ApprovalPreviewHost
                                                                          content={agentApprovalContent}
                                                                        >
                                                                          <HbarAppUiAgentActivityProvider
                                                                            content={agentActivityContent}
                                                                          >
                                                                            <HbarAppUiToolCallsProvider
                                                                              content={toolCallsContent}
                                                                            >
                                                                              <HbarAppUiNavbarProvider
                                                                                content={navbarContent}
                                                                              >
                                                                                <EditorPreviewHost
                                                                                  content={editorContent}
                                                                                >
                                                                                  <ShellPreviewHost
                                                                                    spec={selected.spec}
                                                                                    onAction={handleAction}
                                                                                  >
                                                                                    <ConversationPreviewHost
                                                                                      spec={selected.spec}
                                                                                      onAction={handleAction}
                                                                                    >
                                                                                      <UsagePreviewHost
                                                                                        spec={selected.spec}
                                                                                        onAction={handleAction}
                                                                                      >
                                                                                        <CommandPreviewHost
                                                                                          spec={selected.spec}
                                                                                          onAction={handleAction}
                                                                                        >
                                                                                          <SettingsForm3PreviewHost
                                                                                            content={
                                                                                              settingsFormContent
                                                                                            }
                                                                                            spec={selected.spec}
                                                                                            onAction={handleAction}
                                                                                            referenceFixture={
                                                                                              settingsForm3ReferenceFixture
                                                                                            }
                                                                                          >
                                                                                            <SettingsForm4PreviewHost
                                                                                              content={
                                                                                                settingsFormContent
                                                                                              }
                                                                                              spec={selected.spec}
                                                                                              onAction={handleAction}
                                                                                              referenceFixture={
                                                                                                settingsForm4ReferenceFixture
                                                                                              }
                                                                                            >
                                                                                              <SettingsForm5PreviewHost
                                                                                                content={
                                                                                                  settingsFormContent
                                                                                                }
                                                                                                spec={selected.spec}
                                                                                                onAction={handleAction}
                                                                                                referenceFixture={
                                                                                                  settingsForm5ReferenceFixture
                                                                                                }
                                                                                              >
                                                                                                <SettingsForm6PreviewHost
                                                                                                  content={settingsFormContent}
                                                                                                  spec={selected.spec}
                                                                                                  onAction={handleAction}
                                                                                                  referenceFixture={settingsForm6ReferenceFixture}
                                                                                                >
                                                                                                  <FormsForm1PreviewHost
                                                                                                    content={formsContent}
                                                                                                    spec={selected.spec}
                                                                                                    onAction={handleAction}
                                                                                                    referenceFixture={formsForm1ReferenceFixture}
                                                                                                  >
                                                                                                    <Forms2PreviewHost
                                                                                                      content={formsContent}
                                                                                                      spec={selected.spec}
                                                                                                      onAction={handleAction}
                                                                                                      referenceFixture={forms2ReferenceFixture}
                                                                                                    >
                                                                                                      <FormsForm3PreviewHost
                                                                                                        content={formsContent}
                                                                                                        spec={selected.spec}
                                                                                                        onAction={handleAction}
                                                                                                        referenceFixture={forms3ReferenceFixture}
                                                                                                      >
                                                                                                        <FormsForm4PreviewHost
                                                                                                          content={formsContent}
                                                                                                          spec={selected.spec}
                                                                                                          onAction={handleAction}
                                                                                                          referenceFixture={forms4ReferenceFixture}
                                                                                                        >
                                                                                                          <FormsForm5PreviewHost
                                                                                                            content={formsContent}
                                                                                                            spec={selected.spec}
                                                                                                            onAction={handleAction}
                                                                                                            referenceFixture={forms5ReferenceFixture}
                                                                                                          >
                                                                                                            <FormsForm6PreviewHost
                                                                                                              content={formsContent}
                                                                                                              spec={selected.spec}
                                                                                                              onAction={handleAction}
                                                                                                              referenceFixture={forms6ReferenceFixture}
                                                                                                            >
                                                                                                              <FormsForm7PreviewHost
                                                                                                                content={formsContent}
                                                                                                                spec={selected.spec}
                                                                                                                onAction={handleAction}
                                                                                                               referenceFixture={forms7ReferenceFixture}
                                                                                                             >
                                                                                                                <FormsForm8PreviewHost
                                                                                                                  content={formsContent}
                                                                                                                  spec={selected.spec}
                                                                                                                  onAction={handleAction}
                                                                                                                  referenceFixture={forms8ReferenceFixture}
                                                                                                                >
                                                                                                                  <FormsForm9PreviewHost
                                                                                                                    content={formsContent}
                                                                                                                    spec={selected.spec}
                                                                                                                    onAction={handleAction}
                                                                                                                    referenceFixture={forms9ReferenceFixture}
                                                                                                                  >
                                                                                                                    <FormsForm10PreviewHost
                                                                                                                      content={formsContent}
                                                                                                                      spec={selected.spec}
                                                                                                                      onAction={handleAction}
                                                                                                                      referenceFixture={forms10ReferenceFixture}
                                                                                                                    >
                                                                                                                      <FormsForm11PreviewHost
                                                                                                                        content={formsContent}
                                                                                                                        spec={selected.spec}
                                                                                                                        onAction={handleAction}
                                                                                                                        referenceFixture={forms11ReferenceFixture}
                                                                                                                      >
                                                                                                                        <FormsForm12PreviewHost
                                                                                                                          content={formsContent}
                                                                                                                          spec={selected.spec}
                                                                                                                          onAction={handleAction}
                                                                                                                          referenceFixture={forms12ReferenceFixture}
                                                                                                                        >
                                                                                                                          <Onboarding6PreviewHost
                                                                                                                            content={onboardingContent}
                                                                                                                            spec={selected.spec}
                                                                                                                            onAction={handleAction}
                                                                                                                            referenceFixture={onboarding6ReferenceFixture}
                                                                                                                          >
                                                                                                                          <Onboarding7PreviewHost
                                                                                                                            content={onboardingContent}
                                                                                                                            spec={selected.spec}
                                                                                                                            onAction={handleAction}
                                                                                                                            referenceFixture={onboarding7ReferenceFixture}
                                                                                                                          >
                                                                                                                          <Onboarding5PreviewHost
                                                                                                                            content={onboardingContent}
                                                                                                                            spec={selected.spec}
                                                                                                                            onAction={handleAction}
                                                                                                                            referenceFixture={onboarding5ReferenceFixture}
                                                                                                                          >
                                                                                                                          <Onboarding4PreviewHost
                                                                                                                            content={onboardingContent}
                                                                                                                            spec={selected.spec}
                                                                                                                            onAction={handleAction}
                                                                                                                            referenceFixture={onboarding4ReferenceFixture}
                                                                                                                          >
                                                                                                                          <Onboarding3PreviewHost
                                                                                                                            content={onboardingContent}
                                                                                                                            spec={selected.spec}
                                                                                                                            onAction={handleAction}
                                                                                                                            referenceFixture={onboarding3ReferenceFixture}
                                                                                                                          >
                                                                                                                          <Onboarding2PreviewHost
                                                                                                                            content={onboardingContent}
                                                                                                                            spec={selected.spec}
                                                                                                                            onAction={handleAction}
                                                                                                                            referenceFixture={onboarding2ReferenceFixture}
                                                                                                                          >
                                                                                                                            <Onboarding1PreviewHost
                                                                                                                              content={onboardingContent}
                                                                                                                              spec={selected.spec}
                                                                                                                              onAction={handleAction}
                                                                                                                              referenceFixture={onboarding1ReferenceFixture}
                                                                                                                            >
                                                                                                                              <SelectedComponent
                                                                                                                                spec={selected.spec}
                                                                                                                                onAction={handleAction}
                                                                                                                              />
                                                                                                                            </Onboarding1PreviewHost>
                                                                                                                          </Onboarding2PreviewHost>
                                                                                                                          </Onboarding3PreviewHost>
                                                                                                                          </Onboarding4PreviewHost>
                                                                                                                          </Onboarding5PreviewHost>
                                                                                                                          </Onboarding7PreviewHost>
                                                                                                                          </Onboarding6PreviewHost>
                                                                                                                        </FormsForm12PreviewHost>
                                                                                                                      </FormsForm11PreviewHost>
                                                                                                                    </FormsForm10PreviewHost>
                                                                                                                  </FormsForm9PreviewHost>
                                                                                                                </FormsForm8PreviewHost>
                                                                                                             </FormsForm7PreviewHost>
                                                                                                            </FormsForm6PreviewHost>
                                                                                                          </FormsForm5PreviewHost>
                                                                                                        </FormsForm4PreviewHost>
                                                                                                      </FormsForm3PreviewHost>
                                                                                                    </Forms2PreviewHost>
                                                                                                  </FormsForm1PreviewHost>
                                                                                                </SettingsForm6PreviewHost>
                                                                                              </SettingsForm5PreviewHost>
                                                                                            </SettingsForm4PreviewHost>
                                                                                          </SettingsForm3PreviewHost>
                                                                                        </CommandPreviewHost>
                                                                                      </UsagePreviewHost>
                                                                                    </ConversationPreviewHost>
                                                                                  </ShellPreviewHost>
                                                                                </EditorPreviewHost>
                                                                              </HbarAppUiNavbarProvider>
                                                                            </HbarAppUiToolCallsProvider>
                                                                          </HbarAppUiAgentActivityProvider>
                                                                        </ApprovalPreviewHost>
                                                                      </PlanPreviewHost>
                                                                          </Paywall3PreviewHost>
                                                                        </Paywall5PreviewHost>
                                                                      </Paywall4PreviewHost>
                                                                    </HbarAppUiPaywallProvider>
                                                                  </HbarAppUiMonitoringProvider>
                                                                </HbarAppUiFilteringProvider>
                                                              </HbarAppUiListProvider>
                                                            </HbarAppUiOnboardingProvider>
                                                          </WizardPreviewHost>
                                                        </HbarAppUiSupportProvider>
                                                      </HbarAppUiMobileProvider>
                                                    </HbarAppUiNotificationsProvider>
                                                  </HbarAppUiAppDialogProvider>
                                                </HbarAppUiFormsProvider>
                                              </HbarAppUiAnalyticsProvider>
                                            </HbarAppUiDashboardProvider>
                                          </HbarAppUiDataTableProvider>
                                        </HbarAppUiCardProvider>
                                      </HbarAppUiPromptInputProvider>
                                    </HbarAppUiChatProvider>
                                  </SchedulingPreviewHost>
                                </CommentsPreviewHost>
                              </HbarAppUiIntegrationProvider>
                            </HbarAppUiBillingProvider>
                          </AuthenticationPreviewHost>
                        </SettingsForm2PreviewHost>
                      </SettingsPreviewHost>
                    </FeedbackPreviewHost>
                  </HbarAppUiFileManagerProvider>
                </AppShellPreviewHost>
              </HbarAppUiAppSidebarProvider>
            </HbarAppUiAiChatProvider>
          </KanbanPreviewHost>
        </LumenFrame>
      </LumenProvider>
    )
  }

  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: theme }} withCssBaseline={false}>
      <LumenFrame
        className="hbar-app-ui-canvas hbar-app-ui-preview"
        data-hbar-app-ui-theme={theme}
        style={previewLayoutStyle}
        ref={previewRef}
      >
        <LumenFrame as="header" className="hbar-app-ui-preview-header">
          <LumenFrame className="hbar-app-ui-preview-brand">
            <LumenText as="span" className="hbar-app-ui-preview-mark">
              h
            </LumenText>
            <LumenFrame>
              <LumenText as="strong">hbar-app-ui</LumenText>
              <LumenText as="small">Application UI catalog</LumenText>
            </LumenFrame>
          </LumenFrame>
          <LumenFrame className="hbar-app-ui-preview-header-actions">
            <HbarAppUiIconButton
              label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
              onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            >
              {theme === 'dark' ? <LumenIcon icon={Sun} tier="sm" /> : <LumenIcon icon={Moon} tier="sm" />}
            </HbarAppUiIconButton>
            <HbarAppUiIconButton label="Reset preview" onClick={resetPreview}>
              <LumenIcon icon={RotateCcw} tier="sm" />
            </HbarAppUiIconButton>
            <HbarAppUiIconButton
              label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              onClick={() => void toggleFullscreen()}
            >
              <LumenIcon icon={Maximize2} tier="sm" />
            </HbarAppUiIconButton>
          </LumenFrame>
        </LumenFrame>

        <LumenFrame className="hbar-app-ui-preview-body">
          <LumenFrame as="aside" className="hbar-app-ui-preview-sidebar" aria-label="hbar-app-ui categories">
            <LumenFrame as="label" className="hbar-app-ui-preview-search">
              <LumenIcon icon={Search} tier="sm" />
              <LumenInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search components"
                aria-label="Search components"
              />
              {query && (
                <HbarAppUiIconButton label="Clear search" onClick={() => setQuery('')}>
                  <LumenIcon icon={X} tier="sm" />
                </HbarAppUiIconButton>
              )}
            </LumenFrame>
            <LumenFrame className="hbar-app-ui-preview-catalog-heading">
              <LumenText as="span">Categories</LumenText>
              <LumenText as="small">{filteredEntries.length} / 300 variants</LumenText>
            </LumenFrame>
            <LumenFrame as="nav" className="hbar-app-ui-preview-category-list">
              {visibleCategories.map((category) => (
                <LumenNavigationButton
                  key={category}
                  size="s"
                  selected={selected.spec.category === category}
                  indicatorEdge="right"
                  onClick={() => chooseCategory(category)}
                >
                  <LumenText as="span">{category}</LumenText>
                  <LumenText as="small">{HBAR_APP_UI_CATEGORY_COUNTS[category]}</LumenText>
                </LumenNavigationButton>
              ))}
              {!visibleCategories.length && (
                <LumenText as="p" className="hbar-app-ui-preview-no-results">
                  No matching components.
                </LumenText>
              )}
            </LumenFrame>
          </LumenFrame>

          <LumenFrame as="main" className="hbar-app-ui-preview-main">
            <LumenFrame className="hbar-app-ui-preview-toolbar">
              <LumenFrame>
                <LumenText as="span" className="hbar-app-ui-preview-eyebrow">
                  {selected.spec.category}
                </LumenText>
                <LumenText as="h1">{selected.spec.title}</LumenText>
              </LumenFrame>
              <LumenFrame className="hbar-app-ui-preview-viewports" role="group" aria-label="Preview viewport">
                {(Object.keys(viewportWidths) as Viewport[]).map((option) => (
                  <LumenNavigationButton
                    key={option}
                    size="s"
                    selected={viewport === option}
                    indicatorEdge="bottom"
                    onClick={() => setViewport(option)}
                  >
                    {option}
                  </LumenNavigationButton>
                ))}
              </LumenFrame>
            </LumenFrame>

            <LumenFrame className="hbar-app-ui-preview-content">
              <LumenFrame as="section" className="hbar-app-ui-preview-stage" aria-label="Selected component preview">
                <LumenFrame className="hbar-app-ui-preview-stage-meta">
                  <HbarAppUiStatus
                    value={`${selected.spec.variant} of ${HBAR_APP_UI_CATEGORY_COUNTS[selected.spec.category]}`}
                    tone="positive"
                  />
                  <LumenText as="code">{selected.spec.id}</LumenText>
                </LumenFrame>
                <LumenFrame
                  className={`hbar-app-ui-preview-frame hbar-app-ui-preview-frame-${viewport}`}
                  style={{ maxWidth: viewportWidths[viewport] }}
                >
                  <LumenFrame
                    className={`hbar-app-ui-preview-component-canvas hbar-app-ui-surface-${selected.spec.profile.surface} hbar-app-ui-state-${selected.spec.profile.initialState} hbar-app-ui-visual-${selected.spec.profile.visualMode}`}
                    data-hbar-app-ui-variant={selected.spec.id}
                    data-hbar-app-ui-profile={selected.spec.profile.key}
                    data-hbar-app-ui-surface={selected.spec.profile.surface}
                    data-hbar-app-ui-state={selected.spec.profile.initialState}
                  >
                    <KanbanPreviewHost content={kanbanContent}>
                      <HbarAppUiAiChatProvider content={aiChatContent}>
                        <HbarAppUiAppSidebarProvider content={appSidebarContent}>
                          <AppShellPreviewHost content={appShellContent} spec={selected.spec} onAction={handleAction}>
                            <HbarAppUiFileManagerProvider content={fileManagerContent}>
                              <FeedbackPreviewHost content={feedbackContent}>
                                <SettingsPreviewHost
                                  content={settingsFormContent}
                                  spec={selected.spec}
                                  onAction={handleAction}
                                  referenceFixture={settingsForm1ReferenceFixture}
                                >
                                  <SettingsForm2PreviewHost
                                    content={settingsFormContent}
                                    spec={selected.spec}
                                    onAction={handleAction}
                                    referenceFixture={settingsForm2ReferenceFixture}
                                  >
                                    <AuthenticationPreviewHost
                                      content={authenticationContent}
                                      spec={selected.spec}
                                      onAction={handleAction}
                                    >
                                      <HbarAppUiBillingProvider content={billingContent}>
                                        <HbarAppUiIntegrationProvider content={integrationsContent}>
                                          <CommentsPreviewHost content={commentsContent}>
                                            <SchedulingPreviewHost content={schedulingContent}>
                                              <HbarAppUiChatProvider content={chatContent}>
                                                <HbarAppUiPromptInputProvider content={promptInputContent}>
                                                  <HbarAppUiCardProvider content={cardContent}>
                                                    <HbarAppUiDataTableProvider content={dataTableContent}>
                                                      <HbarAppUiDashboardProvider content={dashboardContent}>
                                                        <HbarAppUiAnalyticsProvider content={analyticsContent}>
                                                          <HbarAppUiFormsProvider content={formsContent}>
                                                            <HbarAppUiAppDialogProvider content={appDialogContent}>
                                                              <HbarAppUiNotificationsProvider
                                                                content={notificationsContent}
                                                              >
                                                                <HbarAppUiMobileProvider content={mobileContent}>
                                                                  <HbarAppUiSupportProvider content={supportContent}>
                                                                    <WizardPreviewHost content={wizardContent}>
                                                                      <HbarAppUiOnboardingProvider
                                                                        content={onboardingContent}
                                                                      >
                                                                        <HbarAppUiListProvider content={listContent}>
                                                                          <HbarAppUiFilteringProvider
                                                                            content={filteringContent}
                                                                          >
                                                                            <HbarAppUiMonitoringProvider
                                                                              content={monitoringContent}
                                                                            >
                                                                              <HbarAppUiPaywallProvider
                                                                                content={paywallContent}
                                                                              >
                                                                                <Paywall4PreviewHost content={paywallContent} spec={selected.spec}
                                                                                  onAction={handleAction} referenceFixture={paywall4ReferenceFixture}>
                                                                                  <Paywall5PreviewHost content={paywallContent} spec={selected.spec}
                                                                                    onAction={handleAction} referenceFixture={paywall5ReferenceFixture}>
                                                                                    <Paywall3PreviewHost content={paywallContent} spec={selected.spec}
                                                                                      onAction={handleAction} referenceFixture={paywall3ReferenceFixture}>
                                                                                <PlanPreviewHost
                                                                                  content={agentPlanContent}
                                                                                >
                                                                                  <ApprovalPreviewHost
                                                                                    content={agentApprovalContent}
                                                                                  >
                                                                                    <HbarAppUiAgentActivityProvider
                                                                                      content={agentActivityContent}
                                                                                    >
                                                                                      <HbarAppUiToolCallsProvider
                                                                                        content={toolCallsContent}
                                                                                      >
                                                                                        <HbarAppUiNavbarProvider
                                                                                          content={navbarContent}
                                                                                        >
                                                                                          <EditorPreviewHost
                                                                                            content={editorContent}
                                                                                          >
                                                                                            <ShellPreviewHost
                                                                                              spec={selected.spec}
                                                                                              onAction={handleAction}
                                                                                            >
                                                                                              <ConversationPreviewHost
                                                                                                spec={selected.spec}
                                                                                                onAction={handleAction}
                                                                                              >
                                                                                                <UsagePreviewHost
                                                                                                  spec={selected.spec}
                                                                                                  onAction={
                                                                                                    handleAction
                                                                                                  }
                                                                                                >
                                                                                                  <CommandPreviewHost
                                                                                                    spec={selected.spec}
                                                                                                    onAction={
                                                                                                      handleAction
                                                                                                    }
                                                                                                  >
                                                                                                    <SettingsForm3PreviewHost
                                                                                                      content={
                                                                                                        settingsFormContent
                                                                                                      }
                                                                                                      spec={
                                                                                                        selected.spec
                                                                                                      }
                                                                                                      onAction={
                                                                                                        handleAction
                                                                                                      }
                                                                                                      referenceFixture={
                                                                                                        settingsForm3ReferenceFixture
                                                                                                      }
                                                                                                    >
                                                                                                      <SettingsForm4PreviewHost
                                                                                                        content={
                                                                                                          settingsFormContent
                                                                                                        }
                                                                                                        spec={
                                                                                                          selected.spec
                                                                                                        }
                                                                                                        onAction={
                                                                                                          handleAction
                                                                                                        }
                                                                                                        referenceFixture={
                                                                                                          settingsForm4ReferenceFixture
                                                                                                        }
                                                                                                      >
                                                                                                        <SettingsForm5PreviewHost
                                                                                                          content={
                                                                                                            settingsFormContent
                                                                                                          }
                                                                                                          spec={
                                                                                                            selected.spec
                                                                                                          }
                                                                                                          onAction={
                                                                                                            handleAction
                                                                                                          }
                                                                                                          referenceFixture={
                                                                                                            settingsForm5ReferenceFixture
                                                                                                          }
                                                                                                        >
                                                                                                          <SettingsForm6PreviewHost
                                                                                                            content={settingsFormContent}
                                                                                                            spec={selected.spec}
                                                                                                            onAction={handleAction}
                                                                                                            referenceFixture={settingsForm6ReferenceFixture}
                                                                                                          >
                                                                                                            <FormsForm1PreviewHost
                                                                                                              content={formsContent}
                                                                                                              spec={selected.spec}
                                                                                                              onAction={handleAction}
                                                                                                              referenceFixture={formsForm1ReferenceFixture}
                                                                                                            >
                                                                                                              <Forms2PreviewHost
                                                                                                                content={formsContent}
                                                                                                                spec={selected.spec}
                                                                                                                onAction={handleAction}
                                                                                                                referenceFixture={forms2ReferenceFixture}
                                                                                                              >
                                                                                                                <FormsForm3PreviewHost
                                                                                                                  content={formsContent}
                                                                                                                  spec={selected.spec}
                                                                                                                  onAction={handleAction}
                                                                                                                  referenceFixture={forms3ReferenceFixture}
                                                                                                                >
                                                                                                                  <FormsForm4PreviewHost
                                                                                                                    content={formsContent}
                                                                                                                    spec={selected.spec}
                                                                                                                    onAction={handleAction}
                                                                                                                    referenceFixture={forms4ReferenceFixture}
                                                                                                                  >
                                                                                                                    <FormsForm5PreviewHost
                                                                                                                      content={formsContent}
                                                                                                                      spec={selected.spec}
                                                                                                                      onAction={handleAction}
                                                                                                                      referenceFixture={forms5ReferenceFixture}
                                                                                                                    >
                                                                                                                      <FormsForm6PreviewHost
                                                                                                                        content={formsContent}
                                                                                                                        spec={selected.spec}
                                                                                                                        onAction={handleAction}
                                                                                                                        referenceFixture={forms6ReferenceFixture}
                                                                                                                      >
                                                                                                                        <FormsForm7PreviewHost
                                                                                                                          content={formsContent}
                                                                                                                          spec={selected.spec}
                                                                                                                          onAction={handleAction}
                                                                                                                         referenceFixture={forms7ReferenceFixture}
                                                                                                                       >
                                                                                                                          <FormsForm8PreviewHost
                                                                                                                            content={formsContent}
                                                                                                                            spec={selected.spec}
                                                                                                                            onAction={handleAction}
                                                                                                                            referenceFixture={forms8ReferenceFixture}
                                                                                                                          >
                                                                                                                            <FormsForm9PreviewHost
                                                                                                                              content={formsContent}
                                                                                                                              spec={selected.spec}
                                                                                                                              onAction={handleAction}
                                                                                                                              referenceFixture={forms9ReferenceFixture}
                                                                                                                            >
                                                                                                                              <FormsForm10PreviewHost
                                                                                                                                content={formsContent}
                                                                                                                                spec={selected.spec}
                                                                                                                                onAction={handleAction}
                                                                                                                                referenceFixture={forms10ReferenceFixture}
                                                                                                                              >
                                                                                                                                <FormsForm11PreviewHost
                                                                                                                                  content={formsContent}
                                                                                                                                  spec={selected.spec}
                                                                                                                                  onAction={handleAction}
                                                                                                                                  referenceFixture={forms11ReferenceFixture}
                                                                                                                                >
                                                                                                                                   <FormsForm12PreviewHost
                                                                                                                                     content={formsContent}
                                                                                                                                     spec={selected.spec}
                                                                                                                                     onAction={handleAction}
                                                                                                                                     referenceFixture={forms12ReferenceFixture}
                                                                                                                                   >
                                                                                                                                     <Onboarding6PreviewHost
                                                                                                                                       content={onboardingContent}
                                                                                                                                       spec={selected.spec}
                                                                                                                                       onAction={handleAction}
                                                                                                                                       referenceFixture={onboarding6ReferenceFixture}
                                                                                                                                     >
                                                                                                                                     <Onboarding7PreviewHost
                                                                                                                                       content={onboardingContent}
                                                                                                                                       spec={selected.spec}
                                                                                                                                       onAction={handleAction}
                                                                                                                                       referenceFixture={onboarding7ReferenceFixture}
                                                                                                                                     >
                                                                                                                                     <Onboarding5PreviewHost
                                                                                                                                       content={onboardingContent}
                                                                                                                                       spec={selected.spec}
                                                                                                                                       onAction={handleAction}
                                                                                                                                       referenceFixture={onboarding5ReferenceFixture}
                                                                                                                                     >
                                                                                                                                     <Onboarding4PreviewHost
                                                                                                                                       content={onboardingContent}
                                                                                                                                       spec={selected.spec}
                                                                                                                                       onAction={handleAction}
                                                                                                                                       referenceFixture={onboarding4ReferenceFixture}
                                                                                                                                     >
                                                                                                                                     <Onboarding3PreviewHost
                                                                                                                                       content={onboardingContent}
                                                                                                                                       spec={selected.spec}
                                                                                                                                       onAction={handleAction}
                                                                                                                                       referenceFixture={onboarding3ReferenceFixture}
                                                                                                                                     >
                                                                                                                                     <Onboarding2PreviewHost
                                                                                                                                       content={onboardingContent}
                                                                                                                                       spec={selected.spec}
                                                                                                                                       onAction={handleAction}
                                                                                                                                       referenceFixture={onboarding2ReferenceFixture}
                                                                                                                                     >
                                                                                                                                       <Onboarding1PreviewHost
                                                                                                                                         content={onboardingContent}
                                                                                                                                         spec={selected.spec}
                                                                                                                                         onAction={handleAction}
                                                                                                                                         referenceFixture={onboarding1ReferenceFixture}
                                                                                                                                       >
                                                                                                                                         <SelectedComponent
                                                                                                                                           spec={selected.spec}
                                                                                                                                           onAction={handleAction}
                                                                                                                                         />
                                                                                                                                       </Onboarding1PreviewHost>
                                                                                                                                     </Onboarding2PreviewHost>
                                                                                                                                     </Onboarding3PreviewHost>
                                                                                                                                     </Onboarding4PreviewHost>
                                                                                                                                     </Onboarding5PreviewHost>
                                                                                                                                     </Onboarding7PreviewHost>
                                                                                                                                     </Onboarding6PreviewHost>
                                                                                                                                   </FormsForm12PreviewHost>
                                                                                                                                </FormsForm11PreviewHost>
                                                                                                                              </FormsForm10PreviewHost>
                                                                                                                            </FormsForm9PreviewHost>
                                                                                                                          </FormsForm8PreviewHost>
                                                                                                                        </FormsForm7PreviewHost>
                                                                                                                      </FormsForm6PreviewHost>
                                                                                                                    </FormsForm5PreviewHost>
                                                                                                                  </FormsForm4PreviewHost>
                                                                                                                </FormsForm3PreviewHost>
                                                                                                              </Forms2PreviewHost>
                                                                                                            </FormsForm1PreviewHost>
                                                                                                          </SettingsForm6PreviewHost>
                                                                                                        </SettingsForm5PreviewHost>
                                                                                                      </SettingsForm4PreviewHost>
                                                                                                    </SettingsForm3PreviewHost>
                                                                                                  </CommandPreviewHost>
                                                                                                </UsagePreviewHost>
                                                                                              </ConversationPreviewHost>
                                                                                            </ShellPreviewHost>
                                                                                          </EditorPreviewHost>
                                                                                        </HbarAppUiNavbarProvider>
                                                                                      </HbarAppUiToolCallsProvider>
                                                                                    </HbarAppUiAgentActivityProvider>
                                                                                  </ApprovalPreviewHost>
                                                                                </PlanPreviewHost>
                                                                                    </Paywall3PreviewHost>
                                                                                  </Paywall5PreviewHost>
                                                                                </Paywall4PreviewHost>
                                                                              </HbarAppUiPaywallProvider>
                                                                            </HbarAppUiMonitoringProvider>
                                                                          </HbarAppUiFilteringProvider>
                                                                        </HbarAppUiListProvider>
                                                                      </HbarAppUiOnboardingProvider>
                                                                    </WizardPreviewHost>
                                                                  </HbarAppUiSupportProvider>
                                                                </HbarAppUiMobileProvider>
                                                              </HbarAppUiNotificationsProvider>
                                                            </HbarAppUiAppDialogProvider>
                                                          </HbarAppUiFormsProvider>
                                                        </HbarAppUiAnalyticsProvider>
                                                      </HbarAppUiDashboardProvider>
                                                    </HbarAppUiDataTableProvider>
                                                  </HbarAppUiCardProvider>
                                                </HbarAppUiPromptInputProvider>
                                              </HbarAppUiChatProvider>
                                            </SchedulingPreviewHost>
                                          </CommentsPreviewHost>
                                        </HbarAppUiIntegrationProvider>
                                      </HbarAppUiBillingProvider>
                                    </AuthenticationPreviewHost>
                                  </SettingsForm2PreviewHost>
                                </SettingsPreviewHost>
                              </FeedbackPreviewHost>
                            </HbarAppUiFileManagerProvider>
                          </AppShellPreviewHost>
                        </HbarAppUiAppSidebarProvider>
                      </HbarAppUiAiChatProvider>
                    </KanbanPreviewHost>
                  </LumenFrame>
                </LumenFrame>
              </LumenFrame>

              <LumenFrame as="aside" className="hbar-app-ui-preview-inspector" aria-label="Variant inspector">
                <LumenFrame className="hbar-app-ui-preview-inspector-section">
                  <LumenFrame className="hbar-app-ui-preview-section-heading">
                    <LumenText as="strong">Variants</LumenText>
                    <LumenText as="small">
                      {filteredEntries.filter(({ spec }) => spec.category === selected.spec.category).length} shown
                    </LumenText>
                  </LumenFrame>
                  <LumenFrame className="hbar-app-ui-preview-variant-list">
                    {filteredEntries
                      .filter(({ spec }) => spec.category === selected.spec.category)
                      .map((entry) => (
                        <LumenNavigationButton
                          key={entry.spec.id}
                          size="s"
                          selected={entry.spec.id === selected.spec.id}
                          indicatorEdge="left"
                          onClick={() => chooseEntry(entry)}
                        >
                          <LumenText as="span">{entry.spec.title}</LumenText>
                          <LumenText as="small">{entry.spec.layout}</LumenText>
                        </LumenNavigationButton>
                      ))}
                  </LumenFrame>
                </LumenFrame>
                <VariantHarness spec={selected.spec} onAction={handleAction} />
                <LumenFrame className="hbar-app-ui-preview-inspector-section">
                  <LumenFrame className="hbar-app-ui-preview-section-heading">
                    <LumenText as="strong">Interaction log</LumenText>
                    <LumenText as="small">{eventLog.length} events</LumenText>
                  </LumenFrame>
                  {eventLog.length ? (
                    <LumenCollection as="ol" className="hbar-app-ui-preview-events">
                      {eventLog.map((event, index) => (
                        <LumenCollectionItem key={`${event.variantId}-${event.actionId}-${index}`}>
                          <LumenText as="code">{event.actionId}</LumenText>
                          {event.value && <LumenText as="span">{event.value}</LumenText>}
                        </LumenCollectionItem>
                      ))}
                    </LumenCollection>
                  ) : (
                    <LumenText as="p" className="hbar-app-ui-preview-muted">
                      Use the selected component to observe action events.
                    </LumenText>
                  )}
                </LumenFrame>
                <LumenFrame className="hbar-app-ui-preview-inspector-section hbar-app-ui-preview-contract">
                  <LumenFrame className="hbar-app-ui-preview-section-heading">
                    <LumenText as="strong">Variant contract</LumenText>
                    <LumenText as="small">{selected.spec.density}</LumenText>
                  </LumenFrame>
                  <LumenCollection as="dl">
                    <LumenCollectionItem as="dt">Entry</LumenCollectionItem>
                    <LumenCollectionItem as="dd">
                      <LumenText as="code">{selected.spec.entry}</LumenText>
                    </LumenCollectionItem>
                    <LumenCollectionItem as="dt">Behavior</LumenCollectionItem>
                    <LumenCollectionItem as="dd">{selected.spec.behavior.join(' / ')}</LumenCollectionItem>
                    <LumenCollectionItem as="dt">Observation</LumenCollectionItem>
                    <LumenCollectionItem as="dd">{selected.spec.observation.join(' / ')}</LumenCollectionItem>
                    <LumenCollectionItem as="dt">Visual checks</LumenCollectionItem>
                    <LumenCollectionItem as="dd">{selected.spec.visualValidation.join(' / ')}</LumenCollectionItem>
                  </LumenCollection>
                </LumenFrame>
              </LumenFrame>
            </LumenFrame>
          </LumenFrame>
        </LumenFrame>
      </LumenFrame>
    </LumenProvider>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing hbar-app-ui preview root')
createRoot(root).render(<PreviewApp />)
