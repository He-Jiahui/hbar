# 从会话／项目设置修改全局默认供应商

本单元修复 `会话设置 → Model → Providers → 设为全局默认` 的作用域断点。
Providers 始终是 Host 级管理入口；原模型设置的 layered 作用域和未保存草稿继续保留，
不能要求用户先退出会话设置，也不自动跳到 global 表单。

## 参考与已证实原因

- CC 发布画面 `D:/Git/cc-haha/docs/images/app/zh-CN/settings-provider-add.webp`
  展示背景设置页保留、局部编辑器和独立的取消／保存。它不是默认供应商列表截图，
  不能用来证明默认写入或未知结果。
- CC `desktop/src/pages/settings/ProviderSettings.tsx:335-384` 在供应商卡片本身
  提供激活／设为默认、编辑与删除，并在当前默认卡片显示 badge；本次继续复用已经
  交付的 hbar 行动作与 Host 文案，不新增重复入口或改动布局样式。
- `a84d71c5` 有意将 Providers 标成 Host-wide，同时保留 session／workspace
  表单的作用域和草稿。`944ce371` 的默认动作却要求该后台表单必须 global。
  两者组合后，“页面可见动作”与“动作允许入口”不一致。
- 修复前在真实隔离 Host + 生产 `index-CfF1VfQk.js` 复现：进入会话模型设置，修改
  未保存的 thinking，切换 Providers，点击默认动作，出现
  `Provider action failed: SETTINGS_SCOPE_MISMATCH`，目标 badge 没有更新。
  红测及截图保存在 `artifacts/desktop-experience/provider-context-default/red-results`。

## 当前动作契约

1. 当前 ready Providers 表单拥有入口；点击时捕获 form ID、provider ID 和配置的
   主模型。读取后原表单已不 active 或不再是 Providers 时禁止派发写入，旧请求不能
   对新入口猜测目标。
2. 表单可以保留 global、workspace 或 session 上下文。**写入目标始终是 global**，
   仅改变 `provider.model`；不改变全局 thinking、原会话显式选择或其他 layered 值。
3. 供应商、主模型和目录身份重新校验；当前供应商已使用非主模型时保留实际选择。
   不把列表第一项当默认，不打开编辑器，不自动保存模型设置的 dirty draft。
4. 已派发但结果不明时保持 unknown，拒绝再次写入；核对只读原 idempotency key、
   command 与 input 的精确 receipt。当前 Providers 可以核对原全局动作，但不能将它
   改成新作用域操作。离开后的确认只反映全局事实，不导航或覆盖当前设置草稿。
5. 成功后仅刷新仍 active 且 clean 的 global 表单；session／workspace 和 dirty 表单
   保持原 baseline／draft。返回 Model 恢复原 scope、值和 Save 状态，返回会话保留
   未发送内容。

## 验证与边界

源码中的断言或原生脚本步骤本身不作为已通过证据。
`e2e/provider-context-default.spec.ts` 使用真实临时 Host、mock Provider 和原 UI 入口，
不伪造服务端回包，不调用商业模型。两条代表路径是英文桌面 session 和中文窄屏
workspace；既有 global 入口保持独立回归。原生 smoke 另验证真实 WebView 内的
session 设置路径，不冒充 native workspace 或原生故障注入。

- 真实 UI 红测在旧生产构建失败于默认 badge，页面显示 `SETTINGS_SCOPE_MISMATCH`。
  修复后英文 session／中文 workspace 两条路径最终 2/2 通过（9.3 秒）；原有 global
  中英两条独立回归也 2/2 通过。截图和中间失败保存在上述 artifacts 的
  `final-results`、`final-results-02`、最终 `final-results-03`，未删除失败来冒充通过。
- 测试中间两处夹具断言已依据契约校正：单模型的 selection ID 使用真实 Host 目录，
  不自行拼成多模型 ID；进入新 scope 后等待动态模型选项完成，再核对 Host 原选择的显示值，
  不把加载时的暂态 unavailable 标签当作原选择。未修改既有测试输入或产品实现。
- 最终相关六份 Bun 测试 63 pass／0 fail／513 assertions（2.81 秒）；新增三条回归
  使用公开 actions 验证两种 scoped dirty draft、从另一 scoped Providers 核对原 unknown
  receipt 且不重写、读取后原栏目／form 已离开则零写入。
- root `bun run typecheck` 通过；全仓 `bun run lint` 在最终生产代码上通过，随后新增
  的三条测试再运行最终 typecheck 和定向类型感知 ESLint（runtime／unit／E2E／native
  script）。生产 Web build 为 `index-wuYBKNVU.js`／`index-Fadl9qq8.css`，3548 modules。
- MSVC 环境下 `bun scripts/build-host.ts`、离线 debug Tauri build 通过。
  `run-20261002-21/native-smoke.log` 完整流程 exit 0；主 agent 亲看供应商 badge
  和会话 Model 的 dirty draft 原生截图。owned 进程与临时 profile／项目清理完成，
  Host／preview 4340／4339 无监听。
- 格式与 diff 检查通过；没有运行完整 `bun run check`、完整 `test:e2e`、NSIS 安装包
  或商业 Provider。

Bun 的 directory-mismatch 内部诊断、Vite 大 chunk／临时 Host 退出时 ECONNRESET、
Cargo 配置弃用和 linker 提示均保留原输出；上述通过结果来自真实 exit code。

本单元没有增加 Provider 连接探测、远程模型拉取、PTY、Browser、MCP 或 Marketplace。
全量迁移仍在进行，不因这个默认动作修复而标为完成。
