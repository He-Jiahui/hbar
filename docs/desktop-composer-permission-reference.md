# 本次发送的工具审批入口

参考依据：cc-haha 的 `desktop/src/components/chat/controls/PermissionModeSelector.tsx`、`docs/images/app/zh-CN/permission-modes.webp`，以及直接渲染原组件的 `artifacts/reference-ux-v2/07-permission-open.png`。它把权限放在输入区左侧、每项解释实际含义，高风险选项另确认；窄屏使用底部 sheet。

hbar 的真实审批策略为 `ask / deny / sandbox / allow`（`sandbox` 见[沙盒审批](sandbox.md)），不能伪造参考的五种模式。新入口包含这些策略以及继承默认：仅影响下一次 composer 发送，绝不调用全局 `permission.set`。继承会在提交时读取默认并固定到该 Run，失败不静默退到 ask。deny 只拒绝需要审批的工具，不冒充“全部只读”；allow 不绕过 Host 明确拒绝规则，也不叫“全部权限”。Plan 仍是独立运行意图。

## 所有权与恢复

- 选择绑定 session/revision；风险确认完整显示原会话，切会话或 revision 改变后旧确认失效。
- 普通/Goal/Plan composer 都在异步准备前捕获权限，再把原 approval 随 Run input 提交。Goal 创建尚未发送 Run 的 partial 阶段会释放捕获，不消费一个不存在的 Run。
- 接受后回到继承；明确失败保留选择；unknown 固定原请求与策略并禁止替换。两个核对入口共享已有 draft receipt，不生成新 idempotency key。
- 消息里的 detached Plan 不读取或消费 composer 权限草稿；普通提交预备期间的单飞保护也覆盖 detached 入口。
- 没有 configuration port 且从未显式使用权限功能的旧 runtime API 保持兼容；显式意图不可默默降级。公开 reader 标记 available，生产 View 只在能力存在时展示入口。

## 实际验收

- 8 个相关测试文件：88 passed、548 assertions；覆盖权限 reader、受控 UI、composer/Goal/Plan 整合、单飞、unknown、原回执以及真实 Host 普通草稿回归。
- 追加接受后异常回归：普通/Detached 两条路径 × 普通异常、CONNECTION_CLOSED、EXECUTION_FAILED、TIMEOUT。修复前 8 例均失败，修后保留原幂等键与 pending，禁止重复发送；另 4 例验证原权限在未知期间锁定，由同一回执确认后解除。明确接受前拒绝仍允许修复后重试。
- 真实生产 Host E2E：中英文 2 passed（12.2s），使用独立 45417/45429；真实 `write_file` 的 deny 不落盘、allow 无逐次审批落盘、ask 等用户在 UI 允许后才落盘。每个 Run 的 approval 与选择一致，全局默认未被入口修改；继承使用发送时的新默认。
- 独立受控浏览器：两语言 × 1440/390/320 共 6 场景，覆盖确认/取消、键盘、失败、unknown、切会话与焦点；这是 UI fixture，不伪称 Host 验证。
- 真实生产截图：`artifacts/desktop-experience/permission/host-results`；原组件及受控 fixture 截图在同功能 artifacts 目录。strict scoped lint、root typecheck、Prettier、content/icon/flow guards 和精确 overlay 正反 self-test 通过。

原生桌面综合 smoke、页头/活动层级等其他迁移项仍另行验证，不能由本入口测试推断已全部完成。
