# Skills 只读详情与原列表返回

## 参考与范围

参考版本为只读 `D:/Git/cc-haha` 的 `e28d0a65`。主 agent 查看了既有原组件实渲
`artifacts/desktop-entry-matrix/extensions/reference-skill-overview-zh-CN-1440.png`
及 `reference-skill-files-zh-CN-1440.png`；原 `SkillList`、`SkillDetail` 与
`SkillDetailView` 证明入口为整行按钮，详情内返回，Overview／Files 属于同一详情页。
这些使用参考原组件、原主题和合成本地记录，不是 CC 原生 Host 验收。

本子功能补齐 hbar 已发现技能的阅读入口，不涉及技能安装、执行、卸载、市场或 MCP。
原有 `skill.list` 只报告 ID、目录与 global 范围，目录存在不能当作正文已读取。
新查询必须返回真实正文和相对文件记录，再由 UI 展示，不从技能名称猜测能力。

## 核心连续路径

Skills 列表第二页 → 原行键盘进入 → 概览入口正文 → Files 的参考文件与分页 →
Plugins／Skills 往返 → 原详情 → 返回原筛选、页码及行焦点 → 返回未发送会话草稿。

详情 Back 与 Settings Back 是不同动作：前者只清除当前技能详情，后者离开设置。
技能和插件分别拥有选择与详情，不复用插件的 `detail.pluginId`。迟到读取不能覆盖
另一个技能、已返回的列表或已离开的 Settings；失败恢复仍绑定原 ID／文件。

布局复用 hbar 的 Lumen 控件和 Settings 滚动所有者；返回、摘要、概览／文件顺序与
参考一致。文件索引分页，普通内容用 flex 流增长和换行，不编码截图坐标或固定高度。
已发现但没有入口文件的目录、读取失败、文件消失与截断都必须如实表达，不显示假
成功，也不增加无行为按钮。

## 验证记录

实施前在当前真实隔离 Host 与生产资源 `index-JzGFfRne.js` 上运行英文主链。
列表第二页可用，但公开 `skill.inspect` 返回 `Command definition not found`；
列表画面也只有技能 ID／路径／Discovered，没有阅读入口。主 agent 亲看了这张
`artifacts/skill-detail-core/baseline/list-en-US.png`，红测与原组件参考分别保留。

### 已实现的公开读取契约

Host 的 `skill.list`、`skill.inspect { id }` 和 `skill.file.read { id, path }` 共用
`layout.skills/global` discovery。详情只返回已发现目录的 ID、路径、global 范围、
`SKILL.md` 中可解析的 name／description、真实正文及相对文件清单；不返回任意
frontmatter 私有对象，不伪造版本、安装或执行能力。畸形 YAML 保留原始正文。
空目录明确报告没有入口，缺失技能／文本文件返回 null，越界／非文本等返回类型化
错误，页面提供绑定原对象的恢复入口。

清单最多 200 项，UI 每页 20 项；每个技能最多扫描 2,000 个目录项、递归深度 8，
全局 discovery 上限 10,000 项。单次正文最多读取 256 KiB，超限明确报告截断，
UTF-8 边界不显示残缺字符。Host 和 runtime 各自限制 8 个物理在途读取；逻辑取消
不会提前释放仍未结算的传输槽。列表、详情和文件读取都接入 AbortSignal。
隐藏项、node_modules、符号链接／junction、穿越、绝对路径、ADS 风格冒号与控制
字符不进入可读文件范围；文件清单授权在读取之前校验。canonical path、lstat 与
打开后的文件句柄身份复核是有界只读防护，不是完整操作系统文件或网络沙盒声明。

### 最终实际执行（2026-10-02）

- 新功能与相邻导航／插件回归组合：84 tests／412 assertions 通过。最后修改后的
  详情 runtime／view、Host 公开 SDK、容量／路径安全和原插件动作组合重跑：
  43 tests／275 assertions 通过；两次不是 127 个独立用例。Bun 仍有已知
  `directory mismatch` 内部诊断，测试终端均为 exit 0，没有隐藏该输出。
- 根严格 `bun run typecheck` 通过。全仓 `bun run lint` 与最后变更的类型感知
  scoped ESLint 通过。新／修改组件通过 content、icon 和 flow guard，作用域
  Prettier 与 diff 检查通过；`server.ts` 的已提交基线本身不符合全文件 Prettier，
  本子功能只保留装配差异，没有夹带全文件格式化或宣称全仓格式检查通过。
- 最终生产 Web build 3548 modules，通过；资产为 `index-C7t828-W.js`／
  `index-rkBjYGMl.css`。既有大 chunk 警告仍在，没有提高阈值。
- 最终生产资产上的真实隔离 Host 完整路径：英文 1440 与中文 390 两条，
  2／2 通过，10.4 秒。测试先通过 public SDK 核对技能，再从实际 Settings 入口
  操作、读取分页后的文件、跨分类回来、回到原列表焦点和未发送草稿；readonly
  命令审计未发生 Run 或配置写入。cleanup 附件确认两个拥有的 fixture 均删除。
  主 agent 查看了最终英文概览和中文 Files 画面；选中标签采用 Lumen selected
  paint，而不是与共享控件竞争的另一套底线样式。
- 使用 MSVC 环境离线构建 standalone Host／Web 资源，复用已有调试桌面 exe；
  没有安装或重启用户现用版本。维护的 native smoke 在新的
  `artifacts/desktop-native-acceptance/run-20261002-16` 完整运行，终端 exit 0。
  原有模型／high、Goal + Plan、同 Run 审批、草稿、插件重载后的 Files 搜索及
  窗口／Host 生命周期路径仍通过，并新增 Skills 真正文和参考文件读取、返回
  原筛选／行焦点／会话草稿。主 agent 亲看该运行
  `artifacts/ui-redesign/tauri/skill-overview-min-window.png` 与
  `skill-files-min-window.png`，900×600 窗口内容按 Settings 所属滚动区自然增长。
  脚本 finally 的精确归属清理完成，临时 profile／项目删除，拥有的 exe 已退出。

最终截图及红／绿测试记录保留在 ignored `artifacts/skill-detail-core` 和原生运行
目录，不进入 Git。此子功能只关闭 Skills 阅读入口，不是完整 CC 功能同等实现，
没有新增安装、调用、MCP、PTY 或内嵌 Browser；总体 Goal 仍 active。
