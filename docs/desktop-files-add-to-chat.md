# Files 当前路径加入原会话

cc-haha 已发布的 `docs/images/app/en/workspace-diff.webp` 在展开的 Files/diff 文件标题行显示 `Add to chat`；源码 `desktop/src/components/workspace/WorkspacePanel.tsx` 的 `addWorkspacePathToChat` 把当前路径加入原 `sessionId` 的引用状态，本动作本身不关闭工作台或强制导航。该画面只证明按钮位置和布局，不证明 hbar 的 Host 写入语义。

`37ce66e` 在 hbar 当前文本文件和真实 Git diff 的操作行加入宿主本地化按钮。运行时捕获 Files 面板、工作区、当前路径、原会话页签实例、工作台页签实例及草稿 revision；先通过真实 Host `session.get` 核对原会话仍存在且未归档，再复核上述目标没有在等待中改变，使用 `draft.setContent` 的 revision CAS 一次性追加结构化 `@` mention。显示用的文件名只是标签，真正引用保存工作区相对路径；普通 Run 序列化成 `@"relative/path"`，不是把可见 `@文件名` 当完整文件身份。已有同一路径引用不会重复添加。

成功或已引用的反馈留在文件操作附近，Files 保持打开，由用户自行返回原会话。原会话之外的草稿、附件和其他 mention 不被重建或清除。当前文件有未保存、写入中或结果未知的编辑时，入口阻止把旧磁盘版本当作当前内容；离线、原会话/页签失效、路径切换或草稿 revision 冲突均保留原内容并就近反馈。未知结果不宣称确定未写入，也不自动重放整份旧草稿。本单元不支持选区或行范围评论，不自动读取文件正文，也不把 Files 改成聊天附件。

验证：30 项聚焦 Bun 测试、168 次断言通过；真实临时 Host 的中英文 E2E 2/2 覆盖 A/B 两会话草稿隔离、普通文件与 Changed diff、重复去重、脏稿阻挡/明确丢弃后恢复、回原会话发送后的两个准确路径；另有既有 `@` 和 Files 工作台回归 2/2。隔离生产 Web 构建、根 TypeScript、定向严格 ESLint、内容/图标/flow guard 与 Prettier 通过。1440/320 及窄屏 diff 截图在忽略目录 `artifacts/reference-ux-v2/files-add-chat-*`，是 hbar 真实 Host 结果。Windows x64 release 应用与 NSIS 安装包随后构建成功，隔离原生 smoke 覆盖主 WebView、文件面板布局及 Host 生命周期，但**没有专门点击本按钮**，不能取代真实 Host E2E。

本单元之后的第一次全仓 `bun run check` 通过原生查询构建、严格 lint、TypeScript 与 1,505 项测试，唯一失败是 `migration-inventory` 未登记新增的 client command；这是 `37ce66e` 的交付清单遗漏，产品交互与架构边界测试没有失败。`6828374` 只补登记 `fileWorkspace.addToComposer`，没有放宽 exact-once 断言，定向 8 项测试/146 次断言通过。修复后全仓 `bun run check` 复跑全绿：原生查询构建、严格 ESLint、TypeScript、**1,506 tests / 11,266 assertions**（301 个测试文件，测试阶段 212.05s）。
