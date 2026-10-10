# 主题与渲染系统

## 参考

- 结构参考：[React Bits Glass Surface](https://reactbits.dev/components/glass-surface) —— 玻璃表面、折射层、背景模糊和无滤镜回退。
- 交互参考：[React Bits Glass Icons](https://reactbits.dev/components/glass-icons) —— 玻璃图标按钮的前后层、hover 位移和 tooltip 层级。
- 参数参考：[liquid-glass-react](https://github.com/rdev/liquid-glass-react) —— blur、saturation、displacement、色差和 elasticity；Safari/Firefox 使用静态 CSS 回退。
- 应用布局参考：[ReactBits Application UI](https://pro.reactbits.dev/docs/app-ui/app-shell) —— 工作台外壳、设置页和编辑器的区域层级；业务数据仍由 hbar contracts 提供。

## 实现边界

`ThemeProfile` 是唯一持久化主题模型。Web 组件只能消费 `theme-store.ts` 投影到 `document.documentElement` 的语义变量。当前公开 contracts 只校验主题 token 与受管 `assets/` 路径的形状；插件 renderer 的注册契约仍由 `@hbar/ui-sdk` 提供，但宿主的 renderer 选择、诊断和插件资产归属运行时尚未迁移到新的 Web 组合根，因此不能把 schema 校验描述成运行时权限覆盖。主题贡献不能注入任意 CSS、远程图片或脚本。

Markdown、CodeMirror、Patch 和 Git Diff 都有内置 renderer。Git Diff 默认使用 CodeMirror Merge 的 before/after 视图；不能解析的 unified diff 回退到安全的逐行内置渲染。插件 renderer 的优先级选择与诊断属于尚未迁移的能力，当前生产 Web 组合根不承诺插件停用、冲突或异常时的动态选择回退。

所有菜单、popover、tooltip、context menu 和 modal 都通过 `FloatingSurface`，由共享层负责 portal、最高层级、模糊、Escape、外部 pointerdown 和视口边界。
