# 文件引用只链接文件，不链接序列化换行

2026-10-01，隔离 `codex/session-launch-target` 的 `79ef6652` 上，主 agent 在完整
Goal + Plan 实渲中发现用户原文 `再执行\\n\\n-` 出现了文件链接。目标被解析成
`再执行/n/n-`，不是当前工作区文件。这是消息入口新单元引入的识别问题，不是
Goal/Plan 执行语义或内容被修改。

## 参考、原因和修复

只读 CC-haha `e28d0a653481ef41b7a329411eeb2f0fd5656731` 的
`desktop/src/lib/filePathBoundary.ts` 明确区分 path shape 与 linkable file：
分隔符仅证明路径形状，还需支持的扩展名、常见 dotfile 或明确的无扩展文件名。
CC `isLinkableFilePath` 不会仅凭斜杠将 `and/or` 或序列化换行认作文件。
既有原组件文件导航的视觉依据仍见[消息文件入口交付](desktop-message-file-reference.md)。

已查证 `79ef6652` 的 diff：`isLinkablePath` 原本在发现分隔符时直接返回 true。
实际 Goal/Plan 原文经 JSON.stringify 包含字面量反斜杠，因而被转为路径分隔符。
parser 和真实 React literal 渲染两条红测都复现了同一个目标错误。

修复沿用 CC 的文件身份规则：

- 已支持的扩展名、dotfile 与 `Dockerfile`、`Makefile`、`LICENSE` 等明确文件名
  可以链接；普通无扩展词组和任意 slash prose 不链接。
- Windows 相对路径、Unicode 文件名、行列定位及原文保真不变；有分隔符的
  `src/main.c` 可用，单独的 `object.c` 仍避免与属性访问混淆。
- 没有查询文件存在性、发送 Run、增加 Host 权限或改变工作区文件列表能力。
  用户仍可从 Files 浏览并打开无扩展文件；这里只修正自动识别入口。
- Goal/Plan E2E 新增真实消息 DOM 无伪文件动作的断言，而不删掉原始指令或将其
  整体隐藏。正常文件跳转、dirty 编辑、模型/thinking 连续性一起回归。

## 本轮证据

parser、React、Find 与 literal suite：29 tests / 506 assertions 通过。
四份变更 TypeScript 文件类型感知 ESLint 零警告；格式和 diff 检查通过。
生产 Web build 3411 modules，资产为 `index-CIvIsWGc.js` / `index-DqultGzR.css`，
位于 `artifacts/core-delivery-review-v46/web`。

最终生产资产与临时真实 Host 组合 3/3 通过，18.8 秒：
Goal + Plan 首发/原 Run 审批、消息文件定位/dirty 保留、跨项目首发模型/thinking 保留。
截图在 `artifacts/core-delivery-review-v46/host-results`；主 agent 查看批准后原指令
已无错误链接，以及正常 line 80 仍有可见文件定位。Vite ECONNRESET 发生在
fixture 关闭阶段，流程内 pageerror 均为零。

根 `bun run typecheck` 本轮失败：根测试/preview 引用无法解析未链接的
`@lumen/app-ui`，导致派生的 fixture 类型错误。没有修改共享 Lumen 或安装依赖。
诊断配置仅将该包的三个公开入口映射到本地源文件，继承根全部 include 和严格选项，
没有排除源码、降级规则或改写类型。完整诊断 TypeScript 检查通过，既有的全部
include 均参与检查；结果单独记录，不冒充根命令通过。
原生 App、全套 lint/test、主分支整合、安装、真实付费 Provider 均不在本轮验证范围。

## 后续常见源码／配置格式

修复不应以缩减真正文件入口换取少误识别。CC `filePathBoundary.ts` 的可链接集合
还包含 Vue/Svelte/Astro、ES module 变体、PowerShell、XML/INI/CSV/lock 与常见语言
源码。hbar Host `packages/kernel/src/file-commands.ts:decodeText` 只要求内容为合法
UTF-8，并由既有文件契约限制路径与 2 MiB 大小，没有按扩展名拒绝这些文件。

后续独立单元将这批文本／源码扩展纳入 parser，保留 ambiguous standalone
例外和全部路径安全条件。PNG、Office、PDF、音视频、压缩包等二进制／system-open
格式未加入；Files 文本读取并不等价于这些专用 viewer。

测试改用 `src/reference.vue` 跑已有完整消息到文件链：正文/inline/authored 引用、
目标行、迟到焦点中断、已有 Workbench、dirty 编辑、窄屏与错误恢复，未增加尺寸矩阵。
parser/React/Find/literal 30 tests / 518 assertions 通过；三份变更 TS 的类型感知 lint、
作用域严格 TypeScript、格式与 diff 检查通过。最终生产 build 3411 modules，资产
`index-D2kO73SQ.js` / `index-DqultGzR.css`；上述 Vue 文件链与 Goal/Plan 原文回归
2/2 通过，12.8 秒。主 agent 查看最终 Vue line 80 实渲，定位正常、原稿仍在。
这次资产替代上节构建用于后续手动预览；上节测试结果仍绑定其历史资产，不累计统计。
