export interface WorkbenchAcceptanceCopy {
  readonly title: string
  readonly description: string
  readonly controls: string
  readonly theme: string
  readonly motion: string
  readonly glow: string
  readonly reading: string
  readonly paragraph: string
  readonly actions: string
  readonly primary: string
  readonly secondary: string
  readonly lightweight: string
  readonly running: string
  readonly completed: string
  readonly empty: string
  readonly failed: string
  readonly summary: string
  readonly filename: string
  readonly command: string
  readonly details: string
  readonly copy: string
  readonly copied: string
  readonly copyFailed: string
  readonly toolbar: string
  readonly more: string
  readonly send: string
  readonly permission: string
  readonly model: string
  readonly reasoning: string
  readonly project: string
  readonly navigation: string
  readonly longTitle: string
  readonly dialog: string
  readonly dialogBody: string
  readonly close: string
  readonly records: string
  readonly unavailable: string
  readonly duration: string
  readonly toggleRun: string
}

export const workbenchAcceptanceCopy: Readonly<Record<'zh-CN' | 'en-US', WorkbenchAcceptanceCopy>> = {
  'zh-CN': {
    title: 'hbar · 工作台视觉验收',
    description: '使用真实 Lumen 组件的交互样例。此页数据是验收素材；生产页面截图与真实本地 Host 验证单独记录。',
    controls: '预览设置',
    theme: '切换明暗',
    motion: '启用动效',
    glow: '启用发光',
    reading: '对话优先，连续阅读',
    paragraph:
      '工具状态通过语义颜色区分，正文以清晰排版建立层级。长说明自然换行，技术内容在自己的区域滚动；导航标题保持左对齐并从末尾裁剪。控件文字始终完整单行，空间不足时移到更多菜单。',
    actions: '三种动作样式',
    primary: '主要操作',
    secondary: '次要操作',
    lightweight: '轻量操作',
    running: '进行中',
    completed: '已完成',
    empty: '无结果',
    failed: '失败',
    summary: '检查文本与组件边界',
    filename: 'packages/app-react/src/session-message.tsx',
    command: 'Get-Content -LiteralPath packages/app-react/src/session-message.tsx -Raw -Encoding UTF8',
    details: '完整原文',
    copy: '复制原文',
    copied: '已复制',
    copyFailed: '未能写入剪贴板，请重试。',
    toolbar: '输入操作',
    more: '更多操作',
    send: '发送',
    permission: '逐次询问 · 服务端默认',
    model: '模型选择',
    reasoning: '推理强度',
    project: '当前工程',
    navigation: '导航标题裁剪',
    longTitle: '重新设计整个 hbar 工作台及所有组件，并验证极长中文会话名称的布局承载能力',
    dialog: '确认会话设置',
    dialogBody:
      '会话“重新设计 hbar 工作台及所有通用组件”将采用新的执行设置。此处是多行弹窗正文，内容应根据窗口宽度自然换行。即使包含很长的工程名称或路径，也应保留完整文字，避免整页横向滚动。',
    close: '关闭',
    records: '紧凑记录与真实缺失值',
    unavailable: '未提供',
    duration: '耗时',
    toggleRun: '切换运行状态',
  },
  'en-US': {
    title: 'hbar · Workbench acceptance',
    description:
      'Interactive samples using real Lumen components. Data here is authored acceptance material; production screenshots and local Host checks are recorded separately.',
    controls: 'Preview settings',
    theme: 'Switch theme',
    motion: 'Enable motion',
    glow: 'Enable glow',
    reading: 'A continuous, conversation-first reading surface',
    paragraph:
      'Semantic color distinguishes tool outcomes while typography establishes reading hierarchy. Descriptions wrap naturally, technical content scrolls in its own region, and navigation titles align left and clip at the end. Complete single-line controls move to More when capacity is limited.',
    actions: 'Three action styles',
    primary: 'Primary action',
    secondary: 'Secondary action',
    lightweight: 'Lightweight action',
    running: 'In progress',
    completed: 'Completed',
    empty: 'No results',
    failed: 'Failed',
    summary: 'Inspect text and component boundaries',
    filename: 'packages/app-react/src/session-message.tsx',
    command: 'Get-Content -LiteralPath packages/app-react/src/session-message.tsx -Raw -Encoding UTF8',
    details: 'Full original content',
    copy: 'Copy original',
    copied: 'Copied',
    copyFailed: 'Could not write to the clipboard. Try again.',
    toolbar: 'Composer actions',
    more: 'More actions',
    send: 'Send',
    permission: 'Ask each time · Server default',
    model: 'Choose model',
    reasoning: 'Reasoning effort',
    project: 'Current project',
    navigation: 'Clipped navigation title',
    longTitle:
      'Redesign the entire hbar workbench and all reusable components and verify exceptionally long session titles',
    dialog: 'Confirm session settings',
    dialogBody:
      'The session “Redesign the hbar workbench and all reusable components” will use the updated execution settings. This dialog contains reading text that wraps naturally with the window. Preserve the entire description, including long project names and paths, without introducing page-wide horizontal scrolling.',
    close: 'Close',
    records: 'Compact records and absent values',
    unavailable: 'Not provided',
    duration: 'Duration',
    toggleRun: 'Toggle running state',
  },
}
