# Desktop 元素与 Lumen 语义迁移

本记录对应全量 Desktop 元素分类与迁移。工作台、会话、设置、工具和全局页面直接使用 Lumen 的内容、控件与容器 API；平台标题、托盘和通知由宿主提供文案。完整验收还包括元素清单、Schema 展示适配、原生文案同步、浏览器矩阵与临时原生验收。

## 依赖基线

- hbar 起点：`40eddc9ed53259b640eb7dddf76213fe35160a36`，原 Lumen 指针为 `5d3616757cdf14b74f9005efbed48e02fc6bff39`。
- 最新上游 `master`：`92e6f6cf213bd701adea70c365983dfb7579b48b`，通过直接 Git 查询确认。
- 本轮固定的 Lumen：`a958a3ffaae79fbfeccb1181cdfd963ae224c6f8`。该合并同时包含最新上游与本地语义内容、受控 slots、主题及单行阅读能力；包版本仍为 `0.12.0`，接入仍为 `workspace:*`。
- 干净安装暴露 Web 未声明的 `@hbar/commands` 和根测试未声明的 workspace 消费者。补齐公开依赖以及 Lumen 构建所需的 Node 声明后更新 Bun 锁文件，冻结安装通过。
- 附件兼容检查改为验证唯一的可访问删除名称及重复项消除；质量入口检查保留按序执行的 lint、类型、主题和测试门禁。

## 已运行的升级验证

- 24 个公开入口、受控 slot、内容和表单绑定测试通过；相关文件严格 ESLint 通过。
- 隔离工作树 `bun run build` 通过，保留既有大 chunk 提示。
- 同一 `a958a3ff` 源码在已安装依赖的 Lumen checkout 上执行 pnpm 包构建，类型、Vite 库产物与声明生成均通过。pnpm 使用仓库指定的 `12.3.4`。
- 全库 `bun run typecheck` 实际失败，语义迁移前观察到 96 项诊断，涉及已退役 Web 入口、主题契约、CLI 插件信息和存储等路径。这些失败仍需处理，不能将范围检查写成全库通过。
- 隔离 Lumen 的完整 pnpm 安装使用临时 Node `22.23.2`。13 个旧镜像 tarball 曾遇到证书过期；通过 npm 官方源填充 pnpm 内容缓存后，原锁文件的冻结安装通过。

## 共享语义能力

Lumen 已补齐章节、集合、消息作者、时间、指标、空态、路径、快捷键、定义项和行内强调角色。标题的 `level` 只调整文档层级，其他角色的类型不允许该属性；`metadata.time` 保留机器可读的 `dateTime`。UI 公开入口同时导出语义文字与 flow 容器。图标公开 API 对齐既有 `xs/sm/md/lg/xl` token，命中范围仍由控件负责。

- 17 个相关内容、公开角色、原文保留与表单绑定测试通过，严格范围 lint 通过。
- 独立 pnpm 库构建、TypeScript 和声明生成通过；按 Lumen 名称限定的 PropTypes / API 文档生成通过，该上游生成器只覆盖 MUI 项目，因此 Lumen 接口另记在包 README 与类型声明中。
- `bun scripts/verify-desktop-semantic-roles.ts` 使用 Vite 构建真实 client fixture，验证 20 个中英文／明暗／1440、1100、900、390、320 宽度场景，窄屏 125% 文字放大；包含完整标题、路径滚动、辅助说明换行、连续句、time、原始代码、键盘焦点、文本对比度和无页面横向溢出。截图与结果放在 `artifacts/desktop-elements/roles`。
- `bun scripts/verify-lumen-icon-scale.ts` 在独立库 CSS 下核对五档公开图标与兼容图标，明暗／16、20px 根字号的几何结果通过。以上属于共享原语验证，尚不代表业务界面已全部迁移。

## 后续验收

元素清单、Schema 展示适配、生产表面迁移、原生文案同步和最终浏览器／原生回归尚未完成。后续按独立子功能验证并立即提交，在此记录当前证据与剩余要求。
