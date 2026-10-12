import type { LumenPromptToolsReferenceContent } from '@lumen/app-ui/catalog'

export function createPrompt2ReferenceFixture(locale: 'en' | 'zh' = 'en'): LumenPromptToolsReferenceContent {
  const translated = locale === 'zh'
  return {
    variant: 2,
    ownerId: 'prompt-input-2',
    listStrategy: { kind: 'content-grown', expectedMaximum: 3 },
    composer: {
      draft: translated
        ? '重构结账流程以使用新的定价服务。保留现有分析事件，添加 10% 灰度发布功能，并为值班工程师编写简短迁移说明，涵盖回滚步骤。'
        : 'Refactor the checkout flow to use the new pricing service. Keep the existing analytics events intact, add a feature flag for a 10% rollout, and write a short migration note for the on-call engineer covering the rollback steps.',
      attachments: [],
      labels: {
        input: translated ? '随便问问' : 'Ask anything',
        placeholder: translated ? '随便问问' : 'Ask anything',
        send: translated ? '发送' : 'Send',
        remove: (name) => (translated ? `移除 ${name}` : `Remove ${name}`),
      },
    },
    models: [
      { id: 'atlas', label: 'Atlas', detail: translated ? '适合编程' : 'Best for coding' },
      { id: 'ember', label: 'Ember', detail: translated ? '快速通用' : 'Fast, general purpose' },
      { id: 'atlas-long', label: 'Atlas Long', detail: translated ? '长上下文' : 'Long context' },
    ],
    modelId: 'atlas',
    searchEnabled: true,
    tokenLabel: '356 / 8K',
    labels: {
      model: (name) => (translated ? `模型：${name}` : `Model: ${name}`),
      search: translated ? '搜索' : 'Search',
    },
    help: translated ? '回复可能不准确：请核实重要内容。' : 'Responses can be inaccurate: check anything important.',
  }
}
