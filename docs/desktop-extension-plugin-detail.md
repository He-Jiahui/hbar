# Desktop 插件详情交互证据与边界

## 参考入口

参考仓库 `D:/Git/cc-haha` 的实际入口链是：

- `desktop/src/components/plugins/PluginList.tsx` 的插件行是一个完整按钮，调用 `fetchPluginDetail(plugin.id, cwd)`；
- `desktop/src/pages/Settings.tsx` 按 `selectedPlugin` 在插件列表和 `PluginDetail` 之间切换；
- `desktop/src/components/plugins/PluginDetail.tsx` 顶部返回按钮调用 `clearSelection`，命令贡献是只读预览，不会从详情直接执行；
- 详情以“插件摘要 → 状态与作用域 → 能力分组”的顺序自然流动，窄屏按相同阅读顺序纵向换行。

仓库没有现成的插件详情产品截图。本单元在
`artifacts/desktop-experience/plugin-detail/reference/` 使用上述原组件和原样式完成只读渲染；只有插件记录及 store 是 mock，网络请求全部拦截，未连接 cc-haha Host。中英文的 1440/320 截图仅用于确认源码的层级、入口、返回与响应式流，不作为真实插件数据证据。

## hbar 已实现闭环

hbar 扩展设置现在通过现有 Host `plugin.inspect` 读取详情：

1. 插件列表行的可访问按钮进入该插件详情；
2. 详情显示公开 `PluginInfo` 实际报告的状态、required 原因、来源、安装/运行范围、命令、provides/requires、panel 与 renderer 声明；
3. 命令只显示 ID、标题、说明与用法，不跳到泛化命令搜索，也不直接执行；
4. 详情读取失败保留原插件目标并提供就近重试；`null` 结果显示插件已不存在，不伪装成空详情；
5. 返回保留原 settings panel、pinned 目标、筛选、页码和选择，并把键盘焦点放回原插件行；
6. 插件和全局技能列表每页最多 20 项，详情内各贡献组每页最多 20 项。筛选后页码会归零，过期页码会收敛到有效范围。

异步读取以 panel 对象、插件 ID 和 generation 三者共同识别。快速从 A 切到 B、返回列表、离开设置、变更同 instance 的 settings 目标、关闭 panel 或 dispose 后，A 的晚到结果都不能覆盖当前界面。重复点击同一加载中插件复用当前请求；不同详情读取最多同时在途 8 个，且接受 `AbortSignal`。

## 真实能力边界

`PluginInfo` 当前没有“某个工具属于哪个插件”或“某个全局技能属于哪个插件”的字段；`skill.list` 也只报告全局技能 ID、路径和 scope。因此本单元：

- 不从路径、命名或插件私有对象推断工具/技能归属；
- 不把缺失的归属信息显示成 0，也不提供无行为的工具/技能详情入口；
- 继续在插件列表下方独立展示 Host 发现的全局技能；
- 不渲染 `PluginInfo.config` 或任意贡献记录的未知私有字段，避免泄露凭据和内部对象；
- 不实现市场、安装/卸载、`skill.inspect`，也不声称声明的 panel/renderer 已被当前客户端加载。

如未来公开契约提供稳定的 plugin ownership 字段，应单独扩展 Host producer、schema、Client、runtime 与真实 E2E；不能仅在前端补推断。

## 验证证据

- Bun 聚焦回归：20 项通过（另含设计边界 3 项），覆盖失败/重试、missing/mismatch、重复 ID、A/B 乱序、返回/离开/关闭/dispose、8 个在途读取上限、0/1/5/20/21 与 10,000 个全局技能边界、中英文长文案与敏感配置不渲染；
- 真实 Host E2E：中英文 2 项通过；临时安装带 21 条命令和 panel/renderer 声明的测试插件，经真实 `plugin.inspect` 展示并分页；首个读取响应注入失败后仅重试一次；1440 和 320 宽度无页面横向溢出，键盘进入/返回焦点闭环；
- 生产 Web build 通过；内容契约、语义图标尺寸和 flow-layout 三个守卫通过；
- 真实 E2E 截图位于 `artifacts/desktop-experience/plugin-detail/host-results/`，测试数据根目录在结束时删除，未修改用户插件或配置。
