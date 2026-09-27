import type { HbarExtensionWorkspaceLabels } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'

export function extensionNavigationCopy(locale: ShellLocale): HbarExtensionWorkspaceLabels['navigation'] {
  const zh = locale === 'zh-CN'
  return {
    plugins: {
      title: zh ? '插件' : 'Plugins',
      description: zh
        ? '查看此 Host 的插件、详情与启用状态。'
        : 'Inspect plugins, their details and enabled state on this Host.',
      filter: zh ? '筛选插件' : 'Filter plugins',
    },
    skills: {
      title: zh ? '技能' : 'Skills',
      description: zh
        ? '浏览此 Host 已发现的技能与来源目录。'
        : 'Browse skills discovered by this Host and their source folders.',
      filter: zh ? '筛选技能' : 'Filter skills',
    },
  }
}
