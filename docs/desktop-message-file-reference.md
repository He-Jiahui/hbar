# 从消息文件引用进入当前会话预览

隔离 `codex/session-launch-target` 上的独立体验迁移。沿用用户已批准的模型/thinking 连续性、
Goal/Plan 共存与父 Run Agent 语义，不修改主工作区、CC-haha 或共享 `hbar-ui`。

## 参考与视觉依据

主 agent 查看原组件保留实渲
`D:/Git/hbar/artifacts/file-preview-tabs/reference/evidence/message-file-dock-en-US-1440.png`
与 `message-file-dock-zh-CN-320.png`：消息中的 `src/main.ts:2` 是正文内链接；点击后由当前
Session 拥有的 Files 打开文件，目标行突出显示。证据来自原 renderer/store 与人工 loopback
只读响应，不是原生 CC App 或真实 Provider。窄图的原 dock 离屏，不能当 hbar 应复制的布局。

CC 版本 `e28d0a653481ef41b7a329411eeb2f0fd5656731` 的 `AssistantMessage.tsx`、
`lib/openPreviewLink.ts`、`lib/handlePreviewLink.ts`、`lib/markdownAutolink.ts` 证明
session/path/reveal 路由；历史 `d7081c42` 和既有
[原文件预览审计](desktop-file-preview-reference-audit.md) 记录此入口。
hbar 当前相关历史 `2430618b` 保持 HTTP 链接边界、`346269ff` 保持操作员原文；此前文件路径
明确留作 authored text，不能把新入口说成某次近期提交造成的回归。

## 已完成闭环

- 普通消息正文、完整文件路径行内代码、显式 Markdown 文件目标进入现有 Files。
  用户消息仍按原文呈现，Markdown 符号与空白不被解释或删除；不会执行文件中的命令。
- 识别相对路径与一基行/列，`./` 和反斜杠规范化但可见原文不变。路径上限 4000，行/列
  上限 2,000,000；拒绝任意 `..` 段、绝对/drive/home 路径、协议与危险语法。
  HTTP(S) 链接仍打开外部网页；代码块、命令式行内代码不生成文件动作。
  不支持的本地 Markdown 目标不能意外导航浏览器路由。
- 未提供文件导航能力的 Markdown 表面不显示装饰性文件链接。未完成的 prose 不抢先链接
  半截路径；完整行内代码与显式目标保持有意义的语义。Thinking/工具详情没有新增动作。
- `messageFiles.open` 是 client-only 协调入口，复用 `sessionTools.open`、Files refresh 与
  `fileWorkspace.openEntry`。workspace/session/source-tab/message 归属受检查；已有 Files
  Workbench 定位原视图，不新建第二个 dock 或另一个文件事实源。
- 同一路径保持原 preview UUID、编辑模式和未保存草稿；新行定位有独立 request ID。
  正文预览滚动并突出目标行；编辑模式只选中位置，不修改文本或写磁盘。
  一次请求被实际视图消费后清除，普通 remount 不重复拉回旧行；旧 ACK 不清新请求。
  请求期间新的指针、滚动、触摸、键盘编辑或 beforeinput 撤销旧定位，不抢用户后来
  选择的控件；并不取消文件事实的安全读取。
- 打开、失败状态在原引用附近，文件读取失败仍沿用 Files 的就近错误与 Retry。
  文案由宿主提供中英文类型化 bundle；正文链接正常 inline flow，文件区沿用现有 flex
  自适应布局。没有新增图标尺寸、固定内容高度或私有共享样式覆盖。
- 导航观察只有一个当前意图及 12 秒总预算。切来源、关闭/离开原 Files、取消或 dispose
  撤销观察与未消费定位；底层既有文件读取未必可中止，迟到事实只能进入原 owner。
  这里不宣称客户端取消已经停止 Host I/O。
- 原引用的反馈仅由已挂载宿主控件注册到只读 chrome 边界，Find 与选中文本映射不把错误/
  opening 文案当成消息正文；不会信任消息自己提供的任意 DOM attribute。

## 验证范围

核心真实 Host 链已验证：中文消息普通路径 → line 2；键盘打开同文件的 line 80/column 4；
原 Workbench 往返；保留 dirty 编辑并再次跳到 line 110；390px 继续操作；缺失文件错误；
回来继续 Find；会话草稿、磁盘内容与零 Run 保持不变，没有 pageerror。
输入是明确标记的 test-only canonical stored messages，不是真实模型输出。

基础组合 59 tests / 681 assertions 通过，包括 parser、双语/长标签渲染、Find/literal
正文映射、真实预览 ACK/abort 与既有编辑/预览保护。包含 App 的严格作用域 TypeScript、
29 份变更 TypeScript 文件类型感知 lint 零警告、content/icon/flow guards 与格式检查通过。
真实 Host 新链、180 条消息阅读返回和标签菜单缩窄组合 3/3 通过，13.6 秒。
生产 Web build 3411 modules；最终资产在 `artifacts/message-file-reference-v45/web`，
资产为 `index-BHkJaZ2q.js` 与 `index-DqultGzR.css`。截图位于
`artifacts/message-file-reference-v45/final-results/message-file-reference-mes-f24b1-ions-and-retain-dirty-edits`，
主 agent 人工查看消息入口、line 2、line 80 与窄屏 dirty 编辑图。
初轮截图发现目标行未着色，原因是使用了未定义的 `--lumen-primary`；新行提示与链接改用
公开 `--lumen-info`，并验证实际 computed background，不以 data marker 冒充可见效果。
既有其他 selection CSS 没有在本次被改写或宣称全部修复。

组合回归曾在文件操作前失败：夹具过早直接填充正在替换的 contenteditable，入口截图
显示草稿在打开 Files 前已为空。测试改为等原 Session/正文挂载后使用真实键盘编辑并先
确认可见原稿，再进行文件操作；没有增加 sleep 或将该次失败记成通过。
慢读竞态使用代理暂存真实 file.read 响应，用户在另一控件按 Backspace 后放行原响应；
焦点保留且没有旧行高亮，再次点击后正常定位。没有假造文件返回值。

没有增加 Host 文件权限、系统 Open-with、绝对路径/Browser 服务，也没有安装依赖、调用真实
付费 Provider、启动原生 App、push、merge 或部署。全仓与原生门禁未运行。
