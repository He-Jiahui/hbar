import { RUN_LABELS } from './fixtures/hbar-app-ui-run-fixtures'
import { APPROVAL_LABELS, QUESTION_LABELS } from './fixtures/hbar-app-ui-decision-fixtures'
import { HBAR_APP_UI_NOTIFICATIONS_FIXTURES } from './fixtures/hbar-app-ui-notifications-fixtures'
import { HBAR_APP_UI_SUPPORT_FIXTURES } from './fixtures/hbar-app-ui-support-fixtures'
import { HBAR_APP_UI_WIZARD_FIXTURES } from './fixtures/hbar-app-ui-wizard-fixtures'
import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  AgentActivity,
  AgentApproval,
  AgentPlan,
  AiChat,
  AiUsage,
  Analytics,
  AppDialog,
  AppShell,
  AppSidebar,
  Authentication,
  Billing,
  Card,
  Chat,
  CommandMenu,
  Comments,
  HBAR_APP_UI_CATEGORIES,
  HBAR_APP_UI_CATEGORY_COUNTS,
  HBAR_APP_UI_VARIANT_EXPORTS,
  HBAR_APP_UI_VARIANT_SPECS,
  HbarAppUiApprovalRequest,
  HbarAppUiNotificationsProvider,
  HbarAppUiQuestionnaire,
  HbarAppUiRunActivity,
  HbarAppUiSupportProvider,
  HbarAppUiWizardProvider,
  Dashboard,
  DataTable,
  Editor,
  EmptyState,
  Feedback,
  FileManager,
  Filtering,
  Forms,
  Integrations,
  Kanban,
  List,
  Mobile,
  Monitoring,
  Navbar,
  Notifications,
  Onboarding,
  Paywall,
  PromptInput,
  Scheduling,
  SettingsForm,
  Support,
  ToolCalls,
  Wizard,
  createHbarAppUiVariantSpec,
  getHbarAppUiVariant,
  listHbarAppUiVariants,
} from '../packages/hbar-app-ui/src/index'

describe('hbar-app-ui registry', () => {
  test('contains every documented category and exactly 300 variants', () => {
    expect(HBAR_APP_UI_CATEGORIES).toHaveLength(38)
    expect(HBAR_APP_UI_VARIANT_SPECS).toHaveLength(300)
    expect(listHbarAppUiVariants()).toHaveLength(300)
    expect(Object.keys(HBAR_APP_UI_VARIANT_EXPORTS)).toHaveLength(300)
    expect(new Set(Object.values(HBAR_APP_UI_VARIANT_EXPORTS)).size).toBe(300)
    expect(new Set(listHbarAppUiVariants().map((entry) => entry.component)).size).toBe(300)
    expect(HBAR_APP_UI_CATEGORIES.reduce((total, category) => total + HBAR_APP_UI_CATEGORY_COUNTS[category], 0)).toBe(
      300,
    )
  })

  test('keeps IDs unique and category counts aligned with the registry', () => {
    const ids = new Set(HBAR_APP_UI_VARIANT_SPECS.map((spec) => spec.id))
    expect(ids.size).toBe(300)
    for (const category of HBAR_APP_UI_CATEGORIES) {
      expect(HBAR_APP_UI_VARIANT_SPECS.filter((spec) => spec.category === category)).toHaveLength(
        HBAR_APP_UI_CATEGORY_COUNTS[category],
      )
    }
  })

  test('returns a stable entry and rejects invalid variants', () => {
    const entry = getHbarAppUiVariant('agent-activity', 1)
    expect(entry.spec.id).toBe('hbar-app-ui-agent-activity-1')
    expect(entry.spec.entry).toBe(entry.spec.id)
    expect(entry.spec.behavior.length).toBeGreaterThan(0)
    expect(entry.spec.observation.length).toBeGreaterThan(0)
    expect(entry.spec.visualValidation).toHaveLength(3)
    expect(entry.component).toBeFunction()
    expect(() => createHbarAppUiVariantSpec('agent-activity', 0)).toThrow(RangeError)
    expect(() => createHbarAppUiVariantSpec('agent-activity', 8)).toThrow(RangeError)
  })

  test('registry entries resolve to their named public components', () => {
    const named = HBAR_APP_UI_VARIANT_EXPORTS.HbarAppUiAgentActivity01
    expect(getHbarAppUiVariant('agent-activity', 1).component).toBe(named)
    expect(getHbarAppUiVariant('chat', 6).component).toBe(HBAR_APP_UI_VARIANT_EXPORTS.HbarAppUiChat06)
  })

  test('publishes one independently maintained surface for every category', () => {
    const categorySurfaces = [
      AiChat,
      PromptInput,
      AgentActivity,
      ToolCalls,
      AgentApproval,
      AgentPlan,
      AiUsage,
      AppShell,
      AppSidebar,
      CommandMenu,
      Navbar,
      Mobile,
      Card,
      DataTable,
      Dashboard,
      Analytics,
      List,
      Filtering,
      FileManager,
      Monitoring,
      EmptyState,
      SettingsForm,
      Forms,
      AppDialog,
      Notifications,
      Onboarding,
      Paywall,
      Authentication,
      Kanban,
      Wizard,
      Comments,
      Scheduling,
      Integrations,
      Editor,
      Feedback,
      Support,
      Billing,
      Chat,
    ]
    expect(categorySurfaces).toHaveLength(HBAR_APP_UI_CATEGORIES.length)
    expect(new Set(categorySurfaces).size).toBe(HBAR_APP_UI_CATEGORIES.length)
  })

  test('keeps support variants as separate semantic hbar-app-ui surfaces', () => {
    const markup = Array.from({ length: 5 }, (_, index) =>
      renderToStaticMarkup(
        createElement(HbarAppUiSupportProvider, {
          content: HBAR_APP_UI_SUPPORT_FIXTURES,
          children: createElement(getHbarAppUiVariant('support', index + 1).component, {}),
        }),
      ),
    )

    expect(markup[0]).toContain('aria-label="Help topics"')
    expect(markup[1]).toContain('<fieldset')
    expect(markup[1]).toContain('Area')
    expect(markup[2]).toContain('lumen-support-messages')
    expect(markup[2]).toContain('lumen-support-reply')
    expect(markup[3]).toContain('role="dialog"')
    expect(markup[3]).toContain('lumen-support-transcript')
    expect(markup[4]).toContain('role="tablist"')
    expect(markup[4]).toContain('aria-label="Support requests"')
    expect(new Set(markup).size).toBe(5)
    for (const surface of markup) {
      expect(surface.toLocaleLowerCase()).not.toContain('react-bits')
      expect(surface.toLocaleLowerCase()).not.toContain('reactbits')
    }
  })

  test('keeps notification variants split by semantic surface and free of legacy naming', () => {
    const markup = Array.from({ length: 6 }, (_, index) =>
      renderToStaticMarkup(
        createElement(HbarAppUiNotificationsProvider, {
          content: HBAR_APP_UI_NOTIFICATIONS_FIXTURES,
          children: createElement(getHbarAppUiVariant('notifications', index + 1).component, {}),
        }),
      ),
    )

    expect(markup[0]).toContain('lumen-notifications-feed')
    expect(markup[0]).toContain('role="tablist"')
    expect(markup[1]).toContain('lumen-notifications-toast-choices')
    expect(markup[1]).toContain('No active toasts')
    expect(markup[2]).toContain('role="switch"')
    expect(markup[2]).toContain('Notification preferences')
    expect(markup[3]).toContain('lumen-activity-layout')
    expect(markup[3]).toContain('Cedar Labs billing')
    expect(markup[4]).toContain('lumen-system-scroll')
    expect(markup[4]).toContain('System messages')
    expect(markup[5]).toContain('lumen-notifications-bell')
    expect(markup[5]).toContain('Open the bell to review recent activity')
    expect(new Set(markup).size).toBe(6)
    for (const surface of markup) {
      expect(surface.toLocaleLowerCase()).not.toContain('react-bits')
      expect(surface.toLocaleLowerCase()).not.toContain('reactbits')
    }
  })

  test('keeps wizard variants split by workflow semantics and free of legacy naming', () => {
    const markup = Array.from({ length: 7 }, (_, index) =>
      renderToStaticMarkup(
        createElement(HbarAppUiWizardProvider, {
          content: HBAR_APP_UI_WIZARD_FIXTURES,
          children: createElement(getHbarAppUiVariant('wizard', index + 1).component, {}),
        }),
      ),
    )

    expect(markup[0]).toContain('hbar-app-ui-wizard-information-form')
    expect(markup[0]).toContain('Your information')
    expect(markup[1]).toContain('hbar-app-ui-wizard-invoice-card')
    expect(markup[1]).toContain('Customer details')
    expect(markup[2]).toContain('hbar-app-ui-wizard-plan-list')
    expect(markup[2]).toContain('Invoice preview')
    expect(markup[3]).toContain('hbar-app-ui-wizard-service-grid')
    expect(markup[3]).toContain('Environment services')
    expect(markup[4]).toContain('hbar-app-ui-wizard-review-sections')
    expect(markup[4]).toContain('Review before sending')
    expect(markup[5]).toContain('hbar-app-ui-wizard-migration-list')
    expect(markup[5]).toContain('Migrating workspace')
    expect(markup[6]).toContain('hbar-app-ui-wizard-question-options')
    expect(markup[6]).toContain('Where do you ship to?')
    expect(new Set(markup).size).toBe(7)
    for (const surface of markup) {
      expect(surface.toLocaleLowerCase()).not.toContain('react-bits')
      expect(surface.toLocaleLowerCase()).not.toContain('reactbits')
    }
  })

  test('named components render a self-contained UI block without preview chrome', () => {
    const markup = renderToStaticMarkup(createElement(HBAR_APP_UI_VARIANT_EXPORTS.HbarAppUiAgentActivity01, {}))
    expect(markup).toContain('data-hbar-app-ui-component="hbar-app-ui-agent-activity-1"')
    expect(markup).not.toContain('hbar-app-ui-preview')
    expect(markup).not.toContain('hbar-app-ui-profile-controls')
    expect(markup).not.toContain('seeded items')
  })

  test('renders a data-driven run activity surface without coupling to preview state', () => {
    const markup = renderToStaticMarkup(
      createElement(HbarAppUiRunActivity, {
        listStrategy: 'content-grown',
        labels: {
          ...RUN_LABELS,
          title: '运行记录',
          countLabel: (count) => `${count} 个运行`,
          cancelLabel: '停止此运行',
          cancellingLabel: '正在停止',
          retryLabel: '重试此运行',
          retryingLabel: '正在重试',
          planTitle: 'Agent 计划',
          planProgress: (completed, total) => `${completed}/${total} 已完成`,
          planStatusLabel: (status) => `计划:${status}`,
        },
        cancellingRunIds: ['run-active'],
        retryingRunIds: ['run-failed'],
        onCancelRun: () => undefined,
        onRetryRun: () => undefined,
        plan: {
          runId: 'run-complete',
          explanation: '按顺序完成变更。',
          steps: [
            { id: 'step-one', title: '检查工作区', status: 'completed' },
            { id: 'step-two', title: '运行验证', status: 'in_progress' },
          ],
        },
        runs: [
          {
            id: 'run-active',
            label: '同步当前工作区',
            status: 'running',
            statusLabel: '运行中',
            detail: '10:32',
          },
          {
            id: 'run-complete',
            label: '生成摘要',
            status: 'completed',
            statusLabel: '已完成',
            duration: '2 秒',
          },
          {
            id: 'run-queued',
            label: '等待同步',
            status: 'queued',
            statusLabel: '排队中',
          },
          {
            id: 'run-failed',
            label: '检查失败',
            status: 'failed',
            statusLabel: '失败',
          },
        ],
      }),
    )
    expect(markup).toContain('运行记录')
    expect(markup).toContain('4 个运行')
    expect(markup).toContain('正在停止')
    expect(markup).toContain('停止此运行')
    expect(markup).toContain('正在重试')
    expect(markup).toContain('hbar-app-ui-run-activity-retry')
    expect(markup).toContain('Agent 计划')
    expect(markup).toContain('1/2 已完成')
    expect(markup).toContain('按顺序完成变更。')
    expect(markup).toContain('计划:in_progress')
    expect(markup).toContain('hbar-app-ui-run-status-running')
    expect(markup.match(/hbar-app-ui-run-activity-actions/g) ?? []).toHaveLength(4)
    expect(markup).not.toContain('hbar-app-ui-preview')
    expect(markup).not.toContain('hbar-app-ui-profile-controls')
  })

  test('accepts a host-owned localized bundle for every data-driven surface', () => {
    const runMarkup = renderToStaticMarkup(
      createElement(HbarAppUiRunActivity, {
        listStrategy: 'content-grown',
        labels: {
          title: 'Aktivitäten',
          emptyTitle: 'Keine Läufe',
          emptyDescription: 'Hier erscheinen Ausführungen.',
          cancelLabel: 'Lauf stoppen',
          cancellingLabel: 'Wird gestoppt',
          retryLabel: 'Erneut versuchen',
          retryingLabel: 'Wird erneut versucht',
          planTitle: 'Agentenplan',
          planProgress: (completed, total) => `${completed} von ${total} erledigt`,
          planStatusLabel: (status) => `plan:${status}`,
          countLabel: (count) => `${count} ${count === 1 ? 'Lauf' : 'Läufe'}`,
          statusLabel: (status) => `status:${status}`,
        },
        runs: [{ id: 'run-1', label: 'Deploy', status: 'running' }],
      }),
    )
    expect(runMarkup).toContain('Aktivitäten')
    expect(runMarkup).toContain('1 Lauf')
    expect(runMarkup).toContain('status:running')
    expect(runMarkup).not.toContain('Running')

    const approvalMarkup = renderToStaticMarkup(
      createElement(HbarAppUiApprovalRequest, {
        labels: {
          title: 'Freigabe erforderlich',
          detailsLabel: 'Details anzeigen',
          statusLabel: 'Entscheidung offen',
          denyLabel: 'Ablehnen',
          allowLabel: 'Erlauben',
          allowAlwaysLabel: 'Immer erlauben',
          savingLabel: 'Wird gespeichert',
          completeLabel: 'Gespeichert',
          failureMessage: 'Speichern fehlgeschlagen',
        },
        tool: 'file.write',
        summary: 'workspace/plan.md',
        details: '{}',
        onDecision: () => undefined,
        state: { status: 'idle' },
        id: 'approval-test',
      }),
    )
    expect(approvalMarkup).toContain('Freigabe erforderlich')
    expect(approvalMarkup).toContain('Details anzeigen')
    expect(approvalMarkup).toContain('Immer erlauben')
    expect(approvalMarkup).not.toContain('Approval required')

    const questionnaireMarkup = renderToStaticMarkup(
      createElement(HbarAppUiQuestionnaire, {
        requestId: 'request-localized',
        labels: {
          title: 'Antwort erforderlich',
          countLabel: (count) => `${count} Fragen`,
          customAnswerLabel: 'Andere Option',
          customAnswerPlaceholder: 'Eigene Antwort',
          freeformLabel: 'Antwort',
          submitLabel: 'Antworten senden',
          submittingLabel: 'Wird gesendet',
          submittedLabel: 'Gesendet',
          incompleteMessage: 'Bitte alles beantworten',
          rejectedMessage: 'Anfrage abgelaufen',
          failureMessage: 'Senden fehlgeschlagen',
        },
        questions: [
          { id: 'scope', header: 'Bereich', prompt: 'Welche Zone?', options: [{ value: 'app', label: 'App' }] },
        ],
        onSubmit: () => undefined,
        state: { status: 'idle' },
        answers: {},
        onAnswer: () => undefined,
      }),
    )
    expect(questionnaireMarkup).toContain('Antwort erforderlich')
    expect(questionnaireMarkup).toContain('1 Fragen')
    expect(questionnaireMarkup).toContain('Antworten senden')
    expect(questionnaireMarkup).not.toContain('Your input is needed')
  })

  test('renders a data-driven approval surface without application dependencies', () => {
    const markup = renderToStaticMarkup(
      createElement(HbarAppUiApprovalRequest, {
        tool: 'file.write',
        summary: 'file.write · workspace/plan.md',
        details: '{\n  "path": "workspace/plan.md"\n}',
        onDecision: () => undefined,
        labels: {
          ...APPROVAL_LABELS,
          title: '批准工具调用',
          detailsLabel: '查看参数',
          statusLabel: '需要决定',
          denyLabel: '拒绝',
          allowLabel: '批准',
          allowAlwaysLabel: '允许并记住',
        },
        state: { status: 'idle' },
        id: 'approval-test',
      }),
    )
    expect(markup).toContain('hbar-app-ui-approval-request')
    expect(markup).toContain('file.write · workspace/plan.md')
    expect(markup).toContain('允许并记住')
    expect(markup).not.toContain('hbar-app-ui-preview')
    expect(markup).not.toContain('hbar-app-ui-profile-controls')
  })

  test('renders a data-driven questionnaire without application dependencies', () => {
    const markup = renderToStaticMarkup(
      createElement(HbarAppUiQuestionnaire, {
        requestId: 'request-1',
        questions: [
          {
            id: 'scope',
            header: '范围',
            prompt: '计划应覆盖哪个范围？',
            options: [
              { value: 'app', label: '应用', description: '覆盖应用流程。' },
              { value: 'api', label: '接口', description: '覆盖接口契约。' },
            ],
          },
        ],
        onSubmit: () => undefined,
        labels: { ...QUESTION_LABELS, title: '需要你的回答', submitLabel: '提交回答' },
        state: { status: 'idle' },
        answers: {},
        onAnswer: () => undefined,
      }),
    )
    expect(markup).toContain('hbar-app-ui-questionnaire')
    expect(markup).toContain('计划应覆盖哪个范围？')
    expect(markup).toContain('提交回答')
    expect(markup).not.toContain('hbar-app-ui-preview')
    expect(markup).not.toContain('hbar-app-ui-profile-controls')
  })

  test('keeps a distinct profile and observable markup for every variant', () => {
    for (const category of HBAR_APP_UI_CATEGORIES) {
      const entries = listHbarAppUiVariants().filter((entry) => entry.spec.category === category)
      expect(new Set(entries.map((entry) => entry.spec.profile.key)).size).toBe(entries.length)
      expect(new Set(entries.map((entry) => entry.spec.profile.scenario)).size).toBe(entries.length)
      const markup = entries.map((entry) =>
        renderToStaticMarkup(createElement(entry.component, { onAction: () => undefined })),
      )
      expect(new Set(markup).size).toBe(entries.length)
    }
  })
})
