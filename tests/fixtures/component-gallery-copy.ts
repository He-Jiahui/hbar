import type {
  ComponentGalleryCategory,
  ComponentGalleryEntry,
  ComponentGalleryLocale,
} from '../../apps/hbar-app-ui-preview/src/component-gallery-model'

export interface ComponentGalleryCopy {
  readonly title: string
  readonly categoriesHeading: string
  readonly all: string
  readonly search: string
  readonly searchPlaceholder: string
  readonly reset: string
  readonly emptyTitle: string
  readonly emptyDescription: string
  readonly open: string
  readonly previous: string
  readonly next: string
  readonly pagination: string
  readonly theme: string
  readonly language: string
  readonly foundation: string
  readonly categoryLabels: Readonly<Record<ComponentGalleryCategory, string>>
  readonly locales: Readonly<Record<ComponentGalleryLocale, string>>
  readonly catalogCount: (entries: number, categories: number) => string
  readonly resultCount: (first: number, last: number, total: number) => string
  readonly pageCount: (page: number, pages: number) => string
  readonly entryTitle: (entry: ComponentGalleryEntry) => string
  readonly previewTitle: (entry: ComponentGalleryEntry) => string
  readonly openTitle: (entry: ComponentGalleryEntry) => string
}

const chineseCategories: Readonly<Record<ComponentGalleryCategory, string>> = {
  'ai-chat': 'AI 对话',
  'prompt-input': '提示词输入',
  'agent-activity': '智能体活动',
  'tool-calls': '工具调用',
  'agent-approval': '审批与确认',
  'agent-plan': '任务计划',
  'ai-usage': 'AI 用量',
  'app-shell': '应用框架',
  'app-sidebar': '应用侧栏',
  'command-menu': '命令菜单',
  navbar: '顶部导航',
  mobile: '移动端导航',
  card: '卡片',
  'data-table': '数据表格',
  dashboard: '仪表盘',
  analytics: '数据分析',
  list: '列表',
  filtering: '筛选器',
  'file-manager': '文件管理',
  monitoring: '监控',
  'empty-state': '空状态',
  'settings-form': '设置表单',
  forms: '表单',
  'app-dialog': '弹窗与浮层',
  notifications: '通知',
  onboarding: '初次使用引导',
  paywall: '订阅与权限',
  authentication: '身份验证',
  kanban: '看板',
  wizard: '分步流程',
  comments: '评论',
  scheduling: '日程安排',
  integrations: '集成',
  editor: '编辑器',
  feedback: '反馈',
  support: '支持中心',
  billing: '账单',
  chat: '聊天',
}

const englishCategories: Readonly<Record<ComponentGalleryCategory, string>> = {
  'ai-chat': 'AI Chat',
  'prompt-input': 'Prompt Input',
  'agent-activity': 'Agent Activity',
  'tool-calls': 'Tool Calls',
  'agent-approval': 'Agent Approval',
  'agent-plan': 'Agent Plan',
  'ai-usage': 'AI Usage',
  'app-shell': 'App Shell',
  'app-sidebar': 'App Sidebar',
  'command-menu': 'Command Menu',
  navbar: 'Navbar',
  mobile: 'Mobile',
  card: 'Card',
  'data-table': 'Data Table',
  dashboard: 'Dashboard',
  analytics: 'Analytics',
  list: 'List',
  filtering: 'Filtering',
  'file-manager': 'File Manager',
  monitoring: 'Monitoring',
  'empty-state': 'Empty State',
  'settings-form': 'Settings Form',
  forms: 'Forms',
  'app-dialog': 'App Dialog',
  notifications: 'Notifications',
  onboarding: 'Onboarding',
  paywall: 'Paywall',
  authentication: 'Authentication',
  kanban: 'Kanban',
  wizard: 'Wizard',
  comments: 'Comments',
  scheduling: 'Scheduling',
  integrations: 'Integrations',
  editor: 'Editor',
  feedback: 'Feedback',
  support: 'Support',
  billing: 'Billing',
  chat: 'Chat',
}

const chineseEntryTitle = (entry: ComponentGalleryEntry) =>
  `${chineseCategories[entry.category]} ${String(entry.variant).padStart(2, '0')}`

export const componentGalleryCopy: Readonly<Record<ComponentGalleryLocale, ComponentGalleryCopy>> = {
  'zh-CN': {
    title: '组件总览',
    categoriesHeading: '组件类别',
    all: '所有组件',
    search: '搜索组件',
    searchPlaceholder: '搜索名称、类别或组件编号',
    reset: '清除筛选',
    emptyTitle: '没有匹配的组件',
    emptyDescription: '尝试其他名称，或清除筛选查看所有组件。',
    open: '完整预览',
    previous: '上一页',
    next: '下一页',
    pagination: '预览分页',
    theme: '切换深浅色',
    language: '界面语言',
    foundation: '基础控件与动效',
    categoryLabels: chineseCategories,
    locales: { 'zh-CN': '中文', 'en-US': 'English' },
    catalogCount: (entries, categories) => `${categories} 个类别 · ${entries} 个组件变体`,
    resultCount: (first, last, total) => (total ? `第 ${first}–${last} 项，共 ${total} 项` : '0 个组件'),
    pageCount: (page, pages) => `${page} / ${pages}`,
    entryTitle: chineseEntryTitle,
    previewTitle: (entry) => `${chineseEntryTitle(entry)}：可交互预览`,
    openTitle: (entry) => `打开${chineseEntryTitle(entry)}的完整预览`,
  },
  'en-US': {
    title: 'Component gallery',
    categoriesHeading: 'Categories',
    all: 'All components',
    search: 'Search components',
    searchPlaceholder: 'Search names, categories or component IDs',
    reset: 'Clear filters',
    emptyTitle: 'No matching components',
    emptyDescription: 'Try another name, or clear filters to view all components.',
    open: 'Full preview',
    previous: 'Previous',
    next: 'Next',
    pagination: 'Preview pages',
    theme: 'Switch light and dark',
    language: 'Interface language',
    foundation: 'Primitives and motion',
    categoryLabels: englishCategories,
    locales: { 'zh-CN': '中文', 'en-US': 'English' },
    catalogCount: (entries, categories) => `${categories} categories · ${entries} component variants`,
    resultCount: (first, last, total) => (total ? `${first}–${last} of ${total} components` : '0 components'),
    pageCount: (page, pages) => `${page} / ${pages}`,
    entryTitle: (entry) => entry.title,
    previewTitle: (entry) => `${entry.title}: interactive preview`,
    openTitle: (entry) => `Open the full preview for ${entry.title}`,
  },
}
