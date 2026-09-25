# Provider 编辑：基础字段与高级参数

本单元仅调整 Provider 的新增、编辑、字段检查、保存和取消体验。没有增加连接探测、联网拉取模型、配置自动保存或新的 Host 协议。

## 参考与证据等级

- **参考实际画面**：`D:/Git/cc-haha/docs/images/app/zh-CN/settings-provider-add.webp`。可见单列阅读顺序、预设先行、内容区与底部取消/保存分离，背景设置页保留。
- **参考源码**：`D:/Git/cc-haha/desktop/src/pages/settings/ProviderSettings.tsx` 的 `showContextSettings`、非法上下文自动展开、提交期间禁用取消。连接测试和拉取模型存在于参考产品，但 hbar 没有对应公开能力，本单元不伪造入口。
- **hbar 改前真实生产画面**：`artifacts/desktop-experience/provider-audit/results/` 下中英新增/编辑/参数截图，宽度 1440、390、320。只读巡检前后 `provider.list` 完全相同。
- **hbar 改后真实 Host + 生产构建**：`artifacts/desktop-experience/provider-progressive/final-results/` 下 `provider-basic-*`、`provider-advanced-*`、`provider-unknown-*` 与 320 宽 `provider-credential-unknown-*`。真实测试使用独立临时数据目录、测试专用凭据和本机无服务端点，未运行外部模型请求，未访问用户已有 Provider 或密钥。

## 入口与闭环

| 入口                     | 目标与行为                                               | 反馈与退出                                                         |
| ------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------ |
| 设置 → Providers → 添加  | 预设、名称、协议、API 地址、凭据、模型，按单列内容流排列 | 不自动保存；缺少必填值时保存不可用                                 |
| Provider 行 → 编辑       | 保持原 Provider ID；模型选择与字段编辑显式绑定该模型     | 已保存凭据不回填明文；空凭据输入保留原凭据                         |
| 供应商高级选项           | 展开供应商可见性                                         | 收起不清值                                                         |
| 高级模型参数             | 可见性、上下文/输出容量、价格、图像/推理能力、推理等级   | 非法项自动展开；修正最后一个错误不会把正在输入的区域收起           |
| 检查配置                 | 只读本地 schema 校验，不发送连接探测                     | 定位到首个错误字段，必要时切回原错误模型；明确提示未测试供应商连接 |
| 保存供应商               | 显式保存当前原编辑器                                     | 成功仅关闭原 modal，不导航；回到原添加/编辑按钮                    |
| 取消、右上角关闭、Escape | 统一检查脏配置与本次密钥输入                             | 脏草稿确认后清除；继续编辑则保留；已有配置和凭据不变               |
| 保存中 / 结果未知        | 禁止丢弃、字段修改与重复保存                             | 未知时显示就近解释与核对入口，不冒充已失败或已成功                 |
| 核对保存结果             | 参数操作读取 Host Provider 列表核对，不重发写入          | 确认后关闭原 modal；含非空新密钥的未知操作不得仅凭 `hasKey` 结算   |
| 删除 Provider            | 保留列表行菜单与原确认窗口                               | 不再同时把删除作为编辑器主底部动作                                 |

高级字段保持挂载，收起只改变可见性。数值输入对完整数值立即提交到原模型草稿，因此未失焦就切换模型不会丢值或把值写入新模型。模型列表上限沿用 Host 的 256；使用内容增长的模型选择区，滚动由有界 modal 内容区统一承担，头部与底部动作不跟随滚走。

## 生命周期与可靠性修复

1. 原实现以 `focusedPanelId` 识别设置表单；打开 Provider modal 会将背景设置页卸载。现在仅在当前 page 仍是原设置页、该 panel 存在、form key 精确匹配且焦点是 settings editor 时保留原表单。换页或销毁原 panel 不保留。scope、目标和原草稿不改变。
2. 保存晚到时检查原 editor ID 与 mounted 生命周期。旧 A 保存确认不得覆盖 B 的草稿、关闭 B、导航或抢走 B 的焦点。
3. `HbarError` 是真实 Client 返回的公开错误类型。旧 Provider 边界只识别本地 `CommandError`，导致明确错误和未知回包被压成 `EXECUTION_FAILED`。本单元保留其公开 code；写入派发后的连接关闭、超时、普通 Error 等保留 pending 并标记未知。本地 schema 校验失败仍是明确失败。
4. `resetDraft` / `resetField` 在 pending/unknown 时拒绝操作。取消确认清除本次 secret 草稿，密钥从不进入可订阅状态快照。
5. 未知操作提交了非空新密钥时，`reconcile` 返回 `CREDENTIAL_RESULT_UNKNOWN`，保留原 pending 与秘密草稿。中英文界面明确解释无法确认替换内容，不自动关闭、不重发、不清草稿。仅参数变更或显式清空凭据可依真实可观察事实核对。

## 验证记录

- `bun test tests/provider-settings-runtime.test.ts tests/provider-settings-workspace.test.tsx tests/settings-form-runtime.test.ts`：17 通过，155 个断言。
- root `tsc --noEmit`、定向 ESLint、定向 Prettier、内容/图标/布局 guards：通过。
- `e2e/provider-progressive-edit.spec.ts`：中英 2 通过（最终 15.9 秒），包含 1440/390/320 真实截图、基础/高级披露、未失焦切模型、非法项定位、保存、取消/继续编辑、清空 secret 草稿、长标签、无水平溢出及底部区域分离。密钥无法确认的长说明额外验证 320 宽仍完整可读、核对入口可见。
- 真实 DOM 身份验证：记录打开前添加按钮的 `ElementHandle`，打开和保存后仍 `isConnected=true`；保存后该按钮获得焦点，取消后原编辑按钮获得焦点。
- WebSocket 故障注入：明确拒绝保留草稿；服务端接受参数保存后隐藏结果，取消/关闭/Escape/字段不可改变原操作；只读核对后完成。到此 Host `provider.save` 写次数严格为 2（首次保存 + 故障保存）。随后以已配置密钥替换新密钥再丢失回包，核对仍保留 unknown 与专用提示、禁用取消，写次数停留在 3，任何核对都不重写。
- 原 `web-shell` Provider 预设、自定义模型、推理等级及独立可见性回归：通过。connected 大回归前置的旧审批与运行历史断言由对应单元更新后，最终整条通过（26.4 秒测试、31.0 秒总计）。此前失败保留于 artifacts，未用修改 Provider 事实断言来绕过。

## 仍受现有协议限制的能力

`provider.list` 仅公开 `hasKey`，不公开密钥版本或写入 receipt。因此未知的新密钥替换操作会安全地停留在未确认状态，而不是显示“已保存”。当前界面禁止关闭这类未确认编辑器；本单元未实现跨页面或应用重启后恢复私有 pending，也未增加自动重发。若要支持可关闭但继续保留待核对操作，需独立的 Host 精确写入 receipt 与可恢复 pending 契约。连接有效性也没有公开探测命令，字段检查不是联网测试。

原 Lumen 材质、边框与控件样式仍由共享 UI 系统提供，本单元迁移的是参考产品的层次、阅读流和入口职责，不声明像素级复刻。
