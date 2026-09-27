import type { WebGeneralSettingsLabels } from './GeneralSettings'
import type { ShellLocale } from './shell-copy'

export function generalSettingsCopy(locale: ShellLocale): WebGeneralSettingsLabels {
  const zh = locale === 'zh-CN'
  const choose = (chinese: string, english: string) => (zh ? chinese : english)
  return {
    group: choose('通用', 'General'),
    title: choose('通用', 'General'),
    description: choose('界面语言与消息发送方式。', 'Display language and message sending behavior.'),
    deviceScope: choose('设备与 Host', 'Device and Host'),
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
    sending: {
      title: choose('消息发送方式', 'Message Sending'),
      description: choose('选择对话输入框如何发送消息。', 'Choose how the chat composer submits messages.'),
      hostScope: choose(
        '保存到当前 Host 的全局设置；不改变项目或会话设置。',
        'Saved in this Host’s global settings; project and session settings are unchanged.',
      ),
      options: {
        enter: {
          label: choose('Enter 发送', 'Enter sends'),
          description: choose('Shift+Enter 换行。', 'Shift+Enter inserts a new line.'),
        },
        modifierEnter: {
          label: choose('Ctrl/Cmd+Enter 发送', 'Ctrl/Cmd+Enter sends'),
          description: choose('Enter 和 Shift+Enter 都会换行。', 'Enter and Shift+Enter insert new lines.'),
        },
      },
      loading: choose('正在读取 Host 的发送方式…', 'Loading the Host sending behavior…'),
      saved: choose('发送方式已保存到 Host。', 'Sending behavior saved to the Host.'),
      readError: (code) =>
        choose(
          `无法读取 Host 发送方式（${code}）。键盘发送已暂停；仍可点击发送按钮。`,
          `Could not read the Host sending behavior (${code}). Keyboard sending is paused; the Send button remains available.`,
        ),
      saveError: (code) =>
        choose(
          `未能保存新的发送方式（${code}），已恢复上次确认的按键。可重新读取 Host 后再选择。`,
          `The new sending behavior was not saved (${code}); the last confirmed key is restored. Reload the Host value before choosing again.`,
        ),
      unknown: choose(
        '保存回执未确认，键盘发送已暂停。可核对原请求，或用同一请求重试；不会自动再次写入。',
        'The save receipt is unconfirmed, so keyboard sending is paused. Check the original request or retry that same request; no new write is sent automatically.',
      ),
      unsupported: choose(
        '当前 Host 不支持保存发送方式；键盘发送已暂停，请更新 Host。',
        'This Host does not support the sending preference. Keyboard sending is paused until the Host is updated.',
      ),
      retryRead: choose('重新读取 Host 设置', 'Reload Host setting'),
      recheck: choose('核对原回执', 'Check original receipt'),
      retryOriginal: choose('重试同一请求', 'Retry same request'),
    },
  }
}
