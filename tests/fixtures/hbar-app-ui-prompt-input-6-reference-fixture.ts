import type { LumenPromptScopeReferenceContent } from '@lumen/app-ui/catalog'

export function createPrompt6ReferenceFixture(locale: 'en' | 'zh' = 'en'): LumenPromptScopeReferenceContent {
  const chinese = locale === 'zh'
  // Only the initially selected chips were captured; remaining choices are preview fixture data.
  return {
    variant: 6,
    ownerId: 'prompt-input-6-reference',
    help: chinese
      ? '输入 @ 可将文件、人员或频道添加到上下文。'
      : 'Type @ to pull a file, person, or channel into context.',
    composer: {
      draft: '',
      attachments: [],
      role: 'combobox',
      labels: {
        input: chinese ? '消息' : 'Message',
        placeholder: chinese ? '提问' : 'Ask anything',
        send: chinese ? '发送' : 'Send',
        remove: (name) => (chinese ? `移除 ${name}` : `Remove ${name}`),
      },
    },
    sources: [
      { id: 'auth-service', label: 'auth-service.ts', kind: 'file' },
      { id: 'billing-channel', label: 'billing', kind: 'channel' },
      { id: 'dana-whitfield', label: 'Dana Whitfield', kind: 'person' },
      { id: 'api-contract', label: 'api-contract.md', detail: chinese ? '文件' : 'File', kind: 'file' },
      { id: 'engineering-channel', label: 'engineering', detail: chinese ? '频道' : 'Channel', kind: 'channel' },
      { id: 'morgan-lee', label: 'Morgan Lee', detail: chinese ? '人员' : 'Person', kind: 'person' },
      { id: 'deployment-runbook', label: 'deployment-runbook.md', detail: chinese ? '文件' : 'File', kind: 'file' },
    ],
    selectedSourceIds: ['auth-service', 'billing-channel', 'dana-whitfield'],
    maximumSources: 5,
    labels: {
      addContext: chinese ? '添加上下文' : 'Add context',
      sources: chinese ? '上下文来源' : 'Context sources',
      empty: chinese ? '没有可添加的来源。' : 'No sources are available to add.',
    },
    listStrategy: { kind: 'content-grown', expectedMaximum: 12 },
  }
}
