import type { HbarExtensionWorkspaceLabels } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'

export function extensionCollectionCopy(locale: ShellLocale): HbarExtensionWorkspaceLabels['collections'] {
  const zh = locale === 'zh-CN'
  const error = (code: string | null, collection: 'plugins' | 'skills') => {
    const name = zh ? (collection === 'plugins' ? '插件列表' : '技能列表') : collection
    if (code === 'CAPABILITY_UNAVAILABLE')
      return zh ? `此宿主尚未提供${name}读取能力。` : `This Host does not provide a ${name} reader.`
    if (code === 'DISCONNECTED' || code === 'CONNECTION_CLOSED')
      return zh ? `${name}未能读取。请连接宿主后重试。` : `Could not read ${name}. Reconnect to the Host and retry.`
    if (code === 'FORBIDDEN' || code === 'UNAUTHORIZED')
      return zh
        ? `当前连接无权读取${name}。请确认宿主授权后重试。`
        : `This connection cannot read ${name}. Check Host access and retry.`
    return zh ? `${name}读取失败，请重试。` : `Could not read ${name}. Please retry.`
  }
  return {
    plugins: {
      notLoaded: zh ? '尚未读取插件列表。' : 'Plugins have not been read yet.',
      loading: zh ? '正在读取插件列表…' : 'Reading plugins…',
      stale: zh
        ? '当前显示上次成功读取的插件，可能已过时。'
        : 'Showing the last successfully read plugins; they may be out of date.',
      retry: zh ? '重试读取插件' : 'Retry plugins',
      error: (code) => error(code, 'plugins'),
    },
    skills: {
      notLoaded: zh ? '尚未读取技能列表。' : 'Skills have not been read yet.',
      loading: zh ? '正在读取技能列表…' : 'Reading skills…',
      stale: zh
        ? '当前显示上次成功读取的技能，可能已过时。'
        : 'Showing the last successfully read skills; they may be out of date.',
      retry: zh ? '重试读取技能' : 'Retry skills',
      error: (code) => error(code, 'skills'),
    },
  }
}
