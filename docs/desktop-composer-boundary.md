# Composer 边界：减轻输入区的装饰权重

参考 `D:/Git/cc-haha/docs/images/app/en/session-main.webp` 中的会话输入区：它与正文以轻边框区分，没有两条高对比度横梁。hbar 原共享 `LumenPromptComposer` 固定使用 `LumenSurface boundary="horizontal"`；上下 `data-edge` 装饰层虽不接收指针事件，却在桌面及窄窗口持续占据很强的视觉权重。

共享组件现提供可选 `boundary`，默认仍为 `horizontal`，以免改变其他使用方。hbar 会话工作台明确传入 `none`；输入区自身以语义边线呈现，聚焦时加深轮廓，强制对比色模式使用 `CanvasText`。只移除装饰，不改变输入、附件、模型、发送和停止的所有权或布局。

`tests/session-workspace.test.tsx` 验证工作台明确选择 `none` 且输出中无上下装饰节点。`e2e/composer-boundary.spec.ts` 使用临时真实 Host 验证中英文、1440px 浅色、390px 深色、320px 强制对比色、聚焦轮廓、无整页横向溢出及发送真正抵达原会话。忽略目录 `artifacts/desktop-experience/composer-boundary-{locale}-{light-1440,dark-390,contrast-320}.png` 为该测试的界面截图。参考图只支持视觉取向；它不是 hbar 交互或后端能力的证据。
