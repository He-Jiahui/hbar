import type { LumenAiChatAgentsReferenceContent } from '@lumen/app-ui/catalog'

export function createAiChat6ReferenceFixture(locale: 'en' | 'zh' = 'en'): LumenAiChatAgentsReferenceContent {
  const isChinese = locale === 'zh'

  return {
    variant: 6,
    ownerId: 'ai-chat-6:competitive-brief',
    title: isChinese ? '竞品简报' : 'Competitive brief',
    subtitle: isChinese ? 'Planner · 3 个代理' : 'Planner · 3 agents',
    messages: [
      {
        id: 'competitive-brief-request',
        side: 'user',
        parts: [
          {
            kind: 'text',
            text: isChinese
              ? '请整理前三款笔记应用的竞品简报。'
              : 'Put together a competitive brief on the top three note-taking apps.',
          },
        ],
      },
      {
        id: 'planner-scope',
        side: 'assistant',
        author: 'Planner',
        parts: [
          {
            kind: 'text',
            text: isChinese
              ? '我会分两部分完成。Researcher 将收集每款应用的价格和核心功能，Writer 再整理成一页简报。'
              : 'I’ll split this into two parts. Researcher will gather pricing and the core feature set for each app, then Writer will turn that into a one-page brief.',
          },
        ],
      },
      {
        id: 'researcher-comparison',
        side: 'assistant',
        author: 'Researcher',
        parts: [
          {
            kind: 'text',
            text: isChinese
              ? '三款应用都提供免费版本。付费方案每席位每月分别为 8、10 和 12 美元。主要差异是离线同步和端到端加密，只有一款具备加密功能。'
              : 'All three offer a free tier. Paid plans are $8, $10, and $12 per seat each month. The clearest differences are offline sync and end-to-end encryption, which only one app includes.',
          },
        ],
      },
      {
        id: 'privacy-focused-question',
        side: 'user',
        parts: [
          {
            kind: 'text',
            text: isChinese ? '哪一款最适合注重隐私的小团队？' : 'Which one fits a small, privacy-focused team best?',
          },
        ],
      },
      {
        id: 'writer-recommendation',
        side: 'assistant',
        author: 'Writer',
        regenerate: true,
        parts: [
          {
            kind: 'text',
            text: isChinese
              ? '对于重视隐私的小团队，加密应用是更合适的选择。它每席位每月贵一两美元，但它是唯一能确保笔记端到端加密的应用；对于十人以下的团队，价格差异并不明显。'
              : 'For a small team that puts privacy first, the encrypted app is the pick. It runs a dollar or two more per seat, but it is the only one that keeps notes end-to-end encrypted, and the price gap barely registers under ten seats.',
          },
        ],
      },
    ],
    composer: {
      draft: '',
      attachments: [],
      labels: {
        input: isChinese ? '继续对话' : 'Ask anything',
        placeholder: isChinese ? '继续对话' : 'Ask anything',
        send: isChinese ? '发送' : 'Send',
        attach: isChinese ? '添加附件' : 'Add attachment',
        remove: (name) => (isChinese ? `移除 ${name}` : `Remove ${name}`),
      },
    },
    listStrategy: { kind: 'pane-scroll', expectedMaximum: 24 },
    labels: {
      empty: isChinese ? '暂无消息' : 'No messages',
      regenerate: isChinese ? '重新生成' : 'Regenerate',
      copy: isChinese ? '复制回复' : 'Copy reply',
      openArtifact: isChinese ? '打开文件' : 'Open artifact',
      sources: isChinese ? '来源' : 'Sources',
    },
    activityTitle: isChinese ? '活动' : 'Activity',
    activity: [
      {
        id: 'activity-planner-scope',
        label: 'Planner',
        detail: isChinese ? '拆分研究与写作任务' : 'Split the task into research + writing',
        status: isChinese ? '完成' : 'Done',
      },
      {
        id: 'activity-research-pricing',
        label: 'Researcher',
        detail: isChinese ? '收集了 3 款应用的价格' : 'Pulled pricing for 3 apps',
        status: isChinese ? '完成' : 'Done',
      },
      {
        id: 'activity-research-offline-sync',
        label: 'Researcher',
        detail: isChinese ? '比较离线同步支持' : 'Compared offline-sync support',
        status: isChinese ? '完成' : 'Done',
      },
      {
        id: 'activity-research-encryption',
        label: 'Researcher',
        detail: isChinese ? '检查加密覆盖范围' : 'Checked encryption coverage',
        status: isChinese ? '完成' : 'Done',
      },
      {
        id: 'activity-research-free-tier',
        label: 'Researcher',
        detail: isChinese ? '记录免费方案限制' : 'Noted free-tier limits',
        status: isChinese ? '完成' : 'Done',
      },
      {
        id: 'activity-writer-outline',
        label: 'Writer',
        detail: isChinese ? '拟定一页简报大纲' : 'Outlined the one-page brief',
        status: isChinese ? '完成' : 'Done',
      },
      {
        id: 'activity-writer-draft',
        label: 'Writer',
        detail: isChinese ? '撰写比较内容' : 'Drafted the comparison',
        status: isChinese ? '完成' : 'Done',
      },
      {
        id: 'activity-research-sentiment',
        label: 'Researcher',
        detail: isChinese ? '总结用户评价倾向' : 'Summarized review sentiment',
        status: isChinese ? '完成' : 'Done',
      },
      {
        id: 'activity-planner-tradeoff',
        label: 'Planner',
        detail: isChinese ? '指出价格与功能的取舍' : 'Flagged the price trade-off',
        status: isChinese ? '完成' : 'Done',
      },
      {
        id: 'activity-planner-review',
        label: 'Planner',
        detail: isChinese ? '从隐私角度复核内容' : 'Reviewed for a privacy angle',
        status: isChinese ? '完成' : 'Done',
      },
      {
        id: 'activity-writer-recommendation',
        label: 'Writer',
        detail: isChinese ? '正在推荐合适方案' : 'Recommending an option',
        status: isChinese ? '完成' : 'Done',
      },
    ],
  }
}
