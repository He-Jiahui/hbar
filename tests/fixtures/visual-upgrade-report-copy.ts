export interface VisualUpgradeReportCopy {
  readonly title: string
  readonly description: string
  readonly family: string
  readonly locale: string
  readonly theme: string
  readonly width: string
  readonly before: string
  readonly after: string
  readonly loading: string
  readonly failed: string
  readonly missing: string
  readonly retry: string
  readonly provenance: string
  readonly acceptance: string
  readonly locales: Readonly<Record<'zh-CN' | 'en-US', string>>
  readonly themes: Readonly<Record<'dark' | 'light', string>>
  readonly families: Readonly<Record<string, string>>
}

const families = {
  conversation: ['对话与输入', 'Conversation and composer'],
  'settings-general': ['常规设置', 'General settings'],
  'settings-appearance': ['外观设置', 'Appearance settings'],
  'settings-model': ['模型设置', 'Model settings'],
  'settings-session': ['会话设置', 'Session settings'],
  'settings-providers': ['服务商设置', 'Provider settings'],
  'settings-sandbox': ['执行策略', 'Execution policy'],
  'settings-storage': ['存储位置', 'Storage locations'],
  'settings-chat-database': ['聊天数据库', 'Chat database'],
  'settings-skills': ['技能设置', 'Skill settings'],
  'settings-extensions': ['扩展设置', 'Extension settings'],
  'settings-usage': ['用量设置', 'Usage settings'],
  'settings-diagnostics': ['诊断设置', 'Diagnostics settings'],
  'run-board': ['运行看板', 'Run board'],
  schedules: ['排期', 'Schedules'],
  'prompt-templates': ['提示词模板', 'Prompt templates'],
  onboarding: ['首次配置', 'Setup'],
  notifications: ['通知', 'Notifications'],
  'status-center': ['状态中心', 'Status center'],
  'chat-search': ['聊天搜索', 'Chat search'],
  'session-files': ['工程文件', 'Project files'],
  'session-activity': ['活动', 'Activity'],
  'session-monitoring': ['会话状态', 'Session status'],
  'session-agents': ['Agent', 'Agents'],
  'session-goals': ['目标与计划', 'Goals and plans'],
  'session-settings': ['会话设置面板', 'Session settings pane'],
} satisfies Readonly<Record<string, readonly [string, string]>>

export function visualUpgradeReportCopy(locale: 'zh-CN' | 'en-US'): VisualUpgradeReportCopy {
  const localizedFamilies = Object.fromEntries(
    Object.entries(families).map(([id, names]) => [id, names[locale === 'zh-CN' ? 0 : 1]]),
  )
  return locale === 'zh-CN'
    ? {
        title: 'hbar · 全界面前后对照',
        description:
          '同一组本地 Host 验收内容的真实页面截图。选择页面、语言、主题和窗口宽度；截图是静态证据，交互行为由独立验收预览和浏览器场景验证。',
        family: '页面',
        locale: '语言',
        theme: '主题',
        width: '窗口宽度',
        before: '改造前',
        after: '改造后',
        loading: '正在读取截图记录…',
        failed: '无法读取验收截图，请重新生成或重试。',
        missing: '此组合没有截图。详细覆盖范围见验收记录。',
        retry: '重新读取',
        provenance: '代码版本',
        acceptance: '打开交互验收预览',
        locales: { 'zh-CN': '中文', 'en-US': 'English' },
        themes: { dark: '深色', light: '浅色' },
        families: localizedFamilies,
      }
    : {
        title: 'hbar · Interface comparison',
        description:
          'Real page captures using the same local Host fixture. Choose a page, language, theme and window width. These images are static evidence; the interactive preview and browser scenarios validate behavior separately.',
        family: 'Page',
        locale: 'Language',
        theme: 'Theme',
        width: 'Window width',
        before: 'Before',
        after: 'After',
        loading: 'Loading capture records…',
        failed: 'Capture evidence is unavailable. Regenerate the evidence or retry.',
        missing: 'No capture for this combination. See the validation record for coverage.',
        retry: 'Reload records',
        provenance: 'Source revision',
        acceptance: 'Open interactive acceptance',
        locales: { 'zh-CN': '中文', 'en-US': 'English' },
        themes: { dark: 'Dark', light: 'Light' },
        families: localizedFamilies,
      }
}
