# 排队消息的原位多行编辑

## 参考与范围

只读参考为 CC-haha `e28d0a653481ef41b7a329411eeb2f0fd5656731` 的
`desktop/src/components/chat/ChatInput.tsx` 排队消息区域，以及既有原组件预览：

- `D:/Git/hbar/artifacts/reference-ux-v2/queued-cards-edit-reference-1440.png`
- `D:/Git/hbar/artifacts/reference-ux-v2/queued-cards-reference-320.png`

参考卡紧邻主输入区，用虚线区分排队消息；默认行依次显示排队状态、摘要、引导、编辑和删除。
编辑原位替换摘要与行操作，顺序为内容、保存、取消，没有独立页面或模态。
这些截图是原组件和隔离数据的预览，不是完整 CC 桌面连接真实 Host 的验收。

CC 这里也使用单行 `<input>`。本修复迁移其位置和动作顺序，不宣称 CC 已具备多行编辑，
也不照搬其单行限制。等待审批时 CC 仍显示引导，而 hbar 只允许运行中的 Run 接收引导；
本次不扩大该执行/审批语义。双方原编辑组件都没有明确的完成后焦点归还，
本次没有将它报告为 hbar 独有缺陷或新增自动焦点跳转。

## 复现与实现

修复前 HEAD 为 `74d259d1`。`ea402c85` 最初引入原位编辑时使用单行输入，
`f6b9b853` 切换到 LumenInput，保留了单行类型。当前真实临时 Host 的排队正文有换行，
打开编辑框后 DOM value 已移除换行；浏览器 E2E 的完整值断言失败。
继续键入会把这个压平的 DOM value 写回 ViewModel，因此可以破坏原段落。
这不是 Host 返回了截断摘要：编辑仍通过 `queuedRun.getEditable` 读取完整正文。

- 使用现有 LumenTextarea，保留 Host / ViewModel / 原队列 ID 与版本契约。
- Enter 保存，Shift+Enter 换行，Escape 取消；组合输入期间 Enter 不保存的原有保护保留。
- 快捷键说明由宿主中英文文案提供，通过 title 和可访问描述呈现，不新增重复说明卡。
- 编辑框按内容自然增长；原生 rows 提供回退，内容 sizing 支持软换行。
  长内容在有界编辑视口中滚动，列表仍使用原有每页 10 条和队列滚动边界。
  短内容回到紧凑高度，窄屏动作按原 flex 顺序换行。
- 未改变既有保存时外层空白 trim、审批、引导、幂等重试和未知结果恢复语义。

## 实际验证

浏览器使用独占 localhost Vite preview、临时真实 Host、local-fixture 模型和临时目录，
没有商业请求、真实用户配置或原生桌面重启。

- RED：旧 `artifacts/plan-return-v23/web` 上中文流程失败，明确显示 4 行期望变为 1 行。
  证据在 `artifacts/queue-multiline-v24/red/`。
- 当前 Web build 成功：`artifacts/queue-multiline-v24/web/`。
  仍有既有大型 chunk 警告。
- 最终中英文真实 Host 编辑 E2E：2/2，13.7 秒。
  覆盖原全文、追加单字符不丢换行、空白禁用保存、Escape 不改原文、
  未发送草稿保留、Shift+Enter 后 Enter 保存、Host 精确回读、
  长内容实际可滚动、短内容紧凑、保存按钮提交和原 Run 仍等待审批。
  实际截图在 `artifacts/queue-multiline-v24/final/`；已人工查看桌面和窄屏画面。
- `queued-user-runs-runtime` 与 `queued-run-edit`：15/15，117 个断言。
  原有恢复、会话隔离、版本冲突、精确目标和审批等待限制回归通过。
- 改动范围严格 TypeScript、ESLint 零警告、Prettier、内容/图标/flow guards 和 diff 检查。

未通过或未运行的门禁不能视为完成：SSR queued view 测试在加载 Lumen 的 MUI 子模块时，
因缺少 `prop-types` 尚未执行，未安装依赖或修改只读子模块。
全局设计系统边界测试失败于其他文件的 23 个既有违规；逐文件对比 HEAD 得到相同列表，
本次 queued view / CSS 没有新增违规。未运行全仓 check 或原生 desktop build/smoke。
测试期间 Vite 的 ECONNRESET 出现在关闭临时 Host 时，两个浏览器流程均无 pageerror。
