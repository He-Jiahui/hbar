import type { LumenAiChatModelsReferenceContent } from '@lumen/app-ui'

export function createAiChat9ReferenceFixture(locale: 'en' | 'zh' = 'en'): LumenAiChatModelsReferenceContent {
  const chinese = locale === 'zh'
  const models = chinese
    ? [
        { id: 'auto', label: '自动', badge: '推荐', detail: 'Northwind AI' },
        { id: 'atlas', label: 'Atlas', detail: 'Meridian Labs' },
        { id: 'atlas-long', label: 'Atlas Long', badge: '100 万上下文', detail: 'Meridian Labs' },
        { id: 'quill', label: 'Quill', detail: 'Meridian Labs' },
        { id: 'ember', label: 'Ember', detail: 'Orbital' },
        { id: 'wren', label: 'Wren', badge: '本地运行', detail: 'Orbital' },
      ]
    : [
        { id: 'auto', label: 'Auto', badge: 'Recommended', detail: 'Northwind AI' },
        { id: 'atlas', label: 'Atlas', detail: 'Meridian Labs' },
        { id: 'atlas-long', label: 'Atlas Long', badge: '1M context', detail: 'Meridian Labs' },
        { id: 'quill', label: 'Quill', detail: 'Meridian Labs' },
        { id: 'ember', label: 'Ember', detail: 'Orbital' },
        { id: 'wren', label: 'Wren', badge: 'On device', detail: 'Orbital' },
      ]
  const subtitles = chinese
    ? {
        auto: '自动选择 · 均衡',
        atlas: 'Atlas · 均衡',
        'atlas-long': 'Atlas Long · 1M 上下文',
        quill: 'Quill · 快速',
        ember: 'Ember · 快速',
        wren: 'Wren · 本地运行',
      }
    : {
        auto: 'Auto · Balanced',
        atlas: 'Atlas · Balanced',
        'atlas-long': 'Atlas Long · 1M context',
        quill: 'Quill · Fast',
        ember: 'Ember · Fast',
        wren: 'Wren · On device',
      }
  const disclaimers = chinese
    ? {
        auto: '自动选择会根据请求决定模型。回答可能有误，请核对重要信息。',
        atlas: 'Atlas 由 Meridian Labs 提供。回答可能有误，请核对重要信息。',
        'atlas-long': 'Atlas Long 由 Meridian Labs 提供。回答可能有误，请核对重要信息。',
        quill: 'Quill 由 Meridian Labs 提供。回答可能有误，请核对重要信息。',
        ember: 'Ember 由 Orbital 提供。回答可能有误，请核对重要信息。',
        wren: 'Wren 在本地设备上运行。回答可能有误，请核对重要信息。',
      }
    : {
        auto: 'Automatic selection chooses a model for each request. Answers can be wrong, so check anything that matters.',
        atlas: 'Atlas runs on Meridian Labs. Answers can be wrong, so check anything that matters.',
        'atlas-long': 'Atlas Long runs on Meridian Labs. Answers can be wrong, so check anything that matters.',
        quill: 'Quill runs on Meridian Labs. Answers can be wrong, so check anything that matters.',
        ember: 'Ember runs on Orbital. Answers can be wrong, so check anything that matters.',
        wren: 'Wren runs on your device. Answers can be wrong, so check anything that matters.',
      }

  return {
    variant: 9,
    ownerId: 'ai-chat-9-reference',
    title: chinese ? 'Depot 运力模型' : 'Depot capacity model',
    subtitle: chinese ? 'Atlas · 均衡' : 'Atlas · Balanced',
    messages: chinese
      ? [
          {
            id: 'depot-q1',
            side: 'user',
            parts: [{ kind: 'text', text: '我们的 Depot 运力模型在周二偏差大约 8%。应该先检查什么？' }],
          },
          {
            id: 'depot-a1',
            side: 'assistant',
            parts: [
              {
                kind: 'text',
                text: '周二是唯一一个在夜间对账完成前读取承运商数据的日期，因此部分周一晚到的记录被重复计入。请先检查 loaders/carrier_feed.py 中的读取时间窗口，再将最近四个周二的对账总数与原始数据进行比较。',
              },
            ],
          },
          { id: 'depot-q2', side: 'user', parts: [{ kind: 'text', text: '有道理。起草修复方案并列出变更。' }] },
          {
            id: 'depot-a2',
            side: 'assistant',
            parts: [
              {
                kind: 'text',
                text: '补丁会将读取截止时间调整为 04:00，确保发生在对账完成之后，删除旧窗口导致的重复记录，并增加一个重放四周周二数据的回归测试。加载器之外没有其他改动；上周总量的偏差会回到 0.3% 以内。',
              },
            ],
          },
          {
            id: 'depot-q3',
            side: 'user',
            parts: [{ kind: 'text', text: '如果对账延迟完成，测试也能发现反向情况吗？' }],
          },
          {
            id: 'depot-a3',
            side: 'assistant',
            parts: [
              {
                kind: 'text',
                text: '可以。测试夹具会参数化对账完成时间，因此如果任务在 05:10 完成，行数不符会导致测试失败，而不是静默通过。我还保留了旧窗口的功能开关一个版本，便于切换前在预发布环境对比输出。',
              },
            ],
          },
        ]
      : [
          {
            id: 'depot-q1',
            side: 'user',
            parts: [
              {
                kind: 'text',
                text: 'Our depot capacity model is off by roughly 8% on Tuesdays. Where should I look first?',
              },
            ],
          },
          {
            id: 'depot-a1',
            side: 'assistant',
            parts: [
              {
                kind: 'text',
                text: "Tuesday is the only day the model reads the carrier feed before the overnight reconciliation finishes, so a slice of Monday's late arrivals is counted twice. Start with the ingest window in loaders/carrier_feed.py, then compare the reconciled totals for the last four Tuesdays against the raw feed.",
              },
            ],
          },
          {
            id: 'depot-q2',
            side: 'user',
            parts: [{ kind: 'text', text: 'Makes sense. Draft the fix and list what it changes.' }],
          },
          {
            id: 'depot-a2',
            side: 'assistant',
            parts: [
              {
                kind: 'text',
                text: "The patch moves the ingest cutoff to 04:00 so it always lands after reconciliation, drops the duplicate rows that the old window let through, and adds a regression test that replays four weeks of Tuesday feeds. Nothing outside the loader changes, and last week's totals fall back in line to within 0.3%.",
              },
            ],
          },
          {
            id: 'depot-q3',
            side: 'user',
            parts: [
              { kind: 'text', text: 'Does the test catch the reverse case, where reconciliation finishes late?' },
            ],
          },
          {
            id: 'depot-a3',
            side: 'assistant',
            parts: [
              {
                kind: 'text',
                text: 'It does. The fixture parametrises the reconciliation finish time, so a run that lands at 05:10 fails on row counts instead of passing quietly. I also kept the old window behind a flag for one release, which lets you diff both outputs on staging before the cutover.',
              },
            ],
          },
        ],
    composer: {
      draft: '',
      attachments: [],
      labels: {
        input: chinese ? '消息' : 'Message',
        placeholder: chinese ? '回复，或在下方选择其他模型' : 'Reply, or pick a different model below',
        send: chinese ? '发送' : 'Send',
        attach: chinese ? '附加文件' : 'Attach a file',
        remove: (name) => (chinese ? `移除 ${name}` : `Remove ${name}`),
      },
    },
    listStrategy: { kind: 'pane-scroll', expectedMaximum: 80 },
    labels: {
      empty: chinese ? '暂无消息' : 'No messages',
      regenerate: chinese ? '重新生成' : 'Regenerate',
      copy: chinese ? '复制' : 'Copy',
      openArtifact: chinese ? '打开文件' : 'Open file',
      sources: chinese ? '来源' : 'Sources',
    },
    models,
    selectedModelId: 'atlas',
    modelLabel: chinese ? '模型' : 'Model',
    modelSubtitle: (modelId) => subtitles[modelId as keyof typeof subtitles] ?? '',
    disclaimer: (modelId) => disclaimers[modelId as keyof typeof disclaimers] ?? '',
  }
}
