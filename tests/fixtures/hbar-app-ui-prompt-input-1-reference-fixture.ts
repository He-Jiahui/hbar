import type { LumenPromptRichReferenceContent } from '@lumen/app-ui/catalog'

export function createPrompt1ReferenceFixture(locale: 'en' | 'zh' = 'en'): LumenPromptRichReferenceContent {
  const zh = locale === 'zh'
  return {
    variant: 1,
    ownerId: 'rich-message',
    listStrategy: { kind: 'content-grown', expectedMaximum: 12 },
    composer: {
      draft: '',
      role: 'combobox',
      allowAttachmentOnly: true,
      attachments: [
        { id: 'auth-service', label: 'auth-service.ts', detail: '12 KB' },
        { id: 'billing-invoice', label: 'billing-invoice-4021.pdf', detail: '1.2 MB' },
      ],
      labels: {
        input: zh ? '消息' : 'Message',
        placeholder: zh ? '问点什么' : 'Ask anything',
        send: zh ? '发送' : 'Send',
        attach: zh ? '附加文件' : 'Attach a file',
        remove: (name) => (zh ? `移除 ${name}` : `Remove ${name}`),
      },
    },
    models: [
      { id: 'atlas', label: 'Atlas', detail: zh ? '均衡的速度与深度' : 'Balanced speed and depth' },
      { id: 'atlas-pro', label: 'Atlas Pro', detail: zh ? '深入推理' : 'Deepest reasoning' },
      { id: 'quill', label: 'Quill', detail: zh ? '适合短任务的最快模型' : 'Fastest, for short tasks' },
    ],
    modelId: 'atlas',
    efforts: [
      { id: 'low', label: zh ? '低' : 'Low' },
      { id: 'medium', label: zh ? '中' : 'Medium' },
      { id: 'high', label: zh ? '高' : 'High' },
    ],
    effortId: 'medium',
    commands: [
      {
        id: 'summarize',
        label: zh ? '总结当前内容' : 'Summarize context',
        draft: zh ? '总结当前内容。' : 'Summarize the current context.',
      },
      {
        id: 'review',
        label: zh ? '审查变更' : 'Review changes',
        draft: zh ? '审查这些变更。' : 'Review these changes.',
      },
    ],
    labels: {
      model: (name) => (zh ? `模型：${name}` : `Model: ${name}`),
      effort: (name) => (zh ? `推理强度：${name}` : `Reasoning effort: ${name}`),
      commands: zh ? '预览命令' : 'Preview commands',
      voice: zh ? '录制语音' : 'Record voice',
    },
    help: zh ? '输入 / 选择命令，或拖入文件作为附件。' : 'Type / to run a command, or drop a file to attach it.',
  }
}
