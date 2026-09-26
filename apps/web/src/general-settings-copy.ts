import type { WebGeneralSettingsLabels } from './GeneralSettings'
import type { ShellLocale } from './shell-copy'

export function generalSettingsCopy(locale: ShellLocale): WebGeneralSettingsLabels {
  const zh = locale === 'zh-CN'
  const choose = (chinese: string, english: string) => (zh ? chinese : english)
  return {
    group: choose('通用', 'General'),
    title: choose('通用', 'General'),
    description: choose(
      '此设备的界面偏好。不会修改项目或会话的设置。',
      'Interface preferences on this device, independent of project and session settings.',
    ),
    deviceScope: choose('此设备', 'This device'),
    language: choose('显示语言', 'Display language'),
    languageDescription: choose(
      '即时切换界面语言，保留会话草稿、打开的工具和未保存设置。',
      'Switch immediately while keeping conversation drafts, open tools, and unsaved settings.',
    ),
    options: { system: choose('跟随环境', 'Follow environment'), 'en-US': 'English', 'zh-CN': '简体中文' },
    systemPolicy: choose(
      '自动选择环境列表中首个中英文；无匹配时使用简体中文。',
      'Follow the first English or Chinese language in the environment list; default to Simplified Chinese if none matches.',
    ),
    currentLanguage: (current) =>
      choose(
        `当前：${current === 'zh-CN' ? '简体中文' : 'English'}`,
        `Current: ${current === 'zh-CN' ? '简体中文' : 'English'}`,
      ),
    saved: choose('语言已应用并保存到此设备。', 'Language applied and saved on this device.'),
    readError: (code) =>
      code === 'INVALID_PREFERENCE'
        ? choose(
            '保存的语言无效，暂时跟随环境。请选择语言以重新保存。',
            'Saved language is invalid; following the environment for now. Select a language to replace it.',
          )
        : choose(
            '无法读取保存的语言，暂时跟随环境。界面仍可使用。',
            'Could not read the saved language; following the environment for now. The interface is still usable.',
          ),
    saveError: choose(
      '语言已在此窗口应用，但未能保存。重载后可能恢复原语言。',
      'Language applied in this window but could not be saved. Reloading may restore the previous language.',
    ),
    retryRead: choose('重试读取', 'Retry reading'),
    retrySave: choose('重试保存', 'Retry saving'),
  }
}
