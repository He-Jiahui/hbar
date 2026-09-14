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
  HbarAppUiQuestionnaire,
  HbarAppUiRunActivity,
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
    expect(HBAR_APP_UI_CATEGORIES.reduce((total, category) => total + HBAR_APP_UI_CATEGORY_COUNTS[category], 0)).toBe(300)
  })

  test('keeps IDs unique and category counts aligned with the registry', () => {
    const ids = new Set(HBAR_APP_UI_VARIANT_SPECS.map((spec) => spec.id))
    expect(ids.size).toBe(300)
    for (const category of HBAR_APP_UI_CATEGORIES) {
      expect(HBAR_APP_UI_VARIANT_SPECS.filter((spec) => spec.category === category)).toHaveLength(HBAR_APP_UI_CATEGORY_COUNTS[category])
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
        title: '运行记录',
        countLabel: (count) => `${count} 个运行`,
        cancelLabel: '停止此运行',
        cancellingLabel: '正在停止',
        cancellingRunIds: ['run-active'],
        onCancelRun: () => undefined,
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
        ],
      }),
    )
    expect(markup).toContain('运行记录')
    expect(markup).toContain('3 个运行')
    expect(markup).toContain('正在停止')
    expect(markup).toContain('停止此运行')
    expect(markup).toContain('hbar-app-ui-run-status-running')
    expect(markup).not.toContain('hbar-app-ui-preview')
    expect(markup).not.toContain('hbar-app-ui-profile-controls')
  })

  test('accepts a host-owned localized bundle for every data-driven surface', () => {
    const runMarkup = renderToStaticMarkup(
      createElement(HbarAppUiRunActivity, {
        labels: {
          title: 'Aktivitäten',
          emptyTitle: 'Keine Läufe',
          emptyDescription: 'Hier erscheinen Ausführungen.',
          cancelLabel: 'Lauf stoppen',
          cancellingLabel: 'Wird gestoppt',
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
        questions: [{ id: 'scope', header: 'Bereich', prompt: 'Welche Zone?', options: [{ value: 'app', label: 'App' }] }],
        onSubmit: () => ({ accepted: true }),
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
        title: '批准工具调用',
        tool: 'file.write',
        summary: 'file.write · workspace/plan.md',
        details: '{\n  "path": "workspace/plan.md"\n}',
        detailsLabel: '查看参数',
        statusLabel: '需要决定',
        denyLabel: '拒绝',
        allowLabel: '批准',
        allowAlwaysLabel: '允许并记住',
        onDecision: async () => undefined,
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
        title: '需要你的回答',
        submitLabel: '提交回答',
        questions: [
          {
            id: 'scope',
            header: '范围',
            prompt: '计划应覆盖哪个范围？',
            options: [
              {value: 'app', label: '应用', description: '覆盖应用流程。'},
              {value: 'api', label: '接口', description: '覆盖接口契约。'},
            ],
          },
        ],
        onSubmit: async () => ({accepted: true}),
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
      const markup = entries.map((entry) => renderToStaticMarkup(createElement(entry.component, { onAction: () => undefined })))
      expect(new Set(markup).size).toBe(entries.length)
    }
  })
})
