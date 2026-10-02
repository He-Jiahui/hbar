# 首发模型目录的连续刷新

本单元在隔离 `codex/session-launch-target` 工作树修复首发页的旧模型目录。
基线为 `fb8e0ea1`；CC-haha 参考为只读 `e28d0a65`。不修改用户主工作区、
Provider 默认值或空会话切项目时保留模型/思考的已确认选择。

## 参考、历史与实际复现

主 agent 查看了 CC 的 `docs/images/app/zh-CN/model-picker.webp`：模型与思考入口
在 composer 右侧，模型菜单按 Provider 分组，选中项原位显示；并查看其
`desktop/src/components/controls/ModelSelector.tsx`。该组件订阅 Provider store，
分组条目随 providers 变化派生，不将已打开菜单绑定为一次性目录快照。
静态公开画面证明位置和层级；目录响应性来自源码，不冒称真实 CC Host 已测。

`8905cc49` 创建首发 View 内的 `model.list` effect，`294d80d5` 加入手动重试。
核对提交差异与当前源码，effect 仅在连接、runtime、手动刷新变化时读取，
没有接到已存在的 `modelEvents` 失效通知。`6e3ab832` 的默认模型解析是独立行为，
不是这一缺口的引入原因。

真实临时 Host + 配对 SDK 在首发菜单保持打开时新增 Provider/model。
基线 Web `index-CXMN2kRV.js` 上，新 Provider 已进入 Host 的公开 model.list，
页面仍只显示旧 fixture，新增分组断言失败；记录在 `artifacts/model-catalog-v27/red/`。
这是已复现的存活页面目录过期，不是“从 Settings 返回不会加载”：
`App.tsx` 在 Settings 页面卸载首发 View，返回会重新加载；新 E2E 同时验证了后者。

## 已交付行为

- 首发目录改由独立 Zustand ViewModel 投影提供。View 只订阅并持有可见期 lease，
  不接触 transport 或 Provider 内部 store。复用公开 models 端口和已有 modelEvents，
  不新增 Host 协议或另一个发送路径。
- 可见页收到模型变化或重连提示时重新读取；菜单不关闭，原有已确认目录在后台
  核对期间保持稳定。模型名称、Provider 分组与新增/移除条目随后来自新目录。
- 目录投影不写 preSessionDraft，不自动选第一项，不重写模型/思考或输入内容。
  空目录阻止发送，恢复目录后可继续原 Plan 与草稿；真正的首次发送仍有 Host 前置校验。
- 读取复用既有有界队列：至多两个实际执行 promise 与一个可替换的最新投影等待项；
  同批通知合并，10s deadline 给出局部错误/重试。取消、断线、关闭与 dispose
  撤销结果代际；忽略 Abort 的旧 promise 未实际结束前不释放其队列占位。
  此界限针对注入 models 端口 promise，不声称 UI 取消能强制结束远端 Host 内部工作。
- 页面隐藏后不因目录提示读取；返回重新核对；dispose 释放订阅、timer 和队列。
  没有新增 UI 文案、图标或 CSS，沿既有正常内容流与 trigger-relative overlay。

## 验证和边界

最终生产构建 `artifacts/model-catalog-v27/web/`，JS `index-D01-VGwD.js`、
CSS `index-BUG_tiWa.css`，3383 modules；保留已有大 chunk 警告。
最终真实 Host 流程 **5/5 通过，21.2s**，输出 `artifacts/model-catalog-v27/final/`：

1. 已打开的中文390px模型菜单反映新增 Provider，原模型/思考/多行草稿不变；
   选择新模型，切1440px进入 Settings，再改模型名称并返回，草稿和新名称仍正确。
2. 中文320px默认模型/思考可见且首次发送使用实际默认配置。
3. 中文 providerless Goal 草稿进入 Settings 配置，再返回并发送。
4. 失败读取在窄触屏 Web 菜单原位重试，保留草稿、关闭按钮焦点和单 Session 创建。
5. 模型目录清空时阻止创建 Session，恢复后沿原 Plan 和文本提交唯一用户 Run。

新目录、既有模型失效与首发 runtime 套件 **69 tests / 447 assertions** 通过，
含空/重复目录、拒绝/恢复、断线重连、通知突发、旧结果、可见期释放和实际10s deadline。
改变后的源文件/E2E严格 TypeScript、零警告 ESLint、内容/图标 guard、格式和 diff 检查通过。
主 agent 实际查看 CC 完整模型画面及最终窄/宽截图；没有扩展全按钮/尺寸矩阵。

诊断中有两类测试问题，均保留记录：新流程第一次未显式打开侧栏便查找 Settings，
修正真实导航步骤后通过；旧 Retry 用例把鼠标窄窗错误当作触屏来断言 Close 焦点。
`05ca9828` 已规定鼠标/原生窗口聚焦搜索，只有窄触屏 Web 聚焦 Close；在本次修改前的
`fb8e0ea1` 生产构建复现同样 Search 焦点。用例现显式 `hasTouch: true` 并核对 coarse
pointer，保留原 Close 焦点断言，不改变产品焦点逻辑或删除检查。

Vite ECONNRESET 出现在临时 Host 关闭阶段；新连续流程 pageerror 为空。
本单元只运行本地 mock Provider/独占 localhost，不触及真实配置、收费模型或原生窗口。
未运行全仓/native/旧 Lumen SSR 门禁，未安装依赖、推送或合并；不能把本单元记为完整
desktop 迁移。Goal+Plan、`/agent` 语义等未决差异仍见[当前复核](desktop-core-continuity-current.md)。
