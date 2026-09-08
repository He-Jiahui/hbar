# 插件开发

## Host 入口

本地插件目录必须包含 `package.json`，通过 `hbar.host` 指向默认导出 `HbarPlugin` 的 TypeScript/JavaScript 模块。入口及 Client 入口都必须位于插件目录内。

```json
{ "name": "my-hbar-plugin", "type": "module", "hbar": { "host": "index.ts" } }
```

```typescript
import { z } from 'zod'
import { definePlugin } from '@hbar/plugin-sdk'

export default definePlugin({
  manifest: {
    id: 'example.echo',
    name: 'Echo',
    version: '1.0.0',
    apiVersion: '^1.0.0',
    scope: 'run',
    description: 'Run-local echo tool',
    permissions: [],
    requires: { storage: '^1.0.0' },
  },
  configSchema: z.object({ prefix: z.string().default('Echo:') }),
  apply(ctx, config) {
    ctx.hbar.api.tools.register({
      name: 'echo',
      description: 'Echo text',
      effect: 'read',
      inputSchema: z.object({ text: z.string().max(1000) }),
      async execute(args, { signal }) {
        signal.throwIfAborted()
        return { text: `${config.prefix} ${args.text}` }
      },
    })
    ctx.effect(() => {
      const timer = setInterval(() => {}, 60_000)
      return () => clearInterval(timer)
    })
  },
})
```

仓库内插件使用 Bun workspace 的 SDK 依赖。仓库外开发时为插件安装或本地链接匹配版本的 `@hbar/plugin-sdk`，以及自身依赖；当前包是 private，尚未发布公共注册表。插件安装界面加载已有本地目录，不自动执行 npm 安装或拉取仓库。

`manifest` 中的 `provides/requires/optional` 描述运行服务及 semver 范围；包依赖由包管理器和锁文件处理。单实现服务不能出现重复 provider。Host 不能依赖 Run/Session 服务；Client 只能依赖 Host 或 Client 服务。工具的 effect 是策略输入，受信任插件必须准确申明副作用。

## 公共接口

| 接口                        | 用法                                                               |
| --------------------------- | ------------------------------------------------------------------ |
| `ctx.hbar.api.scope`        | 当前作用域和 workspace/session/run/client 标识                     |
| `tools.register/list/get`   | 注册并查询当前作用域工具，注册自动绑定 disposer                    |
| `hooks.on`                  | context.build、model.request、tool.before/after、step.end、run.end |
| `sessions`                  | get、create、submit、cancel、snapshot、append                      |
| `panels.register`           | 声明只读 Markdown/JSON 面板及停靠位置                              |
| `service<T>(name)`          | 读取当前作用域可见的服务                                           |
| `provide(ctx, name, value)` | 提供声明的具名服务，生命周期随 Cordis scope                        |
| `ctx.effect`                | 将监听器、计时器等资源纳入释放范围                                 |

工具前置钩子可返回变换后的参数；内核会重新校验，并以最终参数进行审批。模型钩子可选择已注册模型，但不能把现有凭据转发给未注册的 endpoint。插件处理上下文时，最终模型请求会进入事件日志。副作用不得绕开执行入口去伪装成只读工具。

SessionService 是创建子任务、调度和团队等后续插件的入口。`sessions.append` 用于插件自己的事件，建议使用插件名前缀，如 `example.progress`；不要冒用内核事件类型改变核心投影。

## Client 入口

Host manifest 的 `clientEntry` 指向目录内的浏览器模块。Host 将它构建为单个 ESM，并只在插件启用且客户端已鉴权时提供。模块默认导出 `apply(api)`，可以返回清理函数。

```typescript
import type { ClientPlugin } from '@hbar/ui-sdk'

export default {
  apply(api) {
    const { createElement: h, useState } = api.react
    api.registerPanel({
      id: 'counter',
      title: 'Counter',
      placement: 'right',
      component() {
        const [count, setCount] = useState(0)
        return h('button', { onClick: () => setCount(count + 1) }, count)
      },
    })
  },
} satisfies ClientPlugin
```

通过 `api.react` 使用工作台同一个 React 实例，避免将第二个 React 打包进插件。`api.client` 是带类型的网络接口；`api.config` 是已经校验的配置。`registerPanel`、`registerRenderer`、`onEvent` 和 `effect` 都会在停用、配置变化时释放。内容渲染器接受 source 字符串，插件应自行校验它的 JSON 或领域格式。

Client 插件也可以向 Session composer 左下角的 `+` 菜单贡献能力：

```typescript
api.registerComposerAction({
  id: 'review',
  label: 'Review changes',
  description: 'Inspect the current diff',
  group: 'extensions',
  icon: 'puzzle',
  keywords: ['review', 'diff'],
  requiresSession: true,
  execute({ sessionId }) {
    if (!sessionId) return
    // Call a typed Client method or open a plugin-owned panel here.
  },
})
```

`id` 在插件内必须稳定且唯一；工作台会按插件 ID 命名空间隔离贡献，并在插件停用时自动移除。`group` 可用 `session`、`context`、`tools` 或 `extensions`，`icon` 使用 SDK 白名单中的图标名。没有 `execute` 的 action 会在当前菜单中显示为不可用；插件可以显式提供 `disabled` 与 `disabledReason` 来表达当前会话不满足的前置条件。内置的 Goal、Plan、Budget、图片和文件入口也使用同一份契约，因此后续接入 Host 控制器不需要改菜单布局。

模型输出的 Markdown 不允许安装插件或运行 JS。Client 插件是明确加载的可信软件，与模型输出属于不同信任来源。当前没有第三方插件沙箱。

## 验证示例

`examples/observer` 是完整示例，Host 提供 `workspace_status`、`greeting` 配置和只读面板，Client 提供计数面板与 `observer` 内容块。测试验证启用、配置、调用、事件记录、交互和停用后的资源清理。

必需插件无法从管理 UI 直接卸载。替换时通过 `--profile` 加载默认导出的 `KernelProfile`，在 `replacements` 中指定原插件 ID。替换必须提供原服务的兼容版本并保持作用域。自定义存储通过 `createStorage(home)` 返回 StoragePort；驱动实现 HarnessDriver，执行实现 ExecutionProvider。`examples/read-only.profile.ts` 演示策略替换。
