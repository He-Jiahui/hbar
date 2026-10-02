export interface VisualLanguageCopy {
  readonly title: string
  readonly catalog: string
  readonly description: string
  readonly theme: string
  readonly glow: string
  readonly motion: string
  readonly size: string
  readonly finish: string
  readonly start: string
  readonly focus: string
  readonly variants: Readonly<Record<'contained' | 'outlined' | 'text', string>>
  readonly tones: Readonly<Record<'neutral' | 'info' | 'success' | 'warning' | 'danger', string>>
  readonly sizes: Readonly<Record<'s' | 'm' | 'l', string>>
  readonly states: {
    readonly idle: string
    readonly selected: string
    readonly running: string
    readonly disabled: string
    readonly failed: string
  }
  readonly controls: string
  readonly input: string
  readonly value: string
  readonly error: string
  readonly errorMessage: string
  readonly check: string
  readonly toggle: string
  readonly range: string
  readonly native: string
  readonly materials: string
  readonly glass: string
  readonly frost: string
  readonly solid: string
}

export const visualLanguageCopy: Readonly<Record<'zh-CN' | 'en-US', VisualLanguageCopy>> = {
  'zh-CN': {
    title: '形态清晰，光随交互呼吸',
    catalog: '查看所有组件',
    description: '悬停、聚焦和选中在 240ms 内连续变化；按下与释放为 120ms。运行以 2.6s 呼吸，文字与布局保持稳定。',
    theme: '切换浅色与暗色',
    glow: '启用装饰发光',
    motion: '启用动态效果',
    size: '全局控件尺寸',
    finish: '完成当前执行',
    start: '开始执行',
    focus: '聚焦主要动作',
    variants: { contained: '实色 · 主要动作', outlined: '描边 · 次要动作', text: '仅文本 · 辅助动作' },
    tones: { neutral: '应用当前设置', info: '查看详情', success: '确认完成', warning: '检查变更', danger: '删除项目' },
    sizes: { s: '小号', m: '中号', l: '大号' },
    states: {
      idle: '未悬停：应用并重新加载当前工作区中的所有模型设置',
      selected: '选中当前选项',
      running: '正在执行',
      disabled: '暂不可用',
      failed: '执行失败',
    },
    controls: '输入与选择控件',
    input: '工作区名称及完整说明：长中文内容自然换行',
    value: '我的工作区',
    error: '需要校正的工作区路径',
    errorMessage: '路径不可用，请检查后重试。',
    check: '启用完整上下文与附件检索',
    toggle: '自动同步当前工作区',
    range: '交互强度',
    native: 'MUI 原生形态',
    materials: '保留三种表面材质',
    glass: '玻璃',
    frost: '磨砂',
    solid: '实色',
  },
  'en-US': {
    title: 'Clear shapes, light that breathes with interaction',
    catalog: 'View all components',
    description:
      'Hover, focus and selection change continuously over 240ms; press and release take 120ms. Running light breathes over 2.6s while text and layout stay stable.',
    theme: 'Switch light and dark',
    glow: 'Enable decorative glow',
    motion: 'Enable motion',
    size: 'Global control size',
    finish: 'Complete current run',
    start: 'Start run',
    focus: 'Focus the primary action',
    variants: { contained: 'Contained · primary', outlined: 'Outlined · secondary', text: 'Text · supporting' },
    tones: {
      neutral: 'Apply settings',
      info: 'View details',
      success: 'Confirm completion',
      warning: 'Review changes',
      danger: 'Delete project',
    },
    sizes: { s: 'Small', m: 'Medium', l: 'Large' },
    states: {
      idle: 'Resting: apply and reload all model settings in this workspace',
      selected: 'Select this option',
      running: 'Running',
      disabled: 'Unavailable',
      failed: 'Run failed',
    },
    controls: 'Fields and choice controls',
    input: 'Workspace name and full description: long content wraps naturally',
    value: 'My workspace',
    error: 'Workspace path to correct',
    errorMessage: 'The path is unavailable. Check it and retry.',
    check: 'Include full context and attachment search',
    toggle: 'Automatically sync this workspace',
    range: 'Interaction strength',
    native: 'Native MUI shapes',
    materials: 'Three surface materials',
    glass: 'Glass',
    frost: 'Frost',
    solid: 'Solid',
  },
}
