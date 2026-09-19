import type { HbarAppUiControlOption } from '../../packages/hbar-app-ui/src/production'

export interface FormControlsAuditCopy {
  readonly title: string
  readonly description: string
  readonly providerLabel: string
  readonly providerDescription: string
  readonly providerValue: string
  readonly requiredIndicator: string
  readonly protocolLabel: string
  readonly protocols: readonly HbarAppUiControlOption[]
  readonly modelLabel: string
  readonly modelDescription: string
  readonly modelPlaceholder: string
  readonly endpointLabel: string
  readonly endpointHint: string
  readonly endpointError: string
  readonly endpointValue: string
  readonly notesLabel: string
  readonly notesValue: string
  readonly visibleLabel: string
  readonly visibleDescription: string
  readonly imageLabel: string
  readonly imageDescription: string
  readonly thinkingLabel: string
  readonly thinkingDescription: string
  readonly thinkingPlaceholder: string
  readonly removeThinking: (label: string) => string
  readonly selectedLabel: string
  readonly combo: { readonly open: string; readonly empty: string; readonly loading: string }
  readonly models: readonly HbarAppUiControlOption[]
  readonly thinkingLevels: readonly HbarAppUiControlOption[]
}

export const formControlsAuditCopy: Readonly<Record<'zh-CN' | 'en-US', FormControlsAuditCopy>> = {
  'zh-CN': {
    title: '供应商配置',
    description: '表单控件由 hbar-app-ui 提供，字段内容和选项由宿主注入。',
    providerLabel: '显示名称',
    providerDescription: '用于设置页面和模型选择器。',
    providerValue: 'OpenAI 工作账户',
    requiredIndicator: '*',
    protocolLabel: '协议',
    protocols: [
      { id: 'openai-responses', label: 'OpenAI Responses' },
      { id: 'openai-completions', label: 'OpenAI Completions' },
      { id: 'anthropic-messages', label: 'Anthropic Messages' },
    ],
    modelLabel: '默认模型',
    modelDescription: '支持键盘检索，也允许宿主替换为动态分页结果。',
    modelPlaceholder: '搜索模型',
    endpointLabel: 'API 地址',
    endpointHint: '必须使用 HTTPS。',
    endpointError: '请补全账户 ID 后再保存。',
    endpointValue: 'https://api.openai.com/v1',
    notesLabel: '使用说明',
    notesValue: '仅用于需要更长上下文窗口的工程会话。',
    visibleLabel: '在模型选择器中显示',
    visibleDescription: '关闭后，已经绑定该供应商的会话仍可继续运行。',
    imageLabel: '允许图片输入',
    imageDescription: '此能力由所选模型决定。',
    thinkingLabel: '可用思考等级',
    thinkingDescription: '模型可以公开一个或多个思考等级，也可以隐藏不希望使用的等级。',
    thinkingPlaceholder: '添加思考等级',
    removeThinking: (label) => `移除思考等级 ${label}`,
    selectedLabel: '当前模型',
    combo: { open: '打开模型列表', empty: '没有匹配的模型', loading: '正在加载模型' },
    models: [
      { id: 'gpt-5.4', label: 'GPT-5.4', detail: '1M 上下文 · 图片 · 推理' },
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', detail: '400K 上下文 · 图片 · 推理' },
      { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex', detail: '400K 上下文 · 代码 · 推理' },
      { id: 'gpt-4.1', label: 'GPT-4.1', detail: '1M 上下文 · 图片' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', detail: '1M 上下文 · 图片' },
      { id: 'o4-mini', label: 'o4-mini', detail: '200K 上下文 · 推理' },
    ],
    thinkingLevels: [
      { id: 'off', label: '关闭' },
      { id: 'minimal', label: '最少' },
      { id: 'low', label: '低' },
      { id: 'medium', label: '中' },
      { id: 'high', label: '高' },
      { id: 'xhigh', label: '很高' },
      { id: 'max', label: '最高' },
    ],
  },
  'en-US': {
    title: 'Provider configuration',
    description: 'hbar-app-ui supplies the controls while the host injects field copy and options.',
    providerLabel: 'Display name',
    providerDescription: 'Shown in settings and the model picker.',
    providerValue: 'OpenAI work account',
    requiredIndicator: '*',
    protocolLabel: 'Protocol',
    protocols: [
      { id: 'openai-responses', label: 'OpenAI Responses' },
      { id: 'openai-completions', label: 'OpenAI Completions' },
      { id: 'anthropic-messages', label: 'Anthropic Messages' },
    ],
    modelLabel: 'Default model',
    modelDescription: 'Supports keyboard search and host-provided paged results.',
    modelPlaceholder: 'Search models',
    endpointLabel: 'API URL',
    endpointHint: 'HTTPS is required.',
    endpointError: 'Complete the account ID before saving.',
    endpointValue: 'https://api.openai.com/v1',
    notesLabel: 'Usage notes',
    notesValue: 'Use for project sessions that need a larger context window.',
    visibleLabel: 'Show in model picker',
    visibleDescription: 'Existing sessions can still run after this provider is hidden.',
    imageLabel: 'Allow image input',
    imageDescription: 'This capability follows the selected model.',
    thinkingLabel: 'Available thinking levels',
    thinkingDescription: 'A model can expose several levels and hide levels that should not be used.',
    thinkingPlaceholder: 'Add a thinking level',
    removeThinking: (label) => `Remove thinking level ${label}`,
    selectedLabel: 'Current model',
    combo: { open: 'Open model list', empty: 'No matching models', loading: 'Loading models' },
    models: [
      { id: 'gpt-5.4', label: 'GPT-5.4', detail: '1M context · image · reasoning' },
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', detail: '400K context · image · reasoning' },
      { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex', detail: '400K context · code · reasoning' },
      { id: 'gpt-4.1', label: 'GPT-4.1', detail: '1M context · image' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', detail: '1M context · image' },
      { id: 'o4-mini', label: 'o4-mini', detail: '200K context · reasoning' },
    ],
    thinkingLevels: [
      { id: 'off', label: 'Off' },
      { id: 'minimal', label: 'Minimal' },
      { id: 'low', label: 'Low' },
      { id: 'medium', label: 'Medium' },
      { id: 'high', label: 'High' },
      { id: 'xhigh', label: 'Extra high' },
      { id: 'max', label: 'Maximum' },
    ],
  },
}
