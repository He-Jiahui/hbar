import type { LumenAiChatEmbeddedReferenceContent } from '@lumen/app-ui/catalog'

export function createAiChat3ReferenceFixture(locale: 'en' | 'zh' = 'en'): LumenAiChatEmbeddedReferenceContent {
  const isChinese = locale === 'zh'
  const copy = isChinese
    ? {
        title: '助手',
        subtitle: '就绪',
        promptOne: '总结最新的发布说明',
        responseOne: '2.4 版改进了新筛选面板、加快了搜索索引，并修复了键盘导航问题。',
        promptTwo: '筛选面板有哪些变化？',
        responseTwo: '它移入了停靠侧栏，新增了保存视图，并会按项目记住你上次的查询。',
        promptThree: '为新筛选器草拟验收标准',
        responseThree: '筛选会立即生效，保存视图按项目保留，每个控件都可通过键盘操作。',
        empty: '暂无消息',
        regenerate: '重新生成',
        copy: '复制',
        openArtifact: '打开产物',
        sources: '来源',
        input: '问点什么',
        placeholder: '问点什么',
        send: '发送',
        remove: (name: string) => `移除附件 ${name}`,
      }
    : {
        title: 'Assistant',
        subtitle: 'Ready',
        promptOne: 'Summarize the latest release notes',
        responseOne:
          'Version 2.4 focused on the new filter panel, faster search indexing, and keyboard-navigation fixes.',
        promptTwo: 'What changed in the filter panel?',
        responseTwo:
          'It moved into a docked sidebar, gained saved views, and now remembers your last query per project.',
        promptThree: 'Draft acceptance criteria for the new filter',
        responseThree:
          'Filters apply instantly, saved views persist per project, and every control stays reachable by keyboard.',
        empty: 'No messages',
        regenerate: 'Regenerate',
        copy: 'Copy',
        openArtifact: 'Open artifact',
        sources: 'Sources',
        input: 'Ask anything',
        placeholder: 'Ask anything',
        send: 'Send',
        remove: (name: string) => `Remove ${name}`,
      }

  return {
    variant: 3,
    ownerId: 'embedded-filter-chat',
    title: copy.title,
    subtitle: copy.subtitle,
    messages: [
      { id: 'release-request', side: 'user', parts: [{ kind: 'text', text: copy.promptOne }] },
      { id: 'release-summary', side: 'assistant', parts: [{ kind: 'text', text: copy.responseOne }] },
      { id: 'filter-question', side: 'user', parts: [{ kind: 'text', text: copy.promptTwo }] },
      { id: 'filter-explanation', side: 'assistant', parts: [{ kind: 'text', text: copy.responseTwo }] },
      { id: 'criteria-request', side: 'user', parts: [{ kind: 'text', text: copy.promptThree }] },
      {
        id: 'criteria-response',
        side: 'assistant',
        parts: [{ kind: 'text', text: copy.responseThree }],
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
  }
}
