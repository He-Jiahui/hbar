import type { LumenAiChatContextReferenceContent } from '@lumen/app-ui'

export function createAiChat4ReferenceFixture(locale: 'en' | 'zh' = 'en'): LumenAiChatContextReferenceContent {
  const isChinese = locale === 'zh'
  const copy = isChinese
    ? {
        title: '入门流程分析',
        modelLabel: '模型：',
        contextLabel: '12.4k / 32k 令牌',
        settingsLabel: '对话设置',
        firstPrompt: '将我们的入门完成率与上一季度进行比较。',
        firstResponse:
          '完成率从 63% 提升到 71%。最大改善来自缩短设置步骤，使创建首个项目的中位时间从九分钟降至五分钟。',
        secondPrompt: '用户仍会在哪一步放弃？',
        secondResponse:
          '剩余的主要流失发生在邀请队友这一步：22% 的用户没有邀请任何人。根据最近一次实验，将这一步设为可选可能再提升三到四个百分点。',
        thirdPrompt: '为每周更新草拟一句摘要。',
        thirdResponse:
          '本季度入门完成率达到 71%，提升八个百分点，主要得益于更快的设置流程；接下来应改进邀请队友这一步。',
        empty: '暂无消息',
        regenerate: '重新生成',
        copy: '复制',
        openArtifact: '打开产物',
        sources: '来源',
        input: '向助手提问',
        placeholder: '问点什么',
        send: '发送',
        attach: '添加附件',
        remove: (name: string) => `移除附件 ${name}`,
      }
    : {
        title: 'Onboarding analysis',
        modelLabel: 'Model:',
        contextLabel: '12.4k / 32k tokens',
        settingsLabel: 'Conversation settings',
        firstPrompt: 'Compare our onboarding completion rate to last quarter.',
        firstResponse:
          'Completion rose to 71%, up from 63% last quarter. The largest gain came from the shortened setup step, which cut median time to first project from nine minutes to five.',
        secondPrompt: 'Where do people still drop off?',
        secondResponse:
          'The biggest remaining drop is at the invite-teammates step, where 22% leave without adding anyone. Making that step optional would likely lift completion by another three to four points based on the last experiment.',
        thirdPrompt: 'Draft a one-line summary for the weekly update.',
        thirdResponse:
          'Onboarding completion reached 71% this quarter, up eight points, driven by a faster setup step; the invite step is the next place to improve.',
        empty: 'No messages',
        regenerate: 'Regenerate',
        copy: 'Copy',
        openArtifact: 'Open artifact',
        sources: 'Sources',
        input: 'Ask anything',
        placeholder: 'Ask anything',
        send: 'Send',
        attach: 'Add attachment',
        remove: (name: string) => `Remove ${name}`,
      }

  return {
    variant: 4,
    ownerId: 'onboarding-analysis',
    title: copy.title,
    messages: [
      { id: 'onboarding-compare', side: 'user', parts: [{ kind: 'text', text: copy.firstPrompt }] },
      { id: 'onboarding-results', side: 'assistant', parts: [{ kind: 'text', text: copy.firstResponse }] },
      { id: 'onboarding-dropoff-question', side: 'user', parts: [{ kind: 'text', text: copy.secondPrompt }] },
      { id: 'onboarding-dropoff-analysis', side: 'assistant', parts: [{ kind: 'text', text: copy.secondResponse }] },
      { id: 'onboarding-summary-request', side: 'user', parts: [{ kind: 'text', text: copy.thirdPrompt }] },
      {
        id: 'onboarding-summary',
        side: 'assistant',
        parts: [{ kind: 'text', text: copy.thirdResponse }],
        regenerate: true,
      },
    ],
    composer: {
      draft: '',
      attachments: [],
      labels: {
        input: copy.input,
        placeholder: copy.placeholder,
        send: copy.send,
        attach: copy.attach,
        remove: copy.remove,
      },
    },
    listStrategy: { kind: 'pane-scroll', expectedMaximum: 24 },
    labels: {
      empty: copy.empty,
      regenerate: copy.regenerate,
      copy: copy.copy,
      openArtifact: copy.openArtifact,
      sources: copy.sources,
    },
    models: [
      { id: 'atlas', label: 'Atlas' },
      { id: 'sage', label: 'Sage' },
      { id: 'nova', label: 'Nova' },
    ],
    selectedModelId: 'atlas',
    modelLabel: copy.modelLabel,
    contextLabel: copy.contextLabel,
    contextRatio: 0.3875,
    settingsLabel: copy.settingsLabel,
  }
}
