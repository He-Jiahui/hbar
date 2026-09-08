# 插件开发

## 受管目录规则

hbar 只从数据根中的受管目录加载已安装插件。用户选择的源码目录或归档是安装输入，Host 校验并构建后将完整插件复制到以下位置：

```text
<dataRoot>/plugins/
├─ global/
│  ├─ plain-package/
│  └─ @scope/package/
├─ projects/
│  └─ <project-id>/
│     ├─ plain-package/
│     └─ @scope/package/
└─ lock.json
```

包名就是插件的规范 ID。普通包 `plain-package` 占一个目录；scoped 包 `@scope/package` 保留两级目录。路径只能由通过 npm 包名规则校验的 `name` 生成，插件不能自定义安装目录。全局与项目目录中出现同名包时首版直接报告冲突，不做隐式覆盖。项目插件只在所属 Workspace 及其 Session/Run 中可见。

安装后的目录由 hbar 管理。插件运行时不得修改自身目录，也不得把状态写入 `dist/` 或 `node_modules/`。插件状态进入存储服务，临时构建进入 `<cacheRoot>/plugin-build`，解包暂存进入 `<cacheRoot>/plugin-extract`。缓存删除后不影响已安装插件和 lock；删除受管插件必须通过插件管理 API 或 CLI。

插件包建议使用以下布局：

```text
my-plugin/
├─ package.json             # 必需；唯一 manifest 来源
├─ src/
│  ├─ host.ts              # Host 入口
│  └─ client.tsx           # 可选 Client 入口
├─ assets/                 # 可选静态资源
├─ README.md
└─ LICENSE
```

入口必须是插件根目录内的普通文件。目录和归档中的符号链接、硬链接、绝对路径和 `..` 穿越会被拒绝。单包最多 10,000 个条目、解包后最多 100 MiB；归档必须直接包含一个插件，或使用单一顶层目录/npm 的 `package/` 目录。首版接受目录、`.zip`、`.tgz` 和 `.tar.gz`，不访问 npm registry、不下载 URL，也不执行 `preinstall`、`install`、`postinstall` 等脚本。

## package.json

`package.json` 使用标准 npm `name/version/type`，hbar 的运行元数据全部位于 `hbar` 字段。建议发布已经锁定依赖并可由 Bun 单文件构建的源码或产物：

```json
{
  "name": "@hbar-community/example-observer",
  "version": "1.2.0",
  "type": "module",
  "hbar": {
    "apiVersion": "^1.0.0",
    "scope": "global",
    "runtimeScope": "workspace",
    "host": "./src/host.ts",
    "client": "./src/client.tsx",
    "dependencies": { "@hbar/execution": "^1.1.0" },
    "peerDependencies": { "@hbar/model": "^1.0.0" },
    "optionalDependencies": { "@hbar/mcp": "^1.0.0" },
    "permissions": ["storage", "network"],
    "activationEvents": ["host.start", "session.open"],
    "contributes": {
      "commands": [
        {
          "id": "observer.inspect",
          "title": "Inspect workspace",
          "description": "Show the active workspace identity",
          "usage": "/observer.inspect [path]",
          "group": "extensions",
          "scope": "workspace",
          "permissions": ["storage"],
          "headless": true,
          "mutates": false,
          "completion": ["."]
        }
      ],
      "panels": [{ "id": "observer.status", "title": "Observer status", "placement": "right" }],
      "renderers": [{ "language": "observer" }]
    }
  },
  "dependencies": { "@hbar/plugin-sdk": "^0.1.0" }
}
```

顶层 npm `dependencies` 只用于构建入口，安装器不会将它们加入 hbar 插件启用图。`hbar.dependencies`、`hbar.peerDependencies` 和 `hbar.optionalDependencies` 才表示插件间运行依赖：

| 字段                   | 启用规则                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `dependencies`         | 必须已安装且版本满足；启用下游时自动启用 disabled 上游。                                    |
| `peerDependencies`     | 必须已安装且版本满足；适用于用户选择的模型、执行或存储 provider，实现不会被自动安装或替换。 |
| `optionalDependencies` | 缺失不阻止启用；存在但版本不兼容时不注入增强能力。                                          |

启用前对整个候选图执行 semver、循环依赖、重复 provider、API 版本和作用域检查。任一硬依赖或 peer 冲突都会撤销本次启用、自动启用和配置修改。存在 active 下游时禁止停用或删除上游，错误会列出下游、要求范围和当前版本。hbar 不自动降级、升级或选择另一个 provider。

`scope` 是安装范围，只能是 `global` 或 `project`。`runtimeScope` 是 Cordis 生命周期，只能是 `host/workspace/session/run/client`。项目插件不得使用 `host` 或 `client` 生命周期，Host 级服务也不得依赖更窄的 Session/Run 服务。所有注册必须通过 `ctx.effect` 或返回 disposer，停用、配置变化和作用域结束时才能完整释放工具、事件、面板、渲染器和命令。

`activationEvents` 与 `contributes` 会进入 manifest 和 lock。首版生命周期仍由 Host/Workspace/Session/Run/Client scope 驱动；除 `host.start` 外的事件是后续惰性激活的兼容字段。声明命令只提供可发现的静态元数据，Host 或 Client 入口仍须通过 SDK 注册同 ID 的执行器。

`plugins/lock.json` 是 Host 原子生成的事实文件，记录版本、安装范围、受管相对路径、内容完整性、启用状态和依赖。插件与用户不应手工编辑它。`hbar plugins doctor` 校验已安装目录、依赖图和 lock；`hbar plugins lock` 输出当前锁定结果。

## Host 入口

本地插件目录必须包含 `package.json`，通过 `hbar.host` 指向默认导出 `HbarPlugin` 的 TypeScript/JavaScript 模块。入口及 Client 入口都必须位于插件目录内。

最小包仍必须提供合法 semver 版本：

```json
{
  "name": "my-hbar-plugin",
  "version": "1.0.0",
  "type": "module",
  "hbar": { "host": "index.ts" }
}
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

运行入口 `manifest` 中的 `provides/requires/optional` 描述服务及 semver 范围；它们与 `hbar.*Dependencies` 的包级依赖检查互补。单实现服务不能出现重复 provider。Host 不能依赖 Run/Session 服务；Client 只能依赖 Host 或 Client 服务。工具的 effect 是策略输入，受信任插件必须准确申明副作用。

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

通过 `api.react` 使用工作台同一个 React 实例，避免将第二个 React 打包进插件。`api.client` 是带类型的网络接口；`api.config` 是已经校验的配置。`registerPanel`、`registerRenderer`、`registerTerminalCommand`、`onEvent` 和 `effect` 都会在停用、配置变化时释放。内容渲染器接受 source 字符串，插件应自行校验它的 JSON 或领域格式。

终端命令与内置命令使用相同的元数据，并可在 React TerminalPanel 中执行：

```typescript
api.registerTerminalCommand({
  id: 'observer.inspect',
  title: 'Inspect workspace',
  description: 'Show the active workspace identity',
  usage: '/observer.inspect',
  group: 'extensions',
  scope: 'workspace',
  permissions: ['storage'],
  headless: true,
  mutates: false,
  execute({ workspaceId, writeMarkdown }) {
    writeMarkdown(`Workspace: \`${workspaceId}\``)
  },
})
```

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
