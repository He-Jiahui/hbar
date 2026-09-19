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
  HbarStatusWorkspaceLabels,
  HbarWorkspaceShellLabels,
} from '@hbar/app-react'

export type ShellLocale = 'zh-CN' | 'en-US'
interface ShellCopy {
  readonly shell: HbarWorkspaceShellLabels
  readonly empty: { readonly title: string; readonly description: string }
  readonly session: HbarSessionWorkspaceLabels
  readonly settings: HbarSettingsWorkspaceLabels
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
        'commands.app.openSettings.title': '打开设置',
        'commands.app.openSettings.description': '按全局、工作区或会话作用域打开设置。',
        'commands.app.openStatus.title': '打开状态中心',
        'commands.app.openStatus.description': '打开性能、用量或 Git 状态分区。',
        'commands.app.setWorkspace.title': '选择工作区',
        'commands.app.setWorkspace.description': '将当前工作台聚焦到指定工作区。',
        'commands.app.setSession.title': '选择会话',
        'commands.app.setSession.description': '按 ID 或名称将当前工作台聚焦到会话。',
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
      }
    : {
        'commands.app.openPanel.title': 'Open panel',
        'commands.app.openPanel.description': 'Open a named panel in the current workbench.',
        'commands.app.closePanel.title': 'Close panel',
        'commands.app.closePanel.description': 'Close a workbench panel instance.',
        'commands.app.openSettings.title': 'Open settings',
        'commands.app.openSettings.description': 'Open settings at global, workspace, or session scope.',
        'commands.app.openStatus.title': 'Open status center',
        'commands.app.openStatus.description': 'Open the performance, usage, or Git status section.',
        'commands.app.setWorkspace.title': 'Select workspace',
        'commands.app.setWorkspace.description': 'Focus the current workbench on a workspace.',
        'commands.app.setSession.title': 'Select session',
        'commands.app.setSession.description': 'Focus the current workbench on a session by ID or name.',
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
      }
  const fields: Readonly<Record<string, string>> = zh
    ? {
        sessionId: '会话 ID',
        workspaceId: '工作区 ID',
        session: '会话 ID 或名称',
        sessionName: '会话名称',
        tokens: 'Token 上限',
        expectedRevision: '预期版本',
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
      }
    : {
        sessionId: 'Session ID',
        workspaceId: 'Workspace ID',
        session: 'Session ID or name',
        sessionName: 'Session name',
        tokens: 'Token limit',
        expectedRevision: 'Expected revision',
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
        'i18n:settings.groups.session': '会话默认值',
        'i18n:settings.groups.providers': '供应商',
        'i18n:settings.provider.model.label': '模型',
        'i18n:settings.provider.model.help': '选择后续运行使用的供应商模型。',
        'i18n:settings.provider.thinkingLevel.label': '思考等级',
        'i18n:settings.provider.thinkingLevel.help': '可用等级会随当前模型变化。',
        'i18n:settings.session.defaultBudget.label': '默认 Token 预算',
        'i18n:settings.session.defaultBudget.help': '设置新会话运行采用的默认 Token 上限。',
      }
    : {
        'i18n:settings.groups.model': 'Model',
        'i18n:settings.groups.session': 'Session defaults',
        'i18n:settings.groups.providers': 'Providers',
        'i18n:settings.provider.model.label': 'Model',
        'i18n:settings.provider.model.help': 'Choose the provider model used by future runs.',
        'i18n:settings.provider.thinkingLevel.label': 'Thinking level',
        'i18n:settings.provider.thinkingLevel.help': 'Available levels follow the selected model.',
        'i18n:settings.session.defaultBudget.label': 'Default token budget',
        'i18n:settings.session.defaultBudget.help': 'Set the default token limit for new session runs.',
      }
  const option = (value: unknown) => {
    const key = String(value)
    const translated: Readonly<Record<string, string>> = zh
      ? {
          off: '关闭',
          minimal: '最少',
          low: '低',
          medium: '中',
          high: '高',
          xhigh: '超高',
          max: '最大',
        }
      : {
          off: 'Off',
          minimal: 'Minimal',
          low: 'Low',
          medium: 'Medium',
          high: 'High',
          xhigh: 'Extra high',
          max: 'Maximum',
        }
    return translated[key] ?? key
  }
  const source = (value: string) => {
    if (value.includes(':session:')) return choose('会话层', 'session scope')
    if (value.includes(':workspace:')) return choose('工作区层', 'workspace scope')
    if (value.includes(':global')) return choose('全局层', 'global scope')
    if (value === 'default') return choose('默认值', 'defaults')
    return choose('上一级', 'parent scope')
  }
  return {
    title: (scope, target) =>
      scope === 'global'
        ? choose('全局设置', 'Global settings')
        : scope === 'workspace'
          ? choose(`工作区设置${target ? ` · ${target}` : ''}`, `Workspace settings${target ? ` · ${target}` : ''}`)
          : choose(`会话设置${target ? ` · ${target}` : ''}`, `Session settings${target ? ` · ${target}` : ''}`),
    description: choose('更改按全局、工作区和会话层级覆盖。', 'Values override global, workspace, and session scopes.'),
    scopes: choose('设置作用域', 'Settings scope'),
    global: choose('全局', 'Global'),
    workspace: choose('工作区', 'Workspace'),
    session: choose('会话', 'Session'),
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
    resolve: (key) => messages[key] ?? key,
    form: {
      reset: choose('恢复已保存值', 'Restore saved value'),
      loading: choose('正在加载选项…', 'Loading options…'),
      empty: choose('没有可用选项', 'No options available'),
      unavailable: (code) => choose(`选项当前不可用：${code}`, `Options unavailable: ${code}`),
      contentError: (code) => choose(`选项加载失败：${code}`, `Option loading failed: ${code}`),
      selectedInvalid: (value) =>
        choose(`当前值不可用：${option(value)}`, `Current value unavailable: ${option(value)}`),
      issue: (issue) =>
        issue.code === 'required'
          ? choose('此字段必填。', 'This field is required.')
          : choose('字段值不符合约束。', 'The value does not satisfy this field.'),
      option: (_field, value) => option(value),
      contentText: (text) => (text.kind === 'literal' ? text.text : (messages[text.key] ?? text.key)),
      pickResource: (kind) =>
        kind === 'file' ? choose('选择文件', 'Choose file') : choose('选择文件夹', 'Choose directory'),
      componentUnavailable: (component) =>
        choose(`缺少设置组件：${component}`, `Settings component unavailable: ${component}`),
    },
  }
}

function createProviderLabels(locale: ShellLocale): ShellCopy['providers'] {
  const zh = locale === 'zh-CN'
  const choose = <Value>(chinese: Value, english: Value): Value => (zh ? chinese : english)
  const messages: Readonly<Record<string, string>> = zh
    ? {
        'i18n:settings.providers.list.label': '供应商配置',
        'i18n:settings.providers.id.label': '供应商 ID',
        'i18n:settings.providers.id.help': '保存后不可修改，用于模型选择和凭据引用。',
        'i18n:settings.providers.name.label': '显示名称',
        'i18n:settings.providers.protocol.label': '协议',
        'i18n:settings.providers.baseUrl.label': 'API 地址',
        'i18n:settings.providers.model.label': '默认模型 ID',
        'i18n:settings.providers.contextWindow.label': '上下文窗口',
        'i18n:settings.providers.maxOutput.label': '最大输出 Token',
        'i18n:settings.providers.imageInput.label': '支持图片输入',
        'i18n:settings.providers.reasoning.label': '支持推理',
        'i18n:settings.providers.inputPrice.label': '输入价格（每百万 Token）',
        'i18n:settings.providers.outputPrice.label': '输出价格（每百万 Token）',
        'i18n:settings.providers.apiKey.label': 'API Key',
        'i18n:settings.providers.apiKey.help': '留空会保留已有凭据；输入空字符串并保存会清除凭据。',
      }
    : {
        'i18n:settings.providers.list.label': 'Provider configurations',
        'i18n:settings.providers.id.label': 'Provider ID',
        'i18n:settings.providers.id.help': 'Immutable after save; used by model selections and credential references.',
        'i18n:settings.providers.name.label': 'Display name',
        'i18n:settings.providers.protocol.label': 'Protocol',
        'i18n:settings.providers.baseUrl.label': 'API URL',
        'i18n:settings.providers.model.label': 'Default model ID',
        'i18n:settings.providers.contextWindow.label': 'Context window',
        'i18n:settings.providers.maxOutput.label': 'Maximum output tokens',
        'i18n:settings.providers.imageInput.label': 'Supports image input',
        'i18n:settings.providers.reasoning.label': 'Supports reasoning',
        'i18n:settings.providers.inputPrice.label': 'Input price per million tokens',
        'i18n:settings.providers.outputPrice.label': 'Output price per million tokens',
        'i18n:settings.providers.apiKey.label': 'API key',
        'i18n:settings.providers.apiKey.help':
          'Leave blank to retain the stored credential; submit an empty value to remove it.',
      }
  const itemName = (item: Readonly<Record<string, unknown>>) => String(item.name ?? item.providerId)
  const list: HbarProviderSettingsLabels = {
    loading: choose('正在加载供应商…', 'Loading providers…'),
    refresh: choose('刷新供应商', 'Refresh providers'),
    error: (code) => choose(`供应商操作失败：${code}`, `Provider action failed: ${code}`),
    list: {
      resolve: (key) => messages[key] ?? key,
      empty: choose('尚未配置供应商。', 'No providers configured.'),
      add: choose('添加供应商', 'Add provider'),
      edit: (item) => choose(`编辑 ${itemName(item)}`, `Edit ${itemName(item)}`),
      remove: (item) => choose(`删除 ${itemName(item)}`, `Delete ${itemName(item)}`),
      moveUp: (item) => choose(`上移 ${itemName(item)}`, `Move ${itemName(item)} up`),
      moveDown: (item) => choose(`下移 ${itemName(item)}`, `Move ${itemName(item)} down`),
      reset: (item) => choose(`重置 ${itemName(item)}`, `Reset ${itemName(item)}`),
      itemLabel: (item) =>
        choose(
          `${itemName(item)} · ${String(item.protocol)} · ${String(item.model)} · ${item.hasKey ? '已配置凭据' : '无凭据'}`,
          `${itemName(item)} · ${String(item.protocol)} · ${String(item.model)} · ${item.hasKey ? 'credential configured' : 'no credential'}`,
        ),
    },
  }
  const dialog: HbarProviderDialogLabels = {
    addTitle: choose('添加供应商', 'Add provider'),
    editTitle: (name) => choose(`编辑供应商 · ${name}`, `Edit provider · ${name}`),
    description: choose(
      '配置协议、模型能力、价格和凭据引用。',
      'Configure protocol, model capability, pricing, and credentials.',
    ),
    loading: choose('正在加载供应商编辑器…', 'Loading provider editor…'),
    back: choose('返回设置', 'Back to settings'),
    save: choose('保存供应商', 'Save provider'),
    reconcile: choose('核对保存结果', 'Reconcile save'),
    remove: choose('删除供应商', 'Delete provider'),
    saved: choose('供应商已保存。', 'Provider saved.'),
    unsaved: (count) => choose(`${count} 项更改尚未保存`, `${count} unsaved ${count === 1 ? 'change' : 'changes'}`),
    configured: choose('已安全保存凭据', 'Credential is stored securely'),
    notConfigured: choose('尚未保存凭据', 'No stored credential'),
    error: (code) => choose(`供应商操作失败：${code}`, `Provider action failed: ${code}`),
    resolve: (key) => messages[key] ?? key,
    form: {
      reset: choose('恢复已保存值', 'Restore saved value'),
      loading: choose('正在加载选项…', 'Loading options…'),
      empty: choose('没有可用选项', 'No options available'),
      unavailable: (code) => choose(`选项当前不可用：${code}`, `Options unavailable: ${code}`),
      contentError: (code) => choose(`选项加载失败：${code}`, `Option loading failed: ${code}`),
      selectedInvalid: (value) =>
        choose(`当前值不可用：${String(value)}`, `Current value unavailable: ${String(value)}`),
      issue: (issue) =>
        issue.code === 'required'
          ? choose('此字段必填。', 'This field is required.')
          : choose('字段值不符合约束。', 'The value does not satisfy this field.'),
      option: (_field, value) => String(value),
      contentText: (text) => (text.kind === 'literal' ? text.text : (messages[text.key] ?? text.key)),
      pickResource: (kind) =>
        kind === 'file' ? choose('选择文件', 'Choose file') : choose('选择文件夹', 'Choose directory'),
      componentUnavailable: (component) => choose(`缺少组件：${component}`, `Component unavailable: ${component}`),
    },
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
    empty: choose('发送提示词以开始会话。', 'Send a prompt to begin this session.'),
    author: zh
      ? { user: '你', assistant: '助手', system: '系统', tool: '工具' }
      : { user: 'You', assistant: 'Assistant', system: 'System', tool: 'Tool' },
    avatar: zh
      ? { user: '你', assistant: 'AI', system: '系', tool: '工' }
      : { user: 'You', assistant: 'AI', system: 'Sy', tool: 'Tl' },
    copy: choose('复制消息', 'Copy message'),
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
      stop: choose('停止当前运行', 'Stop the current run'),
      uploading: choose('正在上传附件', 'Uploading attachments'),
      addAttachment: choose('添加附件', 'Add attachment'),
      removeAttachment: (attachment) => choose(`移除附件 ${attachment.name}`, `Remove attachment ${attachment.name}`),
    },
    model: (name, thinkingLevel) =>
      choose(
        `${name}${thinkingLevel ? ` · 思考 ${thinkingLevel}` : ''}`,
        `${name}${thinkingLevel ? ` · thinking ${thinkingLevel}` : ''}`,
      ),
    modelUnavailable: choose(
      '请先在 Session 设置中选择可用模型。',
      'Choose an available model in Session settings first.',
    ),
    tools: {
      label: choose('会话工具', 'Session tools'),
      files: choose('文件', 'Files'),
      monitoring: choose('用量监控', 'Monitoring'),
      agents: choose('子 Agent', 'Child agents'),
      goals: choose('目标与计划', 'Goals and plans'),
      settings: choose('会话设置', 'Session settings'),
    },
    runs: {
      title: choose('Agent Activity', 'Agent activity'),
      emptyTitle: choose('尚无运行', 'No runs yet'),
      emptyDescription: choose(
        '发送提示词后会在这里显示运行状态。',
        'Run status appears here after you send a prompt.',
      ),
      cancelLabel: choose('取消运行', 'Cancel run'),
      cancellingLabel: choose('正在取消', 'Cancelling'),
      countLabel: (count) => choose(`${count} 次运行`, `${count} runs`),
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
      title: choose('AI Usage', 'AI usage'),
      description: choose('当前 Session 的可靠结算数据', 'Reliable accounting for the current session'),
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
    title: choose('文件管理器', 'File manager'),
    parent: choose('返回上级目录', 'Open parent folder'),
    refresh: choose('刷新文件', 'Refresh files'),
    loading: choose('正在加载文件…', 'Loading files…'),
    empty: choose('此目录为空；选择文件后会在此处打开。', 'This folder is empty; select a file to open it.'),
    retry: choose('重试', 'Retry'),
    readOnly: choose('可编辑文本', 'Editable text'),
    close: choose('关闭文件管理器', 'Close file manager'),
    loadMore: choose('加载更多文件', 'Load more files'),
    save: choose('保存文件', 'Save file'),
    saving: choose('正在保存…', 'Saving…'),
    saved: choose('文件已保存。', 'File saved.'),
    reconcile: choose('核对保存结果', 'Reconcile save'),
    dirty: choose('有未保存的更改', 'Unsaved changes'),
    error: (code) => choose(`文件操作失败：${code}`, `File operation failed: ${code}`),
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
    unavailable: choose('当前没有可靠的用量数据。', 'Reliable usage data is not available.'),
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
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
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
    objective: choose('目标', 'Objective'),
    objectivePlaceholder: choose('描述子 Agent 需要完成的任务', 'Describe the task for the child agent'),
    childTitle: choose('会话标题', 'Session title'),
    childTitlePlaceholder: choose('可选会话标题', 'Optional session title'),
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
    openSession: choose('打开会话', 'Open session'),
    cancel: choose('取消 Agent', 'Cancel agent'),
    cancelling: choose('正在取消…', 'Cancelling…'),
    retryCancel: choose('重试取消', 'Retry cancellation'),
    count: (count) =>
      choose(`${number.format(count)} 个子 Agent`, `${number.format(count)} child ${count === 1 ? 'agent' : 'agents'}`),
    status: (status) => statuses[status],
    budget: (tokens) =>
      tokens === null ? choose('继承 / 未限定', 'Inherited / unlimited') : `${number.format(tokens)} tokens`,
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
  return {
    title: choose('目标与计划', 'Goals and plans'),
    description: choose(
      '管理当前会话的持久目标、Token 预算和分步计划。',
      'Manage the session goal, token budget, and persisted step-by-step plan.',
    ),
    close: choose('关闭目标与计划', 'Close goals and plans'),
    refresh: choose('刷新', 'Refresh'),
    loading: choose('正在加载目标与计划…', 'Loading goals and plans…'),
    goal: {
      title: choose('会话目标', 'Session goal'),
      objective: choose('目标', 'Goal objective'),
      objectivePlaceholder: choose('描述需要持续完成的成果', 'Describe the outcome to pursue'),
      tokenBudget: choose('Token 预算', 'Goal token budget'),
      status: choose('目标状态', 'Goal status'),
      statuses: goalStatuses,
      save: choose('保存目标', 'Save goal'),
      saving: choose('正在保存…', 'Saving…'),
      clear: choose('清除目标', 'Clear goal'),
      reconcile: choose('核对目标保存结果', 'Reconcile goal save'),
      saved: choose('目标已保存。', 'Goal saved.'),
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
      clear: choose('清除计划', 'Clear plan'),
      reconcile: choose('核对计划保存结果', 'Reconcile plan save'),
      saved: choose('计划已保存。', 'Plan saved.'),
      stepTitle: (index) => choose(`步骤 ${index} 内容`, `Step ${index} title`),
      stepStatus: (index) => choose(`步骤 ${index} 状态`, `Step ${index} status`),
      statuses: planStatuses,
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
    title: choose('扩展与技能', 'Extensions and skills'),
    description: choose(
      '查看 Host 已注册能力，管理可选插件，并进入同一命令目录。',
      'Inspect Host capabilities, manage optional plugins, and open their shared command catalog.',
    ),
    close: choose('关闭扩展与技能', 'Close extensions and skills'),
    refresh: choose('刷新', 'Refresh'),
    loading: choose('正在加载扩展与技能…', 'Loading extensions and skills…'),
    plugins: choose('插件', 'Plugins'),
    skills: choose('技能', 'Skills'),
    noPlugins: choose('当前 Host 没有注册插件。', 'No plugins are registered on this Host.'),
    noSkills: choose('当前 Host 没有发现技能。', 'No skills were discovered on this Host.'),
    status: {
      active: choose('已启用', 'Active'),
      disabled: choose('已禁用', 'Disabled'),
      failed: choose('失败', 'Failed'),
    },
    required: choose('必需插件', 'Required plugin'),
    provides: choose('能力', 'Capabilities'),
    commands: choose('命令数', 'Commands'),
    panels: choose('面板数', 'Panels'),
    openCommands: choose('打开相关命令', 'Open related commands'),
    openSystemCommands: choose('打开系统与诊断命令', 'Open system and diagnostic commands'),
    enable: choose('启用', 'Enable'),
    disable: choose('禁用', 'Disable'),
    changing: choose('正在更新…', 'Updating…'),
    reconcile: choose('核对插件状态', 'Reconcile plugin state'),
    pluginCount: (count) =>
      choose(`${number.format(count)} 个插件`, `${number.format(count)} ${count === 1 ? 'plugin' : 'plugins'}`),
    skillCount: (count) =>
      choose(`${number.format(count)} 个技能`, `${number.format(count)} ${count === 1 ? 'skill' : 'skills'}`),
    error: (code) => choose(`扩展操作失败：${code}`, `Extension operation failed: ${code}`),
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
      title: choose('全局 AI 用量', 'Global AI usage'),
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
      provenance: choose('提交来源', 'Commit provenance'),
      changes: choose('文件与行数变化', 'File and line changes'),
      timeline: choose('提交与行数时间序列', 'Commit and line-change timeline'),
      policy: choose('统计口径', 'Accounting policy'),
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

const copies: Readonly<Record<ShellLocale, ShellCopy>> = {
  'zh-CN': {
    shell: {
      main: '工作台',
      brand: 'hbar',
      projectsAndSessions: '工程与会话',
      noWorkspaces: '尚无工程',
      noSessions: '尚无会话',
      loading: '正在加载',
      loadMore: '加载更多',
      commands: '命令',
      openWorkspace: '打开工作区',
      status: '状态中心',
      extensions: '扩展',
      settings: '设置',
      server: '服务端',
      connected: '已连接',
      disconnected: '未连接',
      reconnect: '重新连接',
      expandWorkspace: (name) => `展开工程 ${name}`,
      collapseWorkspace: (name) => `折叠工程 ${name}`,
      openSession: (name) => `打开会话 ${name}`,
      error: (code) => `加载失败：${code}`,
    },
    empty: { title: '选择一个会话', description: '从左侧工程列表选择会话以打开工作区。' },
    session: createSessionLabels('zh-CN'),
    settings: createSettingsLabels('zh-CN'),
    providers: createProviderLabels('zh-CN'),
    commandPalette: createCommandPaletteLabels('zh-CN'),
    files: createFileLabels('zh-CN'),
    monitoring: createSessionMonitoringLabels('zh-CN'),
    agents: createAgentWorkspaceLabels('zh-CN'),
    goals: createGoalPlanWorkspaceLabels('zh-CN'),
    extensions: createExtensionWorkspaceLabels('zh-CN'),
    status: createStatusWorkspaceLabels('zh-CN'),
  },
  'en-US': {
    shell: {
      main: 'Workspace',
      brand: 'hbar',
      projectsAndSessions: 'Projects and sessions',
      noWorkspaces: 'No projects yet',
      noSessions: 'No sessions yet',
      loading: 'Loading',
      loadMore: 'Load more',
      commands: 'Commands',
      openWorkspace: 'Open workspace',
      status: 'Status center',
      extensions: 'Extensions',
      settings: 'Settings',
      server: 'Server',
      connected: 'Connected',
      disconnected: 'Disconnected',
      reconnect: 'Reconnect',
      expandWorkspace: (name) => `Expand project ${name}`,
      collapseWorkspace: (name) => `Collapse project ${name}`,
      openSession: (name) => `Open session ${name}`,
      error: (code) => `Loading failed: ${code}`,
    },
    empty: { title: 'Select a session', description: 'Choose a session from the project list to open its workspace.' },
    session: createSessionLabels('en-US'),
    settings: createSettingsLabels('en-US'),
    providers: createProviderLabels('en-US'),
    commandPalette: createCommandPaletteLabels('en-US'),
    files: createFileLabels('en-US'),
    monitoring: createSessionMonitoringLabels('en-US'),
    agents: createAgentWorkspaceLabels('en-US'),
    goals: createGoalPlanWorkspaceLabels('en-US'),
    extensions: createExtensionWorkspaceLabels('en-US'),
    status: createStatusWorkspaceLabels('en-US'),
  },
}

export function getShellCopy(locale: ShellLocale): ShellCopy {
  return copies[locale]
}

export function resolveShellLocale(languages: readonly string[]): ShellLocale {
  for (const language of languages) {
    if (/^zh(?:-|$)/i.test(language)) return 'zh-CN'
    if (/^en(?:-|$)/i.test(language)) return 'en-US'
  }
  return 'zh-CN'
}
