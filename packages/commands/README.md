# @hbar/commands

平台无关的具名调用框架。A1 已实现定义/注册、分类目录、文本和 argv 解析、typed client、输入输出验证、作用域实例、注销、权限端口、容量和取消/超时边界。它不依赖 hbar contracts、React、Zustand、网络或数据库。

```ts
import { z } from 'zod'
import { CommandRegistry, createCommandClient, defineCommand } from '@hbar/commands'

const setValue = defineCommand(
  {
    id: 'counter.setValue',
    version: 1,
    owner: 'example.counter',
    kind: 'command',
    execution: 'client',
    stateEffect: 'application',
    category: 'example.counter',
    titleKey: 'counter.setValue.title',
    descriptionKey: 'counter.setValue.description',
    scope: 'client',
    surfaces: ['cli', 'api'],
    aliases: ['set'],
    cli: { arguments: [{ field: 'value', type: 'number', position: 0, flag: 'value' }] },
  },
  z.strictObject({ value: z.number().int().min(0).max(100) }),
  z.strictObject({ value: z.number() }),
)

let value = 0
const registry = new CommandRegistry()
const unregister = registry.namespace('counter').registerCommand('setValue', {
  definition: setValue,
  execute: (input) => {
    value = input.value
    return { value }
  },
})
const client = createCommandClient({ 'counter.setValue': setValue }, registry)
await client.execute('counter.setValue', { value: 12 })
await registry.executeText('set --value=24')
unregister()
registry.dispose()
```

`/protocol` 出口只含契约、纯定义/错误/边界校验，不包含 registry 或执行实现。跨包只通过公开出口访问。

## 解析与描述

规范 ID 大小写精确匹配，alias 显式注册；不会把 `setValue` 改成 `setvalue`。REPL 的单/双引号保留空串和空格，双引号内可用反斜杠转义双引号，单引号内容保持原样。Windows 路径保留反斜杠，末尾带反斜杠的路径用单引号。没有 shell 展开、环境替换或管道执行。

argv 已由 shell 分词，使用 `parseArgv` 直接解析。`--flag=value` 支持空串或以 `--` 开头的字面值；boolean flag 默认 true，显式 false 用 `--flag=false`。位置参数/flag 都指向同一个 Schema 字段，重复赋值会拒绝。`--` 关闭 flag 解释；声明 remainder 时将其后参数以空格连接到该 string 字段，需保留精确多行文本时由 CLI 文件/stdin adapter 提供结构化输入。

输入使用 strict object Zod Schema。描述发布 JSON Schema；不支持无法序列化的 transform，业务 refinement 仍需执行端最终验证。description/title 为 i18n key，不包含内置产品文案或测试数据。目录/描述深冻结，handler/validator 不进入序列化输出。CLI 字段类型、位置和 flag 在注册时验证。

文本最多 65,536 UTF-16 code units、128 个词；结构化输入最多 256 KiB UTF-8 JSON。目录最多 1,024 项，单页最多 500 项，补全最多 100 项；注册容量可在明确上限内配置。输入/目录大小限制不代替 Host 的连接和帧限制。

## 执行边界

typed client 根据本地定义推导输入输出；网络/文本/插件调用仍按 schema 验证。`dispatch` 校验 invocation 的协议、requestId、命令版本和 payload，返回安全的稳定错误码和字段路径，不泄漏输入值或底层异常。

默认最多 32 个调用在途，单命令默认 16 个；满载立即 BUSY，无无界队列。查询/应用命令超时或取消时中断等待并传播 AbortSignal；已进入写 handler 后报告 RESULT_UNKNOWN，不能宣称副作用已停止。忽略取消的 handler 在真正结束前继续占用容量。注销移除名称和补全并中断所属在途调用，旧 disposer 不影响同名新注册。

声明 capabilities 的调用默认拒绝，执行域必须注入 authorize。注册表不替代 Host 认证、领域审批或插件隔离。一个 registry 是一个执行域/作用域实例；默认 execution 为 client，Host/platform 组合根显式指定，注册时拒绝执行域不匹配的命令。跨域路由与目录聚合由 runtime/Host adapter 完成。

框架本身不写数据库。`persistent`/`external` command 只能在组合根安装了持久回执/领域事务 adapter 后执行；hbar Host 已为预算、Run、设置、Session/Workspace 等命令实现 actor + idempotency key + payload hash 回放，并将断线或超时后的未知副作用报告为 `RESULT_UNKNOWN`。长任务用持久 operation ID 分离受理与终态，通过 query/watch 恢复，不把模型运行时间占住短命令连接。

同一 descriptor 由 Host catalog、CLI/REPL/TUI、SDK 和 Web 命令面板共用。组合根应注册领域 handler，UI 只调用 ID + typed input；禁止将 React 回调闭包放进命令目录。Host 保留的 deprecated mutation RPC 仅可作为 canonical handler 的输入/输出兼容 adapter。
