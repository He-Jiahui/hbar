import type { StorageLocationLabels } from '@hbar/app-react/storage-locations'
import { getShellCopy, type ShellLocale } from './shell-copy'

export function storageLocationCopy(locale: ShellLocale): StorageLocationLabels {
  const choose = (zh: string, en: string) => (locale === 'zh-CN' ? zh : en)
  const names: Readonly<Record<string, string>> = {
    'i18n:storage.dataRoot': choose('.hbar 数据目录', '.hbar data directory'),
    'i18n:storage.cacheRoot': choose('缓存目录', 'Cache directory'),
    'i18n:storage.settingsRoot': choose('配置目录', 'Configuration directory'),
    'i18n:storage.sessionsRoot': choose('Session 会话记录目录', 'Session history directory'),
    'i18n:storage.skillsRoot': choose('全局 Skills 目录', 'Global skills directory'),
  }
  return {
    title: choose('存储位置', 'Storage locations'),
    description: choose(
      '目录可以位于其他磁盘。保存后，Host 重启时复制现有数据并切换目录；原文件保留，缓存无需复制。请填写完整绝对路径。',
      'Directories may be on another drive. After saving, restarting the Host copies existing data and switches directories. Original files are preserved; cache is recreated. Enter absolute paths.',
    ),
    pointer: choose('用户目录中的引导文件', 'Bootstrap file in the user directory'),
    active: (path) => choose(`当前使用：${path}`, `Currently using: ${path}`),
    saved: choose('存储位置已保存并生效。', 'Storage locations are saved and active.'),
    pending: choose(
      '新位置已保存；重启 Host 后复制数据并生效。',
      'New locations are saved. Restart the Host to copy data and apply them.',
    ),
    loading: choose('正在读取存储位置…', 'Loading storage locations…'),
    save: choose('保存存储位置', 'Save storage locations'),
    discard: choose('放弃更改', 'Discard changes'),
    reload: choose('重新读取', 'Reload'),
    reconcile: choose('核对保存结果', 'Check save result'),
    retryOriginal: choose('重试原保存请求', 'Retry original save'),
    unknown: choose(
      '保存结果尚未确认。请先核对结果；未保存的编辑仍保留。',
      'The save result is unconfirmed. Check the result first; your edits are preserved.',
    ),
    restart: choose('重启 Host', 'Restart Host'),
    restarting: choose('正在重启 Host…', 'Restarting Host…'),
    manualRestart: choose(
      '当前 Host 未启用自动重启，请关闭并重新启动 Host。',
      'This Host cannot restart automatically. Close and start the Host again.',
    ),
    error: (code) => {
      if (code === 'STORAGE_CONFLICT')
        return choose(
          '存储设置已被修改。重新读取后检查保留的草稿再保存。',
          'Storage settings changed. Reload, review the preserved draft, then save.',
        )
      if (code === 'STORAGE_PATH_INVALID')
        return choose('请输入完整的绝对目录路径。', 'Enter complete absolute directory paths.')
      if (code === 'STORAGE_PATH_OVERLAP')
        return choose(
          '目录存在重叠。缓存、配置、会话和技能需要独立位置；新位置不能位于待迁移的旧目录中。',
          'Directories overlap. Cache, configuration, sessions and skills need separate locations; new locations cannot be inside migration sources.',
        )
      if (code === 'BUSY' || code === 'STORAGE_BUSY')
        return choose('请先等待当前运行或存储操作结束。', 'Wait for the current run or storage operation to finish.')
      return choose(
        `存储操作未完成（${code}），编辑已保留。`,
        `Storage operation did not finish (${code}); edits are preserved.`,
      )
    },
    form: {
      ...getShellCopy(locale).settings.form,
      resolve: (key) => names[key] ?? key,
      componentUnavailable: () => choose('此目录编辑器暂不可用。', 'This directory editor is unavailable.'),
    },
  }
}
