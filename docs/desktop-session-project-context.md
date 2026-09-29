# 会话工程与分支只读上下文

参考 `D:/Git/cc-haha/docs/images/app/en/session-new.webp` 和 `workspace-changes.webp`：参考桌面的 composer 靠近发送控件展示工程/分支。其 `ProjectContextChip.tsx` 是只读展示；首次发送前的 `RepositoryLaunchControls.tsx` 才负责切换启动目录、分支或工作树。hbar 不把这些启动前动作伪装成已绑定会话的可编辑能力。

本单元从当前会话的 `session.workspaceId` 定位工程，通过 `SessionLaunchTargetReader` 获取该会话当前 Host revision，再调用 `sessionGit.info` 读取其执行目标；不传客户端 cwd，不调用 `git.branch` 或 `git.worktree`。已绑定的隔离会话显示自己的分支，但工程名仍来自原工作区。缺少 reader、错会话／工作区响应、非法 revision 或未绑定隔离目标时明确失败，不回落到注册工程的 `git.info`。已确认分支时显示“工程 / 分支”；Git 返回空分支时只显示工程，不推断是非仓库、detached HEAD 还是其他没有可展示分支的情况。查询失败、超时或断线会隐藏旧分支并提供就近重试（断线时等待连接恢复）。工程名来自会话的工作区归属，不从 Git 的仓库名、remote URL 或当前全局导航猜测。

参考宽屏把只读位置放在 composer 工具行，紧凑布局放在输入框下方。hbar 现在依据 composer 可用宽度（不是截图坐标或单纯视口宽度）在这两处切换：真实 Host 的 1440/900px 页面，footer 均为 832px，工程/分支与权限、Goal、Plan、模型、发送同处一行；390/320px 时移至输入框下方的正常流。仅一个 React hook 订阅/定时查询，两个纯展示容器由 CSS `display:none` 互斥，隐藏者不在可访问树或 Tab 顺序；失败时错误与重试在下方保留可读空间。工具行中的长工程/分支收缩，分支保留尾部，完整内容保留在 `title` 和可访问名称中；没有固定坐标或假按钮。共享 `LumenPromptComposer` 的上下横向装饰线是组件自身 `boundary="horizontal"` 的 beam，并非这项上下文的滚动条；本单元未修改共享组件或用局部 CSS 隐藏它，仍是与参考审美不同的已知点。

客户端只投影当前会话；导航或工程路径改变立即失效，结果按捕获的会话、工程、路径与代际提交。即使两个会话属于同一个工作区，也不共享待处理的 target／branch 结果。断线立即清理；重新连接、窗口重新获得焦点、运行终态和当前可见视图的 60 秒单飞计时触发读取。每轮失效后重新获取 Host revision，不猜测零版本。加入单飞读取的观察者可单独取消等待，不取消 owner；底层不支持远程 query-cancel，不能宣称它已停止 Host Git 工作。读取 owner 先登记再调用 port，避免同步抛错把失败 Promise 留在槽里而无法重试；该问题依据 `6fbfcee` 的既有登记顺序核对，并以失败／修复后通过的定向回归复现。晚到的旧 Host 响应不会污染新目标。`sessionGit.info` 虽然网络结果小，Host 内部仍查询 Git status，因此不随每次按键或渲染刷新。

验证：`tests/session-git-context.test.ts` 当前 14 tests／56 assertions，覆盖 Host revision、空分支、同项目及跨项目的晚到响应、工程路径更新、单飞、同步失败重试、owner／observer 取消、断线、缺失 reader、错误归属及未绑定目标不 fallback。`tests/session-project-context-react.test.tsx` 的既有验证覆盖目标绑定及中英错误／断线内容；本次没有把该历史结果当作新切片已重跑的结果。

`e2e/session-project-context.spec.ts` 在临时目录内建立 A/B 两个真实 Git 工程，通过真实 Host 读取 A/B 当前分支、外部 checkout、焦点刷新、返回 A、再一次外部 checkout 后发送并完成真实 Run、断线清理，并在两种语言的 1440/900/390/320 四宽截图检查可访问树只有一个工程组、宽屏与权限同一行、窄屏下置、分支占可见宽度、权限／模型／发送可达和整页不溢出；1440/320 还实际打开与关闭权限、模型菜单。新增 `e2e/session-target-git-context.spec.ts` 通过公开 API 和 local-fixture 模型首发绑定一个隔离会话，浏览器核对隔离分支、原工程名、同项目共享兄弟会话的分支，以及返回隔离会话和 320px 布局。它不验证尚未接入的 Location selector，也不等于 native smoke；执行结果在下方单独记录。

截图在隔离 checkout 的忽略目录 `artifacts/session-project-context/`。真实 Host E2E 没有注入确定性的慢响应；这一竞争由 runtime 行为测试覆盖。构建产物使用隔离 checkout 的忽略目录，不覆盖主工作区的产物。

2026-09-29 当前切片验证：14 个 runtime tests／56 assertions、scoped ESLint 零警告、explicit strict TypeScript 和生产 Web build 通过；最后独立浏览器轮为 **3 tests 通过，20.2s**，包含中英文四宽度和真实绑定隔离兄弟会话。人工查看了新增的 1440px／320px 截图，核对原工程名、隔离分支尾部、窄屏正常流和无横向溢出。初轮为 2 pass／1 fail：新夹具把 Host worktree storage 放进源 repository，被正确拒绝；随后改为单独注册的子 repository，Host data 仍在其外部，未放宽产品路径限制。刻意关闭 Host 时 preview proxy 的 `ECONNRESET` 是夹具断线／清理日志，浏览器 pageerror 数组为空。

这不是全仓 typecheck／lint 或 native desktop smoke 的通过记录，也不是 Location selector 已交付的声明。隔离分支还有其他正在验证的 Files／Git DTO 切片，未混入本子功能提交；主工作区的其他任务改动保持原样。
