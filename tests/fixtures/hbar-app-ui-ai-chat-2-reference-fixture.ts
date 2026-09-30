import type { LumenAiChatArtifactReferenceContent } from '@lumen/app-ui'

export function createAiChat2ReferenceFixture(locale: 'en' | 'zh' = 'en'): LumenAiChatArtifactReferenceContent {
  const isChinese = locale === 'zh'
  const copy = isChinese
    ? {
        title: '构建助手',
        subtitle: '草稿',
        prompt: '为营销网站构建一个三档定价表组件。',
        artifactIntroduction:
          '这是一个响应式定价表，包含 Starter、Growth 和 Scale。它遍历 plans 数组，因此你可以修改文案而无需触碰标记。',
        addDescription: '为每个价格添加一条简短的套餐说明。',
        versionThree:
          '已完成。我在价格下方添加了说明行，并为三个等级撰写了文案。这是第 3 版，你可以在侧栏中与早期版本比较。',
        emphasizeMiddle: '你能突出显示中间套餐吗？',
        recommendation:
          '我将 Growth 标记为推荐套餐，而没有依赖颜色：添加了小型“推荐”标签、稍粗的边框和稍多的垂直留白，使它更突出。',
        empty: '暂无消息',
        regenerate: '重新生成',
        copy: '复制',
        openArtifact: '在面板中打开',
        sources: '来源',
        input: '向助手提问',
        placeholder: '问点什么',
        send: '发送',
        attach: '添加附件',
        remove: (name: string) => `移除附件 ${name}`,
        code: '代码',
        document: '文档',
        copyArtifact: '复制产物',
        downloadArtifact: '下载产物',
        emptyArtifact: '此版本没有预览内容。',
      }
    : {
        title: 'Build assistant',
        subtitle: 'Draft',
        prompt: 'Build a three-tier pricing table component for the marketing site.',
        artifactIntroduction:
          'Here is a responsive pricing table with Starter, Growth, and Scale. It maps over a plans array so you can edit copy without touching markup.',
        addDescription: 'Add a short plan description under each price.',
        versionThree:
          'Done. I added a description line beneath each price and wrote the copy for all three tiers. This is version 3, so compare it against the earlier versions from the panel.',
        emphasizeMiddle: 'Can you make the middle plan stand out?',
        recommendation:
          'I marked Growth as the recommended plan without leaning on colour: it now carries a small “Recommended” label, a slightly heavier border, and a touch more vertical padding so it reads as primary.',
        empty: 'No messages',
        regenerate: 'Regenerate',
        copy: 'Copy',
        openArtifact: 'Open in panel',
        sources: 'Sources',
        input: 'Ask anything',
        placeholder: 'Ask anything',
        send: 'Send',
        attach: 'Add attachment',
        remove: (name: string) => `Remove ${name}`,
        code: 'Code',
        document: 'Document',
        copyArtifact: 'Copy artifact',
        downloadArtifact: 'Download artifact',
        emptyArtifact: 'No preview content is available for this version.',
      }

  const code = (versionId: string): string => {
    if (versionId === 'v3') {
      return `type Plan = {
  name: string
  price: string
  period: string
  cta: string
}

export function PricingTable({ plans }: { plans: Plan[] }) {
  return (
    <div className="grid gap-4">
      {plans.map((plan) => (
        <article key={plan.name}>
          <h3>{plan.name}</h3>
          <p>{plan.price}</p>
          <span>{plan.period}</span>
          <button>{plan.cta}</button>
        </article>
      ))}
    </div>
  )
}`
    }
    if (versionId === 'v2') {
      return `type Plan = { name: string; price: string; period: string; cta: string }

export function PricingTable({ plans }: { plans: Plan[] }) {
  return plans.map((plan) => (
    <article key={plan.name}>
      <h3>{plan.name}</h3>
      <p>{plan.price}</p>
      <span>{plan.period}</span>
      <button>{plan.cta}</button>
    </article>
  ))
}`
    }
    return `export function PricingTable() {
  return <p>Pricing plans</p>
}`
  }

  const document = (versionId: string): string => {
    let version = 'v3'
    if (versionId === 'v1') {
      version = 'v1'
    } else if (versionId === 'v2') {
      version = 'v2'
    }
    if (isChinese) {
      return `${version} · 套餐对比\n\nStarter · $0 / month\nGrowth · $19 / month\nScale · $54 / month\n\nGrowth 是推荐套餐。`
    }
    return `${version} · Plan comparison\n\nStarter · $0 / month\nGrowth · $19 / month\nScale · $54 / month\n\nGrowth is the recommended tier.`
  }

  return {
    variant: 2,
    ownerId: 'pricing-table-thread',
    title: copy.title,
    subtitle: copy.subtitle,
    messages: [
      { id: 'pricing-request', side: 'user', parts: [{ kind: 'text', text: copy.prompt }] },
      {
        id: 'pricing-draft',
        side: 'assistant',
        parts: [{ kind: 'text', text: copy.artifactIntroduction }],
        artifact: { id: 'pricing-table.tsx', label: 'pricing-table.tsx' },
      },
      { id: 'pricing-description-request', side: 'user', parts: [{ kind: 'text', text: copy.addDescription }] },
      { id: 'pricing-description-response', side: 'assistant', parts: [{ kind: 'text', text: copy.versionThree }] },
      { id: 'pricing-emphasis-request', side: 'user', parts: [{ kind: 'text', text: copy.emphasizeMiddle }] },
      {
        id: 'pricing-recommendation',
        side: 'assistant',
        parts: [{ kind: 'text', text: copy.recommendation }],
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
    artifact: {
      fileName: 'pricing-table.tsx',
      versions: [
        { id: 'v3', label: 'v3' },
        { id: 'v2', label: 'v2' },
        { id: 'v1', label: 'v1' },
      ],
      selectedVersionId: 'v3',
      mode: 'code',
      code,
      document,
      labels: {
        code: copy.code,
        document: copy.document,
        copy: copy.copyArtifact,
        download: copy.downloadArtifact,
        empty: copy.emptyArtifact,
      },
    },
  }
}
