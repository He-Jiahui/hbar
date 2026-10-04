# 沙盒审批

审批模式决定一次 Run 中工具调用是否需要用户确认。`sandbox` 位于“逐次询问”和“自动批准”之间：按选定的沙盒配置自动放行、询问或拒绝。设计参照 Codex 的权限配置（`extends`、按路径授予读写、超出配置时询问或拒绝）与 Claude Code 的权限规则（deny > ask > allow、复合命令逐段匹配）。

| 模式      | 行为                                                  |
| --------- | ----------------------------------------------------- |
| `ask`     | 策略要求审批的工具逐次等待用户决定。                  |
| `deny`    | 拒绝需要审批的工具；策略直接允许的只读工具仍可执行。  |
| `sandbox` | 由 Run 固定的沙盒配置决定放行、询问或拒绝。           |
| `allow`   | 自动批准需要审批的工具；Host 策略插件明确拒绝仍生效。 |

声明 `humanApproval: 'required'` 的工具在任何模式下都单独询问；策略插件返回的 `deny` 在 `sandbox` 模式下同样生效。

## 选择配置

会话设置 `session.sandboxProfile` 可在全局、工作区、会话三级覆盖，默认 `:workspace-write`。保存时 Host 校验配置存在。审批选择 `sandbox` 的 Run 被受理时，Host 解析当前选中的配置及其继承链，把合并后的规则按内容 SHA-256 存为不可变快照，Run 只携带 `{ profileId, digest }`：

- 运行中修改或删除配置不影响已受理的 Run；Host 重启后按同一快照继续判定。
- 子 Agent 继承父 Run 的快照，不重新读取子会话设置。
- 只接受 Host 已创建的快照摘要；未知摘要拒绝受理。其他审批模式会去掉 Run 上的快照。
- 选中的配置被删除后，新 Run 受理失败（`SANDBOX_PROFILE_NOT_FOUND`），不会回退到更宽的默认配置。

## 配置结构

内置配置不可修改：

- `:read-only`：工作区内可读；写入、命令和网络都超出配置。超出时询问。
- `:workspace-write`：继承 `:read-only`，工作区可写，`.git` 与 `.hbar` 保持只读。

用户配置最多 64 个，`id` 为小写字母、数字、`-`、`_`，通过 `sandbox.list/get/save/delete/receipt` 管理；写入需要幂等键并按 `expectedRevision` 做版本检查。被其他配置继承的配置不能删除。

| 字段                 | 含义                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| `extends`            | 父配置；最多再继承 4 层，不能成环。子配置覆盖同一路径、同一命令模式或同一工具的父规则。         |
| `escalation`         | 超出配置时的处理：`ask` 询问（类似 Codex `on-request`），`deny` 直接拒绝（类似 `never`）。      |
| `filesystem.default` | 无授权覆盖的路径的访问级别：`none`、`read`、`write`。                                           |
| `filesystem.grants`  | `{ path, access }`。相对路径以工作区为根，也可写绝对路径；目录覆盖其子树，支持 `*`、`?`、`**`。 |
| `commands.rules`     | `{ pattern, decision }`。按空白分词匹配，末尾单独的 `*` 匹配剩余参数，词内 `*` 为通配。         |
| `network.enabled`    | 是否放行声明为网络效果的工具。                                                                  |
| `tools.rules`        | 按工具名指定 `allow`、`ask`、`deny`。                                                           |

`null` 表示继承；根默认为 `escalation: ask`、`filesystem.default: read`、网络关闭。

## 判定规则

每项适用检查给出一票，最严格的一票生效（`deny` > `ask` > `allow`），“超出配置”的票取 `escalation`：

- **路径**：工具在 `workspaceAccess` 中声明的路径参数逐个检查。最具体的授权生效，同样具体时取更严格者；显式 `none` 直接拒绝，访问级别不足属于超出配置。路径同时按字面路径和解析符号链接后的真实路径检查。声明整个工作区访问的读写工具需要整棵树都满足，子树内任何更低的授权都会限制它，因此 `git_commit` 在 `:workspace-write` 下会因 `.git` 只读而询问。
- **命令**：只对声明了 `commandArgument` 的进程工具生效（内置 `shell`）。命令按 `&&`、`||`、`;`、`|`、换行拆段，每段都必须被允许；任一段命中 `deny` 即拒绝。命令替换、重定向、分组、后台或调用运算符和未闭合引号永远不会被自动放行，但仍会拆出其中的命令供 `deny` 规则检查。Windows 与 macOS 上路径与命令匹配不区分大小写。
- **网络**：网络效果工具按 `network.enabled` 判定。
- **工具规则**：命中的 `deny`、`ask` 作为下限；`allow` 只取代网络和“未声明效果”这两项检查，路径与命令检查仍然生效。未声明路径的写入工具、未声明命令参数的进程工具都属于超出配置。

被拒绝的工具结果会写明配置和命中的规则，例如 `Denied by sandbox profile strict: the tool needs write access to README.md but the profile grants read by default`。

## 示例

只允许写入源码与文档、允许 `cargo test`，超出时直接拒绝：

```json
{
  "id": "engine-strict",
  "expectedRevision": null,
  "name": "Engine strict",
  "description": "Only registered source and documentation paths are writable.",
  "extends": ":read-only",
  "escalation": "deny",
  "filesystem": {
    "default": null,
    "grants": [
      { "path": "engine/src", "access": "write" },
      { "path": "docs/**/*.md", "access": "write" },
      { "path": "Cargo.toml", "access": "write" },
      { "path": ".env", "access": "none" }
    ]
  },
  "commands": {
    "rules": [
      { "pattern": "cargo test *", "decision": "allow" },
      { "pattern": "git push *", "decision": "deny" }
    ]
  },
  "network": { "enabled": null },
  "tools": { "rules": [] }
}
```

## 限制

- **命令不受文件规则约束。** hbar 目前没有操作系统级进程沙盒（Codex 在 Windows 使用受限令牌与 ACL，在 macOS/Linux 使用 seatbelt、landlock）。命令规则只决定命令是否执行；被放行的 `cargo build` 仍可写入任何当前用户可写的位置，`deny` 规则也可能被别名或脚本绕过。文件工具由 Host 执行，路径授权对它们真实生效。
- 文件工具本身只能访问工作区；工作区外的绝对路径授权目前只影响判定，不扩大文件工具的访问范围。
- 尚不支持 Codex `shell_environment_policy` 式的环境变量覆盖，也尚不支持从项目目录（如 `.hbar/settings`）读取配置文件。
- 判定在调用前进行。判定后、写入前替换符号链接的竞态不在沙盒判定范围内；文件工具写入前仍会重新检查工作区边界与 Host 数据目录保护，但不会重新检查沙盒授权。
