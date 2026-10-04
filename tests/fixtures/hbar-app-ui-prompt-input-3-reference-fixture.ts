import type { LumenPromptHeroReferenceContent } from '@lumen/app-ui'

export function createPrompt3ReferenceFixture(locale: 'en' | 'zh' = 'en'): LumenPromptHeroReferenceContent {
  const translated = locale === 'zh'
  return {
    variant: 3,
    ownerId: 'prompt-input-3',
    listStrategy: { kind: 'content-grown', expectedMaximum: 4 },
    title: translated ? '你想构建什么？' : 'What do you want to build?',
    description: translated
      ? '用一句话描述，即可生成可用的初稿。'
      : 'Describe it in a sentence and get a working first draft.',
    composer: {
      draft: '',
      attachments: [],
      labels: {
        input: translated ? '随便问问' : 'Ask anything',
        placeholder: translated ? '随便问问' : 'Ask anything',
        send: translated ? '发送' : 'Send',
        attach: translated ? '添加文件' : 'Attach a file',
        remove: (name) => (translated ? `移除 ${name}` : `Remove ${name}`),
      },
    },
    suggestions: [
      {
        id: 'landing-page',
        label: translated ? '落地页' : 'Landing page',
        draft: translated ? '为产品发布创建一个落地页。' : 'Create a landing page for a product launch.',
        icon: 'page',
      },
      {
        id: 'analytics-dashboard',
        label: translated ? '分析仪表盘' : 'Analytics dashboard',
        draft: translated
          ? '构建一个展示关键产品指标的分析仪表盘。'
          : 'Build an analytics dashboard for key product metrics.',
        icon: 'chart',
      },
      {
        id: 'storefront',
        label: translated ? '在线商店' : 'Storefront',
        draft: translated
          ? '为精选商品系列创建一个在线商店。'
          : 'Create a storefront for a curated product collection.',
        icon: 'store',
      },
      {
        id: 'onboarding-flow',
        label: translated ? '新手引导流程' : 'Onboarding flow',
        draft: translated ? '为新用户设计清晰的新手引导流程。' : 'Design a clear onboarding flow for new users.',
        icon: 'checklist',
      },
    ],
  }
}
