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
        '以下是插件报告的贡献，查看详情不会执行这些命令。',
        'The contributions below are reported by the plugin. Viewing them does not execute their commands.',
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
      actions: {
        title: choose('插件启停', 'Plugin activation'),
        scope: choose(
          '更改当前 Host 上的此插件；安装与运行范围见上方。',
          'Change this plugin on the current Host; installation and runtime scopes are shown above.',
        ),
        enable: choose('启用插件', 'Enable plugin'),
        disable: choose('禁用插件', 'Disable plugin'),
        pending: choose('正在更改插件…', 'Changing plugin…'),
        confirmed: choose('Host 已确认本次更改。', 'The Host confirmed this change.'),
        unknown: choose(
          '尚无法确认原操作。可读取当前状态，但不会重新发送更改。',
          'The original operation is still unconfirmed. You can read the current state; the change will not be resent.',
        ),
        readCurrent: choose('读取当前状态', 'Read current state'),
        error: (code) => {
          if (code === 'CAPACITY_EXCEEDED')
            return choose(
              '未确认的插件操作已达上限；不会发送新的更改。',
              'Unconfirmed plugin operations have reached the limit. No new change was sent.',
            )
          if (code === 'BUSY')
            return choose(
              'Host 仍有活动或排队运行；等待结束后再试。',
              'The Host has active or queued runs. Wait for them to finish, then try again.',
            )
          if (code === 'REQUIRED_PLUGIN' || code === 'INVALID_INPUT')
            return choose(
              '此插件不能禁用。读取当前状态以核对。',
              'This plugin cannot be disabled. Read its current state to check.',
            )
          if (code === 'RESTART_REQUIRED')
            return choose(
              '此插件需通过启动配置更改并重启 Host。',
              'Change this plugin through the startup profile and restart the Host.',
            )
          if (code === 'PLUGIN_DEPENDENCY' || code === 'PLUGIN_VERSION' || code === 'PLUGIN_CYCLE')
            return choose(
              '插件依赖不满足；检查依赖后重试。',
              'Plugin dependencies are not satisfied. Check them before retrying.',
            )
          if (code === 'NOT_FOUND')
            return choose(
              '插件已不在此 Host 中；请返回列表并刷新。',
              'The plugin is no longer on this Host. Return to the list and refresh.',
            )
          if (code === 'PERMISSION_DENIED' || code === 'UNAUTHORIZED')
            return choose('无权更改此插件。', 'You do not have permission to change this plugin.')
          return choose('未能更改插件。可以重试。', 'The plugin could not be changed. You can try again.')
        },
      },
    },
  }
}
