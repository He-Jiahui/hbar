# 普通图标入口的视觉层级

本单元以 `21551829` 为基线，在隔离 `codex/session-launch-target` 工作树中
收敛主导航与 composer Add 的普通操作图标，不改变业务入口或运行策略。
CC-haha `e28d0a65`、主工作区及共享 hbar-ui 均保持只读。

## 参考与边界

主 agent 查看 CC 随仓库提供的
`D:/Git/cc-haha/docs/images/app/zh-CN/session-main.webp`。
其刷新、侧栏开关和输入区 Add 使用简洁图标；运行状态集中在当前会话、任务和进度区域。
两名 gpt-6-luna/max agent 分别只读复核 CC 的 action/status 层级及 hbar 的公开按钮合同。
结论支持保持有标签的选择控件、图标化工具动作、按作用域就近显示状态；
没有发现这些普通 action 本身构成阻断性功能缺陷。
本次是视觉层级精简，不将产品样式差异虚报为核心功能故障，也不删除连接等有效状态。

readonly `primitives.tsx` 证实 LumenIconButton 始终渲染 lamp，
没有公开 `indicator` 开关。LumenButton 有 `indicator="none"`，
其 canonical focus-visible outline 在 none 下仍可用。
原位红测在上一版生产 Web 上确认隐藏侧栏按钮有一个 `[data-edge]` 子元素；
这是默认装饰的直接证据，不以新 class 缺失代替视觉问题。

## 已完成

- 通过 app-react 局部 `HbarActionIconButton` 复用公开 LumenButton，
  收敛 shell 的七个普通动作及 composer Add，共八个入口。
  不修改 readonly primitives，不传未支持的 prop，也不全局 CSS 隐藏 lamp。
- 保留原按钮的 ref、回调、原目标、type、ARIA 名称、title、disabled、
  aria-pressed/expanded 和测试 ID。图标仍使用现有语义尺寸等级。
- 普通 idle action 没有短横线。忙碌时显示 md LoaderCircle 和轻微透明度脉冲，
  保留 aria-busy、禁用与附近结果/错误；减少动态效果偏好下不播放动画。
- 已选中的时间/批量动作及展开的 Add 有 inset 边框和轻量底色。
  复核发现 sidebar query 样式会覆盖低优先级背景，已通过按钮状态选择器解决，
  不扩大 CSS 为全局状态规则。
- 图标绘制和 30/36/42 控件尺寸沿共享尺寸变量，普通内容仍使用 flex 流。
  标准键盘描边有真实浏览器证据，不用 lamp 装饰冒充焦点。
- LumenSidebarAction 的选中标记、全局连接状态、共享 composer Send/Stop、
  项目标题等其他动作家族保持原样。本单元不宣称所有装饰或整个迁移已完成。

## 实际验证

- 行为红测：旧生产构建 `artifacts/decision-continuity-v35/web/` 上，
  隐藏侧栏 action 的 lamp 子元素数为 1，预期 0，因此失败；
  记录在 `artifacts/plain-actions-v36/red-results/`。
  最初 class-count 断言只证明组件尚不存在，随后改成上述可见入口的 DOM 行为断言。
- 最终 Web build 成功，3393 modules；
  `artifacts/plain-actions-v36/web/assets/index-lDlRu6B8.js` /
  `index-CKoEgaTH.css`。保留已有大 chunk 警告。
- 单元与 SSR/入口回归 **9 tests / 111 assertions** 通过，覆盖中英文宿主名称、
  长名称、disabled/pressed/busy、原生 form props、Add disclosure 与原搜索/快捷键/命令菜单。
  Bun 输出已有 tsconfig override directory-mismatch 诊断，进程退出 0、测试确实执行；
  不将诊断说成已修复。
- 真实临时 Host 核心流程 **1/1，通过 6.4 秒**：中文宽屏批量开关和焦点描边、
  开关侧栏保留草稿、同一路径变窄后 Add 的 Enter/Escape 与原位 focus、无页面横向溢出，
  最后向原 Session 提交且 Host 回读唯一对应 Run。pageerror 为空。
  未扩展按钮 × 尺寸矩阵。
- 主 agent 查看旧截图、最终宽屏键盘焦点与 320px Add 焦点截图。
  后两者在 `artifacts/plain-actions-v36/final-results/` 唯一测试目录中：
  `plain-actions-desktop-keyboard.png`、`plain-actions-narrow-add-focus.png`。
- 改动范围严格 TypeScript、类型感知 ESLint 零警告、内容/图标/flow guard、
  Prettier 和 diff 检查通过。首次 CSS guard 拒绝图标 rotation 的 transform，
  已改为不移动布局的 opacity 动画并通过最终 guard。

只用独占 localhost preview、临时 Host 和 local-fixture，没有商业请求、真实配置变更、
依赖安装或原生构建/启动。Host/browser/preview 随测试结束清理；
Vite ECONNRESET 出现在临时 Host 关闭阶段。
未运行全仓门禁、原生 smoke、发布、push 或 merge。
