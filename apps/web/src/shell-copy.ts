import type { HbarSessionWorkspaceLabels, HbarSettingsWorkspaceLabels, HbarWorkspaceShellLabels } from '@hbar/app-react'

export type ShellLocale = 'zh-CN' | 'en-US'
interface ShellCopy {
  readonly shell: HbarWorkspaceShellLabels
  readonly empty: { readonly title: string; readonly description: string }
  readonly session: HbarSessionWorkspaceLabels
  readonly settings: HbarSettingsWorkspaceLabels
  readonly panels: Readonly<
    Record<'commands' | 'status' | 'settings', { readonly title: string; readonly description: string }>
  >
}

function createSettingsLabels(locale: ShellLocale): HbarSettingsWorkspaceLabels {
  const zh = locale === 'zh-CN'
  const choose = <Value>(chinese: Value, english: Value): Value => (zh ? chinese : english)
  const messages: Readonly<Record<string, string>> = zh
    ? {
        'i18n:settings.groups.model': '模型',
        'i18n:settings.groups.session': '会话默认值',
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
