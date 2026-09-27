import { extensionDetailCopy } from './extension-detail-copy'
import { fileWorkspaceCopy } from './file-workspace-copy'
import { settingsUsageCopy } from './settings-usage-copy'
import { goalLifecycleCopy, goalHistoryCopy } from './goal-lifecycle-copy'
import type {
  HbarAgentWorkspaceLabels,
  HbarCommandPaletteLabels,
  HbarExtensionWorkspaceLabels,
  HbarFileWorkspaceLabels,
  HbarGoalPlanWorkspaceLabels,
  HbarProviderDialogLabels,
  HbarProviderSettingsLabels,
  HbarSessionMonitoringLabels,
  HbarSessionWorkspaceLabels,
  HbarSettingsWorkspaceLabels,
  HbarSettingsUsageLabels,
  HbarStatusWorkspaceLabels,
  HbarSystemDiagnosticsLabels,
  HbarWorkspaceShellLabels,
} from '@hbar/app-react'
import type { WebAppearanceSettingsLabels } from './AppearanceSettings'
import type { PlanProposalRequestText } from '@hbar/app-runtime'
import { goalExecutionCopy } from './goal-execution-copy'
import { composerAttachmentCopy } from './composer-attachment-copy'
import { generalSettingsCopy } from './general-settings-copy'
import type { WebGeneralSettingsLabels } from './GeneralSettings'
import { toolPaneLayoutCopy, type ToolPaneLayoutLabels } from './tool-pane-layout-copy'
import { sidebarLayoutCopy, type SidebarLayoutLabels } from './sidebar-layout-copy'
import { composerIntentBlockedCopy } from './composer-intent-blocked-copy'
import { composerGoalRecoveryCopy } from './composer-goal-recovery-copy'
import { composerExecutionCopy } from './composer-execution-copy'
import { extensionCollectionCopy } from './extension-collection-copy'
import { extensionNavigationCopy } from './extension-navigation-copy'
import { codeBlockCopyLabels } from './code-block-copy-labels'
import { sessionFindCopy } from './session-find-copy'
import { workspaceOrganizationCopy } from './workspace-organization-copy'
import { workspaceDisplayNamesCopy } from './workspace-display-names-copy'
import { getSessionStopCopy, sessionStopButtonLabel } from './session-stop-copy'

export type ShellLocale = 'zh-CN' | 'en-US'

function thinkingLevelLabel(locale: ShellLocale, value: unknown): string {
  const labels: Readonly<Record<string, string>> =
    locale === 'zh-CN'
      ? { off: '关闭', minimal: '最少', low: '低', medium: '中', high: '高', xhigh: '超高', max: '最大' }
      : {
          off: 'Off',
          minimal: 'Minimal',
          low: 'Low',
          medium: 'Medium',
          high: 'High',
          xhigh: 'Extra high',
          max: 'Maximum',
        }
  const key = String(value)
  return labels[key] ?? key
}

interface ShellCopy {
  readonly sidebarLayout: SidebarLayoutLabels
  readonly toolLayout: ToolPaneLayoutLabels
  readonly shell: HbarWorkspaceShellLabels
  readonly windowControls: {
    readonly minimize: string
    readonly maximize: string
    readonly restore: string
    readonly close: string
  }
  readonly empty: { readonly title: string; readonly description: string }
  readonly session: HbarSessionWorkspaceLabels
  readonly planProposal: { readonly requestText: PlanProposalRequestText }
  readonly settings: HbarSettingsWorkspaceLabels
  readonly appearance: WebAppearanceSettingsLabels
  readonly general: WebGeneralSettingsLabels
  readonly providers: {
    readonly list: HbarProviderSettingsLabels
    readonly dialog: HbarProviderDialogLabels
  }
  readonly commandPalette: HbarCommandPaletteLabels
  readonly files: HbarFileWorkspaceLabels
  readonly monitoring: HbarSessionMonitoringLabels
  readonly agents: HbarAgentWorkspaceLabels
  readonly goals: HbarGoalPlanWorkspaceLabels
  readonly extensions: HbarExtensionWorkspaceLabels
  readonly status: HbarStatusWorkspaceLabels
  readonly diagnostics: HbarSystemDiagnosticsLabels
  readonly settingsUsage: HbarSettingsUsageLabels
}

function createAppearanceLabels(locale: ShellLocale): WebAppearanceSettingsLabels {
  const zh = locale === 'zh-CN'
  const choose = <Value>(chinese: Value, english: Value): Value => (zh ? chinese : english)
  const sizeNames = {
    s: choose('小', 'Small'),
    m: choose('中', 'Medium'),
    l: choose('大', 'Large'),
  } as const
  const sizeDetails = {
    controlSize: {
      s: choose('紧凑控件', 'compact controls'),
      m: choose('标准控件', 'standard controls'),
      l: choose('宽松控件', 'spacious controls'),
    },
    textSize: {
      s: choose('高密度文字', 'dense text'),
      m: choose('标准文字', 'standard text'),
      l: choose('易读文字', 'readable text'),
    },
    cornerSize: {
      s: choose('轻微圆角', 'subtle corners'),
      m: choose('标准圆角', 'standard corners'),
      l: choose('柔和圆角', 'soft corners'),
    },
  } as const
  return {
    group: choose('外观', 'Appearance'),
    title: choose('外观', 'Appearance'),
    description: choose(
      '统一设置按钮、文字、输入控件和圆角的默认档位。显式指定尺寸的特殊控件不受影响。',
      'Set the default scale for buttons, text, form controls, and corners. Components with an explicit semantic size keep their own scale.',
    ),
    deviceScope: choose('此设备全局生效', 'Applies globally on this device'),
    theme: {
      label: choose('主题', 'Theme'),
      description: choose('选择浅色、深色，或跟随系统外观。', 'Choose light, dark, or follow the system appearance.'),
      system: choose('跟随系统', 'System'),
      light: choose('浅色', 'Light'),
      dark: choose('深色', 'Dark'),
    },
    controlSize: {
      label: choose('控件尺寸', 'Control size'),
      description: choose(
        '控制按钮、输入框和选择器的默认高度与内边距。',
        'Controls default height and padding for buttons, inputs, and selects.',
      ),
    },
    textSize: {
      label: choose('文本尺寸', 'Text size'),
      description: choose(
        '控制正文、标签和辅助文字的默认字号与行高。',
        'Controls the default size and line height for body, label, and supporting text.',
      ),
    },
    cornerSize: {
      label: choose('圆角尺寸', 'Corner size'),
      description: choose(
        '控制通用按钮、输入框和面板的默认圆角。',
        'Controls the default corner radius for shared buttons, fields, and panels.',
      ),
    },
    sizeOption: (dimension, size) => `${sizeNames[size]} · ${sizeDetails[dimension][size]}`,
    preview: {
      title: choose('实时预览', 'Live preview'),
      description: choose(
        '草稿只影响此预览；保存后才应用到整个应用。',
        'The draft affects this preview only and applies to the app after saving.',
      ),
      label: choose('示例标签', 'Example label'),
      input: choose('示例输入内容', 'Example input value'),
      select: choose('示例选择器', 'Example select'),
      button: choose('主要操作', 'Primary action'),
      iconButton: choose('外观操作示例', 'Example appearance action'),
    },
    loading: choose('正在读取设备偏好', 'Loading device preferences'),
    identityPending: choose(
      '正在确认 Host。可以编辑外观草稿；确认并读取已保存值后才能保存或恢复默认。',
      'Confirming the Host. You can edit the appearance draft; saving and restoring defaults require confirmed saved preferences.',
    ),
    unsaved: choose('有未保存的外观更改', 'Appearance changes are not saved'),
    saved: choose('外观偏好已保存', 'Appearance preferences saved'),
    volatile: choose(
      '外观更改已应用，但此设备未提供持久化；重启后可能恢复原状。',
      'Appearance changes apply for this run only; this device has no persistent preferences.',
    ),
    save: choose('保存外观', 'Save appearance'),
    reset: choose('恢复默认', 'Restore defaults'),
    discard: choose('舍弃外观草稿', 'Discard appearance draft'),
    check: choose('核对已保存值', 'Check saved values'),
    checking: choose('正在核对设备偏好…', 'Checking device preferences…'),
    continueDraft: choose('保留草稿并继续', 'Keep draft and continue'),
    continueAfterReset: choose('保留原草稿（不继续重置）', 'Keep previous draft (do not continue reset)'),
    acceptCurrent: choose('接受当前已保存值', 'Accept currently saved values'),
    resetConflict: choose(
      '恢复默认尚未全部完成。核对后可接受当前值，再明确点击“恢复默认”；也可保留原草稿，但不会继续重置。',
      'Restore defaults did not fully finish. Accept the current values and choose Restore defaults again, or keep the previous draft without continuing the reset.',
    ),
    conflict: choose(
      '已保存的外观与草稿不一致。先核对，再选择继续或舍弃。',
      'Saved appearance differs from the draft. Check it, then choose to continue or discard.',
    ),
    unknown: choose(
      '保存结果尚未确认。请先核对；不会自动重新提交。',
      'The save result is unconfirmed. Check before submitting again; it will not replay automatically.',
    ),
    restoreError: (code) =>
      choose(
        `无法读取设备偏好：${code}。核对前不会覆盖。`,
        `Could not read device preferences: ${code}. Changes are blocked until a check succeeds.`,
      ),
    partial: (count, total) =>
      choose(
        `${count}/${total} 项草稿更改目前已应用；其余仍未确认。`,
        `${count} of ${total} draft changes are currently applied; the rest are not confirmed.`,
      ),
    latest: (theme, control, text, corner) =>
      choose(
        `当前已保存：${theme}、${control}、${text}、${corner}。`,
        `Currently saved: ${theme}, ${control}, ${text}, ${corner}.`,
      ),
    error: (code) => choose(`外观偏好保存失败：${code}`, `Could not save appearance preferences: ${code}`),
  }
}

function createCommandPaletteLabels(locale: ShellLocale): HbarCommandPaletteLabels {
  const zh = locale === 'zh-CN'
  const choose = <Value>(chinese: Value, english: Value): Value => (zh ? chinese : english)
  const categories: Readonly<Record<string, string>> = zh
    ? {
        'app.navigation': '应用与导航',
        'workspace.session': '工程与会话',
        'run.approval': '运行与审批',
        'model.budget': '模型与预算',
        'model.configuration': '模型配置',
        'agent.goal.plan': 'Agent、目标与计划',
        'files.tools': '文件与工具',
        'settings.providers': '设置与供应商',
        'monitoring.performance': '性能监控',
        'monitoring.usage': '用量监控',
        'monitoring.git': 'Git 统计',
        'system.extensions': '系统与扩展',
      }
    : {
        'app.navigation': 'App and navigation',
        'workspace.session': 'Projects and sessions',
        'run.approval': 'Runs and approvals',
        'model.budget': 'Models and budgets',
        'model.configuration': 'Model configuration',
        'agent.goal.plan': 'Agents, goals, and plans',
        'files.tools': 'Files and tools',
        'settings.providers': 'Settings and providers',
        'monitoring.performance': 'Performance monitoring',
        'monitoring.usage': 'Usage monitoring',
        'monitoring.git': 'Git statistics',
        'system.extensions': 'System and extensions',
      }
  const messages: Readonly<Record<string, string>> = zh
    ? {
        'commands.app.openPanel.title': '打开子界面',
        'commands.app.openPanel.description': '在当前工作台打开指定子界面。',
        'commands.app.closePanel.title': '关闭子界面',
        'commands.app.closePanel.description': '关闭指定的工作台子界面。',
        'commands.app.back.title': '返回上一层界面',
        'commands.app.back.description': '依次关闭活动弹窗、会话工具或管理页面。',
        'commands.app.setSidebarVisible.title': '设置侧栏可见性',
        'commands.app.setSidebarVisible.description': '显示或隐藏当前工作台的工程与会话侧栏。',
        'commands.app.openSettings.title': '打开设置',
        'commands.app.openSettings.description': '按全局、工作区或会话作用域打开设置。',
        'commands.app.openStatus.title': '打开状态中心',
        'commands.app.openStatus.description': '打开性能、用量或 Git 状态分区。',
        'commands.app.setWorkspace.title': '选择工作区',
        'commands.app.setWorkspace.description': '将当前工作台聚焦到指定工作区。',
        'commands.app.setSession.title': '选择会话',
        'commands.app.setSession.description': '按 ID 或名称将当前工作台聚焦到会话。',
        'commands.app.createSession.title': '新建会话',
        'commands.app.createSession.description': '在所选工作区创建会话，并立即切换到新会话。',
        'commands.app.renameSession.title': '重命名会话',
        'commands.app.renameSession.description': '修改指定会话的标题并立即更新会话列表。',
        'commands.app.archiveSession.title': '归档会话',
        'commands.app.archiveSession.description': '归档指定会话，并在归档当前会话时返回会话空态。',
        'commands.session.setBudget.title': '设置会话 Token 预算',
        'commands.session.setBudget.description': '持久设置指定会话的 Token 上限。',
        'commands.session.getBudget.title': '查询会话 Token 预算',
        'commands.session.getBudget.description': '读取指定会话当前生效的 Token 预算。',
        'commands.session.clearBudget.title': '清除会话 Token 预算',
        'commands.session.clearBudget.description': '删除指定会话的独立 Token 预算。',
        'commands.workspace.list.title': '列出工作区',
        'commands.workspace.list.description': '分页查询 Host 中的工作区。',
        'commands.workspace.open.title': '打开工作区',
        'commands.workspace.open.description': '按目录路径在 Host 注册工作区并切换当前工作台。',
        'commands.session.list.title': '列出会话',
        'commands.session.list.description': '分页查询指定工作区的会话。',
        'commands.provider.preset.list.title': '列出供应商预设',
        'commands.provider.preset.list.description': '按名称、协议或 API 地址分页查询内置供应商预设。',
        'commands.provider.preset.models.title': '列出预设模型',
        'commands.provider.preset.models.description': '分页查询供应商预设中的模型、能力与思考等级。',
      }
    : {
        'commands.app.openPanel.title': 'Open panel',
        'commands.app.openPanel.description': 'Open a named panel in the current workbench.',
        'commands.app.closePanel.title': 'Close panel',
        'commands.app.closePanel.description': 'Close a workbench panel instance.',
        'commands.app.back.title': 'Go back',
        'commands.app.back.description': 'Close the active modal, session tool, or management page in that order.',
        'commands.app.setSidebarVisible.title': 'Set sidebar visibility',
        'commands.app.setSidebarVisible.description':
          'Show or hide the projects and sessions sidebar for this workbench.',
        'commands.app.openSettings.title': 'Open settings',
        'commands.app.openSettings.description': 'Open settings at global, workspace, or session scope.',
        'commands.app.openStatus.title': 'Open status center',
        'commands.app.openStatus.description': 'Open the performance, usage, or Git status section.',
        'commands.app.setWorkspace.title': 'Select workspace',
        'commands.app.setWorkspace.description': 'Focus the current workbench on a workspace.',
        'commands.app.setSession.title': 'Select session',
        'commands.app.setSession.description': 'Focus the current workbench on a session by ID or name.',
        'commands.app.createSession.title': 'New session',
        'commands.app.createSession.description': 'Create a session in the selected workspace and open it immediately.',
        'commands.app.renameSession.title': 'Rename session',
        'commands.app.renameSession.description': 'Change a session title and update the session list immediately.',
        'commands.app.archiveSession.title': 'Archive session',
        'commands.app.archiveSession.description': 'Archive a session and leave it when it is currently selected.',
        'commands.session.setBudget.title': 'Set session token budget',
        'commands.session.setBudget.description': 'Persist the token limit for a session.',
        'commands.session.getBudget.title': 'Get session token budget',
        'commands.session.getBudget.description': 'Read the effective token budget for a session.',
        'commands.session.clearBudget.title': 'Clear session token budget',
        'commands.session.clearBudget.description': 'Remove the session-specific token budget.',
        'commands.workspace.list.title': 'List workspaces',
        'commands.workspace.list.description': 'Query Host workspaces by page.',
        'commands.workspace.open.title': 'Open workspace',
        'commands.workspace.open.description': 'Register a Host workspace by directory path and select it here.',
        'commands.session.list.title': 'List sessions',
        'commands.session.list.description': 'Query sessions in a workspace by page.',
        'commands.provider.preset.list.title': 'List provider presets',
        'commands.provider.preset.list.description': 'Query built-in provider presets by name, protocol, or API URL.',
        'commands.provider.preset.models.title': 'List preset models',
        'commands.provider.preset.models.description':
          'Query models, capabilities, and thinking levels in a provider preset.',
      }
  const fields: Readonly<Record<string, string>> = zh
    ? {
        sessionId: '会话 ID',
        workspaceId: '工作区 ID',
        session: '会话 ID 或名称',
        sessionName: '会话名称',
        tokens: 'Token 上限',
        expectedRevision: '预期版本',
        expectedTitle: '编辑前标题',
        panelId: '子界面 ID',
        instanceId: '实例 ID',
        binding: '目标绑定方式',
        scope: '作用域',
        targetId: '目标 ID',
        section: '分区',
        windowId: '窗口 ID',
        page: '页面描述',
        after: '分页游标',
        limit: '返回数量',
        includeArchived: '包含已归档会话',
        title: '标题',
        path: '目录路径',
        input: '输入',
        modelId: '模型 ID',
        operationId: '操作 ID',
        presetId: '供应商预设 ID',
        query: '搜索关键词',
        cursor: '分页游标',
        visible: '是否可见',
      }
    : {
        sessionId: 'Session ID',
        workspaceId: 'Workspace ID',
        session: 'Session ID or name',
        sessionName: 'Session name',
        tokens: 'Token limit',
        expectedRevision: 'Expected revision',
        expectedTitle: 'Previous title',
        panelId: 'Panel ID',
        instanceId: 'Instance ID',
        binding: 'Target binding',
        scope: 'Scope',
        targetId: 'Target ID',
        section: 'Section',
        windowId: 'Window ID',
        page: 'Page descriptor',
        after: 'Page cursor',
        limit: 'Result limit',
        includeArchived: 'Include archived sessions',
        title: 'Title',
        path: 'Directory path',
        input: 'Input',
        modelId: 'Model ID',
        operationId: 'Operation ID',
        presetId: 'Provider preset ID',
        query: 'Search query',
        cursor: 'Page cursor',
        visible: 'Visible',
      }
  const resolve = (key: string) => {
    if (messages[key]) return messages[key]
    const category = key.startsWith('commands.categories.') ? key.slice('commands.categories.'.length) : null
    return category ? (categories[category] ?? key) : key
  }
  return {
    title: choose('命令目录', 'Command catalog'),
    description: choose(
      '搜索同一份公开命令定义，填写参数并在当前上下文执行。',
      'Search the shared command definitions, fill parameters, and execute in the current context.',
    ),
    search: choose('搜索命令', 'Search commands'),
    available: choose('可用命令', 'Available commands'),
    empty: choose('没有匹配的命令。', 'No matching commands.'),
    unavailable: choose('先前选择的命令已不可用。', 'The previous command selection is unavailable.'),
    choose: choose('选择', 'Choose'),
    close: choose('关闭命令目录', 'Close command catalog'),
    actions: choose('命令目录操作', 'Command catalog actions'),
    backToCommands: choose('返回命令列表', 'Back to commands'),
    backToParameters: choose('返回命令参数', 'Back to command parameters'),
    count: (count) => choose(`${count} 个命令`, `${count} ${count === 1 ? 'command' : 'commands'}`),
    navigateKeys: '↑↓',
    executeKey: 'Enter',
    closeKey: 'Esc',
    category: (id) => categories[id] ?? id,
    resolve,
    commandFallback: (id) => id,
    descriptionFallback: (id) => choose(`执行 ${id}。`, `Execute ${id}.`),
    parameters: choose('参数', 'Parameters'),
    noParameters: choose('此命令不需要参数。', 'This command has no parameters.'),
    required: choose('必填', 'Required'),
    optional: choose('可选', 'Optional'),
    unset: choose('清除', 'Clear'),
    trueValue: choose('是', 'True'),
    falseValue: choose('否', 'False'),
    jsonPlaceholder: choose('输入 JSON', 'Enter JSON'),
    chooseKnownTarget: choose('选择已加载的目标', 'Choose a loaded target'),
    customIdentifierOption: choose('输入其他标识符…', 'Enter another identifier…'),
    customIdentifier: (field) => choose(`自定义${field}`, `Custom ${field}`),
    workspaceOption: (name, path) => `${name} · ${path}`,
    sessionOption: (title, workspace) => `${title} · ${workspace}`,
    fieldFallback: (name) => fields[name] ?? name,
    option: (_field, value) => String(value),
    issue: (issue) => {
      const codes = zh
        ? {
            required: '此参数必填。',
            invalid: '参数格式无效。',
            too_small: '参数小于允许范围。',
            too_large: '参数超过允许范围。',
            not_allowed: '请选择允许的值。',
          }
        : {
            required: 'This parameter is required.',
            invalid: 'The parameter format is invalid.',
            too_small: 'The parameter is below the allowed range.',
            too_large: 'The parameter exceeds the allowed range.',
            not_allowed: 'Choose an allowed value.',
          }
      return codes[issue.code]
    },
    refresh: choose('刷新目录', 'Refresh catalog'),
    reset: choose('重置参数', 'Reset parameters'),
    execute: choose('执行命令', 'Execute command'),
    executing: choose('正在执行…', 'Executing…'),
    succeeded: choose('命令执行成功', 'Command succeeded'),
    result: choose('命令结果', 'Command result'),
    resultSummary: (command) => choose(`${command} 已完成。`, `${command} completed.`),
    technicalDetails: choose('技术详情', 'Technical details'),
    loading: choose('正在加载命令…', 'Loading commands…'),
    truncated: choose(
      '目录已达到显示上限，请用搜索缩小范围。',
      'The catalog reached its display limit; narrow the search.',
    ),
    unavailableReason: (code) =>
      code === 'HOST_DISCONNECTED'
        ? choose('连接 Host 后可执行此命令。', 'Connect to the Host to execute this command.')
        : choose(`命令当前不可用：${code}`, `Command unavailable: ${code}`),
    error: (code) => choose(`命令操作失败：${code}`, `Command action failed: ${code}`),
    kind: (kind) => (kind === 'query' ? choose('查询', 'Query') : choose('命令', 'Command')),
    execution: (execution) =>
      execution === 'host'
        ? choose('Host 执行', 'Host execution')
        : execution === 'platform'
          ? choose('平台执行', 'Platform execution')
          : choose('客户端执行', 'Client execution'),
    scope: (scope) => {
      const values = zh
        ? { global: '全局', workspace: '工作区', session: '会话', client: '当前客户端' }
        : { global: 'Global', workspace: 'Workspace', session: 'Session', client: 'Current client' }
      return values[scope]
    },
  }
}

function createSettingsLabels(locale: ShellLocale): HbarSettingsWorkspaceLabels {
  const zh = locale === 'zh-CN'
  const choose = <Value>(chinese: Value, english: Value): Value => (zh ? chinese : english)
  const messages: Readonly<Record<string, string>> = zh
    ? {
        'i18n:settings.groups.model': '模型',
        'i18n:settings.groups.general': '通用',
        'i18n:settings.groups.session': '会话默认值',
        'i18n:settings.groups.providers': '供应商',
        'i18n:settings.groups.extensions': '插件',
        'i18n:settings.groups.skills': '技能',
        'i18n:settings.provider.model.label': '模型',
        'i18n:settings.provider.model.help': '选择后续运行使用的供应商模型。',
        'i18n:settings.provider.thinkingLevel.label': '思考等级',
        'i18n:settings.provider.thinkingLevel.help': '可用等级会随当前模型变化。',
        'i18n:settings.session.defaultBudget.label': '默认 Token 预算',
        'i18n:settings.session.defaultBudget.help': '设置新会话运行采用的默认 Token 上限。',
      }
    : {
        'i18n:settings.groups.model': 'Model',
        'i18n:settings.groups.general': 'General',
        'i18n:settings.groups.session': 'Session defaults',
        'i18n:settings.groups.providers': 'Providers',
        'i18n:settings.groups.extensions': 'Plugins',
        'i18n:settings.groups.skills': 'Skills',
        'i18n:settings.provider.model.label': 'Model',
        'i18n:settings.provider.model.help': 'Choose the provider model used by future runs.',
        'i18n:settings.provider.thinkingLevel.label': 'Thinking level',
        'i18n:settings.provider.thinkingLevel.help': 'Available levels follow the selected model.',
        'i18n:settings.session.defaultBudget.label': 'Default token budget',
        'i18n:settings.session.defaultBudget.help': 'Set the default token limit for new session runs.',
      }
  const option = (value: unknown) => thinkingLevelLabel(locale, value)
  const source = (value: string) => {
    if (value.includes(':session:')) return choose('会话层', 'session scope')
    if (value.includes(':workspace:')) return choose('工作区层', 'workspace scope')
    if (value.includes(':global')) return choose('全局层', 'global scope')
    if (value === 'default') return choose('默认值', 'defaults')
    return choose('上一级', 'parent scope')
  }
  return {
    pageTitle: choose('设置', 'Settings'),
    title: (scope, target) =>
      scope === 'global'
        ? choose('全局设置', 'Global settings')
        : scope === 'workspace'
          ? choose(`工作区设置${target ? ` · ${target}` : ''}`, `Workspace settings${target ? ` · ${target}` : ''}`)
          : choose(`会话设置${target ? ` · ${target}` : ''}`, `Session settings${target ? ` · ${target}` : ''}`),
    description: choose('更改按全局、工作区和会话层级覆盖。', 'Values override global, workspace, and session scopes.'),
    back: choose('返回会话', 'Back to session'),
    controls: choose('设置控制', 'Settings controls'),
    scopes: choose('设置作用域', 'Settings scope'),
    hostScope: choose('Host 全局设置', 'Host-wide settings'),
    clientScope: choose('当前客户端设置', 'Current client settings'),
    mixedScope: choose('设备与 Host 偏好', 'Device and Host preferences'),
    global: choose('全局', 'Global'),
    workspace: choose('工作区', 'Workspace'),
    session: choose('会话', 'Session'),
    scopeOption: (scope, target) => {
      const names = {
        global: choose('全局', 'Global'),
        workspace: choose('工作区', 'Workspace'),
        session: choose('会话', 'Session'),
      }
      return target ? `${names[scope]} · ${target}` : names[scope]
    },
    groups: choose('设置分组', 'Settings groups'),
    loading: choose('正在加载设置…', 'Loading settings…'),
    refresh: choose('刷新', 'Refresh'),
    save: choose('保存更改', 'Save changes'),
    reconcile: choose('核对保存结果', 'Reconcile save'),
    saved: choose('设置已保存。', 'Settings saved.'),
    unsaved: (count) => choose(`${count} 项更改尚未保存`, `${count} unsaved ${count === 1 ? 'change' : 'changes'}`),
    restoreInheritance: choose('恢复继承', 'Restore inheritance'),
    localOverride: choose('当前层覆盖', 'Local override'),
    pendingInheritance: choose('保存后恢复继承', 'Inheritance pending save'),
    inheritedFrom: (value) => choose(`继承自${source(value)}`, `Inherited from ${source(value)}`),
    readOnly: choose('当前作用域只读', 'Read-only in this scope'),
    applyMode: (mode) => {
      const modes = zh
        ? { immediate: '立即生效', nextRequest: '下次请求生效', nextRun: '下次运行生效', restart: '重启后生效' }
        : {
            immediate: 'Applies immediately',
            nextRequest: 'Applies on the next request',
            nextRun: 'Applies on the next run',
            restart: 'Applies after restart',
          }
      return modes[mode]
    },
    error: (code) => choose(`设置操作失败：${code}`, `Settings action failed: ${code}`),
    contentRecovery: {
      retry: choose('重试表单选项', 'Retry form options'),
      loading: choose('正在读取表单选项…', 'Loading form options…'),
      offline: choose('连接恢复后可重试，未保存的更改会保留。', 'Reconnect to retry. Unsaved changes are preserved.'),
      error: (code) =>
        code === 'COMMAND_CONFLICT' || code === 'FORM_NOT_FOUND'
          ? choose('当前设置已变化，请在原字段重新操作。', 'Settings changed. Retry from the current field.')
          : code === 'BUSY'
            ? choose('请等待当前设置操作结束后重试。', 'Wait for the current settings operation before retrying.')
            : choose('未能开始读取选项，请重试。', 'Could not reload the options. Try again.'),
    },
    resolve: (key) => messages[key] ?? key,
    form: {
      reset: choose('恢复已保存值', 'Restore saved value'),
      loading: choose('正在加载选项…', 'Loading options…'),
      empty: choose('没有可用选项', 'No options available'),
      unavailable: (code) => {
        if (code === 'missing_model')
          return choose('请先选择模型，再选择思考等级。', 'Choose a model before selecting a thinking level.')
        if (code === 'model_unavailable')
          return choose(
            '所选模型已不可用，请重新选择模型。',
            'The selected model is no longer available. Choose another model.',
          )
        if (code === 'missing_dependency')
          return choose('请先填写有效的相关设置。', 'Enter valid related settings before loading these options.')
        return choose('当前连接不提供这些选项。', 'These options are not available from this connection.')
      },
      contentError: () =>
        choose('选项读取失败，未保存的更改已保留。', 'Options could not be loaded. Unsaved changes are preserved.'),
      selectedInvalid: (value) =>
        choose(`当前值不可用：${option(value)}`, `Current value unavailable: ${option(value)}`),
      issue: (issue) =>
        issue.code === 'required'
          ? choose('此字段必填。', 'This field is required.')
          : choose('字段值不符合约束。', 'The value does not satisfy this field.'),
      option: (_field, value) => option(value),
      contentText: (text) => {
        if (text.kind === 'literal') return text.text
        if (text.key.startsWith('settings.thinkingLevels.'))
          return option(text.key.slice('settings.thinkingLevels.'.length))
        return messages[text.key] ?? text.key
      },
      pickResource: (kind) =>
        kind === 'file' ? choose('选择文件', 'Choose file') : choose('选择文件夹', 'Choose directory'),
      openOptions: (label) => choose(`打开${label}选项`, `Open ${label} options`),
      removeOption: (label) => choose(`移除 ${label}`, `Remove ${label}`),
      componentUnavailable: (component) =>
        choose(`缺少设置组件：${component}`, `Settings component unavailable: ${component}`),
    },
  }
}

function createProviderLabels(locale: ShellLocale): ShellCopy['providers'] {
  const zh = locale === 'zh-CN'
  const choose = <Value>(chinese: Value, english: Value): Value => (zh ? chinese : english)
  const number = new Intl.NumberFormat(locale)
  const protocolNames: Readonly<Record<string, string>> = {
    'openai-completions': 'OpenAI Chat Completions',
    'openai-responses': 'OpenAI Responses',
    'anthropic-messages': 'Anthropic Messages',
    mock: choose('本地 Mock', 'Local mock'),
  }
  const list: HbarProviderSettingsLabels = {
    loading: choose('正在加载供应商…', 'Loading providers…'),
    refresh: choose('刷新供应商', 'Refresh providers'),
    error: (code) => choose(`供应商操作失败：${code}`, `Provider action failed: ${code}`),
    title: choose('供应商配置', 'Provider configurations'),
    description: choose('管理模型连接、默认模型与安全凭据。', 'Manage model connections, defaults, and credentials.'),
    empty: choose('尚未配置供应商。', 'No providers configured.'),
    add: choose('添加供应商', 'Add provider'),
    edit: (name) => choose(`编辑 ${name}`, `Edit ${name}`),
    actions: (name) => choose(`${name} 的操作`, `Actions for ${name}`),
    remove: (name) => choose(`删除 ${name}`, `Delete ${name}`),
    protocol: (value) => protocolNames[value] ?? value,
    defaultModel: (model) => choose(`默认模型：${model}`, `Default: ${model}`),
    modelCount: (count) =>
      choose(`${number.format(count)} 个模型`, `${number.format(count)} ${count === 1 ? 'model' : 'models'}`),
    hidden: choose('已隐藏', 'Hidden'),
    configured: choose('已配置凭据', 'Credential configured'),
    notConfigured: choose('无凭据', 'No credential'),
    deleteConfirmTitle: (name) => choose(`删除供应商“${name}”？`, `Delete provider “${name}”?`),
    deleteConfirmDescription: (name) =>
      choose(
        `将删除“${name}”的配置和凭据引用。此操作无法从当前界面撤销。`,
        `This removes the configuration and credential reference for “${name}”. This action cannot be undone here.`,
      ),
    cancel: choose('取消', 'Cancel'),
    confirmRemove: choose('删除供应商', 'Delete provider'),
  }
  const dialog: HbarProviderDialogLabels = {
    addTitle: choose('添加供应商', 'Add provider'),
    editTitle: (name) => choose(`编辑供应商 · ${name}`, `Edit provider · ${name}`),
    description: choose(
      '填写连接与模型；其他参数可按需展开。',
      'Set up the connection and models. Expand other parameters when needed.',
    ),
    loading: choose('正在加载供应商编辑器…', 'Loading provider editor…'),
    back: choose('返回设置', 'Back to settings'),
    save: choose('保存供应商', 'Save provider'),
    reconcile: choose('核对保存结果', 'Reconcile save'),
    remove: choose('删除供应商', 'Delete provider'),
    reset: choose('放弃更改', 'Discard changes'),
    cancel: choose('取消', 'Cancel'),
    saved: choose('供应商已保存。', 'Provider saved.'),
    unsaved: (count) => choose(`${count} 项更改尚未保存`, `${count} unsaved ${count === 1 ? 'change' : 'changes'}`),
    configured: choose('已安全保存凭据', 'Credential is stored securely'),
    notConfigured: choose('尚未保存凭据', 'No stored credential'),
    error: (code) => choose(`供应商操作失败：${code}`, `Provider action failed: ${code}`),
    requiredIndicator: choose('（必填）', ' (required)'),
    advancedConnection: choose('供应商高级选项', 'Advanced provider options'),
    advancedModel: choose('高级模型参数', 'Advanced model parameters'),
    advancedDescription: choose(
      '上下文、价格、能力和推理等级。收起不会更改配置。',
      'Context, pricing, capabilities, and thinking levels. Collapsing keeps your values.',
    ),
    checkConfiguration: choose('检查配置', 'Check configuration'),
    issues: (count) =>
      choose(` · ${count} 项配置需要修正`, ` · ${count} configuration ${count === 1 ? 'issue' : 'issues'}`),
    validConfiguration: choose(
      '字段校验通过；尚未测试服务商连接。',
      'Fields are valid. The provider connection has not been tested.',
    ),
    modelIssues: (name, count) =>
      choose(`${name}：${count} 项待修正`, `${name}: ${count} ${count === 1 ? 'issue' : 'issues'}`),
    discardTitle: (name) => choose(`放弃“${name}”的未保存更改？`, `Discard unsaved changes to “${name}”?`),
    discardDescription: choose(
      '未保存的配置和本次输入的密钥将被清除，已保存的配置与凭据保持不变。',
      'Unsaved configuration and the newly entered key will be cleared. Saved configuration and credentials stay unchanged.',
    ),
    discardConfirm: choose('放弃更改并关闭', 'Discard and close'),
    keepEditing: choose('继续编辑', 'Keep editing'),
    saving: choose('正在保存供应商…', 'Saving provider…'),
    unknown: choose(
      '保存结果尚未确认，请先核对；当前不能放弃更改。',
      'Save result is not confirmed. Reconcile before discarding changes.',
    ),
    credentialUnconfirmed: choose(
      'Host 只能确认存在密钥，无法确认本次新密钥是否保存。操作仍待确认；不能关闭、重发或放弃草稿。',
      'The Host can confirm that a credential exists, but not whether this replacement was saved. This operation remains unconfirmed; closing, resending, and discarding are unavailable.',
    ),
    sections: {
      preset: choose('从预设开始', 'Start from a preset'),
      presetDescription: choose(
        '选择供应商后会载入推荐协议、地址和首个模型，之后仍可逐项调整。',
        'Choose a provider to load its protocol, endpoint, and first model, then adjust any field.',
      ),
      connection: choose('连接', 'Connection'),
      connectionDescription: choose(
        '供应商标识、协议和 API 地址。',
        'Provider identity, transport protocol, and API endpoint.',
      ),
      credentials: choose('凭据', 'Credentials'),
      credentialsDescription: choose(
        '凭据只提交给 Host，不会进入界面状态快照。',
        'Credentials are submitted to the Host and never enter the UI state snapshot.',
      ),
      models: choose('模型', 'Models'),
      modelsDescription: choose(
        '一个供应商可以包含多个模型，并分别控制能力、价格和可见性。',
        'A provider can contain multiple models with independent capabilities, pricing, and visibility.',
      ),
      modelDetails: choose('模型详情', 'Model details'),
      modelDetailsDescription: choose(
        '选择模型后编辑；默认模型会用于新的运行。',
        'Select a model to edit it. The default model is used for new runs.',
      ),
    },
    preset: {
      label: choose('供应商预设', 'Provider preset'),
      placeholder: choose('搜索供应商、协议或 API 地址', 'Search providers, protocols, or API URLs'),
      open: choose('打开供应商预设', 'Open provider presets'),
      empty: choose('没有匹配的供应商预设', 'No provider presets match'),
      loading: choose('正在加载供应商预设…', 'Loading provider presets…'),
      loadMore: choose('加载更多供应商', 'Load more providers'),
      detail: (protocol, baseUrl, modelCount) =>
        choose(
          `${protocol} · ${baseUrl} · ${number.format(modelCount)} 个模型`,
          `${protocol} · ${baseUrl} · ${number.format(modelCount)} models`,
        ),
    },
    provider: {
      id: choose('供应商 ID', 'Provider ID'),
      idDescription: choose(
        '保存后不可修改，用于命令和凭据引用。',
        'Immutable after save; used by commands and credentials.',
      ),
      name: choose('显示名称', 'Display name'),
      protocol: choose('协议', 'Protocol'),
      baseUrl: choose('API 地址', 'API URL'),
      visible: choose('在模型选择中显示', 'Show in model selection'),
      visibleDescription: choose(
        '关闭后保留配置和已有会话引用。',
        'When hidden, configuration and existing session references remain available.',
      ),
      apiKey: choose('API Key', 'API key'),
      apiKeyDescription: choose(
        '留空会保留已保存凭据；输入新值会在保存时替换。',
        'Leave blank to retain the stored credential; enter a value to replace it on save.',
      ),
    },
    models: {
      empty: choose(
        '还没有模型。请从目录选择或添加自定义模型。',
        'No models yet. Choose one from the catalog or add a custom model.',
      ),
      default: choose('默认模型', 'Default model'),
      hidden: choose('已隐藏', 'Hidden'),
      select: (name) => choose(`选择 ${name}`, `Select ${name}`),
      customId: choose('自定义模型 ID', 'Custom model ID'),
      customIdPlaceholder: choose('例如 my-model', 'For example, my-model'),
      addCustom: choose('添加自定义模型', 'Add custom model'),
      catalog: choose('从预设目录添加', 'Add from preset catalog'),
      catalogPlaceholder: choose('搜索模型', 'Search models'),
      catalogOpen: choose('打开模型目录', 'Open model catalog'),
      catalogEmpty: choose('没有匹配的模型', 'No models match'),
      catalogLoading: choose('正在加载模型…', 'Loading models…'),
      catalogLoadMore: choose('加载更多模型', 'Load more models'),
      catalogDetail: (contextWindow, maxOutput) =>
        choose(
          `上下文 ${number.format(contextWindow)} · 最大输出 ${number.format(maxOutput)}`,
          `${number.format(contextWindow)} context · ${number.format(maxOutput)} max output`,
        ),
      setDefault: choose('设为默认', 'Set as default'),
      remove: choose('移除模型', 'Remove model'),
      id: choose('模型 ID', 'Model ID'),
      name: choose('显示名称', 'Display name'),
      visible: choose('在模型选择中显示', 'Show in model selection'),
      visibleDescription: choose(
        '隐藏后已有会话仍可继续引用此模型。',
        'Existing sessions can continue to reference a hidden model.',
      ),
      contextWindow: choose('上下文窗口', 'Context window'),
      maxOutput: choose('最大输出 Token', 'Maximum output tokens'),
      inputPrice: choose('输入价格（每百万 Token）', 'Input price per million tokens'),
      outputPrice: choose('输出价格（每百万 Token）', 'Output price per million tokens'),
      imageInput: choose('支持图片输入', 'Supports image input'),
      imageInputDescription: choose('允许将图片作为模型输入。', 'Allows images as model input.'),
      reasoning: choose('支持推理', 'Supports reasoning'),
      reasoningDescription: choose(
        '模型可以使用非 off 的思考等级。',
        'The model can use thinking levels other than off.',
      ),
      thinkingLevels: choose('可用思考等级', 'Available thinking levels'),
      thinkingLevelsDescription: choose(
        '决定会话设置中可选择的思考强度。',
        'Controls the thinking strengths offered in session settings.',
      ),
      defaultThinkingLevel: choose('默认思考等级', 'Default thinking level'),
      removeThinkingLevel: (level) => choose(`移除思考等级 ${level}`, `Remove thinking level ${level}`),
    },
    protocol: (protocol) =>
      ({
        'openai-responses': 'OpenAI Responses',
        'openai-completions': 'OpenAI Chat Completions',
        'anthropic-messages': 'Anthropic Messages',
        mock: choose('模拟协议', 'Mock protocol'),
      })[protocol],
    thinkingLevel: (level) =>
      ({
        off: choose('关闭', 'Off'),
        minimal: choose('极低', 'Minimal'),
        low: choose('低', 'Low'),
        medium: choose('中', 'Medium'),
        high: choose('高', 'High'),
        xhigh: choose('极高', 'Extra high'),
        max: choose('最大', 'Maximum'),
      })[level],
    validation: (_path, code) =>
      code === 'too_small'
        ? choose('值低于允许范围或缺少必填内容。', 'The value is below the allowed range or is required.')
        : code === 'too_big'
          ? choose('值超过允许范围。', 'The value exceeds the allowed range.')
          : choose('值不符合字段约束。', 'The value does not satisfy this field.'),
    deleteConfirmTitle: (name) => choose(`删除供应商“${name}”？`, `Delete provider “${name}”?`),
    deleteConfirmDescription: (name) =>
      choose(
        `将删除“${name}”的配置和凭据引用。此操作无法从当前界面撤销。`,
        `This removes the configuration and credential reference for “${name}”. This action cannot be undone here.`,
      ),
  }
  return { list, dialog }
}

function createSessionLabels(locale: ShellLocale): HbarSessionWorkspaceLabels {
  const zh = locale === 'zh-CN'
  const choose = <Value>(chinese: Value, english: Value): Value => (zh ? chinese : english)
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  const currency = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
  })
  const error = (code: string) => {
    if (code === 'QUESTIONNAIRE_INCOMPLETE')
      return choose('请回答全部问题后再提交。', 'Answer every question before submitting.')
    if (code === 'RESULT_UNKNOWN')
      return choose('响应已中断，正在等待服务端事实确认。', 'The response was interrupted; waiting for the Host fact.')
    if (code === 'DISCONNECTED' || code === 'CAPABILITY_UNAVAILABLE')
      return choose('服务端当前不可用。', 'The Host is currently unavailable.')
    return choose(`操作失败：${code}`, `Action failed: ${code}`)
  }
  const statusLabels = zh
    ? {
        queued: '排队中',
        running: '运行中',
        waiting_approval: '等待审批',
        completed: '已完成',
        cancelled: '已取消',
        failed: '失败',
        interrupted: '已中断',
      }
    : {
        queued: 'Queued',
        running: 'Running',
        waiting_approval: 'Waiting for approval',
        completed: 'Completed',
        cancelled: 'Cancelled',
        failed: 'Failed',
        interrupted: 'Interrupted',
      }
  return {
    conversationTitle: (title) => choose(`会话：${title}`, `Session: ${title}`),
    loading: choose('正在加载会话记录…', 'Loading session history…'),
    emptyHistory: choose('此会话暂无可显示的消息。', 'No messages to show in this session.'),
    emptyHero: {
      markUrl: '/favicon.png',
      title: choose('新建会话', 'New session'),
      description: choose('发送提示词以开始会话。', 'Send a prompt to begin this session.'),
    },
    disconnected: choose(
      '连接已中断；现有记录、草稿和附件已保留。',
      'Connection lost. Existing history, draft, and attachments are preserved.',
    ),
    executionAccess: {
      archived: choose(
        '此会话已归档。历史、原稿和原附件已保留；恢复后可继续发送。',
        'This session is archived. History, draft, and existing attachments are preserved; restore it before sending.',
      ),
      unverified: choose(
        '尚未确认此会话是否可执行。原稿已保留；确认后才能发送或准备新执行。',
        'Execution access is not confirmed for this session. The draft is preserved; confirm access before preparing or sending a new Run.',
      ),
      openArchived: (name) => choose(`查看 ${name} 的归档会话`, `View archived sessions in ${name}`),
      opening: choose('正在打开原项目的归档列表…', 'Opening the original project’s archived sessions…'),
      error,
    },
    refreshing: choose('正在刷新会话记录…', 'Refreshing session history…'),
    loadOlder: choose('加载更早消息', 'Load earlier messages'),
    loadingOlder: choose('正在加载更早消息…', 'Loading earlier messages…'),
    retryHistory: choose('重试加载更早消息', 'Retry earlier messages'),
    retryTimeline: choose('重试会话加载', 'Retry session history'),
    historyLimit: choose('已达到此窗口的 1,000 条消息上限。', 'This window reached its 1,000-message history limit.'),
    find: sessionFindCopy(locale),
    latest: choose('查看最新消息', 'View latest messages'),
    author: zh
      ? { user: '你', assistant: '助手', system: '系统', tool: '工具' }
      : { user: 'You', assistant: 'Assistant', system: 'System', tool: 'Tool' },
    avatar: zh
      ? { user: '你', assistant: 'AI', system: '系', tool: '工' }
      : { user: 'You', assistant: 'AI', system: 'Sy', tool: 'Tl' },
    copy: choose('复制消息', 'Copy message'),
    goalLifecycle: goalLifecycleCopy(zh),
    goalHistory: goalHistoryCopy(zh),
    goalContinuation: {
      title: choose('目标续作', 'Goal continuation'),
      statuses: zh
        ? {
            queued: '已排队',
            running: '运行中',
            waiting_approval: '等待审批',
            completed: '已完成',
            cancelled: '已取消',
            failed: '失败',
            interrupted: '已中断',
          }
        : {
            queued: 'Queued',
            running: 'Running',
            waiting_approval: 'Waiting for approval',
            completed: 'Completed',
            cancelled: 'Cancelled',
            failed: 'Failed',
            interrupted: 'Interrupted',
          },
      accessible: (title, status) => choose(`${title}，${status}`, `${title}, ${status}`),
    },
    messageBlocks: {
      codeBlock: codeBlockCopyLabels(locale),
      thinking: choose('思考中', 'Thinking'),
      thought: choose('思考', 'Thought'),
      activity: ({ thinkingCount, toolCounts, failedCount, outcomeCounts }) => {
        const displayCounts = new Map<string, number>()
        for (const { displayName } of toolCounts)
          if (displayName) displayCounts.set(displayName, (displayCounts.get(displayName) ?? 0) + 1)
        return [
          ...(thinkingCount
            ? [choose(`${thinkingCount} 段思考`, `${thinkingCount} ${thinkingCount === 1 ? 'thought' : 'thoughts'}`)]
            : []),
          ...toolCounts.map(({ name, displayName, count }) => {
            const collision = displayName && (displayCounts.get(displayName) ?? 0) > 1
            const title = displayName ? (collision ? `${displayName} (${name})` : displayName) : name
            return `${title} × ${count}`
          }),
          ...(failedCount ? [choose(`${failedCount} 项失败`, `${failedCount} failed`)] : []),
          ...(outcomeCounts.denied ? [choose(`${outcomeCounts.denied} 项拒绝`, `${outcomeCounts.denied} denied`)] : []),
          ...(outcomeCounts.cancelled
            ? [choose(`${outcomeCounts.cancelled} 项取消`, `${outcomeCounts.cancelled} cancelled`)]
            : []),
          ...(outcomeCounts.interrupted
            ? [choose(`${outcomeCounts.interrupted} 项中断`, `${outcomeCounts.interrupted} interrupted`)]
            : []),
          ...(outcomeCounts.unknown
            ? [choose(`${outcomeCounts.unknown} 项结果未知`, `${outcomeCounts.unknown} unknown`)]
            : []),
          ...(outcomeCounts['legacy-error']
            ? [choose(`${outcomeCounts['legacy-error']} 项未完成`, `${outcomeCounts['legacy-error']} incomplete`)]
            : []),
        ].join(' · ')
      },
      tool: (name) => name,
      failed: choose('失败', 'Failed'),
      denied: choose('已拒绝', 'Denied'),
      cancelled: choose('已取消', 'Cancelled'),
      interrupted: choose('已中断', 'Interrupted'),
      unknown: choose('结果未知', 'Outcome unknown'),
      incomplete: choose('未完成', 'Incomplete'),
      resultAvailable: choose('已完成', 'Completed'),
      awaitingResult: choose('尚无结果', 'No result yet'),
      input: choose('输入', 'Input'),
      output: choose('输出', 'Output'),
      toolResultCopy: {
        copy: choose('复制输出', 'Copy output'),
        copying: choose('正在复制', 'Copying'),
        copied: choose('已复制', 'Copied'),
        failed: choose('无法复制输出，请重试。', 'Could not copy the output. Try again.'),
        unavailable: choose(
          '此环境无法使用剪贴板。请选择输出文本后复制。',
          'Clipboard access is unavailable. Select the output text to copy it.',
        ),
        tooLarge: (limit) =>
          choose(
            `输出超出单次复制上限（${limit.toLocaleString('zh-CN')} 个 UTF-16 单元），请分段选择复制。`,
            `Output exceeds the single-copy limit (${limit.toLocaleString('en-US')} UTF-16 units). Select smaller sections to copy.`,
          ),
        retry: choose('重试复制', 'Retry copy'),
      },
      emptyOutput: choose('无输出', 'No output'),
      unavailableInput: choose('参数不可显示', 'Input unavailable'),
      showFullContent: choose('展开完整内容', 'Show full content'),
      showLessContent: choose('收起内容', 'Show less'),
      attachment: (kind, name) =>
        choose(`${kind === 'image' ? '图片' : '文件'}：${name}`, `${kind === 'image' ? 'Image' : 'File'}: ${name}`),
    },
    messageActions: {
      copy: choose('复制回复', 'Copy reply'),
      copyMessage: choose('复制消息', 'Copy message'),
      copying: choose('正在复制…', 'Copying…'),
      copied: choose('已复制', 'Copied'),
      copyFailed: choose('无法写入剪贴板，请重试。', 'Could not write to the clipboard. Try again.'),
      copyUnavailable: choose('此环境无法使用剪贴板。', 'Clipboard access is unavailable in this environment.'),
      retryCopy: choose('重试复制', 'Retry copy'),
    },
    messageFork: {
      ready: choose('从此消息建立分支', 'Fork from this message'),
      submitting: choose('正在建立分支…', 'Creating branch…'),
      retry: choose('重试建立分支', 'Retry Fork'),
      recheck: choose('核对分支结果', 'Check Fork result'),
      unknown: choose(
        '创建结果尚未确认；核对只会读取原请求结果，不会再次创建。',
        'The result is unknown. Checking reads the original receipt and will not create another branch.',
      ),
      created: choose('分支已建立', 'Branch created'),
      createdAfterTimestamp: (timestamp) => choose(`${timestamp} · 分支已建立`, `${timestamp} · Branch created`),
      error: (code) => choose(`无法从此消息建立分支：${code}`, `Could not Fork this message: ${code}`),
    },
    permissionPicker: {
      execution: composerExecutionCopy(locale),
      title: choose('执行选项', 'Execution options'),
      plan: {
        label: choose('计划模式', 'Plan mode'),
        description: choose(
          '在本会话持续只读规划；服务端拒绝写入工具。',
          'Read-only across sends; the Host blocks write tools.',
        ),
        scope: choose(
          '计划模式保持到手动退出；批准计划不会自动退出。工具审批仍只用于本次发送。',
          'Plan mode stays on until you exit it; approving a proposal does not exit. Tool approval remains per-send.',
        ),
        pending: choose('正在保存会话计划模式…', 'Saving this session’s Plan mode…'),
        unknown: choose(
          '计划模式写入结果未确认；发送已暂停，请核对服务端状态。',
          'Plan mode write is unconfirmed. Sending is paused; check the Host state.',
        ),
        loading: choose('正在读取会话计划模式…', 'Loading this session’s Plan mode…'),
        exit: choose('退出计划模式', 'Exit Plan mode'),
        retry: choose('重新读取会话模式', 'Reload session mode'),
        recheck: choose('核对计划模式', 'Recheck Plan mode'),
        approvalPaused: choose(
          '选择其他工具审批将先退出计划模式；服务端确认后应用选择。',
          'Choosing another approval exits Plan mode first; the choice applies after Host confirmation.',
        ),
        goalPrepared: choose(
          '先取消目标准备，才能进入计划模式。文字和附件会保留。',
          'Cancel goal preparation before entering Plan mode. Your text and attachments will be kept.',
        ),
        cancelGoalPreparation: choose('取消目标准备', 'Cancel goal preparation'),
        cancellingGoalPreparation: choose('正在取消目标准备…', 'Cancelling goal preparation…'),
      },
      trigger: (value) => choose(`执行选项：${value}`, `Execution options: ${value}`),
      inheritedTrigger: (mode) => choose(`${mode} · 服务端默认`, `${mode} · Host default`),
      close: choose('关闭执行选项', 'Close execution options'),
      loading: choose('正在读取服务端默认策略…', 'Loading the Host default policy…'),
      retry: choose('重新读取默认策略', 'Reload the default policy'),
      pending: choose('正在准备本次发送…', 'Preparing this send…'),
      unknown: choose(
        '本次发送结果未确认，策略已锁定；请核对提交结果。',
        'This send is not confirmed. Its policy is locked; check the submission result.',
      ),
      scopeHint: choose(
        '工具审批仅用于下一次发送，不更改服务端默认值。',
        'Tool approval is for the next send; the Host default stays unchanged.',
      ),
      inheritedSnapshotHint: (mode) =>
        mode
          ? choose(
              `当前默认：${mode}；发送时固定用于本次运行。`,
              `Current default: ${mode}; captured for this run on send.`,
            )
          : choose('发送时读取默认值；读取失败则不发送。', 'Read default on send; a failed read blocks sending.'),
      options: {
        ask: {
          label: choose('逐次询问', 'Ask'),
          description: choose('需要审批的工具会等待你的决定。', 'Tools requiring approval wait for your decision.'),
        },
        deny: {
          label: choose('拒绝需审批工具', 'Deny approval requests'),
          description: choose(
            '拒绝需审批工具；已获策略允许的工具仍可执行。',
            'Deny tools needing approval; policy-allowed tools may still run.',
          ),
        },
        allow: {
          label: choose('自动批准', 'Auto-approve'),
          description: choose(
            '批准需审批工具；服务端明确拒绝仍生效。',
            'Approve tools needing approval; explicit Host denials still apply.',
          ),
        },
        inherit: {
          label: choose('服务端默认', 'Host default'),
          description: choose(
            '读取发送时的默认策略，并固定用于本次运行。',
            'Capture the default policy at submission and keep it for this run.',
          ),
        },
      },
      confirmTitle: choose('确认本次自动批准？', 'Auto-approve this send?'),
      confirmBody: (title) =>
        choose(
          `会话“${title}”的下一次发送将自动批准需要审批的工具，可能写入文件或运行命令。服务端拒绝规则仍生效。`,
          `The next send in “${title}” will automatically approve tools that may write files or execute commands. Host deny rules still apply.`,
        ),
      confirmAllow: choose('确认自动批准', 'Confirm auto-approval'),
      cancel: choose('取消', 'Cancel'),
      error: (code) => choose(`审批策略操作失败：${code}`, `Could not apply the approval policy: ${code}`),
    },
    runningActions: {
      queueLabel: choose('加入队列', 'Add to queue'),
      queueTitle: choose('在当前运行结束后处理此消息', 'Process this message after the current run'),
    },
    queuedUserRuns: {
      queued: choose('已排队', 'Queued'),
      loading: choose('正在读取排队消息…', 'Loading queued messages…'),
      disconnected: choose('离线，暂时无法确认排队消息', 'Offline; queued messages cannot be verified'),
      error: (code) => choose(`无法读取排队消息：${code}`, `Could not load queued messages: ${code}`),
      retry: choose('重试', 'Retry'),
      previous: choose('上一页', 'Previous'),
      next: choose('下一页', 'Next'),
      page: (current, total) => choose(`第 ${current} / ${total} 页`, `Page ${current} of ${total}`),
      attachments: (count) => choose(`${count} 个附件`, `${count} attachments`),
      ellipsis: '…',
      edit: (position) => choose(`编辑第 ${position} 条排队消息`, `Edit queued message ${position}`),
      editInput: (position) => choose(`第 ${position} 条排队消息内容`, `Queued message ${position} text`),
      editLoading: choose('正在读取完整内容…', 'Loading full message…'),
      editSaving: choose('正在保存…', 'Saving…'),
      saveEdit: choose('保存', 'Save'),
      cancelEdit: choose('取消', 'Cancel'),
      editUnknown: choose(
        '编辑结果尚未确认；可使用同一次请求安全重试。',
        'Edit is not confirmed; retry the same request safely.',
      ),
      editFailed: (code) => choose(`无法编辑排队消息：${code}`, `Could not edit queued message: ${code}`),
      retryEdit: choose('重试确认', 'Retry confirmation'),
      remove: (position) => choose(`删除第 ${position} 条排队消息`, `Remove queued message ${position}`),
      removing: choose('正在移除', 'Removing'),
      removeUnknown: choose(
        '移除结果尚未确认；可使用同一次请求安全重试。',
        'Removal is not confirmed; retry the same request safely.',
      ),
      removeFailed: (code) => choose(`无法移除排队消息：${code}`, `Could not remove queued message: ${code}`),
      retryRemoval: choose('重试移除', 'Retry removal'),
      dismissRemoval: choose('关闭提示', 'Dismiss'),
    },
    decisions: {
      planExit: {
        codeBlock: codeBlockCopyLabels(locale),
        title: choose('准备开始编码？', 'Ready to start coding?'),
        document: choose('计划文档', 'Plan document'),
        feedback: choose('计划反馈（可选）', 'Plan feedback (optional)'),
        feedbackPlaceholder: choose('告诉助手需要修改什么…', 'Tell the assistant what to change…'),
        implement: choose('批准计划', 'Approve plan'),
        continuePlanning: choose('继续规划', 'Keep planning'),
        implemented: choose('已批准，转入实施', 'Approved; continuing with implementation'),
        continued: choose('已返回规划', 'Returned to planning'),
        invalidPlan: choose(
          '计划正文不可用，无法决定此请求。',
          'The plan document is unavailable. This request cannot be decided.',
        ),
      },
      approval: choose('工具操作需要确认', 'Review tool operation'),
      questionnaire: choose('需要你的回答', 'Your input is needed'),
      pending: choose('等待决定', 'Awaiting your decision'),
      submitting: choose('正在提交…', 'Submitting…'),
      submitted: choose('已提交，等待工具确认', 'Submitted; waiting for tool confirmation'),
      unknown: choose('结果尚未确认，请先核对', 'Result unknown. Check before continuing.'),
      unavailable: choose('请求当前不可操作', 'This request is not currently actionable'),
      allow: choose('允许这次', 'Allow once'),
      deny: choose('拒绝', 'Deny'),
      allowed: choose('已允许', 'Allowed'),
      denied: choose('已拒绝', 'Denied'),
      cancelled: choose('已取消', 'Cancelled'),
      answered: choose('已回答', 'Answered'),
      failed: choose('工具未能完成', 'The tool did not complete'),
      reconcile: choose('核对结果', 'Check result'),
      details: choose('查看完整输入', 'Show full input'),
      hideDetails: choose('收起完整输入', 'Hide full input'),
      unavailableInput: choose('无法显示此输入', 'This input cannot be displayed'),
      path: choose('目标路径', 'Target path'),
      command: choose('待执行命令', 'Requested command'),
      proposedContent: choose('拟写入内容（不是完整文件差异）', 'Proposed content (not a full file diff)'),
      oldFragment: choose('请求替换的原片段', 'Requested original fragment'),
      newFragment: choose('请求替换的新片段', 'Requested replacement fragment'),
      customAnswer: choose('自定义回答', 'Custom answer'),
      customPlaceholder: choose('输入你的回答…', 'Enter your answer…'),
      submit: choose('提交回答', 'Submit answers'),
      secretAnswer: choose('私密回答已隐藏', 'Secret answer hidden'),
      error: (code) =>
        code === 'RESULT_UNKNOWN'
          ? choose(
              '未收到明确结果；请核对，不要重复决定。',
              'No confirmed result was received. Check the result without submitting again.',
            )
          : code === 'INTERACTION_NOT_ACCEPTED'
            ? choose('本次回答未被接收；请核对请求状态。', 'This answer was not accepted. Check the request status.')
            : code === 'QUESTIONNAIRE_INCOMPLETE'
              ? choose('请回答全部问题后再提交。', 'Answer every question before submitting.')
              : error(code),
    },
    proposedPlan: {
      title: choose('计划提案', 'Proposed plan'),
      document: choose('计划文档', 'Plan document'),
      implement: choose('新一轮执行', 'Start implementation turn'),
      continuePlanning: choose('新一轮规划', 'Start planning turn'),
      scope: choose(
        '以下操作开启新一轮：执行使用普通模式，规划使用计划模式。会话模式不变，输入区草稿和附件不会发送。',
        'These actions start a new turn: Default mode for implementation, Plan mode for planning. The session mode stays unchanged; your composer draft and attachments are not sent.',
      ),
      feedback: choose('规划反馈（用于继续规划）', 'Feedback for further planning'),
      feedbackPlaceholder: choose('说明需要完善的内容', 'Describe what should change'),
      submitting: choose('正在提交请求…', 'Submitting request…'),
      accepted: choose('请求已受理', 'Request accepted'),
      unknown: choose('提交结果尚未确认，请先核对。', 'The result is unknown. Check it before retrying.'),
      checking: choose('正在核对原提交，请稍候…', 'Checking the original submission…'),
      reconcile: choose('核对提交结果', 'Check request result'),
      error: (code) => {
        if (code === 'RESULT_UNKNOWN')
          return choose(
            '尚未确认原提交结果，请核对原请求。',
            'The original submission is not confirmed. Check its receipt.',
          )
        if (['DISCONNECTED', 'CONNECTION_CLOSED', 'CAPABILITY_UNAVAILABLE'].includes(code))
          return choose(
            '当前无法连接服务端，连接恢复后可再次核对。',
            'The Host is unavailable. Check again after reconnecting.',
          )
        if (['MODEL_UNAVAILABLE', 'MODEL_NOT_FOUND'].includes(code))
          return choose(
            '原会话的模型已不可用，请先重新选择模型。',
            'The original session model is unavailable. Choose a model first.',
          )
        if (['STALE_TARGET', 'STALE_PROPOSAL', 'PLAN_NOT_COMPLETE'].includes(code))
          return choose(
            '原提案已变化或尚未完成，请查看最新计划。',
            'The original proposal changed or is not complete. Review the latest plan.',
          )
        return choose(
          '操作未能确认。请检查连接，并使用此卡片中的恢复入口。',
          'The operation could not be confirmed. Check the connection and use this card’s recovery action.',
        )
      },
    },
    proposedPlanReadOnly: choose('计划文档（只读）', 'Plan document (read only)'),
    proposedPlanAvailability: (value) => {
      switch (value) {
        case 'none':
        case 'ready':
          return null
        case 'busy':
          return choose('等待当前运行结束后再操作。', 'Wait for the current run to finish.')
        case 'incomplete':
          return choose('计划来源尚未确认完成。', 'The source plan has not been confirmed complete.')
        case 'model_unavailable':
          return choose('请先在输入区选择可用模型。', 'Choose an available model in the composer first.')
        case 'capability_unavailable':
          return choose('此客户端未启用计划执行入口。', 'Plan actions are unavailable in this client.')
      }
    },
    thinking: choose('思考过程', 'Reasoning'),
    toolCall: (name) => choose(`调用工具：${name}`, `Tool call: ${name}`),
    toolResult: (name, failed) =>
      choose(`${failed ? '工具失败' : '工具结果'}：${name}`, `${failed ? 'Tool failed' : 'Tool result'}: ${name}`),
    attachment: (kind, name) =>
      choose(`${kind === 'image' ? '图片' : '文件'}：${name}`, `${kind === 'image' ? 'Image' : 'File'}: ${name}`),
    timestamp: (value) => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(value),
    error,
    prompt: {
      input: choose('提示词', 'Prompt'),
      placeholder: choose('向助手发送消息…', 'Message the assistant…'),
      send: choose('发送', 'Send'),
      submitTitle: choose('发送提示词', 'Send prompt'),
      stop: sessionStopButtonLabel(locale),
      uploading: choose('正在上传附件', 'Uploading attachments'),
      addAttachment: choose('添加附件', 'Add attachment'),
      removeAttachment: (attachment) => choose(`移除附件 ${attachment.name}`, `Remove attachment ${attachment.name}`),
    },
    attachments: composerAttachmentCopy(choose),
    mentions: {
      menu: choose('提及工作区文件或目录', 'Mention workspace files or folders'),
      root: choose('工作区根目录', 'Workspace root'),
      search: choose('搜索文件', 'Search files'),
      browsing: (path) => choose(`浏览 ${path}`, `Browse ${path}`),
      empty: choose('没有匹配的文件或目录。', 'No matching files or folders.'),
      emptyPage: choose('本页没有匹配项，可继续加载目录。', 'No matches on this page. Load more entries.'),
      loading: choose('正在查找文件…', 'Finding files…'),
      disconnected: choose('连接已中断，无法查找工作区文件。', 'Disconnected; workspace files cannot be found.'),
      error: (code) => choose(`文件查找失败：${code}`, `File lookup failed: ${code}`),
      retry: choose('重试', 'Retry'),
      more: choose('加载更多目录项', 'Load more directory entries'),
      truncated: choose('结果已截断，请继续输入以缩小范围。', 'Results truncated. Type more to narrow the search.'),
      limit: choose(
        '已显示最多 200 项，请缩小搜索或进入目录。',
        'Showing at most 200 entries. Refine the search or enter a folder.',
      ),
      browse: (name) => choose(`浏览目录 ${name}`, `Browse folder ${name}`),
      select: (name) => choose(`提及 ${name}`, `Mention ${name}`),
      hint: choose(
        '↑↓ 选择 · Enter/Tab 提及 · → 浏览目录 · Esc 关闭',
        '↑↓ Select · Enter/Tab mention · → Browse folder · Esc close',
      ),
    },
    slash: {
      menu: choose('本地命令', 'Local commands'),
      commands: [
        { id: 'model', label: '/model', description: choose('选择本次会话的模型', 'Choose a model for this session') },
        {
          id: 'settings',
          label: '/settings',
          description: choose('打开此会话的设置', 'Open settings for this session'),
        },
      ],
      select: (name) => choose(`补全 ${name}`, `Complete ${name}`),
      hint: choose('↑↓ 选择 · Enter/Tab 补全 · Esc 关闭', '↑↓ Select · Enter/Tab complete · Esc close'),
      attachmentsBlocked: choose(
        '此本地命令不能连同附件发送；移除附件后再确认。草稿和附件均已保留。',
        'This local command cannot be sent with attachments. Remove them before confirming; the draft is preserved.',
      ),
      modelBusy: choose(
        '当前任务结束后才能更改模型；草稿已保留。',
        'Change models after the current run finishes; your draft is preserved.',
      ),
      error: (code) => choose(`本地命令未完成：${code}`, `Local command did not complete: ${code}`),
    },
    addMenu: {
      open: choose('添加内容', 'Add content'),
      menu: choose('添加到消息', 'Add to message'),
      files: choose('添加文件或照片', 'Add files or photos'),
      filesUnavailable: choose('当前无法添加附件。', 'Attachments are unavailable right now.'),
      slash: choose('斜杠命令', 'Slash commands'),
      slashUnavailable: choose(
        '请在空白且可编辑的草稿中使用本地命令。',
        'Local commands require an empty, editable draft.',
      ),
    },
    modelPicker: {
      title: choose('模型配置', 'Model configuration'),
      choose: choose('选择模型', 'Choose a model'),
      unset: choose('请选择用于此会话的模型。', 'Choose a model for this session.'),
      unavailable: (modelId) =>
        choose(
          `原模型“${modelId}”已不可用，请重新选择模型或配置供应商。`,
          `The selected model “${modelId}” is unavailable. Choose another model or configure its provider.`,
        ),
      unavailableTrigger: choose('模型不可用', 'Model unavailable'),
      unavailableHint: choose('重新选择模型或配置供应商。', 'Choose another model or configure its provider.'),
      stale: choose('正在更新模型配置…', 'Updating model configuration…'),
      readFailed: choose(
        '暂时无法读取模型配置，请重新加载。草稿已保留。',
        'Model configuration could not be read. Reload to try again; your draft is preserved.',
      ),
      configure: choose('配置模型供应商', 'Configure model provider'),
      offline: choose(
        '连接已断开，恢复连接后将更新模型配置。',
        'Disconnected. Model configuration will refresh after reconnecting.',
      ),
      trigger: (name) => choose(`选择模型：${name}`, `Choose model: ${name}`),
      search: choose('搜索模型', 'Search models'),
      clearSearch: choose('清除模型搜索', 'Clear model search'),
      empty: choose('没有可选择的模型。', 'No models are available to choose.'),
      noMatches: choose('没有匹配的模型。', 'No matching models.'),
      loading: choose('正在加载模型…', 'Loading models…'),
      close: choose('关闭', 'Close'),
      retry: choose('重新加载', 'Reload'),
      reconcile: choose('核对更改结果', 'Check change result'),
      pending: choose('正在应用…', 'Applying…'),
      unknown: choose(
        '更改结果尚未确认，请先核对。',
        'The change is not confirmed. Check its result before continuing.',
      ),
      providers: choose('配置供应商', 'Configure providers'),
      more: (remaining) =>
        choose(`显示更多（还有 ${number.format(remaining)} 个）`, `Show more (${number.format(remaining)} remaining)`),
      capability: (model) =>
        choose(
          `${number.format(model.contextWindow)} 上下文${model.imageInput ? ' · 图像' : ''}${model.reasoning ? ' · 推理' : ''}`,
          `${number.format(model.contextWindow)} context${model.imageInput ? ' · Images' : ''}${model.reasoning ? ' · Reasoning' : ''}`,
        ),
      thinking: choose('推理强度', 'Reasoning effort'),
      thinkingTrigger: (level) => choose(`推理强度：${level}`, `Reasoning effort: ${level}`),
      thinkingLevel: (level) => thinkingLevelLabel(locale, level),
      error: (code) => {
        if (['RESULT_UNKNOWN', 'SUBMISSION_PENDING'].includes(code))
          return choose('原更改尚未确认，请先核对结果。', 'Check the original change before trying another.')
        if (['DISCONNECTED', 'CONNECTION_CLOSED'].includes(code))
          return choose('连接已断开，请恢复连接后重试。', 'Reconnect before trying again.')
        if (['MODEL_UNAVAILABLE', 'MODEL_NOT_FOUND'].includes(code))
          return choose(
            '所选模型已不可用，请重新加载后选择模型。',
            'This model is unavailable. Reload and choose a model.',
          )
        if (['STALE_TARGET', 'COMMAND_CONFLICT'].includes(code))
          return choose(
            '模型配置已变化，请重新加载后再操作。',
            'Model configuration changed. Reload before continuing.',
          )
        return choose(
          '模型操作未能确认，请使用此处的恢复入口。',
          'The model operation could not be confirmed. Use the recovery action here.',
        )
      },
    },
    intent: {
      blocked: composerIntentBlockedCopy(locale),
      recovery: composerGoalRecoveryCopy(locale),
      goal: choose('目标', 'Goal'),
      currentGoal: choose('当前目标', 'Current goal'),
      goalHint: choose(
        '将下一条消息设为持续目标，发送后才会保存。',
        'Make the next message an ongoing goal; it is saved when sent.',
      ),
      goalPrepared: choose('下条：目标', 'Next: goal'),
      goalPreparedHint: choose('发送下一条消息时创建持续目标。', 'Send the next message to create the ongoing goal.'),
      cancelGoal: choose('取消下条目标准备', 'Cancel next-send goal'),
      goalPlaceholder: choose('描述要持续推进的目标…', 'Describe the goal to pursue…'),
      planPlaceholder: choose('描述希望先规划的任务…', 'Describe the task to plan first…'),
      statuses: {
        active: choose('进行中的目标', 'Active goal'),
        paused: choose('已暂停的目标', 'Paused goal'),
        blocked: choose('受阻的目标', 'Blocked goal'),
        complete: choose('已完成的目标', 'Completed goal'),
        budget_limited: choose('目标预算已用尽', 'Goal budget exhausted'),
        usage_limited: choose('目标用量已受限', 'Goal usage limited'),
      },
      pause: choose('暂停目标续作', 'Pause goal continuation'),
      pauseHint: choose(
        '暂停自动续作；当前运行可用停止按钮中断。',
        'Pause automatic continuation. Use Stop to interrupt the current run.',
      ),
      resume: choose('恢复目标续作', 'Resume goal continuation'),
      clear: choose('清除目标', 'Clear goal'),
      confirmClear: (objective) =>
        choose(
          `清除目标“${objective}”？会话记录会保留。`,
          `Clear the goal “${objective}”? Conversation history will be kept.`,
        ),
      cancel: choose('取消', 'Cancel'),
      expand: choose('展开目标文档', 'Expand goal document'),
      elapsed: (seconds) =>
        choose(`${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`, `${Math.floor(seconds / 60)}m ${seconds % 60}s`),
      budget: (used, limit) =>
        choose(
          `${number.format(used)} / ${number.format(limit)} tokens`,
          `${number.format(used)} / ${number.format(limit)} tokens`,
        ),
      pending: choose('正在应用…', 'Applying…'),
      partial: choose(
        '目标已保存，消息尚未发送。再次发送会沿用该目标。',
        'The goal is saved but the message was not sent. Send again to continue with this goal.',
      ),
      unknown: choose(
        '操作结果尚未确认，请先核对。',
        'The operation is not confirmed. Check its result before continuing.',
      ),
      reconcile: choose('核对结果', 'Check result'),
      refresh: choose('刷新目标状态', 'Refresh goal status'),
      error: (code) => {
        if (code === 'GOAL_EXISTS')
          return choose(
            '已有未完成的目标，请先完成或清除它。',
            'An unfinished goal already exists. Finish or clear it before creating another.',
          )
        if (code === 'GOAL_SUBMISSION_CHANGED')
          return choose(
            '目标已保存。要更改输入，请先取消目标模式；已保存目标不会被清除。',
            'The goal is already saved. Cancel goal mode before changing this prompt; the saved goal will remain.',
          )
        if (code === 'GOAL_INVALID')
          return choose('目标需要 1–4,000 字的文字说明。', 'A goal needs a text objective of 1–4,000 characters.')
        if (code === 'GOAL_CONFLICT' || code === 'VERSION_CONFLICT' || code === 'STALE_TARGET')
          return choose(
            '当前目标或会话已变化，请检查最新状态后再操作。',
            'The Goal or session changed. Review the latest state before continuing.',
          )
        if (code === 'DISCONNECTED' || code === 'CONNECTION_CLOSED')
          return choose('连接已中断，请重连后核对原操作。', 'Disconnected. Reconnect and check the original action.')
        return choose(
          '未能完成此操作，请查看当前状态后重试或核对原结果。',
          'The action could not finish. Review the current state, then retry or check the original result.',
        )
      },
    },
    tools: {
      label: choose('会话工具', 'Session tools'),
      files: choose('文件', 'Files'),
      monitoring: choose('用量监控', 'Monitoring'),
      agents: choose('子 Agent', 'Child agents'),
      goals: choose('目标与计划', 'Goals and plans'),
      settings: choose('会话设置', 'Session settings'),
      error: (code) =>
        code === 'BUSY'
          ? choose(
              '工具缓存已满。请先回到不用的会话，保存、丢弃或核对其工具更改，再关闭该会话标签。',
              'Tool storage is full. Return to an unused session, save, discard or reconcile its tool changes, then close its tab.',
            )
          : code === 'COMMAND_CONFLICT'
            ? choose(
                '工具来源已变化，请在当前会话重新打开。',
                'The tool source has changed. Open it again from the current session.',
              )
            : error(code),
    },
    runs: {
      title: choose('Agent Activity', 'Agent activity'),
      details: (count) => choose(`运行详情 · ${count} 次`, `Run details · ${count}`),
      more: (count) => choose(`再显示 ${count} 次运行`, `Show ${count} more runs`),
      activeCount: (count) => choose(`${count} 次运行正在执行或排队`, `${count} runs active or queued`),
      emptyTitle: choose('尚无运行', 'No runs yet'),
      emptyDescription: choose(
        '发送提示词后会在这里显示运行状态。',
        'Run status appears here after you send a prompt.',
      ),
      cancelLabel: choose('取消运行', 'Cancel run'),
      cancellingLabel: choose('正在取消', 'Cancelling'),
      retryLabel: choose('重试运行', 'Retry run'),
      retryingLabel: choose('正在重试', 'Retrying'),
      recheckLabel: choose('核对结果', 'Check result'),
      recheckingLabel: choose('正在核对结果', 'Checking result'),
      planTitle: choose('Agent 计划', 'Agent plan'),
      planProgress: (completed, total) =>
        choose(
          `${number.format(completed)} / ${number.format(total)} 已完成`,
          `${number.format(completed)} of ${number.format(total)} completed`,
        ),
      planStatusLabel: (status) =>
        ({
          pending: choose('待处理', 'Pending'),
          in_progress: choose('进行中', 'In progress'),
          completed: choose('已完成', 'Completed'),
        })[status],
      countLabel: (count) => choose(`${count} 次运行`, `${count} ${count === 1 ? 'run' : 'runs'}`),
      statusLabel: (status) => statusLabels[status],
    },
    runDetail: (modelId) => choose(`模型 ${modelId}`, `Model ${modelId}`),
    runDuration: (startedAt, endedAt) => {
      if (endedAt === null) return choose('进行中', 'In progress')
      const seconds = number.format(Math.max(0, (endedAt - startedAt) / 1_000))
      return choose(`${seconds} 秒`, `${seconds} s`)
    },
    approval: {
      title: choose('Agent Approval', 'Agent approval'),
      detailsLabel: choose('查看参数', 'View parameters'),
      statusLabel: choose('等待决定', 'Decision required'),
      denyLabel: choose('拒绝', 'Deny'),
      allowLabel: choose('允许', 'Allow'),
      savingLabel: choose('正在提交', 'Submitting'),
      completeLabel: choose('已处理', 'Resolved'),
      failureMessage: choose('审批提交失败', 'Approval submission failed'),
    },
    approvalSummary: (tool) => choose(`工具 ${tool} 请求执行权限`, `Tool ${tool} is requesting permission`),
    questionnaire: {
      title: choose('Agent 问题', 'Agent questions'),
      countLabel: (count) => choose(`${count} 个问题`, `${count} questions`),
      customAnswerLabel: choose('自定义回答', 'Custom answer'),
      customAnswerPlaceholder: choose('输入回答', 'Enter an answer'),
      freeformLabel: choose('回答', 'Answer'),
      submitLabel: choose('提交回答', 'Submit answers'),
      submittingLabel: choose('正在提交', 'Submitting'),
      submittedLabel: choose('已提交', 'Submitted'),
      incompleteMessage: choose('请回答全部问题。', 'Answer every question.'),
      rejectedMessage: choose('服务端未接受回答。', 'The Host did not accept these answers.'),
      failureMessage: choose('回答提交失败', 'Answer submission failed'),
    },
    usage: {
      title: choose('用量与预算', 'Usage and budget'),
      description: choose(
        '当前会话的累计结算与预算，不是模型上下文占用率。',
        'Session accounting and budget, not the model context-window occupancy.',
      ),
      trigger: (value) => choose(`查看用量与预算：${value}`, `View usage and budget: ${value}`),
      budgetPercent: (value) => choose(`预算 ${Math.round(value)}%`, `${Math.round(value)}% budget`),
      noBudget: choose('用量', 'Usage'),
      budgetWarning: choose(
        '会话预算即将用尽，可展开查看详情。',
        'The session budget is running low. Open usage for details.',
      ),
      budgetExhausted: choose(
        '会话预算已用尽，后续执行受预算限制。',
        'The session budget is exhausted; further execution is budget-limited.',
      ),
      close: choose('关闭用量与预算', 'Close usage and budget'),
      monitor: choose('打开用量监控', 'Open usage monitoring'),
      error: (code) => choose(`用量读取失败：${code}`, `Could not load usage: ${code}`),
      total: (tokens) => `${number.format(tokens)} tokens`,
      remaining: (remaining, limit) =>
        choose(
          `剩余 ${number.format(remaining)} / ${number.format(limit)} tokens`,
          `${number.format(remaining)} of ${number.format(limit)} tokens remaining`,
        ),
      progress: (used, limit) =>
        choose(
          `已使用 ${number.format(used)} / ${number.format(limit)} tokens`,
          `${number.format(used)} of ${number.format(limit)} tokens used`,
        ),
      input: choose('输入', 'Input'),
      output: choose('输出', 'Output'),
      cost: choose('预计金额', 'Estimated cost'),
      rate: choose('Token 速率', 'Token rate'),
      unavailable: choose('不可用', 'Unavailable'),
      gap: choose('部分样本缺失。', 'Some samples are missing.'),
      sparkline: choose('Token 用量变化', 'Token usage over time'),
      number: (value) => number.format(value),
      currency: (value) => currency.format(value),
      tokensPerSecond: (value) => `${number.format(value)} tokens/s`,
    },
  }
}

function createFileLabels(locale: ShellLocale): HbarFileWorkspaceLabels {
  const zh = locale === 'zh-CN'
  const choose = <Value>(chinese: Value, english: Value): Value => (zh ? chinese : english)
  return {
    ...fileWorkspaceCopy(zh),
    title: choose('文件管理器', 'File manager'),
    parent: choose('返回上级目录', 'Open parent folder'),
    refresh: choose('刷新文件', 'Refresh files'),
    loading: choose('正在加载文件…', 'Loading files…'),
    empty: choose('此目录为空；选择文件后会在此处打开。', 'This folder is empty; select a file to open it.'),
    retry: choose('重试', 'Retry'),
    readOnly: choose('文本文件', 'Text file'),
    close: choose('关闭文件管理器', 'Close file manager'),
    closeWorkbench: choose('关闭文件工作台页签', 'Close file workbench tab'),
    expandWorkbench: choose('在工作台中展开文件', 'Expand files in workbench'),
    returnToConversation: choose('返回对话', 'Back to conversation'),
    returnToWorkspace: choose('返回工作区', 'Back to workspace'),
    root: choose('工作区根目录', 'Workspace root'),
    loadMore: choose('加载更多文件', 'Load more files'),
    save: choose('保存文件', 'Save file'),
    saving: choose('正在保存…', 'Saving…'),
    saved: choose('文件已保存。', 'File saved.'),
    reconcile: choose('核对保存结果', 'Reconcile save'),
    dirty: choose('有未保存的更改', 'Unsaved changes'),
    backToFiles: choose('返回文件列表', 'Back to files'),
    showNavigator: choose('显示文件导航', 'Show file navigator'),
    hideNavigator: choose('隐藏文件导航', 'Hide file navigator'),
    navigator: choose('文件导航', 'File navigator'),
    reload: choose('重新加载源文件', 'Reload source'),
    reloadTitle: (path) => choose(`重新加载“${path}”？`, `Reload “${path}”?`),
    reloadDescription: choose(
      '重新加载源文件会丢弃此文件当前未保存的更改。',
      'Reloading the source will discard this file’s current unsaved changes.',
    ),
    keepDraft: choose('保留草稿', 'Keep draft'),
    discardAndReload: choose('丢弃并重新加载', 'Discard and reload'),
    addToChat: choose('添加到聊天', 'Add to chat'),
    addedToChat: (session) =>
      choose(
        `已添加到“${session}”的草稿。文件工作台仍保持打开。`,
        `Added to the draft in “${session}”. Files stays open.`,
      ),
    alreadyInChat: (session) =>
      choose(`“${session}”的草稿已引用此文件。`, `The draft in “${session}” already references this file.`),
    addFileDraftPending: choose(
      '文件有未保存或尚待核对的更改；请先保存或核对，再引用磁盘路径。',
      'This file has unsaved or unconfirmed changes. Save or reconcile before referencing its disk path.',
    ),
    addNoSource: choose(
      '此文件没有仍打开的来源会话；无法添加到聊天。',
      'No original conversation tab is open for this file.',
    ),
    addOffline: choose(
      '连接 Host 后才能核对来源会话并添加。',
      'Connect to Host to confirm the source session before adding.',
    ),
    addingToChat: choose('正在核对来源会话…', 'Confirming the source session…'),
    addToChatError: (code) => {
      if (code === 'RESULT_UNKNOWN')
        return choose(
          '添加结果尚未确认；请返回原会话核对草稿，不要重复添加。',
          'The result is not confirmed. Check the original draft before adding again.',
        )
      if (code === 'VERSION_CONFLICT' || code === 'TARGET_CHANGED' || code === 'TAB_NOT_FOUND')
        return choose(
          '目标文件或原会话草稿已变化；请核对后再添加。',
          'The file or source draft changed. Review it before adding again.',
        )
      if (code === 'FILE_DRAFT_PENDING')
        return choose('请先保存或核对文件更改，再添加到聊天。', 'Save or reconcile the file before adding it to chat.')
      if (code === 'SESSION_NOT_FOUND')
        return choose(
          '原会话已不存在或归档；草稿未修改。',
          'The source session is gone or archived; its draft was not changed.',
        )
      if (code === 'BUSY' || code === 'INPUT_TOO_LARGE')
        return choose('原会话草稿暂不能添加更多引用。', 'The source draft cannot accept another reference right now.')
      if (code === 'DISCONNECTED' || code === 'CONNECTION_CLOSED' || code === 'TIMEOUT' || code === 'TIMED_OUT')
        return choose(
          '连接中断，无法确认是否已添加；请核对原会话草稿。',
          'The connection closed before confirmation. Check the original draft before trying again.',
        )
      return choose(`无法添加：${code}；请核对原会话草稿。`, `Could not add: ${code}. Check the original draft.`)
    },
    error: (code) => {
      if (code === 'FILE_CONFLICT')
        return choose('源文件已更新；当前草稿仍保留。', 'The source changed; your draft is still preserved.')
      if (code === 'BUSY')
        return choose(
          '预览容量或读取并发已达上限。请关闭不用的预览，或等待读取完成后重试。',
          'The preview or read limit was reached. Close unused previews, or wait for a read to finish and try again.',
        )
      if (code === 'UNSUPPORTED_TYPE')
        return choose('此文件不是可编辑的 UTF-8 文本。', 'This file is not editable UTF-8 text.')
      if (code === 'INVALID_OUTPUT' || code === 'INPUT_TOO_LARGE')
        return choose('此文件过大，无法在工具中打开。', 'This file is too large to open in the tool.')
      if (code === 'ENOENT' || code === 'NOT_FOUND') return choose('此文件已不存在。', 'This file no longer exists.')
      return choose(`文件操作失败：${code}`, `File operation failed: ${code}`)
    },
  }
}

function createSessionMonitoringLabels(locale: ShellLocale): HbarSessionMonitoringLabels {
  const zh = locale === 'zh-CN'
  const choose = <Value>(chinese: Value, english: Value): Value => (zh ? chinese : english)
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  const currency = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 })
  return {
    title: choose('会话用量监控', 'Session monitoring'),
    description: choose(
      '查看 Host 记录的 Token、费用、延迟与模型用量。',
      'Inspect Host-recorded tokens, cost, latency, and model usage.',
    ),
    close: choose('关闭用量监控', 'Close session monitoring'),
    empty: choose('当前会话还没有可靠的用量数据。', 'This session does not have reliable usage data yet.'),
    unavailable: choose('不可用', 'Unavailable'),
    gap: choose('当前时间窗口包含数据缺口。', 'The current time window contains a data gap.'),
    totals: {
      tokens: choose('Token 总数', 'Total tokens'),
      runs: choose('运行数', 'Runs'),
      attempts: choose('尝试数', 'Attempts'),
      cost: choose('预计金额', 'Estimated cost'),
      cache: choose('缓存命中率', 'Cache hit rate'),
      rate: choose('Token 速率', 'Token rate'),
    },
    latency: {
      title: choose('延迟 p95', 'Latency p95'),
      firstToken: choose('首个文本 Token', 'First text token'),
      response: choose('完整响应', 'Full response'),
    },
    execution: {
      title: choose('执行统计', 'Execution statistics'),
      toolCalls: choose('工具调用', 'Tool calls'),
      toolCallsDetail: (succeeded, failed, unknown) =>
        choose(
          `成功 ${number.format(succeeded)} · 失败 ${number.format(failed)} · 未知 ${number.format(unknown)}`,
          `${number.format(succeeded)} succeeded · ${number.format(failed)} failed · ${number.format(unknown)} unknown`,
        ),
      requestConcurrency: choose('请求最大并发', 'Peak request concurrency'),
      toolConcurrency: choose('工具最大并发', 'Peak tool concurrency'),
      totalDuration: choose('Run 总计耗时', 'Total Run time'),
      runDuration: choose('Run 耗时 p95', 'Run duration p95'),
      toolDuration: choose('工具耗时 p95', 'Tool duration p95'),
    },
    models: choose('模型用量', 'Model usage'),
    series: choose('Token 时间序列', 'Token timeline'),
    number: (value) => number.format(value),
    tokens: (value) => `${number.format(value)} tokens`,
    currency: (value) => currency.format(value),
    percent: (value) => percent.format(value),
    duration: (value) => `${number.format(value)} ms`,
    rate: (value) => choose(`${number.format(value)} Token/秒`, `${number.format(value)} tokens/s`),
    model: (provider, model) => `${provider} / ${model}`,
  }
}

function createAgentWorkspaceLabels(locale: ShellLocale): HbarAgentWorkspaceLabels {
  const zh = locale === 'zh-CN'
  const choose = <Value>(chinese: Value, english: Value): Value => (zh ? chinese : english)
  const number = new Intl.NumberFormat(locale)
  const date = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const budget = (tokens: number | null) =>
    tokens === null ? choose('继承 / 未限定', 'Inherited / unlimited') : `${number.format(tokens)} tokens`
  const statuses: Readonly<Record<Parameters<HbarAgentWorkspaceLabels['status']>[0], string>> = zh
    ? {
        created: '已创建',
        queued: '排队中',
        running: '运行中',
        waiting_approval: '等待审批',
        cancelRequested: '取消中',
        completed: '已完成',
        cancelled: '已取消',
        failed: '失败',
        interrupted: '已中断',
      }
    : {
        created: 'Created',
        queued: 'Queued',
        running: 'Running',
        waiting_approval: 'Waiting for approval',
        cancelRequested: 'Cancelling',
        completed: 'Completed',
        cancelled: 'Cancelled',
        failed: 'Failed',
        interrupted: 'Interrupted',
      }
  return {
    title: choose('子 Agent 管理', 'Child agent management'),
    description: choose(
      '创建独立子会话，查看运行状态、预算并管理取消。',
      'Create independent child sessions and inspect their status, budget, and cancellation.',
    ),
    close: choose('关闭子 Agent 管理', 'Close child agent management'),
    refresh: choose('刷新', 'Refresh'),
    loading: choose('正在加载子 Agent…', 'Loading child agents…'),
    empty: choose('当前会话尚无子 Agent。', 'This session has no child agents.'),
    loadMore: choose('加载更多', 'Load more'),
    createTitle: choose('创建子 Agent', 'Create child agent'),
    createScope: choose(
      '任务和 Token 预算属于当前会话下新建的独立子会话。',
      'The task and token budget belong to a new child session under the current session.',
    ),
    detailTitle: choose('子 Agent 详情', 'Child agent details'),
    back: choose('返回子 Agent 列表', 'Back to child agents'),
    showDetails: (objective) => choose(`查看 ${objective} 的详情`, `View details for ${objective}`),
    objective: choose('目标', 'Objective'),
    objectivePlaceholder: choose('描述子 Agent 需要完成的任务', 'Describe the task for the child agent'),
    childTitle: choose('会话标题', 'Session title'),
    childTitlePlaceholder: choose('可选会话标题', 'Optional session title'),
    parentSession: choose('父会话', 'Parent session'),
    currentSession: () => choose('当前会话', 'Current session'),
    createdAt: choose('创建时间', 'Created'),
    model: choose('模型', 'Model'),
    tokenBudget: choose('Token 预算', 'Token budget'),
    thinkingLevel: choose('思考等级', 'Thinking level'),
    approval: choose('工具审批', 'Tool approval'),
    approvalOptions: {
      deny: choose('拒绝', 'Deny'),
      ask: choose('询问', 'Ask'),
      allow: choose('允许', 'Allow'),
    },
    create: choose('创建并运行', 'Create and run'),
    creating: choose('正在创建…', 'Creating…'),
    retryCreate: choose('重试并核对创建结果', 'Retry and reconcile creation'),
    created: choose('子 Agent 已创建。', 'Child agent created.'),
    openSession: choose('打开子会话', 'Open child session'),
    openingSession: choose('正在打开子会话…', 'Opening child session…'),
    openSessionError: (code) => {
      if (code === 'DISCONNECTED' || code === 'CONNECTION_CLOSED' || code === 'TIMEOUT')
        return choose(
          '连接中断，未切换会话。请连接后从此详情重试。',
          'The connection was interrupted. This detail is unchanged; reconnect and retry here.',
        )
      if (code === 'SOURCE_CHANGED' || code === 'NAVIGATION_SUPERSEDED')
        return choose(
          '来源会话或子 Agent 已变化。请刷新详情后重试。',
          'The source session or child agent changed. Refresh this detail before retrying.',
        )
      if (code === 'TAB_LIMIT')
        return choose('已打开 32 个页签，请先关闭一个。', 'You have 32 open tabs. Close one before continuing.')
      return choose(`无法打开子会话：${code}`, `Could not open child session: ${code}`)
    },
    returnToParent: (title) => choose(`返回父会话：${title}`, `Back to parent: ${title}`),
    returningToParent: choose('正在返回父会话…', 'Returning to parent…'),
    returnError: (code) =>
      code === 'DISCONNECTED' || code === 'CONNECTION_CLOSED' || code === 'TIMEOUT'
        ? choose('连接中断，仍停留在子会话。请连接后重试。', 'The connection was interrupted. Stay here and retry.')
        : code === 'SOURCE_CHANGED' || code === 'NAVIGATION_SUPERSEDED'
          ? choose(
              '原父会话已变化，无法安全返回。可从侧栏选择会话。',
              'The original parent changed, so Back is unavailable. Select a session in the sidebar.',
            )
          : choose(`无法返回父会话：${code}`, `Could not return to parent: ${code}`),
    cancel: choose('取消 Agent', 'Cancel agent'),
    cancelling: choose('正在取消…', 'Cancelling…'),
    retryCancel: choose('重试取消', 'Retry cancellation'),
    count: (count) =>
      choose(`${number.format(count)} 个子 Agent`, `${number.format(count)} child ${count === 1 ? 'agent' : 'agents'}`),
    status: (status) => statuses[status],
    budget,
    summary: (modelId, tokens) => `${modelId} · ${budget(tokens)}`,
    modelValue: (modelId) => modelId,
    timestamp: (value) => date.format(value),
    issue: () => choose('请填写符合约束的值。', 'Enter a value that satisfies the field constraints.'),
    error: (code) => choose(`子 Agent 操作失败：${code}`, `Child agent operation failed: ${code}`),
  }
}

function createGoalPlanWorkspaceLabels(locale: ShellLocale): HbarGoalPlanWorkspaceLabels {
  const zh = locale === 'zh-CN'
  const choose = <Value>(chinese: Value, english: Value): Value => (zh ? chinese : english)
  const number = new Intl.NumberFormat(locale)
  const goalStatuses: HbarGoalPlanWorkspaceLabels['goal']['statuses'] = zh
    ? {
        active: '进行中',
        paused: '已暂停',
        blocked: '已阻塞',
        usage_limited: '用量受限',
        budget_limited: '预算受限',
        complete: '已完成',
      }
    : {
        active: 'Active',
        paused: 'Paused',
        blocked: 'Blocked',
        usage_limited: 'Usage limited',
        budget_limited: 'Budget limited',
        complete: 'Complete',
      }
  const planStatuses: HbarGoalPlanWorkspaceLabels['plan']['statuses'] = zh
    ? { pending: '待处理', in_progress: '进行中', completed: '已完成' }
    : { pending: 'Pending', in_progress: 'In progress', completed: 'Completed' }
  const workflowStatuses: HbarGoalPlanWorkspaceLabels['workflow']['statuses'] = zh
    ? {
        none: '未启用',
        draft: '草案',
        active: '专注中',
        verifying: '验证中',
        waiting_review: '等待复核',
        waiting_user: '等待人工验收',
        needs_revision: '需要自主修订',
        completed: '已完成',
        cancelled: '已取消',
      }
    : {
        none: 'Not enabled',
        draft: 'Draft',
        active: 'Focused',
        verifying: 'Verifying',
        waiting_review: 'Waiting for review',
        waiting_user: 'Waiting for user review',
        needs_revision: 'Needs autonomous revision',
        completed: 'Completed',
        cancelled: 'Cancelled',
      }
  const workflowFocusStatuses: HbarGoalPlanWorkspaceLabels['workflow']['focusStatuses'] = zh
    ? {
        pending: '待处理',
        in_progress: '进行中',
        delegated: '已派发',
        verifying: '验证中',
        completed: '已完成',
        blocked: '已阻塞',
      }
    : {
        pending: 'Pending',
        in_progress: 'In progress',
        delegated: 'Delegated',
        verifying: 'Verifying',
        completed: 'Completed',
        blocked: 'Blocked',
      }
  const completionPolicies: HbarGoalPlanWorkspaceLabels['workflow']['completionPolicies'] = zh
    ? { agent: 'Agent 自主判定', review_agent: '独立 Agent 复核', user: '显式人工验收' }
    : { agent: 'Agent judgment', review_agent: 'Independent agent review', user: 'Explicit user review' }
  const reviewStatuses: HbarGoalPlanWorkspaceLabels['workflow']['reviewStatuses'] = zh
    ? {
        queued: '排队中',
        running: '复核中',
        approved: '已批准',
        rejected: '已拒绝',
        cancelled: '已取消',
        stale: '已过期',
      }
    : {
        queued: 'Queued',
        running: 'Reviewing',
        approved: 'Approved',
        rejected: 'Rejected',
        cancelled: 'Cancelled',
        stale: 'Stale',
      }
  const acceptanceStatuses: HbarGoalPlanWorkspaceLabels['workflow']['acceptanceStatuses'] = zh
    ? { pending: '待验证', passed: '已通过', failed: '未通过', accepted: '已接受', rejected: '已拒绝' }
    : { pending: 'Pending', passed: 'Passed', failed: 'Failed', accepted: 'Accepted', rejected: 'Rejected' }
  const delegationStatuses: HbarGoalPlanWorkspaceLabels['workflow']['delegationStatuses'] = zh
    ? {
        queued: '排队中',
        running: '执行中',
        patch_ready: '补丁待应用',
        applied: '已应用',
        conflict: '有冲突',
        cancelled: '已取消',
        failed: '失败',
      }
    : {
        queued: 'Queued',
        running: 'Running',
        patch_ready: 'Patch ready',
        applied: 'Applied',
        conflict: 'Conflict',
        cancelled: 'Cancelled',
        failed: 'Failed',
      }
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' })
  return {
    title: choose('目标与计划', 'Goals and plans'),
    description: choose(
      '管理当前会话的持久目标、结构化计划、专注范围和外部验收。',
      'Manage the session goal, structured plan, focus scope, and external acceptance.',
    ),
    close: choose('关闭目标与计划', 'Close goals and plans'),
    refresh: choose('刷新', 'Refresh'),
    loading: choose('正在加载目标与计划…', 'Loading goals and plans…'),
    back: choose('返回目标与计划', 'Back to goals and plans'),
    unavailable: choose('未限定', 'Unlimited'),
    executionAccess: {
      archived: choose(
        '此会话已归档。目标与计划仍可查看，恢复后才能编辑或准备新执行。',
        'This session is archived. Goals and plans remain readable; restore it before editing or preparing a new Run.',
      ),
      unverified: choose(
        '尚未确认原会话的执行权限。现有内容已保留，确认后才能编辑或准备新执行。',
        'Execution access is not confirmed for the original session. Existing content is preserved; confirm access before editing or preparing a new Run.',
      ),
    },
    goal: {
      execution: goalExecutionCopy(locale),
      title: choose('会话目标', 'Session goal'),
      objective: choose('目标', 'Goal objective'),
      document: choose('目标文档', 'Goal document'),
      advanced: choose('预算与执行详情', 'Budget and execution details'),
      cancel: choose('撤销更改', 'Discard changes'),
      replacementWarning: choose(
        '修改目标内容会替换当前目标并重置用量计数。',
        'Changing the objective replaces the current goal and resets its usage counters.',
      ),
      composerHint: choose(
        '在输入框选择“目标”，填写目标后发送即可开始。',
        'Choose Goal in the composer, describe the objective, then send to begin.',
      ),
      objectivePlaceholder: choose('描述需要持续完成的成果', 'Describe the outcome to pursue'),
      tokenBudget: choose('Token 预算', 'Goal token budget'),
      status: choose('目标状态', 'Goal status'),
      statuses: goalStatuses,
      create: choose('设置目标', 'Set goal'),
      edit: choose('编辑目标', 'Edit goal'),
      empty: choose('当前会话尚未设置目标。', 'This session does not have a goal yet.'),
      save: choose('保存目标', 'Save goal'),
      saving: choose('正在保存…', 'Saving…'),
      clear: choose('清除目标', 'Clear goal'),
      reconcile: choose('核对目标保存结果', 'Reconcile goal save'),
      saved: choose('目标已保存。', 'Goal saved.'),
      cleared: choose('目标已清除。', 'Goal cleared.'),
      remaining: choose('剩余 Token', 'Remaining tokens'),
      used: choose('已用 Token', 'Used tokens'),
      elapsed: choose('累计时间', 'Elapsed time'),
    },
    plan: {
      title: choose('执行计划', 'Execution plan'),
      summary: choose('最多 100 个有序步骤', 'Up to 100 ordered steps'),
      review: choose('保存后供当前会话后续运行使用。', 'Save the plan for later runs in this session.'),
      addPlaceholder: choose('新计划步骤', 'Add plan step'),
      add: choose('添加步骤', 'Add step'),
      start: (count) =>
        choose(`保存 ${number.format(count)} 个步骤`, `Save ${number.format(count)} ${count === 1 ? 'step' : 'steps'}`),
      moveUp: (title) => choose(`上移 ${title}`, `Move ${title} up`),
      moveDown: (title) => choose(`下移 ${title}`, `Move ${title} down`),
      skip: (title) => choose(`移除 ${title}`, `Remove ${title}`),
      restore: (title) => choose(`恢复 ${title}`, `Restore ${title}`),
      newStepStateLabel: choose('待处理', 'Pending'),
      empty: choose('尚无计划步骤。', 'No plan steps yet.'),
      explanation: choose('计划说明', 'Plan explanation'),
      explanationPlaceholder: choose('记录计划的约束或决策背景', 'Record constraints or decision context'),
      edit: choose('编辑计划', 'Edit plan'),
      clear: choose('清除计划', 'Clear plan'),
      reconcile: choose('核对计划保存结果', 'Reconcile plan save'),
      saved: choose('计划已保存。', 'Plan saved.'),
      cleared: choose('计划已清除。', 'Plan cleared.'),
      count: (count) =>
        choose(`${number.format(count)} 个步骤`, `${number.format(count)} ${count === 1 ? 'step' : 'steps'}`),
      stepTitle: (index) => choose(`步骤 ${index} 内容`, `Step ${index} title`),
      stepStatus: (index) => choose(`步骤 ${index} 状态`, `Step ${index} status`),
      statuses: planStatuses,
    },
    workflow: {
      title: choose('专注工作流', 'Focused workflow'),
      loading: choose('正在加载工作流…', 'Loading workflow…'),
      empty: choose('当前会话尚未启用专注工作流。', 'This session does not have a focused workflow.'),
      draft: choose(
        '执行计划已发布，当前尚未设置工作流焦点。',
        'The Agent Plan is published without a current workflow focus.',
      ),
      focus: choose('当前焦点', 'Current focus'),
      staleFocus: choose('焦点已过期，请刷新或记录检查点。', 'The focus is stale; refresh or record a checkpoint.'),
      completionPolicy: choose('完成策略', 'Completion policy'),
      completionPolicies,
      acceptance: choose('验收清单', 'Acceptance checks'),
      scope: choose('查看允许范围', 'Show allowed scope'),
      readPaths: choose('读取路径', 'Read paths'),
      writePaths: choose('写入路径', 'Write paths'),
      tools: choose('工具', 'Tools'),
      none: choose('无', 'None'),
      review: choose('独立复核', 'Independent review'),
      reviewStatuses,
      diagnosis: choose('自愈诊断', 'Recovery diagnosis'),
      denialCount: (count) =>
        choose(`相同拒绝已连续出现 ${number.format(count)} 次`, `${number.format(count)} consecutive matching denials`),
      agents: choose('子 Agent 与补丁', 'Child agents and patches'),
      noAgents: choose('当前没有派发中的子任务。', 'There are no delegated tasks.'),
      evidence: choose('验收证据', 'Acceptance evidence'),
      noEvidence: choose('尚未记录外部验收证据。', 'No external acceptance evidence is recorded.'),
      loadMore: choose('加载更多证据', 'Load more evidence'),
      applyPatch: choose('应用补丁', 'Apply patch'),
      applyingPatch: choose('正在应用…', 'Applying…'),
      reconcilePatch: choose('核对应用结果', 'Reconcile apply result'),
      coordinate: choose('进入冲突协调', 'Coordinate conflict'),
      accept: choose('接受', 'Accept'),
      reject: choose('拒绝', 'Reject'),
      actionSucceeded: choose('操作已由 Host 确认。', 'The Host confirmed the operation.'),
      error: (code) => choose(`工作流操作失败：${code}`, `Workflow operation failed: ${code}`),
      statuses: workflowStatuses,
      focusStatuses: workflowFocusStatuses,
      acceptanceStatuses,
      delegationStatuses,
      evidenceCount: (visible, total) =>
        choose(
          `显示 ${number.format(visible)} / ${number.format(total)}`,
          `Showing ${number.format(visible)} of ${number.format(total)}`,
        ),
      patchFiles: (count) =>
        choose(`${number.format(count)} 个补丁文件`, `${number.format(count)} patch ${count === 1 ? 'file' : 'files'}`),
      acceptanceAction: (decision, check) =>
        decision === 'accepted'
          ? choose(`接受验收项：${check}`, `Accept check: ${check}`)
          : choose(`拒绝验收项：${check}`, `Reject check: ${check}`),
      evidenceLabel: (evidence) => {
        if (evidence.source === 'reviewer')
          return `${evidence.checkId} · ${evidence.agentId} · ${
            evidence.outcome === 'approved' ? choose('已批准', 'Approved') : choose('已拒绝', 'Rejected')
          }`
        const outcome = acceptanceStatuses[evidence.outcome]
        if (evidence.source === 'tool') return `${evidence.checkId} · ${evidence.toolName} · ${outcome}`
        if (evidence.source === 'agent') return `${evidence.checkId} · ${evidence.agentId} · ${outcome}`
        return `${evidence.checkId} · ${evidence.actorId} · ${outcome}`
      },
      timestamp: (value) => date.format(value),
    },
    number: (value) => number.format(value),
    duration: (seconds) => choose(`${number.format(seconds)} 秒`, `${number.format(seconds)} s`),
    issue: () => choose('请填写符合约束的值。', 'Enter a value that satisfies the field constraints.'),
    error: (code) => choose(`目标或计划操作失败：${code}`, `Goal or plan operation failed: ${code}`),
  }
}

function createExtensionWorkspaceLabels(locale: ShellLocale): HbarExtensionWorkspaceLabels {
  const zh = locale === 'zh-CN'
  const choose = <Value>(chinese: Value, english: Value): Value => (zh ? chinese : english)
  const number = new Intl.NumberFormat(locale)
  return {
    ...extensionDetailCopy(locale),
    collections: extensionCollectionCopy(locale),
    navigation: extensionNavigationCopy(locale),
    title: choose('扩展与技能', 'Extensions and skills'),
    description: choose(
      '查看插件详情、管理可选插件，浏览 Host 已发现的技能。',
      'Inspect plugin details, manage optional plugins, and browse skills discovered by the Host.',
    ),
    hostWide: choose('此分组管理当前 Host 的全局能力。', 'This group manages global capabilities on the current Host.'),
    refresh: choose('刷新', 'Refresh'),
    loading: choose('正在加载扩展与技能…', 'Loading extensions and skills…'),
    plugins: choose('插件', 'Plugins'),
    skills: choose('技能', 'Skills'),
    noPlugins: choose('当前 Host 没有注册插件。', 'No plugins are registered on this Host.'),
    noSkills: choose('当前 Host 没有发现技能。', 'No skills were discovered on this Host.'),
    noMatchingPlugins: choose('没有匹配的插件。', 'No matching plugins.'),
    noMatchingSkills: choose('没有匹配的技能。', 'No matching skills.'),
    noMatchesHint: choose(
      '试试其他关键词，或清除搜索以显示全部内容。',
      'Try another keyword or clear the search to show every item.',
    ),
    clearSearch: choose('清除搜索', 'Clear search'),
    skillSearchResults: (matching, total) =>
      choose(
        `${number.format(total)} 个技能中匹配 ${number.format(matching)} 个`,
        `${number.format(matching)} of ${number.format(total)} skills match`,
      ),
    status: {
      active: choose('已启用', 'Active'),
      disabled: choose('已禁用', 'Disabled'),
      failed: choose('失败', 'Failed'),
    },
    required: choose('必需插件', 'Required plugin'),
    provides: choose('能力', 'Capabilities'),
    commands: choose('命令数', 'Commands'),
    panels: choose('面板数', 'Panels'),
    source: choose('来源', 'Source'),
    skillScope: choose('作用域：全局', 'Scope: Global'),
    discovered: choose('已发现', 'Discovered'),
    unavailable: choose('无', 'None'),
    openCommands: choose('打开相关命令', 'Open related commands'),
    openSystemCommands: choose('打开系统与诊断命令', 'Open system and diagnostic commands'),
    enable: choose('启用', 'Enable'),
    disable: choose('禁用', 'Disable'),
    changing: choose('正在更新…', 'Updating…'),
    reconcile: choose('核对插件状态', 'Reconcile plugin state'),
    pluginMetadata: (id, version) => choose(`${id} · 版本 ${version}`, `${id} · Version ${version}`),
    pluginCount: (count) =>
      choose(`${number.format(count)} 个插件`, `${number.format(count)} ${count === 1 ? 'plugin' : 'plugins'}`),
    skillCount: (count) =>
      choose(`${number.format(count)} 个技能`, `${number.format(count)} ${count === 1 ? 'skill' : 'skills'}`),
    error: (code) => choose(`扩展操作失败：${code}`, `Extension operation failed: ${code}`),
  }
}

function createSystemDiagnosticsLabels(locale: ShellLocale): HbarSystemDiagnosticsLabels {
  const zh = locale === 'zh-CN'
  const choose = <Value>(chinese: Value, english: Value): Value => (zh ? chinese : english)
  const number = new Intl.NumberFormat(locale)
  return {
    title: choose('诊断', 'Diagnostics'),
    description: choose(
      '查看当前 Host 报告的运行与存储摘要。此页不会清理或修改数据。',
      'Inspect this Host’s runtime and storage summary. This page does not clean up or change data.',
    ),
    refresh: choose('刷新诊断', 'Refresh diagnostics'),
    loading: choose('正在读取 Host 诊断…', 'Reading Host diagnostics…'),
    unavailable: choose(
      'Host 未连接，连接后可刷新诊断。',
      'The Host is disconnected. Reconnect to refresh diagnostics.',
    ),
    oldResult: choose('以下仍是上次成功读取的结果。', 'The result below is from the last successful read.'),
    host: choose('Host', 'Host'),
    storage: choose('存储计数', 'Storage counts'),
    activity: choose('运行摘要', 'Runtime summary'),
    version: choose('版本', 'Version'),
    protocol: choose('协议版本', 'Protocol version'),
    platform: choose('平台', 'Platform'),
    demo: choose('演示模式', 'Demo mode'),
    yes: choose('是', 'Yes'),
    no: choose('否', 'No'),
    activeRuns: choose('活动运行', 'Active runs'),
    recoveredRuns: choose('已恢复的运行', 'Recovered runs'),
    streams: choose('活动流', 'Active streams'),
    plugins: choose('插件数', 'Plugins'),
    tools: choose('工具数', 'Tools'),
    noStorageEntries: choose('Host 未返回存储计数。', 'The Host returned no storage counts.'),
    moreStorageEntries: (count) =>
      choose(`另有 ${number.format(count)} 项未展示。`, `${number.format(count)} more entries not shown.`),
    number: (value) => number.format(value),
    error: (code) => choose(`诊断读取失败：${code}。可重试。`, `Could not read diagnostics: ${code}. Try again.`),
  }
}

function createStatusWorkspaceLabels(locale: ShellLocale): HbarStatusWorkspaceLabels {
  const zh = locale === 'zh-CN'
  const choose = <Value>(chinese: Value, english: Value): Value => (zh ? chinese : english)
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  const currency = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
  const formatBytes = (value: number) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const
    let scaled = Math.max(0, value)
    let unit = 0
    while (scaled >= 1_000 && unit < units.length - 1) {
      scaled /= 1_000
      unit += 1
    }
    return `${number.format(scaled)} ${units[unit]}`
  }
  return {
    title: choose('状态中心', 'Status center'),
    description: choose(
      '查看远程 Host 性能、AI 用量和 Git 统计。',
      'Inspect remote Host performance, AI usage, and Git statistics.',
    ),
    close: choose('关闭状态中心', 'Close status center'),
    refresh: choose('刷新当前分区', 'Refresh current section'),
    loading: choose('正在加载状态数据…', 'Loading status data…'),
    tabs: choose('状态分区', 'Status sections'),
    sections: { dashboard: choose('性能', 'Performance'), usage: choose('使用情况', 'Usage'), git: 'Git' },
    performanceFilters: {
      label: choose('性能查询条件', 'Performance query filters'),
      timeWindow: choose('时间窗', 'Time window'),
      target: choose('指标范围', 'Metric scope'),
      windows: {
        '2m': choose('最近 2 分钟', 'Last 2 minutes'),
        '15m': choose('最近 15 分钟', 'Last 15 minutes'),
        '1h': choose('最近 1 小时', 'Last hour'),
      },
      targets: {
        all: choose('整机与 Host', 'System and Host'),
        system: choose('仅整机', 'System only'),
        host: choose('仅 Host 进程', 'Host process only'),
      },
    },
    gap: (skipped) =>
      choose(
        `当前窗口存在数据缺口，已跳过 ${number.format(skipped)} 个样本。`,
        `The current window has a data gap; ${number.format(skipped)} samples were skipped.`,
      ),
    process: choose('Host 进程', 'Host process'),
    resources: choose('计算与内存', 'Compute and memory'),
    runtime: choose('运行时与队列', 'Runtime and queues'),
    io: choose('磁盘与网络', 'Disk and network'),
    trends: choose('CPU 时间序列', 'CPU timeline'),
    readings: {
      systemCpuPercent: choose('整机 CPU', 'System CPU'),
      hostCpuPercent: 'Host CPU',
      systemLoad1: choose('1 分钟负载', '1-minute load'),
      systemMemoryUsedBytes: choose('整机已用内存', 'System memory used'),
      systemMemoryTotalBytes: choose('整机总内存', 'System memory total'),
      hostRssBytes: 'Host RSS',
      hostHeapUsedBytes: choose('Host 堆内存', 'Host heap used'),
      hostThreadCount: choose('Host 线程', 'Host threads'),
      hostDiskReadBytesPerSecond: choose('Host 磁盘读取', 'Host disk read'),
      hostDiskWriteBytesPerSecond: choose('Host 磁盘写入', 'Host disk write'),
      systemNetworkReceiveBytesPerSecond: choose('整机网络接收', 'System network receive'),
      systemNetworkTransmitBytesPerSecond: choose('整机网络发送', 'System network transmit'),
      eventLoopLagMs: choose('事件循环延迟', 'Event loop lag'),
      activeRuns: choose('活动运行', 'Active runs'),
      queuedRuns: choose('排队运行', 'Queued runs'),
      managedChildProcesses: choose('受管子进程', 'Managed child processes'),
    },
    processLabels: {
      pid: 'PID',
      platform: choose('平台', 'Platform'),
      architecture: choose('架构', 'Architecture'),
      uptime: choose('运行时间', 'Uptime'),
      processors: choose('逻辑处理器', 'Logical processors'),
    },
    usage: {
      title: choose('AI 用量', 'AI usage'),
      filters: choose('用量查询条件与导出', 'Usage query filters and exports'),
      advancedFilters: choose('更多筛选', 'More filters'),
      export: choose('导出', 'Export'),
      scope: choose('统计范围', 'Scope'),
      timeWindow: choose('时间窗', 'Time window'),
      aggregation: choose('聚合粒度', 'Aggregation'),
      provider: choose('供应商', 'Provider'),
      modelFilter: choose('模型', 'Model'),
      allProviders: choose('全部供应商', 'All providers'),
      allModels: choose('全部模型', 'All models'),
      scopes: {
        global: choose('全局', 'Global'),
        workspace: choose('当前工作区', 'Current workspace'),
        session: choose('当前会话', 'Current session'),
      },
      windows: {
        '1h': choose('最近 1 小时', 'Last hour'),
        '24h': choose('最近 24 小时', 'Last 24 hours'),
        '7d': choose('最近 7 天', 'Last 7 days'),
        '30d': choose('最近 30 天', 'Last 30 days'),
      },
      aggregations: {
        minute: choose('分钟', 'Minute'),
        hour: choose('小时', 'Hour'),
        day: choose('天', 'Day'),
      },
      includeDescendants: choose('包含子 Agent 会话', 'Include descendant agent sessions'),
      exportJson: choose('导出 JSON', 'Export JSON'),
      exportCsv: choose('导出 CSV', 'Export CSV'),
      exporting: choose('正在导出…', 'Exporting…'),
      exported: (rows, fileName) =>
        choose(
          `已导出 ${number.format(rows)} 条记录到 ${fileName}。`,
          `Exported ${number.format(rows)} records to ${fileName}.`,
        ),
      incompleteExport: choose(
        '导出达到 10,000 条上限，文件已标记为不完整。',
        'The export reached the 10,000-row limit and is marked incomplete.',
      ),
      gap: choose('当前时间窗口包含不完整的用量事实。', 'The current window contains incomplete usage facts.'),
      totals: choose('Token 细分', 'Token breakdown'),
      tokens: choose('Token 总数', 'Total tokens'),
      attempts: choose('尝试数', 'Attempts'),
      runs: choose('运行数', 'Runs'),
      input: choose('输入 Token', 'Input tokens'),
      output: choose('输出 Token', 'Output tokens'),
      cacheRead: choose('缓存读取', 'Cache read'),
      cacheWrite: choose('缓存写入', 'Cache write'),
      billable: choose('计费 Token', 'Billable tokens'),
      cost: choose('预计金额', 'Estimated cost'),
      cacheHit: choose('缓存命中率', 'Cache hit rate'),
      rates: choose('Token 速率', 'Token rates'),
      inputRate: choose('输入速率', 'Input rate'),
      outputRate: choose('输出速率', 'Output rate'),
      totalRate: choose('总消耗速率', 'Total consumption rate'),
      latency: choose('请求延迟', 'Request latency'),
      firstProviderEvent: choose('首个供应商事件', 'First provider event'),
      firstThinking: choose('首个思考事件', 'First reasoning event'),
      firstText: choose('首个可见文本', 'First visible text'),
      response: choose('完整响应', 'Full response'),
      models: choose('不同模型用量', 'Usage by model'),
      timeline: choose('Token 时间序列', 'Token timeline'),
      execution: choose('执行统计', 'Execution statistics'),
      toolCalls: choose('工具调用', 'Tool calls'),
      toolCallsDetail: (succeeded, failed, unknown) =>
        choose(
          `成功 ${number.format(succeeded)} · 失败 ${number.format(failed)} · 未知 ${number.format(unknown)}`,
          `${number.format(succeeded)} succeeded · ${number.format(failed)} failed · ${number.format(unknown)} unknown`,
        ),
      requestConcurrency: choose('请求最大并发', 'Peak request concurrency'),
      toolConcurrency: choose('工具最大并发', 'Peak tool concurrency'),
      totalDuration: choose('Run 总计耗时', 'Total Run time'),
      runDuration: choose('Run 耗时', 'Run duration'),
      toolDuration: choose('工具耗时', 'Tool duration'),
      executionUnavailable: choose(
        '当前 Host 版本未返回执行统计。',
        'The current Host version did not return execution statistics.',
      ),
      estimated: choose('基于 Host 价格快照估算', 'Estimated from the Host pricing snapshot'),
      p50p95: (p50, p95) => `p50 ${p50} · p95 ${p95}`,
      model: (provider, model) => `${provider} / ${model}`,
    },
    git: {
      title: choose('Git 仓库', 'Git repository'),
      filters: choose('Git 查询条件', 'Git query filters'),
      advancedFilters: choose('更多筛选', 'More filters'),
      repositoryFilter: choose('仓库', 'Repository'),
      workspaceOption: (name, path) => `${name} · ${path}`,
      timeWindow: choose('时间窗', 'Time window'),
      windows: {
        '7d': choose('最近 7 天', 'Last 7 days'),
        '30d': choose('最近 30 天', 'Last 30 days'),
        '90d': choose('最近 90 天', 'Last 90 days'),
        '1y': choose('最近 1 年', 'Last year'),
      },
      sources: choose('提交来源', 'Commit sources'),
      repositoryStatus: choose('仓库状态', 'Repository status'),
      branch: choose('分支', 'Branch'),
      upstream: choose('上游', 'Upstream'),
      noUpstream: choose('未配置', 'Not configured'),
      workingTree: choose('工作树', 'Working tree'),
      clean: choose('干净', 'Clean'),
      dirty: choose('有未提交变更', 'Uncommitted changes'),
      aheadBehind: (ahead, behind) =>
        choose(
          `领先 ${number.format(ahead)} · 落后 ${number.format(behind)}`,
          `${number.format(ahead)} ahead · ${number.format(behind)} behind`,
        ),
      changedPaths: choose('变更路径', 'Changed paths'),
      activity: choose('活动摘要', 'Activity summary'),
      provenance: choose('提交来源', 'Commit provenance'),
      changes: choose('文件与行数变化', 'File and line changes'),
      timeline: choose('提交与行数时间序列', 'Commit and line-change timeline'),
      files: choose('变更文件趋势', 'Files changed trend'),
      policy: choose('统计口径', 'Accounting policy'),
      details: choose('仓库与统计详情', 'Repository and accounting details'),
      commits: choose('提交', 'Commits'),
      automatic: choose('自动提交', 'Automatic commits'),
      manual: choose('手动提交', 'Manual commits'),
      external: choose('外部提交', 'External commits'),
      filesChanged: choose('变更文件', 'Files changed'),
      additions: choose('新增行', 'Additions'),
      deletions: choose('删除行', 'Deletions'),
      renames: choose('重命名', 'Renames'),
      binaryFiles: choose('二进制文件', 'Binary files'),
      repository: choose('仓库 ID', 'Repository ID'),
      head: 'HEAD',
      scanned: choose('已扫描提交', 'Scanned commits'),
      indexMode: choose('索引模式', 'Index mode'),
      historyPolicy: choose('历史口径', 'History policy'),
      timeBasis: choose('时间口径', 'Time basis'),
      timezone: choose('时区', 'Timezone'),
      gap: choose('当前 Git 索引或时间窗口包含数据缺口。', 'The Git index or current window contains a data gap.'),
      binaryChanges: choose('二进制行数', 'Binary line changes'),
      binaryUnavailable: choose('不计算', 'Not calculated'),
      noHead: choose('无提交', 'No commits'),
      noRepository: choose('所选工作区不是 Git 仓库。', 'The selected workspace is not a Git repository.'),
      emptyHistory: choose(
        '仓库尚无提交；工作树状态仍可查看。',
        'This repository has no commits yet; working tree status remains available.',
      ),
      recentCommits: choose('最近提交详情', 'Recent commit details'),
      noCommits: choose('当前过滤条件内没有最近提交。', 'No recent commits match the current filters.'),
      historyTruncated: choose(
        '提交详情仅检查最近 100 条历史记录。',
        'Commit details are limited to the 100 most recent history entries.',
      ),
      commitAuthor: choose('作者', 'Author'),
      commitDate: choose('提交时间', 'Committed at'),
      formatCommitDate: (authoredAt) => {
        const value = Date.parse(authoredAt)
        return Number.isFinite(value) ? dateTime.format(value) : authoredAt
      },
      commitSource: choose('来源', 'Source'),
      commitMetadata: (source, date) => `${source} · ${date}`,
      session: 'Session',
      run: 'Run',
      operation: choose('操作', 'Operation'),
      selectBucket: (summary) => choose(`筛选到时间桶：${summary}`, `Filter commit details to bucket: ${summary}`),
      selectedBucket: (time, count) =>
        choose(
          `正在显示 ${time} 时间桶内的 ${number.format(count)} 条提交。`,
          `Showing ${number.format(count)} commits from the ${time} bucket.`,
        ),
      showAllCommits: choose('显示全部提交', 'Show all commits'),
    },
    unavailable: (reason) =>
      choose(`不可用${reason ? ` · ${reason}` : ''}`, `Unavailable${reason ? ` · ${reason}` : ''}`),
    number: (value) => number.format(value),
    currency: (value) => currency.format(value),
    tokenCount: (value) => choose(`${number.format(value)} Token`, `${number.format(value)} tokens`),
    tokenRate: (value) => choose(`${number.format(value)} Token/秒`, `${number.format(value)} tokens/s`),
    percent: (value) => `${number.format(value)}%`,
    bytes: (value) => formatBytes(value),
    bytesPerSecond: (value) => `${formatBytes(value)}/s`,
    milliseconds: (value) => `${number.format(value)} ms`,
    duration: (value) => {
      if (value < 60_000) return choose(`${number.format(value / 1_000)} 秒`, `${number.format(value / 1_000)} s`)
      const seconds = Math.floor(value / 1_000)
      const hours = Math.floor(seconds / 3_600)
      const minutes = Math.floor((seconds % 3_600) / 60)
      const remainder = seconds % 60
      return hours
        ? choose(`${hours} 小时 ${minutes} 分钟`, `${hours}h ${minutes}m`)
        : choose(`${minutes} 分钟 ${remainder} 秒`, `${minutes}m ${remainder}s`)
    },
    observedAt: (value) => time.format(value),
    error: (code) => choose(`状态查询失败：${code}`, `Status query failed: ${code}`),
  }
}

function createArchiveLabels(locale: ShellLocale): HbarWorkspaceShellLabels['archive'] {
  const zh = locale === 'zh-CN'
  return {
    openList: (name) => (zh ? `查看“${name}”的归档会话` : `Archived sessions in ${name}`),
    listTitle: (name) => (zh ? `${name} · 已归档会话` : `Archived sessions · ${name}`),
    close: zh ? '收起归档列表' : 'Close archived list',
    loading: zh ? '正在加载归档会话…' : 'Loading archived sessions…',
    empty: zh ? '该项目没有归档会话。' : 'This project has no archived sessions.',
    emptyPage: zh ? '本页没有归档会话。' : 'No archived sessions on this page.',
    firstPage: zh ? '刷新并回到第一页' : 'Refresh from first page',
    nextPage: zh ? '查看下一页' : 'Next page',
    page: (number) => (zh ? `项目会话第 ${number} 页` : `Project sessions, page ${number}`),
    restore: zh ? '恢复' : 'Restore',
    restoreSession: (title) => (zh ? `恢复会话“${title}”` : `Restore session “${title}”`),
    restoreTitle: (title) => (zh ? `恢复会话“${title}”` : `Restore session “${title}”`),
    restored: (title) =>
      zh
        ? `已恢复“${title}”。可从项目列表打开。`
        : `“${title}” was restored. Open it from the project list when ready.`,
    confirmTitle: (title) => (zh ? `归档会话“${title}”` : `Archive session “${title}”`),
    description: zh
      ? '归档只从常驻会话列表中隐藏此会话，不删除历史。之后可在此项目的归档列表中恢复。'
      : 'Archiving hides this session from the regular list without deleting its history. You can restore it from this project’s archived sessions.',
    confirm: zh ? '确认归档' : 'Archive session',
    cancel: zh ? '取消' : 'Cancel',
    archiving: zh ? '正在归档…' : 'Archiving…',
    restoring: zh ? '正在恢复…' : 'Restoring…',
    archived: (title) => (zh ? `已归档“${title}”。历史已保留。` : `“${title}” was archived. Its history is preserved.`),
    unknown: zh
      ? '操作结果尚未确认。请先核对原会话，不要重复执行。'
      : 'The result is not confirmed. Check the original session before taking another action.',
    reconcile: zh ? '核对原会话' : 'Check original session',
    checking: zh ? '正在核对…' : 'Checking…',
    dismiss: zh ? '知道了' : 'Dismiss',
    error: (code) =>
      code === 'CAPACITY_EXCEEDED'
        ? zh
          ? '当前客户端有太多会话查询或操作。等待它们结束后重试。'
          : 'Too many session checks or operations are pending in this client. Wait for them to finish, then retry.'
        : code === 'BUSY'
          ? zh
            ? '此会话仍有活动运行。停止运行后再归档。'
            : 'This session still has an active run. Stop it before archiving.'
          : code === 'STALE_TARGET'
            ? zh
              ? '原会话已不可用。请取消并刷新项目列表。'
              : 'The original session is unavailable. Cancel and refresh the project list.'
            : code === 'PAGE_STALE'
              ? zh
                ? '本页数据已过期，请刷新归档列表。'
                : 'This page is no longer current. Refresh the archived list.'
              : zh
                ? `操作失败：${code}`
                : `Could not complete the action: ${code}`,
  }
}

const copies: Readonly<Record<ShellLocale, ShellCopy>> = {
  'zh-CN': {
    toolLayout: toolPaneLayoutCopy('zh-CN'),
    sidebarLayout: sidebarLayoutCopy('zh-CN'),
    shell: {
      stop: getSessionStopCopy('zh-CN'),
      main: '工作台',
      brand: 'hbar',
      projectsAndSessions: '工程与会话',
      organization: workspaceOrganizationCopy('zh-CN'),
      displayNames: workspaceDisplayNamesCopy('zh-CN'),
      noWorkspaces: '尚无工程',
      noSessions: '尚无会话',
      loading: '正在加载',
      loadMore: '加载更多',
      newSession: '新建会话',
      creatingSession: '正在创建会话…',
      creationUnknown: '操作结果尚未确认，请核对原项目中的结果。',
      reconcileCreation: '核对结果',
      chooseWorkspace: '选择项目',
      chooseWorkspaceDescription: '选择新会话所属的项目。',
      workspacePath: '服务端目录',
      workspacePathHint: '输入服务端上已存在的目录路径。',
      addWorkspace: '添加项目',
      openingWorkspace: '正在打开项目…',
      cancel: '取消',
      createSessionInWorkspace: (name) => `在项目“${name}”中新建会话`,
      commands: '命令',
      commandShortcut: 'Ctrl Shift P',
      searchChats: '搜索聊天',
      searchShortcut: 'Ctrl K',
      roster: {
        refreshExpanded: '刷新已展开项目的会话',
        refreshWorkspace: (name) => `刷新 ${name} 的会话`,
        refreshing: '正在刷新会话…',
        refreshed: '会话名单已刷新',
        remaining: (count) => `还有 ${count} 个较早会话待核对；手动刷新可全部核对`,
        limited: '已达到会话扫描上限；超出范围的变化可能尚未发现',
        capacity: (count) => `名单容量已满，保留已加载会话；还有 ${count} 个新会话暂未显示`,
        failure: (code) =>
          ['CONNECTION_CLOSED', 'DISCONNECTED'].includes(code)
            ? '连接中断，保留原名单。重新连接后重试。'
            : code === 'TIMEOUT'
              ? '刷新超时，保留原名单。请重试。'
              : `刷新会话失败（${code}），保留原名单`,
        retry: '重新刷新',
      },
      openWorkspace: '打开工作区',
      status: '状态中心',
      settings: '设置',
      server: '服务端',
      connected: '已连接',
      pairing: '等待配对',
      disconnected: '未连接',
      reconnect: '重新连接',
      showSidebar: '显示工程与会话侧栏',
      hideSidebar: '隐藏工程与会话侧栏',
      expandWorkspace: (name) => `展开工程 ${name}`,
      collapseWorkspace: (name) => `折叠工程 ${name}`,
      workspaceActions: (name) => `工程“${name}”的操作`,
      newSessionInWorkspace: '在此工程新建会话',
      workspaceFiles: '文件',
      workspaceSettings: '工作区设置',
      pinWorkspace: '置顶工程',
      unpinWorkspace: '取消置顶',
      pinnedWorkspace: (name) => `已置顶工程 ${name}`,
      pinningWorkspace: '正在更新置顶…',
      pinSaved: '已置顶。',
      pinRemoved: '已取消置顶。',
      pinVolatile: '已更新，但此设备未提供持久化；重启后可能恢复原状。',
      pinUnknown: '置顶结果尚未确认。请核对设备偏好设置，不要重复操作。',
      pinCheck: '核对结果',
      pinFailure: (code) => `置顶未更新：${code}。可重试。`,
      pinRestoreFailure: (code) => `无法读取工程置顶：${code}`,
      pinRetryRestore: '重试读取',
      openSession: (name) => `打开会话 ${name}`,
      sessionUpdatedAt: (timestamp) =>
        `更新于 ${new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(timestamp)}`,
      sessionActions: (name) => `会话“${name}”的操作`,
      renameSession: '重命名',
      renameEditor: {
        form: (title) => `重命名会话“${title}”`,
        title: '会话标题',
        save: '保存标题',
        cancel: '取消重命名',
        saving: '正在保存…',
        saved: '标题已保存。',
        unknown: '结果尚未确认，请先核对原会话。',
        reconcile: '核对标题',
        checking: '正在核对…',
        error: (code) =>
          code === 'TITLE_REQUIRED'
            ? '请输入会话标题。'
            : code === 'VERSION_CONFLICT'
              ? '标题已在其他位置改变，请取消后重新编辑。'
              : code === 'STALE_TARGET'
                ? '原会话已归档或不可用。可复制保留的草稿后取消。'
                : `标题保存失败：${code}`,
      },
      archiveSession: '归档',
      archive: createArchiveLabels('zh-CN'),
      error: (code) => `加载失败：${code}`,
    },
    windowControls: {
      minimize: '最小化窗口',
      maximize: '最大化窗口',
      restore: '还原窗口',
      close: '关闭窗口',
    },
    empty: { title: '选择一个会话', description: '从左侧工程列表选择会话以打开工作区。' },
    session: createSessionLabels('zh-CN'),
    planProposal: {
      requestText: ({ action, markdown, feedback }) =>
        action === 'implement'
          ? `请按以下计划执行，并遵守现有工具审批策略。\n\n${markdown}`
          : `请继续完善以下计划，保持规划模式。${feedback ? `\n\n反馈：\n${feedback}` : ''}\n\n完整计划：\n${markdown}`,
    },
    settings: createSettingsLabels('zh-CN'),
    appearance: createAppearanceLabels('zh-CN'),
    general: generalSettingsCopy('zh-CN'),
    providers: createProviderLabels('zh-CN'),
    commandPalette: createCommandPaletteLabels('zh-CN'),
    files: createFileLabels('zh-CN'),
    monitoring: createSessionMonitoringLabels('zh-CN'),
    agents: createAgentWorkspaceLabels('zh-CN'),
    goals: createGoalPlanWorkspaceLabels('zh-CN'),
    extensions: createExtensionWorkspaceLabels('zh-CN'),
    status: createStatusWorkspaceLabels('zh-CN'),
    diagnostics: createSystemDiagnosticsLabels('zh-CN'),
    settingsUsage: settingsUsageCopy('zh-CN'),
  },
  'en-US': {
    toolLayout: toolPaneLayoutCopy('en-US'),
    sidebarLayout: sidebarLayoutCopy('en-US'),
    shell: {
      stop: getSessionStopCopy('en-US'),
      main: 'Workspace',
      brand: 'hbar',
      projectsAndSessions: 'Projects and sessions',
      organization: workspaceOrganizationCopy('en-US'),
      displayNames: workspaceDisplayNamesCopy('en-US'),
      noWorkspaces: 'No projects yet',
      noSessions: 'No sessions yet',
      loading: 'Loading',
      loadMore: 'Load more',
      newSession: 'New session',
      creatingSession: 'Creating session…',
      creationUnknown: 'The operation is not confirmed. Check its result in the original project.',
      reconcileCreation: 'Check result',
      chooseWorkspace: 'Choose a project',
      chooseWorkspaceDescription: 'Choose the project for this new session.',
      workspacePath: 'Host directory',
      workspacePathHint: 'Enter an existing directory path on the Host.',
      addWorkspace: 'Add project',
      openingWorkspace: 'Opening project…',
      cancel: 'Cancel',
      createSessionInWorkspace: (name) => `Create a session in project ${name}`,
      commands: 'Commands',
      commandShortcut: 'Ctrl Shift P',
      searchChats: 'Search chats',
      searchShortcut: 'Ctrl K',
      roster: {
        refreshExpanded: 'Refresh sessions in expanded projects',
        refreshWorkspace: (name) => `Refresh sessions in ${name}`,
        refreshing: 'Refreshing sessions…',
        refreshed: 'Session list refreshed',
        remaining: (count) => `${count} older sessions remain unchecked; refresh manually to verify all`,
        limited: 'Session scan limit reached; changes beyond this range may not be discovered yet',
        capacity: (count) => `List capacity reached; loaded sessions kept. ${count} new sessions are not displayed yet`,
        failure: (code) =>
          ['CONNECTION_CLOSED', 'DISCONNECTED'].includes(code)
            ? 'Connection lost; previous list kept. Reconnect and retry.'
            : code === 'TIMEOUT'
              ? 'Refresh timed out; previous list kept. Try again.'
              : `Session refresh failed (${code}); previous list kept`,
        retry: 'Retry refresh',
      },
      openWorkspace: 'Open workspace',
      status: 'Status center',
      settings: 'Settings',
      server: 'Server',
      connected: 'Connected',
      pairing: 'Pairing required',
      disconnected: 'Disconnected',
      reconnect: 'Reconnect',
      showSidebar: 'Show projects and sessions sidebar',
      hideSidebar: 'Hide projects and sessions sidebar',
      expandWorkspace: (name) => `Expand project ${name}`,
      collapseWorkspace: (name) => `Collapse project ${name}`,
      workspaceActions: (name) => `Actions for project ${name}`,
      newSessionInWorkspace: 'New session in this project',
      workspaceFiles: 'Files',
      workspaceSettings: 'Workspace settings',
      pinWorkspace: 'Pin project',
      unpinWorkspace: 'Unpin project',
      pinnedWorkspace: (name) => `Pinned project ${name}`,
      pinningWorkspace: 'Updating pin…',
      pinSaved: 'Project pinned.',
      pinRemoved: 'Project unpinned.',
      pinVolatile: 'Updated for this run only; this device has no persistent preferences.',
      pinUnknown: 'The pin result is not confirmed. Check device preferences before another change.',
      pinCheck: 'Check result',
      pinFailure: (code) => `Pin not updated: ${code}. You can retry.`,
      pinRestoreFailure: (code) => `Could not read project pins: ${code}`,
      pinRetryRestore: 'Retry reading',
      openSession: (name) => `Open session ${name}`,
      sessionUpdatedAt: (timestamp) =>
        `Updated ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(timestamp)}`,
      sessionActions: (name) => `Actions for ${name}`,
      renameSession: 'Rename',
      renameEditor: {
        form: (title) => `Rename session “${title}”`,
        title: 'Session title',
        save: 'Save title',
        cancel: 'Cancel rename',
        saving: 'Saving…',
        saved: 'Title saved.',
        unknown: 'The result is not confirmed. Check the original session first.',
        reconcile: 'Check title',
        checking: 'Checking…',
        error: (code) =>
          code === 'TITLE_REQUIRED'
            ? 'Enter a session title.'
            : code === 'VERSION_CONFLICT'
              ? 'The title changed elsewhere. Cancel and edit the current title.'
              : code === 'STALE_TARGET'
                ? 'The original session is archived or unavailable. Copy the preserved draft before cancelling.'
                : `Could not save the title: ${code}`,
      },
      archiveSession: 'Archive',
      archive: createArchiveLabels('en-US'),
      error: (code) => `Loading failed: ${code}`,
    },
    windowControls: {
      minimize: 'Minimize window',
      maximize: 'Maximize window',
      restore: 'Restore window',
      close: 'Close window',
    },
    empty: { title: 'Select a session', description: 'Choose a session from the project list to open its workspace.' },
    session: createSessionLabels('en-US'),
    planProposal: {
      requestText: ({ action, markdown, feedback }) =>
        action === 'implement'
          ? `Implement the following plan, respecting the existing tool approval policy.\n\n${markdown}`
          : `Continue refining the following plan in planning mode.${feedback ? `\n\nFeedback:\n${feedback}` : ''}\n\nFull plan:\n${markdown}`,
    },
    settings: createSettingsLabels('en-US'),
    appearance: createAppearanceLabels('en-US'),
    general: generalSettingsCopy('en-US'),
    providers: createProviderLabels('en-US'),
    commandPalette: createCommandPaletteLabels('en-US'),
    files: createFileLabels('en-US'),
    monitoring: createSessionMonitoringLabels('en-US'),
    agents: createAgentWorkspaceLabels('en-US'),
    goals: createGoalPlanWorkspaceLabels('en-US'),
    extensions: createExtensionWorkspaceLabels('en-US'),
    status: createStatusWorkspaceLabels('en-US'),
    diagnostics: createSystemDiagnosticsLabels('en-US'),
    settingsUsage: settingsUsageCopy('en-US'),
  },
}

// Only platform-specific shortcut labels differ; keep all other label references stable.
// There are at most two locale-specific Mac variants, never a cache per raw platform.
const macCopies = new Map<ShellLocale, ShellCopy>()

export function getShellCopy(
  locale: ShellLocale,
  platform = typeof navigator === 'undefined' ? '' : navigator.platform,
): ShellCopy {
  const base = copies[locale]
  const stop = sessionStopButtonLabel(locale, platform)
  if (stop === base.session.prompt.stop) return base
  const cached = macCopies.get(locale)
  if (cached) return cached
  const copy: ShellCopy = {
    ...base,
    shell: { ...base.shell, searchShortcut: '⌘K', commandShortcut: '⌘⇧P' },
    session: { ...base.session, prompt: { ...base.session.prompt, stop } },
  }
  macCopies.set(locale, copy)
  return copy
}

export function resolveShellLocale(languages: readonly string[]): ShellLocale {
  for (const language of languages) {
    if (/^zh(?:-|$)/i.test(language)) return 'zh-CN'
    if (/^en(?:-|$)/i.test(language)) return 'en-US'
  }
  return 'zh-CN'
}
