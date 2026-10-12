import type { LumenPromptModesReferenceContent } from '@lumen/app-ui/catalog'

export function createPrompt7ReferenceFixture(locale: 'en' | 'zh' = 'en'): LumenPromptModesReferenceContent {
  const chinese = locale === 'zh'
  // The captured Agent description is source-backed; alternate-mode descriptions are preview-only copy.
  const modeDescriptions: Readonly<Record<string, string>> = chinese
    ? {
        ask: '提问并探索想法，不会更改工作区。',
        agent: '规划并运行工具，逐步完成整个任务。',
        edit: '对当前片段提出并应用有针对性的修改。',
      }
    : {
        ask: 'Ask questions and explore an idea without changing the workspace.',
        agent: 'Plan and run tools to work through the task end to end.',
        edit: 'Propose focused changes to the current segment.',
      }

  // Captures show only the Local and Atlas triggers; expanded environment and model choices are preview-only fixture data.
  return {
    variant: 7,
    ownerId: 'prompt-input-7-reference',
    composer: {
      draft: '',
      attachments: [],
      labels: {
        input: chinese ? '提示' : 'Prompt',
        placeholder: chinese ? '请在此处描述你希望助手协助完成的任务' : 'Ask anything',
        send: chinese ? '发送' : 'Send',
        remove: (name) => (chinese ? `移除 ${name}` : `Remove ${name}`),
      },
    },
    modes: [
      { id: 'ask', label: chinese ? '提问' : 'Ask' },
      { id: 'agent', label: chinese ? '代理' : 'Agent' },
      { id: 'edit', label: chinese ? '编辑' : 'Edit' },
    ],
    modeId: 'agent',
    environments: [
      { id: 'local', label: chinese ? '本地' : 'Local', detail: chinese ? '本地预览' : 'Local preview' },
      { id: 'remote', label: chinese ? '远程' : 'Remote', detail: chinese ? '工作区预览' : 'Workspace preview' },
    ],
    environmentId: 'local',
    models: [
      { id: 'atlas', label: 'Atlas', detail: chinese ? '均衡' : 'Balanced' },
      { id: 'atlas-pro', label: 'Atlas Pro', detail: chinese ? '速度' : 'Speed' },
      { id: 'quill', label: 'Quill', detail: chinese ? '深度' : 'Depth' },
    ],
    modelId: 'atlas',
    modeDescription: (modeId) => modeDescriptions[modeId] ?? '',
    labels: {
      modes: chinese ? '提示模式' : 'Prompt mode',
      environment: (name) => (chinese ? `环境：${name}` : `Environment: ${name}`),
      model: (name) => (chinese ? `模型：${name}` : `Model: ${name}`),
    },
    hints: chinese
      ? [
          { id: 'enter-send', key: 'Enter', description: '发送' },
          { id: 'shift-enter-newline', key: 'Shift Enter', description: '换行' },
        ]
      : [
          { id: 'enter-send', key: 'Enter', description: 'to send' },
          { id: 'shift-enter-newline', key: 'Shift Enter', description: 'for a new line' },
        ],
    listStrategy: { kind: 'content-grown', expectedMaximum: 8 },
  }
}
