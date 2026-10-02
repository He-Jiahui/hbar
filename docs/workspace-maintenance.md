# 工程清理与预览维护

在仓库根目录执行 `bun scripts/clean-workspace.ts` 查看清理计划。
确认计划后执行 `bun scripts/clean-workspace.ts --apply` 删除可重建的产物。
也可以用 `--workspace <Git 根目录>` 指定另一份 hbar 工作树。

清理范围由脚本中的固定列表决定：Web 与 Lumen 构建目录、Rust target、
Vite/Nx 缓存、测试输出和已知 TypeScript 增量编译文件。
脚本逐个确认绝对路径位于工作区内、没有目录链接、受 Git 忽略且没有受跟踪文件。
嵌套子模块会使用自己的 Git 忽略与跟踪记录。
实际删除前会再次检查运行中的构建进程和服务。

运行中的 Vite/Playwright 会保护缓存与测试输出；
生产预览服务会保护 Web 构建目录；
Cargo、rustc 或桌面程序会保护 Rust 构建目录。
无法确认安全时，脚本保留目录并说明原因。
源码、已安装依赖、Git 元数据、运行数据、artifacts 验证记录均不属于清理范围。

清理后按需要重新生成：

- Web：`bun run build`。
- 组件预览：`bun run app-ui:build`。
- 原生工具：`bun run native:build`。
- 桌面：`bun run desktop:build`。
- 独立 Lumen 包：在 hbar-ui 仓库使用 `pnpm -F @lumen/app-ui build`。

组件预览开发服务使用源码，可以在删除旧 dist 后继续浏览。
有未完成合并或用户改动时，代码整理在独立工作树提交，不清理或重置共享 Git 状态。
