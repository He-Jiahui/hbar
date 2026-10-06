# 应用内子窗口尺寸

应用内对话框统一使用 `@lumen/app-ui` 的 `LumenDialog`，通过类型化 `size` 属性选择尺寸。比例同时作用于 hbar 可用窗口区域的宽度和高度，不包含系统标题栏。

| size             | 宽、高比例 | 1600×1000 可用窗口中的尺寸 |
| ---------------- | ---------- | -------------------------- |
| `large`          | 80%        | 1280×800                   |
| `medium`（默认） | 60%        | 960×600                    |
| `small`          | 40%        | 640×400                    |

可用窗口宽度不超过 `60rem`，或高度不超过 `40rem` 时，三档都自动占满可用区域。默认 16px 基准下对应 960×640 CSS 像素；判断同时覆盖窄窗口和较矮的桌面窗口。恢复较大窗口后自动返回所选比例，不重新挂载内容，也不重置草稿。

图片和图表预览、较大的搜索/工作流采用 `large`；供应商编辑及常规选择窗口采用 `medium`；删除、丢弃草稿、关闭标签确认及名称编辑采用 `small`。新增入口通过 `size` 声明，不再自行设置弹窗宽度、高度或定位。

共享浮层负责 body portal、原生 popover 顶层、遮罩、焦点和关闭生命周期。遮罩容器占满可用窗口；内部保持 flex 流，顶部和底部操作不收缩，中间内容使用剩余空间并滚动。标题、字段和按钮不使用坐标布局。

结构参考：[ReactBits App Dialog 1](https://pro.reactbits.dev/docs/app-ui/app-dialog/app-dialog-1)，沿用标题／滚动主体／底部操作关系；交互参考：[Command Menu 1](https://pro.reactbits.dev/docs/app-ui/command-menu/command-menu-1)，保留键盘和焦点语义。尺寸比例及紧凑模式来自本项目需求。

回归测试在 `e2e/dialog-sizing.spec.ts` 中覆盖中英文、三档比例、宽度与高度临界值、缩小／恢复、草稿保留、主体滚动、底部可见以及 Escape 和焦点恢复。测试数据由独立 fixture 提供；实际供应商目录通过隔离 Host 的 `e2e/provider-preset-layout.spec.ts` 验证。
