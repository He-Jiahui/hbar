import type { HbarExtensionWorkspaceLabels } from '@hbar/app-react'

export function extensionDetailCopy(
  locale: 'zh-CN' | 'en-US',
): Pick<HbarExtensionWorkspaceLabels, 'filter' | 'noMatches' | 'inspect' | 'pagination' | 'detail'> {
  const zh = locale === 'zh-CN'
  const choose = <Value>(chinese: Value, english: Value): Value => (zh ? chinese : english)
  const number = new Intl.NumberFormat(locale)
  const pagination: HbarExtensionWorkspaceLabels['pagination'] = {
    previous: choose('上一页', 'Previous page'),
    next: choose('下一页', 'Next page'),
    page: (page, pages, count) =>
      choose(
        `第 ${number.format(page)} / ${number.format(pages)} 页 · ${number.format(count)} 项`,
        `Page ${number.format(page)} of ${number.format(pages)} · ${number.format(count)} items`,
      ),
  }
  return {
    filter: choose('筛选插件与技能', 'Filter plugins and skills'),
    noMatches: choose('没有匹配项。', 'No matching items.'),
    inspect: (name) => choose(`查看 ${name} 的详情`, `View ${name} details`),
    pagination,
    detail: {
      title: choose('插件详情', 'Plugin details'),
      back: choose('返回插件列表', 'Back to plugin list'),
      retry: choose('重新加载详情', 'Reload details'),
      loading: choose('正在加载插件详情…', 'Loading plugin details…'),
      missing: choose(
        '此插件已不在当前 Host 中。返回列表并刷新以查看最新状态。',
        'This plugin is no longer on the current Host. Return to the list and refresh to see the current state.',
      ),
      readOnly: choose(
        '这里只展示插件报告的贡献，不会执行命令。启用或禁用请返回列表。',
        'These are reported contributions, not executable actions. Return to the list to enable or disable this plugin.',
      ),
      required: choose(
        '此插件为 Host 必需，不能在此禁用。',
        'This plugin is required by the Host and cannot be disabled here.',
      ),
      commands: choose('命令', 'Commands'),
      commandUsage: choose('命令用法', 'Command usage'),
      services: choose('提供的服务', 'Provided services'),
      requires: choose('依赖的服务', 'Required services'),
      panels: choose('声明的面板', 'Declared panels'),
      renderers: choose('声明的渲染器', 'Declared renderers'),
      source: choose('来源', 'Source'),
      installation: choose('安装范围', 'Installation scope'),
      runtime: choose('运行范围', 'Runtime scope'),
      project: choose('所属项目', 'Project'),
      notReported: choose('未提供此信息', 'Not reported'),
      declared: choose(
        '声明并不保证当前客户端已加载这些界面。',
        'A declaration does not guarantee that this client has loaded the interface.',
      ),
      emptyCommands: choose('此插件未报告命令。', 'This plugin reports no commands.'),
      status: {
        active: choose('已启用', 'Active'),
        disabled: choose('已禁用', 'Disabled'),
        failed: choose('失败', 'Failed'),
      },
      installScope: { global: choose('Host 全局', 'Host-wide'), project: choose('项目', 'Project') },
      runtimeScope: {
        host: 'Host',
        workspace: choose('工作区', 'Workspace'),
        session: choose('会话', 'Session'),
        run: choose('运行', 'Run'),
        client: choose('客户端', 'Client'),
      },
      metadata: (id, version) => choose(`${id} · 版本 ${version}`, `${id} · Version ${version}`),
      error: (code) =>
        code === 'CANCELLED'
          ? choose(
              '已停止加载。可以重新加载此插件的详情。',
              'Loading stopped. Reload this plugin’s details to try again.',
            )
          : choose(`无法加载详情（${code}）。请重试。`, `Could not load details (${code}). Try again.`),
      count: (count) => number.format(count),
      pagination,
    },
  }
}
