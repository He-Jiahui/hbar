import type {
  HbarCommandPaletteLabels,
  HbarFileWorkspaceLabels,
  HbarProviderDialogLabels,
  HbarProviderSettingsLabels,
  HbarSessionMonitoringLabels,
  HbarSessionWorkspaceLabels,
  HbarSettingsWorkspaceLabels,
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
  readonly panels: Readonly<
    Record<'commands' | 'status' | 'settings', { readonly title: string; readonly description: string }>
  >
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
      status: '状态中心',
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
    panels: {
      commands: { title: '命令', description: '分类命令面板将在此区域打开。' },
      status: { title: '状态中心', description: 'Performance、Usage 与 Git 状态将在此区域显示。' },
      settings: { title: '设置', description: 'Schema 设置工作台将在此区域打开。' },
    },
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
      status: 'Status center',
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
    panels: {
      commands: { title: 'Commands', description: 'The categorized command palette opens in this region.' },
      status: { title: 'Status center', description: 'Performance, Usage, and Git status appear in this region.' },
      settings: { title: 'Settings', description: 'The schema settings workspace opens in this region.' },
    },
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
